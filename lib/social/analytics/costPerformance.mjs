// Phase SOCIAL-ANALYTICS-1 §30 - COST EFFICIENCY.
//
// Joins the ALREADY-tracked generation cost (pkg.creative.cost_usd, the
// SAME cost the whole AUTOPILOT arc has recorded since AUTO-1) against a
// placement's real metrics. Only ever computes a ratio when both the
// cost and the metric denominator genuinely exist.

function ratio(numer, denom) {
  if (numer == null || denom == null) return null;
  const n = Number(numer), d = Number(denom);
  if (!Number.isFinite(n) || !Number.isFinite(d) || d <= 0) return null;
  return n / d;
}

/**
 * costPerformance(joinedRecord, { creativeCostUsd, captionCostUsd,
 * videoCostUsd, hostingCostUsd }) -> per-category cost + derived
 * cost-per-1k-impressions / cost-per-click / cost-per-engagement, each
 * null unless its denominator is real.
 */
export function costPerformance(record, { creativeCostUsd = null, captionCostUsd = null, videoCostUsd = null, hostingCostUsd = null } = {}) {
  const totalCost = [creativeCostUsd, captionCostUsd, videoCostUsd, hostingCostUsd].filter((v) => v != null).reduce((a, b) => a + Number(b), 0) || null;
  const impressions = record?.metrics?.impressions ?? record?.metrics?.reach ?? null;
  const clicks = record?.metrics?.clicks ?? null;
  const engagements = record?.engagement_count ?? null;
  return {
    creative_cost_usd: creativeCostUsd, caption_cost_usd: captionCostUsd, video_cost_usd: videoCostUsd, hosting_cost_usd: hostingCostUsd,
    total_cost_usd: totalCost,
    cost_per_1k_impressions: totalCost != null ? ratio(totalCost * 1000, impressions) : null,
    cost_per_click: totalCost != null ? ratio(totalCost, clicks) : null,
    cost_per_engagement: totalCost != null ? ratio(totalCost, engagements) : null,
  };
}
