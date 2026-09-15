// "All deals" browsing - the eligible, listing-deduplicated inventory
// behind /deals. Pure: no I/O. lib/deals.js reads the rows and caches the
// encoded result; the R3 fixture runs the same functions over its own rows.
//
// Why a separate index instead of fetchDealsPage: that loader counts rows
// BEFORE the display gate (a Postgres planner estimate), drops gated rows
// AFTER slicing a page (short pages), dedups by CARD (hides distinct
// listings of one card) and caps browsing at 25 pages. None of that can
// give "count and paginate the same eligible, deduplicated inventory".
//
// Order of operations (the contract):
//   1. build (cached, per marketplace): full rows -> isDisplayableDeal ->
//      compact tuple encoding. Nothing ineligible is ever stored.
//   2. request: decode every marketplace -> re-check the time-dependent
//      gates (freshness TTL, ended auction) -> withhold listings whose copies
//      disagree on catalogue identity -> marketplace scope -> dedup by exact
//      eBay listing identity -> filters ->
//      sort -> count -> slice one page. Counts and pages come from the same
//      array, so they cannot disagree.
//
// Resource limits (measured 2026-09-14 on production, read-only):
//   1,183 active English card rows, 1,102 eligible, 865 distinct listings,
//   149 listings present in 2+ marketplaces. Full rows serialise to 2.5 MB
//   (over Next's ~2 MB data-cache entry limit); the tuple encoding below is
//   752 B/row median, 804 B p95, 897 B max (0.79 MB total; largest single
//   marketplace EBAY_US 476 rows / 355 KB). Re-measured with every card
//   language (acceptance review, same day): +67 active / +48 eligible
//   Japanese rows, 906 distinct listings, EBAY_US 501 rows / 365 KB, max
//   encoded row still 897 B - the limits below are unchanged. Presentation outputs
//   (listingPresentation, conditionLabel, offerShipping, currencyForDeal,
//   savingsClaimTrusted, dealFreshness, isStale, auctionEnded) were
//   identical for full vs compact rows on all 1,098 eligible rows.
//   Request-time decode + filter + sort: ~3 ms.
//   -> MAX_ELIGIBLE_ROWS_PER_MARKETPLACE 1,800 keeps one marketplace entry
//      ~1.6 MB at the observed maximum row size (the existing cache headroom
//      target, tests/scanner/infra-db-1), 3.8x today's largest marketplace.
//   -> MAX_ACTIVE_ROWS_READ_PER_MARKETPLACE 2,500 bounds one rebuild to three
//      1,000-row reads.
//   Hitting either limit never truncates silently: that marketplace is
//   marked incomplete and every count built from it is reported as a lower
//   bound ("at least"), never as exact.

import { isDisplayableDeal, isStale, auctionEnded, savingsClaimTrusted } from "./dealQuality.js";
import { planDealFilters } from "./dealFilters.js";

export const ALL_DEALS_PAGE_SIZE = 24;
export const MAX_ELIGIBLE_ROWS_PER_MARKETPLACE = 1800;
export const MAX_ACTIVE_ROWS_READ_PER_MARKETPLACE = 2500;

// Also the deterministic preference order when one eBay listing is stored
// for several marketplaces and none of them is the listing's home market.
export const ALL_DEALS_MARKETPLACES = Object.freeze(["EBAY_US", "EBAY_GB", "EBAY_CA", "EBAY_AU", "EBAY_DE", "EBAY_IT"]);

// Every field the display gate re-check, DealCard, AuctionPrice, DealImage,
// listingPresentation / conditionLabel / offerShipping / currencyForDeal and
// the dedup rule read. Nothing else is cached.
export const INVENTORY_FIELDS = Object.freeze([
  "id", "listing_id", "title", "image_url", "display_image_url", "image_verdict", "affiliate_url",
  "price", "shipping", "total_price", "total_price_usd", "currency", "market_price", "discount_pct",
  "condition", "is_graded", "grade", "grader", "listing_type", "auction_end_at", "bid_count",
  "marketplace", "is_local", "item_location_country", "is_active", "first_seen_at", "last_seen_at",
  "exact_verified_at", "card_name", "card_set", "card_language", "card_tcgplayer_id", "card_catalog_id",
  "watchlist_id", "disqualified_reason", "discovery_source",
  "reference_source", "reference_product_id", "reference_amount", "reference_currency",
  "reference_observed_at", "reference_synced_at", "reference_fx_rate", "reference_fx_asof",
  "reference_condition", "reference_printing", "reference_grader", "reference_grade",
]);

