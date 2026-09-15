// crossmatch-shadow-r1 - count-only cross-matching observation on tier=allocated.
// 1. The REAL allocated route, offline, over one synthetic fixture with the
//    observation on, off, failing inside, and throwing outright: provider
//    calls, pricing calls, every database write, retirement updates and the
//    response are identical; only the observation row differs.
// 2. The record's counts on that fixture (repeats, ambiguity, held rows,
//    cross-marketplace copies, variations, graded vs raw).
// 3. The observer's own bounds: nothing is classified from truncated work,
//    and every truncation or failure is labelled partial.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const { createCrossMatchObserver, recordCrossMatchObservation, OBSERVATION_KIND_PREFIX } = require(join(ROOT, "lib/crossMatchObservation.js"));
const dm = require(join(ROOT, "lib/dealMatching.js"));
const { classifyListingLanguage, languageCompatible } = require(join(ROOT, "lib/dealQuality.js"));
const { createMemoryDb } = await import(pathToFileURL(join(ROOT, "tests/harness/ingestion/memoryDb.mjs")).href);

const runs = {};
function runRoute(mode) {
  if (runs[mode]) return runs[mode];
  const r = spawnSync(process.execPath, ["--no-warnings", "--import", "./tests/harness/ingestion/register.mjs", "tests/harness/ingestion/crossmatch.mjs", mode], {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    env: { ...process.env, CROSSMATCH_OBSERVE: "" },
  });
  assert.equal(r.status, 0, r.stderr);
  return (runs[mode] = JSON.parse(r.stdout));
}
// ids and timestamps are allocation/clock artefacts, not behaviour
const normWrites = (o) => o.writes.map((w) => JSON.stringify(w, (k, v) => (k === "id" || (typeof v === "string" && /^\d{4}-\d\d-\d\dT/.test(v)) ? undefined : v)));
const normResponse = (o) => {
  const { scannedAt, crossMatchObservation, ...rest } = o.response;
  return rest;
};

test("CM-1 observation on / off / failing: identical provider calls, pricing calls, writes, retirement and response", () => {
  const off = runRoute("off");
  assert.equal(off.status, 200);
  assert.ok(off.calls.searchListings >= 2 && off.calls.getGradingDetails >= 1 && off.calls.getGradedPrice >= 1, "fixture exercises search, raw pricing and a graded lookup");
  assert.ok(off.response.dealsFound >= 1 && off.response.blockedRetired >= 1, "fixture writes deals and blocks a retired listing");
  assert.ok(off.writes.some((w) => w.table === "deals" && w.op === "update"), "retirement / sighting updates are part of the comparison");
  assert.equal(off.observationWrites.length, 0);
  assert.equal(off.response.crossMatchObservation, null);
  for (const mode of ["on", "fail-internal", "fail-hard"]) {
    const o = runRoute(mode);
    assert.equal(o.status, 200, mode);
    assert.deepEqual(o.calls, off.calls, `${mode}: provider + pricing calls`);
    assert.deepEqual(o.gradedPriceRequests, off.gradedPriceRequests, `${mode}: graded reference requests`);
    assert.deepEqual(normWrites(o), normWrites(off), `${mode}: every non-observation write, in order`);
    assert.deepEqual(normResponse(o), normResponse(off), `${mode}: response (scanned, dealsFound, blockedRetired, errors, allocation)`);
    assert.deepEqual(o.response.errors, [], `${mode}: observation never adds job errors`);
  }
  assert.equal(runRoute("on").observationWrites.length, 1);
  assert.ok(runRoute("on").observationWrites[0].row.kind.startsWith(OBSERVATION_KIND_PREFIX));
});

