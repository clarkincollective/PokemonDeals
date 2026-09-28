// BOARD DEALS (2026-09-27) - listings the public deal board publishes, shown
// on the site's own surface with the board's PUBLISHED discount figure.
//
// THE CONTRACT, as the owner set it:
//   * the card, the listing details and the board's captured discount are
//     shown; the eBay button carries OUR EPN affiliate link;
//   * the board's name, branding, logo, attribution and links are never
//     rendered anywhere - the source URL, the captured percentage and the
//     capture time are kept INSIDE the record for auditing only;
//   * no reference price is invented and the imported figure is never
//     labelled independently verified - it is kept on this surface, apart
//     from the site's own evidenced savings (lib/dealQuality), and never
//     written into `deals`;
//   * (27 Sep, owner's second decision: "pushing new deals every 30 mins")
//     a FRESH row - found by the board within UNVERIFIED_FRESH_HOURS of its
//     own found-at time - is shown at once as `unverified`, on the plain
//     listing URL wrapped with our campaign, whether or not eBay quota is
//     available; OUR eBay lookup (the same get_item_by_legacy_id call the
//     discovery path makes, inside its own budgeted lane) then confirms it
//     as `published` when live at the captured price, or unpublishes it on
//     a changed price / ended listing. A row older than the fresh window is
//     shown only once verified. Every row is unpublished when the board
//     stops listing it. The trade-off is recorded: an unverified row may
//     have sold or changed price before its lookup runs.
//
// STORAGE - catalog_snapshot rows, no schema change:
//   board_deal:<MARKETPLACE>:<itemId>   one record per listing (below)
//   board_ingest:lock                   the run lock (until, owner)
//   board_ingest_runs                   the last N run summaries
//
// RECORD
//   { v, marketplace, itemId, listingId, status, title, name, set, variant,
//     format, image, listingUrl, affiliateUrl, price, currency, shipping,
//     listingType, auctionEndAt,
//     captured: { discountPct, discountText, priceText, marketPriceText,
//                 price, market, at, sourceUrl },
//     verified: { at, price, currency, priceMatch, soldOut } | null,
//     firstSeenAt, lastSeenOnBoardAt, publishedAt, unpublishedAt, reason }
//   status: pending | unverified | published | price_changed | ended |
//           rejected | lookup_failed | expired
const { formatMoney } = require("./money");
const { MARKETPLACES, wrapEbayAffiliateUrl } = require("./ebayLinks");
const dealMatching = require("./dealMatching");

const BOARD_DEAL_KIND_PREFIX = "board_deal:";
const BOARD_LOCK_KIND = "board_ingest:lock";
const BOARD_RUNS_KIND = "board_ingest_runs";
const BOARD_RUN_HISTORY = 144; // ~3 days of half-hourly runs
const BOARD_DEALS_TAG = "board-deals";
const PUBLISH_MAX_AGE_HOURS = 24; // a published record older than this without a fresh lookup is not shown
// 27 Sep, owner's decision "B" (second board, all listings): both boards are
// 24-hour windows and the second states "added N hours ago" only, so the
// unverified display window is the boards' own window.
const UNVERIFIED_FRESH_HOURS = 24; // an UNVERIFIED row is shown only this long after the board's own found-at
const BOARD_ABSENCE_HOURS = 12; // off the board this long -> expired
const PRICE_TOLERANCE_PCT = 0.005; // 0.5% or one cent, whichever is larger
const REF_UPSERT_CHUNK = 200;

const boardDealKind = (marketplace, itemId) => `${BOARD_DEAL_KIND_PREFIX}${marketplace}:${String(itemId)}`;

const isoOrNull = (v) => {
  const t = Date.parse(v ?? "");
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
};

// The captured listing price equals eBay's current price. Both in the
// listing's own currency (the board states its `dp` in the market's
// currency; eBay's price.value is in the marketplace currency).
function priceMatches(capturedPrice, verifiedPrice, { tolerancePct = PRICE_TOLERANCE_PCT } = {}) {
  const a = Number(capturedPrice);
  const b = Number(verifiedPrice);
  if (!(a > 0) || !(b > 0)) return false;
  return Math.abs(a - b) <= Math.max(0.01, a * tolerancePct);
}

