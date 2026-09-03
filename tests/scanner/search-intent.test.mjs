// Phase 13B.2 - deterministic parser regression tests, from the 13B.1
// interpretation matrix (docs/phase-13b1-findability-architecture.md §13).
//
// These assert PARSER interpretation only (no DB). Resolution / exact
// destination is covered by search-resolve.test.mjs.

import { test } from "node:test";
import assert from "node:assert/strict";
import { parseSearchIntent, collectorNumberVariants } from "../../lib/searchIntent.js";

const P = (q) => parseSearchIntent(q);

// helper: assert a subset of fields on the parsed intent
function expect(q, want) {
  const got = P(q);
  for (const [k, v] of Object.entries(want)) {
    if (k === "species" || k === "collector_number" || k === "set") {
      assert.equal(got.subject[k], v, `${JSON.stringify(q)} -> subject.${k}`);
    } else {
      assert.equal(got[k], v, `${JSON.stringify(q)} -> ${k} (got ${JSON.stringify(got[k])})`);
    }
  }
}

// ===== the required matrix =========================================

test("1. pikachu -> species, catalogue, not exact", () => {
  expect("pikachu", { species: "Pikachu", result_mode: "catalogue", is_exact: false, format: "any" });
});

test("2. graded pikachu -> species + format graded -> deals", () => {
  expect("graded pikachu", { species: "Pikachu", format: "graded", result_mode: "deals" });
});

test("3. psa pikachu -> grader PSA, format graded, deals", () => {
  expect("psa pikachu", { species: "Pikachu", grader: "PSA", format: "graded", result_mode: "deals" });
});

test("4. psa 10 pikachu -> grade 10 (NOT collector number)", () => {
  const g = P("psa 10 pikachu");
  assert.equal(g.subject.species, "Pikachu");
  assert.equal(g.grader, "PSA");
  assert.equal(g.grade, "10");
  assert.equal(g.subject.collector_number, null, "10 must NOT be a collector number");
  assert.equal(g.result_mode, "deals");
});

test("5. pikachu psa 10 -> grade 10 (the marquee failure)", () => {
  const g = P("pikachu psa 10");
  assert.equal(g.subject.species, "Pikachu");
  assert.equal(g.grader, "PSA");
  assert.equal(g.grade, "10");
  assert.equal(g.subject.collector_number, null);
  assert.equal(g.format, "graded");
});

test("6. psa 10 pikachu under $200 -> grade 10 + price_max 200", () => {
  const g = P("psa 10 pikachu under $200");
  assert.equal(g.subject.species, "Pikachu");
  assert.equal(g.grade, "10");
  assert.equal(g.grader, "PSA");
  assert.equal(g.price_max, 200);
  assert.equal(g.subject.collector_number, null);
  assert.equal(g.result_mode, "deals");
});

test("7. pikachu under 50 -> price_max 50", () => {
  expect("pikachu under 50", { species: "Pikachu", price_max: 50, result_mode: "deals" });
  assert.equal(P("pikachu under 50").subject.collector_number, null);
});

test("8. raw pikachu -> format raw", () => {
  expect("raw pikachu", { species: "Pikachu", format: "raw", result_mode: "deals" });
});

test("9. raw pikachu nm -> format raw + condition NM", () => {
  expect("raw pikachu nm", { species: "Pikachu", format: "raw", condition: "NM" });
});

test("10. japanese pikachu -> language japanese", () => {
  expect("japanese pikachu", { species: "Pikachu", language: "japanese" });
});

test("11. pikachu auction -> listing_type AUCTION", () => {
  expect("pikachu auction", { species: "Pikachu", listing_type: "AUCTION", result_mode: "deals" });
});

test("12. pikachu buy it now -> listing_type BIN, no stray tokens", () => {
  const g = P("pikachu buy it now");
  assert.equal(g.subject.species, "Pikachu");
  assert.equal(g.listing_type, "BIN");
  assert.ok(!/buy|it|now/.test(g.subject.card_name ?? ""), "no 'buy it now' left in card_name");
});

test("13. base set charizard -> set Base Set, era wotc, name charizard", () => {
  const g = P("base set charizard");
  assert.equal(g.subject.set, "Base Set");
  assert.equal(g.era, "wotc");
  assert.equal(g.subject.species, "Charizard");
  assert.equal(g.subject.collector_number, null);
});

test("14. charizard 4/102 -> collector_number 4/102, card kind, exact-ish", () => {
  const g = P("charizard 4/102");
  assert.equal(g.subject.collector_number, "4/102");
  assert.equal(g.subject.species, "Charizard");
  assert.equal(g.subject.kind, "card");
  assert.equal(g.is_exact, true);
  assert.equal(g.result_mode, "exact_card");
});

