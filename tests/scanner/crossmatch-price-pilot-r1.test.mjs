// crossmatch-price-pilot-r1 - US raw cross-matching pricing pilot (off by
// default). The REAL allocated route offline on one fixture
// (tests/harness/ingestion/crossmatchPilot.mjs), pilot off vs on, plus the
// pilot's helpers and the insert-only write. No network, no database.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => readFileSync(join(ROOT, p), "utf8").replace(/\r\n/g, "\n");
const pilot = require(join(ROOT, "lib/crossMatchPricingPilot.js"));
const { insertNewSighting } = require(join(ROOT, "lib/listingAvailability.js"));
const { createMemoryDb } = await import(pathToFileURL(join(ROOT, "tests/harness/ingestion/memoryDb.mjs")).href);

const runs = {};
function run(mode) {
  if (runs[mode]) return runs[mode];
  const r = spawnSync(process.execPath, ["--no-warnings", "--import", "./tests/harness/ingestion/register.mjs", "tests/harness/ingestion/crossmatchPilot.mjs", mode], {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    env: { ...process.env, CROSSMATCH_PRICE_PILOT: "", BROWSE_BUDGET_MODE: "" },
  });
  assert.equal(r.status, 0, r.stderr);
  return (runs[mode] = JSON.parse(r.stdout));
}
const TAIL = ["x-50", "x-51", "x-52", "x-53", "x-54", "x-55", "x-56", "x-57", "x-58", "x-59"];

test("CP-1 pilot off is the existing behaviour: every target searched, no pilot record", () => {
  const off = run("off");
  assert.equal(off.status, 200);
  assert.deepEqual(off.response.allocation.by_lane, { hot: 0, explore: 50, exploit: 10 });
  assert.deepEqual(off.calls, { getConditionPrices: 60, searchListings: 60, getRawListingDetail: 4 });
  assert.equal(off.response.crossMatchPilot, null);
  assert.ok(!off.discoveryEvents.some((e) => e.search_type === "crossmatch"));
  assert.equal(off.stateChanged.length, 60, "every target's scan state advanced");
});

test("CP-2 pilot on: only lowest-scoring exploit targets are displaced, one per attempted card; the rest of the tail is scanned normally", () => {
  const off = run("off");
  const on = run("on");
  const p = on.response.crossMatchPilot;
  assert.deepEqual(p.heldBackTail, TAIL, "exploit lane only, lowest score first");
  assert.deepEqual(p.displacedTargets, ["x-50", "x-51", "x-52", "x-53", "x-54"]);
  assert.deepEqual(p.tailScannedNormally, ["x-55", "x-56", "x-57", "x-58", "x-59"]);
  assert.deepEqual(p.substitutions.map((s) => [s.displacedTarget, s.pilotCard, s.outcome]), [
    ["x-50", "x-60", "priced"],
    ["x-51", "x-61", "priced"],
    ["x-52", "x-62", "priced"],
    ["x-53", "x-63", "priced"],
    ["x-54", "x-69", "no_usable_reference"],
  ]);
  assert.equal(p.stoppedBy, "candidates_exhausted");
  // exactly the five displaced exploit targets (cards 50-54) are not searched; every other target is
  const displacedQueries = ["Machop Base Set", "Magnemite Base Set", "Metapod Base Set", "Onix Base Set", "Pidgey Base Set"];
  assert.deepEqual([...on.searchesFor].sort(), off.searchesFor.filter((q) => !displacedQueries.includes(q)).sort());
  assert.ok(displacedQueries.every((q) => off.searchesFor.includes(q)));
  assert.equal(on.response.scanned, 55);
  assert.equal(on.stateChanged.length, 55);
  for (const id of ["x-50", "x-51", "x-52", "x-53", "x-54"]) assert.ok(!on.stateChanged.includes(id), `displaced ${id} keeps its scan state (due next run)`);
  for (const id of ["x-60", "x-61", "x-62", "x-63", "x-69"]) assert.ok(!on.stateChanged.includes(id), `pilot card ${id} is not marked as searched`);
  assert.equal(on.jobRuns, 1, "the invocation still settles");
  assert.equal(on.allocationRuns, 1);
});

