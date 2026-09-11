// Sold-item freshness (2026-09-11) - ONE place that decides what an eBay
// single-item lookup actually proves, how a confirmed retirement is
// persisted, how discovery writers are kept from undoing it, what the deal
// page may claim about a listing's availability, and which caches a
// retirement must invalidate.
//
// Provider verdict mapping (get_item_by_legacy_id, X-EBAY-C-MARKETPLACE-ID
// set per row). Traced against live responses on 2026-09-11 - every one of
// the 25 genuine verifier retirements in the preceding 72h re-read as
// HTTP 200 + estimatedAvailabilityStatus OUT_OF_STOCK, remaining 0, sold 1,
// with a past itemEndDate; no 404 was observed in that window:
//
//   HTTP 200, OUT_OF_STOCK or estimatedRemainingQuantity 0
//       -> SOLD. Quantity belongs to the ONE eBay item, so it is the same in
//          every marketplace (scope "item"). Still written to THIS row
//          only - cross-market propagation is deliberately deferred.
//   HTTP 200, anything else (IN_STOCK / LIMITED_STOCK / no availability
//          block)
//       -> ACTIVE (a successful availability confirmation).
//   HTTP 404 / 410
//       -> ENDED, scope "marketplace": the item cannot be fetched through
//          THIS marketplace. That is either a removed/ended listing or an
//          item that is not offered on this site - the response alone does
//          not say which, so it is never treated as proof for any other
//          marketplace's row.
//   HTTP 429 (rate limited), 401/403 (auth), any other non-2xx (5xx after
//          lib/ebay's single retry), a network failure, or an unparseable
//          body
//       -> UNKNOWN. Inconclusive: no retirement, no verification stamp.
//   Auction re-pricing below the publish floor (lib/auctionPricing
//          "below_threshold") is a PRICE outcome on a live listing, not an
//          availability retirement - it carries no availability reason and
//          a later genuine sighting may legitimately re-publish it.
//
// CommonJS + pure (the one I/O helper takes `db` as an argument) so
// node:test can exercise it without Next.

const AVAILABILITY_REASON_PREFIX = "availability:";

// Persisted in deals.disqualified_reason (an existing column). Any
// non-null disqualified_reason already hides a row everywhere
// (lib/dealQuality.isDisplayableDeal), and no discovery writer sends that
// column - so a sighting can never clear it.
const AVAILABILITY_RETIREMENT = Object.freeze({
  SOLD: "availability:sold",
  NOT_FOUND_IN_MARKETPLACE: "availability:not_found_in_marketplace",
});

// classify one get_item_by_legacy_id outcome. Exactly one of
// fetchFailed / parseFailed / (httpStatus + body) describes the call.
// Returns { status, scope, evidence }:
//   status   ACTIVE | SOLD | ENDED | UNKNOWN (the values lib/ebay has
//            always returned - callers are unchanged)
//   scope    "item" | "marketplace" | null - what the verdict speaks for
//   evidence short machine label for logs / verify-deals detail
function classifyItemLookup({ httpStatus = null, body = null, fetchFailed = false, parseFailed = false } = {}) {
  if (fetchFailed) return { status: "UNKNOWN", scope: null, evidence: "network_error" };
  if (httpStatus === 404 || httpStatus === 410) {
    return { status: "ENDED", scope: "marketplace", evidence: "not_found_in_marketplace" };
  }
  if (httpStatus === 429) return { status: "UNKNOWN", scope: null, evidence: "rate_limited" };
  if (httpStatus === 401 || httpStatus === 403) return { status: "UNKNOWN", scope: null, evidence: "auth_error" };
  if (!(httpStatus >= 200 && httpStatus < 300)) {
    return { status: "UNKNOWN", scope: null, evidence: httpStatus >= 500 ? "server_error" : `http_${httpStatus}` };
  }
  if (parseFailed || !body || typeof body !== "object") {
    return { status: "UNKNOWN", scope: null, evidence: "unparseable" };
  }
  const avail = body.estimatedAvailabilities?.[0] ?? null;
  if (avail?.estimatedAvailabilityStatus === "OUT_OF_STOCK" || avail?.estimatedRemainingQuantity === 0) {
    return { status: "SOLD", scope: "item", evidence: "out_of_stock" };
  }
  return { status: "ACTIVE", scope: "item", evidence: avail ? "in_stock" : "no_availability_block" };
}

// A single-item body's sold-out signal (the same rule classifyItemLookup
// applies to a 200). null when the body carries no availability block -
// search / item_summary results never do, so null means "not stated", not
// "in stock".
function soldOutFromItemBody(body) {
  const avail = body?.estimatedAvailabilities?.[0] ?? null;
  if (!avail) return null;
  return avail.estimatedAvailabilityStatus === "OUT_OF_STOCK" || avail.estimatedRemainingQuantity === 0;
}

// verify-deals status -> the reason to persist, or null for anything that
// is not an availability retirement (ACTIVE, UNKNOWN, RETIRED-by-price).
function availabilityRetirementReason(status) {
  if (status === "SOLD") return AVAILABILITY_RETIREMENT.SOLD;
  if (status === "ENDED") return AVAILABILITY_RETIREMENT.NOT_FOUND_IN_MARKETPLACE;
  return null;
}

function isAvailabilityRetired(row) {
  return typeof row?.disqualified_reason === "string" && row.disqualified_reason.startsWith(AVAILABILITY_REASON_PREFIX);
}

// PostgREST or() clause: rows a discovery sighting may still write to.
// Validated read-only against production on 2026-09-11 (the quoted LIKE
// pattern parses and excludes prefixed reasons).
const SIGHTING_WRITABLE_OR = `disqualified_reason.is.null,disqualified_reason.not.like."${AVAILABILITY_REASON_PREFIX}*"`;