const byNewest = (a, b) => cmpDesc(a.first_seen_at, b.first_seen_at) || Number(b.id) - Number(a.id);
function cmpDesc(a, b) {
  if (a === b) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  return a < b ? 1 : -1;
}

// BUILD (cached). `rows`: full `deals` rows for ONE marketplace, as read.
// `readLimitHit`: the reader stopped at MAX_ACTIVE_ROWS_READ_PER_MARKETPLACE.
export function encodeMarketplaceInventory(rows, { marketplace, readLimitHit = false, builtAt = new Date().toISOString() } = {}) {
  // Single cards in every catalogue language (sealed products live in a
  // separate table and page). The real display gate decides eligibility,
  // including its language rule: the listing's language must match the
  // card's catalogue language, so a Japanese print is only ever shown
  // against a Japanese-catalogue identity and reference.
  const eligible = (rows ?? []).filter((r) => r && r.marketplace === marketplace && isDisplayableDeal(r)).sort(byNewest);
  const overCap = eligible.length > MAX_ELIGIBLE_ROWS_PER_MARKETPLACE;
  const kept = overCap ? eligible.slice(0, MAX_ELIGIBLE_ROWS_PER_MARKETPLACE) : eligible;
  return {
    marketplace,
    builtAt,
    fields: INVENTORY_FIELDS,
    rows: kept.map((r) => INVENTORY_FIELDS.map((k) => r[k] ?? null)),
    eligibleCount: eligible.length,
    // complete = every eligible row of this marketplace is in `rows`
    complete: !readLimitHit && !overCap,
    limits: { readLimitHit, overCap },
  };
}

export function decodeMarketplaceInventory(chunk) {
  const fields = chunk?.fields ?? INVENTORY_FIELDS;
  return (chunk?.rows ?? []).map((t) => {
    const o = {};
    fields.forEach((k, i) => {
      o[k] = t[i];
    });
    o.watchlist = { name: o.card_name, set: o.card_set, language: o.card_language, justtcg_tcgplayer_id: o.card_tcgplayer_id };
    return o;
  });
}

// One tile per exact eBay listing. Copies of the same listing stored for
// several marketplaces disagree (eBay converts price/shipping per site), so
// never mix fields: pick ONE whole copy - its price, currency, shipping
// statement and destination travel together.
//   1. the listing's home marketplace (EBAY_<item_location_country>)
//   2. otherwise ALL_DEALS_MARKETPLACES order
//   3. otherwise the lowest row id
export function chooseListingCopy(copies) {
  const rank = (r) => {
    const home = r.item_location_country ? `EBAY_${String(r.item_location_country).toUpperCase()}` : null;
    const pref = ALL_DEALS_MARKETPLACES.indexOf(r.marketplace);
    return [r.marketplace === home ? 0 : 1, pref === -1 ? 99 : pref, Number(r.id)];
  };
  return [...copies].sort((a, b) => {
    const ra = rank(a);
    const rb = rank(b);
    return ra[0] - rb[0] || ra[1] - rb[1] || ra[2] - rb[2];
  })[0];
}

const listingKey = (r) => String(r.listing_id ?? `row:${r.id}`);

// The catalogue identity a stored copy was matched to: language, product
// and (for slabs) grader + grade - everything its market comparison is
// derived from.
const catalogueIdentity = (r) =>
  [
    r.card_language ?? "",
    r.card_tcgplayer_id ?? r.card_catalog_id ?? `${r.card_name ?? ""}|${r.card_set ?? ""}`,
    r.is_graded ? "graded" : "raw",
    r.is_graded ? r.grader ?? "" : "",
    r.is_graded ? String(r.grade ?? "") : "",
  ].join("|");

