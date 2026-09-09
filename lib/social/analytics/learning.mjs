// Phase SOCIAL-ANALYTICS-1 §21/§22 - LEARNING SIGNALS (RECOMMEND ONLY).
//
// deriveLearningSignals() PRODUCES recommended_weight_adjustments. It
// NEVER applies them - nothing in this module (or anywhere in this
// phase) writes to storyScoring.mjs, contentCalendar.mjs, or any
// selection/ranking weight. That wiring is an explicit FUTURE decision,
// made by an owner or a later phase, never automatically by this one.

import { confidenceStateFor, isLearningEligible } from "./core.mjs";

const SIGNAL_STATES = Object.freeze(["BOOST_FAMILY", "NEUTRAL", "WATCH", "DOWNWEIGHT_FAMILY", "BOOST_HOOK", "BOOST_TOPIC", "BOOST_AUDIENCE"]);

// A conservative, symmetric, capped adjustment - never a big swing off
// one comparison, and NEVER actually applied anywhere (§22).
function recommendationFor(groupKey, platform, groupSummary, overallMedian) {
  const n = groupSummary.sample_size;
  if (!isLearningEligible(n)) return null; // <5 comparable posts -> no recommendation at all, not even NEUTRAL
  const groupMedian = groupSummary.reach_or_views?.median;
  if (groupMedian == null || overallMedian == null || overallMedian <= 0) return null;
  const ratio = groupMedian / overallMedian;
  const confidence = confidenceStateFor(n);
  // capped at +/-0.05, and only MODERATE_SIGNAL+ (n>=10) ever gets a
  // nonzero magnitude - EARLY_SIGNAL (5-9) is reported as WATCH only.
  let recommendation = "0.00";
  let signal = "NEUTRAL";
  if (confidence === "EARLY_SIGNAL") {
    signal = ratio >= 1.15 ? "WATCH" : ratio <= 0.85 ? "WATCH" : "NEUTRAL";
  } else {
    const magnitude = Math.max(-0.05, Math.min(0.05, (ratio - 1) * 0.10));
    recommendation = (magnitude >= 0 ? "+" : "") + magnitude.toFixed(2);
    signal = magnitude >= 0.02 ? "BOOST_FAMILY" : magnitude <= -0.02 ? "DOWNWEIGHT_FAMILY" : "NEUTRAL";
  }
  return {
    dimension: groupKey, platform, signal, recommendation, confidence,
    evidence_count: n, group_median: groupMedian, comparison_median: overallMedian,
    applied: false, // ALWAYS false - this phase never applies a recommendation
  };
}

/**
 * deriveLearningSignals(familySummaries, { overallMedianByPlatform }) ->
 *   recommended_weight_adjustments[]
 * `familySummaries` = summaries.familyPerformance()'s output (keyed
 * "family::platform"). Never mutates anything - pure derivation.
 */
export function deriveLearningSignals(familySummaries, { overallMedianByPlatform = {} } = {}) {
  const out = [];
  for (const [key, summary] of Object.entries(familySummaries)) {
    const [family, platform] = key.split("::");
    const overallMedian = overallMedianByPlatform[platform] ?? null;
    const rec = recommendationFor(`story_family:${family}`, platform, summary, overallMedian);
    if (rec) out.push(rec);
  }
  return out;
}

/**
 * deriveHookTopicAudienceSignals(hookSummaries, keywordSummaries,
 * audienceSummaries, overallMedianByPlatform) -> more recommendation rows,
 * same discipline, same never-applied guarantee.
 */
export function deriveHookTopicAudienceSignals(hookSummaries, keywordSummaries, audienceSummaries, overallMedianByPlatform = {}) {
  const out = [];
  const addAll = (summaries, prefix, signalName) => {
    for (const [key, summary] of Object.entries(summaries)) {
      const rec = recommendationFor(`${prefix}:${key}`, "all", summary, overallMedianByPlatform.all ?? null);
      if (rec) out.push({ ...rec, signal: rec.signal === "BOOST_FAMILY" ? signalName : rec.signal === "DOWNWEIGHT_FAMILY" ? "WATCH" : rec.signal });
    }
  };
  addAll(hookSummaries, "hook", "BOOST_HOOK");
  addAll(keywordSummaries, "keyword", "BOOST_TOPIC");
  addAll(audienceSummaries, "audience", "BOOST_AUDIENCE");
  return out;
}

export { SIGNAL_STATES };
