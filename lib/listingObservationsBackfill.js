// SEO-2.5.2 - THE BACKFILL WRITE MECHANISM, made idempotent.
//
// Used by scripts/backfillListingObservations.mjs only. Nothing that serves
// a page, qualifies a deal, prices a listing, screens a card or allocates
// scanner budget imports this file, and live daily capture
// (lib/listingObservations.js) does not either.
//
// WHAT WENT WRONG THE FIRST TIME. The backfill wrote with
// `.upsert(slice, { onConflict: "source,marketplace,listing_id,observation_date" })`
// - the identical statement shape that made live capture fail with 42P10,
// because the target index is PARTIAL and PostgreSQL cannot infer a partial
// index as an ON CONFLICT target unless the statement repeats its predicate,
// which PostgREST cannot express. Worse, that index is partial on
// kind='daily', so it never constrained backfill rows at all: with the
// conflict clause simply removed, a second run would have inserted a second
// copy of all ~29,000 rows.
//
// THE REPAIR HAS TWO HALVES, and both are needed:
//
//   1. THE DATABASE IS THE AUTHORITY. A new partial unique index on
//      kind='backfill' (supabase/listing_observations_backfill_uniq_migration.sql)
//      makes "one backfill row per listing per day" a constraint rather than
//      a hope. Rows are inserted PLAINLY; a 23505 from that index means the
//      row is already there, which is success for an idempotent job.
//   2. THE SKIP LIST IS ONLY AN OPTIMISATION. Before a re-run or a resume,
//      the keys already snapshotted are read ONCE, in pages, and matching
//      rows are dropped before any insert. This is a single bounded scan of
//      the backfill keyspace - not a SELECT per row - and it exists purely
//      so a completed backfill re-runs in seconds instead of issuing tens of
//      thousands of doomed statements. If it is stale, wrong or skipped
//      entirely, the constraint above still produces the same final state.
//
// BATCH ATOMICITY IS THE SUBTLE PART. A multi-row INSERT is one statement:
// if a single row in a batch of 500 violates the constraint, PostgreSQL
// rejects the WHOLE batch and the other 499 new rows are lost. So a batch
// that comes back 23505 is never counted as "500 duplicates" - it is SPLIT
// IN HALF and retried, recursively, until each collision is isolated to a
// batch of one. Every non-colliding row in that batch is therefore still
// written, and a partially-applied backfill converges on exactly one row per
// natural key however many times it is interrupted and resumed.
//
// NEVER UPDATES. NEVER DELETES. The only statement this module issues
// against listing_observations is INSERT (plus the paged key read above).

const { isBackfillDuplicateError, isMissingObservationTableError } = require("./listingObservationsDb");

const TABLE = "listing_observations";
const BACKFILL_KIND = "backfill";
// One statement per 500 rows: large enough that ~29,000 rows are ~59 round
// trips, small enough that an isolated collision costs ~18 extra statements
// to bisect rather than hundreds.
const DEFAULT_CHUNK = 500;
const KEY_PAGE = 1000;

// The natural key the backfill index is built on.
function backfillKey(row) {
  return `${row?.source}|${row?.marketplace}|${row?.listing_id}|${row?.observation_date}`;
}

// READ ONCE, not per row. Returns the set of listing/day keys that already
// carry a backfill row, or null if the read failed - in which case the
// caller proceeds without a skip list and lets the constraint do the work.
async function fetchExistingBackfillKeys(db, { pageSize = KEY_PAGE } = {}) {
  const keys = new Set();
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await db
      .from(TABLE)
      .select("source,marketplace,listing_id,observation_date")
      .eq("kind", BACKFILL_KIND)
      .order("id", { ascending: true })
      .range(from, from + pageSize - 1);
    if (error) return { keys: null, error };
    for (const row of data ?? []) keys.add(backfillKey(row));
    if ((data ?? []).length < pageSize) break;
  }
  return { keys, error: null };
}

// Split the built rows into what still needs writing and what is already
// snapshotted. Also collapses any duplicate natural key inside the proposed
// set itself, so one run can never fight its own batches.
function planBackfill(rows, existingKeys = null) {
  const pending = [];
  const skipped = [];
  const seen = new Set();
  for (const row of rows ?? []) {
    const key = backfillKey(row);
    if (existingKeys?.has(key) || seen.has(key)) {
      skipped.push(row);
      continue;
    }
    seen.add(key);
    pending.push(row);
  }
  return { pending, skipped };
}

function newBackfillTally(attempted = 0) {
  return { attempted, inserted: 0, duplicate: 0, failed: 0, skipped: 0, statements: 0, firstError: null };
}

async function insertChunk(db, chunk) {
  try {
    // PLAIN INSERT. No onConflict, no ignoreDuplicates, no pre-read.
    return await db.from(TABLE).insert(chunk).select("id");
  } catch (e) {
    return { data: null, error: e };
  }
}

// Write one batch, bisecting on a duplicate so that the new rows travelling
// with it are not lost to the rejected statement.
async function writeChunk(db, chunk, tally) {
  if (!chunk.length) return;
  tally.statements += 1;
  const { data, error } = await insertChunk(db, chunk);

  if (!error) {
    tally.inserted += (data ?? []).length || chunk.length;
    return;
  }

  if (isBackfillDuplicateError(error)) {
    if (chunk.length === 1) {
      // isolated: this exact listing/day is already snapshotted
      tally.duplicate += 1;
      return;
    }
    const mid = Math.ceil(chunk.length / 2);
    await writeChunk(db, chunk.slice(0, mid), tally);
    await writeChunk(db, chunk.slice(mid), tally);
    return;
  }

  // Anything else - a missing table, a permission refusal, a network blip -
  // stays visible. The rows are counted as failed rather than written, and
  // a later re-run will retry exactly them.
  tally.failed += chunk.length;
  if (!tally.firstError) {
    tally.firstError = String(error?.code ?? error?.message ?? error).slice(0, 160);
  }
  tally.fatal = tally.fatal || isMissingObservationTableError(error);
}

// Write the snapshot. `rows` are already-built kind='backfill' observations.
async function writeBackfillObservations(db, rows, { chunkSize = DEFAULT_CHUNK, existingKeys = null, onProgress = null } = {}) {
  const { pending, skipped } = planBackfill(rows, existingKeys);
  const tally = newBackfillTally(rows?.length ?? 0);
  tally.skipped = skipped.length;
  for (let i = 0; i < pending.length; i += chunkSize) {
    await writeChunk(db, pending.slice(i, i + chunkSize), tally);
    if (tally.fatal) break;
    onProgress?.({ done: Math.min(i + chunkSize, pending.length), total: pending.length, tally });
  }
  return tally;
}

module.exports = {
  TABLE,
  BACKFILL_KIND,
  DEFAULT_CHUNK,
  backfillKey,
  fetchExistingBackfillKeys,
  planBackfill,
  newBackfillTally,
  writeBackfillObservations,
};
