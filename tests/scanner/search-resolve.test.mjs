// Phase 13B.2 - local identity resolution tests (no DB, fixture rows).
// The hard regression: `charizard 4/102` must resolve to the 1999 Base
// Set print deterministically, without hard-coding Charizard.

import { test } from "node:test";
import assert from "node:assert/strict";
import { parseSearchIntent } from "../../lib/searchIntent.js";
import { resolveSearchIntent, createArrayLookup } from "../../lib/searchResolve.js";

// card_catalog-shaped fixture: the real Charizard #4/102 landscape + a few others.
const CATALOG = [
  { tcgplayer_id: "42382",  name: "Charizard", set: "Base Set", set_id: "1", card_number: "004/102", rarity: "Holo Rare", species: "Charizard", language: "english", market_price: 350, image_url: "x" },
  { tcgplayer_id: "106999", name: "Charizard", set: "Base Set (Shadowless)", set_id: "1663", card_number: "004/102", rarity: "Holo Rare", species: "Charizard", language: "english", market_price: 900, image_url: "x" },
  { tcgplayer_id: "250320", name: "Charizard", set: "Celebrations: Classic Collection", set_id: "cc", card_number: "4/102", rarity: "Classic Collection", species: "Charizard", language: "english", market_price: 167, image_url: "x" },
  { tcgplayer_id: "179079", name: "Charizard - 4/102 (CoroCoro Promo)", set: "Jumbo Cards", set_id: "1528", card_number: "004/102", rarity: "Promo", species: "Charizard", language: "english", market_price: 40, image_url: "x" },
  { tcgplayer_id: "252517", name: "Charizard (Celebrations Metal Card)", set: "Miscellaneous Cards & Products", set_id: "misc", card_number: "004/102", rarity: "Promo", species: "Charizard", language: "english", market_price: 230, image_url: "x" },
  { tcgplayer_id: "657516", name: "Charizard (Black Dot Error)", set: "Base Set", set_id: "1", card_number: "004/102", rarity: "Holo Rare", species: "Charizard", language: "english", market_price: 500, image_url: "x" },
  { tcgplayer_id: "84924",  name: "Drapion", set: "Triumphant", set_id: "1381", card_number: "4/102", rarity: "Rare", species: "Drapion", language: "english", market_price: 3, image_url: "x" },
  // Pikachu landscape for species tests
  { tcgplayer_id: "58012",  name: "Pikachu", set: "Base Set", set_id: "1", card_number: "58/102", rarity: "Common", species: "Pikachu", language: "english", market_price: 12, image_url: "x" },
  { tcgplayer_id: "58013",  name: "Pikachu", set: "Jungle", set_id: "j", card_number: "60/64", rarity: "Common", species: "Pikachu", language: "english", market_price: 8, image_url: "x" },
  { tcgplayer_id: "58014",  name: "Pikachu VMAX", set: "SWSH04: Vivid Voltage", set_id: "vv", card_number: "044/185", rarity: "VMAX", species: "Pikachu", language: "english", market_price: 25, image_url: "x" },
];
const lookup = createArrayLookup(CATALOG);

async function resolve(q) {
  const intent = parseSearchIntent(q);
  const res = await resolveSearchIntent(intent, { lookup });
  return { intent, ...res };
}

test("charizard 4/102 -> exact_card, Base Set Charizard (42382), NOT a reprint", async () => {
  const { intent, resolution, exact } = await resolve("charizard 4/102");
  assert.equal(resolution.mode, "exact_card");
  assert.equal(exact.tcgplayer_id, "42382");
  assert.equal(exact.set, "Base Set");
  assert.equal(exact.card_slug, "charizard-base-set");
  assert.equal(intent.subject.tcgplayer_id, "42382");
  assert.equal(intent.is_exact, true);
});

test("base set charizard 4/102 -> Base Set via set+number, high confidence", async () => {
  const { resolution, exact } = await resolve("base set charizard 4/102");
  assert.equal(resolution.resolved_via, "set+number");
  assert.equal(resolution.confidence, "high");
  assert.equal(exact.tcgplayer_id, "42382");
});

test("charizard 4/102 psa 10 -> still resolves to Base Set exact; modifiers preserved", async () => {
  const { intent, exact } = await resolve("charizard 4/102 psa 10");
  assert.equal(exact.tcgplayer_id, "42382");
  assert.equal(intent.grader, "PSA");
  assert.equal(intent.grade, "10");
  assert.equal(intent.result_mode, "deals"); // acquisition modifier present
  assert.equal(intent.is_exact, true);
});

test("4/102 alone -> Charizard dominates (6 of 7 rows), resolves to Base Set", async () => {
  const { exact } = await resolve("4/102");
  // no name/species in query; byNumber returns all 7; Drapion is 1, Charizards 6
  // cleanFirst sorts; Base Set plain Charizard should top after tiebreak
  assert.equal(exact.set, "Base Set");
  assert.equal(exact.name, "Charizard");
});

test("pikachu -> species mode, not exact, candidates returned", async () => {
  const { resolution, exact, candidates } = await resolve("pikachu");
  assert.equal(resolution.mode, "species");
  assert.equal(resolution.is_exact, false);
  assert.equal(exact, null);
  assert.ok(candidates.length >= 3);
});

test("graded pikachu -> species mode (deals downstream), modifiers on intent", async () => {
  const { intent, resolution } = await resolve("graded pikachu");
  assert.equal(intent.format, "graded");
  assert.equal(resolution.mode, "species");
  assert.equal(intent.result_mode, "deals");
});

test("charzard 4/999 (typo, unknown number) -> provider_fallback", async () => {
  const { resolution } = await resolve("charzard 4/999");
  assert.equal(resolution.mode, "provider_fallback");
});

test("drapion 4/102 -> the Drapion, not a Charizard (name disambiguates the shared number)", async () => {
  const { exact } = await resolve("drapion 4/102");
  assert.equal(exact.name, "Drapion");
  assert.equal(exact.set, "Triumphant");
});

test("Base Set (Shadowless) is not preferred over plain Base Set for a bare number query", async () => {
  const { exact } = await resolve("charizard 4/102");
  assert.notEqual(exact.set, "Base Set (Shadowless)");
});

test("specialty/error prints are filtered out of the exact pick", async () => {
  const { exact } = await resolve("charizard 4/102");
  assert.ok(!/error|metal card|corocoro/i.test(exact.name));
});
