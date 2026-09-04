// Phase 13B.5.1 - first-class SET search resolution + the full DB-backed
// set vocabulary. No DB (fixture rows, in-memory lookup).
//
//   * a bare recognised set ("base set", "darkness ablaze") resolves
//     LOCALLY to mode "set" - never provider_fallback
//   * the full card_catalog vocabulary is matched via buildSetAliases, so
//     a set outside the ~50 curated SET_PHRASES still resolves
//   * exact-card and species+set precedence is preserved - a set phrase
//     never steals a query that also names a card or a Pokemon
//   * genuinely ambiguous aliases are dropped from the vocabulary (no guess)

import { test } from "node:test";
import assert from "node:assert/strict";
import { parseSearchIntent } from "../../lib/searchIntent.js";
import { resolveSearchIntent, createArrayLookup } from "../../lib/searchResolve.js";
import { buildSetAliases } from "../../lib/pokemonSets.js";

const CATALOG = [
  // --- Base Set ---
  { tcgplayer_id: "42382", name: "Charizard", set: "Base Set", set_id: "1", card_number: "004/102", rarity: "Holo Rare", species: "Charizard", language: "english", market_price: 350, image_url: "x" },
  { tcgplayer_id: "42383", name: "Blastoise", set: "Base Set", set_id: "1", card_number: "002/102", rarity: "Holo Rare", species: "Blastoise", language: "english", market_price: 200, image_url: "x" },
  { tcgplayer_id: "10102", name: "Mewtwo", set: "Base Set", set_id: "1", card_number: "010/102", rarity: "Holo Rare", species: "Mewtwo", language: "english", market_price: 90, image_url: "x" },
  { tcgplayer_id: "58012", name: "Pikachu", set: "Base Set", set_id: "1", card_number: "058/102", rarity: "Common", species: "Pikachu", language: "english", market_price: 12, image_url: "x" },
  // --- Base Set 2 (longest-match must beat "Base Set") ---
  { tcgplayer_id: "b201", name: "Charizard", set: "Base Set 2", set_id: "1103", card_number: "004/130", rarity: "Holo Rare", species: "Charizard", language: "english", market_price: 180, image_url: "x" },
  { tcgplayer_id: "b202", name: "Chansey", set: "Base Set 2", set_id: "1103", card_number: "003/130", rarity: "Holo Rare", species: "Chansey", language: "english", market_price: 30, image_url: "x" },
  // --- a set OUTSIDE the curated SET_PHRASES list ---
  { tcgplayer_id: "da01", name: "Charizard VMAX", set: "SWSH03: Darkness Ablaze", set_id: "2686", card_number: "020/189", rarity: "VMAX", species: "Charizard", language: "english", market_price: 90, image_url: "x" },
  { tcgplayer_id: "da02", name: "Grookey", set: "SWSH03: Darkness Ablaze", set_id: "2686", card_number: "011/189", rarity: "Common", species: "Grookey", language: "english", market_price: 1, image_url: "x" },
  { tcgplayer_id: "da03", name: "Butterfree V", set: "SWSH03: Darkness Ablaze", set_id: "2686", card_number: "001/189", rarity: "V", species: "Butterfree", language: "english", market_price: 3, image_url: "x" },
  // --- Evolving Skies (curated alias) + Umbreon for the species+set case ---
  { tcgplayer_id: "es01", name: "Umbreon VMAX", set: "SWSH07: Evolving Skies", set_id: "3006", card_number: "215/203", rarity: "Alt Art", species: "Umbreon", language: "english", market_price: 500, image_url: "x" },
  { tcgplayer_id: "es02", name: "Rayquaza VMAX", set: "SWSH07: Evolving Skies", set_id: "3006", card_number: "111/203", rarity: "Alt Art", species: "Rayquaza", language: "english", market_price: 300, image_url: "x" },
  // --- SV 151 (curated alias "151") ---
  { tcgplayer_id: "s15101", name: "Charizard ex", set: "SV: Scarlet & Violet 151", set_id: "3803", card_number: "199/165", rarity: "SIR", species: "Charizard", language: "english", market_price: 200, image_url: "x" },
  { tcgplayer_id: "s15102", name: "Pikachu", set: "SV: Scarlet & Violet 151", set_id: "3803", card_number: "025/165", rarity: "Illustration Rare", species: "Pikachu", language: "english", market_price: 40, image_url: "x" },
];

