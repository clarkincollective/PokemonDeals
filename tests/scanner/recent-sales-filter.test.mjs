// "Recent raw eBay sales" must be genuinely raw, same-printing evidence.
// PokemonPriceTracker's soldListings.ungraded bucket is advisory only - it
// routinely contains encapsulated slabs (many obscure graders) and sales
// of other printings that share this card's name + collector number
// (Celebrations Classic Collection, WOTC 1st Edition, XY Evolutions,
// EX-era reprints, Japanese prints). lib/dealMatching mentionsSlabGrader +
// rawSaleMatchesPrinting drop both; getFullPriceAnalysis applies the
// filter on the raw (no-grader) path only.
//
// Keyed on the CHARACTERISTIC (grader vocabulary / reprint markers /
// edition conflict), never on a card slug or name.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  mentionsSlabGrader,
  rawSaleMatchesPrinting,
  titleLooksGraded,
  rawSalePriceIsPlausible,
  RAW_SALE_HIGH_RATIO_CEILING,
} from "../../lib/dealMatching.js";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

// Canonical: WOTC Team Rocket #15 Holo (Unlimited by site convention -
// the card has a 1st Edition + Unlimited variant pair, page shows Unlimited).
const TR15 = { name: "Here Comes Team Rocket! (15)", set: "Team Rocket", cardNumber: "15/82", language: "english", firstEditionOnly: false };
// Canonical: a card that only ever had a 1st Edition print.
const FIRST_ED_ONLY = { name: "Sample Card (1)", set: "Some Set", cardNumber: "1/100", language: "english", firstEditionOnly: true };

test("1. a PSA graded sale is rejected from the raw list", () => {
  assert.equal(mentionsSlabGrader("#15/82 Here Comes Team Rocket! (15) |PSA NM-MT 8 | 88823725"), true);
  assert.equal(mentionsSlabGrader("Charizard 4/102 Base Set Holo PSA 9"), true);
  assert.equal(rawSaleMatchesPrinting("Here Comes Team Rocket! 15/82 Team Rocket Holo PSA 8", TR15), false);
});

test("2. a BGS / Beckett graded sale is rejected", () => {
  assert.equal(mentionsSlabGrader("Here Comes Team Rocket! 15/82 Team Rocket BGS 9"), true);
  assert.equal(mentionsSlabGrader("Here Comes Team Rocket! 15/82 Beckett 8.5"), true);
});

test("3. a CGC graded sale is rejected (including 'CGC Graded', 'Blue Label')", () => {
  assert.equal(mentionsSlabGrader("CGC Graded 8 Here Comes Team Rocket 15/82 Celebrations Classic"), true);
  assert.equal(mentionsSlabGrader("CGC Blue Label 9 MINT 1st Edition Holo Here Comes Team Rocket! 15/82"), true);
});

test("4. a TAG graded sale is rejected - but NOT a 'Tag Team' card", () => {
  assert.equal(mentionsSlabGrader("Here Comes Team Rocket 15/82 2000 WOTC TAG Graded 8.5 Near Mint"), true);
  assert.equal(mentionsSlabGrader("Gengar Fossil TAG 8"), true);
  assert.equal(mentionsSlabGrader("Reshiram & Charizard GX TAG TEAM GX 20/214 Unbroken Bonds"), false);
});

test("5. an ACE graded sale is rejected - but NOT 'ACE SPEC' / 'Ace Trainer'", () => {
  assert.equal(mentionsSlabGrader("Pokemon Here Comes Team Rocket Set 2000 Holo 15/82 Ace Graded 3 Good"), true);
  assert.equal(mentionsSlabGrader("Pokemon 2000 WOTC Team Rocket Holo Ace Grade 8 #15 Here Comes Team Rocket"), true);
  assert.equal(mentionsSlabGrader("Computer Search ACE SPEC 137/135 Plasma Storm Secret Rare"), false);
  assert.equal(mentionsSlabGrader("Ace Trainer 83/95 Call of Legends Uncommon"), false);
});

test("6. a CC&G graded sale is rejected (ampersand and &amp; forms)", () => {
  assert.equal(mentionsSlabGrader("Pokemon Celebrations: Here Comes Team Rocket! Holo 15/82 Graded CC&G 10"), true);
  assert.equal(mentionsSlabGrader("Pokemon Celebrations Holo 15/82 Graded CC&amp;G 10"), true);
});

test("7. a WAG graded sale is rejected", () => {
  assert.equal(mentionsSlabGrader("Here Comes Team Rocket! #15 WAG GEM MINT 10 2021 Pokemon Celebrations Holo"), true);
});

