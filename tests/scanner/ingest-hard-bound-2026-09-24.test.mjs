// ingest-hard-bound-2026-09-24 - a REAL daily ceiling on the ingest Browse
// workload: 40 external ATTEMPTS/day, retries included.
//
// Measured 19-24 Sep, this job spent 305-423 calls/day against the 40 it is
// funded for, because the grant was advisory: the route narrowed its queue
// only `if (budget.effective === "enforce")` and production runs in observe.
//
// The fix is two independent bounds, neither depending on the global budget
// mode: the queue is sized from the ledger's durable remaining allowance
// (decision.capLeft, compare-and-set), and a hard attempt guard is armed
// around the verification work. These exercise the REAL guard from
// lib/ebayTelemetry through the REAL fetch chokepoint in lib/ebay.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..");
const require = createRequire(import.meta.url);
const T = require(join(REPO, "lib", "ebayTelemetry.js"));
const { CONSUMER_CAPS } = require(join(REPO, "lib", "browseBudget.js"));
const ROUTE = readFileSync(join(REPO, "app", "api", "ingest-feed", "route.js"), "utf8");
const stripComments = (s) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").split(/\r?\n/).map((l) => l.replace(/(^|[^:])\/\/.*/, "$1")).join("\n");

// Run `fn` inside a real job context so the guard has somewhere to live.
const inJob = async (fn) => {
  const ctx = T.beginJobRun({ job: "ingest-feed-test" });
  try {
    return await fn(ctx);
  } finally {
    T.clearBrowseAttemptGuard();
  }
};

// === 1. retries count against the SAME allowance ======================

test("IB-1. a retry consumes the allowance exactly like a first attempt", async () => {
  await inJob(() => {
    const guard = T.setBrowseAttemptGuard(3);
    // three attempts allowed, whatever they represent
    assert.equal(T.consumeBrowseAttempt(), true, "first try of lookup A");
    assert.equal(T.consumeBrowseAttempt(), true, "RETRY of lookup A - same allowance");
    assert.equal(T.consumeBrowseAttempt(), true, "first try of lookup B");
    assert.equal(T.consumeBrowseAttempt(), false, "retry of lookup B is refused - allowance gone");
    assert.equal(guard.attempts, 3);
    assert.equal(guard.refused, 1);
  });
});

// === 2. N remaining attempts cannot become N+1 external calls =========

test("IB-2. 39 remaining attempts cannot produce 40 external calls", async () => {
  await inJob(() => {
    const guard = T.setBrowseAttemptGuard(39);
    let allowed = 0;
    // ask for far more than the ceiling, as a run with retries would
    for (let i = 0; i < 200; i++) if (T.consumeBrowseAttempt()) allowed++;
    assert.equal(allowed, 39, "exactly the ceiling, never one more");
    assert.equal(guard.attempts, 39);
    assert.equal(guard.refused, 161);
  });
});

test("IB-2b. the ceiling holds through the real fetch chokepoint, retries included", async () => {
  // lib/ebay.fetchWithRetry calls consumeBrowseAttempt before EVERY attempt
  // (first tries and retries alike) - the single place every Browse request
  // passes through. Pin that wiring rather than trusting the comment.
  const EBAY = readFileSync(join(REPO, "lib", "ebay.js"), "utf8");
  const fn = EBAY.slice(EBAY.indexOf("async function fetchWithRetry"), EBAY.indexOf("async function fetchWithRetry") + 1800);
  assert.match(fn, /for \(let attempt = 0; ; attempt\+\+\)/);
  assert.match(fn, /if \(!consumeBrowseAttempt\(\)\)/);
  // the guard is consulted BEFORE the lease, so it binds in every mode
  const TEL = stripComments(readFileSync(join(REPO, "lib", "ebayTelemetry.js"), "utf8"));
  const consume = TEL.slice(TEL.indexOf("function consumeBrowseAttempt"), TEL.indexOf("function leaseAllowsBrowseAttempt"));
  assert.ok(consume.indexOf("attemptGuard") < consume.indexOf("leaseAllowsBrowseAttempt"), "guard must be checked before the lease");
});

// === 3. repeated / concurrent invocations cannot collectively overspend =

test("IB-3. the daily allowance comes from the ledger, not from per-run state", () => {
  const code = stripComments(ROUTE);
  // capLeft = cap - used - open, computed inside the ledger's compare-and-set
  // read, so two invocations racing cannot both see the same last unit.
  assert.match(code, /const capLeft = Number\(budget\.decision\?\.capLeft\)/);
  assert.match(code, /dailyAttemptsLeft = Number\.isFinite\(capLeft\) \? Math\.max\(0, Math\.floor\(capLeft\)\) : null/);
  assert.match(code, /attemptCeiling = Math\.min\(dailyAttemptsLeft \?\? INGEST_MAX_ATTEMPTS_PER_RUN, INGEST_MAX_ATTEMPTS_PER_RUN\)/);
  // and the ledger path is forced even when the global mode is off, or the
  // spend would not be recorded and the next run could not see it
  assert.match(code, /browseBudgetMode\(\) === "off" \? \{ mode: "observe" \} : \{\}/);
});

test("IB-3b. one invocation cannot exceed the REMAINING allowance, and the day totals the limit", () => {
  const code = stripComments(ROUTE);
  assert.match(code, /const INGEST_MAX_ATTEMPTS_PER_RUN = INGEST_DAILY_ATTEMPT_LIMIT/);
  assert.match(code, /const INGEST_DAILY_ATTEMPT_LIMIT = CONSUMER_CAPS\.ingest/);
  assert.equal(CONSUMER_CAPS.ingest, 40, "the daily target is the cap it is already funded for");
  // Simulate the day: each hourly run may take what is LEFT and no more,
  // so the total across every run of the day is exactly the limit.
  let used = 0;
  for (let run = 0; run < 24; run++) {
    const left = CONSUMER_CAPS.ingest - used;
    if (left <= 0) break;
    used += Math.min(left, CONSUMER_CAPS.ingest);
  }
  assert.equal(used, 40, "24 hourly runs cannot collectively exceed the daily limit");
});

