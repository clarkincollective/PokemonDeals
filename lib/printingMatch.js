// PRINTING RESOLUTION (deal 42127 upstream fix, 22 Sep 2026).
//
// THE DEFECT THIS REPLACES. conditionReferencesFromVariants collapsed
// every printing variant a card has into ONE map keyed only by condition
// tier, keeping the lowest price per tier. Printing was recorded as
// provenance but never used as a constraint. So for Expedition Bulbasaur
// 94/165 - a card the catalogue holds as "Normal" at $42.86 - a listing
// detected as Lightly Played picked up the REVERSE HOLOFOIL entry at
// $173.49, because Normal had no Lightly Played entry and Reverse
// Holofoil did. The tier was filled by whichever printing happened to
// have a price for it. That produced a 60% saving against a card the
// listing is not.
//
// THE STRUCTURAL TEST, and why it is not a pile of regexes. The brief's
// A-vs-B distinction - "a card whose identity inherently implies its
// finish" versus "a card with multiple parallel printings at materially
// different prices" - is answered by the DATA, not by parsing rarity
// names:
//
//     one variant  -> the finish is inherent. Nothing to choose. A SIR,
//                     a Full Art, an ex returns a single "Holofoil"
//                     variant and is used as-is.
//     many variants-> a real choice exists, so it must be evidenced.
//
// That is why "Holofoil" is never treated as a parallel on its own: it
// is only a choice when a non-holo sibling is present in the same
// response. Title parsing enters only as EVIDENCE that permits a
// specific parallel - it never selects one by itself.
//
// PRECEDENCE (deterministic, in order):
//   1. single variant                -> that variant
//   2. explicit negative evidence    -> excludes the contradicted families
//   3. explicit positive evidence    -> that family, when present
//   4. catalogue's own printing      -> card_catalog.market_printing
//   5. the default (non-parallel)    -> Normal, then Unlimited, then Holo
//   6. nothing defensible            -> null, and the caller makes no claim

const FAMILY = Object.freeze({
  REVERSE: "reverse",
  FIRST_EDITION: "first_edition",
  SHADOWLESS: "shadowless",
  UNLIMITED: "unlimited",
  HOLOFOIL: "holofoil",
  NORMAL: "normal",
  OTHER: "other",
});

// Families that are PARALLEL: a card printed this way also exists in a
// plainer printing, and the two carry materially different prices. These
// require positive evidence. Unlimited and Normal are NOT here - they are
// the base printings a card defaults to. Holofoil is not here either: see
// the header, it is only a choice when a non-holo sibling exists.
const PARALLEL_FAMILIES = new Set([FAMILY.REVERSE, FAMILY.FIRST_EDITION, FAMILY.SHADOWLESS]);

// Order matters: "Reverse Holofoil" must classify as REVERSE, not
// HOLOFOIL, and "1st Edition Holofoil" as FIRST_EDITION.
const FAMILY_PATTERNS = [
  [FAMILY.REVERSE, /reverse\s*holo|reverse\s*foil/i],
  [FAMILY.FIRST_EDITION, /1st\s*edition|first\s*edition/i],
  [FAMILY.SHADOWLESS, /shadowless/i],
  [FAMILY.UNLIMITED, /unlimited/i],
  [FAMILY.HOLOFOIL, /holo/i],
  [FAMILY.NORMAL, /normal|regular|non[-\s]?holo/i],
];

function classifyPrinting(name) {
  const s = String(name ?? "");
  if (!s.trim()) return FAMILY.OTHER;
  for (const [family, re] of FAMILY_PATTERNS) if (re.test(s)) return family;
  return FAMILY.OTHER;
}

// What the LISTING itself establishes about its finish. Only the seller's
// own words - the catalogue cannot settle this (the catalogue entry is
// the thing in doubt) and the vision screen describes artwork, not foil.
//
// Negative evidence is read FIRST and wins: "Non-Holo" is a stronger
// statement than the incidental word "holo" inside it.
const NEGATIVE = [
  [/\bnon[-\s]?holo(foil)?\b|\bnot\s+holo\b|\bno\s+holo\b/i, [FAMILY.REVERSE, FAMILY.HOLOFOIL]],
  [/\bregular\b(?!\s*art)/i, [FAMILY.REVERSE]],
  [/\bunlimited\b/i, [FAMILY.FIRST_EDITION, FAMILY.SHADOWLESS]],
];

