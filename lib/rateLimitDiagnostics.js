// WHY THIS EXISTS. On 2026-09-16, getBrowseRateLimit() returned no usable
// reading for 7h05m (09:45:11Z - 16:50:32Z, 81 consecutive scheduled runs).
// Every job recorded quota_remaining_start = null and carried on unleased;
// the budget ledger stopped reconciling against the provider for the whole
// stretch. The cause is STILL UNRESOLVED, because the function had four
// separate `return null` exits plus a bare `catch {}` and recorded nothing
// at any of them - no status, no provider error code, no error class. The
// records could not tell an Analytics-specific authorisation or permission
// refusal from a changed payload shape from a parse failure. (Browse
// succeeding on the same OAuth token does NOT exclude an Analytics-specific
// 401/403: it is a different API resource with its own authorisation.)
//
// This module builds ONE structured line per failed exit. It is diagnosis
// only:
//   * it makes no provider request, retries nothing, and assumes no quota;
//   * it never changes what getBrowseRateLimit RETURNS, so every caller's
//     fail-open / fail-closed behaviour is exactly as before;
//   * it is bounded - one line per failed call, and each scheduled run makes
//     at most two such calls (~300/day across every cron).
//
// SAFETY. Never log a token, an Authorization header, or a response body.
// Only these leave the process: the failure category, the HTTP status, the
// provider's own numeric errorId / domain / category enums, an error class
// name, a capped list of API RESOURCE NAMES (e.g. "buy.browse"), and the job
// correlation fields already written to ebay_job_runs.

const EVENT = "browse_rate_limit_unavailable";

// The exits, named. `shape` covers both "no buy.browse resource" and a
// buy.browse resource whose rate object is missing or unusable.
const CATEGORIES = Object.freeze(["token", "fetch", "http", "parse", "shape"]);

const MAX_RESOURCE_NAMES = 12;
const MAX_STRING = 80;

const clip = (v) => (v == null ? null : String(v).slice(0, MAX_STRING));

// eBay error bodies are { errors: [{ errorId, domain, category, subdomain,
// message, ... }] }. ONLY the machine-readable enums are taken - never
// `message`, `parameters` or `longMessage`, which can echo request content.
function providerErrorCode(body) {
  const first = Array.isArray(body?.errors) ? body.errors[0] : null;
  if (!first) return null;
  const out = {};
  if (first.errorId != null) out.errorId = Number(first.errorId);
  if (first.domain != null) out.domain = clip(first.domain);
  if (first.category != null) out.category = clip(first.category);
  if (first.subdomain != null) out.subdomain = clip(first.subdomain);
  return Object.keys(out).length ? out : null;
}

// Which API resources the response did contain - the direct evidence for
// "missing expected resource". Resource names are fixed API identifiers.
function resourceNames(body) {
  const names = [];
  for (const group of body?.rateLimits ?? []) {
    for (const resource of group?.resources ?? []) {
      if (resource?.name == null) continue;
      names.push(clip(resource.name));
      if (names.length >= MAX_RESOURCE_NAMES) return names;
    }
  }
  return names;
}

// The line itself. Pure: takes what the exit knows, returns the payload.
// `job` is the ebay_job_runs correlation (job / mode / country / startedAt),
// so a diagnostic line joins to the run row that recorded the null reading.
function rateLimitDiagnostic(category, { status = null, error = null, body = null, reason = null, job = null } = {}) {
  const payload = {
    event: EVENT,
    category: CATEGORIES.includes(category) ? category : "shape",
    at: new Date().toISOString(),
  };
  if (status != null) payload.status = Number(status);
  if (reason) payload.reason = clip(reason);
  if (error) {
    payload.errorClass = clip(error.name ?? error.constructor?.name ?? "Error");
    // fetch failures carry a machine-readable cause code (ENOTFOUND,
    // ECONNRESET, UND_ERR_CONNECT_TIMEOUT); the message itself is not logged.
    const code = error.code ?? error.cause?.code ?? null;
    if (code) payload.errorCode = clip(code);
  }
  if (body) {
    const provider = providerErrorCode(body);
    if (provider) payload.providerError = provider;
    if (category === "shape") payload.resources = resourceNames(body);
  }
  if (job) {
    payload.job = clip(job.job);
    if (job.mode) payload.mode = clip(job.mode);
    if (job.country) payload.country = clip(job.country);
    if (job.startedAt) payload.jobStartedAt = clip(job.startedAt);
  }
  return payload;
}

// One bounded line. Never throws: a diagnostic must not be able to break the
// call it is describing.
function reportRateLimitFailure(category, details = {}) {
  try {
    console.warn(JSON.stringify(rateLimitDiagnostic(category, details)));
  } catch {
    /* diagnosis is best-effort */
  }
  return null; // every caller returns null; this keeps that literal at the exit
}

module.exports = { EVENT, CATEGORIES, providerErrorCode, resourceNames, rateLimitDiagnostic, reportRateLimitFailure };