test("15. base set charizard 4/102 -> set + number + high confidence", () => {
  const g = P("base set charizard 4/102");
  assert.equal(g.subject.set, "Base Set");
  assert.equal(g.subject.collector_number, "4/102");
  assert.equal(g.subject.species, "Charizard");
  assert.equal(g.confidence, "high");
  assert.equal(g.result_mode, "exact_card");
});

test("16. umbreon japanese -> species + language", () => {
  expect("umbreon japanese", { species: "Umbreon", language: "japanese" });
});

test("17. umbreon psa 10 -> grader + grade, deals", () => {
  const g = P("umbreon psa 10");
  assert.equal(g.subject.species, "Umbreon");
  assert.equal(g.grader, "PSA");
  assert.equal(g.grade, "10");
  assert.equal(g.subject.collector_number, null);
  assert.equal(g.result_mode, "deals");
});

test("18. charizard psa 9 under $500 -> grade 9 + price_max 500", () => {
  const g = P("charizard psa 9 under $500");
  assert.equal(g.subject.species, "Charizard");
  assert.equal(g.grader, "PSA");
  assert.equal(g.grade, "9");
  assert.equal(g.price_max, 500);
  assert.equal(g.subject.collector_number, null);
});

// ===== edge cases (13B.1 §13) ======================================

test("E1. pikachu 10/102 -> collector 10/102 (NOT grade)", () => {
  const g = P("pikachu 10/102");
  assert.equal(g.subject.collector_number, "10/102");
  assert.equal(g.grade, null);
});

test("E2. pikachu 10 psa -> grade 10 (grader AFTER the number)", () => {
  const g = P("pikachu 10 psa");
  assert.equal(g.grader, "PSA");
  assert.equal(g.grade, "10");
  assert.equal(g.subject.collector_number, null);
});

test("E3. psa10 pikachu -> glued grader+grade", () => {
  const g = P("psa10 pikachu");
  assert.equal(g.grader, "PSA");
  assert.equal(g.grade, "10");
  assert.equal(g.subject.species, "Pikachu");
});

test("E4. pikachu gem mint 10 -> grade 10, graded, no condition", () => {
  const g = P("pikachu gem mint 10");
  assert.equal(g.grade, "10");
  assert.equal(g.format, "graded");
  assert.equal(g.condition, null);
});

test("E5. charizard base set 2 -> set 'Base Set 2' (not 'Base Set')", () => {
  assert.equal(P("charizard base set 2").subject.set, "Base Set 2");
});

test("E6. pikachu 25 -> collector 25 (unchanged; no grader/price context)", () => {
  const g = P("pikachu 25");
  assert.equal(g.subject.collector_number, "25");
  assert.equal(g.grade, null);
  assert.equal(g.price_max, null);
});

test("E7. charizard ex -> name keeps 'ex', species Charizard, no modifier", () => {
  const g = P("charizard ex");
  assert.equal(g.subject.species, "Charizard");
  assert.match(g.subject.card_name ?? "", /charizard ex/);
  assert.equal(g.format, "any");
  assert.equal(g.grader, null);
});

test("E8. pikachu $200 -> price_max 200 (bare $ = ceiling)", () => {
  const g = P("pikachu $200");
  assert.equal(g.price_max, 200);
  assert.equal(g.subject.collector_number, null);
});

test("E9. full modifier stack", () => {
  const g = P("pikachu under $50 auction graded psa 9");
  assert.equal(g.subject.species, "Pikachu");
  assert.equal(g.price_max, 50);
  assert.equal(g.listing_type, "AUCTION");
  assert.equal(g.format, "graded");
  assert.equal(g.grader, "PSA");
  assert.equal(g.grade, "9");
  assert.equal(g.subject.collector_number, null);
});

test("E10. charizard 4/102 psa 10 -> number 4/102 AND grade 10", () => {
  const g = P("charizard 4/102 psa 10");
  assert.equal(g.subject.collector_number, "4/102");
  assert.equal(g.grader, "PSA");
  assert.equal(g.grade, "10");
  assert.equal(g.subject.kind, "card");
  // has acquisition modifier -> deals mode, but the subject is still an exact card
  assert.equal(g.result_mode, "deals");
  assert.equal(g.is_exact, true);
});

test("E11. empty -> kind none; 1-char -> low confidence, not exact (API rejects <2 anyway)", () => {
  assert.equal(P("").subject.kind, "none");
  const one = P("p");
  assert.equal(one.is_exact, false);
  assert.equal(one.confidence, "low");
});

// ===== collectorNumberVariants =====================================

test("collectorNumberVariants: 4/102 covers 4/102 + 004/102", () => {
  const v = collectorNumberVariants("4/102");
  assert.ok(v.includes("4/102"));
  assert.ok(v.includes("004/102"));
  assert.ok(v.includes("04/102"));
});

test("collectorNumberVariants: bare 25 covers 25 + 025", () => {
  const v = collectorNumberVariants("25");
  assert.ok(v.includes("25") && v.includes("025"));
});
