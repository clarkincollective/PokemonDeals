// Phase 13E.8A - CONTENT FAMILY <-> GOAL matrix (§1).
//
// Deterministic. Uses the EXISTING four creative families (no new visual
// system) and the existing five content goals. Says which (family, goal)
// combinations are valid; the first goal listed for a family is that
// family's DEFAULT goal (and matches lib/social/creativeSpec.CONTENT_GOAL_FOR).

export const FAMILIES = Object.freeze(["deal_drop", "market_mover", "hook_carousel", "brand_ad"]);

export const CONTENT_GOALS = Object.freeze(["REACH", "ENGAGEMENT", "TRUST", "CONVERSION", "BRAND"]);

// family -> allowed goals, DEFAULT first (§1).
export const FAMILY_GOALS = Object.freeze({
  deal_drop: ["CONVERSION", "REACH"],
  market_mover: ["ENGAGEMENT", "TRUST"],
  hook_carousel: ["REACH", "ENGAGEMENT"],
  brand_ad: ["BRAND", "CONVERSION"],
});

export function isValidCombo(family, goal) {
  return Array.isArray(FAMILY_GOALS[family]) && FAMILY_GOALS[family].includes(goal);
}

export function defaultGoalFor(family) {
  return FAMILY_GOALS[family]?.[0] ?? null;
}

// Every valid (family, goal) pair, as a flat list.
export function validCombos() {
  const out = [];
  for (const f of FAMILIES) for (const g of FAMILY_GOALS[f]) out.push({ family: f, goal: g });
  return out;
}

// Map the older content_type vocabulary onto (family, goal) so a snapshot
// item or a post-history entry can be classified consistently.
const CONTENT_TYPE_TO_FAMILY = Object.freeze({
  deal_of_day: "deal_drop",
  just_found: "deal_drop",
  market_mover: "market_mover",
  best_deals_found_today: "hook_carousel",
  pokemon_spotlight: "hook_carousel",
  set_spotlight: "hook_carousel",
  market_snapshot: "market_mover", // a data/trust piece - planner folds it under market_mover
  brand_ad: "brand_ad",
});

export function familyForContentType(contentType) {
  return CONTENT_TYPE_TO_FAMILY[contentType] ?? null;
}
