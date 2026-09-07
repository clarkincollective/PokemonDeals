// Phase SOCIAL-NEWSROOM-1 - EDITORIAL PILLARS (§5, §13).
//
// A PILLAR is the top-level editorial category. SERIES live inside pillars
// (see series.mjs). Nothing here is a quota - the planner posts nothing if
// no qualifying story exists (mirrors lib/social/planner cadence ceilings).
//
// Pure data + tiny helpers. No I/O.

export const PILLARS = Object.freeze([
  "DEALS",
  "COMPARISON",
  "MARKET",
  "BUDGET",
  "EDUCATION",
  "BEHIND_THE_FINDER",
  "STORY",
  "BRAND",
]);

// Each pillar's dominant editorial INTENT, mapped onto the existing five
// content goals (lib/social/planner/families.CONTENT_GOALS) so the newsroom
// never introduces a second goal vocabulary.
export const PILLAR_GOAL = Object.freeze({
  DEALS: "CONVERSION",
  COMPARISON: "ENGAGEMENT",
  MARKET: "TRUST",
  BUDGET: "CONVERSION",
  EDUCATION: "TRUST",
  BEHIND_THE_FINDER: "TRUST",
  STORY: "ENGAGEMENT",
  BRAND: "BRAND",
});

// §13 - weekly editorial BALANCE bands, by the four operator-facing
// buckets. Planning bands, NOT rigid targets. A calendar outside a band
// raises a WATCH, never a hard block.
export const EDITORIAL_BALANCE = Object.freeze({
  CONVERSION: [0.35, 0.4], // DEALS + BUDGET
  ORGANIC_GROWTH: [0.25, 0.3], // COMPARISON + STORY
  AUTHORITY: [0.2, 0.25], // MARKET + EDUCATION + BEHIND_THE_FINDER
  BRAND: [0.05, 0.1], // BRAND
});

// pillar -> which operator balance bucket it counts toward.
export const PILLAR_BUCKET = Object.freeze({
  DEALS: "CONVERSION",
  BUDGET: "CONVERSION",
  COMPARISON: "ORGANIC_GROWTH",
  STORY: "ORGANIC_GROWTH",
  MARKET: "AUTHORITY",
  EDUCATION: "AUTHORITY",
  BEHIND_THE_FINDER: "AUTHORITY",
  BRAND: "BRAND",
});

export function isPillar(x) {
  return PILLARS.includes(String(x || "").toUpperCase());
}

export function bucketFor(pillar) {
  return PILLAR_BUCKET[String(pillar || "").toUpperCase()] ?? null;
}

// Given { <bucket>: count }, return per-bucket { count, share, band,
// status: 'under'|'ok'|'over'|'n/a' }. Deterministic.
export function balanceCheck(bucketCounts = {}, total = null) {
  const t = total ?? Object.values(bucketCounts).reduce((a, b) => a + b, 0);
  const out = {};
  for (const [bucket, band] of Object.entries(EDITORIAL_BALANCE)) {
    const count = bucketCounts[bucket] ?? 0;
    const share = t > 0 ? count / t : 0;
    let status = "n/a";
    if (t > 0) status = share < band[0] - 1e-9 ? "under" : share > band[1] + 1e-9 ? "over" : "ok";
    out[bucket] = { count, share: Number(share.toFixed(3)), band, status };
  }
  return { total: t, byBucket: out };
}
