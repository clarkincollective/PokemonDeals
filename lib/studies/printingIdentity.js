// WHICH PHYSICAL PRINTING IS A LISTING EVIDENCED TO OFFER?
//
// Pure. No data access. Built on lib/printingMatch's own primitives
// (printingEvidence, classifyPrinting, PARALLEL_FAMILIES) so this file
// states a policy over those rules rather than re-deriving them.
//
// WHY THIS EXISTS. Revision 2 of the shipping-cost study grouped listings
// by `card_tcgplayer_id` and published the claim that the catalogue
// product id "alone" settles the exact card AND its printing. That is
// FALSE, and our own retained listings disprove it. Product id 84571
// (Dark Celebi, EX Hidden Legends) carried nine retained listings at one
// observation: one titled "Non Holo", one titled "Reverse Holo", and the
// rest plain "Holo". Three different physical finishes, one product id.
// The catalogue records a SINGLE `market_printing` per id - it is the
// printing its market price is quoted for, not a promise about what every
// listing under that id is selling.
//
// So a comparison that assumes the id fixes the finish can compare a
// reverse holo against a plain copy and call the difference a saving.
//
// WHAT COUNTS AS EVIDENCE. lib/printingMatch's doctrine, applied here
// unchanged: only the SELLER'S OWN WORDS settle a finish. The catalogue
// entry cannot, because the catalogue entry is the thing in doubt. So:
//
//   * the listing asserts exactly one family            -> EVIDENCED
//   * the listing rules families out, and the catalogue
//     printing survives that exclusion                  -> CATALOGUE
//   * the listing says nothing, the catalogue printing
//     is not a parallel family, and no other listing on
//     the SAME product id evidences a different family  -> CATALOGUE
//   * anything else                                     -> UNRESOLVED
//
// The third rule is the one that does the work. "No other listing on the
// same id evidences a different family" is not a guess about the card: it
// is the invariant test run against the sample itself. Where a product id
// is shown to cover more than one finish, every silent listing under it
// becomes unresolved, because nothing distinguishes it from its
// neighbours. Unresolved listings are excluded from comparison - never
// defaulted into a group.
//
// A listing asserting TWO families ("1st Edition Reverse Holo") is
// unresolved too: an incoherent title is not evidence, it is noise.

import pkg from "../printingMatch.js";

const { printingEvidence, classifyPrinting, PARALLEL_FAMILIES } = pkg;

export const RESOLUTION = Object.freeze({
  EVIDENCED: "evidenced",
  CATALOGUE_AFTER_EXCLUSION: "catalogue_after_exclusion",
  CATALOGUE_UNCONTESTED: "catalogue_uncontested",
  UNRESOLVED_CONTRADICTED: "unresolved_contradicted",
  UNRESOLVED_AMBIGUOUS: "unresolved_ambiguous",
  UNRESOLVED_NO_CATALOGUE_PRINTING: "unresolved_no_catalogue_printing",
  UNRESOLVED_PARALLEL_UNEVIDENCED: "unresolved_parallel_unevidenced",
  UNRESOLVED_ID_COVERS_MULTIPLE_FINISHES: "unresolved_id_covers_multiple_finishes",
});

const RESOLVED = new Set([
  RESOLUTION.EVIDENCED,
  RESOLUTION.CATALOGUE_AFTER_EXCLUSION,
  RESOLUTION.CATALOGUE_UNCONTESTED,
]);

export function isResolved(r) {
  return RESOLVED.has(r?.resolution);
}

// What one listing's own text establishes, before the sample is consulted.
export function listingPrintingEvidence({ title = "", condition = "" } = {}) {
  const ev = printingEvidence(`${title ?? ""} ${condition ?? ""}`);
  return { asserted: [...ev.asserted], excluded: [...ev.excluded] };
}

/**
 * Resolve the printing family for every listing in a sample.
 *
 * @param rows  [{ key, title, condition, cardId, catalogPrinting }]
 * @returns Map<key, { family, resolution, evidence }>
 */
