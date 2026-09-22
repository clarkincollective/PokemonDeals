// Arithmetic and scope checks over the FROZEN shipping-cost study
// artifact and the page that renders it.
//
// The first published version of this study carried a denominator error:
// it reported the excluded listings' share of the population (60.7%) as
// the amount the analysed sample would GROW by if they were included
// (154.4%). These are different ratios over different denominators, and
// nothing in the build caught it because the wrong figure was typed into
// prose rather than derived. Every ratio the page states is now derived
// from the artifact, and this file checks the artifact's own arithmetic
// closes and that the page states neither ratio by hand.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { STUDY } from "../../lib/studies/shippingCost202609.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => readFileSync(join(ROOT, p), "utf8");
const PAGE = "app/market-data/pokemon-shipping-cost-study/page.js";
const GEN = "scripts/studies/buildShippingCostStudy.mjs";

const close = (a, b, tol = 0.051) => Math.abs(a - b) <= tol;

test("1. the population funnel reconciles at every step", () => {
  const p = STUDY.population;
  assert.ok(p.activeRows >= p.fixedPrice, "fixed-price rows cannot exceed active rows");
  assert.ok(p.fixedPrice >= p.afterDeduplication, "deduplication cannot add rows");
  assert.ok(p.afterDeduplication >= p.usable, "the usable sample cannot exceed the deduplicated one");
  // the shipping-state buckets partition the deduplicated population
  const stateTotal = Object.values(p.byShippingState).reduce((a, b) => a + b, 0);
  assert.equal(stateTotal, p.afterDeduplication, "shipping-state buckets must sum to the deduplicated population");
  // usable is exactly the confirmed bucket, minus any row failing the
  // price gates - never more than it
  assert.ok(p.usable <= (p.byShippingState.confirmed ?? 0), "usable cannot exceed the confirmed bucket");
  assert.equal(p.excludedNotConfirmed, p.afterDeduplication - p.usable, "excluded count must be the remainder");
});

test("2. the two exclusion ratios use their own denominators and are not interchangeable", () => {
  const p = STUDY.population;
  // share OF THE POPULATION
  assert.ok(
    close(p.excludedShareOfDeduplicatedPct, (100 * p.excludedNotConfirmed) / p.afterDeduplication),
    `excludedShareOfDeduplicatedPct ${p.excludedShareOfDeduplicatedPct} != ${(100 * p.excludedNotConfirmed) / p.afterDeduplication}`
  );
  // growth OF THE ANALYSED SAMPLE
  assert.ok(
    close(p.sampleGrowthIfIncludedPct, (100 * p.excludedNotConfirmed) / p.usable),
    `sampleGrowthIfIncludedPct ${p.sampleGrowthIfIncludedPct} != ${(100 * p.excludedNotConfirmed) / p.usable}`
  );
  // the exact confusion that produced the published error: whenever the
  // excluded rows are more than half the population the growth figure is
  // strictly larger than the share, so one can never stand in for the other
  if (p.excludedNotConfirmed > p.afterDeduplication / 2) {
    assert.ok(
      p.sampleGrowthIfIncludedPct > 100,
      "excluding more than half the population must more than double the sample when they are added back"
    );
    assert.ok(p.sampleGrowthIfIncludedPct > p.excludedShareOfDeduplicatedPct);
  }
});

test("3. the reversal figure is internally consistent and bounded by its groups", () => {
  const g = STUDY.comparableGroups;
  assert.ok(g.groups > 0, "no comparable groups");
  assert.ok(g.rankFlips >= 0 && g.rankFlips <= g.groups, "reversals cannot exceed groups");
  assert.ok(close(g.rankFlipPct, (100 * g.rankFlips) / g.groups, 0.5), "rankFlipPct must be rankFlips/groups");
  assert.ok(g.groupsWithItemPriceTie <= g.groups, "tied groups cannot exceed groups");
  assert.ok(
    g.tiesNotCountedAsReversals <= g.groupsWithItemPriceTie,
    "a tie excused from the reversal count must itself be a tied group"
  );
  assert.equal(g.eligibleRows + g.droppedForMissingIdentity, STUDY.population.usable, "group stage must account for every usable row");
});

test("4. comparable groups match on card identity, language, grading, marketplace and delivery basis", () => {
  const fields = STUDY.comparableGroups.identityFields;
  for (const f of ["card_tcgplayer_id", "card_language", "marketplace", "condition", "is_graded", "grader", "grade", "is_local"]) {
    assert.ok(fields.includes(f), `comparable groups do not key on ${f}`);
  }
  const gen = read(GEN);
  // the tie-safe rule, not "sort and take the first"
  assert.match(gen, /tiedOnItem\.some\(\(r\) => Number\(r\.total_price\) === minDelivered\)/, "reversal rule is not tie-safe");
  assert.doesNotMatch(
    gen,
    /cheapestItem\.id !== cheapestDelivered\.id/,
    "the arbitrary-tie-break reversal rule is back"
  );
  assert.match(gen, /methodRevision: 2/, "method revision not recorded");
  assert.equal(STUDY.methodRevision, 2, "artifact predates the corrected method");
});

test("5. every marketplace row is self-consistent and reported in one currency", () => {
  const currencies = new Set();
  for (const m of STUDY.marketplaces) {
    assert.ok(m.n > 0, `${m.marketplace}: empty row`);
    assert.ok(m.medianItem > 0, `${m.marketplace}: median item price must be positive`);
    assert.ok(m.medianShipping > 0, `${m.marketplace}: the population is listings that CHARGE for shipping`);
    assert.ok(
      close(m.medianShippingPctOfItem, m.medianShippingPctOfItem, 0),
      `${m.marketplace}: percentage missing`
    );
    assert.ok(m.shareAtLeast20Pct >= 0 && m.shareAtLeast20Pct <= 100, `${m.marketplace}: share out of range`);
    assert.equal(m.characterised, m.n >= STUDY.minimumNForCharacterisation, `${m.marketplace}: characterised flag does not match n`);
    currencies.add(`${m.marketplace}:${m.currency}`);
  }
  // one currency per marketplace, never pooled across them
  assert.equal(currencies.size, STUDY.marketplaces.length);
  const ns = STUDY.marketplaces.reduce((a, m) => a + m.n, 0);
  assert.equal(ns, STUDY.population.usable, "marketplace rows must account for every usable listing");
});

test("6. the page derives its ratios from the artifact and states no hand-typed rate", () => {
  const src = read(PAGE);
  // the corrected ratios are rendered from the artifact, never typed
  assert.match(src, /s\.population\.excludedShareOfDeduplicatedPct/, "exclusion share is not derived");
  assert.match(src, /s\.population\.sampleGrowthIfIncludedPct/, "sample-growth figure is not derived");
  assert.match(src, /s\.comparableGroups\.rankFlipPct/, "reversal percentage is not derived");
  // the withdrawn claims must not come back
  const prose = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
  assert.doesNotMatch(prose, /quarter of the time/i, "the withdrawn 'a quarter of the time' generalisation is back");
  assert.doesNotMatch(prose, /roughly 60%/i, "the withdrawn 60% growth figure is back");
  assert.doesNotMatch(prose, /depends almost entirely on which marketplace/i, "the withdrawn causal claim is back");
  assert.doesNotMatch(prose, /The 26% figure/i, "a hard-coded reversal percentage is back in prose");
  // scope statements that must stay
  assert.match(prose, /listings that\s*\n?\s*charge/i, "the page no longer scopes its figures to listings that charge for shipping");
  assert.match(prose, /not a rate/i, "the page no longer says the reversal figure is not a rate");
});
