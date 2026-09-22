// PRINTING RESOLUTION - the upstream fix for deal 42127.
//
// GOLDEN FIXTURE. Expedition Bulbasaur 94/165 is the reported defect and
// the first test below is its exact shape: a card the provider returns
// with BOTH a Normal and a Reverse Holofoil variant, where Normal has no
// Lightly Played entry and Reverse Holofoil does. The old collapse-by-
// condition logic filled the Lightly Played tier from Reverse Holofoil
// at $173.49 and priced a plain listing against it. It must now resolve
// to Normal, or to nothing - never to the parallel.
//
// The second thing these fixtures protect is the OPPOSITE error, which
// is the expensive one: an SIR / Full Art / ex exists only as a holo and
// must not be refused for never saying "holo". What keeps both true is
// that Holofoil is not a PARALLEL family, so it survives to the default
// step - not a rarity-label check, and not the variant count.
//
// The 2026-09-22 closeout removed an earlier "single variant -> use it"
// shortcut that bypassed contradictory evidence; the CONTRADICTION
// BEATS THE SINGLETON cases below are the regression guard for it.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  classifyPrinting,
  printingEvidence,
  selectReferencePrinting,
  FAMILY,
} from "../../lib/printingMatch.js";

// The provider shape for the reported card, as the stored evidence
// establishes it: the catalogue holds 84026 as "Normal" at $42.86, and
// the deal row recorded a "Reverse Holofoil" reference at $173.49 for
// the SAME tcgplayer id - so the card demonstrably has both variants.
const EXPEDITION_BULBASAUR = ["Normal", "Reverse Holofoil"];

test("GOLDEN: plain Expedition Bulbasaur does not resolve to Reverse Holofoil", () => {
  const choice = selectReferencePrinting({
    variantNames: EXPEDITION_BULBASAUR,
    evidenceText: "BULBASAUR 94/165 EXPEDITION BASE SET POKEMON TCG NM/LP Lightly Played",
    catalogPrinting: "Normal",
  });
  assert.equal(choice.printing, "Normal");
  assert.equal(choice.parallel, false);
  assert.equal(choice.reason, "catalog_printing");
});

test("GOLDEN: and not even when the catalogue printing is missing", () => {
  // A row with no catalogue match must still refuse the parallel; it
  // falls back to the non-parallel default, never to the premium one.
  const choice = selectReferencePrinting({
    variantNames: EXPEDITION_BULBASAUR,
    evidenceText: "BULBASAUR 94/165 EXPEDITION BASE SET POKEMON TCG NM/LP",
    catalogPrinting: null,
  });
  assert.equal(choice.printing, "Normal");
  assert.equal(choice.reason, "default_printing");
});

test("explicit Reverse Holo evidence permits the reverse reference", () => {
  for (const title of [
    "Bulbasaur 94/165 Expedition REVERSE HOLO LP",
    "Bulbasaur 94/165 Expedition rev holo",
    "Bulbasaur 94/165 Expedition Reverse Foil",
  ]) {
    const choice = selectReferencePrinting({ variantNames: EXPEDITION_BULBASAUR, evidenceText: title, catalogPrinting: "Normal" });
    assert.equal(choice.printing, "Reverse Holofoil", title);
    assert.equal(choice.reason, "evidenced");
    assert.equal(choice.parallel, true);
  }
});

test("explicit Non-Holo / Regular pins the plain printing", () => {
  for (const title of [
    "Dark Dragonite 15/109 - Non-Holo - Ex Team Rocket Returns",
    "WIGGLYTUFF 34/144 SKYRIDGE RARE NON HOLO",
    "Psyduck 74/102 Triumphant Regular Common LP",
  ]) {
    const choice = selectReferencePrinting({ variantNames: ["Normal", "Reverse Holofoil"], evidenceText: title, catalogPrinting: null });
    assert.equal(choice.printing, "Normal", title);
    assert.equal(choice.parallel, false);
  }
});

test("a contradictory title is treated as unknown, not as evidence", () => {
  // "Non-Holo Reverse" is incoherent. The safe reading is that we do not
  // know, so the parallel is refused rather than granted by the word
  // "reverse" appearing.
  const choice = selectReferencePrinting({
    variantNames: EXPEDITION_BULBASAUR,
    evidenceText: "Bulbasaur 94/165 Non-Holo Reverse listing",
    catalogPrinting: null,
  });
  assert.equal(choice.printing, "Normal");
  assert.notEqual(choice.reason, "evidenced");
});

test("1st Edition: evidenced permits it, Unlimited excludes it, silence defaults", () => {
  const variants = ["Unlimited Holofoil", "1st Edition Holofoil"];
  assert.equal(
    selectReferencePrinting({ variantNames: variants, evidenceText: "Charizard 4/102 1st Edition Holo" }).printing,
    "1st Edition Holofoil"
  );
  assert.equal(
    selectReferencePrinting({ variantNames: variants, evidenceText: "Charizard 4/102 Unlimited Holo" }).printing,
    "Unlimited Holofoil"
  );
  // Silence must not buy the 1st Edition.
  const silent = selectReferencePrinting({ variantNames: variants, evidenceText: "Charizard 4/102 Base Set Holo" });
  assert.equal(silent.printing, "Unlimited Holofoil");
  assert.equal(silent.parallel, false);
});

