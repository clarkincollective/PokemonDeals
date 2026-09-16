// SEO-2.5 - the "the observation table is not migrated yet" error, isolated.
//
// Same narrow pattern as lib/referenceProvenanceDb's missing-column check,
// and narrow for the same reason: only the specific "relation does not
// exist" shape counts. A permission error, an RLS refusal, a network blip
// or a constraint violation must stay visible as an error rather than be
// quietly read as "not migrated", or the observation log could silently
// record nothing for weeks and nobody would know.
//
//   42P01  undefined_table       "relation \"listing_observations\" does not exist"
//   PGRST205                     PostgREST schema cache has no such table
const TABLE = "listing_observations";

function isMissingObservationTableError(error) {
  if (!error) return false;
  const code = String(error.code ?? "");
  const message = String(error.message ?? "");
  if (code !== "42P01" && code !== "PGRST205") return false;
  return new RegExp(`\\b${TABLE}\\b`).test(message);
}

// SEO-2.5.1 - the daily-uniqueness violation, which is the EXPECTED outcome
// for the common case: the scanner re-sights an active listing many times a
// day and only the first sighting may be stored.
//
// Why this replaced an upsert. The daily index is PARTIAL
// (WHERE kind = 'daily') so that deliberate transition rows stay possible.
// PostgreSQL cannot infer a partial unique index as an ON CONFLICT target
// unless the statement repeats the index predicate, and PostgREST has no way
// to express it, so `.upsert(..., { onConflict })` failed every single time
// with 42P10 and the log recorded nothing for its first 25 minutes in
// production. A plain INSERT lets the database enforce exactly the same
// constraint and report the collision as 23505 instead.
//
// Deliberately narrow, and checked against the CONSTRAINT NAME, not just the
// code: a 23505 from any other unique constraint is a real error and must
// stay visible rather than be silently counted as a routine duplicate.
const DAILY_UNIQUE_CONSTRAINT = "listing_observations_daily_uniq";

function isDailyDuplicateError(error) {
  if (!error) return false;
  if (String(error.code ?? "") !== "23505") return false;
  const haystack = `${error.message ?? ""} ${error.details ?? ""} ${error.constraint ?? ""}`;
  return haystack.includes(DAILY_UNIQUE_CONSTRAINT);
}

// SEO-2.5.2 - the same shape for the one-off backfill snapshot.
//
// listing_observations_backfill_uniq is PARTIAL on kind='backfill', so it
// constrains the snapshot and nothing else: a backfill row can never collide
// with a live daily row, and transition rows stay unconstrained. For the
// backfill writer a 23505 from THIS index means "this listing/day was
// already snapshotted", which is the idempotent outcome a re-run or a resume
// after an interruption must produce - not an error.
//
// Narrow for the same reason as the daily detector: matched on the
// constraint name, so a 23505 from anything else stays a visible failure.
const BACKFILL_UNIQUE_CONSTRAINT = "listing_observations_backfill_uniq";

function isBackfillDuplicateError(error) {
  if (!error) return false;
  if (String(error.code ?? "") !== "23505") return false;
  const haystack = `${error.message ?? ""} ${error.details ?? ""} ${error.constraint ?? ""}`;
  return haystack.includes(BACKFILL_UNIQUE_CONSTRAINT);
}

module.exports = {
  TABLE,
  DAILY_UNIQUE_CONSTRAINT,
  BACKFILL_UNIQUE_CONSTRAINT,
  isMissingObservationTableError,
  isDailyDuplicateError,
  isBackfillDuplicateError,
};
