// BEHAVIOURAL checks on the shipping study's printing identity and group
// formation. These construct listings and assert what the rules DO with
// them - asserting that a key string mentions "grade" proves nothing
// about whether a graded and a raw listing end up compared.
//
// The concrete risks, each with its own test:
//   1. two finishes sharing one product id
//   2. a printing that cannot be evidenced
//   3. a valid same-printing group, which must survive
//   4. a tie at the lowest item price

import { test } from "node:test";
import assert from "node:assert/strict";

import { resolvePrintings, isResolved, RESOLUTION } from "../../lib/studies/printingIdentity.js";
import { formGroups, countReversals } from "../../lib/studies/shippingComparison.js";

// A listing shaped as formGroups expects. Defaults are the boring case:
// one product, one marketplace, raw, domestic, plain-holo catalogue entry.
const listing = (over = {}) => ({
  key: over.key ?? Math.random().toString(36).slice(2),
  cardId: "84571",
  title: "Pokemon Dark Celebi 4/101 EX Hidden Legends LP",
  condition: "Lightly Played",
  catalogPrinting: "Holofoil",
  language: "english",
  marketplace: "EBAY_GB",
  graded: false,
  grader: null,
  grade: null,
  local: true,
  price: 10,
  total: 12,
  ...over,
});

test("1. two finishes under ONE product id are never compared with each other", () => {
  // The real shape of product 84571 at the revision-3 observation: a
  // non-holo, a reverse holo, and silent listings, all one product id.
  const rows = [
    listing({ key: "nonholo", title: "Dark Celebi 4/101 Hidden Legends Non Holo Rare LP" }),
    listing({ key: "reverse", title: "Dark Celebi 4/101 Hidden Legends Reverse Holo LP" }),
    listing({ key: "silent-a", title: "Dark Celebi 4/101 Hidden Legends LP" }),
    listing({ key: "silent-b", title: "Dark Celebi 4/101 Hidden Legends LP" }),
  ];
  const r = resolvePrintings(rows);

  // the reverse holo said so, and is believed
  assert.equal(r.get("reverse").resolution, RESOLUTION.EVIDENCED);
  assert.equal(r.get("reverse").family, "reverse");

  // the non-holo ruled out the ONLY printing the catalogue holds for this
  // id, so it resolves to nothing rather than being reassigned to a finish
  // nobody recorded. Stronger than merely landing in a different group.
  assert.equal(r.get("nonholo").resolution, RESOLUTION.UNRESOLVED_CONTRADICTED);
  assert.equal(isResolved(r.get("nonholo")), false);

  // the silent ones are NOT defaulted into either: this id is proven to
  // cover more than one finish, so nothing distinguishes them
  for (const k of ["silent-a", "silent-b"]) {
    assert.equal(r.get(k).resolution, RESOLUTION.UNRESOLVED_ID_COVERS_MULTIPLE_FINISHES, k);
    assert.equal(isResolved(r.get(k)), false, k);
  }

  // and the grouping bears that out: no group contains two finishes
  const formed = formGroups(rows);
  assert.equal(formed.droppedForUnresolvedPrinting, 3, "the non-holo and both silent listings must be dropped");
  assert.equal(formed.comparable.length, 0, "a non-holo and a reverse holo are not a comparable pair");
  const families = formed.groups.map((g) => new Set(g.map((x) => formed.printing.get(x.key).family)));
  for (const f of families) assert.equal(f.size, 1, "a group mixed two printing families");
});

