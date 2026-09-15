// ppt-telemetry-r1 - PokemonPriceTracker REQUEST telemetry. Counts actual
// outbound HTTP attempts made through lib/pokemonPriceTracker's shared
// request path (fetchPPT, fetchPPTPaced - every retry is its own attempt -
// and the /export download). Measures requests and attempts only: never
// credits or spending (the documented Business-tier allowance is unverified).
//
// What an attempt records: consumer, endpoint family, the lib function that
// made it, and its outcome (ok / 429 / failed / network_error), plus a 429's
// provider limitType when the error body names one ("per_minute"). Never the
// API key, request query values (card ids, search text), response bodies or
// any personal data. Provider rate headers are kept only if the response
// carries the standard x-ratelimit-limit / -remaining / -reset or
// retry-after headers, as numbers; no request is made to discover them.
//
// Where it is stored (existing catalog_snapshot table, no migration), always
// as INSERT-only rows so concurrent writers never lose each other's counts:
//   - inside an eBay job run (lib/ebayTelemetry beginJobRun context, e.g.
//     refresh-deals sweeps): counts accumulate on that run's context and are
//     written as ONE row when finishJobRun persists the run;
//   - anywhere else (pages, card search, catalogue syncs, scripts): one row
//     per attempt, written right after the attempt.
// kind = "ppt_requests:<YYYY-MM-DD>:<ISO time>:<random>" (UTC day of the
// write). Daily totals are the sum of that day's rows
// (scripts/pptRequestReport.mjs). Rows older than 35 days are pruned.
//
// Consumer: an explicit withPptConsumer/setPptConsumer tag, else the eBay
// job run's job name, else "unknown" - never guessed.
//
// Telemetry never changes a request, its result, retries or caching, and a
// recording failure is swallowed.

const { AsyncLocalStorage } = require("node:async_hooks");

const KIND_PREFIX = "ppt_requests:";
const RETENTION_MS = 35 * 24 * 60 * 60 * 1000;
const WRITE_TIMEOUT_MS = 1500;

const consumerStore = new AsyncLocalStorage();

// Tag every PPT request made inside fn (and anything it awaits).
function withPptConsumer(consumer, fn) {
  return consumerStore.run({ consumer: String(consumer) }, fn);
}
// Tag the rest of the current invocation (a route handler's first line).
function setPptConsumer(consumer) {
  consumerStore.enterWith({ consumer: String(consumer) });
}

function jobCtx() {
  try {
    return require("./ebayTelemetry").currentJobContext();
  } catch {
    return null;
  }
}

function resolveConsumer(ctx = jobCtx()) {
  return consumerStore.getStore()?.consumer ?? ctx?.job ?? "unknown";
}

// "/api/v2/cards?tcgPlayerId=..&includeEbay=true" -> "cards+ebay". Only the
// path family and the two cost-shaping flags; no query values.
function endpointOf(url) {
  try {
    const u = new URL(String(url));
    const family = u.pathname.replace(/^\/api\/v2\/?/, "").split("/")[0] || "root";
    const flags = [u.searchParams.get("includeEbay") === "true" ? "ebay" : null, u.searchParams.get("includeHistory") === "true" ? "history" : null].filter(Boolean);
    return [family.replace(/[^a-z0-9_-]/gi, ""), ...flags].join("+");
  } catch {
    return "unparsed";
  }
}

// A 429 body's provider limit type ("per_minute"), sanitised; nothing else.
function limitTypeOf(text) {
  const m = String(text ?? "").match(/"limitType"\s*:\s*"([a-z_]{1,24})"/i);
  return m ? m[1].toLowerCase() : null;
}

const RATE_HEADERS = ["x-ratelimit-limit", "x-ratelimit-remaining", "x-ratelimit-reset", "retry-after"];
function rateHeadersOf(res) {
  const out = {};
  try {
    for (const h of RATE_HEADERS) {
      const v = res?.headers?.get?.(h);
      if (v != null && /^\d{1,12}$/.test(String(v).trim())) out[h] = Number(v);
    }
  } catch {
    /* no headers */
  }
  return Object.keys(out).length ? out : null;
}

function classify(res, error) {
  if (error) return "network_error";
  if (res?.ok) return "ok";
  if (res?.status === 429) return "r429";
  return "failed";
}

let sinkOverride = null; // tests
let adminClient = null;
function sink() {
  if (sinkOverride) return sinkOverride;
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) return null;
  if (!adminClient) adminClient = require("./supabaseAdmin").supabaseAdmin();
  return adminClient;
}
function setPptTelemetrySink(db) {
  sinkOverride = db;
}