export function resolvePrintings(rows) {
  const evidence = new Map();
  for (const r of rows) evidence.set(r.key, listingPrintingEvidence(r));

  // Which product ids are PROVEN, by their own listings, to cover more
  // than one finish?
  //
  // Count the DISTINCT families the id is shown to carry: every family a
  // seller asserts, plus the one the catalogue records. More than one and
  // the id is contested - a silent listing under it could be any of them.
  //
  // The case this exists for: the catalogue records "Normal", one seller
  // writes "Reverse Holo". Nothing is contradicted and only one family is
  // asserted, yet the id demonstrably carries two finishes, and a silent
  // neighbour is exactly as likely to be either. An earlier draft counted
  // only assertions against each other and let that neighbour default to
  // the catalogue printing - which is the whole defect, reintroduced one
  // level down.
  const familiesById = new Map();
  for (const r of rows) {
    const ev = evidence.get(r.key);
    const id = r.cardId ?? "";
    if (!familiesById.has(id)) familiesById.set(id, { families: new Set(), excluded: new Set() });
    const acc = familiesById.get(id);
    for (const f of ev.asserted) acc.families.add(f);
    for (const f of ev.excluded) acc.excluded.add(f);
    const cf = r.catalogPrinting ? classifyPrinting(r.catalogPrinting) : null;
    if (cf) acc.families.add(cf);
  }
  const contestedIds = new Set();
  for (const [id, acc] of familiesById) {
    if (acc.families.size > 1) contestedIds.add(id);
    // a listing ruling out a family the id is recorded as carrying is
    // itself evidence that more than one finish exists under it
    else if ([...acc.families].some((f) => acc.excluded.has(f))) contestedIds.add(id);
  }

  const out = new Map();
  for (const r of rows) {
    const ev = evidence.get(r.key);
    const cp = r.catalogPrinting;
    const cpFamily = cp ? classifyPrinting(cp) : null;

    if (ev.asserted.length > 1) {
      out.set(r.key, { family: null, resolution: RESOLUTION.UNRESOLVED_AMBIGUOUS, evidence: ev });
      continue;
    }
    if (ev.asserted.length === 1) {
      out.set(r.key, { family: ev.asserted[0], resolution: RESOLUTION.EVIDENCED, evidence: ev });
      continue;
    }
    if (!cpFamily) {
      out.set(r.key, { family: null, resolution: RESOLUTION.UNRESOLVED_NO_CATALOGUE_PRINTING, evidence: ev });
      continue;
    }
    if (ev.excluded.length > 0) {
      if (ev.excluded.includes(cpFamily)) {
        // the listing has ruled out the only printing the catalogue holds
        out.set(r.key, { family: null, resolution: RESOLUTION.UNRESOLVED_CONTRADICTED, evidence: ev });
      } else {
        out.set(r.key, { family: cpFamily, resolution: RESOLUTION.CATALOGUE_AFTER_EXCLUSION, evidence: ev });
      }
      continue;
    }
    // The listing says nothing about its finish.
    if (PARALLEL_FAMILIES.has(cpFamily)) {
      // The catalogue's printing IS a parallel. A parallel is a choice, and
      // this listing has not made it.
      out.set(r.key, { family: null, resolution: RESOLUTION.UNRESOLVED_PARALLEL_UNEVIDENCED, evidence: ev });
      continue;
    }
    if (contestedIds.has(r.cardId ?? "")) {
      out.set(r.key, { family: null, resolution: RESOLUTION.UNRESOLVED_ID_COVERS_MULTIPLE_FINISHES, evidence: ev });
      continue;
    }
    out.set(r.key, { family: cpFamily, resolution: RESOLUTION.CATALOGUE_UNCONTESTED, evidence: ev });
  }
  return out;
}

// Product ids the sample itself proves cover more than one finish.
export function contestedProductIds(rows) {
  const resolved = resolvePrintings(rows);
  const ids = new Set();
  for (const r of rows) {
    if (resolved.get(r.key)?.resolution === RESOLUTION.UNRESOLVED_ID_COVERS_MULTIPLE_FINISHES) ids.add(r.cardId);
  }
  return ids;
}
