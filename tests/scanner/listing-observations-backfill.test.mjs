// SEO-2.5.2 - the backfill snapshot, made idempotent.
//
// The preview audit found the write path carried the same defect live
// capture had just been repaired for: `.upsert(..., { onConflict })` against
// a PARTIAL index, which fails 42P10 every time. Removing the conflict
// clause alone would have been worse - the only unique index was partial on
// kind='daily', so backfill rows had no constraint at all and a second run
// would have inserted a second copy of all ~29,000 rows.
//
// These tests pin the repaired contract: the database is the authority, a
// rejected batch never loses the new rows travelling with it, and nothing
// here ever updates, deletes or touches a live daily observation.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => readFileSync(join(ROOT, p), "utf8");
const require = createRequire(import.meta.url);
const { buildObservation } = require("../../lib/listingObservations.js");
const {
  DAILY_UNIQUE_CONSTRAINT,
  BACKFILL_UNIQUE_CONSTRAINT,
  isBackfillDuplicateError,
  isDailyDuplicateError,
} = require("../../lib/listingObservationsDb.js");
const {
  backfillKey,
  planBackfill,
  fetchExistingBackfillKeys,
  writeBackfillObservations,
} = require("../../lib/listingObservationsBackfill.js");

// --- a database that behaves like the real one --------------------------
//
// Models BOTH partial unique indexes and, critically, INSERT atomicity: one
// colliding row rejects the entire statement and writes none of it. It also
// refuses to be updated or deleted, so any such call fails the test rather
// than passing silently.
function fakeDb(seed = [], { failEveryNth = 0 } = {}) {
  const rows = seed.map((r, i) => ({ id: i + 1, ...r }));
  const ops = [];
  let nextId = rows.length + 1;
  let statements = 0;

  const uniq = (r) => {
    if (r.kind !== "daily" && r.kind !== "backfill") return null; // transition rows are unconstrained
    return `${r.kind}:${r.source}|${r.marketplace}|${r.listing_id}|${r.observation_date}`;
  };
  const constraintFor = (r) => (r.kind === "daily" ? DAILY_UNIQUE_CONSTRAINT : BACKFILL_UNIQUE_CONSTRAINT);

  const api = {
    rows,
    ops,
    get statements() {
      return statements;
    },
    snapshot: () => rows.map((r) => ({ ...r })),
    from(table) {
      return {
        insert(payload) {
          const batch = Array.isArray(payload) ? payload : [payload];
          ops.push({ op: "insert", table, count: batch.length });
          return {
            select: async () => {
              statements += 1;
              if (failEveryNth && statements % failEveryNth === 0) {
                return { data: null, error: { code: "08006", message: "connection failure" } };
              }
              // one statement: validate the WHOLE batch before writing any of it
              const live = new Set(rows.map(uniq).filter(Boolean));
              for (const r of batch) {
                const k = uniq(r);
                if (!k) continue;
                if (live.has(k)) {
                  return {
                    data: null,
                    error: {
                      code: "23505",
                      message: `duplicate key value violates unique constraint "${constraintFor(r)}"`,
                    },
                  };
                }
                live.add(k);
              }
              const inserted = batch.map((r) => ({ ...r, id: nextId++ }));
              rows.push(...inserted);
              return { data: inserted.map((r) => ({ id: r.id })), error: null };
            },
          };
        },
        select(cols) {
          ops.push({ op: "select", table, cols });
          const q = { _kind: null, _from: 0, _to: Infinity };
          q.eq = (col, val) => {
            if (col === "kind") q._kind = val;
            return q;
          };
          q.order = () => q;
          q.range = async (from, to) => {
            const matched = rows.filter((r) => (q._kind == null ? true : r.kind === q._kind));
            return { data: matched.slice(from, to + 1).map((r) => ({ ...r })), error: null };
          };
          return q;
        },
        update() {
          ops.push({ op: "update", table });
          throw new Error("the observation log must never be UPDATEd");
        },
        delete() {
          ops.push({ op: "delete", table });
          throw new Error("the observation log must never be DELETEd from");
        },
      };
    },
  };
  return api;
}

