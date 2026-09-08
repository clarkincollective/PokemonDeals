// Phase SOCIAL-CREATIVE-3C - VISUAL-REVIEW CONSENSUS POLICY (SS4, SS5,
// SS17-SS20).
//
// SOCIAL-CREATIVE-3B showed the 5-sample WORST-CASE rule is too sensitive
// to reviewer nondeterminism: identical deal_hero artifacts flipped
// 44%<->73% worst-case PASS between two runs with no recurring craft
// defect, and the WATCH artifacts scored identically to the PASS ones on
// every rubric dimension. Worst-case turns a single stray WATCH (pure
// model noise) into a HOLD.
//
// This policy separates real visual weakness from model randomness by
// asking for a MAJORITY of independent PASS verdicts plus a rubric-score
// floor - and it NEVER lets consensus override a FAIL (SS5).
//
// Lives in lib/newsroom/ (not lib/social/) like visualReview.mjs - only
// scripts/ tooling and the newsroom QA path import it.

import { reviewRenderedCreative, RUBRIC_KEYS } from "./visualReview.mjs";

// Bump when the rule below changes. Persisted with every consensus row so
// a historical decision stays explainable (SS18); old rows are NOT
// silently reinterpreted.
export const VISUAL_REVIEW_POLICY_VERSION = "3c.1";

// The hobby-native core dimensions the score floor is computed over
// (SS4 option C). AI_SPAM_RISK is a separate ceiling.
export const CONSENSUS_CORE_DIMS = Object.freeze([
  "COLLECTIBLE_VISUAL_APPEAL", "CARD_ART_USAGE", "DATA_VISUAL_IMPACT",
  "SCROLL_STOP_STRENGTH", "HOBBY_NATIVE_FEEL", "THUMBNAIL_STORY_CLARITY",
  "PREMIUM_FEEL",
]);

export const CONSENSUS_RULE = Object.freeze({
  min_reviews: 3,
  max_reviews: 5,
  pass_majority: 4,      // of max_reviews: >=4 PASS
  core_score_floor: 76,  // mean of CONSENSUS_CORE_DIMS across all reviews
  ai_spam_ceiling: 45,   // mean AI_SPAM_RISK across all reviews
});

function meanCore(scoreRuns) {
  const runs = scoreRuns.filter(Boolean);
  if (!runs.length) return { core: null, spam: null };
  const perDim = CONSENSUS_CORE_DIMS.map((k) => {
    const v = runs.map((s) => Number(s[k])).filter(Number.isFinite);
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
  }).filter((n) => n != null);
  const spamVals = runs.map((s) => Number(s.AI_SPAM_RISK)).filter(Number.isFinite);
  return {
    core: perDim.length ? Math.round((perDim.reduce((a, b) => a + b, 0) / perDim.length) * 10) / 10 : null,
    spam: spamVals.length ? Math.round((spamVals.reduce((a, b) => a + b, 0) / spamVals.length) * 10) / 10 : null,
  };
}

// PURE - given the verdicts + score objects from N independent reviews,
// return the consensus decision. Used by the staged runner and directly
// by tests. Never returns PASS if any verdict is FAIL.
export function consensusFromReviews(runs, { rule = CONSENSUS_RULE } = {}) {
  const verdicts = runs.map((r) => (typeof r === "string" ? r : r.verdict));
  const scoreRuns = runs.map((r) => (typeof r === "string" ? null : r.scores));
  const pass = verdicts.filter((v) => v === "PASS").length;
  const watch = verdicts.filter((v) => v === "WATCH").length;
  const fail = verdicts.filter((v) => v === "FAIL").length;
  const { core, spam } = meanCore(scoreRuns);

  const reasons = [];
  if (fail > 0) reasons.push(`${fail} Layer-5 FAIL (hard block - consensus never overrides FAIL)`);
  // scale the majority requirement to however many reviews we actually ran
  const need = verdicts.length >= rule.max_reviews ? rule.pass_majority : Math.max(rule.min_reviews, Math.ceil(verdicts.length * 0.8));
  if (fail === 0 && pass < need) reasons.push(`${pass}/${verdicts.length} PASS (< ${need} required)`);
  if (fail === 0 && core != null && core < rule.core_score_floor) reasons.push(`core score ${core} < ${rule.core_score_floor}`);
  if (fail === 0 && spam != null && spam > rule.ai_spam_ceiling) reasons.push(`AI-spam ${spam} > ${rule.ai_spam_ceiling}`);

  const result = fail > 0 ? "BLOCKED" : reasons.length === 0 ? "PASS" : "HELD";
  return {
    result,
    policy_version: VISUAL_REVIEW_POLICY_VERSION,
    review_count: verdicts.length,
    pass_count: pass, watch_count: watch, fail_count: fail,
    verdicts,
    core_score: core, ai_spam: spam,
    reasons,
  };
}

// STAGED runner (SS20): deterministic gates run FIRST (caller's job);
// then review 1..3; stop early on a unanimous PASS or an all-WATCH weak
// batch; otherwise expand to 5, then apply consensusFromReviews. Any FAIL
// at any point -> BLOCKED immediately.
export async function reviewConsensus(image, context = {}, { rule = CONSENSUS_RULE, env = process.env, fetchImpl = fetch, maxReviews = null } = {}) {
  const cap = Math.max(rule.min_reviews, Math.min(rule.max_reviews, maxReviews ?? rule.max_reviews));
  const runs = [];
  const call = () => reviewRenderedCreative(image, context, { env, fetchImpl, noCache: true });

  for (let i = 0; i < rule.min_reviews; i++) {
    // eslint-disable-next-line no-await-in-loop
    const r = await call();
    runs.push(r);
    if (r.verdict === "FAIL") {
      return { ...consensusFromReviews(runs, { rule }), staged: true, calls: runs.length, stopped_early: "FAIL" };
    }
  }
  const passSoFar = runs.filter((r) => r.verdict === "PASS").length;
  const stage1 = consensusFromReviews(runs, { rule });
  // unanimous strong PASS after 3 -> accept (saves 2 calls)
  if (passSoFar === runs.length && stage1.result === "PASS") {
    return { ...stage1, staged: true, calls: runs.length, stopped_early: "UNANIMOUS_PASS" };
  }
  // zero PASS after 3 and a weak core -> clearly not model noise, hold now
  if (passSoFar === 0 && (stage1.core_score == null || stage1.core_score < rule.core_score_floor)) {
    return { ...stage1, staged: true, calls: runs.length, stopped_early: "ALL_WATCH_WEAK" };
  }
  // borderline -> expand to the cap
  while (runs.length < cap) {
    // eslint-disable-next-line no-await-in-loop
    const r = await call();
    runs.push(r);
    if (r.verdict === "FAIL") {
      return { ...consensusFromReviews(runs, { rule }), staged: true, calls: runs.length, stopped_early: "FAIL" };
    }
  }
  return { ...consensusFromReviews(runs, { rule }), staged: true, calls: runs.length, stopped_early: null };
}

export { RUBRIC_KEYS };
