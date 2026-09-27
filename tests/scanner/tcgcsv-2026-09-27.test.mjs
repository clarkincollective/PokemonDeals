// TCGCSV as the free daily catalogue source (2026-09-27) - lib/tcgcsv.js,
// the merge in lib/savedReference.js, and the two routes that consume them.
//
//   node --test tests/scanner/tcgcsv-2026-09-27.test.mjs
//
// Static (no network, no database): the client is exercised against an
// in-memory fetch, the writes against the ingestion harness's memory db.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";

const require = createRequire(import.meta.url);
const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => readFileSync(join(REPO, p), "utf8");
const tcgcsv = require("../../lib/tcgcsv.js");
const saved = require("../../lib/savedReference.js");
const prov = require("../../lib/referenceProvenance.js");
const { selectConditionReference } = require("../../lib/dealMatching.js");
const { createMemoryDb } = await import(pathToFileURL(join(REPO, "tests/harness/ingestion/memoryDb.mjs")).href);

const LAST_MODIFIED = "Sat, 26 Sep 2026 20:02:58 GMT";
const FILE_AS_OF = "2026-09-26T20:02:58.000Z";
const LADDER_AS_OF = "2026-09-25T00:00:00.000Z";

// A fake tcgcsv.com: two groups (one WOTC, one modern), one single and one
// sealed product, prices for both. Records every request.
function fakeTcgcsv() {
  const calls = [];
  const docs = {
    "3/groups": [
      { groupId: 604, name: "Base Set", publishedOn: "1999-01-09T00:00:00" },
      { groupId: 24722, name: "ME: 30th Celebration", publishedOn: "2026-09-16T00:00:00" },
    ],
    "3/24722/products": [
      { productId: 696676, name: "Greninja ex - 021/128", cleanName: "Greninja ex 021 128", extendedData: [{ name: "Number", value: "021/128" }, { name: "Rarity", value: "Double Rare" }] },
      { productId: 700001, name: "30th Celebration Elite Trainer Box", cleanName: "30th Celebration Elite Trainer Box", extendedData: [] },
      // an unnumbered promo: no Number, but Rarity - a single (455 such Japanese watchlist cards, measured 26 Sep)
      { productId: 670191, name: "Charizard", cleanName: "Charizard", extendedData: [{ name: "Rarity", value: "Promo" }] },
      // a sealed product described only in prose
      { productId: 700002, name: "Booster Box", cleanName: "Booster Box", extendedData: [{ name: "Description", value: "36 packs" }] },
    ],
    "3/24722/prices": [
      { productId: 696676, lowPrice: 1.2, midPrice: 1.9, highPrice: 20, marketPrice: 1.74, directLowPrice: null, subTypeName: "Normal" },
      { productId: 696676, lowPrice: 3, midPrice: 4, highPrice: 30, marketPrice: 3.5, directLowPrice: null, subTypeName: "Holofoil" },
      { productId: 700001, lowPrice: 40, midPrice: 45, highPrice: 60, marketPrice: 44.99, directLowPrice: null, subTypeName: "Normal" },
      { productId: 670191, lowPrice: 300, midPrice: 400, highPrice: 900, marketPrice: 350, directLowPrice: null, subTypeName: "Holofoil" },
      { productId: 700002, lowPrice: 100, midPrice: 120, highPrice: 150, marketPrice: 119, directLowPrice: null, subTypeName: "Normal" },
    ],
  };
  const fetchImpl = async (url, init) => {
    const path = String(url).replace(`${tcgcsv.TCGCSV_BASE}/`, "");
    calls.push({ path, ua: init?.headers?.["User-Agent"] ?? null });
    const results = docs[path];
    if (!results) return new Response("not found", { status: 404 });
    return new Response(JSON.stringify({ totalItems: results.length, success: true, errors: [], results }), { status: 200, headers: { "content-type": "application/json", "last-modified": LAST_MODIFIED } });
  };
  return { fetchImpl, calls };
}

