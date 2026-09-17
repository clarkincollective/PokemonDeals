// EBAY-14R - real eBay Browse call telemetry, attributed per route
// invocation. Pure accounting + best-effort persistence; makes no eBay
// call itself, and a failure here must NEVER break the job it is
// observing (same "analytics must never break discovery" contract as
// lib/discoveryLog.js's logDiscoveryEvent).
//
// Attribution uses AsyncLocalStorage - an EXPLICIT, per-invocation context
// object, not stack inspection - so lib/ebay.js's single request chokepoint
// (fetchWithRetry) can attribute a real outbound Browse call to whichever
// route invocation is currently running, without every intermediate
// function (searchListings, getGradingDetails, ...) having to thread a job
// tag through its own signature.
//
// One row per ROUTE INVOCATION (not per API call) is written to
// `ebay_job_runs` (supabase/ebay_job_runs_migration.sql) when the
// invocation finishes, however it finishes (success, quota skip, or a
// thrown provider error) - see beginJobRun/finishJobRun below.

const { AsyncLocalStorage } = require("node:async_hooks");

const als = new AsyncLocalStorage();

function currentCtx() {
  return als.getStore() ?? null;
}

// meta: { job, mode, country } - job should be one of the values this
// phase's routes use, e.g. "refresh-deals:sweep", "refresh-deals:allocated",
// "verify-deals", "screen-deal-images", "refresh-sealed-deals",
// "ingest-feed". mode/country are optional free-form tags (e.g. "sweep",
// "EBAY_US") kept only for the daily report's grouping - never used for any
// gating decision.
function beginJobRun(meta) {
  const ctx = {
    job: meta?.job ?? "unknown",
    mode: meta?.mode ?? null,
    country: meta?.country ?? null,
    startedAt: new Date().toISOString(),
    browseCalls: 0,
    analyticsCalls: 0,
    gradedDetailCalls: 0,
    callsSkipped: 0,
    // browse-outcomes-r1: how the ANSWERED Browse requests counted in
    // browseCalls came back. One bucket per answered attempt (a retry is a
    // second answered attempt and lands in its own bucket), so these always
    // sum to browseCalls (browseOtherStatus closes that identity for any
    // status outside the named buckets, so EVERY answered request lands in
    // exactly one). Transport failures are NOT here - a request that
    // never got a response is not counted in browseCalls either; it has its
    // own counter below so the two can never be confused.
    browseOk: 0,
    browse401: 0,
    browse403: 0,
    browse429: 0,
    browse4xx: 0,
    browse5xx: 0,
    browseOtherStatus: 0,
    browseTransportFailures: 0,
    quotaRemainingStart: null,
    quotaRemainingEnd: null,
    quotaLimit: null,
    reserveFloor: null,
    skipReason: null,
    dedupeSavedImage: 0,
    dedupeSavedGrading: 0,
    status: "success",
    errorClass: null,
  };
  // enterWith (not run()) so callers don't have to wrap their entire
  // existing handler body in an extra callback - it propagates to every
  // await made from here on in this same execution, which is exactly the
  // lifetime of one route invocation.
  als.enterWith(ctx);
  return ctx;
}

// Every real outbound HTTP request to a Browse endpoint - called from
// lib/ebay.js's fetchWithRetry exactly once per attempt (so a retried
// request increments twice). A no-op with no active job context (e.g. a
// script run outside a wired route) - never throws either way.
function recordBrowseCall() {
  const ctx = currentCtx();
  if (ctx) ctx.browseCalls += 1;
}

// The Analytics rate-limit meta-call (getBrowseRateLimit) - a SEPARATE
// quota pool from Browse, never counted toward browseCalls.
function recordAnalyticsCall() {
  const ctx = currentCtx();
  if (ctx) ctx.analyticsCalls += 1;
}

