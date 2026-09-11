// EBAY-14R - FAILURE ISOLATION. A broken telemetry path (missing
// ebay_job_runs table, failing insert, throwing client, no client at all)
// must never abort a scan, suppress a valid deal write, or change a
// route's outcome. Exercised with fake failing DBs - no production fault
// injection - plus static checks that every route keeps the telemetry
// inside try/finally and re-throws its own errors unchanged.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const require = createRequire(import.meta.url);
const t = require(join(REPO, "lib", "ebayTelemetry.js"));
const read = (p) => readFileSync(join(REPO, p), "utf8");

// Fake DB shapes a real outage can produce.
const dbs = {
  fromThrows: { from: () => { throw new Error("relation \"ebay_job_runs\" does not exist"); } },
  insertRejects: { from: () => ({ insert: async () => { throw new Error("network down"); } }) },
  insertReturnsError: { from: () => ({ insert: async () => ({ data: null, error: { code: "42P01", message: "table missing" } }) }) },
  insertHangsThenRejects: { from: () => ({ insert: () => new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), 20)) }) },
  notAClient: { from: "nope" },
  nullClient: null,
  undefinedClient: undefined,
};

// Simulates a route body: telemetry around real work, with the work's own
// result/throw being what the caller must observe unchanged.
async function routeLike(db, work) {
  const ctx = t.beginJobRun({ job: "verify-deals", mode: "test" });
  try {
    t.setQuotaSnapshot({ remainingStart: 4000, limit: 5000, reserveFloor: 800 });
    const out = await work();
    return { ok: true, out };
  } catch (err) {
    t.markError(err);
    throw err;
  } finally {
    await t.finishJobRun(db, ctx);
  }
}

test("1. every failing-DB shape is swallowed: the route result is returned unchanged and nothing throws out of finally", async () => {
  const origError = console.error; const logged = [];
  console.error = (...a) => logged.push(a.join(" "));
  try {
    for (const [name, db] of Object.entries(dbs)) {
      let writes = 0;
      const res = await routeLike(db, async () => { t.recordBrowseCall(); writes++; return { deals_upserted: 3 }; });
      assert.deepEqual(res, { ok: true, out: { deals_upserted: 3 } }, `${name}: route outcome changed`);
      assert.equal(writes, 1, `${name}: the real work did not run exactly once`);
    }
  } finally { console.error = origError; }
  assert.ok(logged.some((l) => /telemetry persist failed \(non-fatal\)/.test(l)), "a failing persist is logged, never raised");
});

test("2. a route's OWN error still propagates exactly as before (telemetry re-throws, then fails closed on persist)", async () => {
  const origError = console.error; console.error = () => {};
  try {
    for (const [name, db] of Object.entries(dbs)) {
      await assert.rejects(routeLike(db, async () => { throw new Error("eBay 503"); }), /eBay 503/, `${name}: original error was replaced`);
    }
  } finally { console.error = origError; }
});

test("3. a route-level Response value is preserved through a failing finally (quota-skip / early-return shape)", async () => {
  const origError = console.error; console.error = () => {};
  try {
    const skip = { ok: true, skipped: "quota_reserve", remaining: 700 };
    const ctx = t.beginJobRun({ job: "screen-deal-images" });
    const result = await (async () => { try { t.markSkipped("quota_reserve"); return skip; } finally { await t.finishJobRun(dbs.fromThrows, ctx); } })();
    assert.strictEqual(result, skip);
  } finally { console.error = origError; }
});

test("4. accounting helpers never throw - with or without a context, with garbage input", () => {
  for (const fn of [t.recordBrowseCall, t.recordAnalyticsCall, t.recordGradedDetailCall, t.recordCallSkipped, t.recordDedupeSavedImage, t.recordDedupeSavedGrading, t.markPartial]) {
    assert.doesNotThrow(() => fn(), `${fn.name} outside a job context`);
  }
  assert.doesNotThrow(() => t.setQuotaSnapshot());
  assert.doesNotThrow(() => t.setQuotaSnapshot({ remainingStart: "x", limit: NaN }));
  assert.doesNotThrow(() => t.markSkipped());
  assert.doesNotThrow(() => t.markError(undefined));
  assert.doesNotThrow(() => t.markError({}));
  assert.equal(t.currentCtx(), null, "no context outside a run");
});