test("TC-1 the client: export-shaped rows, singles only, WOTC skipped, the file's Last-Modified as every row's provider date", async () => {
  const { fetchImpl, calls } = fakeTcgcsv();
  const got = await tcgcsv.fetchTcgcsvCatalogue({ language: "english", fetchImpl, pace: 0 });
  assert.deepEqual(calls.map((c) => c.path), ["3/groups", "3/24722/products", "3/24722/prices"], "groups once, then products + prices per non-WOTC group only");
  assert.ok(calls.every((c) => /pokemondealfinder/.test(c.ua)), "an identifying User-Agent on every request");
  assert.deepEqual(got.stats.skippedWotcGroups, ["Base Set"]);
  assert.equal(got.stats.sealedSkipped, 2, "the box with no attributes and the box described in prose");
  assert.equal(got.rows.length, 3, "two printings of the numbered single plus the unnumbered promo; sealed products are not cards");
  const promo = got.rows.find((r) => r.tcgPlayerId === "670191");
  assert.equal(promo.cardNumber, null, "an unnumbered single keeps a null number rather than an invented one");
  assert.equal(promo.marketPrice, 350);
  assert.equal(tcgcsv.isSingleCard({ extendedData: [{ name: "HP", value: "120" }] }), true);
  assert.equal(tcgcsv.isSingleCard({ extendedData: [{ name: "Description", value: "36 packs" }] }), false);
  const normal = got.rows.find((r) => r.printing === "Normal");
  assert.equal(normal.tcgPlayerId, "696676");
  assert.equal(normal.setName, "ME: 30th Celebration");
  assert.equal(normal.setId, "24722");
  assert.equal(normal.cardNumber, "021/128");
  assert.equal(normal.rarity, "Double Rare");
  assert.equal(normal.language, "english");
  assert.equal(normal.marketPrice, 1.74);
  assert.equal(normal.marketNearMint, 1.74, "the market figure is offered as the Near Mint column (see lib/tcgcsv.js header for the evidence)");
  assert.equal(normal.marketPriceCondition, "Near Mint");
  assert.equal(normal.lowPrice, 1.2);
  assert.equal(normal.lastPriceUpdate, FILE_AS_OF, "the publisher's Last-Modified, not our clock");
  assert.equal(got.asOf, FILE_AS_OF);
  assert.equal(got.stats.requests, 3);
});

test("TC-2 ref rows: one tcgcsv_ref per card + language, every printing kept, Near Mint only, written in chunks", async () => {
  const { fetchImpl } = fakeTcgcsv();
  const { rows } = await tcgcsv.fetchTcgcsvCatalogue({ language: "english", fetchImpl, pace: 0 });
  const refRows = tcgcsv.buildTcgcsvRefRows(rows, { retrievedAt: "2026-09-27T02:00:00.000Z" });
  assert.equal(refRows.length, 2, "one row per card: the numbered single and the promo");
  const row = refRows.find((r) => r.kind === "tcgcsv_ref:696676:english");
  assert.equal(row.kind, "tcgcsv_ref:696676:english");
  assert.equal(row.data.source, "tcgcsv");
  assert.deepEqual(Object.keys(row.data.printings).sort(), ["Holofoil", "Normal"]);
  assert.equal(row.data.printings.Normal.nm, 1.74);
  assert.equal(row.data.printings.Normal.marketCondition, "Near Mint");
  assert.equal(row.data.printings.Normal.lp, null, "no ladder is invented");
  assert.equal(row.data.printings.Normal.lastPriceUpdate, FILE_AS_OF);
  assert.equal(row.data.retrievedAt, "2026-09-27T02:00:00.000Z", "our download time is kept apart from the provider date");
  const db = createMemoryDb({ catalog_snapshot: [] });
  const res = await tcgcsv.writeTcgcsvRefs(db, refRows);
  assert.deepEqual(res, { written: 2, errors: [] });
  assert.equal(db.tables.catalog_snapshot.length, 2);
});

