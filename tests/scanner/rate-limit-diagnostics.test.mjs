// getBrowseRateLimit's failed exits, made distinguishable.
//
// The 2026-09-16 outage (09:45:11Z - 16:50:32Z, 81 scheduled runs with
// quota_remaining_start = null) could not be attributed because the function
// had four `return null` exits plus a bare catch and recorded nothing. These
// tests drive each exit offline - no network, no provider - and pin both the
// category reported and what may never be logged.

import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..");
const read = (p) => readFileSync(join(REPO, p), "utf8");
const D = require("../../lib/rateLimitDiagnostics.js");

// --- offline fixtures ----------------------------------------------------

const TOKEN_BODY = { access_token: "SECRET-TOKEN-VALUE", expires_in: 7200 };
const okResponse = (body, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
});
const unparseable = (status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => { throw new SyntaxError("Unexpected token < in JSON at position 0"); },
});
const rateBody = (rate) => ({ rateLimits: [{ resources: [{ name: "buy.browse", rates: [rate] }] }] });

const realFetch = globalThis.fetch;
const realWarn = console.warn;
let lines = [];
// Two queues, because the module caches its OAuth token in module scope: a
// single queue would shift out of step the moment a cached token skips the
// token request, making these tests order-dependent.
let tokenQueue = [];
let queue = [];

beforeEach(() => {
  lines = [];
  console.warn = (s) => lines.push(s);
  process.env.EBAY_CLIENT_ID = "test-id";
  process.env.EBAY_CLIENT_SECRET = "test-secret";
  globalThis.fetch = async (url) => {
    const isToken = String(url).includes("oauth2/token");
    const next = (isToken ? tokenQueue : queue).shift() ?? (isToken ? okResponse(TOKEN_BODY) : okResponse({}));
    if (next instanceof Error) throw next;
    return next;
  };
});
afterEach(() => {
  console.warn = realWarn;
  globalThis.fetch = realFetch;
  tokenQueue = [];
  queue = [];
});

const load = () => require("../../lib/ebay.js");
const parsed = () => lines.map((l) => JSON.parse(l)).filter((o) => o.event === D.EVENT);

// --- the five exits ------------------------------------------------------

test("1. token acquisition failure is reported as `token`, with no request made", async () => {
  // a token endpoint that refuses: getAccessToken throws before any fetch to
  // the analytics resource. Runs first, while the module's token cache is
  // still empty.
  tokenQueue = [{ ok: false, status: 401, text: async () => "invalid_client", json: async () => ({}) }];
  const { getBrowseRateLimit } = load();
  const out = await getBrowseRateLimit();
  assert.equal(out, null, "the return value is unchanged");
  const [line] = parsed();
  assert.equal(line.category, "token");
  assert.equal(line.errorClass, "Error");
  assert.equal(JSON.stringify(line).includes("invalid_client"), false, "the OAuth response body never reaches the log");
});

test("2. a fetch failure is reported as `fetch`, with the machine-readable cause code", async () => {
  const err = new Error("fetch failed");
  err.cause = { code: "ENOTFOUND" };
  queue = [err];
  const { getBrowseRateLimit } = load();
  assert.equal(await getBrowseRateLimit(), null);
  const [line] = parsed();
  assert.equal(line.category, "fetch");
  assert.equal(line.errorCode, "ENOTFOUND");
  assert.equal("status" in line, false, "no response, so no status");
});

test("3. a non-OK response is reported as `http`, with status and the provider's own error code", async () => {
  // the shape an Analytics-specific authorisation refusal would take - the
  // case Browse still working does NOT exclude
  queue = [
    okResponse({ errors: [{ errorId: 1100, domain: "ACCESS", category: "REQUEST", subdomain: "Analytics", message: "Insufficient permissions to access resource /rate_limit" }] }, 403),
  ];
  const { getBrowseRateLimit } = load();
  assert.equal(await getBrowseRateLimit(), null);
  const [line] = parsed();
  assert.equal(line.category, "http");
  assert.equal(line.status, 403);
  assert.deepEqual(line.providerError, { errorId: 1100, domain: "ACCESS", category: "REQUEST", subdomain: "Analytics" });
  assert.equal(JSON.stringify(line).includes("Insufficient permissions"), false, "the provider MESSAGE is never logged");
});

test("4. an unparseable body is `parse` when the response was OK, `http` when it was not", async () => {
  queue = [unparseable(200)];
  const { getBrowseRateLimit } = load();
  assert.equal(await getBrowseRateLimit(), null);
  assert.equal(parsed()[0].category, "parse");
  assert.equal(parsed()[0].errorClass, "SyntaxError");

  lines = [];
  queue = [unparseable(502)];
  assert.equal(await getBrowseRateLimit(), null);
  assert.equal(parsed()[0].category, "http", "an HTML error page is the HTTP failure, not a parse bug");
  assert.equal(parsed()[0].status, 502);
});

test("5. a body without buy.browse is `shape`, and names the resources it DID carry", async () => {
  queue = [okResponse({ rateLimits: [{ resources: [{ name: "buy.marketing", rates: [{ remaining: 5 }] }, { name: "sell.analytics", rates: [] }] }] })];
  const { getBrowseRateLimit } = load();
  assert.equal(await getBrowseRateLimit(), null);
  const [line] = parsed();
  assert.equal(line.category, "shape");
  assert.equal(line.reason, "no_buy_browse_resource");
  assert.deepEqual(line.resources, ["buy.marketing", "sell.analytics"]);
});