const deal = (over = {}) => ({
  source: "ebay",
  marketplace: "EBAY_US",
  listing_id: "v1|100000000001|0",
  watchlist_id: 91,
  price: 26.5,
  shipping: 4.25,
  total_price: 30.75,
  currency: "USD",
  market_price: 38.26,
  discount_pct: 0.196,
  listing_type: "FIXED_PRICE",
  condition: "Near Mint",
  is_graded: false,
  card_language: "english",
  is_active: false,
  first_seen_at: "2026-08-26T01:00:00.000Z",
  last_seen_at: "2026-09-01T09:00:00.000Z",
  ...over,
});

const snapshot = (over = {}) => {
  const d = deal(over);
  return buildObservation(d, { kind: "backfill", now: Date.parse(d.last_seen_at) });
};

const manySnapshots = (n, dayOffset = 0) =>
  Array.from({ length: n }, (_, i) =>
    snapshot({
      listing_id: `v1|10000000${String(i).padStart(4, "0")}|0`,
      last_seen_at: new Date(Date.parse("2026-09-01T09:00:00.000Z") + dayOffset * 86400000).toISOString(),
    })
  );

// --- 1. first application ------------------------------------------------

test("1. a first backfill inserts every eligible row", async () => {
  const db = fakeDb();
  const rows = manySnapshots(1200);
  const tally = await writeBackfillObservations(db, rows);
  assert.equal(tally.inserted, 1200);
  assert.equal(tally.duplicate, 0);
  assert.equal(tally.skipped, 0);
  assert.equal(tally.failed, 0);
  assert.equal(db.rows.length, 1200);
  assert.equal(db.statements, 3, "1200 rows in batches of 500, not 1200 statements");
  assert.ok(db.rows.every((r) => r.kind === "backfill"));
});

// --- 2. duplicates ------------------------------------------------------

test("2. a repeated backfill row is suppressed as a duplicate, not an error", async () => {
  const row = snapshot();
  const db = fakeDb([row]);
  // no skip list: force the write through the constraint itself
  const tally = await writeBackfillObservations(db, [row], { existingKeys: null });
  assert.equal(tally.inserted, 0);
  assert.equal(tally.duplicate, 1);
  assert.equal(tally.failed, 0);
  assert.equal(db.rows.length, 1, "no second copy");
  assert.equal(
    isBackfillDuplicateError({ code: "23505", message: `violates "${BACKFILL_UNIQUE_CONSTRAINT}"` }),
    true
  );
  // narrow: someone else's 23505 is still a real failure
  assert.equal(isBackfillDuplicateError({ code: "23505", message: 'violates "deals_unique_listing"' }), false);
  assert.equal(isBackfillDuplicateError({ code: "42P10", message: BACKFILL_UNIQUE_CONSTRAINT }), false);
  // and the two detectors do not answer for each other
  assert.equal(isDailyDuplicateError({ code: "23505", message: `violates "${BACKFILL_UNIQUE_CONSTRAINT}"` }), false);
  assert.equal(isBackfillDuplicateError({ code: "23505", message: `violates "${DAILY_UNIQUE_CONSTRAINT}"` }), false);
});

test("3. ONE duplicate must not cost the 499 new rows sharing its batch", async () => {
  // the whole point of bisecting: a multi-row INSERT is atomic, so a batch
  // rejected for one collision would otherwise lose every new row in it
  const rows = manySnapshots(500);
  const db = fakeDb([rows[250]]);
  const tally = await writeBackfillObservations(db, rows, { existingKeys: null });
  assert.equal(tally.inserted, 499);
  assert.equal(tally.duplicate, 1);
  assert.equal(tally.failed, 0);
  assert.equal(db.rows.length, 500, "exactly one row per natural key");
  const keys = db.rows.map(backfillKey);
  assert.equal(new Set(keys).size, 500);
  assert.ok(db.statements < 60, `bisecting should cost ~19 statements, took ${db.statements}`);
});

