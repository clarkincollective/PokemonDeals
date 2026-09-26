// SAVED-REFERENCE DISCOUNT DISCOVERY (2026-09-26) - the scanner priced from
// what we hold once PokemonPriceTracker stepped to the free tier.
//
// Three layers, each against the REAL module:
//   1. lib/savedReference   - the provider-shaped market data built from a
//                             saved_ref row; exact printing / condition /
//                             language / grade; provider dates preserved
//   2. lib/pokemonPriceTracker's availability gate - an exhausted or blocked
//                             provider is asked ONCE, then not at all until
//                             the reset it named; the pause flag closes the
//                             export door too
//   3. the REAL refresh-deals route, offline (tests/harness/ingestion) with
//                             the provider exhausted - saved references
//                             produce evidenced comparisons, a wrong
//                             printing produces no shown claim, graded rows
//                             never get a raw figure, and no history point
//                             is manufactured
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createMemoryDb } from "../harness/ingestion/memoryDb.mjs";

const require = createRequire(import.meta.url);
const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const saved = require("../../lib/savedReference.js");
const ppt = require("../../lib/pokemonPriceTracker.js");
const telemetry = require("../../lib/pptTelemetry.js");
const prov = require("../../lib/referenceProvenance.js");

const AS_OF_OLD = "2026-09-20T00:00:00.000Z";
const AS_OF_NEW = "2026-09-25T00:00:00.000Z";
const row = (printings, extra = {}) => ({ v: 1, tcgplayerId: "1001", language: "english", retrievedAt: "2026-09-26T10:30:00.000Z", source: "ppt_export", printings, ...extra });

// ----------------------------------------------------------- 1. resolver
test("SR-1 two printings stay two printings; collapsed maps take the lowest and name their printing; the provider date is the latest as-of", () => {
  const md = saved.buildSavedMarketData(
    row({
      Holofoil: { nm: 100, lp: 80, mp: null, hp: null, dmg: null, market: 100, marketCondition: "Near Mint", lastPriceUpdate: AS_OF_NEW },
      "Reverse Holofoil": { nm: 150, lp: null, mp: null, hp: null, dmg: null, market: 150, marketCondition: "Near Mint", lastPriceUpdate: AS_OF_OLD },
    })
  );
  assert.deepEqual(Object.keys(md.byPrintingCondition).sort(), ["Holofoil", "Reverse Holofoil"]);
  assert.deepEqual(md.byPrintingCondition["Reverse Holofoil"], { "Near Mint": 150 });
  assert.deepEqual(md.byPrintingCondition.Holofoil, { "Near Mint": 100, "Lightly Played": 80 });
  assert.equal(md.byCondition["Near Mint"], 100);
  assert.deepEqual(md.byConditionReference["Near Mint"], { price: 100, condition: "Near Mint", printing: "Holofoil" });
  assert.equal(md.byConditionReference["Lightly Played"].printing, "Holofoil");
  assert.equal(md.fallbackPrice, 100, "fallback is pickCatalogMarketReference's choice, the same rule the nightly sync uses");
  assert.equal(md.fallbackReference.condition, "Near Mint");
  assert.equal(md.lastUpdated, AS_OF_NEW, "the provider's own as-of, the latest contributing printing");
  assert.equal(md.source, "card_catalog");
});

test("SR-2 1st Edition is kept in the matrix but excluded from the collapsed maps when an Unlimited printing is priced", () => {
  const md = saved.buildSavedMarketData(
    row({
      "1st Edition Holofoil": { nm: 900, lp: 700, market: 900, lastPriceUpdate: AS_OF_NEW },
      "Unlimited Holofoil": { nm: 200, lp: 150, market: 200, lastPriceUpdate: AS_OF_OLD },
    })
  );
  assert.ok(md.byPrintingCondition["1st Edition Holofoil"], "the parallel printing is still selectable by a listing that evidences it");
  assert.equal(md.byCondition["Near Mint"], 200, "an unqualified listing never inherits the 1st Edition figure");
  assert.equal(md.byConditionReference["Near Mint"].printing, "Unlimited Holofoil");
  assert.equal(md.fallbackReference.printing, "Unlimited Holofoil");
  assert.equal(md.lastUpdated, AS_OF_OLD, "the date belongs to the printing that contributed, not the newest row");
});