test("TC-3 mergeSavedRows: fresh Near Mint with its own date, the ladder's tiers with theirs; nothing invented, nothing shortened", () => {
  const ladder = { v: 1, tcgplayerId: "1", language: "english", source: "ppt_export", printings: { Normal: { nm: 60, lp: 51, mp: 45, hp: null, dmg: null, market: 60, marketCondition: "Near Mint", low: null, sellers: 5, lastPriceUpdate: LADDER_AS_OF } } };
  const fresh = { v: 1, tcgplayerId: "1", language: "english", source: "tcgcsv", printings: { Normal: { nm: 58, market: 58, marketCondition: "Near Mint", low: 55, lastPriceUpdate: FILE_AS_OF }, Holofoil: { nm: 120, market: 120, marketCondition: "Near Mint", lastPriceUpdate: FILE_AS_OF } } };
  assert.equal(saved.mergeSavedRows(null, null), null);
  assert.equal(saved.mergeSavedRows(ladder, null), ladder, "ladder-only passes through untouched");
  const both = saved.buildSavedMarketData(saved.mergeSavedRows(ladder, fresh));
  assert.deepEqual(both.byPrintingCondition.Normal, { "Near Mint": 58, "Lightly Played": 51, "Moderately Played": 45 });
  assert.deepEqual(both.byPrintingConditionAsOf.Normal, { "Near Mint": FILE_AS_OF, "Lightly Played": LADDER_AS_OF, "Moderately Played": LADDER_AS_OF });
  assert.deepEqual(both.byPrintingCondition.Holofoil, { "Near Mint": 120 }, "a printing only the fresh row prices is present, Near Mint only");
  assert.equal(both.byConditionReference["Near Mint"].observedAt, FILE_AS_OF);
  assert.equal(both.byConditionReference["Lightly Played"].observedAt, LADDER_AS_OF);
  assert.equal(both.fallbackReference.observedAt, FILE_AS_OF, "the fallback carries the date of the cell it was taken from");
  const freshOnly = saved.buildSavedMarketData(saved.mergeSavedRows(null, fresh));
  assert.deepEqual(freshOnly.byPrintingCondition.Normal, { "Near Mint": 58 });
  assert.equal(freshOnly.byConditionReference["Near Mint"].observedAt, FILE_AS_OF);
  // a preserved played tier at or above today's Near Mint is dropped, never re-scaled (Greninja ex 021/128, 27 Sep: NM 0.60 fresh vs LP 0.75 ladder)
  const moved = saved.mergeSavedRows(
    { printings: { Holofoil: { nm: 1.74, lp: 0.75, mp: 0.5, lastPriceUpdate: LADDER_AS_OF } } },
    { source: "tcgcsv", printings: { Holofoil: { nm: 0.6, market: 0.6, lastPriceUpdate: FILE_AS_OF } } }
  );
  assert.deepEqual(moved.printings.Holofoil.droppedAboveFreshNm, ["Lightly Played"]);
  const movedMd = saved.buildSavedMarketData(moved);
  assert.deepEqual(movedMd.byPrintingCondition.Holofoil, { "Near Mint": 0.6, "Moderately Played": 0.5 }, "the impossible Lightly Played tier is gone; the still-plausible Moderately Played tier stays with its own date");
  assert.equal(movedMd.byPrintingConditionAsOf.Holofoil["Moderately Played"], LADDER_AS_OF);
  const useless = { source: "tcgcsv", printings: { Normal: { nm: null, market: null, lastPriceUpdate: FILE_AS_OF } } };
  const unchanged = saved.buildSavedMarketData(saved.mergeSavedRows(ladder, useless));
  assert.equal(unchanged.byCondition["Near Mint"], 60, "a fresh row with nothing usable changes nothing");
  assert.equal(unchanged.byConditionReference["Near Mint"].observedAt, LADDER_AS_OF);
});

test("TC-4 loadSavedMarketData reads both families; savedReferenceIds counts a card either family prices", async () => {
  const db = createMemoryDb({
    catalog_snapshot: [
      { kind: "saved_ref:1:english", data: { v: 1, tcgplayerId: "1", language: "english", printings: { Normal: { nm: 60, lp: 51, lastPriceUpdate: LADDER_AS_OF } } } },
      { kind: "tcgcsv_ref:1:english", data: { v: 1, tcgplayerId: "1", language: "english", source: "tcgcsv", printings: { Normal: { nm: 58, market: 58, marketCondition: "Near Mint", lastPriceUpdate: FILE_AS_OF } } } },
      { kind: "tcgcsv_ref:2:japanese", data: { v: 1, tcgplayerId: "2", language: "japanese", source: "tcgcsv", printings: { Holofoil: { nm: 9, market: 9, marketCondition: "Near Mint", lastPriceUpdate: FILE_AS_OF } } } },
    ],
  });
  const both = await saved.loadSavedMarketData(db, { tcgplayerId: "1", language: "english" });
  assert.equal(both.savedFrom, "saved_ref+tcgcsv_ref");
  assert.equal(both.byCondition["Near Mint"], 58);
  assert.equal(both.byConditionReference["Near Mint"].observedAt, FILE_AS_OF);
  assert.equal(both.byConditionReference["Lightly Played"].observedAt, LADDER_AS_OF);
  assert.equal(both.source, "card_catalog", "the stored vocabulary is unchanged: a saved catalogue price");
  const jp = await saved.loadSavedMarketData(db, { tcgplayerId: "2", language: "japanese" });
  assert.equal(jp.savedFrom, "tcgcsv_ref");
  assert.deepEqual(jp.byPrintingCondition, { Holofoil: { "Near Mint": 9 } });
  assert.equal(await saved.loadSavedMarketData(db, { tcgplayerId: "2", language: "english" }), null, "language is identity");
  const ids = await saved.savedReferenceIds(db, ["1", "2", "3"], "japanese");
  assert.deepEqual([...ids], ["2"], "a card priced only by the fresh family counts");
});