// browse-outcomes-r1 - the new columns, dropped entirely until the migration
// (supabase/ebay_job_runs_browse_outcomes_migration.sql) has run. A telemetry
// insert must never fail a scan because a column is missing, and the existing
// columns keep their meaning either way: browse_calls is still every ANSWERED
// Browse request, unchanged by this phase.
const BROWSE_OUTCOME_KEYS = ["browse_ok", "browse_401", "browse_403", "browse_429", "browse_4xx", "browse_5xx", "browse_other_status", "browse_transport_failures"];
// PostgREST reports an unknown column as PGRST204 / "column ... does not exist"
function isMissingBrowseOutcomeColumn(error) {
  const t = `${error?.code ?? ""} ${error?.message ?? ""}`.toLowerCase();
  return t.includes("pgrst204") || (t.includes("column") && t.includes("does not exist") && BROWSE_OUTCOME_KEYS.some((k) => t.includes(k)));
}
let BROWSE_OUTCOME_COLUMNS = null; // null = unknown, true/false once probed
function setBrowseOutcomeColumns(present) {
  BROWSE_OUTCOME_COLUMNS = present === null ? null : Boolean(present);
}
function browseOutcomeColumns(ctx) {
  if (BROWSE_OUTCOME_COLUMNS === false) return {};
  return {
    browse_ok: ctx.browseOk,
    browse_401: ctx.browse401,
    browse_403: ctx.browse403,
    browse_429: ctx.browse429,
    browse_4xx: ctx.browse4xx,
    browse_5xx: ctx.browse5xx,
    browse_other_status: ctx.browseOtherStatus,
    browse_transport_failures: ctx.browseTransportFailures,
  };
}

// browse-outcomes-r1 - the response class of one ANSWERED Browse request.
// Called from lib/ebay.js immediately after recordBrowseCall(), on the same
// attempt, so every answered attempt contributes exactly one outcome and the
// buckets reconcile with browseCalls by construction. Records a status class
// only - never a URL, token, header or body. Adds NO budget charge: the
// attempt was already drawn from the lease before it was sent.
function recordBrowseOutcome(status) {
  const ctx = currentCtx();
  if (!ctx) return;
  const n = Number(status);
  if (!Number.isFinite(n)) return;
  if (n >= 200 && n < 300) ctx.browseOk += 1;
  else if (n === 401) ctx.browse401 += 1;
  else if (n === 403) ctx.browse403 += 1;
  else if (n === 429) ctx.browse429 += 1;
  else if (n >= 400 && n < 500) ctx.browse4xx += 1;
  else if (n >= 500 && n < 600) ctx.browse5xx += 1;
  // Anything else an answered request can carry (1xx, 3xx, or a status
  // outside those ranges) still gets a bucket. Leaving it uncounted would
  // break the identity below and make a real gap look like a missing
  // response instead of an unnamed one.
  else ctx.browseOtherStatus += 1;
}

// A Browse attempt that never received a response (DNS, socket, timeout).
// Deliberately SEPARATE from the outcome buckets and from browseCalls, whose
// existing "answered only" semantics are unchanged by this phase.
function recordBrowseTransportFailure() {
  const ctx = currentCtx();
  if (ctx) ctx.browseTransportFailures += 1;
}

// A finer-grained tag on top of the generic browseCalls total, for the
// specific getGradingDetails() sub-consumer Phase 14R asks to distinguish
// from the sweep/allocated search calls that make up the rest of a
// refresh-deals invocation's browseCalls.
function recordGradedDetailCall() {
  const ctx = currentCtx();
  if (ctx) ctx.gradedDetailCalls += 1;
}

// A candidate that was deliberately NOT looked up this run because a cap
// (e.g. GRADED_LOOKUP_CAP) was already reached - distinct from a 14Q
// dedupe save (below): this call may still happen on a LATER run, it was
// never answered from already-known data.
function recordCallSkipped() {
  const ctx = currentCtx();
  if (ctx) ctx.callsSkipped += 1;
}

// Phase 14Q's freshness dedupe: only call this at the exact point a real
// eBay call was avoided BECAUSE the answer was already known from a call
// this system already had to make for another reason (never for a path
// that was never going to call eBay at all - e.g. a row that already had
// a stored image, or a listing this sweep never even matched).
function recordDedupeSavedImage() {
  const ctx = currentCtx();
  if (ctx) ctx.dedupeSavedImage += 1;
}
function recordDedupeSavedGrading() {
  const ctx = currentCtx();
  if (ctx) ctx.dedupeSavedGrading += 1;
}

// remainingStart/remainingEnd/limit/reserveFloor - pass whichever are
// known at each call site; undefined fields are left as-is (so a route
// can call this twice, once with remainingStart before the work and once
// with remainingEnd after, without clobbering the other).
function setQuotaSnapshot({ remainingStart, remainingEnd, limit, reserveFloor } = {}) {
  const ctx = currentCtx();
  if (!ctx) return;
  if (remainingStart !== undefined) ctx.quotaRemainingStart = remainingStart;
  if (remainingEnd !== undefined) ctx.quotaRemainingEnd = remainingEnd;
  if (limit !== undefined) ctx.quotaLimit = limit;
  if (reserveFloor !== undefined) ctx.reserveFloor = reserveFloor;
}