// What the board row gives us to publish. Null when the row carries no
// usable discount figure (nothing to show on this surface).
function capturedFromFeedItem(it, capturedAt) {
  if (!it || it.capturedDiscountPct == null) return null;
  return {
    discountPct: it.capturedDiscountPct,
    discountText: it.capturedDiscountText ?? null,
    priceText: it.boardListingPriceText ?? null,
    marketPriceText: it.boardMarketPriceText ?? null,
    price: it.feedPrice ?? null,
    market: it.feedMarket ?? null,
    at: capturedAt,
    foundAt: it.boardFoundAt ?? null, // the board's own timestamp (JSON feed); null from the HTML fallback
    boardId: it.boardId ?? null,
    // which board (audit): "pokedealfinder" (default, the first board) or "jimmys"
    source: it.source ?? "pokedealfinder",
    // single | graded | sealed, as the board row states it (drives the trust check)
    kind: it.boardKind ?? (it.boardVariant && !/^raw$/i.test(String(it.boardVariant)) ? "graded" : "single"),
    // the second board's own figures, kept verbatim for auditing (its
    // percentage is (valuation - price) / price; discountPct above is
    // 1 - total / valuation on the same two published numbers)
    valuation: it.boardValuation ?? null,
    referenceNm: it.boardReferenceNm ?? null,
    valuationBasis: it.boardValuationBasis ?? null,
    priceDifferencePct: it.boardPriceDifferencePct ?? null,
    seller: it.boardSeller ?? null,
    sourceUrl: it.sourceUrl ?? null, // audit only, never rendered
  };
}

// Fresh by the board's own found-at time. A row with no found-at (HTML
// fallback) is never treated as fresh: it waits for verification.
// SECOND BOARD (owner, 27 Sep: "all deals from every page ... updated daily"):
// its all-time lists hold rows days old, and its own presence is the
// freshness signal - a row is current while that board still lists it, so
// `lastSeenOnBoardAt` within the window counts as fresh for source "jimmys".
function isFreshCapture(captured, { now = Date.now(), freshHours = UNVERIFIED_FRESH_HOURS, lastSeenOnBoardAt = null } = {}) {
  const t = Date.parse(captured?.foundAt ?? "");
  if (Number.isFinite(t) && t <= now + 5 * 60_000 && now - t <= freshHours * 3600_000) return true;
  if (captured?.source === "jimmys") {
    const s = Date.parse(lastSeenOnBoardAt ?? "");
    return Number.isFinite(s) && now - s <= freshHours * 3600_000;
  }
  return false;
}

// The minimal trust the discovery pipeline applies to every listing,
// reused here: a proxy / counterfeit / non-card / untrustworthy listing is
// never shown on this surface either, whatever the board says about it.
// `kind`: "sealed" rows use the pipeline's sealed exclusion list instead of
// the single-card one (a booster box is not "one card we can price", but it
// is a real sealed listing).
function boardListingTrusted(listing, { kind = "single" } = {}) {
  if (!listing) return false;
  if (dealMatching.admitsProxyOrCounterfeit(listing, null)) return false;
  if (kind === "sealed") return Boolean((dealMatching.isTrustworthySealedListing ?? dealMatching.isTrustworthyListing)(listing));
  return Boolean(dealMatching.qualifiesAsTradingCard(listing)) && Boolean(dealMatching.isTrustworthyListing(listing));
}

