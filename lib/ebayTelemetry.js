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
    await db.from("ebay_job_runs").insert({
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
    });
  } catch (e) {
    console.error("ebay telemetry persist failed (non-fatal):", e?.message);
  }
}

module.exports = {
  beginJobRun,
  finishJobRun,
  currentCtx,
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
};
