// SEO Phase 12B - graded-price integrity & confidence.
//
// A 179-card / 1,823-tier production audit found provider graded data is
// NOT public-display quality by default (79% provider-flagged low, median
// 2 sales/tier, 44% priced below raw NM). gradedTierConfidence decides -
// deterministically, server-side - whether the evidence for one exact
// card / grader / grade is coherent enough to show a price. It never
// fabricates, interpolates, forces a ladder, or invents a value.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import gc from "../../lib/gradedConfidence.js";

const { gradedTierConfidence, isSharedGradedIdentity, RECOGNIZED_GRADERS, GRADED_CONFIDENCE } = gc;

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => readFileSync(join(ROOT, p), "utf8");
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

const recent = new Date(Date.now() - 20 * 86400_000).toISOString();

// a clean, coherent tier
const tier = (over = {}) => ({
  key: "psa10",
  currentPrice: 300,
  minPrice: 240,
  maxPrice: 360,
  saleCount: 14,
  lastSaleDate: recent,
  providerLowConfidence: false,
  ...over,
});
const ctx = (over = {}) => ({
  rawNm: 30,
  setName: "SV07: Stellar Crown",
  cardName: "Hydrapple ex - 167/142",
  siblingPrices: [90, 45],
  ...over,
});

// === 1. clean exact-printing tier displays =======================

test("1. a clean modern PSA 10 with real recent sales -> high", () => {
  const c = gradedTierConfidence(tier(), ctx());
  assert.equal(c.level, "high");
  assert.deepEqual(c.reasons, []);
});

test("1b. same tier on a small-but-real sample -> limited (shown with a note)", () => {
  const c = gradedTierConfidence(tier({ saleCount: 4 }), ctx());
  assert.equal(c.level, "limited");
});

// === 2 / 5 / 15. shared-printing identity -> suppressed ==========

test("2. reprint / shared-identity sets are suppressed (provider can't resolve printing)", () => {
  for (const set of [
    "Base Set", "Base Set (Shadowless)", "Jungle", "Fossil", "Team Rocket",
    "Gym Heroes", "Neo Genesis", "Neo Destiny",
    "Base Set 2", "Legendary Collection", "XY - Evolutions",
    "Celebrations: Classic Collection",
  ]) {
    assert.equal(isSharedGradedIdentity(set, "Charizard"), true, set);
    const c = gradedTierConfidence(tier(), ctx({ setName: set }));
    assert.equal(c.level, "low", set);
    assert.ok(c.reasons.includes("printing-identity-unresolvable"), set);
  }
});

test("5. a single-printing modern set is NOT flagged as shared identity", () => {
  for (const set of ["SV07: Stellar Crown", "SWSH12: Silver Tempest", "SM - Team Up", "XY - Flashfire"]) {
    assert.equal(isSharedGradedIdentity(set, "Foo ex"), false, set);
  }
});

test("15. promo / prerelease / staff / winner name-reuse also suppressed", () => {
  assert.equal(gradedTierConfidence(tier(), ctx({ setName: "Black and White Promos", cardName: "Altaria - BW48 (Prerelease)" })).level, "low");
  assert.equal(gradedTierConfidence(tier(), ctx({ cardName: "Rocket's Sneasel - 5 [Winner]" })).reasons.includes("printing-identity-unresolvable"), true);
});

// === 3. collector-number conflict (covered by shared identity) ===

test("3. reused (name, number) across printings resolves via the shared-identity gate", () => {
  // e.g. Pikachu 58/102 exists in Base Set AND Base Set (Shadowless)
  assert.equal(gradedTierConfidence(tier(), ctx({ setName: "Base Set (Shadowless)", cardName: "Pikachu" })).level, "low");
});

// === 4. grader recognition ======================================

test("4. recognized graders pass; unknown grader is suppressed", () => {
  assert.deepEqual([...RECOGNIZED_GRADERS].sort(), ["bgs", "cgc", "psa", "sgc"]);
  for (const g of ["psa10", "bgs9_5", "cgc10", "sgc10"]) {
    assert.notEqual(gradedTierConfidence(tier({ key: g }), ctx()).level, "low", g);
  }
  for (const g of ["ace10", "tag9", "hga10", "gma10"]) {
    const c = gradedTierConfidence(tier({ key: g }), ctx());
    assert.equal(c.level, "low", g);
    assert.ok(c.reasons.includes("unrecognized-grader"), g);
  }
});

// === 6 / 8 (11C-style). genuine inversion retained ==============