test("8. an explicit numeric grade tied to a label is rejected (Pristine 10, Mint 9, Gem Mint 10)", () => {
  assert.equal(mentionsSlabGrader("Here Comes Team Rocket! 15/82 Celebrations: Classic Collection Holo Pristine 10"), true);
  assert.equal(mentionsSlabGrader("Charizard 11/108 Evolutions Holo Pokemon XY MINT 9"), true);
  assert.equal(mentionsSlabGrader("Snorlax GMA 10 GEM MT"), true);
  assert.equal(mentionsSlabGrader("Mint 9.5 Blastoise Holo Celebrations Classic Collection 2/102"), true);
});

test("9. a generic legitimate raw title is retained", () => {
  assert.equal(mentionsSlabGrader("Here Comes Team Rocket! 15/82 Team Rocket Holo"), false);
  assert.equal(rawSaleMatchesPrinting("Here Comes Team Rocket! 15/82 Team Rocket Holo", TR15), true);
  assert.equal(rawSaleMatchesPrinting("Pokemon Here Comes Team Rocket! 15/82 Holo NM", TR15), true);
});

test("10. a Celebrations Classic Collection reprint sale is rejected from the WOTC original", () => {
  assert.equal(
    rawSaleMatchesPrinting("Here Comes Team Rocket! 15/82 Celebrations: Classic Collection Holo", TR15),
    false
  );
  assert.equal(
    rawSaleMatchesPrinting("2021 Pokemon SWSH Celebrations Here Comes Team Rocket! Classic #15/82", TR15),
    false
  );
});

test("11. an explicit '1st Edition' sale is rejected when the canonical print is not 1st Edition; kept when it is", () => {
  assert.equal(rawSaleMatchesPrinting("Here Comes Team Rocket! 15/82 Team Rocket Holo 1st edition", TR15), false);
  assert.equal(rawSaleMatchesPrinting("Here Comes Team Rocket! 15/82 Team Rocket Holo 1st Ed.", TR15), false);
  // canonical is 1st-Edition-only -> an "Unlimited" sale is the foreign one
  assert.equal(rawSaleMatchesPrinting("Sample Card 1/100 Some Set Holo 1st Edition", FIRST_ED_ONLY), true);
  assert.equal(rawSaleMatchesPrinting("Sample Card 1/100 Some Set Holo Unlimited", FIRST_ED_ONLY), false);
});

test("12. a collector-number conflict is rejected", () => {
  assert.equal(rawSaleMatchesPrinting("Here Comes Team Rocket! 71/82 Team Rocket Holo", TR15), false);
  assert.equal(rawSaleMatchesPrinting("Here Comes Team Rocket! 111/109 Secret Rare Holo", TR15), false);
});

test("13. a terse genuine same-printing listing is retained", () => {
  assert.equal(rawSaleMatchesPrinting("Here Comes Team Rocket! 15/82 Team Rocket Holo", TR15), true);
  assert.equal(rawSaleMatchesPrinting("Here Comes Team Rocket 15/82 2000 WOTC Pokemon Holo", TR15), true);
});

