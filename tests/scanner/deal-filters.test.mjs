// Phase 13B.3 - the /pokemon/[slug] scoped-deal filter/query-state
// contract (lib/dealFilters.js). Pure, no DB.
//
// Covers the required 13B.3 regression matrix + every contradictory /
// malformed case: no recognised modifier may be silently ignored - it
// ends up in the query plan (eq/lte/gte) or in `notes` with a reason.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  normalizeDealFilters,
  planDealFilters,
  hasActiveDealFilters,
  appliedFilterChips,
  relaxationSteps,
  SUPPORTED_GRADERS,
  GRADE_VALUES,
} from "../../lib/dealFilters.js";

// ===== normalize: the happy path ===================================

test("no params -> the default (all / no grader / no price) state", () => {
  const n = normalizeDealFilters({});
  assert.equal(n.type, "all");
  assert.equal(n.grader, null);
  assert.equal(n.grade, null);
  assert.equal(n.listing, "all");
  assert.equal(n.minPrice, null);
  assert.equal(n.maxPrice, null);
  assert.deepEqual(n.notes, []);
  assert.equal(hasActiveDealFilters({}), false);
});

test("type=graded -> is_graded true", () => {
  const p = planDealFilters({ type: "graded" });
  assert.equal(p.type, "graded");
  assert.equal(p.eq.is_graded, true);
  assert.equal(hasActiveDealFilters({ type: "graded" }), true);
});

test("type=raw -> is_graded false", () => {
  const p = planDealFilters({ type: "raw" });
  assert.equal(p.eq.is_graded, false);
});

test("grader=PSA + grade=10 -> graded + grader + grade, USD price untouched", () => {
  const p = planDealFilters({ type: "graded", grader: "PSA", grade: "10" });
  assert.equal(p.eq.is_graded, true);
  assert.equal(p.eq.grader, "PSA");
  assert.equal(p.eq.grade, "10");
  assert.deepEqual(p.notes, []);
});

test("grader / grade lowercase + numeric are normalised", () => {
  const n = normalizeDealFilters({ grader: "psa", grade: 10 });
  assert.equal(n.grader, "PSA");
  assert.equal(n.grade, "10");
  assert.equal(n.type, "graded", "a grader/grade implies graded");
});

test('grade "10.0" -> "10"', () => {
  assert.equal(normalizeDealFilters({ grade: "10.0" }).grade, "10");
});

test("maxPrice / minPrice compare against total_price_usd (canonical USD)", () => {
  const p = planDealFilters({ maxPrice: "200", minPrice: "20" });
  assert.equal(p.lte.total_price_usd, 200);
  assert.equal(p.gte.total_price_usd, 20);
  assert.equal(p.lte.total_price, undefined, "must not filter native total_price");
});

test("listing=BIN and listing=FIXED_PRICE both map to FIXED_PRICE", () => {
  assert.equal(planDealFilters({ listing: "BIN" }).eq.listing_type, "FIXED_PRICE");
  assert.equal(planDealFilters({ listing: "FIXED_PRICE" }).eq.listing_type, "FIXED_PRICE");
  assert.equal(planDealFilters({ listing: "AUCTION" }).eq.listing_type, "AUCTION");
});

// ===== the required matrix (section 14) ===========================

const M = (qs) => planDealFilters(Object.fromEntries(new URLSearchParams(qs)));

test("matrix: /pokemon/pikachu (bare) -> no filters", () => {
  const p = M("");
  assert.deepEqual(p.eq, {});
  assert.deepEqual(p.lte, {});
  assert.deepEqual(p.gte, {});
});

test("matrix: ?type=graded", () => {
  assert.deepEqual(M("type=graded").eq, { is_graded: true });
});

test("matrix: ?type=graded&grader=PSA", () => {
  assert.deepEqual(M("type=graded&grader=PSA").eq, { is_graded: true, grader: "PSA" });
});

test("matrix: ?type=graded&grader=PSA&grade=10", () => {
  assert.deepEqual(M("type=graded&grader=PSA&grade=10").eq, {
    is_graded: true,
    grader: "PSA",
    grade: "10",
  });
});

test("matrix: ?type=graded&grader=PSA&grade=10&maxPrice=200", () => {
  const p = M("type=graded&grader=PSA&grade=10&maxPrice=200");
  assert.deepEqual(p.eq, { is_graded: true, grader: "PSA", grade: "10" });
  assert.equal(p.lte.total_price_usd, 200);
});

test("matrix: ?type=raw", () => {
  assert.deepEqual(M("type=raw").eq, { is_graded: false });
});

test("matrix: ?type=raw&maxPrice=50", () => {
  const p = M("type=raw&maxPrice=50");
  assert.deepEqual(p.eq, { is_graded: false });
  assert.equal(p.lte.total_price_usd, 50);
});

test("matrix: ?listing=BIN", () => {
  assert.deepEqual(M("listing=BIN").eq, { listing_type: "FIXED_PRICE" });
});

test("matrix: ?listing=AUCTION", () => {
  assert.deepEqual(M("listing=AUCTION").eq, { listing_type: "AUCTION" });
});

// ===== contradictory / malformed (section 14) - NEVER silently ignored

test("type=raw&grader=PSA -> keep PSA, flip to graded, note the conflict", () => {
  const n = normalizeDealFilters({ type: "raw", grader: "PSA" });
  assert.equal(n.type, "graded", "grader wins the contradiction");
  assert.equal(n.grader, "PSA", "grader is NOT silently dropped");
  assert.ok(n.notes.some((x) => x.code === "raw_vs_graded"));
  const p = planDealFilters({ type: "raw", grader: "PSA" });
  assert.deepEqual(p.eq, { is_graded: true, grader: "PSA" });
});

