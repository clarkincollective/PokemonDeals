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

// Both discovery tables key a listing the same way, so the guard is the
// same statement against a different table (17C.9 - sealed_deals joins
// `deals` here; see writeGuardedSighting).
const SIGHTING_KEY_COLUMNS = ["source", "marketplace", "listing_id"];

const updateGuarded = (db, table, core, key) =>
  db.from(table).update(core).match(key).or(SIGHTING_WRITABLE_OR).select("id");

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
// The table-agnostic implementation. `table` must have the same unique key
// (source, marketplace, listing_id) and a nullable `disqualified_reason`.
// 17C.9: sealed_deals gains both with supabase/sealed_availability_migration
// .sql, so sealed discovery gets the identical protection rather than a
// second, subtly different one.
async function writeGuardedSighting(db, table, core) {
  const key = { source: core.source, marketplace: core.marketplace, listing_id: core.listing_id };
  const upd = await updateGuarded(db, table, core, key);
  if (upd.error) return { outcome: "error", error: upd.error, markedSeenAgain: false };
  if ((upd.data ?? []).length > 0) return { outcome: "updated", error: null, markedSeenAgain: false };

  const ins = await db
    .from(table)
    .upsert(core, { onConflict: "source,marketplace,listing_id", ignoreDuplicates: true })
    .select("id");
  if (ins.error) return { outcome: "error", error: ins.error, markedSeenAgain: false };
  if ((ins.data ?? []).length > 0) return { outcome: "inserted", error: null, markedSeenAgain: false };

  const retry = await updateGuarded(db, table, core, key);
  if (retry.error) return { outcome: "error", error: retry.error, markedSeenAgain: false };
  if ((retry.data ?? []).length > 0) return { outcome: "updated", error: null, markedSeenAgain: false };

  let markedSeenAgain = false;
  for (const [base, marked] of [
    [AVAILABILITY_RETIREMENT.SOLD, SEEN_AGAIN.SOLD],
    [AVAILABILITY_RETIREMENT.NOT_FOUND_IN_MARKETPLACE, SEEN_AGAIN.NOT_FOUND_IN_MARKETPLACE],
  ]) {
    const m = await db.from(table).update({ disqualified_reason: marked }).match(key).eq("disqualified_reason", base).select("id");
    if (!m.error && (m.data ?? []).length > 0) {
      markedSeenAgain = true;
      break;
    }
  }
  return { outcome: "blocked", error: null, markedSeenAgain };
}

async function writeDiscoverySighting(db, core) {
  return writeGuardedSighting(db, "deals", core);
}

// crossmatch-price-pilot-r1 - a NEW listing only (the cross-matching pricing
// pilot). Immediately before writing it rechecks that the listing has no row
// on ANY marketplace, then runs the same INSERT ... ON CONFLICT DO NOTHING as
// writeGuardedSighting step 2. It never updates: a row a concurrent writer
// created under the same key, or a copy on another marketplace, is left
// exactly as that writer left it (identity, reason, first_seen_at).
// Returns { outcome: "inserted" | "exists" | "error", where, error }.
async function insertNewSighting(db, core) {
  const pre = await db.from("deals").select("id").eq("listing_id", core.listing_id).limit(1);
  if (pre.error) return { outcome: "error", error: pre.error, where: null };
  if ((pre.data ?? []).length > 0) return { outcome: "exists", error: null, where: "stored_before_write" };
  const ins = await db.from("deals").upsert(core, { onConflict: "source,marketplace,listing_id", ignoreDuplicates: true }).select("id");
  if (ins.error) return { outcome: "error", error: ins.error, where: null };
  if ((ins.data ?? []).length > 0) return { outcome: "inserted", error: null, where: null };
  return { outcome: "exists", error: null, where: "concurrent_insert" };
}