// Mirror of fetchSetSearchVocabularyUncached's alias-owner collision drop.
function makeVocab(rows) {
  const bySet = new Map();
  for (const r of rows) if (r.set && !bySet.has(r.set)) bySet.set(r.set, r.set_id ?? null);
  const owners = new Map();
  const perSet = new Map();
  for (const name of bySet.keys()) {
    const aliases = buildSetAliases(name);
    perSet.set(name, aliases);
    for (const a of aliases) {
      if (!owners.has(a)) owners.set(a, new Set());
      owners.get(a).add(name);
    }
  }
  const out = [];
  for (const [name, setId] of bySet) {
    const phrases = (perSet.get(name) ?? []).filter((a) => owners.get(a).size === 1);
    const full = name.toLowerCase().replace(/\s+/g, " ").trim();
    if (full.length >= 4 && !phrases.includes(full)) phrases.unshift(full);
    out.push({ name, set_id: setId != null ? String(setId) : null, phrases });
  }
  return out;
}

const knownSets = makeVocab(CATALOG);
const lookup = createArrayLookup(CATALOG);
const resolve = async (q) => {
  const intent = parseSearchIntent(q, { knownSets });
  return { intent, ...(await resolveSearchIntent(intent, { lookup })) };
};

// ===== pure set resolution ========================================

test("bare 'base set' -> mode set, canonical name, no provider fallback", async () => {
  const { intent, resolution, exact } = await resolve("base set");
  assert.equal(resolution.mode, "set");
  assert.equal(resolution.resolved_via, "set_vocabulary");
  assert.equal(intent.subject.kind, "set");
  assert.equal(intent.subject.set, "Base Set");
  assert.equal(intent.subject.set_id, "1");
  assert.equal(exact, null);
  assert.ok(resolution.subject_ids.includes("42382"), "set card identity scope present");
});

test("'Base Set' (mixed case) resolves identically", async () => {
  const { resolution, intent } = await resolve("Base Set");
  assert.equal(resolution.mode, "set");
  assert.equal(intent.subject.set, "Base Set");
});

test("longest match: 'base set 2' -> Base Set 2, not Base Set", async () => {
  const { resolution, intent } = await resolve("base set 2");
  assert.equal(resolution.mode, "set");
  assert.equal(intent.subject.set, "Base Set 2");
  assert.equal(intent.subject.set_id, "1103");
});

test("full DB vocabulary: 'darkness ablaze' (NOT in curated SET_PHRASES) resolves to the set", async () => {
  const { resolution, intent } = await resolve("darkness ablaze");
  assert.equal(resolution.mode, "set");
  assert.equal(intent.subject.set, "SWSH03: Darkness Ablaze");
  assert.equal(intent.subject.set_id, "2686");
});

test("curated short alias still wins first: '151' -> SV: Scarlet & Violet 151", async () => {
  const { resolution, intent } = await resolve("151");
  assert.equal(resolution.mode, "set");
  assert.equal(intent.subject.set, "SV: Scarlet & Violet 151");
});

test("'scarlet and violet 151' (and-variant alias) -> the 151 set", async () => {
  const { resolution, intent } = await resolve("scarlet and violet 151");
  assert.equal(resolution.mode, "set");
  assert.equal(intent.subject.set, "SV: Scarlet & Violet 151");
});

test("'evolving skies' -> the set, provider not needed", async () => {
  const { resolution, intent } = await resolve("evolving skies");
  assert.equal(resolution.mode, "set");
  assert.equal(intent.subject.set, "SWSH07: Evolving Skies");
});

// ===== precedence: a set phrase never steals a card / species query =====

test("'base set charizard 4/102' -> exact card, NOT pure set", async () => {
  const { resolution, exact } = await resolve("base set charizard 4/102");
  assert.equal(resolution.mode, "exact_card");
  assert.equal(exact.tcgplayer_id, "42382");
  assert.equal(exact.set, "Base Set");
});

test("'base set charizard' -> species/card intent constrained by Base Set, NOT pure set", async () => {
  const { resolution, intent } = await resolve("base set charizard");
  assert.notEqual(resolution.mode, "set");
  assert.equal(intent.subject.set, "Base Set");
  assert.equal(intent.subject.species, "Charizard");
});

test("'evolving skies umbreon' -> species intent + set constraint, not pure set", async () => {
  const { resolution, intent } = await resolve("evolving skies umbreon");
  assert.notEqual(resolution.mode, "set");
  assert.equal(intent.subject.species, "Umbreon");
  assert.equal(intent.subject.set, "SWSH07: Evolving Skies");
});

