// Phase 13B.5.2 - species × set is a real deterministic INTERSECTION.
//
//   "base set charizard"      = Charizard cards FROM Base Set
//   "evolving skies umbreon"  = Umbreon cards FROM Evolving Skies
//   "151 pikachu"             = Pikachu cards FROM the canonical 151 set
//
// The set constraint must shape the actual card-identity universe
// (resolution.subject_ids) and therefore the live-deal universe - not be
// silently retained as unused metadata. No DB (fixture rows).

import { test } from "node:test";
import assert from "node:assert/strict";
import { parseSearchIntent } from "../../lib/searchIntent.js";
import { resolveSearchIntent, createArrayLookup } from "../../lib/searchResolve.js";
import { buildSetAliases } from "../../lib/pokemonSets.js";

const CATALOG = [
  // --- Base Set: Charizard x2 (regular + error), Pikachu x1, Mewtwo x1 ---
  { tcgplayer_id: "42382", name: "Charizard", set: "Base Set", set_id: "604", card_number: "004/102", rarity: "Holo Rare", species: "Charizard", language: "english", market_price: 350, image_url: "x" },
  { tcgplayer_id: "657516", name: "Charizard (Black Dot Error)", set: "Base Set", set_id: "604", card_number: "004/102", rarity: "Holo Rare", species: "Charizard", language: "english", market_price: 500, image_url: "x" },
  { tcgplayer_id: "42402", name: "Pikachu", set: "Base Set", set_id: "604", card_number: "058/102", rarity: "Common", species: "Pikachu", language: "english", market_price: 12, image_url: "x" },
  { tcgplayer_id: "42347", name: "Mewtwo", set: "Base Set", set_id: "604", card_number: "010/102", rarity: "Holo Rare", species: "Mewtwo", language: "english", market_price: 90, image_url: "x" },
  // --- Jungle: NO Charizard (for the no-match case), has Pikachu ---
  { tcgplayer_id: "j001", name: "Pikachu", set: "Jungle", set_id: "635", card_number: "060/064", rarity: "Common", species: "Pikachu", language: "english", market_price: 6, image_url: "x" },
  { tcgplayer_id: "j002", name: "Wigglytuff", set: "Jungle", set_id: "635", card_number: "016/064", rarity: "Holo Rare", species: "Wigglytuff", language: "english", market_price: 20, image_url: "x" },
  // --- SWSH07 Evolving Skies: Umbreon x3, Pikachu x1, Rayquaza x1 ---
  { tcgplayer_id: "es-umb-vmax-alt", name: "Umbreon VMAX (Alternate Art Secret)", set: "SWSH07: Evolving Skies", set_id: "2848", card_number: "215/203", rarity: "Secret Rare", species: "Umbreon", language: "english", market_price: 500, image_url: "x" },
  { tcgplayer_id: "es-umb-vmax", name: "Umbreon VMAX", set: "SWSH07: Evolving Skies", set_id: "2848", card_number: "095/203", rarity: "VMAX", species: "Umbreon", language: "english", market_price: 60, image_url: "x" },
  { tcgplayer_id: "es-umb-v", name: "Umbreon V", set: "SWSH07: Evolving Skies", set_id: "2848", card_number: "094/203", rarity: "V", species: "Umbreon", language: "english", market_price: 25, image_url: "x" },
  { tcgplayer_id: "es-pik", name: "Pikachu", set: "SWSH07: Evolving Skies", set_id: "2848", card_number: "058/203", rarity: "Common", species: "Pikachu", language: "english", market_price: 4, image_url: "x" },
  { tcgplayer_id: "es-ray", name: "Rayquaza VMAX (Alternate Art Secret)", set: "SWSH07: Evolving Skies", set_id: "2848", card_number: "218/203", rarity: "Secret Rare", species: "Rayquaza", language: "english", market_price: 300, image_url: "x" },
  // --- SV: Scarlet & Violet 151: Pikachu x1, Charizard x1 ---
  { tcgplayer_id: "sv151-pik", name: "Pikachu", set: "SV: Scarlet & Violet 151", set_id: "23237", card_number: "025/165", rarity: "Illustration Rare", species: "Pikachu", language: "english", market_price: 40, image_url: "x" },
  { tcgplayer_id: "sv151-char", name: "Charizard ex", set: "SV: Scarlet & Violet 151", set_id: "23237", card_number: "199/165", rarity: "SIR", species: "Charizard", language: "english", market_price: 200, image_url: "x" },
  // --- SV03 Obsidian Flames: Charizard x2, NO Blastoise ---
  { tcgplayer_id: "of-char-ex", name: "Charizard ex", set: "SV03: Obsidian Flames", set_id: "23228", card_number: "125/197", rarity: "Double Rare", species: "Charizard", language: "english", market_price: 30, image_url: "x" },
  { tcgplayer_id: "of-char-sir", name: "Charizard ex (Special Illustration Rare)", set: "SV03: Obsidian Flames", set_id: "23228", card_number: "223/197", rarity: "SIR", species: "Charizard", language: "english", market_price: 250, image_url: "x" },
  { tcgplayer_id: "of-eiscue", name: "Eiscue", set: "SV03: Obsidian Flames", set_id: "23228", card_number: "052/197", rarity: "Common", species: "Eiscue", language: "english", market_price: 1, image_url: "x" },
  // --- Team Rocket: no Umbreon (Umbreon didn't exist in the WOTC era) ---
  { tcgplayer_id: "tr-dark-char", name: "Dark Charizard", set: "Team Rocket", set_id: "1373", card_number: "004/082", rarity: "Holo Rare", species: "Charizard", language: "english", market_price: 300, image_url: "x" },
];