function rowKind(at) {
  return `${KIND_PREFIX}${at.slice(0, 10)}:${at}:${Math.random().toString(36).slice(2, 10)}`;
}

async function insertRow(db, data) {
  if (!db) return false;
  const at = data.at;
  const write = Promise.resolve()
    .then(() => db.from("catalog_snapshot").insert({ kind: rowKind(at), data, updated_at: at }))
    .then((r) => !r?.error)
    .catch(() => false);
  const timeout = new Promise((resolve) => setTimeout(() => resolve(false), WRITE_TIMEOUT_MS).unref?.());
  return Promise.race([write, timeout]);
}

function emptyCounts() {
  return { attempts: 0, ok: 0, r429: 0, failed: 0, network_error: 0, retries: 0 };
}

// Called once per outbound attempt, AFTER it settled. Never throws.
// attempt: 0 for a first try, 1.. for retries of the same logical request.
async function recordPptAttempt({ url, op, res = null, error = null, attempt = 0, bodyText = null }) {
  try {
    const ctx = jobCtx();
    const consumer = resolveConsumer(ctx);
    const endpoint = endpointOf(url);
    const outcome = classify(res, error);
    const limitType = outcome === "r429" ? limitTypeOf(bodyText) : null;
    const headers = rateHeadersOf(res);
    if (ctx) {
      const byKey = (ctx.ppt ??= { consumer, counts: {}, rateHeaders: null });
      const key = `${consumer}|${endpoint}|${op ?? "unknown"}`;
      const c = (byKey.counts[key] ??= { consumer, endpoint, op: op ?? "unknown", ...emptyCounts(), limitTypes: {} });
      c.attempts += 1;
      c[outcome] += 1;
      if (attempt > 0) c.retries += 1;
      if (limitType) c.limitTypes[limitType] = (c.limitTypes[limitType] ?? 0) + 1;
      if (headers) byKey.rateHeaders = headers;
      return;
    }
    const at = new Date().toISOString();
    await insertRow(sink(), {
      v: 1,
      source: "request",
      at,
      counts: [{ consumer, endpoint, op: op ?? "unknown", ...emptyCounts(), attempts: 1, [outcome]: 1, retries: attempt > 0 ? 1 : 0, limitTypes: limitType ? { [limitType]: 1 } : {} }],
      rateHeaders: headers,
    });
  } catch {
    /* telemetry must never affect the request path */
  }
}

let lastPruneAt = 0;
// finishJobRun calls this with the run's db client. Never throws.
async function flushJobRunPpt(db, ctx) {
  try {
    const counts = Object.values(ctx?.ppt?.counts ?? {});
    if (!db || counts.length === 0) return;
    const at = new Date().toISOString();
    await insertRow(db, { v: 1, source: "job_run", at, job: ctx.job ?? null, mode: ctx.mode ?? null, country: ctx.country ?? null, startedAt: ctx.startedAt ?? null, counts, rateHeaders: ctx.ppt.rateHeaders ?? null });
    if (Date.now() - lastPruneAt > 60 * 60 * 1000) {
      lastPruneAt = Date.now();
      await db.from("catalog_snapshot").delete().like("kind", `${KIND_PREFIX}%`).lt("updated_at", new Date(Date.now() - RETENTION_MS).toISOString());
    }
  } catch {
    /* best effort */
  }
}

// Sum rows (as read from catalog_snapshot) into per consumer/endpoint/op totals.
function aggregatePptRows(rows) {
  const totals = new Map();
  for (const row of rows ?? []) {
    for (const c of row?.data?.counts ?? []) {
      const key = `${c.consumer}|${c.endpoint}|${c.op}`;
      const t = totals.get(key) ?? { consumer: c.consumer, endpoint: c.endpoint, op: c.op, ...emptyCounts(), limitTypes: {} };
      for (const f of Object.keys(emptyCounts())) t[f] += Number(c[f] ?? 0);
      for (const [k, v] of Object.entries(c.limitTypes ?? {})) t.limitTypes[k] = (t.limitTypes[k] ?? 0) + Number(v);
      totals.set(key, t);
    }
  }
  return [...totals.values()].sort((a, b) => b.attempts - a.attempts);
}

module.exports = {
  KIND_PREFIX,
  RETENTION_MS,
  withPptConsumer,
  setPptConsumer,
  resolveConsumer,
  endpointOf,
  limitTypeOf,
  rateHeadersOf,
  recordPptAttempt,
  flushJobRunPpt,
  aggregatePptRows,
  setPptTelemetrySink,
};