// One eBay listing whose eligible stored copies were matched to DIFFERENT
// catalogue identities (e.g. 2026-09-14: listing v1|147570453677|0, Hoopa
// 155/XY-P, stored as the Japanese promo on EBAY_US/GB and as the English
// promo on EBAY_IT, each with its own market reference). At most one
// comparison can be right, and picking a copy by marketplace preference
// would be picking an identity by marketplace. The listing is withheld from
// All deals - every scope, every count - until the stored identities agree.
// Detected across ALL loaded marketplaces, so a marketplace filter cannot
// isolate the wrong copy.
export function identityConflictKeys(rows) {
  const seen = new Map();
  const conflicts = new Set();
  for (const r of rows) {
    const k = listingKey(r);
    const id = catalogueIdentity(r);
    if (!seen.has(k)) seen.set(k, id);
    else if (seen.get(k) !== id) conflicts.add(k);
  }
  return conflicts;
}

function dedupeByListing(rows) {
  const groups = new Map();
  for (const r of rows) {
    const k = listingKey(r);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(r);
  }
  const out = [];
  for (const copies of groups.values()) {
    const chosen = chooseListingCopy(copies);
    const others = [...new Set(copies.filter((c) => c !== chosen).map((c) => c.marketplace))].sort(
      (a, b) => ALL_DEALS_MARKETPLACES.indexOf(a) - ALL_DEALS_MARKETPLACES.indexOf(b)
    );
    out.push({ ...chosen, also_on: others });
  }
  return out;
}

function matchesPlan(row, plan) {
  for (const [col, val] of Object.entries(plan.eq)) {
    if (col === "grade") {
      if (String(row.grade ?? "") !== String(val)) return false;
    } else if (row[col] !== val) return false;
  }
  for (const [col, val] of Object.entries(plan.lte)) if (!(Number(row[col]) <= val)) return false;
  for (const [col, val] of Object.entries(plan.gte)) if (!(Number(row[col]) >= val)) return false;
  return true;
}

// Sorts never change WHICH listings are counted, only their order.
//   discount: listings with a trusted, positive comparison by discount;
//             every plain listing follows (newest) - never ranked by savings
//   ending:   live auctions soonest-ending first; everything else follows
function sortRows(rows, sort, now) {
  const idAsc = (a, b) => Number(a.id) - Number(b.id);
  const price = (r) => (Number.isFinite(Number(r.total_price_usd)) && r.total_price_usd != null ? Number(r.total_price_usd) : null);
  switch (sort) {
    case "price_asc":
    case "price_desc": {
      const dir = sort === "price_asc" ? 1 : -1;
      return [...rows].sort((a, b) => {
        const pa = price(a);
        const pb = price(b);
        if (pa == null && pb == null) return idAsc(a, b);
        if (pa == null) return 1;
        if (pb == null) return -1;
        return (pa - pb) * dir || idAsc(a, b);
      });
    }
    case "discount": {
      const ranked = (r) => savingsClaimTrusted(r, now) && Number(r.market_price) > 0 && Number(r.discount_pct) > 0;
      const withSavings = rows.filter(ranked).sort((a, b) => Number(b.discount_pct) - Number(a.discount_pct) || idAsc(a, b));
      const plain = rows.filter((r) => !ranked(r)).sort(byNewest);
      return [...withSavings, ...plain];
    }
    case "ending": {
      const live = (r) => r.listing_type === "AUCTION" && r.auction_end_at && Date.parse(r.auction_end_at) > now;
      const auctions = rows.filter(live).sort((a, b) => Date.parse(a.auction_end_at) - Date.parse(b.auction_end_at) || idAsc(a, b));
      const rest = rows.filter((r) => !live(r)).sort(byNewest);
      return [...auctions, ...rest];
    }
    default:
      return [...rows].sort(byNewest);
  }
}

const VALID_SORTS = new Set(["newest", "discount", "price_asc", "price_desc", "ending"]);

// graded-inventory-r1 - the rows a NARROWING sort keeps (category pages that
// keep their established sort scopes; /deals never narrows):
//   discount: only listings with a trusted, positive comparison - the same
//             test sortRows ranks by, so a savings-ordered view never lists
//             a plain listing
//   ending:   only live auctions
function keptBySortScope(row, sort, now) {
  if (sort === "discount") return savingsClaimTrusted(row, now) && Number(row.market_price) > 0 && Number(row.discount_pct) > 0;
  if (sort === "ending") return row.listing_type === "AUCTION" && Boolean(row.auction_end_at) && Date.parse(row.auction_end_at) > now;
  return true;
}