// ---------------------------------------------------------------------------
// AVAILABILITY RETIREMENT THAT NEVER REPLACES ANOTHER EXCLUSION
// ---------------------------------------------------------------------------
//
// Integrity follow-up r2 (2026-09-14). A SOLD / ENDED verdict used to write
// `disqualified_reason = availability:*` unconditionally. On a row that
// already carried a non-availability reason - an identity quarantine
// (identity:collector_number_conflict, identity:language_conflict), a
// review hold (review:*) or a quality exclusion - that REPLACED the reason.
// The row then looked like an ordinary availability retirement: a later
// sighting marked it seen-again, and verify-deals' recovery could
// reactivate it with disqualified_reason = NULL, re-publishing the wrong
// identity. (The feed's sold-on-lookup write matched by listing key with
// no reason guard at all.)
//
// Now two guarded statements:
//   1. is_active=false + the availability reason, ONLY where the row has
//      no reason or already an availability reason;
//   2. is_active=false (and the same stamps) WITHOUT touching the reason,
//      where the row carries any other reason - it is retired, and its
//      quarantine/hold survives, so recovery (which only ever selects
//      availability seen-again markers) can never clear it.
// Rows updated by (1) now carry an availability reason and are excluded
// from (2). The filter shapes were validated read-only against production.
const REASON_REPLACEABLE_OR = `disqualified_reason.is.null,disqualified_reason.like."${AVAILABILITY_REASON_PREFIX}*"`;
// cache-retire-r1: marketplace / card_name / card_set / card_language let the
// caller expire the list, set and species surfaces for the rows it retired.
const RETIRE_RETURN_COLS = "id, watchlist_id, card_tcgplayer_id, disqualified_reason, marketplace, card_name, card_set, card_language";

