// alloc-rev2 observe trial - the revision 2 envelope, the sweep graded
// lookup cap of 3, and the real US sweep under small enforce grants (the
// steady-state grant revision 2 would give a US sweep is ~10-11 attempts).
// Offline: tests/harness/ingestion/driver.mjs "sweepgrant" (saved evidence
// plus clearly labelled synthetic raw copies). No network, no database.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => readFileSync(join(ROOT, p), "utf8").replace(/\r\n/g, "\n");
const budget = require(join(ROOT, "lib/browseBudget.js"));

const runs = {};
function sweep(...args) {
  const k = args.join(" ");
  if (runs[k]) return runs[k];
  const r = spawnSync(process.execPath, ["--no-warnings", "--import", "./tests/harness/ingestion/register.mjs", "tests/harness/ingestion/driver.mjs", "sweepgrant", ...args], {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    env: { ...process.env, BROWSE_BUDGET_MODE: "" },
  });
  assert.equal(r.status, 0, r.stderr);
  return (runs[k] = JSON.parse(r.stdout));
}
const attempts = (run, grant) => run.ledger.used["sweep:EBAY_US"] - (budget.CONSUMER_CAPS["sweep:EBAY_US"] - grant);

test("AR2-1 envelope, first-pass shares and the sweep graded lookup cap are the authorised revision 2 values", () => {
  assert.deepEqual({ ...budget.CONSUMER_GROUP_CAPS }, { verify: 450, allocated: 2350, sweep: 1730, ingest: 40, images: 10, sealed: 0, manual: 0 });
  assert.equal(budget.BROWSE_RESERVE, 420);
  assert.deepEqual({ ...budget.ALLOCATED_COUNTRY_CAPS }, { EBAY_US: 650, EBAY_GB: 445, EBAY_CA: 435, EBAY_AU: 370, EBAY_DE: 150, EBAY_IT: 300 });
  assert.deepEqual({ ...budget.SWEEP_COUNTRY_CAPS }, { EBAY_US: 990, EBAY_GB: 160, EBAY_CA: 160, EBAY_AU: 150, EBAY_DE: 130, EBAY_IT: 140 });
  assert.ok(Object.values(budget.ALLOCATED_FIRST_PASS_SHARE).every((s) => s === 1));
  const route = read("app/api/refresh-deals/route.js");
  assert.match(route, /const GRADED_LOOKUP_CAP = 3;/);
  assert.match(route, /const SWEEP_DETAIL_CALLS_MAX = 3 \+ RAW_CONDITION_LOOKUP_CAP_SWEEP;/);
  // the lookup cap counts LOGICAL lookups started, before the call and its retries
  assert.match(route, /if \(!reused && gradedLookups >= GRADED_LOOKUP_CAP\) continue;[\s\S]{0,1500}gradedLookups\+\+;\s*\n\s*grading = await getGradingDetails\(/);
  // observe never blocks; the pilot still refuses enforce
  assert.match(route, /!\["off", "observe"\]\.includes\(browseBudgetMode\(\)\)/);
});

test("AR2-2 a 10-11 attempt US sweep grant: pages run, attempts never exceed the grant, useful verified work is written, refused work is held, the lease settles", () => {
  const full = sweep("observe");
  assert.equal(full.status, 200);
  assert.equal(full.ledger.kind, "browse_budget_observe");
  assert.equal(full.ledger.used["sweep:EBAY_US"], 14, "full demand: 5 pages + 3 graded + 6 raw condition checks");
  assert.deepEqual([full.calls.getGradingDetails, full.calls.getRawListingDetail, full.calls.attemptRefused ?? 0], [3, 6, 0]);
  for (const grant of [11, 10]) {
    const r = sweep(String(grant));
    assert.equal(r.status, 200, `grant ${grant}`);
    assert.equal(r.response.skipped ?? null, null, "no ebay_error skip: every page was funded (minGrant = pages + 1)");
    assert.equal(r.calls.searchNewlyListed, 1);
    assert.equal(attempts(r, grant), grant, `grant ${grant}: attempts = grant, never more`);
    assert.ok(r.calls.attemptRefused > 0);
    assert.equal(r.ledger.open, 0, "settled, not left to expire");
    assert.ok(r.response.dealsFound > 0 && r.response.dealsFound < full.response.dealsFound, "useful work, less than the full run");
    assert.ok(r.written.every((w) => w.displayable), "nothing unverified is written");
    assert.ok(r.written.length < full.written.length);
  }
  // a 21% smaller grant is not a 21% cut in raw condition checks: here 11/14 attempts kept 3/6 checks (graded lookups came first)
  assert.equal(sweep("11").calls.getRawListingDetail, 3);
  assert.equal(sweep("10").calls.getRawListingDetail, 2);
});

test("AR2-3 retries: three logical graded lookups can take four attempts; the cap counts lookups, the grant counts attempts", () => {
  const r = sweep("10", "retry");
  assert.equal(r.calls.getGradingDetails, 3, "logical lookups capped at 3");
  assert.equal(attempts(r, 10), 10, "5 pages + 4 graded attempts + 1 raw check");
  assert.equal(r.calls.getRawListingDetail, 1);
  assert.ok(r.written.every((w) => w.displayable));
});

test("AR2-4 safe stopping at a 6-attempt grant: refused graded lookups are recorded errors, refused raw checks are held, the run still settles", () => {
  const r = sweep("6");
  assert.equal(r.status, 200);
  assert.equal(attempts(r, 6), 6);
  assert.equal(r.calls.getRawListingDetail ?? 0, 0);
  assert.ok(r.response.errors.every((e) => /Browse budget lease exhausted/.test(e)));
  assert.ok(r.written.every((w) => w.graded && w.displayable), "no raw row without its condition check");
  assert.equal(r.ledger.open, 0);
});
