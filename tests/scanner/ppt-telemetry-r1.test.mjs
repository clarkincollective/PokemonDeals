// ppt-telemetry-r1 - PokemonPriceTracker request telemetry on the shared
// request path. Global fetch is stubbed (no network); telemetry rows go to an
// in-memory database. Checks: attempts are counted exactly once each
// (retries included), outcomes are classified, results / errors / retries
// are unchanged, and a recording failure never breaks the request.

import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
process.env.POKEMONPRICETRACKER_API_KEY = "test-key-never-recorded";
const T = require(join(REPO, "lib/pptTelemetry.js"));
const PPT = require(join(REPO, "lib/pokemonPriceTracker.js"));
const telemetry = require(join(REPO, "lib/ebayTelemetry.js"));
const { createMemoryDb } = await import(pathToFileURL(join(REPO, "tests/harness/ingestion/memoryDb.mjs")).href);

const realFetch = globalThis.fetch;
function stubFetch(responses) {
  const seen = [];
  globalThis.fetch = async (url, init) => {
    seen.push({ url: String(url), auth: init?.headers?.Authorization });
    const next = responses.shift();
    if (next instanceof Error) throw next;
    const { status = 200, body = {}, headers = {} } = next;
    return new Response(typeof body === "string" ? body : JSON.stringify(body), { status, headers });
  };
  return seen;
}
const pptRows = (db) => db.tables.catalog_snapshot.filter((r) => String(r.kind).startsWith("ppt_requests:"));
const one = (db) => {
  const rows = pptRows(db);
  assert.equal(rows.length, 1, "one row");
  assert.equal(rows[0].data.counts.length, 1);
  return rows[0];
};
function fresh() {
  const db = createMemoryDb({ catalog_snapshot: [], ebay_job_runs: [] });
  T.setPptTelemetrySink(db);
  return db;
}
test.afterEach(() => {
  globalThis.fetch = realFetch;
  T.setPptTelemetrySink(null);
});

test("PT-1. a successful request: one attempt, result unchanged, nothing sensitive recorded", async () => {
  const db = fresh();
  const seen = stubFetch([{ body: { data: [{ id: "sv1", name: "Scarlet & Violet" }] }, headers: { "x-ratelimit-remaining": "499", "x-ratelimit-limit": "500", "x-other": "zzz" } }]);
  const out = await PPT.searchCards("charizard secret query", { limit: 5 });
  assert.equal(seen.length, 1, "exactly the request the caller made");
  assert.equal(seen[0].auth, "Bearer test-key-never-recorded");
  assert.deepEqual(out, { results: [{ id: "sv1", name: "Scarlet & Violet" }], total: null, hasMore: false });
  const row = one(db);
  assert.match(row.kind, /^ppt_requests:\d{4}-\d{2}-\d{2}:/);
  assert.deepEqual(
    { ...row.data.counts[0], limitTypes: undefined },
    { consumer: "unknown", endpoint: "cards", op: "searchCards", attempts: 1, ok: 1, r429: 0, failed: 0, network_error: 0, retries: 0, limitTypes: undefined }
  );
  assert.deepEqual(row.data.rateHeaders, { "x-ratelimit-limit": 500, "x-ratelimit-remaining": 499 });
  const text = JSON.stringify(row);
  for (const secret of ["test-key-never-recorded", "charizard", "secret query", "Scarlet", "limit=5", "http"]) assert.ok(!text.includes(secret), `row must not contain ${secret}`);
});

