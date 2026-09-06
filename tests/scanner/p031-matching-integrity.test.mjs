// P0.3.1 - multi-card / language / grade matching integrity.
//
// Fixes the live defect from the P0.2.2 audit: a listing that cannot be
// reconciled apples-to-apples with the catalogue/reference card (on
// number of cards, language, grade, or exact-printing basis) must not
// enter or stay in deal inventory.
//
// Known bad live rows this locks down:
//   - deal 31721  "3 CARDS: 2025 THROH #050, 2000 ITALIAN FOSSIL #8
//                  HYPNO, 2001 ITALIAN #8 GUARADOS"  (multi-card lot +
//                  Italian + spurious PSA 10 on a raw lot, priced vs a
//                  $1,388.97 English PSA 10 single)
//   - deal 31556  "Aerodactyl Holo 1a Edizione PSA 1 Fossil Italiano
//                  1/62 2000"  (Italian print vs English reference)

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  looksLikeMultiCardListing,
  qualifiesAsTradingCard,
  listingMatchesCard,
  classifyListingLanguage,
  languageCompatible,
  gradedReferenceAllowed,
  isRecognisedGrader,
  isValidGradeValue,
  titleStatedSlabGrade,
} from "../../lib/dealMatching.js";
import { disqualificationReason } from "../../lib/dealQuality.js";

const T = (title) => ({ title });
const match = (title, card) => listingMatchesCard({ title }, card);

const HYPNO_LOT = "3 CARDS: 2025 THROH #050, 2000 ITALIAN FOSSIL #8 HYPNO, 2001 ITALIAN #8 GUARADOS";
const AERODACTYL_IT = "Aerodactyl Holo 1a Edizione PSA 1 Fossil Italiano 1/62 2000 Pokemon TCG POP 3";

// ============ 1. MULTI-CARD / LOT DETECTION ============

test("1. '3 CARDS: ...' is rejected as a multi-card listing", () => {
  assert.equal(looksLikeMultiCardListing(HYPNO_LOT), true);
  assert.equal(qualifiesAsTradingCard(T(HYPNO_LOT)), false);
});

test("2. '2 CARDS ...' is rejected", () => {
  assert.equal(looksLikeMultiCardListing("2 CARDS Pikachu & Charizard Base Set 1999"), true);
  assert.equal(qualifiesAsTradingCard(T("2 CARDS Pikachu & Charizard Base Set 1999")), false);
});

test("3. other explicit multi-card structures are rejected", () => {
  for (const t of [
    "Pokemon Dragonite ex and Jolteon Delta Species Set of 2",
    "5 CARD LOT vintage holo Pokemon WOTC",
    "Charizard Blastoise Venusaur Base Set - Pair of cards",
    "Job Lot Pokemon holo bundle vintage",
    "Bundle of 6 Pokemon holo rares",
    "x3 Pokemon Charizard Base Set holo",
    "Pokemon cards x4 vintage holo",
    "10 Pokemon Cards Charizard Pikachu bulk",
    "Blaine's Rapidash 33/132 & Blaine's Charmeleon 32/132 Gym Challenge",
    "Pikachu 70/111 , Sentret 71/111 Neo Genesis WOTC",
  ]) {
    assert.equal(looksLikeMultiCardListing(t), true, `should flag: ${t}`);
  }
});

test("4. a normal single-card title still passes (no false positives)", () => {
  for (const t of [
    "Charizard 4/102 Base Set Shadowless 1999 Holo Rare PSA 10",
    "Blastoise CGC 10 Card SV9 072/100 Battle Partners Japanese",
    "Pikachu VMAX Secret 188/185 Vivid Voltage Holo",
    "SV: Scarlet & Violet 151 Charizard ex 006/165 Holo",
    "Umbreon VMAX Alternate Art Secret 215/203 Evolving Skies",
    "IVY Pikachu Black Star 1 - League Promo Exclusive WotC - 1999 Card NM",
    "1x Pokemon Bulbasaur SM198 Detective Pikachu Movie Promo SEALED",
    "Rayquaza & Deoxys LEGEND 89/90 & 90/90 Undaunted Holo",
    "Suicune & Entei LEGEND (Top & Bottom) 94/95 & 95/95 2011",
    "Trading Cards Charizard ex Obsidian Flames 125/197",
  ]) {
    assert.equal(looksLikeMultiCardListing(t), false, `should NOT flag: ${t}`);
    assert.equal(qualifiesAsTradingCard(T(t)), true, `should qualify: ${t}`);
  }
});