// --- 4. coexistence with live capture -----------------------------------

test("4. a daily and a backfill row coexist for the same listing and day", async () => {
  const d = deal({ last_seen_at: "2026-09-16T09:00:00.000Z" });
  const daily = buildObservation(d, { kind: "daily", now: Date.parse("2026-09-16T11:00:35.463Z") });
  const back = buildObservation(d, { kind: "backfill", now: Date.parse(d.last_seen_at) });
  assert.equal(daily.observation_date, back.observation_date);
  assert.equal(backfillKey(daily), backfillKey(back), "same natural key, different kind");

  const db = fakeDb([daily]);
  const tally = await writeBackfillObservations(db, [back], { existingKeys: null });
  assert.equal(tally.inserted, 1, "the partial indexes are per-kind, so this is not a collision");
  assert.equal(db.rows.length, 2);
  assert.deepEqual(db.rows.map((r) => r.kind).sort(), ["backfill", "daily"]);
});

test("5. transition rows are unconstrained and untouched by the backfill", async () => {
  const d = deal({ last_seen_at: "2026-09-16T09:00:00.000Z" });
  const t1 = buildObservation(d, { kind: "transition", now: Date.parse("2026-09-16T12:00:00Z") });
  const t2 = buildObservation(d, { kind: "transition", now: Date.parse("2026-09-16T18:00:00Z") });
  const db = fakeDb([t1, t2]);
  const before = db.snapshot();
  const tally = await writeBackfillObservations(db, [buildObservation(d, { kind: "backfill", now: Date.parse(d.last_seen_at) })], {
    existingKeys: null,
  });
  assert.equal(tally.inserted, 1);
  assert.equal(db.rows.filter((r) => r.kind === "transition").length, 2, "both same-day transitions survive");
  assert.deepEqual(db.rows.filter((r) => r.kind === "transition"), before, "byte-identical");
  // and the migration keeps them exempt by construction
  const sql = read("supabase/listing_observations_backfill_uniq_migration.sql");
  assert.match(sql, /WHERE kind = 'backfill'/);
  assert.doesNotMatch(sql.replace(/^\s*--.*$/gm, ""), /WHERE kind = 'daily'/, "must not redefine the daily index");
});

// --- 6. re-running and resuming -----------------------------------------

test("6. re-running a completed backfill inserts nothing", async () => {
  const rows = manySnapshots(1000);
  const db = fakeDb();
  await writeBackfillObservations(db, rows);
  assert.equal(db.rows.length, 1000);

  const { keys } = await fetchExistingBackfillKeys(db);
  const statementsBefore = db.statements;
  const second = await writeBackfillObservations(db, rows, { existingKeys: keys });
  assert.equal(second.inserted, 0);
  assert.equal(second.skipped, 1000);
  assert.equal(second.failed, 0);
  assert.equal(db.rows.length, 1000, "no second copy of the snapshot");
  assert.equal(db.statements, statementsBefore, "a completed backfill issues no INSERT at all");
});

test("7. a re-run with NO skip list still inserts nothing - the constraint is the guarantee", async () => {
  const rows = manySnapshots(40);
  const db = fakeDb();
  await writeBackfillObservations(db, rows, { chunkSize: 20 });
  const second = await writeBackfillObservations(db, rows, { existingKeys: null, chunkSize: 20 });
  assert.equal(second.inserted, 0);
  assert.equal(second.duplicate, 40, "every row rejected by listing_observations_backfill_uniq");
  assert.equal(db.rows.length, 40);
});

