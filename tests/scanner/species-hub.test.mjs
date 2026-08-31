// Phase 4 P1 - catalog-backed /pokemon/[slug] hub rules (lib/speciesHub.js).
// The route's `indexable` check, the species sitemap threshold and the
// card-link precedence all go through these, so they get a contract test.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  SPECIES_CATALOG_MIN_CARDS,
  speciesIndexable,
  cardPermanentHref,
  isEligibleSpeciesCard,
} from "../../lib/speciesHub.js";
import { speciesLeadsCardName } from "../../lib/pokemonSpecies.js";

test("SPECIES_CATALOG_MIN_CARDS is the audit-proposed 8", () => {
  assert.equal(SPECIES_CATALOG_MIN_CARDS, 8);
});

test("speciesIndexable: at / above / below the threshold on eligibleCount", () => {
  assert.equal(speciesIndexable({ eligibleCount: 8, cardCount: 40 }), true);
  assert.equal(speciesIndexable({ eligibleCount: 20, cardCount: 45 }), true);
  assert.equal(speciesIndexable({ eligibleCount: 7, cardCount: 40 }), false);
  assert.equal(speciesIndexable({ eligibleCount: 0, cardCount: 3 }), false);
});

test("speciesIndexable: no stats / missing count -> not indexable", () => {
  assert.equal(speciesIndexable(null), false);
  assert.equal(speciesIndexable(undefined), false);
  assert.equal(speciesIndexable({ cardCount: 30 }), false); // eligibleCount undefined
});

test("speciesIndexable: honours an explicit min", () => {
  assert.equal(speciesIndexable({ eligibleCount: 5 }, 5), true);
  assert.equal(speciesIndexable({ eligibleCount: 5 }, 6), false);
});

// --- species entity-identity (isEligibleSpeciesCard / speciesLeadsCardName) ---

test("isEligibleSpeciesCard: genuine Pokemon cards & variants are IN", () => {
  const keep = [
    ["Charizard", "Charizard"],
    ["Dark Charizard", "Charizard"],
    ["Blaine's Charizard", "Charizard"],
    ["Charizard ex", "Charizard"],
    ["M Charizard EX", "Charizard"],
    ["Charizard VMAX", "Charizard"],
    ["Charizard VSTAR", "Charizard"],
    ["Radiant Charizard", "Charizard"],
    ["Pikachu V", "Pikachu"],
    ["Rocket's Mewtwo", "Mewtwo"],
    ["Team Aqua's Kyogre ex", "Kyogre"],
    ["Team Plasma Deoxys", "Deoxys"],
    ["Dawn Wings Necrozma", "Necrozma"],
    ["Charizard & Reshiram GX", "Charizard"],
    ["Eevee (Poke Ball Pattern)", "Eevee"], // real card variant, not a product
  ];
  for (const [name, sp] of keep) {
    assert.equal(isEligibleSpeciesCard({ name }, sp), true, `should keep: ${name} -> ${sp}`);
  }
  // a genuinely cheap Pokemon card is IN (this is identity, not price)
  assert.equal(isEligibleSpeciesCard({ name: "Rattata", market_price: 0.1 }, "Rattata"), true);
});

test("isEligibleSpeciesCard: Trainer / Energy / product records are OUT", () => {
  const drop = [
    ["Fire Energy (#9 Charizard Stamped)", "Charizard"], // Energy, Pokemon named mid-string
    ["Houndoom Spirit Link", "Houndoom"], // Trainer Tool, Pokemon leads the name
    ["Charizard Spirit Link", "Charizard"],
    ["Mewtwo Spirit Link", "Mewtwo"],
    ["Pikachu Energy", "Pikachu"],
    ["Code Card - Charizard ex Premium Collection", "Charizard"],
    ["Eevee Heroes Deck", "Eevee"],
    ["Mewtwo Collection Box", "Mewtwo"],
    ["Hop - 165/202 (#54 Pikachu Stamped)", "Pikachu"], // Trainer, Pokemon mid-string
    ["Poke Ball Tin [Pikachu]", "Pikachu"],
  ];
  for (const [name, sp] of drop) {
    assert.equal(isEligibleSpeciesCard({ name }, sp), false, `should drop: ${name} -> ${sp}`);
  }
  // an EXPENSIVE non-Pokemon record is still OUT - price never rescues it
  assert.equal(isEligibleSpeciesCard({ name: "Charizard Spirit Link", market_price: 400 }, "Charizard"), false);
});

test("isEligibleSpeciesCard: structured card_type wins when the catalogue has it", () => {
  assert.equal(isEligibleSpeciesCard({ name: "Charizard", card_type: "Pokémon" }, "Charizard"), true);
  assert.equal(isEligibleSpeciesCard({ name: "Charizard", card_type: "Trainer" }, "Charizard"), false);
  assert.equal(isEligibleSpeciesCard({ name: "Charizard", card_type: "Energy" }, "Charizard"), false);
  // card_type null -> falls back to the name test (still keeps a real card)
  assert.equal(isEligibleSpeciesCard({ name: "Charizard", card_type: null }, "Charizard"), true);
});

test("speciesLeadsCardName: species must lead, not be a mid-name mention", () => {
  assert.equal(speciesLeadsCardName("Dark Charizard", "Charizard"), true);
  assert.equal(speciesLeadsCardName("Fire Energy (#9 Charizard Stamped)", "Charizard"), false);
  assert.equal(speciesLeadsCardName("Houndoom Spirit Link", "Houndoom"), false);
  // the leading species must be THIS species (Tag Team resolves to the first)
  assert.equal(speciesLeadsCardName("Charizard & Reshiram GX", "Reshiram"), false);
  assert.equal(speciesLeadsCardName("Charizard & Reshiram GX", "Charizard"), true);
});

test("cardPermanentHref: deal hub wins, then catalog page, then nothing", () => {
  assert.equal(cardPermanentHref({ hubSlug: "houndoom-ex-xy-breakthrough", catalogSlug: "x" }), "/cards/houndoom-ex-xy-breakthrough");
  assert.equal(cardPermanentHref({ hubSlug: null, catalogSlug: "houndoom-ex-full-art-xy-breakthrough" }), "/cards/houndoom-ex-full-art-xy-breakthrough");
  assert.equal(cardPermanentHref({ hubSlug: null, catalogSlug: null }), null); // no permanent page -> no link
  assert.equal(cardPermanentHref(null), null);
});