// Decide a record's status from OUR eBay lookup of it.
//   listing: lib/ebay.js mapItemSummary shape, or null when the lookup
//   returned nothing (ended / removed / not found).
function classifyVerification({ captured, listing, trusted = true }) {
  if (!captured || captured.price == null) return { status: "rejected", reason: "no_captured_price" };
  if (!listing) return { status: "ended", reason: "lookup_returned_nothing" };
  if (listing.soldOut === true) return { status: "ended", reason: "sold_out" };
  if (!trusted) return { status: "rejected", reason: "untrusted_listing" };
  if (!(Number(listing.price) > 0)) return { status: "rejected", reason: "no_live_price" };
  if (!priceMatches(captured.price, listing.price)) return { status: "price_changed", reason: "price_differs" };
  return { status: "published", reason: null };
}

// Build / refresh the record for one board row from a completed lookup.
function buildBoardDealRecord({ feedItem, listing, captured, verdict, prev = null, now = new Date().toISOString() }) {
  const marketplace = feedItem.marketplace;
  const base = prev ?? {
    v: 1,
    marketplace,
    itemId: String(feedItem.ebayItemId),
    firstSeenAt: now,
    publishedAt: null,
    unpublishedAt: null,
  };
  const published = verdict.status === "published";
  return {
    ...base,
    listingId: listing?.listingId ?? base.listingId ?? null,
    status: verdict.status,
    reason: verdict.reason,
    title: listing?.title ?? feedItem.feedTitle ?? base.title ?? null,
    name: feedItem.boardName ?? base.name ?? null,
    set: feedItem.boardSet ?? base.set ?? null,
    variant: feedItem.boardVariant ?? base.variant ?? null,
    format: feedItem.boardFormat ?? base.format ?? null,
    image: listing?.imageUrl ?? feedItem.boardImage ?? base.image ?? null,
    listingUrl: listing?.listingUrl ?? feedItem.plainEbayUrl ?? base.listingUrl ?? null,
    // eBay's own itemAffiliateWebUrl for OUR campaign (authHeaders sets the
    // campaign id on the lookup); re-wrapped with the page placement at render
    affiliateUrl: listing?.affiliateUrl ?? base.affiliateUrl ?? null,
    price: listing?.price ?? base.price ?? null,
    currency: listing?.currency ?? MARKETPLACES[marketplace]?.currency ?? base.currency ?? null,
    shipping: listing?.shipping ?? base.shipping ?? null,
    listingType: listing?.listingType ?? base.listingType ?? null,
    auctionEndAt: listing?.auctionEndAt ?? base.auctionEndAt ?? null,
    captured: captured ?? base.captured ?? null,
    verified: listing || verdict.status === "ended"
      ? { at: now, price: listing?.price ?? null, currency: listing?.currency ?? null, priceMatch: published, soldOut: listing?.soldOut ?? null }
      : base.verified ?? null,
    lastSeenOnBoardAt: now,
    publishedAt: published ? base.publishedAt ?? now : base.publishedAt ?? null,
    unpublishedAt: published ? null : base.status === "published" || base.status === "unverified" || base.publishedAt ? base.unpublishedAt ?? now : base.unpublishedAt ?? null,
  };
}

// A fresh board row shown BEFORE its lookup: the plain listing URL wrapped
// with our campaign (re-wrapped with the page placement at render), the
// board's image and price, status `unverified`. Verified on the next run
// that has quota. `prev` may be a pending record being promoted.
function unverifiedBoardDealRecord({ feedItem, captured, prev = null, now = new Date().toISOString() }) {
  const base = pendingBoardDealRecord({ feedItem, captured, prev, now });
  const listingUrl = base.listingUrl ?? feedItem.plainEbayUrl ?? null;
  return {
    ...base,
    status: "unverified",
    reason: "fresh_board_row_awaiting_lookup",
    affiliateUrl: listingUrl ? wrapEbayAffiliateUrl(listingUrl, { page: "deals", placement: "feature" }) : null,
    price: captured?.price ?? base.price ?? null,
    currency: MARKETPLACES[feedItem.marketplace]?.currency ?? base.currency ?? null,
    listingType: /auction/i.test(String(feedItem.boardFormat ?? "")) ? "AUCTION" : "FIXED_PRICE",
    publishedAt: base.publishedAt ?? now,
    unpublishedAt: null,
  };
}