// ============ 2. LANGUAGE REVERSE GUARD ============

const EN = (over = {}) => ({ name: "Aerodactyl", set: "Fossil", language: "english", card_number: "1/62", ...over });

test("5. English catalogue + Italian listing is rejected", () => {
  assert.equal(classifyListingLanguage({ title: AERODACTYL_IT }), "italian");
  assert.equal(match(AERODACTYL_IT, EN()), false);
  // and the 'Edizione' marker alone (no 'Italiano' word) still trips it
  assert.equal(classifyListingLanguage({ title: "1999 POKEMON JUNGLE #10 SCYTHER-HOLO 1° EDIZIONE PSA 6" }), "italian");
});

test("6. English catalogue + German listing is rejected", () => {
  const t = "Kangaskhan Holo German Pokemon EX FireRed & LeafGreen #6 2004";
  assert.equal(classifyListingLanguage({ title: t }), "german");
  assert.equal(match(t, { name: "Kangaskhan", set: "EX FireRed & LeafGreen", language: "english", card_number: "6/112" }), false);
  assert.equal(classifyListingLanguage({ title: "Glurak Deutsche Edition Pokemon" }), "german");
});

test("7. English catalogue + French listing is rejected", () => {
  const t = "Feraligatr 4/111 Neo Genesis Holo (French - Aligatueur) Pokemon TCG";
  assert.equal(classifyListingLanguage({ title: t }), "french");
  assert.equal(match(t, { name: "Feraligatr", set: "Neo Genesis", language: "english", card_number: "4/111" }), false);
  assert.equal(classifyListingLanguage({ title: "Dracaufeu Francaise Pokemon carte" }), "french");
});

test("7b. English catalogue + Spanish / Portuguese / Korean / Chinese listings are rejected", () => {
  assert.equal(match("Spanish Pokemon Moltres Zapdos Articuno GX 44/68 Hidden Fates", { name: "Moltres & Zapdos & Articuno GX", set: "Hidden Fates", language: "english" }), false);
  assert.equal(classifyListingLanguage({ title: "Persian ex Unseen Forces Portugues PSA 7" }), "portuguese");
  assert.equal(classifyListingLanguage({ title: "Pikachu Korean Pokemon card" }), "korean");
  assert.equal(classifyListingLanguage({ title: "Lucario Holo Rare Chinese Hidden Fates Shiny Vault" }), "chinese");
});

test("8. English catalogue + Japanese listing REMAINS rejected (unchanged)", () => {
  const t = "Charizard Holo 092/092 Stormfront Japanese Pokemon Card";
  assert.equal(match(t, { name: "Charizard", set: "Stormfront", language: "english", card_number: "92/100" }), false);
});

test("9. a correct English listing is still accepted; a Japanese row + Japanese listing still accepted", () => {
  assert.equal(match("Aerodactyl Holo Fossil 1/62 1999 WOTC Near Mint Pokemon Card", EN()), true);
  assert.equal(match("Charizard Base Set 4/102 Holo Rare 1999 English Pokemon", { name: "Charizard", set: "Base Set", language: "english", card_number: "4/102" }), true);
  assert.equal(match("Charizard Holo 092/092 Stormfront Japanese Pokemon Card", { name: "Charizard", set: "Stormfront", language: "japanese", card_number: "92/100" }), true);
  // no stated language on an English row is fine
  assert.equal(languageCompatible(classifyListingLanguage({ title: "Charizard Base Set 4/102 Holo Rare" }), "english"), true);
});

// ============ 3. GRADE EVIDENCE INTEGRITY ============

test("10. a raw listing with stray PSA metadata cannot become PSA 10", () => {
  // eBay tagged it Graded and getGradingDetails returned a grade, but the
  // TITLE (a raw 3-card lot) has no slab-grade evidence.
  assert.equal(gradedReferenceAllowed(T(HYPNO_LOT), { grader: "PSA", grade: "10" }), false);
  // a plausible single raw card that eBay mis-tagged as Graded, title
  // carries no grader mention:
  assert.equal(
    gradedReferenceAllowed(T("Primal Kyogre EX (Shiny Full Art) 96/98 XY - Ancient Origins Holo"), { grader: "PSA", grade: "8" }),
    false
  );
});