const POSITIVE = [
  [/\breverse\b|\brev\.?\s*holo\b|\brevholo\b|reverse\s*foil/i, FAMILY.REVERSE],
  [/\b1st\s*ed(?:ition)?\b|\bfirst\s*edition\b/i, FAMILY.FIRST_EDITION],
  [/\bshadowless\b/i, FAMILY.SHADOWLESS],
];

function printingEvidence(text) {
  const s = String(text ?? "");
  const excluded = new Set();
  for (const [re, families] of NEGATIVE) if (re.test(s)) for (const f of families) excluded.add(f);
  const asserted = new Set();
  for (const [re, family] of POSITIVE) {
    if (!re.test(s)) continue;
    // A family the listing has already contradicted is never asserted -
    // "Non-Holo Reverse" is incoherent, and the safe reading of an
    // incoherent title is "we do not know".
    if (excluded.has(family)) continue;
    asserted.add(family);
  }
  return { asserted, excluded };
}

// Preference among NON-parallel printings when nothing is evidenced.
const DEFAULT_ORDER = [FAMILY.NORMAL, FAMILY.UNLIMITED, FAMILY.HOLOFOIL, FAMILY.OTHER];

/**
 * Pick the ONE printing whose reference may price this listing.
 *
 * @param variantNames  the printing names the provider returned for this card
 * @param evidenceText  the listing's own text (title + condition/variant)
 * @param catalogPrinting  card_catalog.market_printing for this tcgplayer id
 * @returns { printing: string|null, reason: string, parallel: boolean }
 *          printing === null means NO defensible reference - the caller
 *          must make no savings claim rather than fall back to a premium
 *          parallel.
 */
function selectReferencePrinting({ variantNames = [], evidenceText = "", catalogPrinting = null } = {}) {
  const names = [...new Set((variantNames ?? []).filter((n) => typeof n === "string" && n.trim()))];
  if (names.length === 0) return { printing: null, reason: "no_variants", parallel: false };
  // 1. Identity implies the finish. One variant is not a choice.
  if (names.length === 1) {
    return { printing: names[0], reason: "single_variant", parallel: PARALLEL_FAMILIES.has(classifyPrinting(names[0])) };
  }

  const { asserted, excluded } = printingEvidence(evidenceText);
  const byFamily = new Map();
  for (const n of names) {
    const f = classifyPrinting(n);
    if (!byFamily.has(f)) byFamily.set(f, n);
  }

  // 3. Positive evidence for a family the card actually has.
  for (const family of asserted) {
    if (byFamily.has(family)) {
      return { printing: byFamily.get(family), reason: "evidenced", parallel: PARALLEL_FAMILIES.has(family) };
    }
  }

  // 4/5. Nothing evidenced: never reach for a parallel. Restrict to the
  // non-parallel printings the card has, excluding anything the listing
  // contradicted, and prefer the catalogue's own printing.
  const eligible = names.filter((n) => {
    const f = classifyPrinting(n);
    return !PARALLEL_FAMILIES.has(f) && !excluded.has(f);
  });
  if (eligible.length === 0) return { printing: null, reason: "ambiguous_parallel_only", parallel: false };

  const catalogMatch = eligible.find((n) => catalogPrinting && n.toLowerCase() === String(catalogPrinting).toLowerCase());
  if (catalogMatch) return { printing: catalogMatch, reason: "catalog_printing", parallel: false };

  for (const family of DEFAULT_ORDER) {
    const hit = eligible.find((n) => classifyPrinting(n) === family);
    if (hit) return { printing: hit, reason: "default_printing", parallel: false };
  }
  return { printing: eligible[0], reason: "default_printing", parallel: false };
}

module.exports = {
  FAMILY,
  PARALLEL_FAMILIES,
  classifyPrinting,
  printingEvidence,
  selectReferencePrinting,
  DEFAULT_ORDER,
};