// A discovery sighting (search sweep, per-card scan, feed re-fetch) of one
// listing. Replaces `upsert(core, { onConflict: "source,marketplace,
// listing_id" })`, which re-set is_active=true + a fresh last_seen_at on a
// row the verifier had just retired as sold.
//
//   1. conditional UPDATE of the existing row, only while it carries no
//      availability retirement. One statement: Postgres re-checks the
//      WHERE after waiting on a concurrent verifier write, so whichever
//      order the two commit in, a retired row stays retired.
//   2. no row updated -> INSERT ... ON CONFLICT DO NOTHING. Inserted ->
//      a new listing. Conflict -> the row exists and is retired: blocked.
//
// Same columns as the old upsert in both branches (the BEFORE INSERT/
// UPDATE triggers on deals fire on the plain UPDATE too). Returns
// { outcome: "updated" | "inserted" | "blocked" | "error", error }.
async function writeDiscoverySighting(db, core) {
  const key = { source: core.source, marketplace: core.marketplace, listing_id: core.listing_id };
  const upd = await db.from("deals").update(core).match(key).or(SIGHTING_WRITABLE_OR).select("id");
  if (upd.error) return { outcome: "error", error: upd.error };
  if ((upd.data ?? []).length > 0) return { outcome: "updated", error: null };

  const ins = await db
    .from("deals")
    .upsert(core, { onConflict: "source,marketplace,listing_id", ignoreDuplicates: true })
    .select("id");
  if (ins.error) return { outcome: "error", error: ins.error };
  if ((ins.data ?? []).length > 0) return { outcome: "inserted", error: null };
  return { outcome: "blocked", error: null };
}

// What the deal page may say about this listing's availability.
//   { kind: "confirmed", at } - exact_verified_at is a successful
//       availability check: a confirmation stamps exact_verified_at and
//       last_seen_at with the SAME instant and later sightings only move
//       last_seen_at forward, so it can never be later than last_seen_at.
//       A retirement stamps exact_verified_at alone (later than
//       last_seen_at), and a row carrying an availability reason is a
//       retirement by definition - neither is ever called a confirmation.
//   { kind: "seen", at } - only discovery evidence: the listing last
//       appeared in eBay results (or an item re-fetch) at `at`.
//   null - no usable timestamp.
const STAMP_TOLERANCE_MS = 1000;
function listingAvailabilityEvidence(deal) {
  if (!deal) return null;
  const seenMs = Date.parse(deal.last_seen_at ?? "");
  const exactMs = Date.parse(deal.exact_verified_at ?? "");
  if (
    Number.isFinite(exactMs) &&
    !isAvailabilityRetired(deal) &&
    (!Number.isFinite(seenMs) || exactMs <= seenMs + STAMP_TOLERANCE_MS)
  ) {
    return { kind: "confirmed", at: deal.exact_verified_at };
  }
  if (Number.isFinite(seenMs)) return { kind: "seen", at: deal.last_seen_at };
  return null;
}

// Cache tags. Card offers (lib/deals fetchCardOffers / fetchCardDealsPage)
// carry one tag per card identity; Next 16 copies unstable_cache tags onto
// the ISR entry of the page that read them, so the same tag also expires
// the /cards/[slug] HTML - without touching that page's separately cached
// PokemonPriceTracker analysis. The deal detail data carries a per-id tag.
function cardOffersTags({ watchlistId, tcgplayerId } = {}) {
  const tags = [];
  if (watchlistId != null && watchlistId !== "") tags.push(`card-offers:w:${watchlistId}`);
  if (tcgplayerId != null && tcgplayerId !== "") tags.push(`card-offers:t:${tcgplayerId}`);
  return tags;
}
const dealDetailTag = (id) => `deal-detail:${id}`;

// Deduplicated invalidation plan for a set of retired rows (each needs
// id, watchlist_id, card_tcgplayer_id). One card retired N times in a run
// is invalidated once.
function retirementInvalidationPlan(rows) {
  const cardTags = new Set();
  const dealTags = new Set();
  const cards = new Set();
  for (const r of rows ?? []) {
    if (!r) continue;
    const tags = cardOffersTags({ watchlistId: r.watchlist_id, tcgplayerId: r.card_tcgplayer_id });
    if (tags.length) cards.add(tags[0]);
    for (const t of tags) cardTags.add(t);
    if (r.id != null) dealTags.add(dealDetailTag(r.id));
  }
  return { tags: [...cardTags, ...dealTags], cards: cards.size, deals: dealTags.size };
}

// Expire the tags now (not stale-while-revalidate: the next visitor must
// not be served the sold offer). `revalidate` is next/cache revalidateTag,
// injected so this stays testable. Never throws - a failed invalidation
// only means the normal cache windows apply.
function expireTags(revalidate, tags) {
  let expired = 0;
  const errors = [];
  for (const t of tags ?? []) {
    try {
      revalidate(t, { expire: 0 });
      expired++;
    } catch (e) {
      errors.push(`${t}: ${e?.message ?? e}`);
    }
  }
  return { expired, errors };
}

module.exports = {
  AVAILABILITY_REASON_PREFIX,
  AVAILABILITY_RETIREMENT,
  SIGHTING_WRITABLE_OR,
  classifyItemLookup,
  soldOutFromItemBody,
  availabilityRetirementReason,
  isAvailabilityRetired,
  writeDiscoverySighting,
  listingAvailabilityEvidence,
  cardOffersTags,
  dealDetailTag,
  retirementInvalidationPlan,
  expireTags,
};
