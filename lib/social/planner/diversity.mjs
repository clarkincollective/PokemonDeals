// Phase 13E.8A - DIVERSITY GUARDS + REPETITION WINDOWS (§6, §7).
//
// Prevents "Charizard, Pikachu, Charizard, Pikachu" all day. Two kinds of
// guard:
//   HARD  - never overridable: the exact same stored deal, and the same
//           canonical card printing inside a strong window. These reuse
//           lib/social/cooldown.COOLDOWN_WINDOW_HOURS so the planner and
//           the existing daily flow agree.
//   SOFT  - species / set / family / goal / hook. A soft penalty on the
//           candidate score, NOT an exclusion. A genuinely exceptional
//           deal (raw score >= EXCEPTIONAL_OVERRIDE_SCORE) overrides the
//           soft penalties (never the hard guards).
//
// Pure. `history` is the local post-history array
// ([{ key, postedAt, contentType, family?, goal?, species?, set?, hook? }]).

// §7 repetition windows, in hours. The card/species/set values mirror
// lib/social/cooldown.COOLDOWN_WINDOW_HOURS exactly.
export const REPETITION_WINDOWS_HOURS = Object.freeze({
  exact_deal: Infinity, // same stored deal id: never repeat (HARD)
  card: 14 * 24, // same canonical printing: 14 days (HARD)
  species: 3 * 24, // same Pokemon: 3 days (SOFT)
  set: 7 * 24, // same set: 7 days (SOFT)
  family: 18, // same creative family: cadence-dependent, ~within a day (SOFT)
  goal: 12, // same content goal back-to-back (SOFT)
  hook: 24, // same hook variant: 1 day (SOFT)
});

// how much each SOFT dimension subtracts from a candidate's 0..1 score
// per recent occurrence (capped inside diversityPenalty).
export const DIVERSITY_PENALTY = Object.freeze({
  species: 0.1,
  set: 0.06,
  family: 0.06,
  goal: 0.04,
  hook: 0.04,
});

// a candidate whose RAW (pre-penalty) score is at or above this is
// "exceptional" - the soft penalties are waived for it (§6). The hard
// guards still apply.
export const EXCEPTIONAL_OVERRIDE_SCORE = 0.82;

const HRS = 3_600_000;

// keys: { deal_id, card, species, set, family, goal, hook } (any may be null)
export function diversityKeys(cand) {
  return {
    deal_id: cand?.deal_id != null ? `deal:${cand.deal_id}` : null,
    card: cand?.card_name ? `card:${cand.card_name}|${cand.card_set ?? ""}` : null,
    species: cand?.species ? `species:${String(cand.species).toLowerCase()}` : null,
    set: cand?.card_set ? `set:${cand.card_set}` : null,
    family: cand?.family ? `family:${cand.family}` : null,
    goal: cand?.goal ? `goal:${cand.goal}` : null,
    hook: cand?.hook_variant ? `hook:${cand.hook_variant}` : null,
  };
}

function countRecent(history, matchKey, windowHours, now) {
  if (!matchKey) return 0;
  if (windowHours === Infinity) return history.filter((h) => h.key === matchKey).length;
  const cutoff = now - windowHours * HRS;
  return history.filter((h) => h.key === matchKey && Date.parse(h.postedAt) >= cutoff).length;
}

// HARD guard check. Returns { blocked, reason }.
export function hardGuard(cand, history = [], now = Date.now()) {
  const k = diversityKeys(cand);
  if (k.deal_id && history.some((h) => h.key === k.deal_id)) {
    return { blocked: true, reason: "this exact deal has already been posted" };
  }
  if (countRecent(history, k.card, REPETITION_WINDOWS_HOURS.card, now) > 0) {
    return { blocked: true, reason: `this exact card printing was posted within ${REPETITION_WINDOWS_HOURS.card / 24} days` };
  }
  return { blocked: false, reason: null };
}

// SOFT penalty. Returns { total, byDimension } where total is the
// summed penalty to subtract from a 0..1 score (clamped to <= 0.30 so a
// pile-up can never fully bury an otherwise strong candidate).
export function diversityPenalty(cand, history = [], now = Date.now()) {
  const k = diversityKeys(cand);
  const byDimension = {};
  let total = 0;
  for (const dim of ["species", "set", "family", "goal", "hook"]) {
    const n = countRecent(history, k[dim], REPETITION_WINDOWS_HOURS[dim], now);
    const pen = n > 0 ? DIVERSITY_PENALTY[dim] * Math.min(n, 3) : 0;
    byDimension[dim] = { recent: n, penalty: Number(pen.toFixed(3)) };
    total += pen;
  }
  return { total: Number(Math.min(total, 0.3).toFixed(3)), byDimension };
}

// Apply the soft penalty, honouring the exceptional override.
//   rawScore   - the candidate's pre-diversity 0..1 score
// Returns { adjusted, penaltyApplied, overridden, byDimension }.
export function applyDiversity(cand, rawScore, history = [], now = Date.now()) {
  const { total, byDimension } = diversityPenalty(cand, history, now);
  const overridden = rawScore >= EXCEPTIONAL_OVERRIDE_SCORE && total > 0;
  const penaltyApplied = overridden ? 0 : total;
  return {
    adjusted: Number(Math.max(0, rawScore - penaltyApplied).toFixed(3)),
    penaltyApplied,
    overridden,
    byDimension,
  };
}
