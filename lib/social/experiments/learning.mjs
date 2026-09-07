// Phase 13E.10A - LEARNING STATES + WINNER SELECTION (§11, §14, §15).
//
// Conservative. Three posts never prove a winner. No auto-promotion - the
// evaluator is READ-ONLY and a human decides.

import { compareVariants } from "./score.mjs";

export const LEARNING_STATES = Object.freeze([
  "INSUFFICIENT_DATA",
  "EARLY_SIGNAL",
  "PROMISING",
  "WINNER_CANDIDATE",
  "NO_CLEAR_WINNER",
]);

// minimum PUBLISHED placements per variant for each state (§11).
export const MIN_PLACEMENTS = Object.freeze({
  EARLY_SIGNAL: 10,
  PROMISING: 20,
  WINNER_CANDIDATE: 40,
});

// state from the smaller variant's placement count + whether the effect
// is meaningful + whether it is consistent across the reporting windows.
//   nA, nB     - PUBLISHED placement counts per variant
//   cmp        - compareVariants() result on the overall score
//   consistent - true when the 24h and 7d windows agree on direction
export function learningState({ nA = 0, nB = 0, cmp = null, consistent = false } = {}) {
  const n = Math.min(Number(nA) || 0, Number(nB) || 0);
  if (n < MIN_PLACEMENTS.EARLY_SIGNAL) return "INSUFFICIENT_DATA";
  if (n < MIN_PLACEMENTS.PROMISING) return "EARLY_SIGNAL";
  if (!cmp || !cmp.meaningful) return "NO_CLEAR_WINNER";
  if (n < MIN_PLACEMENTS.WINNER_CANDIDATE) return "PROMISING";
  return consistent ? "WINNER_CANDIDATE" : "NO_CLEAR_WINNER";
}

// The current leader shown in the report. Only ever names a variant at
// PROMISING or better with a meaningful effect; otherwise NO_CLEAR_WINNER
// (or "n/a" while there is not enough data to say anything).
export function currentLeader(state, cmp) {
  if (state === "INSUFFICIENT_DATA" || state === "EARLY_SIGNAL") return "n/a";
  if ((state === "PROMISING" || state === "WINNER_CANDIDATE") && cmp?.leader) return cmp.leader;
  return "NO_CLEAR_WINNER";
}

// §15 - exploration policy. DESIGN ONLY. Even with a WINNER_CANDIDATE the
// planner never routes 100% through one variant, and it is not enabled as
// autonomous behaviour in this phase.
export const EXPLOITATION_POLICY = Object.freeze({
  winner_share: 0.75, // 70-80% winner
  explore_share: 0.25, // 20-30% still testing
  enabled: false,
  note: "design-only; human approval required; no auto-promotion from the evaluator",
});

// Convenience: full evaluation of one experiment from per-variant
// aggregates. `agg` = { A: {n, score, score24, score7}, B: {...} }.
export function evaluateExperiment(agg = {}) {
  const A = agg.A ?? {};
  const B = agg.B ?? {};
  const cmp = compareVariants(A.score ?? null, B.score ?? null);
  const cmp24 = compareVariants(A.score24 ?? null, B.score24 ?? null);
  const cmp7 = compareVariants(A.score7 ?? null, B.score7 ?? null);
  const consistent = Boolean(cmp24.leader && cmp7.leader && cmp24.leader === cmp7.leader);
  const state = learningState({ nA: A.n ?? 0, nB: B.n ?? 0, cmp, consistent });
  return { state, leader: currentLeader(state, cmp), cmp, consistent };
}
