// getFullPriceAnalysis' graded-tier coherence filter (lib/pokemonPriceTracker
// coherentGradedTiers). The provider's per-grade eBay sold buckets are keyed
// on card name + collector number, which reprint families share, so a bucket
// blends printings worth wildly different amounts. Live failure: "Here Comes
// Team Rocket! (15)" (WOTC Team Rocket Holo, raw ~$27) came back with
// BGS 9 $181 / BGS 9.5 $150 / TAG 8.5 $107 / CGC 9 $89 while its own PSA 10
// sat at $59.50 - impossible in a clean market. The filter drops a
// LOW-CONFIDENCE tier that is internally incoherent (huge own spread) or
// out of scale with the top standard grade / the raw reference; a
// provider-confident tier is always trusted (a genuinely scarce card's
// steep-but-real graded ladder must survive).
//
// Keyed on the CHARACTERISTIC (incoherent low-confidence tier vs a clean
// anchor), never on a card name or tcgplayer id.

import { test } from "node:test";
import assert from "node:assert/strict";
import { coherentGradedTiers } from "../../lib/pokemonPriceTracker.js";

const tier = (key, currentPrice, over = {}) => ({
  key,
  label: key.toUpperCase(),
  currentPrice,
  minPrice: over.minPrice ?? currentPrice,
  maxPrice: over.maxPrice ?? currentPrice,
  saleCount: over.saleCount ?? 3,
  isLowConfidence: over.isLowConfidence ?? false,
  ...over,
});

// The 86073 shape: a clean, confident PSA 10 anchor + several
// low-confidence tiers priced far above it (cross-printing blend).
const contaminated = [
  tier("psa10", 59.5, { saleCount: 225, isLowConfidence: false, minPrice: 19, maxPrice: 533.63 }),
  tier("psa8", 62.34, { saleCount: 92, isLowConfidence: false, minPrice: 9.16, maxPrice: 142.27 }),
  tier("bgs9", 181.25, { saleCount: 7, isLowConfidence: true, minPrice: 59.99, maxPrice: 250 }),
  tier("bgs9_5", 150, { saleCount: 2, isLowConfidence: true, minPrice: 15, maxPrice: 150 }),
  tier("tag8_5", 107, { saleCount: 3, isLowConfidence: true, minPrice: 100, maxPrice: 129 }),
  tier("cgc9", 89.47, { saleCount: 28, isLowConfidence: true, minPrice: 8.99, maxPrice: 140.74 }),
  tier("psa9", 85, { saleCount: 157, isLowConfidence: true, minPrice: 0.99, maxPrice: 226.55 }),
  tier("cgc10", 38.5, { saleCount: 33, isLowConfidence: false, minPrice: 10.5, maxPrice: 126.5 }),
];

test("contaminated blend: every low-confidence tier priced well above the clean PSA 10 anchor is dropped", () => {
  const out = coherentGradedTiers(contaminated, 27.17);
  const keys = out.map((t) => t.key);
  for (const gone of ["bgs9", "bgs9_5", "tag8_5", "cgc9", "psa9"]) {
    assert.ok(!keys.includes(gone), `${gone} must be dropped`);
  }
  // the confident tiers survive untouched
  for (const kept of ["psa10", "psa8", "cgc10"]) assert.ok(keys.includes(kept), `${kept} must survive`);
});

test("grade inversion (BGS 9.5 priced below BGS 9) cannot both survive", () => {
  const out = coherentGradedTiers(contaminated, 27.17).map((t) => t.key);
  assert.ok(!(out.includes("bgs9") && out.includes("bgs9_5")));
});

test("no anchor present: falls back to the raw NM reference ceiling", () => {
  const noAnchor = [
    tier("cgc9", 300, { isLowConfidence: true, minPrice: 250, maxPrice: 350 }), // 11x a $27 raw
    tier("cgc8", 60, { isLowConfidence: true, minPrice: 40, maxPrice: 80 }),
  ];
  const out = coherentGradedTiers(noAnchor, 27.17).map((t) => t.key);
  assert.deepEqual(out, ["cgc8"]);
});

test("genuinely scarce card: a CONFIDENT steep graded ladder is never touched", () => {
  // EX Team Rocket Returns SR shape - raw ~$400, PSA 8 confident at $320,
  // and a real PSA 10 many multiples higher. Nothing here is dropped.
  const scarce = [
    tier("psa10", 2740, { isLowConfidence: true, saleCount: 5, minPrice: 2348, maxPrice: 3285 }),
    tier("psa9", 475, { isLowConfidence: true, minPrice: 308, maxPrice: 800 }),
    tier("psa8", 320, { isLowConfidence: false, saleCount: 8, minPrice: 290, maxPrice: 695 }),
  ];
  const out = coherentGradedTiers(scarce, 400).map((t) => t.key);
  assert.deepEqual(out.sort(), ["psa10", "psa8", "psa9"]);
});

test("a low-confidence tier consistent with the anchor is kept", () => {
  const ok = [
    tier("psa10", 60, { isLowConfidence: false, saleCount: 200 }),
    tier("psa9", 55, { isLowConfidence: true, minPrice: 40, maxPrice: 80 }),
    tier("psa8", 48, { isLowConfidence: true, minPrice: 35, maxPrice: 65 }),
  ];
  const out = coherentGradedTiers(ok, 30).map((t) => t.key);
  assert.deepEqual(out.sort(), ["psa10", "psa8", "psa9"]);
});

test("output stays sorted by price desc and drops zero/absent prices", () => {
  const out = coherentGradedTiers(
    [tier("psa8", 48), tier("psa10", 60), tier("psa9", 0), tier("cgc9", null)],
    30
  );
  assert.deepEqual(out.map((t) => t.key), ["psa10", "psa8"]);
});

test("all tiers incoherent -> empty array (graded block simply won't render)", () => {
  const out = coherentGradedTiers(
    [
      tier("bgs9", 400, { isLowConfidence: true, minPrice: 5, maxPrice: 600 }),
      tier("bgs8", 350, { isLowConfidence: true, minPrice: 4, maxPrice: 500 }),
    ],
    20
  );
  assert.deepEqual(out, []);
});
