// APPEND-ONLY LISTING OBSERVATION LOG (SEO-2.5).
//
// Records what the deal system already concluded about a listing, once per
// UTC day, so that market history stops being thrown away.
//
// WHY IT IS NEEDED. `deals` carries one row per (source, marketplace,
// listing_id) and is upserted with ignoreDuplicates, so a re-sighting of a
// fixed-price listing writes nothing: its price, reference and discount are
// frozen at first sighting and every later state is lost. An auction is the
// opposite problem - verify-deals overwrites the row in place as bids come
// in, so earlier bids are lost. Measured 2026-09-16: 28,927 listing rows,
// zero observation history.
//
// THREE RULES THIS MODULE OBEYS.
//
//   1. NON-AUTHORITATIVE. Nothing here decides anything. It copies fields
//      the caller already computed. It never re-derives a discount, never
//      re-resolves identity and is never read by a serving or scanning path.
//   2. NEVER BREAKS A SCAN. Every write is wrapped; a failure returns an
//      outcome, never throws. A missing table (the migration not yet run)
//      is an expected, silent outcome rather than an error.
//   3. NO PERSONAL DATA. `core` carries seller_username and
//      seller_feedback_pct. Neither is copied here, deliberately: this log
//      is about listings and prices, and speculative future research is not
//      a reason to retain identity data.

const { isMissingObservationTableError } = require("./listingObservationsDb");

// The exact fields copied from a normalised listing. Anything not on this
// list is not stored - which is how the privacy rule above is enforced by
// construction rather than by memory.
const OBSERVATION_FIELDS = Object.freeze([
  "watchlist_id",
  "price",
  "shipping",
  "total_price",
  "total_price_usd",
  "currency",
  "market_price",
  "discount_pct",
  "reference_amount",
  "reference_currency",
  "reference_source",
  "reference_observed_at",
  "listing_type",
  "condition",
  "is_graded",
  "grader",
  "grade",
  "card_language",
  "is_active",
  "disqualified_reason",
  "visual_authenticity_status",
  "exact_verified_at",
  "first_seen_at",
]);

// Fields that must NEVER reach this table, asserted by tests.
const FORBIDDEN_FIELDS = Object.freeze(["seller_username", "seller_feedback_pct", "title", "image_urls", "affiliate_url", "listing_url"]);

const OBSERVATION_KINDS = Object.freeze(["daily", "transition", "backfill"]);

function utcDay(at) {
  const d = at instanceof Date ? at : new Date(at ?? Date.now());
  return Number.isNaN(d.getTime()) ? new Date().toISOString().slice(0, 10) : d.toISOString().slice(0, 10);
}

// Build the row. PURE - no clock beyond the injected `now`, no I/O - so the
// projection is unit-testable without a database.
function buildObservation(core, { kind = "daily", now = Date.now() } = {}) {
  if (!core?.source || !core?.marketplace || !core?.listing_id) return null;
  if (!OBSERVATION_KINDS.includes(kind)) return null;
  const observedAt = new Date(now).toISOString();
  const row = {
    source: core.source,
    marketplace: core.marketplace,
    listing_id: String(core.listing_id),
    observed_at: observedAt,
    observation_date: utcDay(observedAt),
    kind,
  };
  for (const f of OBSERVATION_FIELDS) {
    if (core[f] !== undefined) row[f] = core[f];
  }
  return row;
}

// Write one observation. Returns an outcome; never throws.
//
//   "written"    a new row landed
//   "duplicate"  today's daily observation already exists (the common case -
//                the scanner re-sights an active listing many times a day)
//   "absent"     the table has not been migrated yet
//   "skipped"    the row could not be built
//   "error"      anything else, surfaced for monitoring but not fatal
async function recordObservation(db, core, opts = {}) {
  const row = buildObservation(core, opts);
  if (!row) return { outcome: "skipped", error: null };
  try {
    // ignoreDuplicates leans on the partial unique index: a repeat daily
    // observation is silently dropped by Postgres rather than by a read
    // first, so a busy scan costs one insert attempt and no extra query.
    const { data, error } = await db
      .from("listing_observations")
      .upsert(row, { onConflict: "source,marketplace,listing_id,observation_date", ignoreDuplicates: true })
      .select("id");
    if (error) {
      if (isMissingObservationTableError(error)) return { outcome: "absent", error: null };
      return { outcome: "error", error };
    }
    return { outcome: (data ?? []).length > 0 ? "written" : "duplicate", error: null };
  } catch (e) {
    return { outcome: "error", error: e };
  }
}

module.exports = {
  OBSERVATION_FIELDS,
  FORBIDDEN_FIELDS,
  OBSERVATION_KINDS,
  utcDay,
  buildObservation,
  recordObservation,
};
