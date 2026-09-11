// Phase 14R - real eBay Browse call telemetry + daily quota attribution.
//
// Pure-logic tests for lib/ebayTelemetry.js + lib/ebayQuotaReport.js (real
// execution, no mocking needed - both are I/O-free except the one
// best-effort db.insert lib/ebayTelemetry.js makes, which these tests
// fake with an in-memory stub), plus structural assertions confirming the
// shared call-accounting chokepoint (lib/ebay.js) and every route's
// wiring. No network, no real DB, no eBay call, no Buffer/provider call.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import {
  beginJobRun,
  finishJobRun,
  recordBrowseCall,
  recordAnalyticsCall,
  recordGradedDetailCall,
  recordCallSkipped,
  recordDedupeSavedImage,
  recordDedupeSavedGrading,
  setQuotaSnapshot,
  markSkipped,
  markPartial,
  markError,
  currentCtx,
} from "../../lib/ebayTelemetry.js";
import { summarizeEbayQuotaDay } from "../../lib/ebayQuotaReport.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => readFileSync(join(ROOT, p), "utf8");

function fakeDb(onInsert) {
  return {
    from(table) {
      return {
        insert: async (row) => {
          onInsert(table, row);
          return { error: null };
        },
      };
    },
  };
}

// ---- 1/2 - each real Browse request increments exactly once, retries too --

test("14R-1. recordBrowseCall increments exactly once per call, inside an active job context", () => {
  beginJobRun({ job: "test-job" });
  recordBrowseCall();
  assert.equal(currentCtx().browseCalls, 1);
  recordBrowseCall();
  assert.equal(currentCtx().browseCalls, 2);
});

test("14R-2. two calls (a first attempt + one retry) both count - retries are real calls, not deduped", () => {
  beginJobRun({ job: "test-job" });
  // Simulates fetchWithRetry's loop: attempt 0 gets a 5xx and retries,
  // attempt 1 succeeds - lib/ebay.js calls recordBrowseCall() once per
  // loop iteration that reaches a real fetch response, so a retried
  // request produces two increments, not one.
  recordBrowseCall(); // attempt 0 (5xx)
  recordBrowseCall(); // attempt 1 (retry, succeeds)
  assert.equal(currentCtx().browseCalls, 2);
});

test("14R-2b. lib/ebay.js's fetchWithRetry calls recordBrowseCall() unconditionally inside its retry loop, not once outside it", () => {
  const src = read("lib/ebay.js");
  const fn = src.slice(src.indexOf("async function fetchWithRetry"), src.indexOf("\n}\n", src.indexOf("async function fetchWithRetry")));
  // Must be inside the try block, right after the real fetch() succeeds -
  // i.e. inside the for(;;) loop body, not after it - so every loop
  // iteration (including retries) hits it again.
  const forIdx = fn.indexOf("for (let attempt");
  const recordIdx = fn.indexOf("recordBrowseCall();");
  const loopCloseIdx = fn.lastIndexOf("}"); // the for-loop's own closing brace
  assert.ok(forIdx > -1 && recordIdx > forIdx && recordIdx < loopCloseIdx, "recordBrowseCall() must be inside fetchWithRetry's retry loop");
  assert.match(fn, /res = await fetch\(url, options\);\s*\n[\s\S]{0,600}recordBrowseCall\(\);/);
});

// ---- 3 - Analytics calls never count as Browse ------------------------

test("14R-3. recordAnalyticsCall is a separate counter from recordBrowseCall", () => {
  beginJobRun({ job: "test-job" });
  recordAnalyticsCall();
  recordAnalyticsCall();
  const ctx = currentCtx();
  assert.equal(ctx.analyticsCalls, 2);
  assert.equal(ctx.browseCalls, 0);
});

