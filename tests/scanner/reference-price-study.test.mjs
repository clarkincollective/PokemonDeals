// Arithmetic checks over the FROZEN 30-day reference-price study.
//
// WHAT THIS IS, AND WHAT IT IS NOT.
//
// This study is NOT reproducible in the sense the shipping-cost study now
// is. Its inputs - the study's saved analysis and provider responses, and
// the `tools/jtcg-emit-artifact` that emitted this file - were never
// committed to this repository (verified: `git log --all` across every ref
// finds no path matching tools/* or *jtcg*). The study was run in a
// separate working area and only its aggregate was imported, which is
// consistent with the rule that retained evidence lives outside source
// control. Whether that working area still exists cannot be determined
// from here, so this file does not assert that it does, and passing these
// tests DOES NOT make the study reproducible.
//
// What these checks can do is catch the class of defect that actually hit
// the shipping-cost study: a published figure that does not reconcile with
// its own denominators. That one shipped because a ratio was typed into
// prose rather than derived. Here every figure is already frozen, so the
// equivalent risk is an artifact whose parts contradict each other - a
// hand-edit, a partial regeneration, or a copied figure from the wrong
// run. All of that is detectable without the inputs.
//
// Verified 2026-09-23: all 15 relations below hold on the published
// artifact.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { STUDY } from "../../lib/studies/referencePriceChange30d.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => readFileSync(join(ROOT, p), "utf8");
const PAGE = "app/market-data/pokemon-reference-price-changes/page.js";

// Shares are rounded to one decimal in the artifact, so a three-way split
// can legitimately land a rounding step away from 100.
const SHARE_TOL = 0.15;

test("1. the variant funnel reconciles", () => {
  const c = STUDY.coverage;
  assert.equal(c.eligibleVariants + c.excludedVariants, c.totalVariantRecords, "eligible + excluded must be every variant record");
  assert.equal(
    Object.values(c.exclusions).reduce((a, b) => a + b, 0),
    c.excludedVariants,
    "the exclusion reasons must account for every excluded variant"
  );
  assert.ok(c.eligibleVariants > 0 && c.excludedVariants >= 0);
  assert.equal(c.responded, c.products, "a non-responding product would make the coverage figures mean something else");
});

test("2. the sample composition reconciles with how it was drawn", () => {
  const s = STUDY.sampling;
  assert.equal(s.pilotRetained + s.seededAdded, STUDY.coverage.products, "pilot + seeded must be the sampled products");
  // the sensitivity run that drops the pilot must be exactly the seeded part
  assert.equal(
    STUDY.sensitivity.excludingPilot.products,
    s.seededAdded,
    "excluding the pilot must leave exactly the seeded records"
  );
  assert.equal(STUDY.sensitivity.excludingFlagged.products, STUDY.coverage.products, "the flagged-variant check drops variants, not products");
  assert.ok(s.seed != null, "a seeded shuffle with no recorded seed cannot be re-drawn");
});

test("3. every up/down/flat split is a complete split", () => {
  const splits = [
    ["overall", STUDY.overall],
    ["pooled", STUDY.pooled],
    ["sensitivity.excludingFlagged", STUDY.sensitivity.excludingFlagged],
    ["sensitivity.excludingPilot", STUDY.sensitivity.excludingPilot],
    ...STUDY.byEra.map((e) => [`byEra.${e.group}`, e]),
  ];
  for (const [label, g] of splits) {
    if (g.up == null) continue;
    const total = g.up + g.down + g.flat;
    assert.ok(Math.abs(total - 100) <= SHARE_TOL, `${label}: up+down+flat = ${total}, not 100`);
  }
});

test("4. the era breakdown accounts for the whole sample", () => {
  const sum = STUDY.byEra.reduce((a, e) => a + e.products, 0);
  assert.equal(sum, STUDY.coverage.products, "the era groups must partition the sampled products");
  assert.equal(new Set(STUDY.byEra.map((e) => e.group)).size, STUDY.byEra.length, "duplicate era group");
});

test("5. the pooled variant view matches the eligible variant count", () => {
  assert.equal(STUDY.pooled.variants, STUDY.coverage.eligibleVariants, "the pooled view must be over exactly the eligible variants");
});

test("6. both endpoint-date distributions account for every eligible variant", () => {
  for (const side of ["early", "late"]) {
    const dates = STUDY.window.endpointDates[side];
    assert.ok(Array.isArray(dates) && dates.length > 0, `${side}: no endpoint distribution`);
    const total = dates.reduce((a, d) => a + d.variants, 0);
    assert.equal(total, STUDY.coverage.eligibleVariants, `${side} endpoints cover ${total} variants, not ${STUDY.coverage.eligibleVariants}`);
    for (const d of dates) assert.match(d.date, /^\d{4}-\d{2}-\d{2}$/, `${side}: bad date ${d.date}`);
  }
});

test("7. the page still states the study's limits, and claims no reproducibility it does not have", () => {
  const src = read(PAGE);
  const prose = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
  // it is reference-price observations, never sales
  assert.match(prose, /not (completed )?sales|reference price/i, "the page no longer says these are reference prices rather than sales");
  // the median must not be presented as market growth
  assert.doesNotMatch(prose, /market (grew|growth) (of )?1\.7/i, "the headline median is being presented as market growth");
  // and nothing should claim the figures can be re-derived, because the
  // inputs are not retained here
  assert.doesNotMatch(prose, /reproducible|re-?run (it|the study)|verify the figures yourself/i, "the page claims a reproducibility this study does not have");
});