test("a lone HOLOFOIL variant still serves the inherently-holo rarities", () => {
  // The expensive mistake in the other direction. These titles never say
  // "holo" and must never be refused for it. Note what makes this work:
  // NOT a rarity-label check (SIR / Full Art / ex are never read as
  // proof), and NOT the variant count - simply that Holofoil is not a
  // parallel family, so it survives to the default step.
  for (const title of [
    "Mega Gengar ex 284/217 Ascended Heroes SIR",
    "Rayquaza V (Alternate Full Art) 194/203 Evolving Skies",
    "Black Kyurem EX Full Art 145/149 Boundaries Crossed",
  ]) {
    const choice = selectReferencePrinting({ variantNames: ["Holofoil"], evidenceText: title });
    assert.equal(choice.printing, "Holofoil", title);
    assert.equal(choice.confidence, "default", "a valuation, not a matched claim");
  }
});

// ===================================================================
// CLOSEOUT 2026-09-22: the singleton shortcut bypassed contradictory
// evidence. Probed on the real implementation, these three returned the
// PARALLEL - the original defect class by another route.
// ===================================================================

test("CONTRADICTION BEATS THE SINGLETON: explicit Non-Holo vs a response containing only Reverse Holofoil", () => {
  const choice = selectReferencePrinting({
    variantNames: ["Reverse Holofoil"],
    evidenceText: "Psyduck 104/147 Aquapolis NON HOLO LP",
  });
  assert.equal(choice.printing, null, "must refuse, not fall back to the only variant present");
  assert.equal(choice.reason, "contradicted");
  assert.equal(choice.confidence, null);
});

test("CONTRADICTION BEATS THE SINGLETON: explicit Unlimited vs a response containing only 1st Edition", () => {
  const choice = selectReferencePrinting({
    variantNames: ["1st Edition Holofoil"],
    evidenceText: "Dark Houndoom 7/105 Neo Destiny Unlimited Holo Lightly Played",
  });
  assert.equal(choice.printing, null);
  assert.equal(choice.reason, "contradicted");
});

test("CONTRADICTION BEATS THE SINGLETON: explicit Regular vs only Reverse Holofoil", () => {
  assert.equal(
    selectReferencePrinting({ variantNames: ["Reverse Holofoil"], evidenceText: "Psyduck 74/102 Regular Common LP" }).printing,
    null
  );
});

test("a SPARSE response for a known multi-printing card refuses rather than guesses", () => {
  // Base Set Charizard certainly has more than one printing; the response
  // happening to price only the reverse does not make the listing one.
  // "one printing left after filtering unpriced conditions" is NOT proof
  // of an inherently single-printing identity.
  const choice = selectReferencePrinting({
    variantNames: ["Reverse Holofoil"],
    evidenceText: "Charizard 4/102 Base Set Holo Rare",
  });
  assert.equal(choice.printing, null);
  assert.equal(choice.reason, "ambiguous_parallel_only");
});

test("the catalogue default informs selection but never manufactures listing evidence", () => {
  // The catalogue says this product IS the reverse holo, and the listing
  // says NON HOLO. The contradiction wins - the catalogue cannot vouch
  // for a finish the seller denies.
  const choice = selectReferencePrinting({
    variantNames: ["Reverse Holofoil"],
    evidenceText: "some promo NON-HOLO",
    catalogPrinting: "Reverse Holofoil",
  });
  assert.equal(choice.printing, null);
  assert.equal(choice.reason, "contradicted");
});

test("a catalogue identity that legitimately IS a parallel is matched, not defaulted", () => {
  // Best-of-Game promos are catalogued as Reverse Holofoil. That is the
  // product's identity, so it is a MATCHED selection - but only because
  // nothing in the listing contradicts it.
  const choice = selectReferencePrinting({
    variantNames: ["Reverse Holofoil"],
    evidenceText: "Hitmonchan #2 Best of Game 2002 Promo",
    catalogPrinting: "Reverse Holofoil",
  });
  assert.equal(choice.printing, "Reverse Holofoil");
  assert.equal(choice.confidence, "catalogue");
  assert.equal(choice.parallel, true);
});

test("confidence separates a conservative valuation from a matched claim", () => {
  const matched = selectReferencePrinting({ variantNames: ["Normal", "Reverse Holofoil"], evidenceText: "card reverse holo" });
  const valuation = selectReferencePrinting({ variantNames: ["Normal", "Reverse Holofoil"], evidenceText: "card, no finish stated" });
  assert.equal(matched.confidence, "evidenced");
  assert.equal(valuation.confidence, "default");
  assert.equal(valuation.printing, "Normal", "the valuation is the plain printing, never the parallel");
});