test("6. buy.browse present but with no rate object is `shape`/no_rate_object", async () => {
  queue = [okResponse({ rateLimits: [{ resources: [{ name: "buy.browse", rates: [] }] }] })];
  const { getBrowseRateLimit } = load();
  assert.equal(await getBrowseRateLimit(), null);
  assert.equal(parsed()[0].reason, "no_rate_object");
});

test("7. a rate object missing `remaining` is reported but STILL returned - behaviour unchanged", async () => {
  queue = [okResponse(rateBody({ limit: 5000, reset: "2026-09-17T07:00:00.000Z", timeWindow: 86400 }))];
  const { getBrowseRateLimit } = load();
  const out = await getBrowseRateLimit();
  assert.ok(out, "the reading object is still returned");
  assert.equal(out.remaining, null);
  assert.equal(out.limit, 5000);
  assert.equal(parsed()[0].reason, "rate_missing_remaining", "the silent null-remaining path now says so");
});

test("8. the healthy path returns the reading and logs NOTHING", async () => {
  queue = [okResponse(rateBody({ limit: 5000, remaining: 4930, reset: "2026-09-17T07:00:00.000Z", timeWindow: 86400 }))];
  const { getBrowseRateLimit } = load();
  const out = await getBrowseRateLimit();
  assert.equal(out.remaining, 4930);
  assert.equal(out.limit, 5000);
  assert.equal(out.timeWindow, 86400);
  assert.ok(out.readAt);
  assert.equal(parsed().length, 0, "no diagnostic on success");
});

// --- what may never leave the process ------------------------------------

test("9. no token, credential or response body is ever logged", async () => {
  queue = [
    okResponse({ errors: [{ errorId: 1001, domain: "ACCESS", message: "Invalid access token abcd.SECRET-TOKEN-VALUE.efgh" }] }, 401),
  ];
  const { getBrowseRateLimit } = load();
  await getBrowseRateLimit();
  const all = lines.join(" ");
  for (const secret of ["SECRET-TOKEN-VALUE", "test-secret", "test-id", "Authorization", "Bearer", "Invalid access token"]) {
    assert.equal(all.includes(secret), false, `${secret} must never be logged`);
  }
  // and the builder is allow-list shaped, not a body dump
  const payload = D.rateLimitDiagnostic("http", {
    status: 401,
    body: { errors: [{ errorId: 1001, domain: "ACCESS", message: "secret", parameters: [{ value: "secret" }], longMessage: "secret" }] },
  });
  assert.deepEqual(Object.keys(payload.providerError).sort(), ["domain", "errorId"]);
  assert.equal(JSON.stringify(payload).includes("secret"), false);
});

test("10. every line carries the job correlation already written to ebay_job_runs", () => {
  const line = D.rateLimitDiagnostic("http", {
    status: 429,
    job: { job: "refresh-deals:allocated", mode: "allocated", country: "EBAY_GB", startedAt: "2026-09-16T10:00:28.298Z" },
  });
  assert.equal(line.event, "browse_rate_limit_unavailable");
  assert.equal(line.job, "refresh-deals:allocated");
  assert.equal(line.mode, "allocated");
  assert.equal(line.country, "EBAY_GB");
  assert.equal(line.jobStartedAt, "2026-09-16T10:00:28.298Z");
  assert.ok(line.at);
  // an unknown category never widens the set
  assert.equal(D.rateLimitDiagnostic("nonsense", {}).category, "shape");
  assert.deepEqual(D.CATEGORIES, ["token", "fetch", "http", "parse", "shape"]);
});

test("11. diagnosis cannot break the call it describes, and adds no request or retry", () => {
  // a body that throws on property access must not escape
  const hostile = new Proxy({}, { get() { throw new Error("boom"); } });
  assert.doesNotThrow(() => D.reportRateLimitFailure("shape", { body: hostile }));
  assert.equal(D.reportRateLimitFailure("fetch", {}), null, "the exit still returns null");

  const src = read("lib/ebay.js");
  // strip // comments: the function DESCRIBES fetchWithRetry and the
  // analytics pool, so only executable code is asserted on
  const fn = src.slice(src.indexOf("async function getBrowseRateLimit()"), src.indexOf("module.exports = {")).replace(/^\s*\/\/.*$/gm, "");
  assert.equal((fn.match(/await fetch\(/g) ?? []).length, 1, "exactly one outbound request, as before");
  assert.doesNotMatch(fn, /fetchWithRetry/, "the meta-call still never retries");
  assert.equal((fn.match(/recordAnalyticsCall\(\)/g) ?? []).length, 1, "accounting unchanged");
  // the reading object itself is untouched
  for (const field of ["limit: rate.limit", "remaining: rate.remaining", "reset: rate.reset", "timeWindow: rate.timeWindow"]) {
    assert.ok(fn.includes(field), `${field} preserved`);
  }
  // callers still decide for themselves - no fail-open/fail-closed change
  assert.match(read("app/api/refresh-deals/route.js"), /A failed meta-call\s*\n?\s*\/\/ returns null -> proceed rather than block on it\./);
});