test("CP-3 request accounting: allowances vs definitely avoided vs actual, no claimed neutrality", () => {
  const off = run("off");
  const on = run("on");
  const p = on.response.crossMatchPilot;
  assert.deepEqual(p.allowances, {
    displacedTargetMax: { pptAttempts: 2, browseAttempts: 10 },
    pilotCardMax: { pptAttempts: 1, browseAttempts: 6 },
    definitelyAvoidedPerDisplaced: { pptAttempts: 1, browseAttempts: 0 },
    hypotheticallyAvoidedPerDisplacedMax: { pptAttempts: 1, browseAttempts: 10 },
  });
  assert.deepEqual(p.definitelyAvoided, { pptAttempts: 5, browseAttempts: 0 });
  assert.equal(p.actual.pptAttempts, 5);
  // Browse attempts counted by the hard per-substitution guard (not a lease): 2 + 1 + 1 + 1 + 0
  assert.equal(p.actual.browseAttempts, 5);
  assert.deepEqual(p.substitutions.map((s) => s.browseAttempts), [2, 1, 1, 1, 0]);
  assert.ok(p.substitutions.every((s) => s.browseAttempts <= p.allowances.pilotCardMax.browseAttempts));
  assert.equal(p.actual.browseAttemptsRefusedByGuard, 0);
  // the fixture's real request counts: PPT identical (5 avoided lookups, 5 pilot lookups);
  // Browse 5 fewer searches but 4 more condition checks - a fixture outcome, not a guarantee
  assert.equal(on.calls.getConditionPrices, off.calls.getConditionPrices);
  assert.equal(off.calls.searchListings - on.calls.searchListings, 5);
  assert.equal(on.calls.getRawListingDetail - off.calls.getRawListingDetail, 4);
  // no graded request is ever made for a pilot card
  assert.equal(on.calls.getGradingDetails ?? 0, off.calls.getGradingDetails ?? 0);
  assert.equal(on.calls.getGradedPrice ?? 0, off.calls.getGradedPrice ?? 0);
  const src = read("lib/crossMatchPricingPilot.js");
  assert.match(src, /comparing them does not show that\s*\n\/\/ actual calls are neutral/);
});

