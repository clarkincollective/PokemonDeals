// 28 Sep 2026 - owner: "I'm not upgrading pokemon price tracker. you have
// one job. find ways we can keep the market data updated. using free
// sources and webscraping." Covers the three free replacements: TCGCSV
// sealed-product extraction (lib/tcgcsv), board-valuation graded-price
// mining (lib/boardGradedMining), and the PPT pause switch itself.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..");
const read = (p) => readFileSync(join(REPO, p), "utf8");
const require = createRequire(import.meta.url);
const tcgcsv = require("../../lib/tcgcsv.js");
const mining = require("../../lib/boardGradedMining.js");

// ---------------------------------------------------------- tcgcsv sealed

test("FMD-1 buildSealedCatalogRows: classifies by the SAME type rules sealed_catalog already uses, dedupes by product id", () => {
  const rows = tcgcsv.buildSealedCatalogRows([
    { tcgPlayerId: "1", name: "Evolving Skies Elite Trainer Box", setName: "Evolving Skies", setId: "100", imageUrl: "https://tcgplayer-cdn.tcgplayer.com/product/1_200w.jpg", unopenedPrice: 55.5 },
    { tcgPlayerId: "2", name: "Evolving Skies Booster Box", setName: "Evolving Skies", setId: "100", imageUrl: null, unopenedPrice: 140 },
    { tcgPlayerId: "1", name: "Evolving Skies Elite Trainer Box", setName: "Evolving Skies", setId: "100", imageUrl: null, unopenedPrice: 56.25 }, // a later row for the same id wins
    { tcgPlayerId: "3", name: "Some Promo Thing", setName: "Evolving Skies", setId: "100", imageUrl: null, unopenedPrice: 999.99 }, // PPT sentinel
  ]);
  assert.equal(rows.length, 3);
  const byId = Object.fromEntries(rows.map((r) => [r.tcgplayer_id, r]));
  assert.equal(byId["1"].product_type, "Elite Trainer Box");
  assert.equal(byId["1"].market_price, 56.25, "the later row for the same id wins");
  assert.equal(byId["2"].product_type, "Booster Box");
  assert.equal(byId["3"].market_price, null, "a PokemonPriceTracker-style sentinel is still rejected");
  for (const r of rows) assert.equal(r.source, "tcgcsv");
});

test("FMD-2 fetchTcgcsvCatalogue collects sealed rows in the SAME pass as card rows - no extra request", () => {
  const src = read("lib/tcgcsv.js");
  assert.match(src, /return \{ rows, sealedRows, asOf, stats \};/, "one return carrying both, not a second fetch pass");
  assert.doesNotMatch(src, /sealedProducts\.get\(id\)[\s\S]{0,40}tcgcsvGet/, "no extra tcgcsvGet call in the sealed branch");
});

// ---------------------------------------------------- board graded mining

test("FMD-3 parseValuationBasis: a grader+grade string parses; a condition tier (raw boards) does not", () => {
  assert.deepEqual(mining.parseValuationBasis("PSA 10"), { grader: "psa", grade: "10" });
  assert.deepEqual(mining.parseValuationBasis("cgc 9.5"), { grader: "cgc", grade: "9.5" });
  assert.equal(mining.gradeKeyOf("psa", "9.5"), "psa9_5");
  for (const basis of ["NM", "LP", "MP", "HP", "DMG", "NM (assumed)", ""]) {
    assert.equal(mining.parseValuationBasis(basis), null, `"${basis}" must not parse as a grade`);
  }
});

test("FMD-4 observationFromBoardRow: needs a parseable grade, a positive valuation, and a listing identity", () => {
  const base = { valuation: 100, valuationBasis: "PSA 10", marketplace: "EBAY_US", itemId: "123", at: "2026-09-28T00:00:00Z" };
  const obs = mining.observationFromBoardRow(base);
  assert.equal(obs.key, "psa10");
  assert.equal(obs.listingKey, "EBAY_US:123");
  assert.equal(obs.price, 100);
  assert.equal(mining.observationFromBoardRow({ ...base, valuationBasis: "MP" }), null, "a raw condition tier never becomes a grade");
  assert.equal(mining.observationFromBoardRow({ ...base, valuation: 0 }), null);
  assert.equal(mining.observationFromBoardRow({ ...base, itemId: null }), null);
  assert.equal(mining.observationFromBoardRow({ ...base, at: null }), null);
});

