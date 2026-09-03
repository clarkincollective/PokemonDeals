// Phase 13B.2 / 13B.2.1 - local identity resolution tests (no DB, fixture rows).
//   * `charizard 4/102` must resolve to the 1999 Base Set print, deterministically.
//   * an explicit subject + a collector number that belongs to a DIFFERENT
//     card must NOT resolve that other card as an exact match
//     (subject_collector_mismatch).

import { test } from "node:test";
import assert from "node:assert/strict";
import { parseSearchIntent } from "../../lib/searchIntent.js";
import { resolveSearchIntent, createArrayLookup } from "../../lib/searchResolve.js";

const CATALOG = [
  // Charizard #4/102 landscape (real)
  { tcgplayer_id: "42382",  name: "Charizard", set: "Base Set", set_id: "1", card_number: "004/102", rarity: "Holo Rare", species: "Charizard", language: "english", market_price: 350, image_url: "x" },
  { tcgplayer_id: "106999", name: "Charizard", set: "Base Set (Shadowless)", set_id: "1663", card_number: "004/102", rarity: "Holo Rare", species: "Charizard", language: "english", market_price: 900, image_url: "x" },
  { tcgplayer_id: "250320", name: "Charizard", set: "Celebrations: Classic Collection", set_id: "cc", card_number: "4/102", rarity: "Classic Collection", species: "Charizard", language: "english", market_price: 167, image_url: "x" },
  { tcgplayer_id: "179079", name: "Charizard - 4/102 (CoroCoro Promo)", set: "Jumbo Cards", set_id: "1528", card_number: "004/102", rarity: "Promo", species: "Charizard", language: "english", market_price: 40, image_url: "x" },
  { tcgplayer_id: "252517", name: "Charizard (Celebrations Metal Card)", set: "Miscellaneous Cards & Products", set_id: "misc", card_number: "004/102", rarity: "Promo", species: "Charizard", language: "english", market_price: 230, image_url: "x" },
  { tcgplayer_id: "657516", name: "Charizard (Black Dot Error)", set: "Base Set", set_id: "1", card_number: "004/102", rarity: "Holo Rare", species: "Charizard", language: "english", market_price: 500, image_url: "x" },
  { tcgplayer_id: "84924",  name: "Drapion", set: "Triumphant", set_id: "1381", card_number: "4/102", rarity: "Rare", species: "Drapion", language: "english", market_price: 3, image_url: "x" },
  // #10/102 belongs to Mewtwo in Base Set - NOT Pikachu (13B.2.1)
  { tcgplayer_id: "10102",  name: "Mewtwo", set: "Base Set", set_id: "1", card_number: "010/102", rarity: "Holo Rare", species: "Mewtwo", language: "english", market_price: 90, image_url: "x" },
  // Pikachu landscape (no #10/102, no #4/102)
  { tcgplayer_id: "58012",  name: "Pikachu", set: "Base Set", set_id: "1", card_number: "58/102", rarity: "Common", species: "Pikachu", language: "english", market_price: 12, image_url: "x" },
  { tcgplayer_id: "58013",  name: "Pikachu", set: "Jungle", set_id: "j", card_number: "60/64", rarity: "Common", species: "Pikachu", language: "english", market_price: 8, image_url: "x" },
  { tcgplayer_id: "58014",  name: "Pikachu VMAX", set: "SWSH04: Vivid Voltage", set_id: "vv", card_number: "044/185", rarity: "VMAX", species: "Pikachu", language: "english", market_price: 25, image_url: "x" },
  // synthetic: one collector number, two sets, two species - only one matches a given subject
  { tcgplayer_id: "S1", name: "Eevee", set: "Alpha", set_id: "A", card_number: "99/99", rarity: "Rare", species: "Eevee", language: "english", market_price: 5, image_url: "x" },
  { tcgplayer_id: "S2", name: "Snorlax", set: "Beta", set_id: "B", card_number: "99/99", rarity: "Rare", species: "Snorlax", language: "english", market_price: 5, image_url: "x" },
  // synthetic: subject present, same number in two sets, BOTH the subject -> dup tiebreak must still run
  { tcgplayer_id: "D1", name: "Lugia", set: "Base Set", set_id: "1", card_number: "77/77", rarity: "Holo", species: "Lugia", language: "english", market_price: 100, image_url: "x" },
  { tcgplayer_id: "D2", name: "Lugia", set: "Celebrations: Classic Collection", set_id: "cc", card_number: "77/77", rarity: "Holo", species: "Lugia", language: "english", market_price: 50, image_url: "x" },
];
const lookup = createArrayLookup(CATALOG);
const resolve = async (q) => {
  const intent = parseSearchIntent(q);
  return { intent, ...(await resolveSearchIntent(intent, { lookup })) };
};

// ===== 13B.2 (unchanged - compatible subject + number) =============