test("6. a genuine PSA 9 priced slightly above PSA 10 is retained when BOTH tiers' own evidence is coherent", () => {
  // both judged independently - neither reason fires for "priced above a sibling"
  const psa10 = gradedTierConfidence(tier({ key: "psa10", currentPrice: 180, minPrice: 150, maxPrice: 210 }), ctx({ siblingPrices: [185] }));
  const psa9 = gradedTierConfidence(tier({ key: "psa9", currentPrice: 185, minPrice: 160, maxPrice: 215 }), ctx({ siblingPrices: [180] }));
  assert.equal(psa10.level, "high");
  assert.equal(psa9.level, "high");
  // nothing in the reason set is about monotonicity / ladder order
  assert.ok(!psa9.reasons.some((r) => /ladder|monoton|below-sibling|above/.test(r)));
});

// === 7 / 16. extreme outlier: magnitude alone does NOT suppress ==

test("7. extreme price on a THIN sample with no sibling near it -> suppressed", () => {
  const c = gradedTierConfidence(
    tier({ currentPrice: 5000, minPrice: 5000, maxPrice: 5000, saleCount: 1 }),
    ctx({ rawNm: 7, siblingPrices: [80, 40] })
  );
  assert.equal(c.level, "low");
  assert.ok(c.reasons.includes("extreme-uncorroborated-outlier"));
});

test("16. the SAME extreme ratio with real volume + coherent identity is KEPT (magnitude is not the gate)", () => {
  // PSA 10 Radiant Collection Charizard: ~30x raw, 36 real sales - genuine
  const c = gradedTierConfidence(
    tier({ currentPrice: 1500, minPrice: 1200, maxPrice: 1800, saleCount: 36 }),
    ctx({ rawNm: 50, setName: "Generations: Radiant Collection", cardName: "Charizard", siblingPrices: [99, 47] })
  );
  assert.equal(c.level, "high");
});

test("16b. a small sibling within 3x corroborates an extreme price (kept)", () => {
  const c = gradedTierConfidence(
    tier({ currentPrice: 900, minPrice: 800, maxPrice: 1000, saleCount: 3 }),
    ctx({ rawNm: 15, setName: "SM - Team Up", cardName: "Foo GX (Secret)", siblingPrices: [400] })
  );
  // 900/15 = 60x (extreme) BUT sibling 400 is within 3x of 900 -> corroborated -> not the outlier reason
  assert.ok(!c.reasons.includes("extreme-uncorroborated-outlier"));
});

// === grade-9-10 below raw NM ====================================

test("a PSA/BGS/CGC 9-10 tier priced below raw NM is suppressed (raw/contamination in the bucket)", () => {
  const c = gradedTierConfidence(tier({ key: "psa10", currentPrice: 20 }), ctx({ rawNm: 40, siblingPrices: [] }));
  assert.equal(c.level, "low");
  assert.ok(c.reasons.includes("grade-9-10-below-raw"));
  // a LOWER grade (7/8) below raw is allowed - not flagged for that reason
  const low = gradedTierConfidence(tier({ key: "psa7", currentPrice: 20, saleCount: 12 }), ctx({ rawNm: 40, siblingPrices: [] }));
  assert.ok(!low.reasons.includes("grade-9-10-below-raw"));
});

// === provider low-confidence + stale + spread ===================

test("provider low-confidence, stale, and wide internal spread each suppress", () => {
  assert.ok(gradedTierConfidence(tier({ providerLowConfidence: true }), ctx()).reasons.includes("provider-low-confidence"));
  assert.ok(gradedTierConfidence(tier({ lastSaleDate: new Date(Date.now() - 500 * 86400_000).toISOString() }), ctx()).reasons.includes("stale"));
  assert.ok(gradedTierConfidence(tier({ minPrice: 10, maxPrice: 500 }), ctx()).reasons.includes("wide-internal-spread"));
  assert.ok(gradedTierConfidence(tier({ saleCount: 1 }), ctx()).reasons.includes("insufficient-sales"));
});

// === no fabricated value / no ladder forcing ====================

test("the helper only classifies - it never returns or derives a price", () => {
  const c = gradedTierConfidence(tier(), ctx());
  assert.deepEqual(Object.keys(c).sort(), ["level", "reasons"]);
  assert.equal(typeof c.level, "string");
  const src = stripComments(read("lib/gradedConfidence.js"));
  assert.doesNotMatch(src, /interpolat|\.average|synthesi[sz]e|replacementPrice|estimatedPrice|derivePrice/i);
  // no "fake statistical %" - level is categorical only
  assert.doesNotMatch(src, /confidencePct|score\s*=\s*\d|Math\.round\([^)]*100/);
});