test("8. an interrupted backfill resumes and converges on exactly one row per key", async () => {
  const rows = manySnapshots(300);
  const db = fakeDb();
  // interrupted after the first 120 rows
  await writeBackfillObservations(db, rows.slice(0, 120), { chunkSize: 40 });
  assert.equal(db.rows.length, 120);

  // resume with the full set, as the script does
  const { keys } = await fetchExistingBackfillKeys(db);
  const resumed = await writeBackfillObservations(db, rows, { existingKeys: keys, chunkSize: 40 });
  assert.equal(resumed.skipped, 120);
  assert.equal(resumed.inserted, 180);
  assert.equal(db.rows.length, 300);
  assert.equal(new Set(db.rows.map(backfillKey)).size, 300, "exactly one backfill row per natural key");

  // a third run is a no-op
  const { keys: keys2 } = await fetchExistingBackfillKeys(db);
  const third = await writeBackfillObservations(db, rows, { existingKeys: keys2 });
  assert.equal(third.inserted, 0);
  assert.equal(db.rows.length, 300);
});

test("9. a failed batch is retried by the next run, not silently counted as done", async () => {
  const rows = manySnapshots(100);
  const db = fakeDb([], { failEveryNth: 2 }); // every 2nd statement is a connection failure
  const first = await writeBackfillObservations(db, rows, { chunkSize: 25 });
  assert.ok(first.failed > 0, "a real error must be surfaced, not swallowed");
  assert.ok(first.firstError);
  const writtenSoFar = db.rows.length;
  assert.ok(writtenSoFar > 0 && writtenSoFar < 100);

  const healthy = fakeDb(db.snapshot());
  const { keys } = await fetchExistingBackfillKeys(healthy);
  const second = await writeBackfillObservations(healthy, rows, { existingKeys: keys });
  assert.equal(healthy.rows.length, 100, "the failed rows are exactly what the re-run writes");
  assert.equal(second.failed, 0);
  assert.equal(new Set(healthy.rows.map(backfillKey)).size, 100);
});

// --- 10. what the backfill must never do --------------------------------

test("10. no daily row is modified by a backfill run", async () => {
  const d1 = buildObservation(deal({ listing_id: "v1|100000000001|0" }), { kind: "daily", now: Date.parse("2026-09-16T11:00:00Z") });
  const d2 = buildObservation(deal({ listing_id: "v1|100000000002|0" }), { kind: "daily", now: Date.parse("2026-09-16T11:15:00Z") });
  const db = fakeDb([d1, d2]);
  const before = db.snapshot().filter((r) => r.kind === "daily");

  const rows = [
    snapshot({ listing_id: "v1|100000000001|0", last_seen_at: "2026-09-16T11:00:00.000Z" }),
    snapshot({ listing_id: "v1|100000000002|0", last_seen_at: "2026-09-16T11:15:00.000Z" }),
    ...manySnapshots(50),
  ];
  await writeBackfillObservations(db, rows, { existingKeys: null });

  const after = db.snapshot().filter((r) => r.kind === "daily");
  assert.deepEqual(after, before, "live daily observations are byte-identical after the backfill");
  assert.equal(after.length, 2);
});