test("PT-2. 429 and other failures are classified; the thrown error is unchanged; no retry is added", async () => {
  const db = fresh();
  const body429 = '{"error":"Rate limit exceeded (500 calls/min)","retryAfter":17,"limitType":"per_minute"}';
  const seen = stubFetch([{ status: 429, body: body429 }, { status: 500, body: "upstream exploded" }, new TypeError("fetch failed")]);
  await assert.rejects(() => PPT.getGradedPrice("12345", "PSA", "10"), (e) => e.message === `PokemonPriceTracker request failed: 429 ${body429}`);
  await assert.rejects(() => PPT.getSealedPrice("777"), (e) => e.message === "PokemonPriceTracker request failed: 500 upstream exploded");
  await assert.rejects(() => PPT.listSets(), (e) => e instanceof TypeError && e.message === "fetch failed");
  assert.equal(seen.length, 3, "one attempt each - fetchPPT never retries");
  const byOp = Object.fromEntries(pptRows(db).map((r) => [r.data.counts[0].op, r.data.counts[0]]));
  assert.deepEqual([byOp.getGradedPrice.endpoint, byOp.getGradedPrice.r429, byOp.getGradedPrice.limitTypes], ["cards+ebay", 1, { per_minute: 1 }]);
  assert.equal(byOp.getSealedPrice.failed, 1);
  assert.equal(byOp.listSets.network_error, 1);
  assert.ok(!JSON.stringify(pptRows(db)).includes("upstream exploded") && !JSON.stringify(pptRows(db)).includes("Rate limit exceeded"), "no response bodies");
});

test("PT-3. paced retries: every outbound attempt is counted once, retries marked, same number of fetches and same result", async () => {
  const db = fresh();
  const realTimeout = globalThis.setTimeout;
  globalThis.setTimeout = (fn, _ms, ...a) => realTimeout(fn, 0, ...a); // skip the backoff wait only
  try {
    const seen = stubFetch([
      { status: 429, body: '{"retryAfter":0,"limitType":"per_minute","error":"500 calls/min"}' },
      { status: 429, body: '{"retryAfter":0,"limitType":"per_minute","error":"500 calls/min"}' },
      { body: { data: { prices: { market: 12.5, conditions: { "Near Mint": { price: 12.5 } } } } } },
    ]);
    const ref = await PPT.getCatalogReference("555");
    assert.equal(seen.length, 3, "2 retries + success, as before");
    assert.ok(ref && "price" in ref);
  } finally {
    globalThis.setTimeout = realTimeout;
  }
  const counts = pptRows(db).map((r) => r.data.counts[0]);
  assert.equal(counts.length, 3, "one row per attempt outside a job run");
  const sum = T.aggregatePptRows(pptRows(db));
  assert.deepEqual(
    { ...sum[0], limitTypes: undefined },
    { consumer: "unknown", endpoint: "cards", op: "getCatalogReference", attempts: 3, ok: 1, r429: 2, failed: 0, network_error: 0, retries: 2, limitTypes: undefined }
  );
  assert.deepEqual(sum[0].limitTypes, { per_minute: 2 });
});

test("PT-4. a telemetry failure never breaks or changes the request", async () => {
  for (const sink of [
    { from: () => { throw new Error("db down"); } },
    { from: () => ({ insert: () => Promise.reject(new Error("insert failed")) }) },
    { from: () => ({ insert: () => Promise.resolve({ error: { message: "rls" } }) }) },
  ]) {
    T.setPptTelemetrySink(sink);
    const seen = stubFetch([{ body: { data: [{ id: "a" }] } }]);
    assert.deepEqual(await PPT.listSets(), [{ id: "a" }]);
    assert.equal(seen.length, 1);
  }
  // a hung write is abandoned after the bounded wait
  T.setPptTelemetrySink({ from: () => ({ insert: () => new Promise(() => {}) }) });
  stubFetch([{ body: { data: [] } }]);
  const t0 = Date.now();
  assert.deepEqual(await PPT.listSets(), []);
  assert.ok(Date.now() - t0 < 5000);
});

test("PT-5. inside an eBay job run: counts stay on the run and are written as ONE insert-only row with the run", async () => {
  const db = fresh();
  const recorded = await (async () => {
    const ctx = telemetry.beginJobRun({ job: "refresh-deals:sweep", mode: "sweep", country: "EBAY_US" });
    stubFetch([{ body: { data: {} } }, { status: 429, body: '{"limitType":"per_minute"}' }, { body: { data: {} } }]);
    await PPT.getConditionPrices("1").catch(() => null);
    await PPT.getGradedPrice("1", "PSA", "9").catch(() => null);
    await PPT.getGradedPrice("2", "PSA", "9").catch(() => null);
    assert.equal(pptRows(db).length, 0, "nothing written per attempt during a run");
    await telemetry.finishJobRun(db, ctx);
    return pptRows(db);
  })();
  assert.equal(db.tables.ebay_job_runs.length, 1, "the eBay run row is unchanged");
  assert.equal(recorded.length, 1);
  const d = recorded[0].data;
  assert.deepEqual([d.source, d.job, d.mode, d.country], ["job_run", "refresh-deals:sweep", "sweep", "EBAY_US"]);
  const sum = T.aggregatePptRows(recorded);
  const graded = sum.find((c) => c.op === "getGradedPrice");
  assert.deepEqual([graded.consumer, graded.endpoint, graded.attempts, graded.ok, graded.r429], ["refresh-deals:sweep", "cards+ebay", 2, 1, 1]);
  assert.equal(sum.find((c) => c.op === "getConditionPrices").attempts, 1);
});

