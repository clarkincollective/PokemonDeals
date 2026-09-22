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
// is the expensive one: an SIR / Full Art / ex exists only as a holo, so
// a single-variant card must pass through untouched. The rule that keeps
// both true is structural rather than lexical - one variant means the
// identity implies the finish; more than one means a real choice that
// has to be evidenced.
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

test("SINGLE VARIANT: an inherently holo-only card passes through untouched", () => {
  // The expensive mistake in the other direction. These titles never say
  // "holo" and must never be refused for it.
  for (const title of [
    "Mega Gengar ex 284/217 Ascended Heroes SIR",
    "Rayquaza V (Alternate Full Art) 194/203 Evolving Skies",
    "Black Kyurem EX Full Art 145/149 Boundaries Crossed",
  ]) {
    const choice = selectReferencePrinting({ variantNames: ["Holofoil"], evidenceText: title });
    assert.equal(choice.printing, "Holofoil", title);
    assert.equal(choice.reason, "single_variant");
  }
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