test("Holofoil is only a CHOICE when a non-holo sibling exists", () => {
  // Same card name, two shapes. With a sibling it must be evidenced or
  // default to the plain printing; alone it is simply the card.
  assert.equal(selectReferencePrinting({ variantNames: ["Holofoil"], evidenceText: "Gengar 5/92" }).printing, "Holofoil");
  assert.equal(
    selectReferencePrinting({ variantNames: ["Normal", "Holofoil"], evidenceText: "Gengar 5/92" }).printing,
    "Normal",
    "with a plain sibling and no evidence, the plain one wins"
  );
});

test("AMBIGUOUS: only parallels priced, nothing evidenced -> no reference at all", () => {
  // The case that must NOT silently pick the expensive one. Returning
  // null makes the scanner skip the listing rather than price it.
  const choice = selectReferencePrinting({
    variantNames: ["Reverse Holofoil", "1st Edition Holofoil"],
    evidenceText: "Some card 12/34 LP",
    catalogPrinting: null,
  });
  assert.equal(choice.printing, null);
  assert.equal(choice.reason, "ambiguous_parallel_only");
});

test("classification puts each family in the right bucket", () => {
  assert.equal(classifyPrinting("Reverse Holofoil"), FAMILY.REVERSE, "reverse beats holo");
  assert.equal(classifyPrinting("1st Edition Holofoil"), FAMILY.FIRST_EDITION, "1st edition beats holo");
  assert.equal(classifyPrinting("Unlimited Holofoil"), FAMILY.UNLIMITED);
  assert.equal(classifyPrinting("Holofoil"), FAMILY.HOLOFOIL);
  assert.equal(classifyPrinting("Normal"), FAMILY.NORMAL);
  assert.equal(classifyPrinting("Shadowless"), FAMILY.SHADOWLESS);
  assert.equal(classifyPrinting(""), FAMILY.OTHER);
});

test("negative evidence is read before positive, so 'non-holo' wins", () => {
  const ev = printingEvidence("Charizard NON-HOLO reverse?");
  assert.ok(ev.excluded.has(FAMILY.REVERSE));
  assert.ok(!ev.asserted.has(FAMILY.REVERSE), "a contradicted family is never asserted");
});

test("no variants at all yields no reference", () => {
  assert.equal(selectReferencePrinting({ variantNames: [], evidenceText: "anything" }).printing, null);
  assert.equal(selectReferencePrinting({}).printing, null);
});

// ===================================================================
// CACHE SAFETY. getConditionPrices is cached PER CARD; the printing
// choice is per LISTING. So the narrowing step must not mutate the
// shared provider object, or one listing's finish would leak into the
// next listing of the same card.
// ===================================================================

test("narrowing is pure: the shared provider object is never mutated", () => {
  const shared = Object.freeze({
    byPrintingCondition: Object.freeze({
      Normal: Object.freeze({ "Near Mint": 42.86 }),
      "Reverse Holofoil": Object.freeze({ "Lightly Played": 173.49 }),
    }),
  });
  const before = JSON.stringify(shared);
  // A frozen input would throw on any write attempt.
  for (const text of ["card reverse holo", "card NON HOLO", "card"]) {
    selectReferencePrinting({ variantNames: Object.keys(shared.byPrintingCondition), evidenceText: text });
  }
  assert.equal(JSON.stringify(shared), before, "the provider object is unchanged");
});

test("no cross-listing leakage: two finishes, one cached card response", () => {
  // The exact scenario the per-card cache creates. Same variant list,
  // two different listings - each must resolve independently.
  const variants = ["Normal", "Reverse Holofoil"];
  const revListing = selectReferencePrinting({ variantNames: variants, evidenceText: "Bulbasaur 94/165 REVERSE HOLO" });
  const plainListing = selectReferencePrinting({ variantNames: variants, evidenceText: "Bulbasaur 94/165 NM/LP" });
  const revAgain = selectReferencePrinting({ variantNames: variants, evidenceText: "Bulbasaur 94/165 REVERSE HOLO" });
  assert.equal(revListing.printing, "Reverse Holofoil");
  assert.equal(plainListing.printing, "Normal", "the reverse listing must not bleed into the plain one");
  assert.deepEqual(revAgain, revListing, "and order must not matter");
});

test("a missing correct-condition price does not borrow another printing's", () => {
  // The original defect in one assertion. Normal has only Near Mint;
  // the listing is Lightly Played; Reverse Holofoil has an LP price.
  // Resolution picks Normal, and the LP tier is then simply absent -
  // the caller must not be handed the reverse holo's LP figure.
  const matrix = { Normal: { "Near Mint": 42.86 }, "Reverse Holofoil": { "Lightly Played": 173.49 } };
  const choice = selectReferencePrinting({
    variantNames: Object.keys(matrix),
    evidenceText: "BULBASAUR 94/165 EXPEDITION NM/LP",
    catalogPrinting: "Normal",
  });
  assert.equal(choice.printing, "Normal");
  assert.equal(matrix[choice.printing]["Lightly Played"], undefined, "no LP price for the resolved printing");
  assert.equal(matrix[choice.printing]["Near Mint"], 42.86);
});