test("getFullPriceAnalysis suppresses low-confidence tiers, never reorders/rewrites prices", () => {
  const src = read("lib/pokemonPriceTracker.js");
  assert.match(src, /gradedTierConfidence\(/);
  assert.match(src, /const graded = gradedScored\.filter\(\(g\) => g\.confidence !== "low"\)/);
  assert.match(src, /gradedSuppressedCount/);
  // coherentGradedTiers still just sorts by price (existing) - no new ladder-forcing sort
  assert.doesNotMatch(stripComments(src), /forceMonoton|clampToLadder|reorderTiers/i);
});

// === raw price untouched (Phase 11B/11C not regressed) ==========

test("raw price + history + trend logic are untouched", () => {
  const ppt = read("lib/pokemonPriceTracker.js");
  const rawBlock = ppt.slice(ppt.indexOf("raw: {"), ppt.indexOf("raw: {") + 220);
  assert.match(rawBlock, /currentPrice: catalogRawMarketPrice\(d\.prices\)/); // unchanged
  assert.doesNotMatch(read("lib/priceHistory.js"), /graded|gradedTierConfidence|slab/i);
});

// === graded live-listing semantics: grade-matched reference =====

test("a graded deal is priced against its OWN grade bucket, never a different grade/grader", () => {
  const ppt = read("lib/pokemonPriceTracker.js");
  // getGradedPrice keys the lookup on the deal's exact grader+grade
  assert.match(ppt, /const key = gradeKey\(grader, grade\)/);
  assert.match(ppt, /d\?\.ebay\?\.salesByGrade\?\.\[key\]/);
  // and it fails closed on a low-confidence bucket
  assert.match(ppt, /if \(conf\.level === "low"\) return null/);
  const refresh = read("app/api/refresh-deals/route.js");
  assert.match(refresh, /getGradedPrice\(row\.justtcg_tcgplayer_id, grading\.grader, grading\.grade/);
});

// === currency invariance =======================================

test("classification is currency-invariant (ratios + counts, not absolute money)", () => {
  const t = tier({ currentPrice: 5000, saleCount: 1, minPrice: 5000, maxPrice: 5000 });
  const c1 = gradedTierConfidence(t, ctx({ rawNm: 7, siblingPrices: [80, 40] }));
  const k = 1.3743;
  const c2 = gradedTierConfidence(
    { ...t, currentPrice: 5000 * k, minPrice: 5000 * k, maxPrice: 5000 * k },
    ctx({ rawNm: 7 * k, siblingPrices: [80 * k, 40 * k] })
  );
  assert.equal(c1.level, c2.level);
  assert.deepEqual(c1.reasons.sort(), c2.reasons.sort());
});

// === UX wording ================================================

test("card page uses restrained wording, never a synthesized price for weak tiers", () => {
  const cps = read("components/CardPriceSummary.js");
  assert.match(cps, /enough reliable recent sales/);
  assert.match(cps, /Limited recent sales/);
  assert.doesNotMatch(cps, /AI estimate|our guess|expected PSA|estimated \$|\$0\.00/);
  const vpg = read("components/VariantPriceGrid.js");
  assert.match(vpg, /limited data/);
});

// === structured data / SEO =====================================

test("no graded price is exposed as an Offer / AggregateOffer; no new route", () => {
  const page = read("app/cards/[slug]/page.js");
  const jsonLd = page.slice(page.indexOf("productJsonLd"), page.indexOf("breadcrumbJsonLd"));
  assert.match(jsonLd, /offers: allOffers\.map/); // live listings only
  assert.doesNotMatch(jsonLd, /analysis\.graded|gradedPrice|psa10|AggregateOffer/i);
  for (const p of ["app/psa-10", "app/graded", "app/card/psa-9", "app/graders", "app/cards/[slug]/psa-10"]) {
    assert.equal(existsSync(join(ROOT, p)), false, p);
  }
  assert.doesNotMatch(read("lib/sitemap.js"), /\/psa-|\/graded\/|\bgraded-cards\b|\/grader-|psa-10\//i);
});

// === thresholds are explicit constants =========================

test("gate thresholds are documented constants", () => {
  assert.equal(GRADED_CONFIDENCE.minSales, 3);
  assert.equal(GRADED_CONFIDENCE.highSales, 8);
  assert.equal(GRADED_CONFIDENCE.extremeVsRaw, 40);
  assert.equal(GRADED_CONFIDENCE.maxStaleDays, 365);
});
