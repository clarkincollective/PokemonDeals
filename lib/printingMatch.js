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
// PRECEDENCE (deterministic, in order). CORRECTED 2026-09-22 closeout:
// the first draft began with a "single variant -> use it" shortcut, and
// that shortcut BYPASSED contradictory evidence. Probed on the real
// implementation, all four of these returned the parallel:
//
//     "...NON HOLO LP"            + response {Reverse Holofoil} -> Reverse Holofoil
//     "...Regular Common LP"      + response {Reverse Holofoil} -> Reverse Holofoil
//     "...Unlimited Holo"         + response {1st Edition Holo}  -> 1st Edition Holofoil
//
// i.e. the original defect class reached by a different route. Three
// different things had been conflated, and only the first is proof of an
// inherently single-printing identity:
//
//   (a) one printing KNOWN TO EXIST for an exact catalogue identity
//   (b) one printing PRESENT IN A PROVIDER RESPONSE
//   (c) one printing LEFT AFTER FILTERING unpriced conditions
//
// We cannot establish (a): card_catalog stores one `market_printing` per
// product - its PRIMARY printing, not the full set. So a singleton in a
// provider response is now never treated as proof of exclusivity.
//
//   1. explicit negative evidence  -> excludes those families outright,
//                                     whatever the variant count
//   2. explicit positive evidence  -> that family, when the card has it
//   3. catalogue's own printing    -> card_catalog.market_printing, which
//                                     may legitimately BE a parallel
//   4. the default (NON-parallel)  -> Normal, then Unlimited, then Holo
//   5. nothing defensible          -> null, and the caller makes no claim
//
// A lone HOLOFOIL variant still passes at step 4, which is what keeps the
// inherently-holo modern rarities (SIR, Full Art, ex) working - not a
// rarity-label check, which the brief rightly rules out, but the fact
// that Holofoil is not a parallel family.
//
// `confidence` separates a CONSERVATIVE FALLBACK VALUATION from an EXACT
// MATCHED claim: "evidenced" and "catalogue" are matched; "default" is a
// defensible valuation the listing itself did not establish. Callers that
// assert a saving must require a matched one.

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
  if (names.length === 0) return { printing: null, reason: "no_variants", parallel: false, confidence: null };

  const { asserted, excluded } = printingEvidence(evidenceText);

  // STEP 1. Negative evidence excludes, before anything else and
  // regardless of how many variants the response happens to contain.
  // This is the step the singleton shortcut used to skip.
  const surviving = names.filter((n) => !excluded.has(classifyPrinting(n)));
  if (surviving.length === 0) {
    return { printing: null, reason: "contradicted", parallel: false, confidence: null };
  }

  const byFamily = new Map();
  for (const n of surviving) {
    const f = classifyPrinting(n);
    if (!byFamily.has(f)) byFamily.set(f, n);
  }

  // STEP 2. Positive evidence for a family the card actually has. This is
  // a MATCHED selection - the listing established it.
  for (const family of asserted) {
    if (byFamily.has(family)) {
      return {
        printing: byFamily.get(family),
        reason: "evidenced",
        parallel: PARALLEL_FAMILIES.has(family),
        confidence: "evidenced",
      };
    }
  }

  // STEP 3. The catalogue's own printing for this exact product. This may
  // legitimately BE a parallel - a Best-of-Game promo whose catalogue
  // identity IS "Reverse Holofoil" is not a mis-assignment. It is a
  // MATCHED selection because the catalogue identity establishes it; but
  // it can never manufacture evidence for a family the LISTING has
  // already contradicted, which step 1 has already removed.
  const catalogMatch = surviving.find(
    (n) => catalogPrinting && n.toLowerCase() === String(catalogPrinting).toLowerCase()
  );
  if (catalogMatch) {
    return {
      printing: catalogMatch,
      reason: "catalog_printing",
      parallel: PARALLEL_FAMILIES.has(classifyPrinting(catalogMatch)),
      confidence: "catalogue",
    };
  }

  // STEP 4. Nothing matched: never reach for a parallel. A lone Holofoil
  // passes here (it is not a parallel family), which is what keeps the
  // inherently-holo rarities working.
  const nonParallel = surviving.filter((n) => !PARALLEL_FAMILIES.has(classifyPrinting(n)));
  if (nonParallel.length === 0) {
    return { printing: null, reason: "ambiguous_parallel_only", parallel: false, confidence: null };
  }
  for (const family of DEFAULT_ORDER) {
    const hit = nonParallel.find((n) => classifyPrinting(n) === family);
    if (hit) return { printing: hit, reason: "default_printing", parallel: false, confidence: "default" };
  }
  return { printing: nonParallel[0], reason: "default_printing", parallel: false, confidence: "default" };
}

module.exports = {
  FAMILY,
  PARALLEL_FAMILIES,
  classifyPrinting,
  printingEvidence,
  selectReferencePrinting,
  DEFAULT_ORDER,
};