test("11. a legitimate PSA 10 title/listing still receives a PSA 10 reference", () => {
  assert.equal(gradedReferenceAllowed(T("Charizard Base Set Shadowless 4/102 1999 Holo PSA 10 GEM MINT"), { grader: "PSA", grade: "10" }), true);
  assert.equal(gradedReferenceAllowed(T("Umbreon VMAX Alt Art 215/203 Evolving Skies CGC 9.5"), { grader: "CGC", grade: "9.5" }), true);
  assert.equal(gradedReferenceAllowed(T("Blastoise Base Set BGS9 4/102"), { grader: "BGS", grade: "9" }), true);
});

test("12. a legitimate PSA 1 listing still receives a PSA 1 reference", () => {
  assert.equal(gradedReferenceAllowed(T("Aerodactyl Holo Fossil 1/62 2000 PSA 1 Pokemon"), { grader: "PSA", grade: "1" }), true);
});

test("13. grade mismatch (title says one grade, structured says another) fails closed", () => {
  assert.equal(gradedReferenceAllowed(T("Charizard Base Set 4/102 Holo PSA 10"), { grader: "PSA", grade: "3" }), false);
  assert.equal(titleStatedSlabGrade("Charizard Base Set 4/102 Holo PSA 10"), "10");
});

test("13b. an unrecognised grader or invalid grade value fails closed", () => {
  assert.equal(isRecognisedGrader("PSA"), true);
  assert.equal(isRecognisedGrader("GMA"), false); // not in normalizeGrader's output set
  assert.equal(isValidGradeValue("10"), true);
  assert.equal(isValidGradeValue("9.5"), true);
  assert.equal(isValidGradeValue("11"), false);
  assert.equal(isValidGradeValue("Authentic"), false);
  assert.equal(gradedReferenceAllowed(T("Charizard PSA graded"), { grader: "PSA", grade: null }), false);
});

// ============ 4. RAW single-card path unaffected ============

test("14. a raw single-card exact match still passes the matcher (raw reference path intact)", () => {
  assert.equal(match("Charizard 4/102 Base Set Shadowless Holo Rare 1999 Near Mint", { name: "Charizard", set: "Base Set", language: "english", card_number: "4/102" }), true);
});

// ============ 5. REGRESSION FIXTURES for the two named live rows ============

test("15. Hypno regression fixture (deal 31721) is rejected on every axis", () => {
  // multi-card
  assert.equal(qualifiesAsTradingCard(T(HYPNO_LOT)), false);
  // language (Italian)
  assert.equal(match(HYPNO_LOT, { name: "Hypno (8)", set: "Fossil", language: "english", card_number: "8/62" }), false);
  // graded reference not allowed
  assert.equal(gradedReferenceAllowed(T(HYPNO_LOT), { grader: "PSA", grade: "10" }), false);
  // read-time display gate: the stored row is disqualified
  const row = {
    title: HYPNO_LOT, card_name: "Hypno (8)", card_set: "Fossil", card_language: "english",
    is_active: true, is_graded: true, grader: "PSA", grade: "10",
    listing_url: "https://www.ebay.com/itm/377464748193", affiliate_url: "https://www.ebay.com/itm/377464748193",
    last_seen_at: new Date().toISOString(), exact_verified_at: new Date().toISOString(),
    total_price_usd: 352.62, market_price: 1388.97, discount_pct: 0.746,
  };
  assert.equal(disqualificationReason(row), "type:not_a_card");
});

test("16. Aerodactyl regression fixture (deal 31556) is rejected", () => {
  assert.equal(match(AERODACTYL_IT, { name: "Aerodactyl", set: "Fossil", language: "english", card_number: "1/62" }), false);
  const row = {
    title: AERODACTYL_IT, card_name: "Aerodactyl", card_set: "Fossil", card_language: "english",
    is_active: true, is_graded: true, grader: "PSA", grade: "1",
    listing_url: "https://www.ebay.com/itm/1", affiliate_url: "https://www.ebay.com/itm/1",
    last_seen_at: new Date().toISOString(), exact_verified_at: new Date().toISOString(),
    total_price_usd: 100, market_price: 350, discount_pct: 0.71,
  };
  // graded row: display gate rejects via listingStillMatchesCatalogue (language)
  assert.equal(disqualificationReason(row), "identity:card_mismatch");
});