test("14R-3b. getBrowseRateLimit calls recordAnalyticsCall, never recordBrowseCall, and never calls fetchWithRetry", () => {
  const src = read("lib/ebay.js");
  const fn = src.slice(src.indexOf("async function getBrowseRateLimit"), src.indexOf("\nmodule.exports"));
  assert.match(fn, /recordAnalyticsCall\(\);/);
  // As a live call (not merely named in a comment explaining why it's
  // absent) - a bare statement line, never preceded by "// ".
  assert.doesNotMatch(fn, /^\s*recordBrowseCall\(\);/m);
  assert.doesNotMatch(fn, /fetchWithRetry\(/);
});

// ---- 4 - deduped calls never count as a Browse call --------------------

test("14R-4. a dedupe-saved decision records ONLY the savings counter, never recordBrowseCall (no eBay call was made)", () => {
  beginJobRun({ job: "test-job" });
  recordDedupeSavedImage();
  recordDedupeSavedGrading();
  const ctx = currentCtx();
  assert.equal(ctx.dedupeSavedImage, 1);
  assert.equal(ctx.dedupeSavedGrading, 1);
  assert.equal(ctx.browseCalls, 0);
});

// ---- 5/6 - image / grading savings counters ----------------------------

test("14R-5. verify-deals records recordDedupeSavedImage() at both RECOVERED and CONFIRMED_NO_IMAGE outcomes, in both row-type branches (4 sites)", () => {
  const src = read("app/api/verify-deals/route.js");
  const count = (src.match(/recordDedupeSavedImage\(\);/g) ?? []).length;
  assert.equal(count, 4, "expected one call per outcome (RECOVERED/CONFIRMED_NO_IMAGE) in each of the two row-type branches");
});

test("14R-6. refresh-deals records recordDedupeSavedGrading() exactly where a reused (already-known) grading is used, never on a fresh lookup", () => {
  const src = read("app/api/refresh-deals/route.js");
  const ifIdx = src.indexOf("if (reused) {");
  const elseIdx = src.indexOf("} else {", ifIdx);
  const reusedBlock = src.slice(ifIdx, elseIdx);
  assert.match(reusedBlock, /recordDedupeSavedGrading\(\);/);
  const freshIdx = src.indexOf("gradedLookups++;", elseIdx);
  const freshBlock = src.slice(freshIdx, freshIdx + 200);
  assert.doesNotMatch(freshBlock, /recordDedupeSavedGrading/);
});

// ---- 7/8/9 - lifecycle finalization on every outcome -------------------

test("14R-7. a normal (success) job persists exactly one ebay_job_runs row with status success", async () => {
  const inserts = [];
  const db = fakeDb((table, row) => inserts.push({ table, row }));
  const ctx = beginJobRun({ job: "test-job" });
  recordBrowseCall();
  await finishJobRun(db, ctx);
  assert.equal(inserts.length, 1);
  assert.equal(inserts[0].table, "ebay_job_runs");
  assert.equal(inserts[0].row.status, "success");
  assert.equal(inserts[0].row.browse_calls, 1);
});

test("14R-8. a quota-skip job persists a row with status skipped and the real skip_reason", async () => {
  const inserts = [];
  const db = fakeDb((table, row) => inserts.push(row));
  const ctx = beginJobRun({ job: "test-job" });
  setQuotaSnapshot({ remainingStart: 500, reserveFloor: 800 });
  markSkipped("quota_reserve");
  await finishJobRun(db, ctx);
  assert.equal(inserts[0].status, "skipped");
  assert.equal(inserts[0].skip_reason, "quota_reserve");
  assert.equal(inserts[0].quota_remaining_start, 500);
  assert.equal(inserts[0].reserve_floor, 800);
});

test("14R-8b. markPartial only downgrades from success, never overrides an existing skip/error", async () => {
  const ctx1 = beginJobRun({ job: "t" });
  markPartial();
  assert.equal(currentCtx().status, "partial");
  const ctx2 = beginJobRun({ job: "t" });
  markSkipped("ebay_error");
  markPartial();
  assert.equal(currentCtx().status, "skipped", "markPartial must not clobber an already-set skip");
});

test("14R-9. a caught provider error still persists a row - status error, error_class set, no message/stack leaked", async () => {
  const inserts = [];
  const db = fakeDb((table, row) => inserts.push(row));
  const ctx = beginJobRun({ job: "test-job" });
  try {
    throw new TypeError("some transient network detail with a url and maybe a token=abc123");
  } catch (err) {
    markError(err);
  }
  await finishJobRun(db, ctx);
  assert.equal(inserts[0].status, "error");
  assert.equal(inserts[0].error_class, "TypeError");
  // never the message/stack - only the error's name/class.
  assert.ok(!JSON.stringify(inserts[0]).includes("token=abc123"));
});

// ---- 10 - telemetry storage failure never breaks the caller ------------

test("14R-10. finishJobRun swallows a throwing db and resolves normally", async () => {
  const throwingDb = { from: () => ({ insert: async () => { throw new Error("db is down"); } }) };
  const ctx = beginJobRun({ job: "test-job" });
  await assert.doesNotReject(() => finishJobRun(throwingDb, ctx));
});

test("14R-10b. finishJobRun is a no-op (not a throw) when db is falsy", async () => {
  const ctx = beginJobRun({ job: "test-job" });
  await assert.doesNotReject(() => finishJobRun(null, ctx));
});

test("14R-10c. record* helpers never throw when called with no active job context", () => {
  // Simulates a script invoking a shared eBay function outside any wired
  // route - telemetry must be a pure no-op, never a crash.
  assert.doesNotThrow(() => {
    recordBrowseCall();
    recordAnalyticsCall();
    recordGradedDetailCall();
    recordCallSkipped();
    recordDedupeSavedImage();
    recordDedupeSavedGrading();
    setQuotaSnapshot({ remainingStart: 1 });
    markSkipped("x");
    markPartial();
    markError(new Error("x"));
  });
});

// ---- 11 - no credentials/tokens/payloads persisted ---------------------

test("14R-11. the persisted row shape never includes a token, credential, or raw response payload field", async () => {
  const inserts = [];
  const db = fakeDb((table, row) => inserts.push(row));
  const ctx = beginJobRun({ job: "test-job", mode: "sweep", country: "EBAY_US" });
  recordBrowseCall();
  await finishJobRun(db, ctx);
  const keys = Object.keys(inserts[0]);
  const forbidden = /token|secret|credential|authorization|body|payload|response/i;
  for (const k of keys) assert.doesNotMatch(k, forbidden);
  assert.deepEqual(
    keys.sort(),
    [
      "analytics_calls",
      "browse_calls",
      "calls_skipped",
      "completed_at",
      "country",
      "dedupe_saved_grading",
      "dedupe_saved_image",
      "error_class",
      "graded_detail_calls",
      "job",
      "mode",
      "quota_limit",
      "quota_remaining_end",
      "quota_remaining_start",
      "reserve_floor",
      "skip_reason",
      "started_at",
      "status",
    ].sort()
  );
});

test("14R-11b. lib/ebayTelemetry.js makes no network call itself - only a caller-supplied db.insert", () => {
  const src = read("lib/ebayTelemetry.js");
  assert.doesNotMatch(src, /fetch\(/);
});

// ---- daily report (Part 7) ---------------------------------------------

test("14R-report-1. summarizeEbayQuotaDay totals browse calls, separates analytics, and groups by job without a generic bucket", () => {
  const rows = [
    { job: "verify-deals", browse_calls: 10, analytics_calls: 1, started_at: "2026-09-10T01:00:00Z", completed_at: "2026-09-10T01:00:05Z", status: "success" },
    { job: "screen-deal-images", browse_calls: 3, analytics_calls: 1, started_at: "2026-09-10T02:00:00Z", completed_at: "2026-09-10T02:00:05Z", status: "success" },
    { job: "refresh-deals:sweep", browse_calls: 5, analytics_calls: 1, started_at: "2026-09-10T02:00:00Z", completed_at: "2026-09-10T02:00:05Z", status: "success" },
  ];
  const report = summarizeEbayQuotaDay(rows, { dayStart: new Date("2026-09-10T00:00:00Z"), now: new Date("2026-09-10T03:00:00Z") });
  assert.equal(report.totalBrowseCalls, 18);
  assert.equal(report.totalAnalyticsCalls, 3);
  assert.equal(Object.keys(report.byJob).length, 3);
  assert.equal(report.byJob["verify-deals"].browseCalls, 10);
  assert.equal(report.largestConsumer, "verify-deals");
  assert.equal(report.peakHour, 1); // verify-deals' 10 at hour 1 beats screen-deal-images(3)+sweep(5)=8 at hour 2
});

test("14R-report-2. peak hour is the UTC hour with the most browse_calls, correctly summed across jobs in that hour", () => {
  const rows = [
    { job: "a", browse_calls: 10, started_at: "2026-09-10T01:00:00Z" },
    { job: "b", browse_calls: 3, started_at: "2026-09-10T02:00:00Z" },
    { job: "c", browse_calls: 5, started_at: "2026-09-10T02:30:00Z" },
  ];
  const report = summarizeEbayQuotaDay(rows, { dayStart: new Date("2026-09-10T00:00:00Z") });
  assert.equal(report.peakHour, 1); // 10 at hour 1 beats 3+5=8 at hour 2
});

test("14R-report-3. dedupe-saved counters and skip reasons are summed/counted correctly", () => {
  const rows = [
    { job: "verify-deals", browse_calls: 1, dedupe_saved_image: 2, status: "success", started_at: "2026-09-10T00:00:00Z" },
    { job: "refresh-deals:sweep", browse_calls: 0, dedupe_saved_grading: 3, status: "skipped", skip_reason: "quota_reserve", started_at: "2026-09-10T00:00:00Z" },
    { job: "ingest-feed", browse_calls: 0, status: "skipped", skip_reason: "ebay_rate_limited", started_at: "2026-09-10T00:00:00Z" },
  ];
  const report = summarizeEbayQuotaDay(rows, { dayStart: new Date("2026-09-10T00:00:00Z") });
  assert.equal(report.dedupeSavedImage, 2);
  assert.equal(report.dedupeSavedGrading, 3);
  assert.equal(report.dedupeSavedTotal, 5);
  assert.equal(report.skippedByReserve, 1);
  assert.equal(report.skippedByRateLimit, 2);
});

test("14R-report-4. estimated end-of-day is a linear projection off the elapsed UTC day, and is null when too early to project", () => {
  const rows = [{ job: "verify-deals", browse_calls: 100, started_at: "2026-09-10T00:00:00Z" }];
  const early = summarizeEbayQuotaDay(rows, { dayStart: new Date("2026-09-10T00:00:00Z"), now: new Date("2026-09-10T00:05:00Z") });
  assert.equal(early.estimatedEndOfDay, null);
  const later = summarizeEbayQuotaDay(rows, { dayStart: new Date("2026-09-10T00:00:00Z"), now: new Date("2026-09-10T06:00:00Z") });
  // 100 calls / 6h = 16.67/hr * 18h remaining + 100 ~= 400
  assert.ok(later.estimatedEndOfDay > 300 && later.estimatedEndOfDay < 500);
});

test("14R-report-5. summarizeEbayQuotaDay makes no network/DB call - pure aggregation only", () => {
  const src = read("lib/ebayQuotaReport.js");
  assert.doesNotMatch(src, /fetch\(|supabaseAdmin|createClient/);
});

// ---- route wiring: every route finalizes on every path -----------------

const ROUTES = {
  "verify-deals": "app/api/verify-deals/route.js",
  "screen-deal-images": "app/api/screen-deal-images/route.js",
  "refresh-sealed-deals": "app/api/refresh-sealed-deals/route.js",
  "ingest-feed": "app/api/ingest-feed/route.js",
};

for (const [job, path] of Object.entries(ROUTES)) {
  test(`14R-wire-${job}. imports beginJobRun/finishJobRun and wraps the handler in try/finally`, () => {
    const src = read(path);
    assert.match(src, /from "@\/lib\/ebayTelemetry"/);
    assert.match(src, new RegExp(`beginJobRun\\(\\{\\s*job:\\s*"${job}"`));
    assert.match(src, /finally\s*\{\s*await finishJobRun\(db, ctx\);\s*\}/);
  });
}

test("14R-wire-refresh-deals. tags job as sweep vs allocated vs manual (not a single shared job string), and wraps in try/finally", () => {
  const src = read("app/api/refresh-deals/route.js");
  assert.match(src, /from "@\/lib\/ebayTelemetry"/);
  assert.match(src, /"refresh-deals:sweep"/);
  assert.match(src, /"refresh-deals:allocated"/);
  assert.match(src, /"refresh-deals:manual"/);
  assert.match(src, /finally\s*\{\s*await finishJobRun\(db, ctx\);\s*\}/);
  // the existing "never let a mid-sweep error surface as a 500" guard must
  // mark the outcome (skipped), not silently leave it as a default success.
  assert.match(src, /markSkipped\("ebay_error"\)/);
});

test("14R-wire-quota-skips. every route's pre-flight quota-skip branch calls markSkipped before returning", () => {
  // screen-deal-images has no whole-run quota-skip branch (it degrades
  // recoverBudget to 0 and still screens) so it is deliberately excluded.
  for (const path of [
    "app/api/verify-deals/route.js",
    "app/api/refresh-sealed-deals/route.js",
    "app/api/ingest-feed/route.js",
    "app/api/refresh-deals/route.js",
  ]) {
    const src = read(path);
    assert.match(src, /markSkipped\(/, `${path} has no markSkipped call`);
  }
});

// ---- Part 8 - telemetry adds zero extra Browse/Analytics calls ---------

test("14R-safety-1. screen-deal-images still calls getBrowseRateLimit exactly once (telemetry added no second call)", () => {
  const src = read("app/api/screen-deal-images/route.js");
  const count = (src.match(/await getBrowseRateLimit\(\)/g) ?? []).length;
  assert.equal(count, 1);
});

test("14R-safety-2. verify-deals still calls getBrowseRateLimit exactly twice (its pre-existing before/after pattern, unchanged)", () => {
  const src = read("app/api/verify-deals/route.js");
  const count = (src.match(/await getBrowseRateLimit\(\)/g) ?? []).length;
  assert.equal(count, 2);
});

test("14R-safety-3. refresh-sealed-deals and ingest-feed and refresh-deals still call getBrowseRateLimit exactly once each", () => {
  for (const path of ["app/api/refresh-sealed-deals/route.js", "app/api/ingest-feed/route.js", "app/api/refresh-deals/route.js"]) {
    const src = read(path);
    const count = (src.match(/await getBrowseRateLimit\(\)/g) ?? []).length;
    assert.equal(count, 1, `${path} should call getBrowseRateLimit exactly once`);
  }
});

// ---- Part 12 - cron / reserve / cadence unchanged ----------------------

test("14R-12. vercel.json cron schedules for every eBay-consuming route are STILL unchanged", () => {
  const cfg = JSON.parse(read("vercel.json"));
  const byPath = Object.fromEntries(cfg.crons.map((c) => [c.path, c.schedule]));
  assert.equal(byPath["/api/verify-deals"], "*/30 * * * *");
  assert.equal(byPath["/api/screen-deal-images"], "15 * * * *");
  assert.equal(byPath["/api/refresh-deals?mode=sweep&country=EBAY_US&pages=5"], "*/15 * * * *");
  assert.equal(byPath["/api/ingest-feed"], "0 * * * *");
  assert.equal(byPath["/api/refresh-sealed-deals"], "0 6 * * *");
});

test("14R-12b. reserve/batch/cap constants are STILL unchanged", () => {
  assert.match(read("app/api/verify-deals/route.js"), /const BATCH = 20;/);
  assert.match(read("app/api/verify-deals/route.js"), /const RESERVE = 800;/);
  assert.match(read("app/api/screen-deal-images/route.js"), /const IMAGE_RECOVER_PER_RUN = 12;/);
  assert.match(read("app/api/screen-deal-images/route.js"), /const RECOVER_RESERVE = 900;/);
  assert.match(read("app/api/refresh-deals/route.js"), /const GRADED_LOOKUP_CAP = 6;/);
});

// ---- Part 10 - documentation -------------------------------------------

test("14R-doc-1. docs/ebay-rate-limits.md documents the telemetry architecture and job attribution names", () => {
  const doc = read("docs/ebay-rate-limits.md");
  assert.match(doc, /ebay_job_runs/);
  assert.match(doc, /AsyncLocalStorage/);
  assert.match(doc, /refresh-deals:sweep/);
  assert.match(doc, /refresh-deals:allocated/);
  assert.match(doc, /screen-deal-images/);
  assert.match(doc, /verify-deals/);
  assert.match(doc, /refresh-sealed-deals/);
  assert.match(doc, /ingest-feed/);
});

test("14R-doc-2. docs/ebay-rate-limits.md documents the daily report command and the Browse-vs-Analytics distinction", () => {
  const doc = read("docs/ebay-rate-limits.md");
  assert.match(doc, /npm run ebay:quota-report/);
  assert.match(doc, /Analytics/);
  assert.match(doc, /separate pools|separate quota pool/i);
});

test("14R-doc-3. docs/ebay-rate-limits.md still carries the pre-telemetry 14P/14Q modeled estimates for comparison (not deleted)", () => {
  const doc = read("docs/ebay-rate-limits.md");
  assert.match(doc, /modeled/i);
  assert.match(doc, /~4,993|~4,835|~4,676/); // the 14Q revised-ceiling table
});

test("14R-doc-4. npm script ebay:quota-report exists in package.json", () => {
  const pkg = JSON.parse(read("package.json"));
  assert.equal(pkg.scripts["ebay:quota-report"], "node scripts/reportEbayQuota.mjs");
});

test("14R-13. no provider/social/Buffer code path was touched by this phase's changes", () => {
  for (const p of [
    "app/api/verify-deals/route.js",
    "app/api/screen-deal-images/route.js",
    "app/api/refresh-deals/route.js",
    "app/api/refresh-sealed-deals/route.js",
    "app/api/ingest-feed/route.js",
    "lib/ebayTelemetry.js",
    "lib/ebayQuotaReport.js",
  ]) {
    const src = read(p);
    assert.doesNotMatch(src, /providers\/buffer|bufferGraphQL|SOCIAL_BUFFER_BACKLOG_ENABLED|SOCIAL_AUTOPILOT_ENABLED/);
  }
});