test("SR-3 sentinel prices are dropped, a printing with nothing usable is absent, an empty row is null", () => {
  const md = saved.buildSavedMarketData(row({ Normal: { nm: 999.99, lp: 12, market: 999.99, lastPriceUpdate: AS_OF_NEW }, Holofoil: { nm: "", lp: "", market: "" } }));
  assert.deepEqual(md.byPrintingCondition, { Normal: { "Lightly Played": 12 } });
  assert.equal(md.byCondition["Near Mint"], undefined, "a repdigit sentinel is not a Near Mint price");
  assert.equal(saved.buildSavedMarketData(row({ Normal: { nm: null, market: null } })), null);
  assert.equal(saved.buildSavedMarketData({ v: 1 }), null);
});

test("SR-4 loadSavedMarketData: a saved_ref row wins; the catalogue's labelled figure is a one-cell matrix with NO date; Japanese never falls back to the English catalogue", async () => {
  const db = createMemoryDb({
    catalog_snapshot: [{ kind: "saved_ref:1001:english", data: row({ Holofoil: { nm: 40, market: 40, lastPriceUpdate: AS_OF_NEW } }) }],
    card_catalog: [
      { tcgplayer_id: "1001", market_price: 99, market_condition: "Near Mint", market_printing: "Holofoil", language: "english" },
      { tcgplayer_id: "2002", market_price: 55, market_condition: "Near Mint", market_printing: "Normal", language: "english" },
      { tcgplayer_id: "3003", market_price: 70, market_condition: null, market_printing: "Normal", language: "english" },
    ],
  });
  const fromSaved = await saved.loadSavedMarketData(db, { tcgplayerId: "1001", language: "english" });
  assert.equal(fromSaved.savedFrom, "saved_ref");
  assert.equal(fromSaved.byCondition["Near Mint"], 40, "the saved row, not the catalogue's 99");
  assert.equal(fromSaved.lastUpdated, AS_OF_NEW);

  const fromCatalog = await saved.loadSavedMarketData(db, { tcgplayerId: "2002", language: "english" });
  assert.equal(fromCatalog.savedFrom, "card_catalog");
  assert.deepEqual(fromCatalog.byPrintingCondition, { Normal: { "Near Mint": 55 } });
  assert.equal(fromCatalog.fallbackPrice, null, "the labelled figure IS the tier; it is not also an aggregate");
  assert.equal(fromCatalog.lastUpdated, null, "card_catalog records only synced_at, which is never an observation date");

  const unlabelled = await saved.loadSavedMarketData(db, { tcgplayerId: "3003", language: "english" });
  assert.deepEqual(unlabelled.byPrintingCondition, {}, "an unlabelled figure is never assumed Near Mint");
  assert.equal(unlabelled.fallbackPrice, 70);
  assert.equal(unlabelled.fallbackReference.condition, null);

  assert.equal(await saved.loadSavedMarketData(db, { tcgplayerId: "2002", language: "japanese" }), null, "language is identity");
  assert.equal(await saved.loadSavedMarketData(db, { tcgplayerId: "9999", language: "english" }), null);
});

test("SR-5 savedReferenceIds answers per language, in batches", async () => {
  const rows = [];
  for (let i = 0; i < 450; i++) rows.push({ kind: `saved_ref:${i}:english`, data: {} });
  rows.push({ kind: "saved_ref:7:japanese", data: {} });
  const db = createMemoryDb({ catalog_snapshot: rows });
  const ids = [...Array(460).keys()].map(String);
  const en = await saved.savedReferenceIds(db, ids, "english");
  assert.equal(en.size, 450);
  assert.ok(!en.has("455"));
  const jp = await saved.savedReferenceIds(db, ids, "japanese");
  assert.deepEqual([...jp], ["7"]);
});