test("type=raw&grade=10 -> keep grade 10, flip to graded, note it", () => {
  const n = normalizeDealFilters({ type: "raw", grade: "10" });
  assert.equal(n.type, "graded");
  assert.equal(n.grade, "10");
  assert.ok(n.notes.some((x) => x.code === "raw_vs_graded"));
});

test("grade=999 -> dropped with a note, nothing else changes", () => {
  const n = normalizeDealFilters({ grade: "999" });
  assert.equal(n.grade, null);
  assert.equal(n.type, "all", "an invalid grade does not force graded");
  assert.ok(n.notes.some((x) => x.code === "grade_invalid"));
  assert.equal(hasActiveDealFilters({ grade: "999" }), false);
});

test("maxPrice=-5 -> dropped with a note", () => {
  const n = normalizeDealFilters({ maxPrice: "-5" });
  assert.equal(n.maxPrice, null);
  assert.ok(n.notes.some((x) => x.code === "maxprice_invalid"));
  assert.equal(hasActiveDealFilters({ maxPrice: "-5" }), false);
});

test("maxPrice=0 is not a valid ceiling -> dropped", () => {
  assert.equal(normalizeDealFilters({ maxPrice: "0" }).maxPrice, null);
});

test("grader=INVALID -> dropped with a note", () => {
  const n = normalizeDealFilters({ grader: "INVALID" });
  assert.equal(n.grader, null);
  assert.ok(n.notes.some((x) => x.code === "grader_invalid"));
});

test("listing=INVALID -> dropped with a note, listing stays 'all'", () => {
  const n = normalizeDealFilters({ listing: "INVALID" });
  assert.equal(n.listing, "all");
  assert.ok(n.notes.some((x) => x.code === "listing_invalid"));
});

test("type=bogus -> dropped with a note, type stays 'all'", () => {
  const n = normalizeDealFilters({ type: "bogus" });
  assert.equal(n.type, "all");
  assert.ok(n.notes.some((x) => x.code === "type_invalid"));
});

test("inverted range minPrice>maxPrice -> drop the minimum, note it", () => {
  const n = normalizeDealFilters({ minPrice: "500", maxPrice: "100" });
  assert.equal(n.maxPrice, 100);
  assert.equal(n.minPrice, null);
  assert.ok(n.notes.some((x) => x.code === "price_range_inverted"));
});

test("a valid grader with an invalid grade keeps the grader, drops the grade", () => {
  const n = normalizeDealFilters({ grader: "PSA", grade: "abc" });
  assert.equal(n.grader, "PSA");
  assert.equal(n.grade, null);
  assert.equal(n.type, "graded");
});

// ===== applied-filter chips (section 8) ============================

test("chips: graded + PSA + grade 10 + under $200 + BIN, in reading order", () => {
  const chips = appliedFilterChips({
    type: "graded",
    grader: "PSA",
    grade: "10",
    maxPrice: "200",
    listing: "BIN",
  });
  assert.deepEqual(
    chips.map((c) => c.label),
    ["Graded", "PSA", "Grade 10", "Under $200", "Buy It Now"]
  );
});

test("chips: the Graded chip clears type + grader + grade together", () => {
  const chips = appliedFilterChips({ type: "graded", grader: "PSA", grade: "10" });
  const graded = chips.find((c) => c.label === "Graded");
  assert.deepEqual(graded.clears.sort(), ["grade", "grader", "type"]);
});

test("chips: a price range shows one combined chip", () => {
  const chips = appliedFilterChips({ minPrice: "20", maxPrice: "200" });
  assert.deepEqual(chips.map((c) => c.label), ["$20–$200"]);
});

// ===== relaxation steps (section 9) - never auto-broaden ===========

test("relaxation: PSA 10 under $50 offers price -> grade -> grader -> clear-all, in that order", () => {
  const steps = relaxationSteps({ type: "graded", grader: "PSA", grade: "10", maxPrice: "50" });
  const labels = steps.map((s) => s.label);
  assert.equal(labels[0], "Remove the price limit");
  assert.equal(labels[1], "Any PSA grade");
  assert.equal(labels[2], "All graded (any grader)");
  assert.equal(labels[labels.length - 1], "Clear all filters");
  // each step names concrete keys to DROP - it changes state, never broadens silently
  assert.deepEqual(steps[0].drop.sort(), ["maxPrice", "minPrice"]);
  assert.deepEqual(steps[1].drop, ["grade"]);
});

test("relaxation: last step always clears everything", () => {
  const steps = relaxationSteps({ type: "raw", maxPrice: "10" });
  assert.deepEqual(steps[steps.length - 1].drop.sort(), [
    "grade", "grader", "listing", "maxPrice", "minPrice", "type",
  ]);
});

// ===== guardrails =================================================

test("SUPPORTED_GRADERS covers the graders the pipeline records", () => {
  for (const g of ["PSA", "CGC", "BGS", "SGC", "ACE", "TAG"]) {
    assert.ok(SUPPORTED_GRADERS.includes(g), `${g} missing from SUPPORTED_GRADERS`);
  }
});

test("GRADE_VALUES are 1..10 with half grades from 5.5 up", () => {
  assert.ok(GRADE_VALUES.includes("10"));
  assert.ok(GRADE_VALUES.includes("9.5"));
  assert.ok(GRADE_VALUES.includes("1"));
  assert.ok(!GRADE_VALUES.includes("11"));
  assert.ok(!GRADE_VALUES.includes("0"));
});