function makeVocab(rows) {
  const bySet = new Map();
  for (const r of rows) if (r.set && !bySet.has(r.set)) bySet.set(r.set, r.set_id ?? null);
  const owners = new Map(), perSet = new Map();
  for (const name of bySet.keys()) {
    const a = buildSetAliases(name); perSet.set(name, a);
    for (const x of a) { if (!owners.has(x)) owners.set(x, new Set()); owners.get(x).add(name); }
  }
  const out = [];
  for (const [name, setId] of bySet) {
    const phrases = (perSet.get(name) ?? []).filter((x) => owners.get(x).size === 1);
    const full = name.toLowerCase().replace(/\s+/g, " ").trim();
    if (full.length >= 4 && !phrases.includes(full)) phrases.unshift(full);
    out.push({ name, set_id: setId != null ? String(setId) : null, phrases });
  }
  return out;
}

const knownSets = makeVocab(CATALOG);
const lookup = createArrayLookup(CATALOG);
const byId = new Map(CATALOG.map((r) => [String(r.tcgplayer_id), r]));
const resolve = async (q) => {
  const intent = parseSearchIntent(q, { knownSets });
  return { intent, ...(await resolveSearchIntent(intent, { lookup })) };
};
const idsOf = (resolution, exact) => resolution.subject_ids ?? (exact ? [exact.tcgplayer_id] : []);

// ===== 1-3: the intersection is real ==============================

test("1. 'base set charizard' -> only Base Set Charizard identities (no species-wide leak)", async () => {
  const { resolution, exact } = await resolve("base set charizard");
  // exact_card (one clean "Charizard" print in Base Set) or species_set
  // (several) - both are a true intersection; never a species-wide result.
  assert.ok(["exact_card", "species_set"].includes(resolution.mode), `mode ${resolution.mode}`);
  const ids = idsOf(resolution, exact).map(String);
  assert.ok(ids.length >= 1);
  for (const id of ids) {
    const r = byId.get(id);
    assert.equal(r.species, "Charizard", `${id} ${r.name} is not Charizard`);
    assert.equal(r.set, "Base Set", `${id} ${r.name} is not from Base Set`);
  }
  // the species-wide Charizards (Obsidian Flames, 151, Team Rocket) must NOT leak
  assert.ok(!ids.includes("of-char-ex") && !ids.includes("sv151-char") && !ids.includes("tr-dark-char"));
});

test("2. no out-of-set species card leaks in ('evolving skies umbreon')", async () => {
  const { resolution, exact } = await resolve("evolving skies umbreon");
  const ids = idsOf(resolution, exact).map(String);
  assert.deepEqual(
    ids.slice().sort(),
    ["es-umb-v", "es-umb-vmax", "es-umb-vmax-alt"].sort(),
    "exactly the three Evolving Skies Umbreon prints, nothing else"
  );
});

test("3. no wrong-species set card leaks in ('evolving skies umbreon' excludes Pikachu/Rayquaza)", async () => {
  const { resolution, exact } = await resolve("evolving skies umbreon");
  const ids = idsOf(resolution, exact).map(String);
  assert.ok(!ids.includes("es-pik") && !ids.includes("es-ray"));
});

test("4. '151 pikachu' -> only the 151 Pikachu identity", async () => {
  const { resolution, exact } = await resolve("151 pikachu");
  const ids = idsOf(resolution, exact).map(String);
  for (const id of ids) {
    assert.equal(byId.get(id).set, "SV: Scarlet & Violet 151");
    assert.equal(byId.get(id).species, "Pikachu");
  }
  assert.ok(!ids.includes("es-pik") && !ids.includes("j001") && !ids.includes("42402"));
});

// ===== 5: single canonical card in a set -> genuine exact ==========

test("5. one canonical card of the subject in the set -> exact_card, from that set", async () => {
  const { resolution, exact } = await resolve("base set mewtwo");
  assert.equal(resolution.mode, "exact_card");
  assert.ok(["name+set", "species+set"].includes(resolution.resolved_via), resolution.resolved_via);
  assert.equal(exact.tcgplayer_id, "42347");
  assert.equal(exact.set, "Base Set");
});