// REQUEST. `chunks`: encoded inventories for the marketplaces in scope (one
// when a marketplace is selected, all of them otherwise).
// `chunks`: pass every marketplace's inventory even when a `country` is
// selected - identity conflicts are detected across all of them.
// graded-inventory-r1 - options for a category page served from this same
// inventory (defaults keep /deals exactly as it was):
//   language        only listings matched to this catalogue language
//   localFirst      with one marketplace selected (and not "ending"), listings
//                   located in that marketplace's country come first; the
//                   sort order is kept within each group
//   narrowingSorts  "discount" / "ending" keep only the rows they rank
//                   (keptBySortScope); counts follow
export function queryAllDeals(chunks, params = {}, { now = Date.now(), pageSize = ALL_DEALS_PAGE_SIZE } = {}) {
  const country = params.country && ALL_DEALS_MARKETPLACES.includes(params.country) ? params.country : null;
  const language = typeof params.language === "string" && params.language ? params.language : null;
  const sort = VALID_SORTS.has(params.sort) ? params.sort : "newest";
  const loaded = (chunks ?? []).filter(Boolean);
  const inScope = loaded.filter((c) => !country || c.marketplace === country);
  // time-dependent gates can change between cache build and this request
  const live = loaded.flatMap(decodeMarketplaceInventory).filter((r) => !isStale(r, now) && !auctionEnded(r, now));
  const conflicts = identityConflictKeys(live);

  const plan = planDealFilters({
    type: params.cardType,
    grader: params.grader,
    grade: params.grade,
    listing: params.listingType,
    minPrice: params.minPrice,
    maxPrice: params.maxPrice,
  });
  const q = typeof params.q === "string" ? params.q.trim().toLowerCase() : "";
  // The same pipeline for any marketplace scope: identity-conflict withhold
  // -> scope -> dedup by exact listing -> filters -> search.
  const eligibleFor = (scope) => {
    let r = live.filter((x) => !conflicts.has(listingKey(x)) && (!scope || x.marketplace === scope));
    r = dedupeByListing(r).filter((x) => matchesPlan(x, plan));
    // copies of one listing share a catalogue identity (conflicts are
    // withheld above), so the chosen copy's language is the listing's
    if (language) r = r.filter((x) => x.card_language === language);
    if (q.length >= 2) r = r.filter((x) => String(x.title ?? "").toLowerCase().includes(q));
    if (params.narrowingSorts) r = r.filter((x) => keptBySortScope(x, sort, now));
    return r;
  };
  let rows = eligibleFor(country);
  // marketplace-broaden-r1: how many MORE listings "All marketplaces" would
  // show for exactly these filters - the all-marketplaces result minus every
  // listing already visible here, by exact listing identity. Only when both
  // sides are complete (every marketplace loaded, none hit a resource
  // limit); otherwise null, and callers show the action without a number.
  let additionalOnOtherMarketplaces = null;
  const allComplete = loaded.length === ALL_DEALS_MARKETPLACES.length && loaded.every((c) => c.complete);
  if (country && allComplete) {
    const visible = new Set(rows.map(listingKey));
    additionalOnOtherMarketplaces = eligibleFor(null).filter((x) => !visible.has(listingKey(x))).length;
  }

  rows = sortRows(rows, sort, now);
  if (params.localFirst && country && sort !== "ending") {
    rows = [...rows.filter((x) => x.is_local === true), ...rows.filter((x) => x.is_local !== true)];
  }

  const totalCount = rows.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const page = Math.max(1, Math.floor(Number(params.page) || 1));
  const outOfRange = totalCount > 0 && page > totalPages;
  const start = (page - 1) * pageSize;
  const deals = outOfRange ? [] : rows.slice(start, start + pageSize);
  const exact = inScope.length === (country ? 1 : ALL_DEALS_MARKETPLACES.length) && inScope.every((c) => c.complete);

  return {
    deals,
    page,
    pageSize,
    totalCount,
    totalPages,
    outOfRange,
    // listings withheld (all marketplaces) because their copies disagree on
    // catalogue identity - see identityConflictKeys
    identityConflictsWithheld: conflicts.size,
    additionalOnOtherMarketplaces,
    // false = at least one marketplace hit a resource limit or is missing:
    // totalCount is a LOWER BOUND and must be labelled that way
    exact,
    sort,
    country,
    filters: { type: plan.type, grader: plan.grader, grade: plan.grade, listing: plan.listing, minPrice: plan.minPrice, maxPrice: plan.maxPrice, q: q.length >= 2 ? q : null, language },
  };
}
