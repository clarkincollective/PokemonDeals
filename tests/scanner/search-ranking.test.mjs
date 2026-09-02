// SEO Phase 3 closeout - price-checker search reranking + raw/graded
// recent-sales integrity. Pure-logic tests (no server): the deterministic
// rerank over provider results, and the grader-title detector that keeps
// graded slabs out of a raw-only recent-sales list.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { rerankCatalogResults, scoreCatalogResult } from "../../lib/searchRanking.js";
import { titleLooksGraded, GRADED_CARD_PATTERN, GRADER_MENTION_PATTERN } from "../../lib/dealMatching.js";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const R = (name, set, cardNumber, marketPrice = 1) => ({
  tcgplayerId: `${name}|${set}|${cardNumber}`,
  name,
  set,
  cardNumber,
  marketPrice,
  cardHref: `/cards/${name.toLowerCase().replace(/\W+/g, "-")}-${set.toLowerCase().replace(/\W+/g, "-")}`,
});
const order = (arr, q) => rerankCatalogResults(arr, q).map((r) => `${r.name} / ${r.set}`);

// ===================== SEARCH RERANK =====================

test("1. an exact set phrase beats a prefix/extended set", () => {
  const o = order([R("Charizard", "Base Set 2", "004/130"), R("Charizard", "Base Set", "4/102")], "Charizard Base Set");
  assert.equal(o[0], "Charizard / Base Set");
});

test("2. 'Base Set' ranks ahead of 'Base Set 2' for a Base Set query", () => {
  const o = order(
    [R("Charizard", "Base Set 2", "004/130"), R("Charizard", "Legendary Collection", "3/110"), R("Charizard", "Base Set", "4/102")],
    "Charizard Base Set"
  );
  assert.equal(o[0], "Charizard / Base Set");
  assert.ok(o.indexOf("Charizard / Base Set") < o.indexOf("Charizard / Base Set 2"));
});

test("3. 'Base Set 2' ranks first when explicitly requested", () => {
  const o = order([R("Charizard", "Base Set", "4/102"), R("Charizard", "Base Set 2", "004/130")], "Charizard Base Set 2");
  assert.equal(o[0], "Charizard / Base Set 2");
});

test("4. an exact collector-number result ranks prominently", () => {
  const o = order(
    [R("Umbreon V", "SWSH07: Evolving Skies", "189/203"), R("Umbreon VMAX", "SWSH07: Evolving Skies", "215/203"), R("Umbreon VMAX", "SWSH07: Evolving Skies", "95/203")],
    "Umbreon VMAX 215/203"
  );
  assert.equal(o[0], "Umbreon VMAX / SWSH07: Evolving Skies");
  // the 215/203 one, not the 95/203 one
  const ranked = rerankCatalogResults(
    [R("Umbreon VMAX", "SWSH07: Evolving Skies", "95/203"), R("Umbreon VMAX", "SWSH07: Evolving Skies", "215/203")],
    "Umbreon VMAX 215/203"
  );
  assert.equal(ranked[0].cardNumber, "215/203");
});

test("5. exact name + set + collector number wins outright", () => {
  const o = order(
    [
      R("Charizard", "Celebrations: Classic Collection", "4/102"),
      R("Charizard", "Base Set 2", "004/130"),
      R("Charizard", "Base Set", "4/102"),
    ],
    "Charizard Base Set 4/102"
  );
  assert.equal(o[0], "Charizard / Base Set");
});

test("5b. bare collector number: both legitimate exact-number prints stay prominent", () => {
  // "Charizard 4/102" - Base Set AND Celebrations reprint are both 4/102.
  const ranked = rerankCatalogResults(
    [R("Charizard", "Celebrations: Classic Collection", "4/102"), R("Charizard", "Base Set", "4/102"), R("Drapion", "Triumphant", "4/102")],
    "Charizard 4/102"
  );
  assert.deepEqual(ranked.slice(0, 2).map((r) => r.name).sort(), ["Charizard", "Charizard"]);
  assert.equal(ranked[2].name, "Drapion");
  // neither Charizard is buried
  assert.ok(scoreCatalogResult(ranked[0], "Charizard 4/102") === scoreCatalogResult(ranked[1], "Charizard 4/102"));
});

test("6. a specialty card is demoted on a broad species query", () => {
  const o = order(
    [R("Mewtwo EX", "Jumbo Cards", "XY183"), R("Mewtwo", "Base Set", "10/102"), R("Mewtwo GX", "Shining Legends", "39/73")],
    "Mewtwo"
  );
  assert.equal(o[o.length - 1], "Mewtwo EX / Jumbo Cards");
  assert.ok(scoreCatalogResult(R("Mewtwo EX", "Jumbo Cards", "XY183"), "Mewtwo") < 0);
});