test("5b. multi-print species in a set (no clean single name) -> species_set list, all intersected", async () => {
  const { resolution } = await resolve("evolving skies umbreon");
  assert.equal(resolution.mode, "species_set");
  assert.equal(resolution.resolved_via, "species+set");
  assert.equal(resolution.subject_ids.length, 3);
});

// ===== 6: facets refine the ALREADY-intersected universe ==========

test("6. 'base set charizard psa 10' -> intersected ids + graded modifiers parsed", async () => {
  const { intent, resolution, exact } = await resolve("base set charizard psa 10");
  const ids = idsOf(resolution, exact).map(String);
  for (const id of ids) {
    assert.equal(byId.get(id).species, "Charizard");
    assert.equal(byId.get(id).set, "Base Set");
  }
  assert.equal(intent.grader, "PSA");
  assert.equal(intent.grade, "10");
  assert.equal(intent.format, "graded");
  assert.equal(intent.result_mode, "deals");
});

test("6b. price / listing modifiers keep the intersection ('base set charizard under $500', '... auction')", async () => {
  for (const [q, check] of [
    ["base set charizard under $500", (i) => assert.equal(i.price_max, 500)],
    ["base set charizard auction", (i) => assert.equal(i.listing_type, "AUCTION")],
    ["base set charizard buy it now", (i) => assert.equal(i.listing_type, "BIN")],
  ]) {
    const { intent, resolution, exact } = await resolve(q);
    check(intent);
    const ids = idsOf(resolution, exact).map(String);
    assert.ok(ids.length >= 1 && ids.every((id) => byId.get(id).set === "Base Set" && byId.get(id).species === "Charizard"), q);
  }
});

// ===== 7: pure set stays pure set (13B.5.1 intact) ================

test("7. pure set is untouched: 'base set' / 'evolving skies' / '151' -> mode set", async () => {
  for (const q of ["base set", "evolving skies", "151"]) {
    const { resolution } = await resolve(q);
    assert.equal(resolution.mode, "set", q);
  }
});

// ===== 8: exact-card precedence (13B.2) intact ===================

test("8. 'base set charizard 4/102' -> exact_card (number wins over the intersection)", async () => {
  const { resolution, exact } = await resolve("base set charizard 4/102");
  assert.equal(resolution.mode, "exact_card");
  assert.equal(exact.tcgplayer_id, "42382");
});

test("8b. 'charizard 4/102' (no set) still exact_card", async () => {
  const { resolution, exact } = await resolve("charizard 4/102");
  assert.equal(resolution.mode, "exact_card");
  assert.equal(exact.tcgplayer_id, "42382");
});

// ===== 9: subject/collector mismatch (13B.2.1) intact ============

test("9. 'pikachu 10/102' stays subject_collector_mismatch; Mewtwo not exact", async () => {
  const { resolution, exact } = await resolve("pikachu 10/102");
  assert.equal(resolution.mode, "subject_collector_mismatch");
  assert.equal(exact, null);
  assert.equal(resolution.subject_collector_mismatch.belongs_to.name, "Mewtwo");
});

// ===== 10: valid-but-empty intersection stays empty ==============

test("10. real species + real set with no matching card -> species_set_no_match, empty", async () => {
  for (const [q, sp, set] of [
    ["team rocket umbreon", "Umbreon", "Team Rocket"],
    ["jungle charizard", "Charizard", "Jungle"],
    ["obsidian flames blastoise", "Blastoise", "SV03: Obsidian Flames"],
  ]) {
    const { intent, resolution, candidates } = await resolve(q);
    assert.equal(resolution.mode, "species_set_no_match", q);
    assert.deepEqual(resolution.subject_ids, [], `${q}: subject_ids not empty`);
    assert.deepEqual(candidates ?? [], [], `${q}: candidates not empty`);
    assert.equal(intent.subject.species, sp);
    assert.equal(intent.subject.set, set);
    assert.ok(
      intent.ambiguities.some((a) => a.startsWith("species_set_no_match")),
      `${q}: no species_set_no_match note`
    );
    // must NOT have broadened to all-species or all-set
    assert.notEqual(resolution.mode, "species");
    assert.notEqual(resolution.mode, "set");
    assert.notEqual(resolution.mode, "provider_fallback");
  }
});

// ===== 11: known intersections never reach the provider ==========

test("11. species+set resolutions are always local (never provider_fallback)", async () => {
  for (const q of [
    "base set charizard", "evolving skies umbreon", "151 pikachu", "151 charizard",
    "base set mewtwo", "base set charizard psa 10", "team rocket umbreon",
  ]) {
    const { resolution } = await resolve(q);
    assert.notEqual(resolution.mode, "provider_fallback", q);
  }
});

// ===== 12: set_id is carried on the intersection ================

test("12. species+set carries the canonical set_id", async () => {
  const a = await resolve("base set charizard");
  assert.equal(a.intent.subject.set_id, "604");
  const b = await resolve("evolving skies umbreon");
  assert.equal(b.intent.subject.set_id, "2848");
});