test("11. the writer issues only INSERTs - never UPDATE, never DELETE", async () => {
  const db = fakeDb([snapshot()]);
  await writeBackfillObservations(db, manySnapshots(60), { chunkSize: 20 });
  assert.equal(db.ops.filter((o) => o.op === "update").length, 0);
  assert.equal(db.ops.filter((o) => o.op === "delete").length, 0);

  for (const f of ["lib/listingObservationsBackfill.js", "scripts/backfillListingObservations.mjs"]) {
    const code = read(f).replace(/^\s*\/\/.*$/gm, "");
    assert.doesNotMatch(code, /\.update\(/, `${f} must never update an observation`);
    assert.doesNotMatch(code, /\.delete\(/, `${f} must never delete an observation`);
    assert.doesNotMatch(code, /\.upsert\(/, `${f} must not reintroduce the upsert`);
    assert.doesNotMatch(code, /onConflict/, `${f} must not target a partial index with ON CONFLICT`);
    assert.doesNotMatch(code, /ignoreDuplicates/);
  }
  const code = read("lib/listingObservationsBackfill.js").replace(/^\s*\/\/.*$/gm, "");
  assert.match(code, /\.from\(TABLE\)\.insert\(chunk\)/, "plain insert");
});

test("12. the skip list is one bounded scan, not a SELECT per row", async () => {
  const db = fakeDb(manySnapshots(2500));
  const { keys, error } = await fetchExistingBackfillKeys(db);
  assert.equal(error, null);
  assert.equal(keys.size, 2500);
  const selects = db.ops.filter((o) => o.op === "select").length;
  assert.equal(selects, 3, "2500 keys in pages of 1000");
  // and it reads keys only - never the payload
  assert.equal(db.ops.find((o) => o.op === "select").cols, "source,marketplace,listing_id,observation_date");
});

test("13. a duplicate inside the proposed set itself is collapsed before writing", () => {
  const row = snapshot();
  const { pending, skipped } = planBackfill([row, { ...row }, snapshot({ listing_id: "v1|100000000099|0" })]);
  assert.equal(pending.length, 2);
  assert.equal(skipped.length, 1, "one run must not fight its own batches");
});

test("14. nothing that serves or scans reads the backfill layer", async () => {
  for (const f of [
    "lib/deals.js",
    "lib/dealQuality.js",
    "lib/browseBudget.js",
    "lib/catalogAggregates.js",
    "lib/sitemap.js",
    "lib/listingAvailability.js",
    "lib/listingObservations.js",
    "app/api/refresh-deals/route.js",
    "app/api/verify-deals/route.js",
  ]) {
    assert.doesNotMatch(read(f), /listingObservationsBackfill/, `${f} must not depend on the backfill mechanism`);
  }
  // and live capture is untouched by this repair: still the plain daily insert
  const live = read("lib/listingObservations.js").replace(/^\s*\/\/.*$/gm, "");
  assert.match(live, /\.from\("listing_observations"\)\.insert\(row\)/);
  assert.doesNotMatch(live, /backfill_uniq/);
});

test("15. the migration is additive and leaves the daily index alone", () => {
  const sql = read("supabase/listing_observations_backfill_uniq_migration.sql");
  assert.match(sql, /CREATE UNIQUE INDEX IF NOT EXISTS listing_observations_backfill_uniq/);
  assert.match(sql, /ON listing_observations \(source, marketplace, listing_id, observation_date\)/);
  const stmts = sql.replace(/^\s*--.*$/gm, "").replace(/COMMENT ON [\s\S]*?;/g, "");
  for (const destructive of [/\bDROP\b/, /\bALTER TABLE\b/, /\bDELETE\b/, /\bTRUNCATE\b/, /\bUPDATE\b/, /\bCREATE TABLE\b/]) {
    assert.doesNotMatch(stmts, destructive, `migration must not execute ${destructive}`);
  }
  // the daily index may only be NAMED by the read-only verification SELECT,
  // never by a statement that creates, drops or alters it
  const ddl = stmts.replace(/SELECT[\s\S]*?;/gi, "");
  assert.doesNotMatch(ddl, /listing_observations_daily_uniq/, "the daily index must not be redefined");
  assert.match(stmts, /FROM pg_indexes/, "the file ends with a verification SELECT");
  // the original migration is untouched
  const original = read("supabase/listing_observations_migration.sql");
  assert.match(original, /CREATE UNIQUE INDEX IF NOT EXISTS listing_observations_daily_uniq/);
  assert.match(original, /WHERE kind = 'daily'/);
});

test("16. --apply is gated on the migration being run", () => {
  const src = read("scripts/backfillListingObservations.mjs");
  assert.match(src, /BACKFILL_UNIQUE_CONSTRAINT/);
  assert.match(src, /listing_observations_backfill_uniq_migration\.sql/);
  // the preview path still writes nothing
  const applyGuard = src.slice(src.indexOf("if (!APPLY)"), src.indexOf("// RESUME."));
  assert.match(applyGuard, /nothing written/);
  assert.match(applyGuard, /return;/);
});
