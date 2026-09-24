// Sealed priority lane (2026-09-24). Planning only, default OFF, no cron.
//
// The lane exists so a FEW products can be looked at in a FEW specific
// non-US marketplaces without widening the daily 196-product EBAY_US sweep:
// (196+8) x 4 marketplaces = 816 calls/day, versus 16 for the pairs that
// are actually needed. These pin the properties that make it safe to have
// in the tree while it is switched off.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { planLane, laneEnabled, SWEEP_COVERED_MARKETPLACE, MAX_PAIRS_PER_RUN, CALLS_PER_PAIR } from "../../lib/sealedPriorityLane.js";

const P = (tcgplayerId, marketplace) => ({ tcgplayerId, marketplace });

test("PL-1. explicit pairs in, exact planned Browse-call count out, before anything runs", () => {
  const plan = planLane([P("692942", "EBAY_AU"), P("692942", "EBAY_CA"), P("684456", "EBAY_IT")]);
  assert.equal(plan.pairs.length, 3);
  assert.equal(plan.plannedBrowseCalls, 3 * CALLS_PER_PAIR);
  assert.equal(plan.products, 2);
  assert.deepEqual(plan.byMarketplace, { EBAY_AU: 1, EBAY_CA: 1, EBAY_IT: 1 });
  assert.deepEqual(plan.refused, []);
});

test("PL-2. duplicate pairs are deduplicated, and say so", () => {
  const plan = planLane([P("692942", "EBAY_AU"), P("692942", "EBAY_AU"), P(" 692942 ", "ebay_au")]);
  assert.equal(plan.pairs.length, 1);
  assert.equal(plan.plannedBrowseCalls, 1);
  assert.equal(plan.refused.filter((r) => r.reason === "duplicate_pair").length, 2);
});

test("PL-3. an EBAY_US pair is REFUSED - the scheduled sweep already covers it", () => {
  const plan = planLane([P("692942", "EBAY_US"), P("692942", "EBAY_AU")]);
  assert.equal(SWEEP_COVERED_MARKETPLACE, "EBAY_US");
  assert.equal(plan.pairs.length, 1);
  assert.equal(plan.pairs[0].marketplace, "EBAY_AU");
  assert.equal(plan.refused[0].reason, "covered_by_the_scheduled_sweep");
  // no duplicate scan of work the daily pass already does
  assert.equal(plan.plannedBrowseCalls, 1);
});

test("PL-4. a small hard maximum per run; an over-large request is truncated, never overspent", () => {
  const many = Array.from({ length: MAX_PAIRS_PER_RUN + 7 }, (_, i) => P(`p${i}`, "EBAY_AU"));
  const plan = planLane(many);
  assert.equal(plan.pairs.length, MAX_PAIRS_PER_RUN);
  assert.equal(plan.plannedBrowseCalls, MAX_PAIRS_PER_RUN);
  assert.equal(plan.truncated, 7);
  assert.equal(plan.refused.filter((r) => r.reason.startsWith("over_max_pairs_per_run")).length, 7);
  assert.ok(MAX_PAIRS_PER_RUN <= 40, "the ceiling stays small - this is a remediation lane, not a second scanner");
});

test("PL-5. malformed input is refused, never guessed", () => {
  const plan = planLane([P("", "EBAY_AU"), P("692942", ""), null, undefined, {}, P("692942", "EBAY_XX")], { allowedMarketplaces: ["EBAY_AU", "EBAY_CA"] });
  assert.equal(plan.pairs.length, 0);
  assert.equal(plan.plannedBrowseCalls, 0);
  assert.ok(plan.refused.some((r) => r.reason === "unknown_marketplace"));
  assert.equal(plan.refused.filter((r) => r.reason === "incomplete_pair").length, 5);
});

test("PL-6. the lane is OFF by default and needs BOTH the env flag and an explicit ?lane=priority", () => {
  const sp = (v) => ({ get: () => v });
  assert.equal(laneEnabled({}, sp("priority")), false, "no env flag");
  assert.equal(laneEnabled({ SEALED_PRIORITY_LANE: "1" }, sp(null)), false, "no ?lane=priority");
  assert.equal(laneEnabled({ SEALED_PRIORITY_LANE: "1" }, sp("priority")), true);
  assert.equal(laneEnabled({ SEALED_PRIORITY_LANE: "0" }, sp("priority")), false);
  assert.equal(laneEnabled({ SEALED_PRIORITY_LANE: "true" }, sp("priority")), true);
});

test("PL-7. the lane carries NO identity, matching or remediation logic of its own", () => {
  const src = readFileSync(new URL("../../lib/sealedPriorityLane.js", import.meta.url), "utf8");
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "").split(/\r?\n/).map((l) => l.replace(/(^|[^:])\/\/.*/, "$1")).join("\n");
  for (const forbidden of ["sealedListingDecision", "listingMatchesSealedProduct", "productKindOfTitle", "sealed_deals", "supabase", "fetch(", "disqualified_reason", "market_price"]) {
    assert.ok(!code.includes(forbidden), `the lane must not contain ${forbidden} - execution reuses the normal sealed path`);
  }
});

test("PL-8. no cron schedules the lane", () => {
  const vercel = JSON.parse(readFileSync(new URL("../../vercel.json", import.meta.url), "utf8"));
  for (const c of vercel.crons ?? []) {
    assert.ok(!/lane=priority/.test(c.path), `a cron schedules the lane: ${c.path}`);
  }
});

test("PL-9. the 8 Booster Bundle destinations of the 2026-09-23 audit plan to 16 calls", () => {
  // The worked example the lane was sized for. Marketplace-aware: each
  // product only where its unresolved rows actually are.
  const plan = planLane([
    P("692942", "EBAY_AU"), P("692942", "EBAY_CA"), P("692942", "EBAY_IT"),
    P("684456", "EBAY_AU"), P("684456", "EBAY_CA"), P("684456", "EBAY_IT"),
    P("672396", "EBAY_AU"), P("672396", "EBAY_CA"), P("672396", "EBAY_GB"),
    P("610953", "EBAY_AU"), P("610953", "EBAY_CA"),
    P("625670", "EBAY_AU"), P("625670", "EBAY_CA"),
    P("644362", "EBAY_AU"), P("654160", "EBAY_AU"), P("679564", "EBAY_AU"),
  ]);
  assert.equal(plan.products, 8);
  assert.equal(plan.plannedBrowseCalls, 16);
  assert.deepEqual(plan.byMarketplace, { EBAY_AU: 8, EBAY_CA: 5, EBAY_IT: 2, EBAY_GB: 1 });
});