test("SR-6 saved graded: the exact grader+grade bucket through the live confidence gate; wrong grade, thin bucket and raw are never returned", async () => {
  const good = { price: 210, count: 12, minPrice: 180, maxPrice: 240, lastSaleDate: new Date(Date.now() - 20 * 86400000).toISOString(), providerLowConfidence: false };
  const thin = { price: 500, count: 1, minPrice: 500, maxPrice: 500, lastSaleDate: new Date().toISOString(), providerLowConfidence: false };
  const db = createMemoryDb({
    catalog_snapshot: [
      {
        kind: "saved_graded:1001:english",
        data: { v: 1, tcgplayerId: "1001", language: "english", capturedAt: "2026-09-26T10:40:00Z", setName: "Scarlet & Violet - Obsidian Flames", cardName: "Clefairy", rawNm: 60, salesByGrade: { cgc5_5: good, psa9: thin } },
      },
      {
        // A WOTC shared-identity set: the live gate fails closed on printing ambiguity, and so must the saved path.
        kind: "saved_graded:1002:english",
        data: { v: 1, tcgplayerId: "1002", language: "english", capturedAt: "2026-09-26T10:40:00Z", setName: "Base Set", cardName: "Clefairy", rawNm: 60, salesByGrade: { cgc5_5: good } },
      },
    ],
  });
  const hit = await saved.loadSavedGradedPrice(db, { tcgplayerId: "1001", language: "english", grader: "CGC", grade: "5.5" });
  assert.equal(hit.price, 210);
  assert.equal(hit.source, "card_catalog");
  assert.notEqual(hit.price, 60, "never the raw figure");
  assert.equal(await saved.loadSavedGradedPrice(db, { tcgplayerId: "1001", language: "english", grader: "CGC", grade: "6" }), null, "a different grade is not a substitute");
  assert.equal(await saved.loadSavedGradedPrice(db, { tcgplayerId: "1001", language: "english", grader: "PSA", grade: "9" }), null, "a one-sale bucket fails the confidence gate");
  assert.equal(await saved.loadSavedGradedPrice(db, { tcgplayerId: "1001", language: "japanese", grader: "CGC", grade: "5.5" }), null, "language is identity");
  assert.equal(await saved.loadSavedGradedPrice(db, { tcgplayerId: "1002", language: "english", grader: "CGC", grade: "5.5" }), null, "a shared-identity (WOTC) set fails closed exactly as the live gate does");
});

test("SR-7 the disclosure names the source and the provider's own date", () => {
  assert.equal(prov.referenceSourceLabel({ reference_source: "card_catalog" }), "Saved catalogue price");
  assert.equal(prov.referenceSourceLabel({ reference_source: "ppt_live" }), "Live market price");
  assert.equal(prov.referenceSourceLabel({ reference_source: "made_up" }), null);
  assert.equal(prov.referenceObservedDateText({ reference_observed_at: AS_OF_NEW }), "as of 25 Sep 2026");
  assert.equal(prov.referenceObservedDateText({ reference_observed_at: null, reference_synced_at: AS_OF_NEW }), null, "a sync time is never shown as an observation date");
});

// --------------------------------------------------- 2. availability gate
function mockFetch(responses) {
  const calls = [];
  globalThis.fetch = async (url) => {
    calls.push(String(url));
    const r = responses[Math.min(calls.length - 1, responses.length - 1)];
    return new Response(r.body ?? "{}", { status: r.status ?? 200, headers: r.headers ?? { "content-type": "application/json" } });
  };
  return calls;
}
const OK_BODY = JSON.stringify({ data: { prices: { variants: { Normal: { "Near Mint": { price: 10 } } }, lastUpdated: AS_OF_NEW } } });
const originalFetch = globalThis.fetch;
test.after(() => {
  globalThis.fetch = originalFetch;
  ppt.setPptCircuitSink(null);
  delete process.env.PPT_SAVED_DATA_MODE;
});

test("SR-8 a daily 429 opens the circuit until the provider's resetsAt: the second call is refused with NO request", async () => {
  process.env.POKEMONPRICETRACKER_API_KEY = "test-key";
  const db = createMemoryDb({ catalog_snapshot: [] });
  ppt.setPptCircuitSink(db);
  const calls = mockFetch([
    { status: 429, body: JSON.stringify({ error: "Daily rate limit exceeded", retryAfter: 42767, resetsAt: "2999-01-01T00:00:00.000Z", limitType: "daily" }) },
    { status: 200, body: OK_BODY },
  ]);
  await assert.rejects(() => ppt.getConditionPrices("1001", "english"), /429/);
  assert.equal(calls.length, 1);
  await assert.rejects(() => ppt.getConditionPrices("1001", "english"), (e) => e.code === "ppt_exhausted" && ppt.isPptUnavailableError(e));
  assert.equal(calls.length, 1, "the exhausted provider was not asked again");
  const persisted = db.tables.catalog_snapshot.find((r) => r.kind === "ppt_circuit:credits");
  assert.ok(persisted, "the circuit is persisted for other invocations");
  assert.equal(persisted.data.until, "2999-01-01T00:00:00.000Z");
  assert.equal(persisted.data.reason, "daily_429");
  assert.equal(await ppt.isPptCircuitOpen("credits"), true);
});