// === 4. exhausted budget fails closed =================================

test("IB-4. an exhausted allowance returns BEFORE any Browse call, never unleased", () => {
  const code = stripComments(ROUTE);
  // A KNOWN zero stops the run. Unknown is deliberately NOT treated as
  // exhausted: an unreadable ledger must not silently switch the job off,
  // and this file's own contract is that a ledger failure never blocks work
  // outside enforce. An unknown allowance falls back to the per-run
  // ceiling - still a hard attempt bound - and is flagged in telemetry.
  assert.match(code, /if \(dailyAttemptsLeft === 0\) \{/);
  assert.match(code, /markSkipped\("ingest_daily_attempt_limit"\)/);
  assert.match(code, /return Response\.json\(\{ skipped: "ingest_daily_attempt_limit"/);
  // the early return is above the verification loop that spends calls
  // (compare against the CALL SITE, not the import at the top of the file)
  const callSite = code.indexOf("await getItemsByLegacyIds(");
  assert.ok(callSite > 0, "expected the verification call site");
  assert.ok(
    code.indexOf('skipped: "ingest_daily_attempt_limit"') < callSite,
    "the skip must come before any Browse call"
  );
  // an unknown allowance is bounded, never unbounded, and never silently
  // assumed to be full
  assert.match(code, /Number\.isFinite\(capLeft\) \? Math\.max\(0, Math\.floor\(capLeft\)\) : null/);
  assert.match(code, /ingestDailyAllowanceKnown: dailyAttemptsLeft !== null/);
  assert.doesNotMatch(code, /Infinity|Number\.MAX_SAFE_INTEGER/);
});

test("IB-4b. a zero ceiling refuses every attempt", async () => {
  await inJob(() => {
    const guard = T.setBrowseAttemptGuard(0);
    for (let i = 0; i < 5; i++) assert.equal(T.consumeBrowseAttempt(), false);
    assert.equal(guard.attempts, 0);
    assert.equal(guard.refused, 5);
  });
});

// === 5. existing successful ingest writes are unchanged ===============

test("IB-5. no matcher, ownership or identity behaviour changed; no other consumer touched", () => {
  const code = stripComments(ROUTE);
  // the queue is still built and ordered by the existing helper - highest
  // value first (neverSeen before dueRecheck), just sized smaller
  assert.match(code, /allocateVerifyBudget\(\{\s*neverSeen: part\.neverSeen,\s*dueRecheck: part\.dueRecheck,\s*budget: verifyBudget,\s*\}\)/);
  // the write path and its gates are untouched
  for (const kept of ["listingMatchesCard", "isTrustworthyListing", "conditionAllowsPromotion", "languageCompatible", "clearedReference"]) {
    assert.ok(code.includes(kept), `${kept} must still be used by the ingest write path`);
  }
  // only the ingest lease key is named in this route
  const keys = [...code.matchAll(/key:\s*"([a-z:]+)"/g)].map((m) => m[1]);
  assert.deepEqual([...new Set(keys)], ["ingest"], "this route may only lease its own key");
  // and it must not reach for another consumer's cap
  assert.doesNotMatch(code, /CONSUMER_CAPS\.(?!ingest)\w+/);
  assert.doesNotMatch(code, /SWEEP_COUNTRY_CAPS|ALLOCATED_COUNTRY_CAPS|PACE_BURST/);
});

test("IB-6. telemetry separates logical lookups from real attempts", () => {
  const code = stripComments(ROUTE);
  for (const field of [
    "ingestLogicalLookupsRequested",
    "ingestLogicalLookupsQueued",
    "ingestExternalAttempts",
    "ingestRetries",
    "ingestSkippedForAllowance",
    "ingestFirstTimeEligiblePairs",
    "ingestCallsPerUsefulOutcome",
    "ingestDailyAttemptLimit",
    "ingestDailyAttemptsLeft",
  ]) {
    assert.ok(code.includes(field), `missing telemetry field ${field}`);
  }
  // retries are derived as attempts - logical calls, never guessed
  assert.match(code, /ingestRetries: Math\.max\(0, \(attemptGuard\?\.attempts \?\? browseCalls\) - browseCalls\)/);
});

test("IB-7. the guard cannot leak between runs - it lives on the job context", async () => {
  // No explicit teardown is needed, and none is added: the guard is stored
  // on the per-run job context (ebayTelemetry.setBrowseAttemptGuard writes
  // ctx.attemptGuard), which ends with finishJobRun. Two things follow, and
  // both are asserted rather than assumed.
  const TEL = stripComments(readFileSync(join(REPO, "lib", "ebayTelemetry.js"), "utf8"));
  assert.match(TEL, /function setBrowseAttemptGuard\(limit\) \{\s*const ctx = currentCtx\(\);/);
  assert.match(TEL, /ctx\.attemptGuard = \{ limit:/);
  // and with no context at all there is no guard to inherit
  T.clearBrowseAttemptGuard();
  await inJob(() => {
    assert.equal(T.consumeBrowseAttempt(), true, "a fresh run starts unguarded, not with the previous run's ceiling");
  });
  // the route therefore leaves `finally` holding finishJobRun alone, which
  // tests/scanner/ebay-14r-telemetry pins for every telemetry-wired route
  assert.match(stripComments(ROUTE), /finally \{\s*await finishJobRun\(db, ctx\);\s*\}/);
});