function markSkipped(reason) {
  const ctx = currentCtx();
  if (!ctx) return;
  ctx.status = "skipped";
  ctx.skipReason = reason;
}

function markPartial() {
  const ctx = currentCtx();
  if (ctx && ctx.status === "success") ctx.status = "partial";
}

function markError(err) {
  const ctx = currentCtx();
  if (!ctx) return;
  ctx.status = "error";
  ctx.errorClass = err?.name || "Error";
}

// db: a supabaseAdmin() client, same convention as lib/discoveryLog.js's
// logDiscoveryEvent(db, event) - the caller already has one, telemetry
// does not construct its own. Best-effort: any failure is swallowed so a
// telemetry outage can never turn a successful (or already-failed) job
// invocation into a harder failure.
async function finishJobRun(db, ctx) {
  if (!ctx) return;
  try {
    if (!db) return;
    // browse-budget-r1 - every Browse route already calls this in its finally,
    // so the invocation's budget lease is settled here: the attempts it
    // started are charged and only provably unsent units are released. If the
    // process dies first, the lease expires and is charged in full.
    if (ctx.browseLease?.kind) {
      await require("./browseBudget").settleBrowseLease(db, ctx.browseLease).catch(() => {});
    }
    // pacing-reset-r1: observe attempts made without a lease, charged once
    if (ctx.unleasedBrowseAttempts > 0 && !ctx.unleasedRecorded) {
      ctx.unleasedRecorded = true;
      const r = await require("./browseBudget")
        .recordUnleasedAttempts(db, { attempts: ctx.unleasedBrowseAttempts, job: ctx.job, startedAt: ctx.startedAt })
        .catch(() => ({ recorded: false, reason: "ledger_error" }));
      if (!r.recorded) {
        console.warn(JSON.stringify({ event: "browse_unleased_attempts_unrecorded", job: ctx.job, attempts: ctx.unleasedBrowseAttempts, reason: r.reason }));
      }
    }
    const row = {
      job: ctx.job,
      mode: ctx.mode,
      country: ctx.country,
      started_at: ctx.startedAt,
      completed_at: new Date().toISOString(),
      browse_calls: ctx.browseCalls,
      analytics_calls: ctx.analyticsCalls,
      graded_detail_calls: ctx.gradedDetailCalls,
      calls_skipped: ctx.callsSkipped,
      quota_remaining_start: ctx.quotaRemainingStart,
      quota_remaining_end: ctx.quotaRemainingEnd,
      quota_limit: ctx.quotaLimit,
      reserve_floor: ctx.reserveFloor,
      skip_reason: ctx.skipReason,
      dedupe_saved_image: ctx.dedupeSavedImage,
      dedupe_saved_grading: ctx.dedupeSavedGrading,
      status: ctx.status,
      error_class: ctx.errorClass,
      ...browseOutcomeColumns(ctx),
    };
    const ins = await db.from("ebay_job_runs").insert(row);
    if (ins?.error && isMissingBrowseOutcomeColumn(ins.error)) {
      // one-time downgrade for this process: re-insert without them
      setBrowseOutcomeColumns(false);
      for (const k of BROWSE_OUTCOME_KEYS) delete row[k];
      await db.from("ebay_job_runs").insert(row);
    }
  } catch (e) {
    console.error("ebay telemetry persist failed (non-fatal):", e?.message);
  }
  // ppt-telemetry-r1 - this run's PokemonPriceTracker attempts, one insert-only
  // row (lib/pptTelemetry). Separate and best effort: never affects the run.
  try {
    if (db) await require("./pptTelemetry").flushJobRunPpt(db, ctx);
  } catch (e) {
    console.error("ppt telemetry persist failed (non-fatal):", e?.message);
  }
}

// browse-budget-r1 - the invocation's Browse budget lease (lib/browseBudget.mjs)
// lives in the same AsyncLocalStorage job context, so concurrent invocations
// in one function instance never share a lease.
function browseBudgetMode() {
  const m = String(process.env.BROWSE_BUDGET_MODE ?? "off").trim().toLowerCase();
  return m === "observe" || m === "enforce" ? m : "off";
}

function attachBrowseLease(lease) {
  const ctx = currentCtx();
  if (ctx) ctx.browseLease = lease ?? null;
}

// ppt-telemetry-r1 - read-only access for lib/pptTelemetry attribution.
function currentJobContext() {
  return currentCtx();
}

function currentBrowseLease() {
  return currentCtx()?.browseLease ?? null;
}

