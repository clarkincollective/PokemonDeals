// Phase 5 - Pokemon species entity pages (/pokemon/[slug]). Maps a
// catalog-clean card name (a watchlist row's `name` - e.g. "Charizard ex",
// "Rocket's Sneasel ex", "Alolan Vulpix", "Surfing Pikachu", "Mr. Mime")
// to its canonical National Pokedex species, or null.
//
// CommonJS on purpose - shared by lib/deals.js (the Next data layer) AND
// scripts/auditSpeciesExtraction.js (plain node), the same arrangement
// lib/dealMatching.js uses. No dependencies: callers that need a slug
// already import slugifySet from lib/slugify directly.

const { SPECIES } = require("./pokemonSpeciesData");

// Fold a card/species name to a plain lowercase [a-z0-9 ] token string:
// diacritics stripped, gender glyphs -> " f"/" m", every punctuation mark
// (straight AND typographic apostrophes, ".", ":", "-", "/", "&", "?",
// "!" ...) -> space, whitespace collapsed. "Farfetch’d" and
// "Farfetch'd" both -> "farfetch d"; "Unown ?" -> "unown"; "Pikachu &
// Zekrom GX" -> "pikachu zekrom gx".
function normalize(s) {
  return String(s)
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/♀/g, " f")
    .replace(/♂/g, " m")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

// Seller/catalog spellings that drop the punctuation our canonical list
// keeps. Keys are normalized; values are exact SPECIES entries.
const ALIASES = {
  farfetchd: "Farfetch’d",
  sirfetchd: "Sirfetch’d",
  hooh: "Ho-Oh",
  porygonz: "Porygon-Z",
  typenull: "Type: Null",
  mrmime: "Mr. Mime",
  mrrime: "Mr. Rime",
  mimejr: "Mime Jr.",
  "nidoran female": "Nidoran♀",
  "nidoran male": "Nidoran♂",
};

// Index every canonical species (and alias) by its normalized first
// token; each bucket sorted longest-first (more tokens = more specific).
// A left-to-right token-position walk then naturally prefers the earliest
// start and, at that start, the longest match ("Iron Valiant" as a unit,
// "Mr. Mime" as a unit).
const BY_FIRST_TOKEN = new Map();

function indexEntry(canon, key) {
  const tokens = normalize(key).split(" ");
  const entry = { canon, tokens, len: tokens.length };
  const bucket = BY_FIRST_TOKEN.get(tokens[0]);
  if (bucket) bucket.push(entry);
  else BY_FIRST_TOKEN.set(tokens[0], [entry]);
}

for (const canon of SPECIES) indexEntry(canon, canon);
for (const [key, canon] of Object.entries(ALIASES)) indexEntry(canon, key);
for (const bucket of BY_FIRST_TOKEN.values()) bucket.sort((a, b) => b.len - a.len);

function matchAt(tokens, start, bucket) {
  for (const cand of bucket) {
    if (start + cand.len > tokens.length) continue;
    let ok = true;
    for (let i = 0; i < cand.len; i++) {
      if (tokens[start + i] !== cand.tokens[i]) {
        ok = false;
        break;
      }
    }
    if (ok) return cand.canon;
  }
  return null;
}

// The canonical species featured on a card, or null. A TCG card name is
// "<modifiers> <Species> <suffix>" ("Alolan Vulpix", "Surfing Pikachu",
// "Dark Charizard", "Radiant Charizard"), "<Owner>'s <Species> <suffix>"
// ("Rocket's Sneasel ex", "Team Aqua's Kyogre ex"), or bare "<Species>
// <suffix>" - so the first whole-word species run in the name is the
// subject. No owner-prefix strip needed: the walk skips owner/modifier
// tokens for free, and trainer/energy singles ("Boss's Orders", "Misty's
// Determination", "Twin Energy") contain no species token. Tag Team
// names ("Pikachu & Zekrom GX") resolve to the first-named species by the
// same earliest-start rule.
function extractSpecies(cardName) {
  if (!cardName) return null;
  const norm = normalize(cardName);
  if (!norm) return null;
  const tokens = norm.split(" ");

  for (let start = 0; start < tokens.length; start++) {
    const bucket = BY_FIRST_TOKEN.get(tokens[start]);
    if (!bucket) continue;
    const hit = matchAt(tokens, start, bucket);
    if (hit) return hit;
  }
  return null;
}

// National Pokedex generation boundaries (last dex number of each gen).
// SPECIES is in dex order, so SPECIES[i] is dex #(i + 1). Fixed, canonical
// ranges - no external data needed. Used by /pokemon to group the full
// species directory by generation.
const GENERATION_LAST_DEX = [151, 251, 386, 493, 649, 721, 809, 905, 1025];

function generationOfDex(dexNumber) {
  for (let g = 0; g < GENERATION_LAST_DEX.length; g++) {
    if (dexNumber <= GENERATION_LAST_DEX[g]) return g + 1;
  }
  return GENERATION_LAST_DEX.length; // anything past the last known gen
}

// Every canonical species, in dex order, tagged with its dex number and
// generation: [{ name, dex, generation }, ...].
const SPECIES_WITH_GENERATION = SPECIES.map((name, i) => ({
  name,
  dex: i + 1,
  generation: generationOfDex(i + 1),
}));

module.exports = {
  SPECIES,
  extractSpecies,
  SPECIES_WITH_GENERATION,
  GENERATION_LAST_DEX,
  generationOfDex,
};
