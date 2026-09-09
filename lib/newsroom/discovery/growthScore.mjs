// Phase SOCIAL-DISCOVERY-1 SS24 - GROWTH-POTENTIAL SCORING (candidate
// ranking only - never presented as a guarantee, per the phase's own
// explicit instruction).

/**
 * growthPotentialScore({ hookScore, keywordTotal, hashtagScore, onScreenVerdict, audienceCount }) -> 0-100
 * Factors: hook_strength, topic_interest, specificity, novelty,
 * audience_fit, search_alignment, share_value, save_value, reply_value,
 * visual_alignment, platform_fit - combined additively and clamped.
 */
export function growthPotentialScore({ hookScore = 0, keywordTotal = 0, hashtagScore = 0, onScreenVerdict = "PASS", audienceCount = 1, hasEntity = false } = {}) {
  const hook_strength = Math.min(20, hookScore * 2);
  const topic_interest = keywordTotal > 40 ? 15 : keywordTotal > 20 ? 10 : 5;
  const specificity = hasEntity ? 10 : 5;
  const novelty = 8; // deterministic baseline - no historical-performance data source exists yet
  const audience_fit = Math.min(10, audienceCount * 4);
  const search_alignment = keywordTotal > 30 ? 10 : 5;
  const share_value = hookScore >= 7 ? 8 : 4;
  const save_value = topic_interest >= 10 ? 7 : 3;
  const reply_value = 5;
  const visual_alignment = onScreenVerdict === "PASS" ? 10 : onScreenVerdict === "WARN" ? 5 : 0;
  const platform_fit = Math.min(7, hashtagScore > 0 ? 7 : 3);

  const raw = hook_strength + topic_interest + specificity + novelty + audience_fit + search_alignment + share_value + save_value + reply_value + visual_alignment + platform_fit;
  return {
    score: Math.max(0, Math.min(100, Math.round(raw))),
    dims: { hook_strength, topic_interest, specificity, novelty, audience_fit, search_alignment, share_value, save_value, reply_value, visual_alignment, platform_fit },
    note: "candidate-ranking heuristic only - never a virality guarantee",
  };
}
