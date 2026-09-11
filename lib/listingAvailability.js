// Sold-item freshness (2026-09-11) - ONE place that decides what an eBay
// single-item lookup actually proves, how a confirmed retirement is
// persisted, how discovery writers are kept from undoing it, how a retired
// row can be exactly re-verified, what the deal page may claim about a
// listing's availability, and which caches a change must invalidate.
//
// PROVIDER FIELDS USED (Browse API get_item_by_legacy_id, called with
// X-EBAY-C-MARKETPLACE-ID = the row's own marketplace). Full notes:
// docs/sold-item-freshness.md.
//
//   HTTP status
//   estimatedAvailabilities[]                    (every entry, not just [0])
//     .estimatedAvailabilityStatus  IN_STOCK | LIMITED_STOCK | OUT_OF_STOCK
//     .estimatedRemainingQuantity   integer, may be absent
//
// NOT used for any verdict: itemEndDate (for a sold-out item it is when the
// listing stopped being purchasable - eBay does not document it as the
// sale time, and a seller can also end a listing), estimatedSoldQuantity,
// estimatedAvailableQuantity, availabilityThreshold*.
//
// Verdicts (status values unchanged for existing callers):
//   SOLD    HTTP 200 and EVERY availability entry is OUT_OF_STOCK or has
//           estimatedRemainingQuantity 0. Quantity belongs to the one eBay
//           item, but the write still goes to THIS row only - cross-market
//           propagation is deferred.
//   ACTIVE  HTTP 200 and EVERY availability entry is IN_STOCK/LIMITED_STOCK
//           with no zero remaining quantity. Positive evidence is REQUIRED:
//           a 200 without availability data is not a confirmation.
//   ENDED   HTTP 404/410 in this marketplace: removed/ended, or not offered
//           on this site. The response does not say which, so it is kept
//           separate from SOLD and is never evidence for another
//           marketplace's row.
//   UNKNOWN everything else - 429, 401/403, other non-2xx (5xx after
//           lib/ebay's single retry), network failure, unparseable body,
//           a 200 with no / unrecognised / mixed availability entries.
//           No retirement and no verification stamp.
//   Auction re-pricing below the publish floor (lib/auctionPricing
//   "below_threshold") is a PRICE outcome, not an availability retirement.
//
// CommonJS + pure (the one I/O helper takes `db` as an argument) so
// node:test can exercise it without Next.

const AVAILABILITY_REASON_PREFIX = "availability:";
const SEEN_AGAIN_SUFFIX = ":seen_again";

// Persisted in deals.disqualified_reason (an existing column). Any
// non-null disqualified_reason already hides a row everywhere
// (lib/dealQuality.isDisplayableDeal), and no discovery writer sends that
// column - so a sighting can never clear it.
const AVAILABILITY_RETIREMENT = Object.freeze({
  SOLD: "availability:sold",
  NOT_FOUND_IN_MARKETPLACE: "availability:not_found_in_marketplace",
});
// A later eBay search sighting of a retired row, in the same marketplace,
// is recorded ONLY by this suffix - never by last_seen_at / is_active. It
// is the sole trigger for a recovery re-check (see RECOVERY below).
const SEEN_AGAIN = Object.freeze({
  SOLD: AVAILABILITY_RETIREMENT.SOLD + SEEN_AGAIN_SUFFIX,
  NOT_FOUND_IN_MARKETPLACE: AVAILABILITY_RETIREMENT.NOT_FOUND_IN_MARKETPLACE + SEEN_AGAIN_SUFFIX,
});

const POSITIVE_STATUSES = new Set(["IN_STOCK", "LIMITED_STOCK"]);

// One availability entry -> "positive" | "sold_out" | "indeterminate".
function classifyAvailabilityEntry(a) {
  if (!a || typeof a !== "object") return "indeterminate";
  const status = a.estimatedAvailabilityStatus;
  const remaining = a.estimatedRemainingQuantity;
  if (status === "OUT_OF_STOCK" || remaining === 0) return "sold_out";
  if (POSITIVE_STATUSES.has(status)) return "positive";
  return "indeterminate";
}

// A 200 body's availability verdict: "positive" | "sold_out" |
// "no_availability_data" | "unrecognised_availability" | "mixed_availability".
function availabilityFromItemBody(body) {
  const entries = Array.isArray(body?.estimatedAvailabilities) ? body.estimatedAvailabilities : [];
  if (entries.length === 0) return "no_availability_data";
  const kinds = new Set(entries.map(classifyAvailabilityEntry));
  if (kinds.size === 1 && kinds.has("positive")) return "positive";
  if (kinds.size === 1 && kinds.has("sold_out")) return "sold_out";
  if (kinds.has("indeterminate") && kinds.size === 1) return "unrecognised_availability";
  return "mixed_availability";
}