// A board row seen again while no lookup is made this run: keep the record,
// note the sighting (the board still lists it), leave status alone. When a
// SECOND board lists the same eBay item the source is added, never a second
// record (dedupe is by eBay listing id).
function touchBoardDealRecord(prev, { now = new Date().toISOString(), source = null } = {}) {
  const sources = new Set(prev.sources ?? [prev.captured?.source ?? "pokedealfinder"]);
  if (source) sources.add(source);
  return { ...prev, lastSeenOnBoardAt: now, sources: [...sources] };
}

// A discovery that could not be verified this run (no quota / over the cap)
// is queued as `pending` with everything captured, so the next run can
// verify it even if the board has moved on.
function pendingBoardDealRecord({ feedItem, captured, prev = null, now = new Date().toISOString() }) {
  if (prev) return { ...prev, captured: prev.captured ?? captured, lastSeenOnBoardAt: now };
  return {
    v: 1,
    marketplace: feedItem.marketplace,
    itemId: String(feedItem.ebayItemId),
    listingId: null,
    status: "pending",
    reason: "awaiting_lookup",
    title: feedItem.feedTitle ?? null,
    name: feedItem.boardName ?? null,
    set: feedItem.boardSet ?? null,
    variant: feedItem.boardVariant ?? null,
    format: feedItem.boardFormat ?? null,
    image: feedItem.boardImage ?? null,
    listingUrl: feedItem.plainEbayUrl ?? null,
    affiliateUrl: null,
    price: null,
    currency: MARKETPLACES[feedItem.marketplace]?.currency ?? null,
    shipping: null,
    listingType: null,
    auctionEndAt: null,
    captured,
    verified: null,
    firstSeenAt: now,
    lastSeenOnBoardAt: now,
    publishedAt: null,
    unpublishedAt: null,
  };
}

// Records not seen on the board for BOARD_ABSENCE_HOURS are expired (the
// board itself is "capped by recency"); a published one is unpublished.
function expireAbsentRecords(records, { now = Date.now(), absenceHours = BOARD_ABSENCE_HOURS } = {}) {
  const cutoff = now - absenceHours * 3600_000;
  const out = [];
  let expired = 0;
  for (const r of records) {
    const seen = Date.parse(r.lastSeenOnBoardAt ?? "");
    if (r.status !== "expired" && Number.isFinite(seen) && seen < cutoff) {
      out.push({ ...r, status: "expired", reason: "absent_from_board", unpublishedAt: r.publishedAt && !r.unpublishedAt ? new Date(now).toISOString() : r.unpublishedAt ?? null });
      expired++;
    } else out.push(r);
  }
  return { records: out, expired };
}

// The records that may be shown: `published` (verified recently, still on
// the board) and `unverified` (fresh by the board's found-at, still on the
// board, not yet looked up).
function publishableBoardDeals(records, { now = Date.now(), maxAgeHours = PUBLISH_MAX_AGE_HOURS, absenceHours = BOARD_ABSENCE_HOURS, freshHours = UNVERIFIED_FRESH_HOURS } = {}) {
  const ageCutoff = now - maxAgeHours * 3600_000;
  const seenCutoff = now - absenceHours * 3600_000;
  return (records ?? []).filter((r) => {
    if (!r || !r.affiliateUrl || !(r.price > 0) || !(r.captured?.discountPct > 0)) return false;
    const s = Date.parse(r.lastSeenOnBoardAt ?? "");
    if (!Number.isFinite(s) || s < seenCutoff) return false;
    if (r.status === "published") {
      const v = Date.parse(r.verified?.at ?? "");
      return Number.isFinite(v) && v >= ageCutoff;
    }
    if (r.status === "unverified") return isFreshCapture(r.captured, { now, freshHours, lastSeenOnBoardAt: r.lastSeenOnBoardAt });
    return false;
  });
}

