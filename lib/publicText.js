// Public-copy spelling convention: PokemonDealFinder renders and generates
// the UNACCENTED "Pokemon" everywhere - headings, body copy, metadata,
// structured data, alt text, the brand name itself.
//
// Some strings we surface come from upstream and carry the franchise's
// accented spelling ("Pok" + U+00E9 + "mon") - chiefly `deals.title` (the
// raw eBay listing title, ~1.4k active rows) and a couple of
// `card_catalog.name` values. Those stay verbatim in the database (still
// needed for matching, and not ours to rewrite); they are normalised here,
// at the display / SEO boundary, right before they become public output.
//
// Deliberately narrow: only the exact word is de-accented, case preserved.
// Any other accented "e" (a set name, an illustrator, a code identifier)
// is left untouched. The pattern uses a \u escape so this source file
// itself contains no accented character.

const ACCENTED_E = String.fromCharCode(0xe9); // "é", without a literal in source
const POKEMON_ACCENTED = new RegExp("pok" + ACCENTED_E + "mon", "gi");

function matchCase(match) {
  if (match === match.toUpperCase()) return "POKEMON";
  if (match[0] === match[0].toUpperCase()) return "Pokemon";
  return "pokemon";
}

// Normalise a single string for public output. Non-strings pass through.
export function normalizePublicText(value) {
  return typeof value === "string" ? value.replace(POKEMON_ACCENTED, matchCase) : value;
}

// True if a string still carries the accented spelling (used by tests).
export function hasAccentedPokemon(value) {
  return typeof value === "string" && new RegExp("pok" + ACCENTED_E + "mon", "i").test(value);
}
