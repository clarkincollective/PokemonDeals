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
//   * a listing is published only after OUR eBay lookup (the same
//     get_item_by_legacy_id call the discovery path already makes, inside
//     its own budgeted lane) confirms it is live and its price still matches
//     the captured one; it is unpublished when a later lookup shows a
//     changed price or an ended listing, or when the board stops listing it.
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
//   status: pending | published | price_changed | ended | rejected |
//           lookup_failed | expired
const { formatMoney } = require("./money");
const { MARKETPLACES } = require("./ebayLinks");
const dealMatching = require("./dealMatching");

const BOARD_DEAL_KIND_PREFIX = "board_deal:";
const BOARD_LOCK_KIND = "board_ingest:lock";
const BOARD_RUNS_KIND = "board_ingest_runs";
const BOARD_RUN_HISTORY = 144; // ~3 days of half-hourly runs
const BOARD_DEALS_TAG = "board-deals";
const PUBLISH_MAX_AGE_HOURS = 24; // a published record older than this without a fresh lookup is not shown
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
    sourceUrl: it.sourceUrl ?? null, // audit only, never rendered
  };
}

// The minimal trust the discovery pipeline applies to every listing,
// reused here: a proxy / counterfeit / non-card / untrustworthy listing is
// never shown on this surface either, whatever the board says about it.
function boardListingTrusted(listing) {
  if (!listing) return false;
  return Boolean(dealMatching.qualifiesAsTradingCard(listing)) && !dealMatching.admitsProxyOrCounterfeit(listing, null) && Boolean(dealMatching.isTrustworthyListing(listing));
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
    unpublishedAt: published ? null : base.status === "published" || base.publishedAt ? base.unpublishedAt ?? now : base.unpublishedAt ?? null,
  };
}

// A board row seen again while no lookup is made this run: keep the record,
// note the sighting (the board still lists it), leave status alone.
function touchBoardDealRecord(prev, { now = new Date().toISOString() } = {}) {
  return { ...prev, lastSeenOnBoardAt: now };
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

// The records that may be shown: published, verified recently, still on the board.
function publishableBoardDeals(records, { now = Date.now(), maxAgeHours = PUBLISH_MAX_AGE_HOURS, absenceHours = BOARD_ABSENCE_HOURS } = {}) {
  const ageCutoff = now - maxAgeHours * 3600_000;
  const seenCutoff = now - absenceHours * 3600_000;
  return (records ?? []).filter((r) => {
    if (r?.status !== "published") return false;
    const v = Date.parse(r.verified?.at ?? "");
    const s = Date.parse(r.lastSeenOnBoardAt ?? "");
    return Number.isFinite(v) && v >= ageCutoff && Number.isFinite(s) && s >= seenCutoff && r.affiliateUrl && r.price > 0 && r.captured?.discountPct > 0;
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
    verifiedAt: r.verified?.at ?? null,
  };
}

// ---------------------------------------------------------------- storage
async function loadBoardDealRecords(db) {
  const out = new Map();
  try {
    for (let from = 0; ; from += 1000) {
      const { data, error } = await db.from("catalog_snapshot").select("kind, data").like("kind", `${BOARD_DEAL_KIND_PREFIX}%`).range(from, from + 999);
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

// Published deals for the page, best captured discount first.
async function fetchPublishedBoardDeals(db, { limit = 24, now = Date.now() } = {}) {
  const records = [...(await loadBoardDealRecords(db)).values()];
  return publishableBoardDeals(records, { now })
    .sort((a, b) => (b.captured.discountPct - a.captured.discountPct) || (Date.parse(b.verified?.at ?? 0) - Date.parse(a.verified?.at ?? 0)))
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
  loadBoardDealRecords,
  saveBoardDealRecords,
  fetchPublishedBoardDeals,
  acquireRunLock,
  releaseRunLock,
  recordBoardRun,
};