test("TC-5 the scanner writes the producing cell's own date as reference_observed_at (matrix date only where the cell has none)", () => {
  const ROUTE = read("app/api/refresh-deals/route.js");
  const src = ROUTE.match(/const referenceFor = \(core\) => \{[\s\S]*?\n  \};/)[0].replace(/^const referenceFor = /, "");
  const run = (listingMarket, marketData, core) =>
    runInNewContext("(" + src.replace(/;$/, "") + ")", {
      row: { justtcg_tcgplayer_id: "1" },
      marketData,
      listingMarket,
      gradedReferenceSource: "ppt_live",
      selectConditionReference,
      buildCardReference: prov.buildCardReference,
      clearedReference: prov.clearedReference,
      CARD_REFERENCE_COLUMNS: prov.CARD_REFERENCE_COLUMNS,
    })(core);
  const marketData = { observedAt: FILE_AS_OF, source: "card_catalog" };
  const withCellDates = {
    source: "card_catalog",
    byConditionReference: {
      "Near Mint": { price: 58, condition: "Near Mint", printing: "Normal", observedAt: FILE_AS_OF },
      "Lightly Played": { price: 51, condition: "Lightly Played", printing: "Normal", observedAt: LADDER_AS_OF },
    },
    fallbackReference: null,
  };
  const nm = run(withCellDates, marketData, { market_price: 58, condition: "Near Mint", is_graded: false });
  assert.equal(nm.reference_observed_at, FILE_AS_OF);
  assert.equal(nm.reference_source, "card_catalog");
  const lp = run(withCellDates, marketData, { market_price: 51, condition: "Lightly Played", is_graded: false });
  assert.equal(lp.reference_observed_at, LADDER_AS_OF, "the Lightly Played comparison keeps the ladder's date, not the fresh one");
  const live = { source: "ppt_live", byConditionReference: { "Near Mint": { price: 58, condition: "Near Mint", printing: "Normal" } }, fallbackReference: null };
  const l = run(live, { observedAt: LADDER_AS_OF, source: "ppt_live" }, { market_price: 58, condition: "Near Mint", is_graded: false });
  assert.equal(l.reference_observed_at, LADDER_AS_OF, "a cell without its own date falls back to the matrix date, as before");
});

test("TC-6 wiring pins: default source, WOTC pass gated to the provider, snapshot limited to refreshed cards, Japanese writes no card_catalog, the second cron", () => {
  const sync = read("app/api/sync-card-catalog/route.js");
  assert.match(sync, /url\.searchParams\.get\("source"\) === "ppt" \? "ppt" : TCGCSV_SOURCE/, "tcgcsv is the default source");
  assert.match(sync, /if \(!limit && source === "ppt" && writeCatalog\) \{/, "the credit-spending WOTC pass runs only on the provider path");
  assert.match(sync, /const snapshotIds = source === "ppt" \? null : new Set\(provenanceById\.keys\(\)\);/);
  assert.match(sync, /if \(onlyIds && !onlyIds\.has\(String\(r\.tcgplayer_id\)\)\) continue;/, "a card not refreshed today gets no history point today");
  assert.match(sync, /const writeCatalog = language === "english";/);
  assert.ok(sync.indexOf('stage: "tcgcsv"') < sync.indexOf("await snapshotCatalogHistory("), "a TCGCSV failure bails before the history snapshot");
  assert.match(sync, /writeTcgcsvRefs\(db, refRows\)/);
  const scanner = read("app/api/refresh-deals/route.js");
  assert.match(scanner, /observedAt: ref\.observedAt \?\? marketData\?\.observedAt \?\? null/);
  assert.match(scanner, /observedAt: sweepRef\.observedAt \?\? marketData\.observedAt \?\? null/);
  assert.match(scanner, /observedAt: asOfRow\[tier\] \?\? null/);
  const cron = read("vercel.json");
  assert.match(cron, /"path": "\/api\/sync-card-catalog\?language=japanese"/);
  const client = read("lib/tcgcsv.js");
  assert.match(client, /WOTC_DUAL_PRINTING_SETS\.has/);
  assert.match(client, /language === "english" && isWotcDualPrintingGroup\(setName\)/, "the WOTC skip is scoped to English: a Japanese set sharing a name is a different product");
  assert.match(client, /"User-Agent": USER_AGENT/);
  assert.equal(tcgcsv.isWotcDualPrintingGroup("Neo Destiny"), true);
  assert.equal(tcgcsv.isWotcDualPrintingGroup("ME: 30th Celebration"), false);
});