// classify one get_item_by_legacy_id outcome. Exactly one of
// fetchFailed / parseFailed / (httpStatus + body) describes the call.
// Returns { status, scope, evidence }:
//   status   ACTIVE | SOLD | ENDED | UNKNOWN
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
  const avail = availabilityFromItemBody(body);
  if (avail === "sold_out") return { status: "SOLD", scope: "item", evidence: "out_of_stock" };
  if (avail === "positive") return { status: "ACTIVE", scope: "item", evidence: "in_stock" };
  return { status: "UNKNOWN", scope: null, evidence: avail };
}

// A single-item body's sold-out signal for the feed re-fetch: true only on
// a sold-out verdict, false only on positive availability, null otherwise
// (search / item_summary results carry no availability data at all).
function soldOutFromItemBody(body) {
  const avail = availabilityFromItemBody(body);
  if (avail === "sold_out") return true;
  if (avail === "positive") return false;
  return null;
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

// "availability:sold:seen_again" -> "availability:sold"
function baseAvailabilityReason(reason) {
  if (typeof reason !== "string") return reason;
  return reason.endsWith(SEEN_AGAIN_SUFFIX) ? reason.slice(0, -SEEN_AGAIN_SUFFIX.length) : reason;
}

// PostgREST or() clause: rows a discovery sighting may still write to.
// PostgREST renders it as
//   (disqualified_reason IS NULL OR disqualified_reason NOT LIKE 'availability:%')
// - validated read-only against production, and the SQL itself is run
// under two concurrent connections in tests/db/sold-freshness-concurrency.
const SIGHTING_WRITABLE_OR = `disqualified_reason.is.null,disqualified_reason.not.like."${AVAILABILITY_REASON_PREFIX}*"`;

const updateGuarded = (db, core, key) => db.from("deals").update(core).match(key).or(SIGHTING_WRITABLE_OR).select("id");

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
//      a new listing.
//   3. conflict -> another writer created the row between 1 and 2, or it
//      is retired: re-run the guarded UPDATE once. Updated -> "updated".
//   4. still nothing -> the row is retired: "blocked". Record the sighting
//      ONLY as the seen-again marker on a base retirement reason (a
//      conditional update per reason family - sold and not-found stay
//      distinct), which makes the row eligible for ONE bounded exact
//      re-check inside verify-deals' existing batch.
//
// Same columns as the old upsert (the BEFORE INSERT/UPDATE triggers on
// deals fire on the plain UPDATE too). Returns
// { outcome: "updated" | "inserted" | "blocked" | "error", error, markedSeenAgain }.
async function writeDiscoverySighting(db, core) {
  const key = { source: core.source, marketplace: core.marketplace, listing_id: core.listing_id };
  const upd = await updateGuarded(db, core, key);
  if (upd.error) return { outcome: "error", error: upd.error, markedSeenAgain: false };
  if ((upd.data ?? []).length > 0) return { outcome: "updated", error: null, markedSeenAgain: false };

  const ins = await db
    .from("deals")
    .upsert(core, { onConflict: "source,marketplace,listing_id", ignoreDuplicates: true })
    .select("id");
  if (ins.error) return { outcome: "error", error: ins.error, markedSeenAgain: false };
  if ((ins.data ?? []).length > 0) return { outcome: "inserted", error: null, markedSeenAgain: false };

  const retry = await updateGuarded(db, core, key);
  if (retry.error) return { outcome: "error", error: retry.error, markedSeenAgain: false };
  if ((retry.data ?? []).length > 0) return { outcome: "updated", error: null, markedSeenAgain: false };

  let markedSeenAgain = false;
  for (const [base, marked] of [
    [AVAILABILITY_RETIREMENT.SOLD, SEEN_AGAIN.SOLD],
    [AVAILABILITY_RETIREMENT.NOT_FOUND_IN_MARKETPLACE, SEEN_AGAIN.NOT_FOUND_IN_MARKETPLACE],
  ]) {
    const m = await db.from("deals").update({ disqualified_reason: marked }).match(key).eq("disqualified_reason", base).select("id");
    if (!m.error && (m.data ?? []).length > 0) {
      markedSeenAgain = true;
      break;
    }
  }
  return { outcome: "blocked", error: null, markedSeenAgain };
}

// ---------------------------------------------------------------------------
// RECOVERY - bounded exact re-verification of a retired row.
//
// A restocked listing (same item id, seller added quantity) or a listing
// that is fetchable in this marketplace again only comes back through an
// exact item lookup in THIS row's marketplace with positive availability.
// Never through a sighting, never through another marketplace's result.
//
// Bounds (no extra automatic calls):
//   * only rows a later same-marketplace search sighting marked seen-again
//   * only FIXED_PRICE rows (an ended auction does not come back)
//   * last check at least RECOVERY_MIN_HOURS_SINCE_CHECK ago (search-index
//     lag after a sale would otherwise trigger pointless re-checks) and no
//     more than RECOVERY_MAX_AGE_DAYS ago
//   * at most RECOVERY_SLOTS_PER_RUN per verify-deals run, taken OUT OF the
//     existing BATCH (20) - the per-run call ceiling, the reserve floor and
//     the cron cadence are unchanged
//   * every outcome consumes the seen-again marker, so a row is re-checked
//     again only after ANOTHER sighting and another 24h
const RECOVERY_SLOTS_PER_RUN = 1;
const RECOVERY_MIN_HOURS_SINCE_CHECK = 24;
const RECOVERY_MAX_AGE_DAYS = 14;
const PRICE_MATCH_TOLERANCE = 0.01; // 1% (min one minor unit)

const within = (a, b) => {
  const x = Number(a);
  const y = Number(b);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
  return Math.abs(x - y) <= Math.max(0.01, Math.abs(y) * PRICE_MATCH_TOLERANCE);
};

// Pure. row: the retired deals row; snapshot: getListingSnapshot result.
//   { action: "reactivate", patch } positive availability AND the live
//       item price + shipping + currency still match the stored deal ->
//       live again, confirmed now.
//   { action: "release", patch } positive availability but the price
//       moved -> the retirement is lifted (confirmed now) but the row stays
//       inactive; the next discovery sighting re-qualifies it at the live
//       price through the normal pipeline.
//   { action: "retain", patch } SOLD / ENDED again -> base reason for
//       that verdict (sold and not-found stay distinct), check time stamped.
//   { action: "retain", patch } UNKNOWN -> only the marker is consumed;
//       no verdict, no timestamp.
function recoveryDecision({ row, snapshot, nowIso = new Date().toISOString() }) {
  const base = baseAvailabilityReason(row?.disqualified_reason);
  const status = snapshot?.status;
  if (status === "ACTIVE") {
    const sameCurrency = !row.currency || !snapshot.currency || row.currency === snapshot.currency;
    const priceMatches =
      snapshot.listingType === "FIXED_PRICE" &&
      sameCurrency &&
      within(snapshot.price, row.price) &&
      within(snapshot.shipping ?? 0, row.shipping ?? 0);
    if (priceMatches) {
      return {
        action: "reactivate",
        patch: { is_active: true, disqualified_reason: null, last_seen_at: nowIso, exact_verified_at: nowIso },
      };
    }
    return { action: "release", patch: { disqualified_reason: null, exact_verified_at: nowIso } };
  }
  if (status === "SOLD" || status === "ENDED") {
    return { action: "retain", patch: { disqualified_reason: availabilityRetirementReason(status), exact_verified_at: nowIso } };
  }
  return { action: "retain", patch: { disqualified_reason: base } };
}

// What the deal page may say about this listing's availability.
//   { kind: "confirmed", at } - ONLY when exact_verified_at and
//       last_seen_at are the SAME instant. A successful active verdict
//       (verify-deals ACTIVE / auction re-price / recovery reactivation)
//       is the one write that stamps both with one timestamp, so equality
//       proves the most recent eBay evidence was a positive exact check.
//       A retirement stamps exact_verified_at alone, and any later
//       sighting moves last_seen_at on - including on legacy rows the old
//       code retired and then revived - so an unequal pair is never
//       presented as a confirmation.
//   { kind: "seen", at } - the listing last appeared in eBay results at
//       `at`, and has not been individually re-checked since.
//   null - no usable timestamp.
// THE positive-ACTIVE evidence rule, shared by the deal page wording
// (below) and premium eligibility (lib/dealQuality.isExactVerifiedFresh):
// exact_verified_at counts only when it is the same instant as
// last_seen_at on a row with no availability retirement. A retirement
// (SOLD / NOT_FOUND) stamps exact_verified_at ALONE, and UNKNOWN stamps
// nothing, so neither can ever satisfy this; a later sighting moves
// last_seen_at on and conservatively ends the confirmation until the next
// successful check.
function isPositiveActiveConfirmation(row) {
  if (!row || isAvailabilityRetired(row)) return false;
  const seenMs = Date.parse(row.last_seen_at ?? "");
  const exactMs = Date.parse(row.exact_verified_at ?? "");
  return Number.isFinite(exactMs) && Number.isFinite(seenMs) && exactMs === seenMs;
}

function listingAvailabilityEvidence(deal) {
  if (!deal) return null;
  if (isPositiveActiveConfirmation(deal)) return { kind: "confirmed", at: deal.exact_verified_at };
  if (Number.isFinite(Date.parse(deal.last_seen_at ?? ""))) return { kind: "seen", at: deal.last_seen_at };
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

// Deduplicated invalidation plan for rows whose visibility just changed
// (each needs id, watchlist_id, card_tcgplayer_id). One card changed N
// times in a run is invalidated once.
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
  SEEN_AGAIN,
  SIGHTING_WRITABLE_OR,
  RECOVERY_SLOTS_PER_RUN,
  RECOVERY_MIN_HOURS_SINCE_CHECK,
  RECOVERY_MAX_AGE_DAYS,
  classifyItemLookup,
  availabilityFromItemBody,
  soldOutFromItemBody,
  availabilityRetirementReason,
  isAvailabilityRetired,
  baseAvailabilityReason,
  writeDiscoverySighting,
  recoveryDecision,
  isPositiveActiveConfirmation,
  listingAvailabilityEvidence,
  cardOffersTags,
  dealDetailTag,
  retirementInvalidationPlan,
  expireTags,
};
