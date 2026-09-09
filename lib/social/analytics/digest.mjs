// Phase SOCIAL-ANALYTICS-1 §28/§29 - DAILY ANALYTICS DIGEST + DASHBOARD DATA.

import { familyPerformance, hookPerformance, keywordPerformance, hashtagPerformance, audiencePerformance, timeOfDayPerformance, captionStylePerformance } from "./summaries.mjs";
import { deriveLearningSignals } from "./learning.mjs";
import { confidenceStateFor } from "./core.mjs";

function topByMedianVolume(groupSummaries, n = 1) {
  return Object.entries(groupSummaries)
    .filter(([, s]) => s.sample_size > 0 && s.reach_or_views?.median != null)
    .sort((a, b) => b[1].reach_or_views.median - a[1].reach_or_views.median)
    .slice(0, n)
    .map(([key, s]) => ({ key, median_volume: s.reach_or_views.median, sample_size: s.sample_size, confidence_state: s.confidence_state }));
}

/**
 * buildAnalyticsDigest(records) -> a human-readable-shaped summary
 * object (§28). `records` = joinManyToStory()'s output. Never hides a
 * small-sample warning - every "top" line carries its own N.
 */
export function buildAnalyticsDigest(records) {
  const published = records.filter((r) => r.published_at);
  const family = familyPerformance(records);
  const hook = hookPerformance(records);
  const overallMedianByPlatform = {};
  for (const [key, s] of Object.entries(family)) {
    const [, platform] = key.split("::");
    if (!overallMedianByPlatform[platform]) overallMedianByPlatform[platform] = [];
    if (s.reach_or_views?.median != null) overallMedianByPlatform[platform].push(s.reach_or_views.median);
  }
  const medianOf = (arr) => (arr.length ? arr.sort((a, b) => a - b)[Math.floor(arr.length / 2)] : null);
  const platformMedians = Object.fromEntries(Object.entries(overallMedianByPlatform).map(([p, arr]) => [p, medianOf(arr)]));

  const learning = deriveLearningSignals(family, { overallMedianByPlatform: platformMedians });

  return {
    posts_published: published.length,
    posts_total_observed: records.length,
    total_reach_or_views: published.reduce((a, r) => a + (r.metrics?.reach ?? r.metrics?.views ?? r.metrics?.impressions ?? 0), 0) || (published.length ? "MIXED_BASIS" : null),
    top_story: topByMedianVolume(family, 1)[0] ?? "INSUFFICIENT_DATA",
    top_family: topByMedianVolume(family, 1)[0]?.key ?? "INSUFFICIENT_DATA",
    top_hook: topByMedianVolume(hook, 1)[0]?.key ?? "INSUFFICIENT_DATA",
    top_platform: Object.entries(platformMedians).sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0))[0]?.[0] ?? "INSUFFICIENT_DATA",
    current_learning_signals: learning.length ? learning : "INSUFFICIENT_DATA - fewer than 5 comparable posts in every dimension so far",
    generated_at: new Date().toISOString(),
  };
}

/** buildDashboardData(records) -> §29's suggested machine-readable object set. */
export function buildDashboardData(records) {
  return {
    platform_health: [...new Set(records.map((r) => r.platform))].map((p) => ({ platform: p, sample_size: records.filter((r) => r.platform === p).length })),
    recent_posts: records.slice(0, 20).map((r) => ({ placement_id: r.placement_id, platform: r.platform, story_family: r.story_family, published_at: r.published_at, confidence_state: confidenceStateFor(1) })),
    top_posts: records.filter((r) => r.metrics?.reach != null || r.metrics?.views != null).sort((a, b) => (b.metrics?.reach ?? b.metrics?.views ?? 0) - (a.metrics?.reach ?? a.metrics?.views ?? 0)).slice(0, 10),
    family_performance: familyPerformance(records),
    hook_performance: hookPerformance(records),
    keyword_performance: keywordPerformance(records),
    hashtag_usage: hashtagPerformance(records),
    audience_performance: audiencePerformance(records),
    posting_time_performance: timeOfDayPerformance(records),
    caption_style_performance: captionStylePerformance(records),
  };
}