test("7. a specialty card is NOT demoted when specialty intent is explicit", () => {
  const o = order([R("Mewtwo", "Base Set", "10/102"), R("Mewtwo EX", "Jumbo Cards", "XY183")], "Mewtwo Jumbo");
  assert.equal(o[0], "Mewtwo EX / Jumbo Cards");
  assert.ok(scoreCatalogResult(R("Mewtwo EX", "Jumbo Cards", "XY183"), "Mewtwo Jumbo") > 0);
  // "world championship" intent works too
  assert.ok(
    scoreCatalogResult(R("Gengar", "World Championship Decks", "x"), "Gengar world championship") > 0
  );
});

test("8. fuzzy/provider order survives a query with no strong catalogue signal", () => {
  const provider = [R("Charizard EX", "XY Promos", "XY29"), R("Charizard", "Base Set", "4/102")];
  // "Charzard" (misspelt) - no exact match, both score equal -> provider order kept
  assert.deepEqual(order(provider, "Charzard"), ["Charizard EX / XY Promos", "Charizard / Base Set"]);
  // empty / 1-item inputs are returned untouched
  assert.deepEqual(rerankCatalogResults([], "x"), []);
  assert.deepEqual(rerankCatalogResults([provider[0]], "x"), [provider[0]]);
});

test("9. the ranker has no hard-coded Pokemon-specific rules", () => {
  const src = readFileSync(join(REPO, "lib", "searchRanking.js"), "utf8").replace(/\/\/.*$/gm, "");
  assert.ok(!/charizard|pikachu|mewtwo|umbreon|eevee/i.test(src), "searchRanking.js names a specific Pokemon");
  // it reuses the existing specialty classifier, not a new one
  assert.match(src, /import \{ isSpecialtyCard \} from "\.\/catalogueView\.js"/);
  assert.ok(!/SPECIALTY_SETS\s*=/.test(src), "searchRanking.js defines its own specialty set list");
});

test("10. reranking never drops or rewrites a result's cardHref destination", () => {
  const input = [R("Mewtwo EX", "Jumbo Cards", "XY183"), R("Mewtwo", "Base Set", "10/102")];
  const out = rerankCatalogResults(input, "Mewtwo");
  assert.equal(out.length, input.length);
  for (const r of out) assert.ok(r.cardHref.startsWith("/cards/"));
  assert.deepEqual(new Set(out.map((r) => r.cardHref)), new Set(input.map((r) => r.cardHref)));
});

// ===================== RECENT SALES RAW / GRADED =====================

test("11. a PSA sold-listing title is detected as graded", () => {
  assert.ok(titleLooksGraded("Charizard 4/102 Base Set Holo PSA 9"));
  assert.ok(titleLooksGraded("Charizard 4/102 Celebrations Classic Collection Holo PSA Graded 9"));
  assert.ok(titleLooksGraded("Charizard PSA10 GEM MINT"));
});

test("12. CGC / BGS / Beckett / SGC / ACE / TAG titles are detected as graded", () => {
  for (const t of [
    "Blastoise Base Set CGC 8.5",
    "Venusaur Base Set BGS 9",
    "Charizard Base Set Beckett 8",
    "Pikachu SGC 9",
    "Mew ACE 10",
    "Gengar Fossil TAG 8",
  ]) {
    assert.ok(titleLooksGraded(t), `not detected: ${t}`);
  }
});

test("12b. 'Ace Graded' / 'TAG Graded' (grader word, no adjacent digit) are detected as graded", () => {
  // Live raw/graded leak on the "Here Comes Team Rocket! (15)" card page:
  // "...TAG Graded 8.5..." and "...Ace Graded 3 Good..." reached the raw
  // recent-sales list because the grade digit is not adjacent to the
  // grader token. GRADER_MENTION_PATTERN's "<grader> grad(e/ed/ing)" arm
  // covers them.
  for (const t of [
    "Here Comes Team Rocket! 15/82 Team Rocket Holo TAG Graded 8.5",
    "Here Comes Team Rocket! 15/82 Holo Ace Graded 3 Good",
    "Charizard 4/102 Base Set Holo ACE GRADING 9",
  ]) {
    assert.ok(titleLooksGraded(t), `not detected: ${t}`);
    assert.ok(GRADER_MENTION_PATTERN.test(t), `GRADER_MENTION_PATTERN missed: ${t}`);
  }
});