test("CP-4 integrity: raw, one identity, unstored everywhere, outside the target set; stored and held rows untouched; inserts only", () => {
  const on = run("on");
  const p = on.response.crossMatchPilot;
  assert.deepEqual(p.candidates.skipped, { graded: 1, ambiguous: 1, targetIdentity: 4, notRetained: 0 });
  assert.equal(p.candidates.storedListingsExcluded, 2, "the GB-stored and the held listing");
  assert.deepEqual(p.candidates.notWorth, { noCatalogPrice: 0, noListingBelowCatalogPrice: 1 });
  const deal = (listing) => on.dealsAfter.find((d) => d.listing_id === listing);
  // new eligible inserts (no copy anywhere at recheck or just after), attributed as cross-match discoveries
  for (const l of ["v1|820000000060|0", "v1|820000000160|0"]) {
    assert.equal(deal(l).watchlist_id, "w60");
    assert.equal(deal(l).is_active, true);
  }
  assert.deepEqual(on.discoveryEvents.filter((e) => e.search_type === "crossmatch").map((e) => e.listing).sort(), ["EBAY_US:820000000060", "EBAY_US:820000000160"]);
  assert.equal(p.inserted, 2, "only listings with no copy on any marketplace count as new");
  // cross-marketplace race, SAME identity: a GB copy appears during the insert - the US row stays, is a copy, not new supply, no discovery claim
  const copies61 = on.dealsAfter.filter((d) => d.listing_id === "v1|820000000061|0");
  assert.deepEqual(copies61.map((d) => [d.marketplace, d.watchlist_id, d.is_active, d.reason ?? null]).sort(), [["EBAY_GB", "w61", true, null], ["EBAY_US", "w61", true, null]]);
  assert.equal(p.copyOnOtherMarketplace, 1);
  // cross-marketplace race, DIFFERENT identity: the pilot's OWN row is quarantined; the other writer's GB row is untouched
  const copies62 = on.dealsAfter.filter((d) => d.listing_id === "v1|820000000062|0");
  const us62 = copies62.find((d) => d.marketplace === "EBAY_US");
  const gb62 = copies62.find((d) => d.marketplace === "EBAY_GB");
  assert.deepEqual([us62.is_active, us62.reason, us62.watchlist_id], [false, "identity:crossmatch_copy_conflict", "w62"]);
  assert.deepEqual([gb62.is_active, gb62.reason, gb62.watchlist_id, gb62.market_price], [true, null, "w-gb-writer", 999]);
  assert.equal(p.quarantinedAfterInsert, 1);
  assert.ok(!on.dealWrites.some((w) => w.listing_id === "v1|820000000062|0" && w.watchlist_id === "w-gb-writer" && w.op === "update"), "the GB row is never updated");
  // concurrent insertion between recheck and insert: the other writer's row wins untouched, no event, no enrichment
  const concurrent = deal("v1|820000000063|0");
  assert.equal(concurrent.watchlist_id, "sweep-writer");
  assert.equal(concurrent.market_price, 777);
  assert.equal(concurrent.first_seen_at, "2026-09-15T08:00:00.000Z");
  assert.equal(p.existing, 1);
  assert.ok(!on.dealWrites.some((w) => w.listing_id === "v1|820000000063|0" && w.op !== "upsert-insert"), "no update of the concurrent row");
  // stored elsewhere / held: unchanged, never revived or reassigned
  assert.deepEqual([deal("v1|820000000064|0").marketplace, deal("v1|820000000064|0").watchlist_id], ["EBAY_GB", "w64"]);
  assert.deepEqual([deal("v1|820000000065|0").is_active, deal("v1|820000000065|0").reason, deal("v1|820000000065|0").watchlist_id], [false, "identity:collector_number_conflict", "w-other"]);
  assert.ok(!on.dealsAfter.some((d) => d.listing_id === "v1|820000000064|0" && d.marketplace === "EBAY_US"));
  assert.ok(!on.dealsAfter.some((d) => d.listing_id === "v1|820000000068|0"), "ambiguous identity never written");
  assert.ok(!on.dealsAfter.some((d) => d.listing_id === "v1|820000000066|0"), "graded never written");
  // a partial appearance never expires the matched card's other listings
  assert.equal(deal("v1|820000009960|0").is_active, true);
  assert.deepEqual(
    on.dealWrites.filter((w) => w.values && w.values.is_active === false).map((w) => [w.listing_id, w.values.disqualified_reason]),
    [["v1|820000000062|0", "identity:crossmatch_copy_conflict"]],
    "no expiry update anywhere in the pilot run - the only deactivation is the pilot quarantining its own conflicting row"
  );
  // the displaced target's own listing is simply not written this run (its search did not happen)
  assert.ok(run("off").dealsAfter.some((d) => d.listing_id === "v1|820000000050|0"));
  assert.ok(!on.dealsAfter.some((d) => d.listing_id === "v1|820000000050|0"));
});

test("CP-5 too few usable candidates and pilot failure: no unnecessary displacement, normal behaviour preserved", () => {
  const off = run("off");
  for (const mode of ["insufficient", "fail"]) {
    const r = run(mode);
    const p = r.response.crossMatchPilot;
    assert.deepEqual(p.displacedTargets, [], mode);
    assert.deepEqual(p.tailScannedNormally, TAIL, mode);
    assert.deepEqual(r.calls, off.calls, `${mode}: identical requests to pilot off`);
    assert.equal(r.response.scanned, 60);
    assert.equal(r.stateChanged.length, 60);
    assert.deepEqual(r.discoveryEvents.map((e) => e.listing).sort(), off.discoveryEvents.map((e) => e.listing).sort());
    assert.equal(r.jobRuns, 1);
  }
  assert.equal(run("insufficient").response.crossMatchPilot.stoppedBy, "candidates_exhausted");
  assert.match(run("fail").response.crossMatchPilot.error, /injected ranking failure/);
  // failure part-way: only the target whose substitution was attempted is displaced; the other nine are scanned
  const mid = run("fail-mid");
  const mp = mid.response.crossMatchPilot;
  assert.deepEqual(mp.displacedTargets, ["x-50"]);
  assert.deepEqual(mp.tailScannedNormally, TAIL.slice(1));
  assert.match(mp.error, /injected mid-pilot failure/);
  assert.equal(mid.response.scanned, 59);
  assert.equal(mid.jobRuns, 1);
  assert.equal(mid.observationRecords.length, 1);
  assert.ok(mid.observationRecords[0].pilot, "the pilot's accounting travels with the run's observation record");
});