test("CM-2 fixture counts: repeats, identities, stored states, pricing needs", () => {
  const obs = runRoute("on").response.crossMatchObservation;
  assert.equal(obs.partial, false);
  assert.equal(obs.recorded, true);
  assert.equal(obs.searchesObserved, 2);
  assert.equal(obs.resultsSeen, 26);
  assert.equal(obs.duplicateResults, 13, "the second search repeats the first page");
  assert.equal(obs.listingsExamined, 13, "Chansey variations 0 and 7 are separate item/marketplace keys");
  assert.equal(obs.rejectedBeforeIdentity, 1, "keychain");
  assert.equal(obs.coveredByScannedCard, 3, "the targets' own listings are not additional");
  assert.deepEqual(obs.uniqueAdditional, { total: 8, raw: 7, graded: 1 });
  assert.deepEqual(obs.ambiguous, { total: 1, raw: 0, graded: 1, includesScannedCard: 0 });
  assert.deepEqual(obs.uniqueStored, {
    activeListed: 1,
    inactive: 0,
    availabilityRetired: 1,
    quarantinedOrHeld: 1,
    storedUnderOtherIdentity: 1,
    neverStoredOnMarketplace: 5,
    notInDealsOnAnyMarketplace: 4, // the EBAY_GB copy is not counted as not-in-deals
    storageUnknown: 0,
  });
  assert.deepEqual(obs.ambiguousStored, { stored: 0, notStored: 1, storageUnknown: 0 });
  assert.equal(obs.globallyNew, null);
  // Blastoise, Zapdos, Chansey x2, Gyarados slab; held / retired / active rows excluded
  assert.deepEqual(obs.pricing, { candidatesNeedingPricing: 5, distinctCardsNeedingPricing: 4, raw: 4, graded: 1 });
  assert.equal("belowReference" in obs, false);
  const stored = runRoute("on").observationWrites[0].row.data;
  assert.equal(stored.uniqueAdditional.total, 8);
});

test("CM-3 failures are contained and labelled partial", () => {
  const internal = runRoute("fail-internal").response.crossMatchObservation;
  assert.equal(internal.partial, true);
  assert.match(internal.error, /injected index failure/);
  assert.equal(internal.recorded, true);
  const hard = runRoute("fail-hard").response.crossMatchObservation;
  assert.equal(hard.partial, true);
  assert.match(hard.error, /injected finalize rejection/);
});

// ---- observer unit checks -------------------------------------------------

const url = (n) => `https://www.ebay.com/itm/${n}`;
const listing = (n, title, extra = {}) => ({ listingId: `v1|${n}|0`, title, listingType: "FIXED_PRICE", listingUrl: url(n), isGraded: false, sellerFeedbackScore: 5000, sellerFeedbackPct: 100, ...extra });
const row = (id, name, set, extra = {}) => ({ id, name, set, justtcg_tcgplayer_id: `t-${id}`, language: "english", ...extra });
function indexFor(rows) {
  const index = new Map();
  for (const r of rows) for (const t of dm.coreTokens(r.name)) (index.get(t) ?? index.set(t, []).get(t)).push(r);
  return (l) => {
    const c = new Map();
    for (const w of l.title.toLowerCase().match(/[a-z0-9]+/g) ?? []) for (const r of index.get(w) ?? []) if (!c.has(r.id)) c.set(r.id, r);
    return [...c.values()];
  };
}
const ROWS = [
  row(1, "Charizard", "Base Set"),
  row(2, "Blastoise", "Base Set"),
  row(3, "Clefairy", "Base Set"),
  row(4, "Clefairy", "Base Set (Shadowless)"),
  row(5, "Pikachu", "SM Black Star Promos"),
  row(6, "Unown [A]", "EX Unseen Forces"),
  row(7, "Unown [B]", "EX Unseen Forces"),
  row(8, "Pikachu", "Base Set", { language: "japanese" }),
  row(9, "Mewtwo ex", "Scarlet & Violet 151"),
  row(10, "M Charizard EX (13)", "XY - Flashfire"),
];

test("CM-4 the conservative name-token skip never changes an identity (vs the plain sweep loop)", () => {
  const titles = [
    "Charizard 4/102 Base Set Holo",
    "Clefairy 5/102 Base Set Shadowless Holo",
    "Pikachu SM162 Black Star Promo",
    "Unown A 14/145 EX Unseen Forces",
    "Unown B Unseen Forces EX holo",
    "Japanese Pikachu Base Set No. 025",
    "Mewtwo ex 150/165 Scarlet Violet 151",
    "Mega Charizard EX 13/106 XY Flashfire",
    "Charizard Blastoise Base Set lot",
    "Pokemon Pikachu illustrator",
  ];
  const cands = indexFor(ROWS);
  const obs = createCrossMatchObserver({ marketplace: "EBAY_US" });
  obs.setIndex(cands);
  const ls = titles.map((t, i) => listing(700 + i, t));
  obs.observe(ls, null);
  for (const l of ls) {
    const want = new Set();
    const gated = !dm.qualifiesAsTradingCard(l) || dm.admitsProxyOrCounterfeit(l, null) || !dm.isTrustworthyListing(l) || dm.titleClaimsSlabGrade(l.title);
    if (!gated) {
      for (const r of cands(l)) {
        if (dm.admitsProxyOrCounterfeit(l, { name: r.name, set: r.set }) || !dm.listingMatchesCard(l, r)) continue;
        if (!languageCompatible(classifyListingLanguage({ title: l.title }), r.language)) continue;
        want.add(`${r.justtcg_tcgplayer_id}|${r.language}`);
      }
    }
    assert.deepEqual([...obs.state.byKey.get(`EBAY_US|${l.listingId}`).identities].sort(), [...want].sort(), l.title);
  }
  const sizes = [...obs.state.byKey.values()].map((e) => e.identities.size);
  assert.ok(sizes.filter((n) => n >= 1).length >= 7 && sizes.includes(2), "non-vacuous: most titles resolve, one is ambiguous");
});