//   key:        exact match object (e.g. { id } or { source, marketplace, listing_id })
//   reason:     availabilityRetirementReason(status) - must be an availability reason
//   patch:      extra columns to write in both statements (e.g. exact_verified_at)
//   onlyActive: add is_active = true to both statements
// Returns { error, retired: rows, preserved: rows whose other reason was kept }.
async function retireForAvailability(db, { table = "deals", key, reason, patch = {}, onlyActive = false }) {
  if (!reason || !String(reason).startsWith(AVAILABILITY_REASON_PREFIX)) {
    throw new Error(`retireForAvailability: not an availability reason: ${reason}`);
  }
  const scoped = (q) => (onlyActive ? q.match(key).eq("is_active", true) : q.match(key));
  const replace = await scoped(db.from(table).update({ ...patch, is_active: false, disqualified_reason: reason }))
    .or(REASON_REPLACEABLE_OR)
    .select(RETIRE_RETURN_COLS);
  if (replace.error) return { error: replace.error, retired: [], preserved: [] };
  const keep = await scoped(db.from(table).update({ ...patch, is_active: false }))
    .not("disqualified_reason", "is", null)
    .not("disqualified_reason", "like", `${AVAILABILITY_REASON_PREFIX}*`)
    .select(RETIRE_RETURN_COLS);
  if (keep.error) return { error: keep.error, retired: replace.data ?? [], preserved: [] };
  return { error: null, retired: [...(replace.data ?? []), ...(keep.data ?? [])], preserved: keep.data ?? [] };
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

// cache-retire-r1 - SURFACE tags: the cached lists and catalogues that show a
// listing's offer outside its own card and deal pages. Next copies a cache
// entry's tags onto the ISR entry of every page that read it, so expiring a
// tag expires the data AND those pages together; a regenerating page cannot
// reuse the old data.
//   deal-lists            homepage pools and lanes, best finds, auctions,
//                         fresh finds, category / latest-release pages
//   all-deals:<market>    one All deals inventory chunk (/deals, /api/deals-page)
//   set-deals:<set>       set catalogue + set deal grid (/sets/[slug])
//   species-deals:<name>  species catalogue, deal grid and stats (/pokemon/[slug])
// Set and species values are normalised the same way on both sides.
const DEAL_LISTS_TAG = "deal-lists";
function tagSlug(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}
const allDealsTag = (marketplace) => (marketplace ? `all-deals:${marketplace}` : null);
const setDealsTag = (setName) => (tagSlug(setName) ? `set-deals:${tagSlug(setName)}` : null);
const speciesDealsTag = (speciesName) => (tagSlug(speciesName) ? `species-deals:${tagSlug(speciesName)}` : null);

// Deduplicated surface plan for rows whose visibility just changed (each needs
// marketplace, card_name, card_set). dealPages adds each row's deal-detail tag:
// a retired deal's own page renders its unavailable state, which requests no
// pricing. Card pages (/cards/[slug]) are NOT included here - see
// retirementInvalidationPlan and the pricing note in IMPLEMENTATION_STATUS.
function surfaceInvalidationPlan(rows, { dealPages = false } = {}) {
  const tags = new Set();
  const sets = new Set();
  const species = new Set();
  const marketplaces = new Set();
  let deals = 0;
  for (const r of rows ?? []) {
    if (!r) continue;
    tags.add(DEAL_LISTS_TAG);
    const m = allDealsTag(r.marketplace);
    if (m) {
      tags.add(m);
      marketplaces.add(r.marketplace);
    }
    const st = setDealsTag(r.card_set);
    if (st) {
      tags.add(st);
      sets.add(st);
    }
    const sp = r.card_name ? speciesDealsTag(require("./pokemonSpecies").extractSpecies(r.card_name)) : null;
    if (sp) {
      tags.add(sp);
      species.add(sp);
    }
    if (dealPages && r.id != null && !tags.has(dealDetailTag(r.id))) {
      tags.add(dealDetailTag(r.id));
      deals++;
    }
  }
  return { tags: [...tags], sets: sets.size, species: species.size, marketplaces: marketplaces.size, deals };
}

// Remediation scripts run outside Next, where tags cannot be expired. They
// queue the tags as insert-only catalog_snapshot rows; the authenticated
// sweep-stale-deals cron (every 30 min) expires and deletes them. No public
// endpoint; no provider call. Never throws.
const CACHE_INVALIDATION_KIND_PREFIX = "cache_invalidation:";
async function queueCacheInvalidation(db, tags, { source = "script", now = new Date().toISOString() } = {}) {
  const list = [...new Set((tags ?? []).filter(Boolean))];
  if (!db || list.length === 0) return { queued: 0, error: null };
  try {
    const kind = `${CACHE_INVALIDATION_KIND_PREFIX}${now}:${Math.random().toString(36).slice(2, 10)}`;
    const { error } = await db.from("catalog_snapshot").insert({ kind, data: { v: 1, tags: list, source: String(source).slice(0, 80), queuedAt: now }, updated_at: now });
    return error ? { queued: 0, error: error.message } : { queued: list.length, error: null };
  } catch (e) {
    return { queued: 0, error: e?.message ?? String(e) };
  }
}

// Called by sweep-stale-deals (every run, whether or not anything else was
// retired). Acknowledgement rules:
//   - only the rows read in THIS drain are considered, so a row queued while
//     the drain runs is left for the next run;
//   - each distinct tag is expired once; a row is deleted only when every one
//     of its tags was accepted by revalidateTag; a row with any failed tag is
//     kept and retried next run;
//   - a failed delete leaves the row, so its tags are expired again next run
//     (harmless).
// "Accepted" is all Next reports: revalidateTag records the tag and the route
// module applies it after the handler returns (pendingWaitUntil), with no
// completion result visible here. Never throws.
async function drainCacheInvalidationQueue(db, revalidate, { limit = 200 } = {}) {
  try {
    const { data, error } = await db.from("catalog_snapshot").select("kind, data").like("kind", `${CACHE_INVALIDATION_KIND_PREFIX}%`).order("kind").limit(limit);
    if (error) return { rows: 0, expired: 0, acknowledged: 0, retained: 0, errors: [error.message] };
    const rows = data ?? [];
    if (rows.length === 0) return { rows: 0, expired: 0, acknowledged: 0, retained: 0, errors: [] };
    const validTag = (t) => typeof t === "string" && t.length > 0 && t.length <= 256;
    const tagsOf = (r) => (Array.isArray(r?.data?.tags) ? r.data.tags.filter(validTag) : []);
    const failed = new Set();
    let expired = 0;
    const errors = [];
    for (const tag of new Set(rows.flatMap(tagsOf))) {
      const out = expireTags(revalidate, [tag]);
      expired += out.expired;
      if (out.errors.length) {
        failed.add(tag);
        errors.push(...out.errors);
      }
    }
    const done = rows.filter((r) => tagsOf(r).every((t) => !failed.has(t))).map((r) => r.kind);
    let acknowledged = 0;
    if (done.length) {
      const { error: delError } = await db.from("catalog_snapshot").delete().in("kind", done);
      if (delError) errors.push(delError.message);
      else acknowledged = done.length;
    }
    return { rows: rows.length, expired, acknowledged, retained: rows.length - acknowledged, errors };
  } catch (e) {
    return { rows: 0, expired: 0, acknowledged: 0, retained: 0, errors: [e?.message ?? String(e)] };
  }
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
  SIGHTING_KEY_COLUMNS,
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
  insertNewSighting,
  writeGuardedSighting,
  REASON_REPLACEABLE_OR,
  retireForAvailability,
  recoveryDecision,
  isPositiveActiveConfirmation,
  listingAvailabilityEvidence,
  cardOffersTags,
  dealDetailTag,
  retirementInvalidationPlan,
  expireTags,
  DEAL_LISTS_TAG,
  tagSlug,
  allDealsTag,
  setDealsTag,
  speciesDealsTag,
  surfaceInvalidationPlan,
  CACHE_INVALIDATION_KIND_PREFIX,
  queueCacheInvalidation,
  drainCacheInvalidationQueue,
};