test("13. a genuinely raw sold-listing title is NOT flagged graded", () => {
  for (const t of [
    "Charizard 4/102 Base Set Holo Near Mint Unlimited",
    "Blastoise Base Set 2 Holo Rare LP",
    "Charizard Celebrations Classic Collection Holo Raw Ungraded",
  ]) {
    assert.equal(titleLooksGraded(t), false, `false positive: ${t}`);
  }
});

test("14. the raw recent-sales list omits graded slabs AND foreign printings", () => {
  // getFullPriceAnalysis filters primaryRecentSales with
  // rawSaleMatchesPrinting when no grader was requested (primaryKey null
  // -> the raw path). See tests/scanner/recent-sales-filter.test.mjs for
  // the behaviour of the filter itself.
  const src = readFileSync(join(REPO, "lib", "pokemonPriceTracker.js"), "utf8");
  assert.match(src, /if \(!primaryKey\) \{[\s\S]*primarySoldListings[\s\S]{0,60}\.filter\(\(s\) => rawSaleMatchesPrinting\(s\.title, identity\)\)/);
  assert.match(src, /require\("\.\/dealMatching"\)/);
});

test("15. the aggregate market history and individual sales stay distinctly labelled", () => {
  const rs = readFileSync(join(REPO, "components", "RecentSales.js"), "utf8");
  assert.match(rs, /Recent raw eBay sales|Recent eBay sales/);
  assert.match(rs, /appear to match this raw printing/);
  assert.match(rs, /Graded slabs,? .*(?:other printings|price-feed outliers).* are filtered out/);
  const card = readFileSync(join(REPO, "app", "cards", "[slug]", "page.js"), "utf8");
  assert.match(card, /Market price history/);
  assert.match(card, /variant=\{analysis\?\.primaryKey === "raw" \? "raw" : null\}/);
});

test("16. VariantPriceGrid graded pricing is untouched", () => {
  const vg = readFileSync(join(REPO, "components", "VariantPriceGrid.js"), "utf8");
  // still driven by analysis.graded (real recorded sales), no new filter
  assert.match(vg, /graded/);
  assert.ok(!vg.includes("titleLooksGraded"), "VariantPriceGrid was changed to reference titleLooksGraded");
});

test("17. raw condition pricing (the ladder) is untouched", () => {
  const cps = readFileSync(join(REPO, "components", "CardPriceSummary.js"), "utf8");
  assert.match(cps, /conditionLadder/);
  assert.match(cps, /c\.price > nm \* 1\.02 \|\| c\.price > prev/);
  assert.ok(!cps.includes("titleLooksGraded"), "CardPriceSummary was changed");
});

// --- 20: deal / matcher / authenticity / freshness code untouched ---

test("20. no deal / matcher / authenticity / freshness logic changed", () => {
  const dm = readFileSync(join(REPO, "lib", "dealMatching.js"), "utf8");
  // listingMatchesCard + the trust gate are untouched; we only ADDED a
  // title helper + export.
  assert.match(dm, /function listingMatchesCard\(/);
  // the deal-side grader pattern is EXACTLY as it was (6 supported graders)
  assert.match(dm, /const GRADED_CARD_PATTERN = \/\\b\(psa\|cgc\|bgs\|sgc\|ace\|tag\)\\s\*-\?\\s\*\\d\/i;/);
  assert.match(GRADED_CARD_PATTERN.source, /psa\|cgc\|bgs\|sgc\|ace\|tag/);
  // the recent-sales-only mention pattern covers the 6 + Beckett + the
  // common off-brand slab graders
  for (const t of ["Charizard PSA 9", "Blastoise BGS 9", "x Beckett 8", "y GMA 10", "z TQG 9.5"]) {
    assert.ok(GRADER_MENTION_PATTERN.test(t), `GRADER_MENTION_PATTERN missed: ${t}`);
  }
  // ...and does NOT fire on ordinary words
  for (const t of ["Ace Trainer Pikachu", "Pikachu & Zekrom Tag Team GX", "Mint condition raw"]) {
    assert.ok(!GRADER_MENTION_PATTERN.test(t), `GRADER_MENTION_PATTERN false positive: ${t}`);
  }
  const route = readFileSync(join(REPO, "app", "api", "card-search", "route.js"), "utf8");
  assert.ok((route.match(/isDisplayableDeal/g) ?? []).length >= 3, "card-search dropped an isDisplayableDeal guard");
});