test("SR-9 a temporary key block (long Retry-After) holds the pool; a per-minute 429 does not", async () => {
  const db = createMemoryDb({ catalog_snapshot: [] });
  ppt.setPptCircuitSink(db);
  const calls = mockFetch([
    { status: 429, body: JSON.stringify({ error: "Too many requests", retryAfter: 13 }) },
    { status: 429, body: JSON.stringify({ error: "API key temporarily blocked", retryAfter: 3600 }) },
    { status: 200, body: OK_BODY },
  ]);
  await assert.rejects(() => ppt.getConditionPrices("1001", "english"), /429/);
  await assert.rejects(() => ppt.getConditionPrices("1001", "english"), /429/);
  assert.equal(calls.length, 2, "a 13-second per-minute limit did not open the circuit");
  await assert.rejects(() => ppt.getConditionPrices("1001", "english"), (e) => e.code === "ppt_exhausted");
  assert.equal(calls.length, 2, "the blocked key is not hammered");
  const c = db.tables.catalog_snapshot.find((r) => r.kind === "ppt_circuit:credits");
  assert.equal(c.data.reason, "key_blocked");
  const holdMs = Date.parse(c.data.until) - Date.now();
  assert.ok(holdMs > 3500_000 && holdMs <= 3600_000 + 5_000, `held for the Retry-After the provider named (${Math.round(holdMs / 1000)}s)`);
});

test("SR-10 a 200 whose daily-remaining header is 0 opens the circuit proactively; a past `until` lets calls through again", async () => {
  const db = createMemoryDb({ catalog_snapshot: [] });
  ppt.setPptCircuitSink(db);
  const calls = mockFetch([
    { status: 200, body: OK_BODY, headers: { "content-type": "application/json", "x-ratelimit-daily-remaining": "0", "x-ratelimit-daily-reset": String(Math.floor(Date.now() / 1000) + 3600) } },
    { status: 200, body: OK_BODY },
  ]);
  const md = await ppt.getConditionPrices("1001", "english");
  assert.equal(md.byCondition["Near Mint"], 10, "the response that spent the last credit is still used");
  await assert.rejects(() => ppt.getConditionPrices("1001", "english"), (e) => e.code === "ppt_exhausted");
  assert.equal(calls.length, 1);
  // reset has passed: a fresh process reads a circuit whose `until` is behind it
  const db2 = createMemoryDb({ catalog_snapshot: [{ kind: "ppt_circuit:credits", data: { until: "2000-01-01T00:00:00.000Z", reason: "daily_429" } }] });
  ppt.setPptCircuitSink(db2);
  await ppt.getConditionPrices("1001", "english");
  assert.equal(calls.length, 2, "after the provider's reset the door opens again");
});

test("SR-16 a 200 with NO allowance header leaves the circuit closed; an ISO reset header is honoured", async () => {
  const db = createMemoryDb({ catalog_snapshot: [] });
  ppt.setPptCircuitSink(db);
  const resetIso = new Date(Date.now() + 2 * 3600_000).toISOString().replace(/.d{3}Z$/, "Z");
  const calls = mockFetch([
    { status: 200, body: OK_BODY }, // no x-ratelimit-* headers at all (Headers.get -> null)
    { status: 200, body: OK_BODY },
    { status: 200, body: OK_BODY, headers: { "content-type": "application/json", "x-ratelimit-daily-remaining": "0", "x-ratelimit-daily-reset": resetIso } },
    { status: 200, body: OK_BODY },
  ]);
  await ppt.getConditionPrices("1001", "english");
  await ppt.getConditionPrices("1001", "english");
  assert.equal(calls.length, 2, "a missing header is not a zero allowance");
  assert.equal(await ppt.isPptCircuitOpen(), false);
  await ppt.getConditionPrices("1001", "english");
  await assert.rejects(() => ppt.getConditionPrices("1001", "english"), (e) => e.code === "ppt_exhausted" && e.until === new Date(resetIso).toISOString());
  assert.equal(calls.length, 3);
  const row = db.tables.catalog_snapshot.find((r) => r.kind === "ppt_circuit:credits");
  assert.equal(row.data.until, new Date(resetIso).toISOString(), "the provider's own ISO reset is the hold, not our midnight guess");
});

