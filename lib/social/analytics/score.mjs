// Phase SOCIAL-ANALYTICS-1 §19/§20 - PLATFORM-RELATIVE PERFORMANCE SCORE
// + BASELINE NORMALIZATION.
//
// Never a single "universal raw score" across platforms - Instagram
// weighs shares+saves heavily, X weighs reposts+replies, TikTok weighs
// views+completion+shares, YouTube Shorts weighs views+retention. A score
// is only ever compared within the SAME platform (and, once a baseline
// exists, the same rough post age) - it is never compared across
// platforms as though the numbers meant the same thing.

const PLATFORM_WEIGHTS = Object.freeze({
  instagram: { volume: 0.25, engagement_rate: 0.15, share_rate: 0.25, save_rate: 0.25, click_rate: 0.10 },
  x: { volume: 0.30, engagement_rate: 0.25, share_rate: 0.25, save_rate: 0, click_rate: 0.20 },
  tiktok: { volume: 0.35, engagement_rate: 0.15, share_rate: 0.20, save_rate: 0.05, click_rate: 0, completion_rate: 0.25 },
  youtube_shorts: { volume: 0.35, engagement_rate: 0.15, share_rate: 0.10, save_rate: 0, click_rate: 0, completion_rate: 0.40 },
});

function norm01(value, groupSummary) {
  // relative-to-group-max normalization, so the score has a stable 0-1
  // meaning WITHIN this comparison set only - never an absolute unit.
  if (value == null || groupSummary?.max == null || groupSummary.max <= 0) return null;
  return Math.max(0, Math.min(1, Number(value) / groupSummary.max));
}

/**
 * socialPerformanceScore(record, platformGroupSummaries) -> { score, basis, components }
 * `platformGroupSummaries` is the SAME-platform robustSummary() blocks
 * (from summaries.mjs) this record's metrics should be normalized
 * against - typically "this platform, this story family, all history".
 */
export function socialPerformanceScore(record, platformGroupSummaries = {}) {
  const weights = PLATFORM_WEIGHTS[record.platform] ?? PLATFORM_WEIGHTS.instagram;
  const volume = record.metrics?.reach ?? record.metrics?.views ?? record.metrics?.impressions ?? null;
  const components = {
    volume: { value: volume, normalized: norm01(volume, platformGroupSummaries.reach_or_views) },
    engagement_rate: { value: record.kpis?.engagement_rate?.value ?? null, normalized: norm01(record.kpis?.engagement_rate?.value, platformGroupSummaries.engagement_rate) },
    share_rate: { value: null, normalized: norm01(null, platformGroupSummaries.share_rate) },
    save_rate: { value: null, normalized: norm01(null, platformGroupSummaries.save_rate) },
    click_rate: { value: null, normalized: norm01(null, platformGroupSummaries.click_rate) },
    completion_rate: { value: null, normalized: norm01(null, platformGroupSummaries.completion_rate) },
  };
  let weightedSum = 0, weightUsed = 0;
  for (const [key, w] of Object.entries(weights)) {
    const norm = components[key]?.normalized;
    if (norm == null || !w) continue;
    weightedSum += norm * w; weightUsed += w;
  }
  const score = weightUsed > 0 ? Math.round((weightedSum / weightUsed) * 100) : null;
  return {
    score, platform: record.platform,
    basis: weightUsed > 0 ? "platform-relative (normalized against the same platform's own recent distribution)" : "NO_BASELINE - insufficient comparable history",
    components,
  };
}

/**
 * baselineFor(record, groupSummary) -> { performance_index, basis } | { performance_index: null, basis: "NO_BASELINE" }
 * §20 - performance_index = post_metric / recent_platform_median_at_similar_age.
 * NEVER manufactured when the comparison group is too small.
 */
export function baselineFor(record, groupSummary, { minSample = 5 } = {}) {
  if (!groupSummary || groupSummary.sample_size < minSample || groupSummary.reach_or_views?.median == null) {
    return { performance_index: null, basis: "NO_BASELINE", reason: `fewer than ${minSample} comparable posts` };
  }
  const value = record.metrics?.reach ?? record.metrics?.views ?? record.metrics?.impressions ?? null;
  if (value == null) return { performance_index: null, basis: "NO_BASELINE", reason: "this post has no comparable volume metric yet" };
  return { performance_index: Math.round((value / groupSummary.reach_or_views.median) * 100) / 100, basis: `platform+family median (n=${groupSummary.sample_size})` };
}
