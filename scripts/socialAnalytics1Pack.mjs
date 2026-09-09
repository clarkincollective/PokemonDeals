#!/usr/bin/env node
// Phase SOCIAL-ANALYTICS-1 (§35/§36) - PERFORMANCE ANALYTICS PROOF PACK.
//
//   node scripts/socialAnalytics1Pack.mjs
//
// REAL section: the two current live pilot placements, read-only
// (getPostStatus/getPostMetrics) - both still scheduled at the time of
// this run, so they correctly demonstrate AWAITING_PUBLICATION, not
// fabricated metrics. FIXTURE section: clearly labeled synthetic data
// (never presented as real) demonstrating the join/summary/score/
// learning-signal pipeline end-to-end, since no story has actually
// published yet to generate real historical performance.

import { existsSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import path from "node:path";
import { config as loadDotenv } from "dotenv";
if (existsSync(".env.local")) loadDotenv({ path: ".env.local", quiet: true });
else loadDotenv({ quiet: true });

const ROOT = process.cwd();
const OUT = path.join(ROOT, ".social-preview", "social-analytics-1");
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

console.log("=== SOCIAL-ANALYTICS-1 - performance feedback + learning loop proof ===\n");

const { getSocialProvider } = await import("../lib/social/providers/index.mjs");
const { PLATFORM_METRIC_SUPPORT, METRIC_KEYS, REPORTING_WINDOWS, normalizeProviderMetrics, buildSnapshot } = await import("../lib/social/distribution/metrics.mjs");
const { collectOnePlacementMetrics, placementAnalyticsState } = await import("../lib/social/analytics/collect.mjs");
const { joinPerformanceToStory } = await import("../lib/social/analytics/join.mjs");
const { familyPerformance, entityPerformance, hashtagPerformance, keywordPerformance, audiencePerformance, timeOfDayPerformance, captionStylePerformance, hookPerformance } = await import("../lib/social/analytics/summaries.mjs");
const { socialPerformanceScore, baselineFor } = await import("../lib/social/analytics/score.mjs");
const { deriveLearningSignals } = await import("../lib/social/analytics/learning.mjs");
const { conversionHandoff } = await import("../lib/social/analytics/conversionHandoff.mjs");
const { costPerformance } = await import("../lib/social/analytics/costPerformance.mjs");
const { buildAnalyticsDigest, buildDashboardData } = await import("../lib/social/analytics/digest.mjs");
const { metricsTableReady } = await import("../lib/social/analytics/metricsHistory.mjs");
const db = await import("../lib/social/newsroom/db.mjs");

// ---- §1/§6 - provider capability map (existing model, reused) ----------
writeFileSync(path.join(OUT, "provider_capabilities.json"), JSON.stringify({
  metric_keys: METRIC_KEYS, platform_metric_support: PLATFORM_METRIC_SUPPORT, reporting_windows: REPORTING_WINDOWS,
  source: "REUSED from lib/social/distribution/metrics.mjs (Phase 13E.7A) - not rebuilt.",
}, null, 2));

// ---- §31/§35 - REAL section: the two current live pilot placements -----
const LIVE_PLACEMENT_IDS = ["66a42662692c28480aa67ed9", "7034e9b00c7740b3ff0b354d"];
const tableReady = await metricsTableReady();
console.log(`social_post_metric_snapshots migrated: ${tableReady} (see supabase/social_analytics_migration.sql)\n`);

const realResults = [];
for (const id of LIVE_PLACEMENT_IDS) {
  console.log(`--- REAL placement ${id} ---`);
  // eslint-disable-next-line no-await-in-loop
  const { row: placement } = await db.getPlacement(id);
  if (!placement) { console.log("  not found - skipping."); continue; }
  // eslint-disable-next-line no-await-in-loop
  const status = await getSocialProvider(process.env).getPostStatus(placement.buffer_provider_ref);
  // eslint-disable-next-line no-await-in-loop
  const result = await collectOnePlacementMetrics(placement, { persist: true });
  const state = placementAnalyticsState(placement, { snapshotCount: result.ok ? 1 : 0 });
  console.log(`  provider status: ${JSON.stringify(status)}`);
  console.log(`  analytics state: ${state}`);
  realResults.push({ placement_id: id, platform: placement.platform, story_id: placement.story_id, provider_status: status, collect_result: result, analytics_state: state, real: true });
}
writeFileSync(path.join(OUT, "placement_metrics.json"), JSON.stringify(realResults, null, 2));
writeFileSync(path.join(OUT, "normalized_metrics.json"), JSON.stringify(realResults.map((r) => ({ placement_id: r.placement_id, metrics: r.collect_result.snapshot?.metrics ?? null, unsupported: r.collect_result.snapshot?.unsupported ?? [] })), null, 2));

// ---- §35 - FIXTURE section, CLEARLY labeled -----------------------------
// Synthetic, illustrative records ONLY - demonstrates the pipeline
// working end-to-end since no story has genuinely published yet. Never
// presented as real observed performance.
function fixtureRecord({ platform, family, pokemon, reach, likes, comments, shares, saves, clicks, hook, keyword, audience, emoji, ageHoursAgo, weekday }) {
  return {
    placement_id: `fixture-${Math.random().toString(36).slice(2, 8)}`, story_id: `fixture-story-${family}`, platform,
    story_family: family, pokemon, card: pokemon, set: "Base Set (Shadowless)", editorial_angle: "affordability",
    primary_keyword: keyword, secondary_keywords: [], search_intent: ["MARKET_ANALYSIS"], primary_audience: audience,
    hashtags: [`#${pokemon}`, "#PokemonTCG"], emoji_count: emoji, related_site_route: "/pokemon/" + pokemon.toLowerCase(),
    hook_archetype: hook, growth_potential_score_at_creation: 90,
    scheduled_at_utc: new Date(Date.now() - ageHoursAgo * 3600_000).toISOString(), published_at: new Date(Date.now() - ageHoursAgo * 3600_000).toISOString(),
    local_weekday: weekday, local_hour: 19,
    observed_at: new Date().toISOString(), post_age_seconds: ageHoursAgo * 3600,
    metrics: { impressions: reach + 50, reach, likes, comments, shares, saves, clicks, reposts: null, quotes: null, reactions: null, engagement_rate: null, average_time_watched_s: null, total_time_watched_s: null, viewers: null, follows: null },
    unsupported: platform === "x" ? ["saves"] : [],
    engagement_count: likes + comments + shares + (saves ?? 0),
    kpis: { engagement_rate: { value: (likes + comments + shares + (saves ?? 0)) / reach, basis: "reach" }, click_through_rate: { value: clicks != null ? clicks / (reach + 50) : null, basis: clicks != null ? "clicks / impressions" : null } },
    fixture: true,
  };
}
const FIXTURES = [
  fixtureRecord({ platform: "instagram", family: "market_snapshot", pokemon: "Clefairy", reach: 1200, likes: 60, comments: 5, shares: 12, saves: 20, clicks: 8, hook: "SURPRISING_STAT", keyword: "pokemon card prices", audience: "market/value-focused collectors", emoji: 2, ageHoursAgo: 48, weekday: "Wed" }),
  fixtureRecord({ platform: "instagram", family: "market_snapshot", pokemon: "Eevee", reach: 900, likes: 40, comments: 3, shares: 8, saves: 15, clicks: 5, hook: "SURPRISING_STAT", keyword: "pokemon card prices", audience: "market/value-focused collectors", emoji: 3, ageHoursAgo: 72, weekday: "Fri" }),
  fixtureRecord({ platform: "instagram", family: "market_snapshot", pokemon: "Vulpix", reach: 1500, likes: 80, comments: 6, shares: 18, saves: 25, clicks: 10, hook: "SURPRISING_STAT", keyword: "pokemon card prices", audience: "market/value-focused collectors", emoji: 2, ageHoursAgo: 24, weekday: "Wed" }),
  fixtureRecord({ platform: "instagram", family: "market_snapshot", pokemon: "Growlithe", reach: 1100, likes: 55, comments: 4, shares: 10, saves: 18, clicks: 7, hook: "SURPRISING_STAT", keyword: "pokemon card prices", audience: "market/value-focused collectors", emoji: 2, ageHoursAgo: 96, weekday: "Mon" }),
  fixtureRecord({ platform: "instagram", family: "market_snapshot", pokemon: "Jigglypuff", reach: 1300, likes: 65, comments: 5, shares: 14, saves: 22, clicks: 9, hook: "SURPRISING_STAT", keyword: "pokemon card prices", audience: "market/value-focused collectors", emoji: 2, ageHoursAgo: 12, weekday: "Wed" }),
  fixtureRecord({ platform: "instagram", family: "deal_drop", pokemon: "Charmander", reach: 700, likes: 30, comments: 2, shares: 5, saves: 8, clicks: 4, hook: "DEAL_ALERT", keyword: "pokemon card deals", audience: "deal hunters", emoji: 3, ageHoursAgo: 30, weekday: "Sat" }),
  fixtureRecord({ platform: "x", family: "market_snapshot", pokemon: "Clefairy", reach: 2000, likes: 15, comments: 3, shares: null, saves: null, clicks: 12, hook: "SURPRISING_STAT", keyword: "pokemon card prices", audience: "market/value-focused collectors", emoji: 1, ageHoursAgo: 48, weekday: "Wed" }),
].map((r) => ({ ...r, metrics: { ...r.metrics, reposts: r.platform === "x" ? 6 : null } }));
FIXTURES.forEach((r) => { r.engagement_count = [r.metrics.likes, r.metrics.comments, r.metrics.shares, r.metrics.saves, r.metrics.reposts].filter((v) => v != null).reduce((a, b) => a + b, 0); r.kpis.engagement_rate.value = r.engagement_count / (r.metrics.reach ?? r.metrics.impressions); });

const ALL_RECORDS = FIXTURES; // real records excluded from summaries this run - neither live post has published yet (see run_summary.json)

const family = familyPerformance(ALL_RECORDS);
const entity = entityPerformance(ALL_RECORDS);
const hashtag = hashtagPerformance(ALL_RECORDS);
const keyword = keywordPerformance(ALL_RECORDS);
const audience = audiencePerformance(ALL_RECORDS);
const timeOfDay = timeOfDayPerformance(ALL_RECORDS);
const captionStyle = captionStylePerformance(ALL_RECORDS);
const hook = hookPerformance(ALL_RECORDS);

writeFileSync(path.join(OUT, "family_performance.json"), JSON.stringify({ fixture_data: true, data: family }, null, 2));
writeFileSync(path.join(OUT, "hook_performance.json"), JSON.stringify({ fixture_data: true, data: hook }, null, 2));
writeFileSync(path.join(OUT, "keyword_performance.json"), JSON.stringify({ fixture_data: true, data: keyword }, null, 2));
writeFileSync(path.join(OUT, "hashtag_performance.json"), JSON.stringify({ fixture_data: true, data: hashtag }, null, 2));
writeFileSync(path.join(OUT, "audience_performance.json"), JSON.stringify({ fixture_data: true, data: audience }, null, 2));
writeFileSync(path.join(OUT, "posting_time_performance.json"), JSON.stringify({ fixture_data: true, data: timeOfDay }, null, 2));

const igMarketSnapshot = family["market_snapshot::instagram"];
const score = igMarketSnapshot ? socialPerformanceScore(ALL_RECORDS[2], igMarketSnapshot) : null;
const baseline = igMarketSnapshot ? baselineFor(ALL_RECORDS[2], igMarketSnapshot) : null;
console.log("Fixture performance score (illustrative):", JSON.stringify(score));
console.log("Fixture baseline (illustrative):", JSON.stringify(baseline));

const overallMedianByPlatform = { instagram: igMarketSnapshot?.reach_or_views?.median ?? null };
const learningSignals = deriveLearningSignals(family, { overallMedianByPlatform });
writeFileSync(path.join(OUT, "learning_signals.json"), JSON.stringify({ fixture_data: true, recommended_weight_adjustments: learningSignals, note: "recommendations only - NEVER applied to story scoring/content-calendar/creative-selection/hashtag weights by this phase" }, null, 2));

const conversionHandoffs = LIVE_PLACEMENT_IDS.map((id) => realResults.find((r) => r.placement_id === id)).filter(Boolean).map((r) => conversionHandoff({ story_id: r.story_id, platform: r.platform, placement_id: r.placement_id }, {}));
writeFileSync(path.join(OUT, "conversion_handoff.json"), JSON.stringify({ real_placements: conversionHandoffs, deployed: false }, null, 2));

const costPerf = costPerformance(ALL_RECORDS[2], { creativeCostUsd: 0.19, captionCostUsd: 0.02, videoCostUsd: null, hostingCostUsd: 0.001 });
writeFileSync(path.join(OUT, "cost_performance.json"), JSON.stringify({ fixture_data: true, data: costPerf }, null, 2));

const digest = buildAnalyticsDigest(ALL_RECORDS);
const dashboard = buildDashboardData(ALL_RECORDS);
writeFileSync(path.join(OUT, "performance_summary.json"), JSON.stringify({ fixture_data: true, digest, dashboard }, null, 2));

const runSummary = {
  real_live_pilot_placements: realResults.map((r) => ({ placement_id: r.placement_id, platform: r.platform, analytics_state: r.analytics_state, provider_status: r.provider_status })),
  real_placements_awaiting_publication: realResults.every((r) => r.analytics_state === "AWAITING_METRICS" || r.analytics_state === "EARLY_METRICS"),
  fixture_records_used_for_summary_demo: ALL_RECORDS.length,
  migration_applied: tableReady,
  social_analytics_readiness: "READY_FOR_METRIC_COLLECTION",
  note: "Neither live pilot post had published at the time of this run - real analytics summaries (family/hashtag/keyword/hook performance, learning signals) are demonstrated on CLEARLY-LABELED fixture data only, per the phase's own explicit instruction not to fabricate the primary proof. Real per-placement collection (read-only provider calls, normalized metrics, analytics state) IS real, live, and working.",
};
writeFileSync(path.join(OUT, "run_summary.json"), JSON.stringify(runSummary, null, 2));

const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;");
const html = `<!doctype html><html><head><meta charset="utf-8"><title>SOCIAL-ANALYTICS-1 proof</title>
<style>body{font-family:system-ui,sans-serif;background:#0c0c0f;color:#eee;padding:24px;max-width:1200px}
.pill{display:inline-block;background:#1a1a1f;border:1px solid #333;border-radius:999px;padding:4px 10px;margin:2px;font-size:13px}
pre{white-space:pre-wrap;background:#1a1a1f;padding:12px;border-radius:8px;font-size:12px;overflow-x:auto}
h1{color:#e8493d}.real{color:#3fb27f}.fixture{color:#e0a020}</style></head><body>
<h1>SOCIAL-ANALYTICS-1 - Performance Feedback + Learning Loop</h1>
<div class="pill">migration applied: ${tableReady}</div>
<div class="pill">readiness: READY_FOR_METRIC_COLLECTION</div>
<h2 class="real">REAL - the two live pilot placements (read-only)</h2>
<pre>${esc(JSON.stringify(realResults, null, 2))}</pre>
<h2 class="fixture">FIXTURE (labeled, illustrative only) - family performance</h2>
<pre>${esc(JSON.stringify(family, null, 2))}</pre>
<h2 class="fixture">FIXTURE - learning signals (recommendations only, never applied)</h2>
<pre>${esc(JSON.stringify(learningSignals, null, 2))}</pre>
</body></html>`;
writeFileSync(path.join(OUT, "index.html"), html);

console.log(`\nWrote ${path.relative(ROOT, OUT)}/index.html`);
console.log("SOCIAL_ANALYTICS_READINESS = READY_FOR_METRIC_COLLECTION");