test("1b. a plain catalogue printing plus a reverse-holo listing splits the same way", () => {
  // The commonest real shape: the catalogue holds one plain printing, and
  // one seller on that id says "Reverse Holo". The reverse is believed;
  // every silent listing on that id becomes unresolved, because the id is
  // now shown to cover more than one finish.
  const rows = [
    listing({ key: "rev", cardId: "590025", catalogPrinting: "Normal", title: "Pikachu ex 057/191 Surging Sparks Reverse Holo" }),
    listing({ key: "quiet", cardId: "590025", catalogPrinting: "Normal", title: "Pikachu ex 057/191 Surging Sparks" }),
  ];
  const r = resolvePrintings(rows);
  assert.equal(r.get("rev").family, "reverse");
  assert.equal(r.get("rev").resolution, RESOLUTION.EVIDENCED);
  assert.equal(r.get("quiet").resolution, RESOLUTION.UNRESOLVED_ID_COVERS_MULTIPLE_FINISHES);
  assert.equal(formGroups(rows).comparable.length, 0, "a reverse holo must never be compared against an unevidenced sibling");
});

test("2. an unevidenced printing is excluded, never defaulted", () => {
  const cases = [
    ["no catalogue printing at all", listing({ key: "a", catalogPrinting: null }), RESOLUTION.UNRESOLVED_NO_CATALOGUE_PRINTING],
    [
      "catalogue printing is a parallel the listing never claimed",
      listing({ key: "b", catalogPrinting: "Reverse Holofoil", title: "Pikachu 058/102 Base Set" }),
      RESOLUTION.UNRESOLVED_PARALLEL_UNEVIDENCED,
    ],
    [
      "the listing rules out the only printing the catalogue holds",
      listing({ key: "c", catalogPrinting: "Reverse Holofoil", title: "Pikachu 058/102 Base Set Non Holo" }),
      RESOLUTION.UNRESOLVED_CONTRADICTED,
    ],
    [
      "an incoherent title asserting two families",
      listing({ key: "d", title: "Charizard 1st Edition Reverse Holo Shadowless" }),
      RESOLUTION.UNRESOLVED_AMBIGUOUS,
    ],
  ];
  for (const [why, row, expected] of cases) {
    const r = resolvePrintings([row]);
    assert.equal(r.get(row.key).resolution, expected, why);
    assert.equal(isResolved(r.get(row.key)), false, why);
    assert.equal(r.get(row.key).family, null, why);
  }
  // none of them reaches a group, even paired with a twin
  for (const [why, row] of cases) {
    const twin = { ...row, key: row.key + "-twin" };
    const formed = formGroups([row, twin]);
    assert.equal(formed.comparable.length, 0, `${why}: unresolved listings must not form a group`);
    assert.equal(formed.droppedForUnresolvedPrinting, 2, why);
  }
});

test("3. a valid same-printing group survives and is compared", () => {
  // Two silent listings on a product whose catalogue printing is a plain
  // (non-parallel) finish, with nothing in the sample contesting it.
  const rows = [
    listing({ key: "x", cardId: "42382", title: "Charizard Base Set 4/102 Holo Rare", price: 100, total: 112 }),
    listing({ key: "y", cardId: "42382", title: "Charizard Base Set 4/102 Holo Rare", price: 105, total: 108 }),
  ];
  const formed = formGroups(rows);
  assert.equal(formed.droppedForUnresolvedPrinting, 0, "an uncontested plain printing must resolve");
  assert.equal(formed.comparable.length, 1, "these two are genuinely comparable");
  for (const k of ["x", "y"]) assert.equal(formed.printing.get(k).resolution, RESOLUTION.CATALOGUE_UNCONTESTED);
  // and the comparison works: cheapest item (100/112) is not cheapest delivered (105/108)
  assert.equal(countReversals(formed.comparable).rankFlips, 1);
});