test("CM-5 results before the index is ready are held (bounded), never lost silently", async () => {
  const early = createCrossMatchObserver({ marketplace: "EBAY_US", limits: { maxPendingSearches: 1 } });
  early.observe([listing(1, "Blastoise 2/102 Base Set Holo")], ROWS[0]);
  early.observe([listing(2, "Blastoise 2/102 Base Set Holo")], ROWS[0]);
  early.setIndex(indexFor(ROWS));
  const rec = await early.finalize(null);
  assert.equal(rec.searchesReceived, 2);
  assert.equal(rec.searchesObserved, 1);
  assert.ok(rec.truncatedBy.includes("index_not_ready"));
  assert.equal(rec.partial, true);

  const never = createCrossMatchObserver({ marketplace: "EBAY_US" });
  never.observe([listing(1, "Blastoise 2/102 Base Set Holo")], ROWS[0]);
  const rec2 = await never.finalize(null);
  assert.equal(rec2.partial, true);
  assert.ok(rec2.truncatedBy.includes("index_not_ready"));
  assert.equal(rec2.listingsExamined, 0);
});

test("CM-6 limits leave listings unclassified rather than mis-classified, and mark the record partial", async () => {
  const cap = createCrossMatchObserver({ marketplace: "EBAY_US", limits: { maxCandidateRowsPerListing: 1 } });
  cap.setIndex(indexFor(ROWS));
  cap.observe([listing(1, "Clefairy 5/102 Base Set Holo")], null); // two Clefairy candidates > 1
  let rec = await cap.finalize(null);
  assert.equal(rec.unclassified, 1);
  assert.equal(rec.uniqueAdditional.total + rec.ambiguous.total, 0);
  assert.ok(rec.partial && rec.truncatedBy.includes("candidates_per_listing"));

  const checks = createCrossMatchObserver({ marketplace: "EBAY_US", limits: { maxMatchChecks: 1 } });
  checks.setIndex(indexFor(ROWS));
  checks.observe([listing(1, "Clefairy 5/102 Base Set Shadowless Holo"), listing(2, "Blastoise 2/102 Base Set")], null);
  rec = await checks.finalize(null);
  assert.equal(rec.unclassified, 1, "the listing cut off mid-check is not counted as unique");
  assert.equal(rec.ambiguous.total + rec.uniqueAdditional.total, 0);
  assert.ok(rec.partial && rec.truncatedBy.includes("match_checks"));

  const many = createCrossMatchObserver({ marketplace: "EBAY_US", limits: { maxListings: 2 } });
  many.setIndex(indexFor(ROWS));
  many.observe([1, 2, 3].map((n) => listing(n, "Blastoise 2/102 Base Set")), null);
  rec = await many.finalize(null);
  assert.equal(rec.listingsExamined, 2);
  assert.ok(rec.partial && rec.truncatedBy.includes("listings"));

  let clock = 0;
  const slow = createCrossMatchObserver({ marketplace: "EBAY_US", now: () => clock, jobStartedAt: 0, limits: { maxObserveMsPerSearch: 5, stopAfterJobMs: 100 } });
  slow.setIndex((l) => { clock += 10; return indexFor(ROWS)(l); });
  slow.observe([listing(1, "Blastoise 2/102 Base Set"), listing(2, "Charizard 4/102 Base Set")], null);
  clock = 500;
  slow.observe([listing(3, "Blastoise 2/102 Base Set")], null);
  rec = await slow.finalize(null);
  assert.equal(rec.listingsExamined, 1);
  assert.ok(rec.truncatedBy.includes("search_time") && rec.truncatedBy.includes("job_deadline"));
});

