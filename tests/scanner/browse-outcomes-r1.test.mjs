// browse-outcomes-r1 - response-class counters for ANSWERED Browse requests.
//
// WHY. The closed 16-17 Sep window reconciled exactly internally (ledger
// 5,075 = job attempts 5,075) while eBay's counter showed 4,760 charged - a
// 315-request difference nothing retained could attribute, because no record
// held the response class of an answered request. These counters split the
// existing browse_calls total by status so a future window can be attributed
// instead of inferred.
//
// THE INVARIANT: browse_calls is unchanged - every Browse request that
// REACHED eBay and got a response, retries included. The buckets partition
// exactly that set, so they sum to it. Transport failures (no response at
// all) are outside both.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);
const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const T = require(join(REPO, "lib/ebayTelemetry.js"));
const src = (p) => readFileSync(join(REPO, p), "utf8");
const code = (p) => src(p).replace(/\/\/[^\n]*/g, "");

const BUCKETS = ["browse_ok", "browse_401", "browse_403", "browse_429", "browse_4xx", "browse_5xx"];

// Drive the real recorders inside a real job context.
function runWith(statuses, transportFailures = 0) {
  const ctx = T.beginJobRun({ job: "test", mode: null, country: null });
  for (const s of statuses) {
    // mirrors lib/ebay.js: an answered attempt is counted, then classified
    T.recordBrowseCall();
    T.recordBrowseOutcome(s);
  }
  for (let i = 0; i < transportFailures; i++) T.recordBrowseTransportFailure();
  return { ctx, cols: T.browseOutcomeColumns(ctx) };
}

test("BO-1. every answered response lands in exactly one bucket, and they sum to browse_calls", () => {
  const statuses = [200, 200, 204, 401, 403, 429, 429, 404, 422, 500, 503];
  const { ctx, cols } = runWith(statuses);
  assert.equal(ctx.browseCalls, statuses.length, "browse_calls no longer counts every answered attempt");
  const summed = BUCKETS.reduce((t, k) => t + cols[k], 0);
  assert.equal(summed, ctx.browseCalls, `buckets sum to ${summed} but browse_calls is ${ctx.browseCalls}`);
  assert.deepEqual(
    { ok: cols.browse_ok, a401: cols.browse_401, a403: cols.browse_403, a429: cols.browse_429, other4xx: cols.browse_4xx, s5xx: cols.browse_5xx },
    { ok: 3, a401: 1, a403: 1, a429: 2, other4xx: 2, s5xx: 2 }
  );
  // 401/403/429 are broken out and must NOT also be inside the generic 4xx
  assert.equal(cols.browse_4xx, 2, "401/403/429 are being double-counted into browse_4xx");
});

test("BO-2. a retried request counts once PER RESPONSE, not once per logical call", () => {
  // lib/ebay.js retries a 5xx: two answered attempts, two buckets
  const { ctx, cols } = runWith([503, 200]);
  assert.equal(ctx.browseCalls, 2, "a retry must count as a second answered request");
  assert.equal(cols.browse_5xx, 1);
  assert.equal(cols.browse_ok, 1);
  assert.equal(BUCKETS.reduce((t, k) => t + cols[k], 0), ctx.browseCalls);
});

test("BO-3. a transport failure is NOT an answered response and NOT a browse call", () => {
  const { ctx, cols } = runWith([200], 3);
  assert.equal(ctx.browseCalls, 1, "a request that never got a response was counted as a Browse call");
  assert.equal(BUCKETS.reduce((t, k) => t + cols[k], 0), 1, "a transport failure leaked into a status bucket");
  assert.equal(cols.browse_transport_failures, 3);
  // and it is outside the identity on purpose
  assert.notEqual(cols.browse_transport_failures, 0);
});

test("BO-4. the recorders add no budget charge and no provider request", () => {
  const s = code("lib/ebayTelemetry.js");
  const fn = s.slice(s.indexOf("function recordBrowseOutcome"), s.indexOf("function recordBrowseTransportFailure"));
  for (const forbidden of ["consumeBrowseAttempt", "fetch(", "browseLease", "recordBrowseCall"]) {
    assert.ok(!fn.includes(forbidden), `recordBrowseOutcome touches ${forbidden}`);
  }
  // called at the same chokepoint, immediately after the existing counter
  const e = code("lib/ebay.js");
  assert.match(e, /recordBrowseCall\(\);\s*recordBrowseOutcome\(res\.status\)/, "the outcome is not recorded on the same answered attempt");
  assert.match(e, /catch \(err\) \{\s*recordBrowseTransportFailure\(\)/, "transport failures are not recorded in the catch branch");
});

test("BO-5. no URL, token, header or body can reach telemetry", () => {
  const fn = code("lib/ebayTelemetry.js");
  const block = fn.slice(fn.indexOf("function recordBrowseOutcome"), fn.indexOf("function recordGradedDetailCall"));
  for (const leak of ["url", "headers", "authorization", "token", "body", "json()", "text()"]) {
    assert.ok(!block.toLowerCase().includes(leak), `outcome recording references ${leak}`);
  }
  // it takes a status, nothing else
  assert.match(fn, /function recordBrowseOutcome\(status\)/);
});

test("BO-6. existing counting semantics are unchanged", () => {
  const s = code("lib/ebayTelemetry.js");
  // browse_calls still incremented by exactly one place, with no condition
  assert.match(s, /function recordBrowseCall\(\)\s*\{\s*const ctx = currentCtx\(\);\s*if \(ctx\) ctx\.browseCalls \+= 1;\s*\}/);
  // graded_detail is still a TAG on top of browseCalls, not a sibling bucket
  assert.match(s, /function recordGradedDetailCall\(\)/);
  // and the answered-only rule in the fetch path is untouched
  assert.match(src("lib/ebay.js"), /never fires for a\s*\/\/\s*response that never arrived/);
});

test("BO-7. the columns are dropped until the migration runs, and the migration is the documented one", () => {
  const s = code("lib/ebayTelemetry.js");
  assert.match(s, /function browseOutcomeColumns\(ctx\)/);
  assert.match(s, /if \(BROWSE_OUTCOME_COLUMNS === false\) return \{\};/, "there is no downgrade path when the columns are absent");
  assert.match(s, /isMissingBrowseOutcomeColumn/, "a missing column is not detected on insert");
  const sql = src("supabase/ebay_job_runs_browse_outcomes_migration.sql");
  for (const col of [...BUCKETS, "browse_transport_failures"]) {
    assert.ok(sql.includes(col), `migration is missing ${col}`);
  }
  assert.match(sql, /ADD COLUMN IF NOT EXISTS/, "migration is not re-runnable");
});