// What the page gets. NOTHING that names or links the source: no sourceUrl,
// no board market label, no captured text beyond the percentage itself.
function toRenderShape(r) {
  const mk = MARKETPLACES[r.marketplace] ?? {};
  return {
    id: `${r.marketplace}:${r.itemId}`,
    marketplace: r.marketplace,
    marketplaceShort: mk.short ?? null,
    marketplaceFlag: mk.flag ?? null,
    title: r.title,
    name: r.name,
    set: r.set,
    variant: r.variant,
    format: r.format,
    image: r.image,
    affiliateUrl: r.affiliateUrl,
    price: r.price,
    currency: r.currency,
    priceText: r.price != null ? formatMoney(r.price, r.currency) : null,
    shipping: r.shipping,
    listingType: r.listingType,
    auctionEndAt: r.auctionEndAt,
    discountPct: r.captured.discountPct,
    discountPercentText: `${Math.round(r.captured.discountPct * 100)}% off`,
    // The saving as the surface states it (owner, 27 Sep: "we should be
    // showing what they're saying in the savings"): the published
    // percentage against the published market value, in the listing's
    // currency. Text only - the record keeps the source figures.
    savingsPercentText: `Save ${Math.round(r.captured.discountPct * 100)}%`,
    marketValueText: r.captured.marketPriceText ?? null,
    verifiedAt: r.verified?.at ?? null,
    verified: r.status === "published",
    foundAt: r.captured?.foundAt ?? r.firstSeenAt ?? null,
  };
}

// /more-deals filters over render shapes: market (EBAY_*), kind (graded |
// sealed | raw, read off the variant the board stated), format (bin |
// auction). Unknown values filter nothing.
// 28 Sep 2026: `maxPriceUsd` for the "under $N" category pages. It reads
// `priceUsd`, which the cached index carries (lib/boardDealsFeed converts
// the listing price with lib/fx at index time); a row without one is left
// out of a price band rather than guessed at.
function filterBoardDeals(rows, { market = null, kind = null, format = null, maxPriceUsd = null } = {}) {
  return (rows ?? []).filter((d) => {
    if (market && d.marketplace !== market) return false;
    if (maxPriceUsd != null && Number.isFinite(Number(maxPriceUsd))) {
      const p = Number(d.priceUsd);
      if (!Number.isFinite(p) || p > Number(maxPriceUsd)) return false;
    }
    const variant = String(d.variant ?? "");
    if (kind === "graded" && !(variant && !/^(raw|sealed)$/i.test(variant))) return false;
    if (kind === "sealed" && !/^sealed$/i.test(variant)) return false;
    if (kind === "raw" && !/^raw$/i.test(variant)) return false;
    if (format === "bin" && /auction/i.test(d.format ?? "")) return false;
    if (format === "auction" && !/auction/i.test(d.format ?? "")) return false;
    return true;
  });
}

// ---------------------------------------------------------------- storage
async function loadBoardDealRecords(db) {
  const out = new Map();
  try {
    for (let from = 0; ; from += 1000) {
      // ORDERED: an unordered range walk over Postgres returns overlapping
      // pages (measured 27 Sep: 3,709 of 5,324 records loaded without it).
      const { data, error } = await db.from("catalog_snapshot").select("kind, data").like("kind", `${BOARD_DEAL_KIND_PREFIX}%`).order("kind").range(from, from + 999);
      if (error || !data) break;
      for (const r of data) if (r?.data?.marketplace && r?.data?.itemId) out.set(boardDealKind(r.data.marketplace, r.data.itemId), r.data);
      if (data.length < 1000) break;
    }
  } catch {
    /* an unreadable store publishes nothing new this run */
  }
  return out;
}

async function saveBoardDealRecords(db, records) {
  const rows = records.map((data) => ({ kind: boardDealKind(data.marketplace, data.itemId), data, updated_at: new Date().toISOString() }));
  let written = 0;
  const errors = [];
  for (let i = 0; i < rows.length; i += REF_UPSERT_CHUNK) {
    const slice = rows.slice(i, i + REF_UPSERT_CHUNK);
    try {
      const { error } = await db.from("catalog_snapshot").upsert(slice, { onConflict: "kind" });
      if (error) errors.push(error.message);
      else written += slice.length;
    } catch (e) {
      errors.push(e?.message ?? String(e));
    }
  }
  return { written, errors };
}