test("CM-7 stored-state lookup is bulk and chunked; a failed read leaves storage unknown, partial, no throw", async () => {
  const db = createMemoryDb({ deals: [{ id: 1, source: "ebay", marketplace: "EBAY_US", listing_id: "v1|3|0", is_active: true, disqualified_reason: null, card_tcgplayer_id: "t-2" }] });
  let reads = 0;
  const counted = { from: (t) => { if (t === "deals") reads++; return db.from(t); } };
  const o = createCrossMatchObserver({ marketplace: "EBAY_US", limits: { storedLookupChunk: 2 } });
  o.setIndex(indexFor(ROWS));
  o.observe([1, 2, 3, 4, 5].map((n) => listing(n, "Blastoise 2/102 Base Set Holo")), ROWS[0]);
  const rec = await o.finalize(counted);
  assert.equal(reads, 3, "5 candidates, chunks of 2");
  assert.equal(rec.uniqueStored.activeListed, 1);
  assert.equal(rec.uniqueStored.neverStoredOnMarketplace, 4);
  assert.equal(rec.partial, false);

  const failing = { from: () => ({ select: () => ({ in: async () => ({ data: null, error: { message: "boom" } }) }) }) };
  const f = createCrossMatchObserver({ marketplace: "EBAY_US" });
  f.setIndex(indexFor(ROWS));
  f.observe([listing(1, "Blastoise 2/102 Base Set Holo")], ROWS[0]);
  const frec = await f.finalize(failing);
  assert.equal(frec.uniqueStored.storageUnknown, 1);
  assert.equal(frec.pricing.candidatesNeedingPricing, 0);
  assert.equal(frec.partial, true);
  assert.match(frec.error, /stored lookup: boom/);
});

test("CM-8 one insert-only row per run, old observation rows pruned, a failing store never throws", async () => {
  const db = createMemoryDb({
    catalog_snapshot: [
      { kind: `${OBSERVATION_KIND_PREFIX}2026-08-01:old`, data: {}, updated_at: "2026-08-01T00:00:00.000Z" },
      { kind: "ppt_requests:2026-08-01:keep", data: {}, updated_at: "2026-08-01T00:00:00.000Z" },
    ],
  });
  const res = await recordCrossMatchObservation(db, { v: 1 }, { at: "2026-09-15T08:00:00.000Z" });
  assert.equal(res.ok, true);
  const kinds = db.tables.catalog_snapshot.map((r) => r.kind);
  assert.equal(kinds.filter((k) => k.startsWith(OBSERVATION_KIND_PREFIX)).length, 1);
  assert.ok(kinds.includes("ppt_requests:2026-08-01:keep"));
  const bad = await recordCrossMatchObservation({ from: () => { throw new Error("down"); } }, { v: 1 });
  assert.equal(bad.ok, false);
});

test("CM-9 wiring: allocated only, after normal processing, kill switch, index position kept", () => {
  const src = readFileSync(join(ROOT, "app/api/refresh-deals/route.js"), "utf8").replace(/\r\n/g, "\n");
  const scanFn = src.slice(src.indexOf("async function scanCardInMarketplace"), src.indexOf("function buildWatchlistIndex"));
  const observeAt = scanFn.indexOf("crossMatch.observe(listings, row)");
  assert.ok(observeAt > scanFn.indexOf("if (canReconcile)"), "observe runs after the retirement reconcile");
  assert.ok(observeAt < scanFn.lastIndexOf("return { dealsFound, uniqueListings: listings.length, blockedRetired };"));
  assert.equal((src.match(/createCrossMatchObserver\(/g) ?? []).length, 1);
  assert.match(src, /if \(allocatedMode && process\.env\.CROSSMATCH_OBSERVE !== "off"\)/);
  assert.equal((src.match(/tier \|\| "manual",\s*crossMatch\s*\)/g) ?? []).length, 1);
  // the observer never reaches the scan's errors or job status
  const tail = src.slice(src.indexOf("let crossMatchObservation"), src.indexOf("return Response.json({\n    scanned,"));
  assert.doesNotMatch(tail, /errors\.push|markError|markSkipped/);
});