test("PT-6. consumer: explicit tag, else the job, else an explicit unknown bucket", async () => {
  const db = fresh();
  stubFetch([{ body: { data: [] } }, { body: { data: [] } }]);
  await T.withPptConsumer("page:cards", () => PPT.listSets());
  await PPT.listSets();
  assert.deepEqual(pptRows(db).map((r) => r.data.counts[0].consumer).sort(), ["page:cards", "unknown"]);
  assert.equal(T.endpointOf("https://www.pokemonpricetracker.com/api/v2/cards?tcgPlayerId=1&includeEbay=true&includeHistory=true"), "cards+ebay+history");
  assert.equal(T.endpointOf("https://www.pokemonpricetracker.com/api/v2/sealed-products?setName=Evolving%20Skies"), "sealed-products");
  assert.equal(T.limitTypeOf('{"limitType":"<script>"}'), null);
});

test("PT-7. wiring: every PPT request in the shared client goes through the instrumented path", async () => {
  const { readFileSync } = await import("node:fs");
  const src = readFileSync(join(REPO, "lib/pokemonPriceTracker.js"), "utf8");
  assert.equal((src.match(/await fetch\(/g) ?? []).length, 3, "fetchPPT, fetchPPTPaced, downloadPrintingsExport");
  assert.equal((src.match(/recordPptAttempt\(/g) ?? []).length, 9);
  assert.doesNotMatch(src, /await fetchPPT\(url\);|await fetchPPTPaced\(url\);/, "every call site names its op");
  for (const [file, tag] of [["app/cards/[slug]/page.js", "page:cards"], ["app/deals/[id]/page.js", "page:deal"], ["app/sealed-deals/[id]/page.js", "page:sealed-deal"], ["app/search/page.js", "page:search"], ["app/api/card-search/route.js", "api:card-search"], ["app/api/sync-card-catalog/route.js", "cron:sync-card-catalog"], ["app/api/sync-watchlist/route.js", "cron:sync-watchlist"], ["app/api/sync-sealed-catalog/route.js", "cron:sync-sealed-catalog"]]) {
    assert.ok(readFileSync(join(REPO, file), "utf8").includes(`"${tag}"`), `${file} tags ${tag}`);
  }
});

test("PT-8. outside job runs the write is scheduled after the response through the request lifecycle, not awaited", async () => {
  const { readFileSync } = await import("node:fs");
  const src = readFileSync(join(REPO, "lib/pptTelemetry.js"), "utf8");
  const sched = src.slice(src.indexOf("function scheduleAfterResponse"), src.indexOf("let afterOverride"));
  assert.ok(sched.indexOf('require("next/server").after(') >= 0 && sched.indexOf('require("next/server").after(') < sched.indexOf('Symbol.for("@next/request-context")'), "Next after() first, then the request-context waitUntil");
  assert.match(src, /if \(!scheduleAfterResponse\(persist\)\) await persist\(\);/);

  // The real fallback path: a platform request context exposing waitUntil (as Vercel / next start provide).
  const db = createMemoryDb({ catalog_snapshot: [] });
  let release;
  const gate = new Promise((r) => (release = r));
  T.setPptTelemetrySink({ from: (t) => ({ insert: async (row) => { await gate; return db.from(t).insert(row); } }) });
  const tracked = [];
  const SYM = Symbol.for("@next/request-context");
  const prev = globalThis[SYM];
  globalThis[SYM] = { get: () => ({ waitUntil: (p) => tracked.push(p) }) };
  try {
    stubFetch([{ body: { data: [{ id: "x" }] } }]);
    const t0 = Date.now();
    const out = await PPT.listSets();
    const elapsed = Date.now() - t0;
    assert.deepEqual(out, [{ id: "x" }], "result unchanged");
    assert.ok(elapsed < 500, `request returned in ${elapsed}ms while the telemetry write is still blocked`);
    assert.equal(tracked.length, 1, "the write is handed to waitUntil (tracked, not fire-and-forget)");
    assert.equal(pptRows(db).length, 0, "not yet written when the caller got its result");
    release();
    await Promise.all(tracked);
    assert.equal(pptRows(db).length, 1, "written after the response, within the tracked lifetime");
  } finally {
    if (prev === undefined) delete globalThis[SYM];
    else globalThis[SYM] = prev;
  }
  // a scheduled write that fails is swallowed inside the tracked task
  T.setPptTelemetrySink({ from: () => ({ insert: () => Promise.reject(new Error("down")) }) });
  const tasks = [];
  T.setPptAfterResponse((task) => { tasks.push(task()); return true; });
  try {
    stubFetch([{ body: { data: [] } }]);
    assert.deepEqual(await PPT.listSets(), []);
    await assert.doesNotReject(() => Promise.all(tasks));
  } finally {
    T.setPptAfterResponse(null);
  }
});

test("PT-9. consumer tags are request-local: two concurrent, differently tagged requests never mix", async () => {
  const db = fresh();
  const delays = { sets: 40, "sealed-products": 5 };
  globalThis.fetch = async (url) => {
    const family = new URL(String(url)).pathname.replace("/api/v2/", "").split("/")[0];
    await new Promise((r) => setTimeout(r, delays[family] ?? 1));
    return new Response(JSON.stringify({ data: [] }), { status: 200 });
  };
  // (a) withPptConsumer scopes, interleaved: A starts first and finishes last
  const a = T.withPptConsumer("page:cards", async () => { await PPT.listSets(); await PPT.listSets(); });
  const b = T.withPptConsumer("api:card-search", async () => { await PPT.getSealedPrice("1").catch(() => null); await PPT.getSealedPrice("2").catch(() => null); });
  // (b) setPptConsumer (route handlers) from two separate request roots
  const root = (tag, fn) => new Promise((resolve) => setImmediate(async () => { T.setPptConsumer(tag); await fn(); resolve(); }));
  const c = root("cron:sync-watchlist", async () => { await PPT.listSets(); });
  const d = root("page:search", async () => { await PPT.getSealedPrice("3").catch(() => null); });
  await Promise.all([a, b, c, d]);
  const byConsumer = {};
  for (const r of pptRows(db)) {
    const x = r.data.counts[0];
    (byConsumer[x.consumer] ??= new Set()).add(x.op);
  }
  assert.deepEqual(Object.fromEntries(Object.entries(byConsumer).map(([k, v]) => [k, [...v]])), {
    "page:cards": ["listSets"],
    "api:card-search": ["getSealedPrice"],
    "cron:sync-watchlist": ["listSets"],
    "page:search": ["getSealedPrice"],
  });
  assert.equal(pptRows(db).length, 6);
  assert.equal(T.resolveConsumer(null), "unknown", "no tag leaks back to the outer context");
});

test("PT-10. pruning deletes only this telemetry's own expired rows", async () => {
  const old = "2026-01-01T00:00:00.000Z";
  const db = createMemoryDb({
    catalog_snapshot: [
      { kind: "ppt_requests:2026-01-01:x:1", data: {}, updated_at: old },
      { kind: "ppt_requests:2026-09-15:y:2", data: {}, updated_at: new Date().toISOString() },
      { kind: "browse_budget_observe:2026-01-01T07:00:00.000Z", data: {}, updated_at: old },
      { kind: "graded_item_grading:v1|1|0", data: {}, updated_at: old },
      { kind: "pptx_other", data: {}, updated_at: old },
    ],
  });
  assert.equal(await T.prunePptTelemetry(db), true);
  assert.deepEqual(db.tables.catalog_snapshot.map((r) => r.kind), ["ppt_requests:2026-09-15:y:2", "browse_budget_observe:2026-01-01T07:00:00.000Z", "graded_item_grading:v1|1|0", "pptx_other"]);
});