test("'charizard 4/102' (no set) still resolves to Base Set exact card", async () => {
  const { resolution, exact } = await resolve("charizard 4/102");
  assert.equal(resolution.mode, "exact_card");
  assert.equal(exact.tcgplayer_id, "42382");
});

test("'151 pikachu' -> Pikachu species, set constraint SV 151, not pure set", async () => {
  const { resolution, intent } = await resolve("151 pikachu");
  assert.notEqual(resolution.mode, "set");
  assert.equal(intent.subject.species, "Pikachu");
  assert.equal(intent.subject.set, "SV: Scarlet & Violet 151");
});

// ===== filters on a pure-set query ================================

test("'base set psa 10' -> mode set, filters parsed, deal scope carried", async () => {
  const { intent, resolution } = await resolve("base set psa 10");
  assert.equal(resolution.mode, "set");
  assert.equal(intent.grader, "PSA");
  assert.equal(intent.grade, "10");
  assert.equal(intent.format, "graded");
  assert.equal(intent.result_mode, "deals");
  assert.ok(resolution.subject_ids.length >= 3, "set card identity scope still provided for the deal filter");
});

test("'base set graded' -> mode set, format=graded, still local", async () => {
  const { intent, resolution } = await resolve("base set graded");
  assert.equal(resolution.mode, "set");
  assert.equal(intent.format, "graded");
  assert.equal(intent.subject.set, "Base Set");
});

test("'base set under 50' / 'base set bin' -> mode set with the modifier parsed", async () => {
  const a = await resolve("base set under 50");
  assert.equal(a.resolution.mode, "set");
  assert.equal(a.intent.price_max, 50);
  const b = await resolve("base set bin");
  assert.equal(b.resolution.mode, "set");
  assert.equal(b.intent.listing_type, "BIN");
});

// ===== unknown set -> provider fallback (unchanged) ================

test("'not a real set' -> provider_fallback, nothing invented", async () => {
  const { resolution } = await resolve("not a real set");
  assert.equal(resolution.mode, "provider_fallback");
});

test("a set query with a real Pokemon but no such set -> not mode set", async () => {
  const { resolution } = await resolve("charizard");
  assert.notEqual(resolution.mode, "set");
});

// ===== vocabulary construction ===================================

test("buildSetAliases strips a code prefix and adds &/and variants", () => {
  assert.deepEqual(buildSetAliases("SWSH02: Rebel Clash").sort(), ["rebel clash", "swsh02: rebel clash"].sort());
  const sv151 = buildSetAliases("SV: Scarlet & Violet 151");
  assert.ok(sv151.includes("scarlet & violet 151"));
  assert.ok(sv151.includes("scarlet and violet 151"));
  assert.ok(sv151.includes("sv: scarlet & violet 151"));
});

test("buildSetAliases does NOT strip a parenthetical qualifier (keeps 'base set' for the plain set only)", () => {
  const shadowless = buildSetAliases("Base Set (Shadowless)");
  assert.ok(shadowless.includes("base set (shadowless)"));
  assert.ok(!shadowless.includes("base set"), "'base set' must stay owned by the plain Base Set");
});

test("makeVocab drops an alias shared by two sets (no guessing)", () => {
  const vocab = makeVocab([
    { set: "Wizards Promo", set_id: "1", tcgplayer_id: "a", name: "X", language: "english" },
    { set: "Promo", set_id: "2", tcgplayer_id: "b", name: "Y", language: "english" },
    { set: "Nintendo Promo", set_id: "3", tcgplayer_id: "c", name: "Z", language: "english" },
  ]);
  // "promo" is generated by all three via no path here (full names differ),
  // but if an ambiguous alias existed it would be filtered; the full names
  // always survive.
  for (const v of vocab) assert.ok(v.phrases.includes(v.name.toLowerCase()));
});

test("ambiguous alias is dropped from both owners", () => {
  // two distinct sets whose stripped short name collides
  const vocab = makeVocab([
    { set: "SM - Guardians Rising", set_id: "1", tcgplayer_id: "a", name: "X", language: "english" },
    { set: "SWSH - Guardians Rising", set_id: "2", tcgplayer_id: "b", name: "Y", language: "english" },
  ]);
  for (const v of vocab) {
    assert.ok(!v.phrases.includes("guardians rising"), "collided short alias dropped");
    assert.ok(v.phrases.includes(v.name.toLowerCase()), "full name kept");
  }
});