test("SR-11 PPT_SAVED_DATA_MODE closes all three doors before any request, the export included", async () => {
  const db = createMemoryDb({ catalog_snapshot: [] });
  ppt.setPptCircuitSink(db);
  process.env.PPT_SAVED_DATA_MODE = "1";
  const calls = mockFetch([{ status: 200, body: OK_BODY }]);
  await assert.rejects(() => ppt.getConditionPrices("1001", "english"), (e) => e.code === "ppt_paused");
  await assert.rejects(() => ppt.downloadPrintingsExport(), (e) => e.code === "ppt_paused");
  await assert.rejects(() => ppt.listSetCards("base1", "english"), (e) => e.code === "ppt_paused");
  assert.equal(calls.length, 0, "no socket was opened");
  assert.equal(await ppt.isPptCircuitOpen("export"), true);
  delete process.env.PPT_SAVED_DATA_MODE;
});

test("SR-12 the export pool is separate: a refused export does not close the credits pool, and vice versa", async () => {
  const db = createMemoryDb({ catalog_snapshot: [] });
  ppt.setPptCircuitSink(db);
  const calls = mockFetch([{ status: 429, body: JSON.stringify({ error: "Too many requests", retryAfter: 60 }) }, { status: 200, body: OK_BODY }]);
  await assert.rejects(() => ppt.downloadPrintingsExport(), /429/);
  assert.equal(await ppt.isPptCircuitOpen("export"), true, "the export's own daily allowance is spent");
  assert.equal(await ppt.isPptCircuitOpen("credits"), false, "credits are untouched");
  await ppt.getConditionPrices("1001", "english");
  assert.equal(calls.length, 2);
});

test("SR-14 concurrent callers: requests already in flight complete, nothing queued behind the first daily 429 is sent, and a later batch sends nothing", async () => {
  // The allocated tier runs several workers at once. When the day's credits
  // run out mid-run, the workers whose requests are ALREADY on the wire
  // finish (bounded by the concurrency), and every request after the first
  // refusal must be answered by the circuit, not by the provider - that is
  // the difference between ~4 failed calls and the ~200 that got the key
  // blocked on 26 Sep.
  process.env.POKEMONPRICETRACKER_API_KEY = "test-key";
  const db = createMemoryDb({ catalog_snapshot: [] });
  ppt.setPptCircuitSink(db);
  const inflight = [];
  let sent = 0;
  globalThis.fetch = async () => {
    sent++;
    // hold every response until the whole first wave is on the wire
    await new Promise((res) => inflight.push(res));
    return new Response(JSON.stringify({ error: "Daily rate limit exceeded", retryAfter: 40000, resetsAt: "2999-01-01T00:00:00.000Z", limitType: "daily" }), { status: 429 });
  };
  const CONCURRENCY = 4;
  const wave1 = Array.from({ length: CONCURRENCY }, (_, i) => ppt.getConditionPrices(`c${i}`, "english").catch((e) => e));
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(sent, CONCURRENCY, "the in-flight requests are the ones that were already gated open");
  for (const res of inflight.splice(0)) res(); // provider answers all four with the daily 429
  const results1 = await Promise.all(wave1);
  assert.ok(results1.every((e) => e instanceof Error), "each in-flight call fails on its own 429");
  // now a second wave of callers, as the next cards in the queue would be
  const wave2 = await Promise.all(Array.from({ length: 8 }, (_, i) => ppt.getConditionPrices(`d${i}`, "english").catch((e) => e)));
  assert.equal(sent, CONCURRENCY, "not one more request reached the provider");
  assert.ok(wave2.every((e) => e?.code === "ppt_exhausted"), "every queued caller was refused by the circuit");
  // and a fresh process that reads the persisted circuit sends nothing either
  ppt.setPptCircuitSink(db);
  await assert.rejects(() => ppt.getConditionPrices("e1", "english"), (e) => e.code === "ppt_exhausted");
  assert.equal(sent, CONCURRENCY);
});

test("SR-15 fetchPPTPaced: a daily 429 on the first attempt closes the retry that would have followed", async () => {
  const db = createMemoryDb({ catalog_snapshot: [] });
  ppt.setPptCircuitSink(db);
  const calls = mockFetch([{ status: 429, body: JSON.stringify({ error: "Daily rate limit exceeded", retryAfter: 40000, resetsAt: "2999-01-01T00:00:00.000Z", limitType: "daily" }) }]);
  await assert.rejects(() => ppt.listSetCards("base1", "english"), /429/);
  assert.equal(calls.length, 1, "the paced client's retry loop did not send a second attempt");
  await assert.rejects(() => ppt.listSetCards("base2", "english"), (e) => e.code === "ppt_exhausted");
  assert.equal(calls.length, 1);
});