test("FMD-5 mergeGradedBucket: a rolling window, deduped by listing, newest-first, capped, age-pruned", () => {
  const now = Date.parse("2026-09-28T00:00:00Z");
  const day = (n) => new Date(now - n * 86_400_000).toISOString();
  const obsAt = (listingKey, price, daysAgo) => ({ key: "psa10", grader: "psa", grade: "10", listingKey, price, at: day(daysAgo) });

  // first run: three distinct listings
  const first = mining.mergeGradedBucket(null, [obsAt("a", 100, 10), obsAt("b", 110, 5), obsAt("c", 90, 1)], now);
  assert.equal(first.count, 3);
  assert.equal(first.minPrice, 90);
  assert.equal(first.maxPrice, 110);
  assert.equal(first.lastSaleDate, day(1), "newest observation wins lastSaleDate");
  assert.equal(Math.round(first.price), 100, "price is the window's mean");

  // second run: "a" re-seen at the SAME price (still live, not a new sale) + one genuinely new listing "d"
  const second = mining.mergeGradedBucket(first, [obsAt("a", 100, 10), obsAt("d", 130, 0)], now);
  assert.equal(second.count, 4, "re-seeing a still-live listing adds nothing; a new listing does");
  assert.equal(second.lastSaleDate, day(0));

  // a stale-only bucket (nothing within the max-age window) drops out entirely
  const staleOnly = mining.mergeGradedBucket(null, [obsAt("old", 50, 400)], now);
  assert.equal(staleOnly, null);

  // the cap: more than MAX_OBSERVATIONS_PER_GRADE distinct listings keeps only the newest
  const many = Array.from({ length: mining.MAX_OBSERVATIONS_PER_GRADE + 10 }, (_, i) => obsAt(`listing${i}`, 100, i));
  const capped = mining.mergeGradedBucket(null, many, now);
  assert.equal(capped.count, mining.MAX_OBSERVATIONS_PER_GRADE);
});

test("FMD-6 buildGradedMiningUpdate: the written row is exactly what loadSavedGradedPrice already reads, provenance says board_valuation", () => {
  const boardRows = [
    { captured: { valuation: 500, valuationBasis: "PSA 10", at: "2026-09-26T00:00:00Z" }, marketplace: "EBAY_US", itemId: "1" },
    { captured: { valuation: 520, valuationBasis: "PSA 10", at: "2026-09-27T00:00:00Z" }, marketplace: "EBAY_GB", itemId: "2" },
    { captured: { valuation: 510, valuationBasis: "PSA 10", at: "2026-09-28T00:00:00Z" }, marketplace: "EBAY_AU", itemId: "3" },
  ];
  const row = mining.buildGradedMiningUpdate(null, boardRows, { tcgplayerId: "99", language: "english", cardName: "Charizard", setName: "Evolving Skies", rawNm: 50 });
  assert.equal(row.tcgplayerId, "99");
  assert.equal(row.source, "board_valuation");
  assert.equal(row.rawNm, 50);
  assert.ok(row.salesByGrade.psa10);
  assert.equal(row.salesByGrade.psa10.count, 3);
  assert.equal(mining.anyGradePassesConfidence(row), true, "3 corroborating listings clears gradedTierConfidence's minSales");

  // a second run with only ONE new sighting merges onto the first, not replaces it
  const again = mining.buildGradedMiningUpdate(row, [{ captured: { valuation: 530, valuationBasis: "PSA 10", at: "2026-09-29T00:00:00Z" }, marketplace: "EBAY_CA", itemId: "4" }], {
    tcgplayerId: "99",
    language: "english",
  });
  assert.equal(again.salesByGrade.psa10.count, 4, "accumulates across runs instead of starting over");
  assert.equal(again.cardName, "Charizard", "unset meta falls back to the existing row's");

  // too few corroborating listings for a grade -> that grade is absent from the row (never a 1-sale figure)
  const thin = mining.buildGradedMiningUpdate(null, [{ captured: { valuation: 10, valuationBasis: "CGC 8", at: "2026-09-28T00:00:00Z" }, marketplace: "EBAY_US", itemId: "5" }], { tcgplayerId: "99" });
  // mergeGradedBucket still builds the bucket (count 1) - the GATE suppresses it at read time, same as a live PPT bucket would be
  assert.equal(thin.salesByGrade.cgc8.count, 1);
  assert.equal(mining.anyGradePassesConfidence(thin), false, "a single listing never passes minSales on its own");
});

// ------------------------------------------------------------- the switch

test("FMD-7 sync-watchlist and sync-sealed-catalog default to the free source; PPT stays an explicit, named opt-in", () => {
  const watchlist = read("app/api/sync-watchlist/route.js");
  assert.match(watchlist, /await syncViaTcgcsv\(db, manualKeys, \{ groupLimit, language \}\)/);
  assert.match(watchlist, /fetchTcgcsvCatalogue\(\{ language, groupLimit \}\)/);
  const sealed = read("app/api/sync-sealed-catalog/route.js");
  assert.match(sealed, /const source = url\.searchParams\.get\("source"\) === "ppt" \? "ppt" : TCGCSV_SOURCE;/);
  assert.match(sealed, /await syncFromTcgcsv\(\{ limit \}\)/);
});

test("FMD-8 the pause flag closes every PPT door with no request attempted", () => {
  const ppt = read("lib/pokemonPriceTracker.js");
  assert.match(ppt, /function savedDataModeOn\(\)/);
  assert.match(ppt, /if \(savedDataModeOn\(\)\) throw new PptPausedError\(\);/);
});

test("FMD-9 card-search's tcgplayerId branch degrades instead of a hard 500", () => {
  const src = read("app/api/card-search/route.js");
  assert.doesNotMatch(src, /catch \(err\) \{\s*return Response\.json\(\{ error: err\.message \}, \{ status: 500 \}\);\s*\}/);
  assert.match(src, /console\.error\("card-search tcgplayerId lookup failed:"/);
});