test("CP-6 helpers: tail selection, ranking on stored data only, stored-state read failure, insert-only write", async () => {
  const sel = [
    { card_tcgplayer_id: "a", reason: { lane: "explore", score: 0.1 }, _row: {} },
    { card_tcgplayer_id: "b", reason: { lane: "hot", score: 0.05 }, _row: {} },
    ...Array.from({ length: 12 }, (_, i) => ({ card_tcgplayer_id: `e${i}`, reason: { lane: "exploit", score: 1 - i / 100 }, _row: {} })),
  ];
  const tail = pilot.pilotTail(sel);
  assert.equal(tail.length, 10);
  assert.ok(tail.every((s) => s.reason.lane === "exploit"));
  assert.equal(tail[0].card_tcgplayer_id, "e11", "lowest score first");
  const cards = [
    { identity: "1|english", row: { last_known_price: 100 }, listings: [{ usd: 50 }, { usd: 95 }] },
    { identity: "2|english", row: { last_known_price: null }, listings: [{ usd: 10 }] },
    { identity: "3|english", row: { last_known_price: 100 }, listings: [{ usd: 20 }] }, // below the sanity floor
  ];
  const { ranked, notWorth } = pilot.rankPilotCards(cards, { usdTotal: (l) => l.usd, discountThreshold: 0.1, sanityFloorPct: 0.25 });
  assert.deepEqual(ranked.map((c) => [c.identity, c.promising]), [["1|english", 1]]);
  assert.deepEqual(notWorth, { noCatalogPrice: 1, noListingBelowCatalogPrice: 1 });
  const failing = { from: () => ({ select: () => ({ in: async () => ({ data: null, error: { message: "down" } }) }) }) };
  const r = await pilot.withoutStoredListings(failing, [{ listings: [{ listingId: "v1|1|0" }] }]);
  assert.deepEqual([r.cards, r.error], [[], "down"], "unknown stored state prices nothing");

  const db = createMemoryDb({ deals: [{ id: 1, source: "ebay", marketplace: "EBAY_GB", listing_id: "v1|9|0" }] });
  assert.equal((await insertNewSighting(db, { source: "ebay", marketplace: "EBAY_US", listing_id: "v1|9|0" })).where, "stored_before_write");
  assert.equal((await insertNewSighting(db, { source: "ebay", marketplace: "EBAY_US", listing_id: "v1|8|0", title: "new" })).outcome, "inserted");
  assert.equal(db.writes.filter((w) => w.op !== "upsert-insert").length, 0, "insert-only: never an update");
});