test("5. two overlapping job contexts do not cross-contaminate counts (concurrent route invocations in one process)", async () => {
  const seen = [];
  const db = { from: () => ({ insert: async (row) => { seen.push(row); return { error: null }; } }) };
  const run = async (job, n) => {
    const ctx = t.beginJobRun({ job });
    for (let i = 0; i < n; i++) { await new Promise((r) => setTimeout(r, 1)); t.recordBrowseCall(); }
    await t.finishJobRun(db, ctx);
  };
  await Promise.all([run("ingest-feed", 3), run("refresh-sealed-deals", 5)]);
  const byJob = Object.fromEntries(seen.map((r) => [r.job, r.browse_calls]));
  assert.deepEqual(byJob, { "ingest-feed": 3, "refresh-sealed-deals": 5 });
});

test("6. static: every telemetry-wired route keeps finishJobRun inside `finally`, re-throws its own error, and passes its existing db client", () => {
  for (const r of ["refresh-deals", "verify-deals", "screen-deal-images", "refresh-sealed-deals", "ingest-feed"]) {
    const src = read(`app/api/${r}/route.js`).replace(/\/\/[^\n]*/g, "");
    const begin = src.indexOf("beginJobRun(");
    const fin = src.indexOf("await finishJobRun(db, ctx);");
    assert.ok(begin > 0 && fin > begin, `${r}: begin/finish present in order`);
    const tail = src.slice(fin - 200, fin + 40);
    assert.match(tail, /\}\s*finally\s*\{\s*await finishJobRun\(db, ctx\);/, `${r}: finishJobRun must be in finally`);
    assert.match(src.slice(begin, fin), /catch \(err\) \{[\s\S]*?markError\(err\);[\s\S]*?throw err;/, `${r}: the catch re-throws the original error`);
    assert.equal((src.match(/finishJobRun\(/g) ?? []).length, 1, `${r}: exactly one finishJobRun`);
    // no telemetry call is awaited on the hot path except finishJobRun (all other helpers are sync accounting)
    assert.doesNotMatch(src, /await (recordBrowseCall|recordDedupeSaved\w+|markSkipped|markError|setQuotaSnapshot|beginJobRun)\(/, `${r}: only finishJobRun is async`);
  }
  // the module itself: persistence is best-effort and no-op without a client
  const mod = read("lib/ebayTelemetry.js").replace(/\/\/[^\n]*/g, "");
  assert.match(mod, /async function finishJobRun\(db, ctx\) \{\s*if \(!ctx\) return;\s*try \{\s*if \(!db\) return;/);
  assert.match(mod, /catch \(e\) \{\s*console\.error\("ebay telemetry persist failed \(non-fatal\)/);
  assert.doesNotMatch(mod, /supabaseAdmin|createClient|fetch\(/, "telemetry never constructs its own client or calls the network");
});

test("7. static: the 14Q graded-dedupe DB read cannot abort a sweep - supabase-js returns {error}, and an empty map means a fresh lookup", () => {
  const src = read("app/api/refresh-deals/route.js").replace(/\/\/[^\n]*/g, "");
  assert.match(src, /const \{ data: known \} = await db\s*\.from\("deals"\)/, "known-grading read destructures data only (an error yields an empty map)");
  assert.match(src, /for \(const row of known \?\? \[\]\)/, "a missing/failed read is treated as 'nothing known'");
  assert.match(src, /if \(!reused && gradedLookups >= GRADED_LOOKUP_CAP\) continue;/, "cap still gates only NEW eBay calls");
  assert.match(src, /grading = await getGradingDetails\(listing\.listingId, marketplaceId\);/, "an unknown listing still makes the real call");
});