// Called by lib/ebay.fetchWithRetry immediately BEFORE every Browse attempt
// (first tries and retries alike). Synchronous, so parallel attempts inside
// one invocation cannot both take the last unit. Every attempt that is
// allowed is counted, whatever its outcome later (a timeout or network error
// may still have consumed eBay quota).
//   off      always allowed (today's behaviour)
//   observe  always allowed; attempts are counted on the lease if one exists
//   enforce  allowed only with a lease, below its grant and before the
//            window's guard instant
//   no job context (a manual script, any non-route caller): refused in
//            enforce mode, after this process's durable clearance was refused
//            (browseBudget.ensureManualBrowseAllowed), or past a clearance's
//            window. Every committed script that can send a Browse request
//            obtains that clearance first (tests/scanner/browse-budget BB-14/16),
//            so production enforcement does not depend on a local flag.
//   a lease in a PENDING enforce window (effective "observe"): allowed and
//            counted - that window keeps today's protections
let manualBrowseClearance = null;
function setManualBrowseClearance(clearance) {
  manualBrowseClearance = clearance ?? null;
}

// crossmatch-price-pilot-r1 - a HARD attempt ceiling for one bounded piece of
// work inside an invocation (the cross-matching pricing pilot sets it around
// each substitution). Checked on every Browse attempt - retries included - in
// EVERY budget mode, before and independently of any lease. Refused attempts
// are counted; the ceiling is removed when that work ends.
function setBrowseAttemptGuard(limit) {
  const ctx = currentCtx();
  if (!ctx) return null;
  ctx.attemptGuard = { limit: Math.max(0, Math.floor(Number(limit) || 0)), attempts: 0, refused: 0 };
  return ctx.attemptGuard;
}
function clearBrowseAttemptGuard() {
  const ctx = currentCtx();
  if (ctx) ctx.attemptGuard = null;
}

function consumeBrowseAttempt(now = Date.now()) {
  const guard = currentCtx()?.attemptGuard ?? null;
  if (guard && guard.attempts >= guard.limit) {
    guard.refused += 1;
    return false;
  }
  const allowed = leaseAllowsBrowseAttempt(now);
  if (allowed && guard) guard.attempts += 1;
  return allowed;
}

function leaseAllowsBrowseAttempt(now) {
  const ctx = currentCtx();
  const mode = browseBudgetMode();
  if (!ctx) {
    if (mode === "enforce") return false;
    if (manualBrowseClearance?.refused) return false;
    if (manualBrowseClearance?.guardAt != null && now >= manualBrowseClearance.guardAt) return false;
    return true;
  }
  const lease = ctx.browseLease ?? null;
  if (mode !== "enforce") {
    if (lease) lease.attempts += 1;
    // pacing-reset-r1: observe never blocks; an attempt with no lease is still
    // accounted (browseBudget.recordUnleasedAttempts, once, at finishJobRun)
    else if (mode === "observe") ctx.unleasedBrowseAttempts = (ctx.unleasedBrowseAttempts ?? 0) + 1;
    return true;
  }
  if (!lease) return false;
  if (lease.mode !== "enforce") {
    lease.attempts += 1;
    return true;
  }
  if (now >= lease.guardAt) return false;
  if (lease.attempts >= lease.granted) return false;
  lease.attempts += 1;
  return true;
}

// true when an enforce-mode lease has no units left (callers stop queueing
// work - e.g. before spending a PPT credit on a card they cannot search).
function browseLeaseExhausted(now = Date.now()) {
  if (browseBudgetMode() !== "enforce") return false;
  const lease = currentBrowseLease();
  if (!lease) return true;
  if (lease.mode !== "enforce") return false;
  return lease.attempts >= lease.granted || now >= lease.guardAt;
}

module.exports = {
  beginJobRun,
  finishJobRun,
  currentCtx,
  recordBrowseCall,
  recordAnalyticsCall,
  recordGradedDetailCall,
  currentJobContext,
  recordCallSkipped,
  recordDedupeSavedImage,
  recordDedupeSavedGrading,
  setQuotaSnapshot,
  markSkipped,
  markPartial,
  markError,
  browseBudgetMode,
  attachBrowseLease,
  currentBrowseLease,
  consumeBrowseAttempt,
  recordBrowseOutcome,
  recordBrowseTransportFailure,
  browseOutcomeColumns,
  setBrowseAttemptGuard,
  clearBrowseAttemptGuard,
  browseLeaseExhausted,
  setManualBrowseClearance,
};
