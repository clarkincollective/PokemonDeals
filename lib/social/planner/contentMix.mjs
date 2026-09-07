// Phase 13E.8A - WEEKLY CONTENT MIX (§4).
//
// Ranges, not rigid counts. The feed must NOT be 100% "here is another
// discounted card": Deal Drops lead but Market Movers, hooks, and data
// each hold a real share. Derived from the four families + their goals.

// target share of a week's placements, BY CONTENT GOAL, as [lo, hi] fractions.
export const WEEKLY_GOAL_MIX = Object.freeze({
  CONVERSION: [0.3, 0.45], // Deal Drops (default goal) + Brand Ad(conversion)
  REACH: [0.15, 0.3], // Deal Drop(reach) + Hook Carousel(reach)
  ENGAGEMENT: [0.15, 0.3], // Market Mover(default) + Hook Carousel(engagement)
  TRUST: [0.05, 0.15], // Market Mover(trust) / data pieces
  BRAND: [0.02, 0.08], // Brand Ad - rare (§11)
});

// the same intent expressed BY FAMILY, for the operator summary.
export const WEEKLY_FAMILY_MIX = Object.freeze({
  deal_drop: [0.35, 0.45],
  market_mover: [0.2, 0.3],
  hook_carousel: [0.15, 0.25],
  brand_ad: [0.02, 0.08],
});

function shareStatus(actual, [lo, hi]) {
  if (actual < lo - 1e-9) return "under";
  if (actual > hi + 1e-9) return "over";
  return "ok";
}

// counts: { <key>: <n> }. total defaults to the sum. Returns per-key
// { count, share, target:[lo,hi], status }.
export function mixCheck(counts, targets, total = null) {
  const t = total ?? Object.values(counts).reduce((a, b) => a + b, 0);
  const out = {};
  for (const key of Object.keys(targets)) {
    const count = counts[key] ?? 0;
    const share = t > 0 ? count / t : 0;
    out[key] = { count, share: Number(share.toFixed(3)), target: targets[key], status: t > 0 ? shareStatus(share, targets[key]) : "n/a" };
  }
  return { total: t, byKey: out };
}

export function goalMixCheck(goalCounts, total = null) {
  return mixCheck(goalCounts, WEEKLY_GOAL_MIX, total);
}
export function familyMixCheck(familyCounts, total = null) {
  return mixCheck(familyCounts, WEEKLY_FAMILY_MIX, total);
}

// §19 - exploration vs exploitation. DESIGN ONLY: the planner reserves a
// share of weekly weight for un-proven hooks/families/windows so it does
// not over-fit one winning format. Not enabled as autonomous
// experimentation - it only tilts scoring once perf data exists.
export const EXPLORATION_RESERVE = Object.freeze({
  exploit_share: 0.8, // proven / high-score
  explore_share: 0.2, // new hooks / families / windows
  note: "design-only; performance data influences SCORE only (§18) and human approval is always required",
});
