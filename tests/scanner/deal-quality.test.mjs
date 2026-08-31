// The shared deal-quality gate (lib/dealQuality): condition + language
// compatibility with the market reference. "Cheap != good deal."

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  classifyListingCondition,
  conditionAllowsPromotion,
  classifyListingLanguage,
  languageCompatible,
  isDisplayableDeal,
  disqualificationReason,
} from "../../lib/dealQuality.js";

const deal = (over = {}) => ({
  id: 1,
  is_active: true,
  is_graded: false,
  title: "Charizard Base Set 4/102 Holo Rare",
  condition: "Near Mint",
  card_language: "english",
  discount_pct: 0.2,
  ...over,
});

// ---------- VALID ----------
test("Near Mint English correct card can qualify", () => {
  assert.equal(isDisplayableDeal(deal()), true);
});

test("a genuine clean deeply-discounted listing still qualifies", () => {
  assert.equal(isDisplayableDeal(deal({ discount_pct: 0.72, title: "Charizard Base Set 4/102 Holo Rare NM" })), true);
});

test("correct language + condition is unaffected", () => {
  assert.equal(isDisplayableDeal(deal({ title: "Pikachu VMAX 044/185 English Near Mint" })), true);
});

test("graded deal passes the raw-condition gate (grade is its condition)", () => {
  assert.equal(isDisplayableDeal(deal({ is_graded: true, title: "Charizard Base Set PSA 3 (Poor)" })), true);
});

// ---------- CONDITION FAILURES ----------
for (const [label, title] of [
  ["Damaged", "Charizard Base Set 4/102 DAMAGED"],
  ["DMG", "Charizard Base Set 4/102 Holo DMG"],
  ["Heavily Played", "Charizard Base Set 4/102 Heavily Played"],
  ["creased", "Charizard Base Set 4/102 Holo - creased"],
  ["water damaged", "Charizard Base Set 4/102 water damaged"],
  ["torn", "Charizard Base Set 4/102 corner torn"],
  ["altered", "Dark Gengar 6/105 Neo Destiny ** Altered Pin Holes"],
  ["inked", "INKED Kyogre 12/95 Call of Legends Holo Rare"],
  ["(Poor)", "Ninetales H19/H32 Aquapolis Holo ENG (Poor)"],
  ["trailing POOR", "Pokemon Dark Gengar 12/105 holo ENG Neo Destiny POOR"],
]) {
  test(`condition: ${label} -> rejected`, () => {
    assert.equal(isDisplayableDeal(deal({ title })), false);
    assert.match(disqualificationReason(deal({ title })), /^condition:/);
  });
}

test("card's own '200HP' hit points is NOT read as Heavily Played", () => {
  const t = "Espeon GX Full Art Secret Rare Holo 152/149 SM Base Set 200HP";
  assert.notEqual(classifyListingCondition({ title: t }), "Heavily Played");
  assert.equal(isDisplayableDeal(deal({ title: t })), true); // title alone is clean
});

test("structured 'Card Condition' descriptor is authoritative over a clean title", () => {
  assert.equal(
    classifyListingCondition({ title: "Espeon GX 152/149 SM Base Set 200HP", descriptorContent: "Heavily played (Poor)" }),
    "Heavily Played"
  );
});

test("Lightly Played allowed by default, dropped when an exact reference is required", () => {
  assert.equal(conditionAllowsPromotion("Lightly Played"), true);
  assert.equal(conditionAllowsPromotion("Lightly Played", { requireExactRef: true }), false);
  assert.equal(conditionAllowsPromotion("Moderately Played"), false);
});

// ---------- LANGUAGE ----------
test("Japanese listing vs English card -> rejected", () => {
  assert.equal(isDisplayableDeal(deal({ title: "Charizard Base Set Japanese Holo" })), false);
  assert.match(disqualificationReason(deal({ title: "Charizard Base Set Japanese Holo" })), /^language:/);
});

test("Korean / German / Italian / French listing vs English card -> rejected", () => {
  for (const t of [
    "2011 Pokemon Korean Blastoise Evolution Set",
    "Charizard German Pokémon Diamond & Pearl #3",
    "Snorlax 100/144 Skyridge Non-Holo Rare ITALIAN WOTC",
    "Feraligatr 4/111 Neo Genesis Holo (French - Aligatueur)",
  ]) {
    assert.equal(isDisplayableDeal(deal({ title: t })), false, t);
  }
});

test("English listing vs English card -> allowed", () => {
  assert.equal(isDisplayableDeal(deal({ title: "Charizard Base Set English Holo Rare" })), true);
});

test("unknown language with no evidence -> NOT invented as foreign", () => {
  assert.equal(classifyListingLanguage({ title: "Charizard Base Set 4/102 Holo Rare" }), "unknown");
  assert.equal(languageCompatible("unknown", "english"), true);
  assert.equal(isDisplayableDeal(deal({ title: "Charizard Base Set 4/102 Holo Rare" })), true);
});

test("Japanese listing IS allowed for a Japanese catalogue row (match, not english-only)", () => {
  assert.equal(languageCompatible("japanese", "japanese"), true);
  assert.equal(isDisplayableDeal(deal({ title: "Pikachu Japanese Promo", card_language: "japanese" })), true);
});

// ---------- DISPLAY PROTECTION (legacy rows) ----------
test("historically-accepted damaged row is excluded from display even while is_active", () => {
  assert.equal(
    isDisplayableDeal({ is_active: true, is_graded: false, condition: "Ungraded", card_language: "english",
      title: "2002 Neo Destiny Dark Gengar 6/105 Holo Foil Rare Pokemon ** Altered Pin Holes" }),
    false
  );
});

test("historically-accepted wrong-language row is excluded from display", () => {
  assert.equal(
    isDisplayableDeal({ is_active: true, is_graded: false, condition: "Near Mint", card_language: "english",
      title: "Pokémon Card Neo Destiny No. 2/105 Dark Crobat Holo German" }),
    false
  );
});

test("an explicit disqualified_reason (if the column exists) hides the row", () => {
  assert.equal(isDisplayableDeal(deal({ disqualified_reason: "condition:damaged" })), false);
});

test("inactive rows are never displayable", () => {
  assert.equal(isDisplayableDeal(deal({ is_active: false })), false);
});

test("clean genuine rows are untouched", () => {
  assert.equal(disqualificationReason(deal({ title: "Umbreon VMAX 215/203 Evolving Skies Alt Art English NM" })), null);
});