test("14. the raw-sales filter does not touch the headline market reference", () => {
  const src = readFileSync(join(REPO, "lib", "pokemonPriceTracker.js"), "utf8");
  // rawSaleMatchesPrinting is only applied to primarySoldListings, never
  // to raw.currentPrice / catalogRawMarketPrice / conditionBreakdown.
  assert.match(src, /primarySoldListings\s*=\s*primarySoldListings[\s\S]{0,60}\.filter\(\(s\) => rawSaleMatchesPrinting\(/);
  assert.doesNotMatch(src, /currentPrice:\s*[^\n]*rawSaleMatchesPrinting/);
  assert.doesNotMatch(src, /conditionBreakdown[\s\S]{0,400}rawSaleMatchesPrinting/);
});

test("15. the raw-sales filter does not alter the condition ladder", () => {
  const src = readFileSync(join(REPO, "lib", "pokemonPriceTracker.js"), "utf8");
  // conditionBreakdown is built from d.prices.conditions / variants only.
  assert.match(src, /conditionBreakdown:\s*\(\/1st\\s\*edition\/i\.test/);
});

test("16. an empty trusted-sales result renders an honest message, not nothing", () => {
  const src = readFileSync(join(REPO, "components", "RecentSales.js"), "utf8");
  assert.match(src, /No recent raw eBay sales clearly match this printing\./);
  assert.match(src, /if \(variant !== "raw" \|\| !Array\.isArray\(sales\)\) return null;/);
});

test("17. no card-specific slug / name blacklist in the filter", () => {
  const src = readFileSync(join(REPO, "lib", "dealMatching.js"), "utf8");
  const fn = src.slice(src.indexOf("function rawSaleMatchesPrinting"), src.indexOf("function rawSaleMatchesPrinting") + 900);
  assert.doesNotMatch(fn, /here[- ]comes[- ]team[- ]rocket/i);
  assert.doesNotMatch(fn, /\b8607[0-9]\b/); // no hard-coded tcgplayer ids
  assert.doesNotMatch(src.slice(src.indexOf("function mentionsSlabGrader"), src.indexOf("function mentionsSlabGrader") + 700), /here comes|celebrations charizard/i);
});

test("18. titleLooksGraded still delegates and existing graded detection holds", () => {
  for (const t of ["Charizard PSA 9", "Blastoise CGC 8.5", "Venusaur BGS 9", "Mew ACE 10", "Gengar Fossil TAG 8"]) {
    assert.equal(titleLooksGraded(t), true, t);
  }
  for (const t of ["Charizard 4/102 Base Set Holo Unlimited NM", "Pokemon CCG Charizard Base Set 4/102 Holo"]) {
    assert.equal(titleLooksGraded(t), false, t);
  }
});

test("19. rawSaleMatchesPrinting is a pure sync predicate (no await / network / image work)", () => {
  const started = Date.now();
  const out = rawSaleMatchesPrinting("Here Comes Team Rocket! 15/82 Team Rocket Holo", TR15);
  assert.equal(typeof out, "boolean");
  assert.ok(Date.now() - started < 50);
});

test("20. Japanese-print sale rejected from an English canonical card", () => {
  assert.equal(rawSaleMatchesPrinting("Here Comes Team Rocket! Rocket Gang Holo (Japanese)", TR15), false);
});

test("21. public-facing copy uses 'Pokemon' (no accent)", () => {
  const src = readFileSync(join(REPO, "components", "RecentSales.js"), "utf8");
  const accented = String.fromCharCode(0x50, 0x6f, 0x6b, 0x233, 0x6d, 0x6f, 0x6e);
  assert.equal(src.includes(accented), false);
});

// --- price-sanity ceiling (display hygiene) ------------------------------
//
// After rawSaleMatchesPrinting() the raw list is same-printing, but the
// provider feed still carries fat-finger / lot / slab-money prices on
// clean raw titles. rawSalePriceIsPlausible drops a retained sale whose
// price is an extreme multiple of the INDEPENDENT canonical raw reference
// (never the sample, never an absolute dollar figure). Multiplier derived
// from a 528-sale / 44-card audit: ratio median 1.08x, P95 3.9x, P99 12x;
// every sale >= 8x was fat-finger / mislisting / lot / slab-priced.
const REF_HCTR = 27.09;

test("22. $750 against a ~$27 reference is rejected (the live Here Comes Team Rocket case)", () => {
  assert.equal(rawSalePriceIsPlausible({ salePrice: 750, rawReference: REF_HCTR }), false);
});

test("23. $28 against ~$27 is retained", () => {
  assert.equal(rawSalePriceIsPlausible({ salePrice: 28, rawReference: REF_HCTR }), true);
});

test("24. $54.99 against ~$27 is retained", () => {
  assert.equal(rawSalePriceIsPlausible({ salePrice: 54.99, rawReference: REF_HCTR }), true);
});

test("25. a legitimate moderately-high sale (2-4x) is retained", () => {
  assert.equal(rawSalePriceIsPlausible({ salePrice: 80, rawReference: REF_HCTR }), true); // ~3x
  // genuine high-variance vintage: raw Base Set Charizard $2,799 vs ~$869 ref (3.2x)
  assert.equal(rawSalePriceIsPlausible({ salePrice: 2799, rawReference: 868.56 }), true);
  // raw Shadowless Base Set Mewtwo $1,399.99 vs ~$317 ref (4.4x)
  assert.equal(rawSalePriceIsPlausible({ salePrice: 1399.99, rawReference: 316.74 }), true);
});

test("26. a genuine high-value card with a high ABSOLUTE sale is retained; the impossible multiple is not", () => {
  // $5,000 sale on a $2,000-reference card is 2.5x -> kept (no absolute ceiling)
  assert.equal(rawSalePriceIsPlausible({ salePrice: 5000, rawReference: 2000 }), true);
  // $18,000 on a ~$1,500-reference card is 12x -> dropped (live M Charizard EX Flashfire case)
  assert.equal(rawSalePriceIsPlausible({ salePrice: 18000, rawReference: 1501.23 }), false);
  // $13,511 on a ~$317-reference card is 42.7x -> dropped (live Base Set Mewtwo case)
  assert.equal(rawSalePriceIsPlausible({ salePrice: 13511, rawReference: 316.74 }), false);
});

test("27. no fixed absolute-dollar ceiling is used - the rule is a relative multiple only", () => {
  const src = readFileSync(join(REPO, "lib", "dealMatching.js"), "utf8");
  const fn = src.slice(
    src.indexOf("function rawSalePriceIsPlausible"),
    src.indexOf("function rawSalePriceIsPlausible") + 400
  );
  // only comparison is salePrice <= ref * CEILING; no bare dollar constant
  assert.match(fn, /p\s*<=\s*ref\s*\*\s*RAW_SALE_HIGH_RATIO_CEILING/);
  assert.doesNotMatch(fn, /\b(?:100|500|1000|5000|10000)\b/);
  // the same $2 and $2,000,000 card are judged by the same multiple
  assert.equal(rawSalePriceIsPlausible({ salePrice: 15, rawReference: 2 }), rawSalePriceIsPlausible({ salePrice: 15e6, rawReference: 2e6 }));
});

test("28. no anchor (reference missing / sentinel) -> the sale is NOT second-guessed", () => {
  assert.equal(rawSalePriceIsPlausible({ salePrice: 999, rawReference: null }), true);
  assert.equal(rawSalePriceIsPlausible({ salePrice: 999, rawReference: 0 }), true);
  assert.equal(rawSalePriceIsPlausible({ salePrice: 0, rawReference: 50 }), false); // a non-positive price is never shown
});

test("29. the price-sanity filter runs AFTER rawSaleMatchesPrinting, on the raw path only", () => {
  const src = readFileSync(join(REPO, "lib", "pokemonPriceTracker.js"), "utf8");
  assert.match(
    src,
    /\.filter\(\(s\) => rawSaleMatchesPrinting\(s\.title, identity\)\)\s*\n\s*\.filter\(\(s\) => rawSalePriceIsPlausible\(\{ salePrice: s\.price, rawReference: rawNmRef \}\)\)/
  );
  // still gated on the no-grader (raw) branch
  assert.match(src, /if \(!primaryKey\) \{[\s\S]*rawSalePriceIsPlausible/);
});

test("30. the price-sanity filter feeds NOTHING but the displayed list", () => {
  const src = readFileSync(join(REPO, "lib", "pokemonPriceTracker.js"), "utf8");
  // raw.currentPrice / minPrice / maxPrice / history + conditionBreakdown +
  // graded are computed before and independently of primarySoldListings.
  assert.doesNotMatch(src, /currentPrice:[^\n]*rawSalePriceIsPlausible/);
  assert.doesNotMatch(src, /coherentGradedTiers\([^)]*rawSalePriceIsPlausible/);
  // dealQuality / deal discount logic never imports it
  const dq = readFileSync(join(REPO, "lib", "dealQuality.js"), "utf8");
  assert.doesNotMatch(dq, /rawSalePriceIsPlausible|primaryRecentSales/);
});

test("31. no card-name / slug / tcgplayer-id blacklist in the price-sanity rule", () => {
  const src = readFileSync(join(REPO, "lib", "dealMatching.js"), "utf8");
  const fn = src.slice(
    src.indexOf("function rawSalePriceIsPlausible"),
    src.indexOf("function rawSalePriceIsPlausible") + 400
  );
  assert.doesNotMatch(fn, /here[- ]comes|team[- ]rocket|charizard|mewtwo|\b\d{5,6}\b/i);
});

test("32. the raw caption now discloses the outlier exclusion, without overclaiming", () => {
  const src = readFileSync(join(REPO, "components", "RecentSales.js"), "utf8");
  assert.match(src, /obvious price-feed outliers are filtered out/);
  assert.doesNotMatch(src, /verified sales|authenticated sale|guaranteed comparable/i);
});

test("33. CEILING constant is a sane relative multiple (not 1x, not absurdly high)", () => {
  assert.ok(RAW_SALE_HIGH_RATIO_CEILING >= 5 && RAW_SALE_HIGH_RATIO_CEILING <= 12, String(RAW_SALE_HIGH_RATIO_CEILING));
});