// Deals for the page, newest board find first (the surface is a stream of
// new rows every half hour), then best captured discount.
async function fetchPublishedBoardDeals(db, { limit = 24, now = Date.now() } = {}) {
  const records = [...(await loadBoardDealRecords(db)).values()];
  const foundMs = (r) => Date.parse(r.captured?.foundAt ?? r.firstSeenAt ?? "") || 0;
  return publishableBoardDeals(records, { now })
    .sort((a, b) => foundMs(b) - foundMs(a) || b.captured.discountPct - a.captured.discountPct)
    .slice(0, limit)
    .map(toRenderShape);
}

// ---------------------------------------------------------------- run lock
// One run at a time. The lock row is INSERTed (primary key = kind): a
// second concurrent run hits the unique violation and stops, unless the
// lock is past its `until` (a crashed run), in which case it is taken over.
async function acquireRunLock(db, { ttlMs = 6 * 60_000, owner = null, now = Date.now() } = {}) {
  const until = new Date(now + ttlMs).toISOString();
  const row = { kind: BOARD_LOCK_KIND, data: { until, owner, since: new Date(now).toISOString() }, updated_at: new Date(now).toISOString() };
  try {
    const { error } = await db.from("catalog_snapshot").insert(row);
    if (!error) return { acquired: true, until, takenOver: false };
    const { data } = await db.from("catalog_snapshot").select("data").eq("kind", BOARD_LOCK_KIND).maybeSingle();
    const heldUntil = Date.parse(data?.data?.until ?? "");
    if (Number.isFinite(heldUntil) && heldUntil > now) return { acquired: false, heldUntil: new Date(heldUntil).toISOString(), heldBy: data?.data?.owner ?? null };
    const { error: takeErr } = await db.from("catalog_snapshot").upsert(row, { onConflict: "kind" });
    if (takeErr) return { acquired: false, error: takeErr.message };
    return { acquired: true, until, takenOver: true };
  } catch (e) {
    return { acquired: false, error: e?.message ?? String(e) };
  }
}

async function releaseRunLock(db) {
  try {
    await db.from("catalog_snapshot").delete().eq("kind", BOARD_LOCK_KIND);
  } catch {
    /* an expired lock is taken over by the next run anyway */
  }
}

async function recordBoardRun(db, entry) {
  try {
    const { data } = await db.from("catalog_snapshot").select("data").eq("kind", BOARD_RUNS_KIND).maybeSingle();
    const prev = Array.isArray(data?.data) ? data.data : [];
    const next = [...prev.slice(-(BOARD_RUN_HISTORY - 1)), entry];
    await db.from("catalog_snapshot").upsert({ kind: BOARD_RUNS_KIND, data: next, updated_at: new Date().toISOString() }, { onConflict: "kind" });
  } catch {
    /* observability must never break the run */
  }
}

module.exports = {
  BOARD_DEAL_KIND_PREFIX,
  BOARD_LOCK_KIND,
  BOARD_RUNS_KIND,
  BOARD_DEALS_TAG,
  PUBLISH_MAX_AGE_HOURS,
  BOARD_ABSENCE_HOURS,
  UNVERIFIED_FRESH_HOURS,
  isFreshCapture,
  unverifiedBoardDealRecord,
  boardDealKind,
  priceMatches,
  boardListingTrusted,
  capturedFromFeedItem,
  classifyVerification,
  buildBoardDealRecord,
  touchBoardDealRecord,
  pendingBoardDealRecord,
  expireAbsentRecords,
  publishableBoardDeals,
  toRenderShape,
  filterBoardDeals,
  loadBoardDealRecords,
  saveBoardDealRecords,
  fetchPublishedBoardDeals,
  acquireRunLock,
  releaseRunLock,
  recordBoardRun,
};
