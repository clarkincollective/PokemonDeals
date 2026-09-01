// ONE shared species-fact model for /pokemon/[slug] (SEO Phase 2A).
//
// Deal-backed, catalogue-backed and noindex renders all read this - never
// a per-template copy. Every field is either derived from the canonical
// dex-ordered SPECIES list (dex number, generation, region) or read from
// the static, hand-verified PokeAPI export in lib/pokemonSpeciesFacts.js
// (types, evolution). No runtime dependency, nothing fabricated: a field
// that isn't known is omitted, and callers must render only what is set.
//
// CommonJS to match lib/pokemonSpecies.js (shared with plain-node
// scripts + the SEO test suite).

const { SPECIES } = require("./pokemonSpeciesData");
const { SPECIES_FACTS } = require("./pokemonSpeciesFacts");
const { generationOfDex } = require("./pokemonSpecies");

// dex number == position in the canonical list (SPECIES is in dex order).
const DEX_BY_NAME = new Map(SPECIES.map((name, i) => [name, i + 1]));

const GENERATION_REGION = {
  1: "Kanto",
  2: "Johto",
  3: "Hoenn",
  4: "Sinnoh",
  5: "Unova",
  6: "Kalos",
  7: "Alola",
  8: "Galar",
  9: "Paldea",
};

const GENERATION_ROMAN = {
  1: "I", 2: "II", 3: "III", 4: "IV", 5: "V", 6: "VI", 7: "VII", 8: "VIII", 9: "IX",
};

// The full evolution line a species sits on, as an ordered array of
// display names, e.g. ["Bulbasaur","Ivysaur","Venusaur"] for any of the
// three. Walks `evolvesFrom` back to the root, then this species, then
// follows `evolvesTo` forward. Branching stages (Eevee) list every branch
// after the split. Returns null when the species has no known relation
// (single-stage / legendary) so callers can hide the line entirely.
function evolutionLine(name) {
  const facts = SPECIES_FACTS[name];
  if (!facts || (!facts.evolvesFrom && !(facts.evolvesTo && facts.evolvesTo.length))) return null;

  // walk back to the root
  const back = [];
  let cursor = facts.evolvesFrom;
  const guard = new Set([name]);
  while (cursor && !guard.has(cursor)) {
    back.unshift(cursor);
    guard.add(cursor);
    cursor = SPECIES_FACTS[cursor]?.evolvesFrom ?? null;
  }

  // forward from this species (first branch only kept linear; siblings
  // appended as a flat "or" set at the split)
  const forward = [];
  cursor = name;
  while (cursor && !guard.has(`f:${cursor}`)) {
    guard.add(`f:${cursor}`);
    const next = SPECIES_FACTS[cursor]?.evolvesTo ?? [];
    if (next.length === 0) break;
    if (next.length === 1) {
      forward.push(next[0]);
      cursor = next[0];
    } else {
      forward.push(next); // branch: an array element marks the split
      break;
    }
  }

  return [...back, name, ...forward];
}

// The public model. Only keys with real values are present.
//
//   dexNumber        1..1025            (always, for a real species)
//   generation       1..9              (always)
//   generationRoman  "I".."IX"         (always)
//   generationRegion "Kanto".."Paldea" (always, deterministic mapping)
//   types            ["Grass","Poison"] | undefined
//   evolvesFrom      "Bulbasaur" | undefined
//   evolvesTo        ["Ivysaur"] | ["Espeon", ...] | undefined
//   evolutionLine    ["Bulbasaur","Ivysaur","Venusaur"] | undefined
//
// Returns null only when `name` is not a canonical dex species.
function speciesFacts(name) {
  const dexNumber = DEX_BY_NAME.get(name);
  if (!dexNumber) return null;
  const generation = generationOfDex(dexNumber);
  const out = {
    dexNumber,
    generation,
    generationRoman: GENERATION_ROMAN[generation] ?? String(generation),
    generationRegion: GENERATION_REGION[generation] ?? null,
  };
  const f = SPECIES_FACTS[name];
  if (f?.types?.length) out.types = f.types;
  if (f?.evolvesFrom) out.evolvesFrom = f.evolvesFrom;
  if (f?.evolvesTo?.length) out.evolvesTo = f.evolvesTo;
  const line = evolutionLine(name);
  if (line && line.length > 1) out.evolutionLine = line;
  return out;
}

module.exports = { speciesFacts, evolutionLine, GENERATION_REGION };