test("3b. the other identity fields actually separate listings, one at a time", () => {
  const base = { cardId: "42382", title: "Charizard Base Set 4/102 Holo Rare", catalogPrinting: "Holofoil" };
  const variations = [
    ["grading", { graded: true, grader: "PSA", grade: "10" }],
    ["grader", { graded: true, grader: "CGC", grade: "10" }],
    ["condition", { condition: "Near Mint" }],
    ["marketplace", { marketplace: "EBAY_US" }],
    ["delivery basis", { local: false }],
    ["language", { language: "japanese" }],
  ];
  for (const [what, over] of variations) {
    const a = listing({ ...base, key: "a" });
    const b = listing({ ...base, key: "b", ...over });
    const formed = formGroups([a, b]);
    assert.equal(formed.comparable.length, 0, `${what} did not separate two listings`);
    assert.equal(formed.groups.length, 2, `${what} did not produce two groups`);
  }
  // control: identical on every field DOES group
  const formed = formGroups([listing({ ...base, key: "a" }), listing({ ...base, key: "b" })]);
  assert.equal(formed.comparable.length, 1, "identical listings must group");
});

test("4. a tie at the lowest item price never manufactures a reversal", () => {
  const g = (rows) => rows.map((r, i) => ({ key: `k${i}`, price: r[0], total: r[1] }));

  // Two listings tie at item price 10; one of them is also the cheapest
  // delivered. Buying on item price CAN reach the best total, so however
  // the tie is broken this is not a reversal.
  const tieReachable = g([[10, 11], [10, 15], [12, 13]]);
  let r = countReversals([tieReachable]);
  assert.equal(r.rankFlips, 0, "a reachable tie is not a reversal");
  assert.equal(r.groupsWithItemPriceTie, 1);
  assert.equal(r.tiesNotCountedAsReversals, 1, "this is exactly the case a naive sort would miscount");

  // Order must not change the answer - the defect was order-dependence.
  for (const perm of [[0, 1, 2], [1, 0, 2], [2, 1, 0], [1, 2, 0]]) {
    const permuted = perm.map((i) => tieReachable[i]);
    assert.equal(countReversals([permuted]).rankFlips, 0, `order ${perm} changed the result`);
  }

  // A tie where NEITHER tied listing reaches the cheapest delivered total
  // IS a genuine reversal.
  const tieUnreachable = g([[10, 20], [10, 21], [12, 13]]);
  assert.equal(countReversals([tieUnreachable]).rankFlips, 1, "an unreachable tie is a real reversal");

  // No tie, straightforward reversal and non-reversal.
  assert.equal(countReversals([g([[10, 20], [12, 13]])]).rankFlips, 1);
  assert.equal(countReversals([g([[10, 11], [12, 13]])]).rankFlips, 0);
});

test("5. the published artifact was computed from a frozen input, not from live rows", async () => {
  const { STUDY } = await import("../../lib/studies/shippingCost202609.js");
  assert.equal(STUDY.methodRevision, 3, "artifact predates the printing-identity correction");
  assert.ok(STUDY.reproducibility, "no reproducibility block");
  assert.equal(STUDY.reproducibility.inputsFrozenBeforeCalculation, true);
  assert.equal(STUDY.reproducibility.computedOffline, true);
  assert.equal(STUDY.reproducibility.digestAlgorithm, "sha256");
  assert.match(STUDY.reproducibility.inputDigest, /^[0-9a-f]{64}$/, "input digest is not a sha256 hex digest");
  assert.ok(STUDY.reproducibility.inputCount > 0);

  // printing is part of the identity, and unresolved listings were dropped
  assert.ok(STUDY.comparableGroups.identityFields.includes("printing_family"), "groups do not key on the resolved printing");
  assert.ok(STUDY.comparableGroups.droppedForUnresolvedPrinting > 0, "no listing was dropped for an unresolved printing - the gate is not running");
  assert.equal(
    STUDY.comparableGroups.eligibleRows + STUDY.comparableGroups.droppedForMissingIdentity + STUDY.comparableGroups.droppedForUnresolvedPrinting,
    STUDY.population.usable,
    "the group stage must account for every usable listing"
  );
  // the finding that motivated the correction is recorded, not just asserted in prose
  assert.ok(STUDY.printingIdentity.productIdsCoveringMultipleFinishes > 0, "no product id was found to cover multiple finishes - the detector is not running");
});