test("charizard 4/102 -> exact Base Set Charizard (42382), not a reprint", async () => {
  const { resolution, exact } = await resolve("charizard 4/102");
  assert.equal(resolution.mode, "exact_card");
  assert.equal(exact.tcgplayer_id, "42382");
  assert.equal(exact.set, "Base Set");
  assert.equal(exact.card_slug, "charizard-base-set");
});

test("base set charizard 4/102 -> Base Set via set+number, high confidence", async () => {
  const { resolution, exact } = await resolve("base set charizard 4/102");
  assert.equal(resolution.resolved_via, "set+number");
  assert.equal(resolution.confidence, "high");
  assert.equal(exact.tcgplayer_id, "42382");
});

test("charizard 4/102 psa 10 -> Base Set exact; modifiers preserved", async () => {
  const { intent, exact } = await resolve("charizard 4/102 psa 10");
  assert.equal(exact.tcgplayer_id, "42382");
  assert.equal(intent.grader, "PSA");
  assert.equal(intent.grade, "10");
  assert.equal(intent.result_mode, "deals");
});

test("mewtwo 10/102 -> exact Base Set Mewtwo (subject-compatible)", async () => {
  const { resolution, exact } = await resolve("mewtwo 10/102");
  assert.equal(resolution.mode, "exact_card");
  assert.equal(exact.name, "Mewtwo");
  assert.equal(exact.set, "Base Set");
});

test("drapion 4/102 -> the Drapion, not a Charizard", async () => {
  const { exact } = await resolve("drapion 4/102");
  assert.equal(exact.name, "Drapion");
});

test("4/102 (no subject) -> Charizard dominates, resolves to Base Set", async () => {
  const { exact } = await resolve("4/102");
  assert.equal(exact.name, "Charizard");
  assert.equal(exact.set, "Base Set");
});

// ===== 13B.2.1 - subject x collector-number mismatch ==============

test("pikachu 10/102 -> NOT exact Mewtwo; subject_collector_mismatch; falls to Pikachu", async () => {
  const { intent, resolution, exact } = await resolve("pikachu 10/102");
  assert.equal(resolution.mode, "subject_collector_mismatch");
  assert.equal(resolution.rendered_mode, "species", "still shows Pikachu results");
  assert.equal(exact, null, "no exact card for the named subject");
  assert.ok(resolution.subject_collector_mismatch, "mismatch metadata present");
  assert.equal(resolution.subject_collector_mismatch.subject, "Pikachu");
  assert.equal(resolution.subject_collector_mismatch.collector_number, "10/102");
  assert.equal(resolution.subject_collector_mismatch.belongs_to.name, "Mewtwo");
  assert.equal(resolution.subject_collector_mismatch.belongs_to.set, "Base Set");
  assert.equal(resolution.subject_collector_mismatch.belongs_to.card_slug, "mewtwo-base-set");
  assert.equal(intent.subject.species, "Pikachu", "user subject preserved");
  assert.equal(intent.subject.collector_number, "10/102", "user number preserved");
  assert.ok(intent.ambiguities.some((a) => a.startsWith("subject_collector_mismatch")));
});

test("pikachu 4/102 -> mismatch; number belongs to Charizard/Base Set", async () => {
  const { resolution, exact } = await resolve("pikachu 4/102");
  assert.equal(resolution.mode, "subject_collector_mismatch");
  assert.equal(exact, null);
  assert.equal(resolution.subject_collector_mismatch.belongs_to.name, "Charizard");
  assert.equal(resolution.subject_collector_mismatch.belongs_to.set, "Base Set");
});

test("mismatch still returns broad subject results (species candidates present)", async () => {
  const { resolution } = await resolve("pikachu 10/102");
  assert.ok((resolution.species_print_count ?? 0) >= 3);
});

// ===== duplicate-number tiebreak still works after subject compat ==

test("synthetic: 'eevee 99/99' resolves Eevee (Alpha), not Snorlax which shares the number", async () => {
  const { exact } = await resolve("eevee 99/99");
  assert.equal(exact.name, "Eevee");
  assert.equal(exact.set, "Alpha");
});

test("synthetic: 'snorlax 99/99' resolves Snorlax (Beta)", async () => {
  const { exact } = await resolve("snorlax 99/99");
  assert.equal(exact.name, "Snorlax");
  assert.equal(exact.set, "Beta");
});

test("synthetic: 'lugia 77/77' - number in two sets, both Lugia -> older set wins (dup tiebreak intact)", async () => {
  const { resolution, exact } = await resolve("lugia 77/77");
  assert.equal(resolution.mode, "exact_card");
  assert.equal(exact.name, "Lugia");
  assert.equal(exact.set, "Base Set"); // Base Set ranks before Celebrations in SET_RELEASE_ORDER
});