test("CP-7 wiring and off switch", () => {
  const src = read("app/api/refresh-deals/route.js");
  assert.match(src, /const pilotRequested = allocatedMode && allocatedCountry === "EBAY_US" && process\.env\.CROSSMATCH_PRICE_PILOT === "on";/);
  assert.match(src, /const pilotConfigured = pilotRequested && pilotDisabledReason == null;/);
  assert.match(src, /const canReconcile = !candidateMode && \(listings\.length > 0 \|\| total !== null\);/);
  assert.match(src, /if \(crossMatch && !candidateMode\) \{/);
  assert.match(src, /candidateMode \? await insertNewSighting\(db, core\) : await writeDiscoverySighting\(db, core\)/);
  // normal targets keep exactly the existing call shape
  assert.match(src, /const r = await scanCardInMarketplace\(\s*row,\s*marketplaceId,\s*marketData,\s*db,\s*discountThreshold,\s*rates,\s*tier \|\| "manual",\s*crossMatch\s*\);/);
  assert.equal(pilot.PILOT_MAX_CARDS, 10);
  assert.ok(pilot.PILOT_STOP_DEADLINE_MS < 800_000 - 120_000, "pilot work stops well before the job deadline");
});

test("CP-8 request bounds without pacing enforcement: a hard per-substitution attempt ceiling in every mode; unsupported modes disable the pilot", async (t) => {
  // route: guard exhaustion refuses the attempt, the listing is held (no write), later cards keep their own ceiling
  const off = run("off");
  const g = run("guard").response.crossMatchPilot;
  assert.deepEqual(g.substitutions.map((s) => [s.pilotCard, s.browseAttempts, s.browseAttemptsRefused]), [["x-60", 1, 1], ["x-61", 1, 0], ["x-62", 1, 0], ["x-63", 1, 0], ["x-69", 0, 0]]);
  assert.equal(g.actual.browseAttemptsRefusedByGuard, 1);
  assert.equal(g.substitutions[0].inserted, 1, "the refused condition check leaves that listing unwritten");
  assert.deepEqual(g.displacedTargets, ["x-50", "x-51", "x-52", "x-53", "x-54"], "exhaustion displaces nothing extra");
  const gr = run("guard");
  assert.equal(gr.calls.getRawListingDetail, 3 + 4, "normal targets' 3 checks + one per priced pilot card; nothing is spent through fallback targets");
  assert.equal(gr.calls.searchListings, off.calls.searchListings - 5);
  // observe mode behaves the same (the lease is not what bounds it)
  const obs = run("observe").response.crossMatchPilot;
  assert.equal(obs.mode, "observe");
  assert.equal(obs.actual.browseAttempts, 5);
  assert.deepEqual(obs.displacedTargets, ["x-50", "x-51", "x-52", "x-53", "x-54"]);
  // unknown quota reading: pilot disabled, run identical to pilot off
  const qu = run("quota-unknown");
  assert.deepEqual(qu.response.crossMatchPilot, { v: 1, disabled: "quota_reading_unknown" });
  assert.deepEqual(qu.calls, off.calls);
  // enforce: disabled by construction
  const src = read("app/api/refresh-deals/route.js");
  assert.match(src, /!\["off", "observe"\]\.includes\(browseBudgetMode\(\)\)\s*\?\s*`budget_mode_\$\{browseBudgetMode\(\)\}_unsupported`/);
  assert.match(src, /setBrowseAttemptGuard\(summary\.allowances\.pilotCardMax\.browseAttempts\)/);
  assert.match(src, /finally \{\s*clearBrowseAttemptGuard\(\);/);

  // the guard itself, through the real fetchWithRetry: retries count, observe and off never bypass it
  const telemetry = require(join(ROOT, "lib/ebayTelemetry.js"));
  const ebay = require(join(ROOT, "lib/ebay.js"));
  const prevMode = process.env.BROWSE_BUDGET_MODE;
  const prevFetch = globalThis.fetch;
  t.after(() => { process.env.BROWSE_BUDGET_MODE = prevMode; globalThis.fetch = prevFetch; });
  let sent = 0;
  globalThis.fetch = async () => { sent++; return new Response("x", { status: 503 }); };
  const inJob = (fn) => new Promise((resolve, reject) => setImmediate(() => { telemetry.beginJobRun({ job: "refresh-deals:allocated" }); fn().then(resolve, reject); }));
  for (const mode of ["off", "observe"]) {
    process.env.BROWSE_BUDGET_MODE = mode;
    sent = 0;
    await inJob(async () => {
      const guard = telemetry.setBrowseAttemptGuard(3);
      // 3 requests x (first attempt + one 5xx retry) would be 6 attempts; the ceiling stops at 3
      for (let i = 0; i < 3; i++) {
        try { await ebay.fetchWithRetry("https://api.ebay.com/buy/browse/v1/item/x", {}, { delayMs: 1 }); } catch (e) { assert.equal(e.name, "BrowseBudgetExhaustedError"); }
      }
      assert.equal(sent, 3, `${mode}: retries included, nothing beyond the ceiling is sent`);
      assert.equal(guard.attempts, 3);
      assert.ok(guard.refused >= 1);
      telemetry.clearBrowseAttemptGuard();
      await ebay.fetchWithRetry("https://api.ebay.com/buy/browse/v1/item/x", {}, { delayMs: 1 });
      assert.equal(sent, 5, `${mode}: cleared guard restores normal behaviour for later (normal) work`);
    });
  }
});

test("CP-9 concurrency guarantee: same-marketplace duplicates are atomic; cross-marketplace copies are checked right after insert", async () => {
  const schema = readFileSync(join(ROOT, "supabase/deals_v2_migration.sql"), "utf8");
  assert.match(schema, /create unique index if not exists deals_unique_listing\s+on deals \(source, marketplace, listing_id\);/);
  const { checkPilotInsertCopies, PILOT_COPY_CONFLICT_REASON } = require(join(ROOT, "lib/listingAvailability.js"));
  const seed = (other) => createMemoryDb({ deals: [{ id: 1, source: "ebay", marketplace: "EBAY_US", listing_id: "v1|7|0", is_active: true, disqualified_reason: null }, ...(other ? [{ id: 2, source: "ebay", marketplace: "EBAY_GB", listing_id: "v1|7|0", ...other }] : [])] });
  const check = (db) => checkPilotInsertCopies(db, { id: 1, listingId: "v1|7|0", cardId: "c1", language: "english" });
  const row = (db, id) => db.tables.deals.find((d) => d.id === id);
  // no copy: untouched
  let db = seed(null);
  assert.deepEqual(await check(db), { otherCopies: 0, quarantined: false });
  // same identity copy: untouched, reported as a copy
  db = seed({ card_tcgplayer_id: "c1", card_language: "english", is_active: true, disqualified_reason: null });
  assert.deepEqual(await check(db), { otherCopies: 1, quarantined: false });
  // held copy (identity quarantine) with the same identity: the pilot row is quarantined, the hold stays exactly as it was
  db = seed({ card_tcgplayer_id: "c1", card_language: "english", is_active: false, disqualified_reason: "review:held" });
  assert.equal((await check(db)).quarantined, true);
  assert.equal(row(db, 1).disqualified_reason, PILOT_COPY_CONFLICT_REASON);
  assert.equal(row(db, 2).disqualified_reason, "review:held");
  // availability-retired copy with the same identity is not a conflict
  db = seed({ card_tcgplayer_id: "c1", card_language: "english", is_active: false, disqualified_reason: "availability:sold" });
  assert.equal((await check(db)).quarantined, false);
  // different printing, different language, unreadable identity: quarantined; the other row untouched
  for (const other of [{ card_tcgplayer_id: "c2", card_language: "english" }, { card_tcgplayer_id: "c1", card_language: "japanese" }, { card_tcgplayer_id: null, card_language: null }]) {
    db = seed({ ...other, is_active: true, disqualified_reason: null });
    assert.equal((await check(db)).quarantined, true, JSON.stringify(other));
    assert.equal(row(db, 2).disqualified_reason, null);
    assert.equal(row(db, 2).is_active, true);
  }
  // a failed read fails closed
  const failing = { from: () => ({ select: () => ({ eq: async () => ({ data: null, error: { message: "down" } }) }), update: () => ({ eq: () => ({ is: () => ({ select: async () => ({ data: [{ id: 1 }], error: null }) }) }) }) }) };
  assert.equal((await checkPilotInsertCopies(failing, { id: 1, listingId: "v1|7|0", cardId: "c1", language: "english" })).quarantined, true);
  // a quarantined row is hidden by the display gate and never recoverable as an availability retirement
  const dq = require(join(ROOT, "lib/dealQuality.js"));
  assert.equal(dq.isDisplayableDeal({ is_active: true, disqualified_reason: PILOT_COPY_CONFLICT_REASON }), false);
  assert.ok(!PILOT_COPY_CONFLICT_REASON.startsWith("availability:"));
});