test("SR-13 telemetry now keeps the provider's real allowance headers", () => {
  const res = new Response("{}", { status: 200, headers: { "x-ratelimit-daily-limit": "100", "x-ratelimit-daily-remaining": "0", "x-api-calls-consumed": "3", "x-ratelimit-minute-limit": "60" } });
  assert.deepEqual(telemetry.rateHeadersOf(res), { "x-ratelimit-daily-limit": 100, "x-ratelimit-daily-remaining": 0, "x-ratelimit-minute-limit": 60, "x-api-calls-consumed": 3 });
});

// ------------------------------------------- 3. the real route, provider exhausted
const cache = new Map();
function run(scenario) {
  if (cache.has(scenario)) return cache.get(scenario);
  const r = spawnSync(process.execPath, ["--no-warnings", "--import", "./tests/harness/ingestion/register.mjs", "tests/harness/ingestion/driver.mjs", scenario], { cwd: REPO, encoding: "utf8", timeout: 180_000 });
  assert.equal(r.status, 0, `${scenario} harness failed: ${r.stderr}`);
  const out = JSON.parse(r.stdout);
  cache.set(scenario, out);
  return out;
}
const SAVED_AS_OF = "2026-09-25T00:00:00.000Z";

for (const scenario of ["saved-percard", "saved-sweep"]) {
  test(`SR-E2E ${scenario}: with the provider exhausted, raw listings are priced from saved references with their real provenance`, () => {
    const { status, written, calls, priceHistoryWrites } = run(scenario);
    assert.equal(status, 200);
    assert.ok(calls.getConditionPrices >= 1, "the provider was asked");
    assert.equal(calls.pptRefused, calls.getConditionPrices + (calls.getGradedPrice ?? 0), "every attempt was refused - this run had no live reference at all");
    const raw = written.filter((w) => !w.graded);
    assert.ok(raw.length > 0, `${scenario} wrote no raw rows`);
    for (const w of raw) {
      assert.equal(w.referenceSource, "card_catalog", `${w.title}: reference_source`);
      assert.equal(w.referenceObservedAt, SAVED_AS_OF, `${w.title}: the provider's as-of, never the download or scan day`);
      assert.ok(w.referenceCondition, `${w.title}: reference_condition`);
      assert.ok(w.referencePrinting, `${w.title}: reference_printing`);
      assert.ok(w.marketPrice > 0 && w.discountPct > 0, `${w.title}: a real comparison`);
    }
    assert.ok(raw.some((w) => w.savingsTrusted), "at least one saved-reference comparison is a TRUSTED savings claim");
    assert.equal(priceHistoryWrites, 0, "reusing a saved reference wrote no price_history point");
  });

  test(`SR-E2E ${scenario}: exact printing claims, wrong printing does not; graded gets no raw figure; identity gates intact`, () => {
    const { written } = run(scenario);
    const clefairy = written.find((w) => w.listingId === "v1|900000000002|0");
    assert.ok(clefairy, "the Clefairy listing was written");
    assert.equal(clefairy.cardId, "syn-clefairy-bs");
    assert.equal(clefairy.marketPrice, 60);
    assert.equal(clefairy.discountPct, 0.5);
    assert.equal(clefairy.referencePrinting, "Normal");
    assert.equal(clefairy.savingsTrusted, true, "an exact saved reference is shown as a discount");
    assert.equal(clefairy.displayable, true);

    const clefable = written.find((w) => w.listingId === "v1|900000000003|0");
    if (clefable) {
      assert.equal(clefable.referencePrinting, "Reverse Holofoil", "the only saved printing");
      assert.equal(clefable.savingsTrusted, false, "a parallel printing the listing does not state is never shown as a discount");
    }
    assert.equal(written.filter((w) => w.graded).length, 0, "with no saved graded bucket and the provider exhausted, no graded comparison is written - and no raw figure stands in");
    for (const w of written) {
      if (/Pikachu TG05\/TG30/i.test(w.title)) assert.match(w.writtenAs, /^Pikachu \| SWSH11: Lost Origin Trainer Gallery \| #TG05\/TG30$/);
      if (!w.graded) assert.doesNotMatch(w.title, /PSA 9 Charizard GX SV49|CHARIZARD EX PSA 8\.5|\(CGA 8\.5\)|PSA9 Rayquaza EX Promo|Ace 9 Ultra Rare/, `raw savings claim written for ${w.title}`);
    }
  });
}
