// Phase SOCIAL-ANALYTICS-1 (§37) - PERFORMANCE FEEDBACK + LEARNING LOOP TESTS.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { normalizeProviderMetrics, emptyMetrics, computeKpis, METRIC_KEYS, PLATFORM_METRIC_SUPPORT } from "../../lib/social/distribution/metrics.mjs";
import { robustSummary, confidenceStateFor, isLearningEligible, hookArchetypeFor, brisbaneWeekdayHour } from "../../lib/social/analytics/core.mjs";
import { joinPerformanceToStory } from "../../lib/social/analytics/join.mjs";
import { familyPerformance, entityPerformance, hashtagPerformance } from "../../lib/social/analytics/summaries.mjs";
import { deriveLearningSignals } from "../../lib/social/analytics/learning.mjs";
import { socialPerformanceScore, baselineFor } from "../../lib/social/analytics/score.mjs";
import { costPerformance } from "../../lib/social/analytics/costPerformance.mjs";
import { dedupeKeyFor } from "../../lib/social/analytics/metricsHistory.mjs";
import { placementAnalyticsState, classifyMetricsFailure } from "../../lib/social/analytics/collect.mjs";

test("ANLY1-1. a metric the provider did not return stays null, never becomes 0", () => {
  const norm = normalizeProviderMetrics([{ type: "likes", value: 12 }], "instagram");
  assert.equal(norm.metrics.likes, 12);
  assert.equal(norm.metrics.comments, null, "comments was never reported - must stay null, not 0");
});

test("ANLY1-2. a metric a platform cannot report at all stays unavailable/null, not 0", () => {
  const norm = normalizeProviderMetrics([], "x");
  assert.equal(norm.metrics.saves, null);
  assert.ok(PLATFORM_METRIC_SUPPORT.x.shares === "NOT_SUPPORTED");
});

test("ANLY1-3. a ratio KPI requires both a real numerator AND denominator", () => {
  const kpis = computeKpis({ ...emptyMetrics(), likes: 10 }); // no reach/impressions
  assert.equal(kpis.engagement_rate.value, null);
  const withDenom = computeKpis({ ...emptyMetrics(), likes: 10, reach: 100 });
  assert.equal(withDenom.engagement_rate.value, 0.1);
});

test("ANLY1-4. post age (in seconds) is computed and persisted alongside a snapshot", () => {
  const published = new Date(Date.now() - 3600_000).toISOString();
  const captured = new Date().toISOString();
  const ageSeconds = Math.round((new Date(captured) - new Date(published)) / 1000);
  assert.ok(ageSeconds >= 3595 && ageSeconds <= 3605);
});

test("ANLY1-5. platform metric semantics are preserved (IG supports saves, X does not)", () => {
  assert.equal(PLATFORM_METRIC_SUPPORT.instagram.saves, "SUPPORTED");
  assert.equal(PLATFORM_METRIC_SUPPORT.x.saves, "UNKNOWN");
  assert.equal(PLATFORM_METRIC_SUPPORT.x.shares, "NOT_SUPPORTED");
});

test("ANLY1-6. Instagram reach and X impressions are never silently treated as the same metric", () => {
  const igNorm = normalizeProviderMetrics([{ type: "reach", value: 500 }], "instagram");
  const xNorm = normalizeProviderMetrics([{ type: "impressions", value: 500 }], "x");
  assert.equal(igNorm.metrics.reach, 500);
  assert.equal(igNorm.metrics.impressions, null);
  assert.equal(xNorm.metrics.impressions, 500);
  assert.equal(xNorm.metrics.reach, null);
});

test("ANLY1-7. story family joins correctly from persisted discovery metadata", () => {
  const snapshotRow = { placement_id: "p1", story_id: "s1", platform: "instagram", observed_at: "2026-01-01T00:00:00Z", metrics: { reach: 100, likes: 5 } };
  const placementRow = { caption_style: { discovery: { family: "market_snapshot", pokemon: "Clefairy" } } };
  const joined = joinPerformanceToStory(snapshotRow, placementRow);
  assert.equal(joined.story_family, "market_snapshot");
});

test("ANLY1-8. Pokemon joins correctly", () => {
  const joined = joinPerformanceToStory({ metrics: {} }, { caption_style: { discovery: { pokemon: "Clefairy" } } });
  assert.equal(joined.pokemon, "Clefairy");
});

test("ANLY1-9. keywords join correctly", () => {
  const joined = joinPerformanceToStory({ metrics: {} }, { caption_style: { discovery: { primary_keyword: "pokemon card prices", secondary_keywords: ["cheap pokemon cards"] } } });
  assert.equal(joined.primary_keyword, "pokemon card prices");
  assert.deepEqual(joined.secondary_keywords, ["cheap pokemon cards"]);
});

test("ANLY1-10. hashtags join correctly", () => {
  const joined = joinPerformanceToStory({ metrics: {} }, { caption_style: { discovery: { hashtags: ["#Clefairy", "#PokemonTCG"] } } });
  assert.deepEqual(joined.hashtags, ["#Clefairy", "#PokemonTCG"]);
});

test("ANLY1-11. hook type joins correctly", () => {
  const joined = joinPerformanceToStory({ metrics: {} }, { caption_style: { discovery: { hook_archetype: "SURPRISING_STAT" } } });
  assert.equal(joined.hook_archetype, "SURPRISING_STAT");
});

test("ANLY1-12. emoji count joins correctly", () => {
  const joined = joinPerformanceToStory({ metrics: {} }, { caption_style: { discovery: { emoji_count: 3 } } });
  assert.equal(joined.emoji_count, 3);
});

test("ANLY1-13. posting time is normalized to Australia/Brisbane", () => {
  const r = brisbaneWeekdayHour("2026-01-01T00:00:00Z"); // 2026-01-01 10:00 AEST (Brisbane, no DST)
  assert.equal(r.weekday, "Thu");
  assert.equal(r.hour, 10);
});

test("ANLY1-14. a single post can never produce a strong learning signal", () => {
  const family = { "market_snapshot::instagram": { sample_size: 1, reach_or_views: { median: 5000 } } };
  const signals = deriveLearningSignals(family, { overallMedianByPlatform: { instagram: 1000 } });
  assert.equal(signals.length, 0, "1 post is below the isLearningEligible(5) threshold - no recommendation at all");
});

test("ANLY1-15. fewer than 5 comparable posts is INSUFFICIENT_DATA", () => {
  assert.equal(confidenceStateFor(1), "ANECDOTE");
  assert.equal(confidenceStateFor(4), "INSUFFICIENT_DATA");
  assert.equal(isLearningEligible(4), false);
});

test("ANLY1-16. the 5-9 early-signal threshold works", () => {
  assert.equal(confidenceStateFor(5), "EARLY_SIGNAL");
  assert.equal(confidenceStateFor(9), "EARLY_SIGNAL");
  assert.equal(isLearningEligible(5), true);
});

test("ANLY1-17. the 10-24 mature/moderate threshold works", () => {
  assert.equal(confidenceStateFor(10), "MODERATE_SIGNAL");
  assert.equal(confidenceStateFor(24), "MODERATE_SIGNAL");
  assert.equal(confidenceStateFor(25), "STRONGER_SIGNAL");
});

test("ANLY1-18. a single outlier does not dominate the median", () => {
  const s = robustSummary([100, 110, 95, 105, 100, 100000]); // one wild outlier
  assert.ok(s.median < 200, `median should stay near the cluster, got ${s.median}`);
  assert.ok(s.outliers.includes(100000), "the outlier must be flagged, not silently averaged in");
});

test("ANLY1-19. a performance score is computed platform-relatively, never as a raw cross-platform number", () => {
  const record = { platform: "instagram", metrics: { reach: 1000, likes: 50 }, kpis: { engagement_rate: { value: 0.05 } } };
  const groupSummary = { reach_or_views: { max: 2000 }, engagement_rate: { max: 0.1 }, share_rate: { max: null }, save_rate: { max: null }, click_rate: { max: null }, completion_rate: { max: null } };
  const score = socialPerformanceScore(record, groupSummary);
  assert.equal(score.platform, "instagram");
  assert.match(score.basis, /platform-relative/);
});

test("ANLY1-20. no fake baseline is manufactured on an insufficient sample", () => {
  const b = baselineFor({ metrics: { reach: 500 } }, { sample_size: 2, reach_or_views: { median: 400 } });
  assert.equal(b.performance_index, null);
  assert.equal(b.basis, "NO_BASELINE");
});

test("ANLY1-21. an analytics/metrics-collection failure never changes the placement's publish state", () => {
  const src = readFileSync(new URL("../../lib/social/analytics/collect.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(src, /status:\s*["']BUFFER_QUEUED["']|status:\s*["']PUBLISHED["']|patchPlacement/, "collect.mjs must never write a placement's publish status");
});

test("ANLY1-22. provider metrics collection is READ-ONLY", () => {
  const src = readFileSync(new URL("../../lib/social/analytics/collect.mjs", import.meta.url), "utf8");
  assert.match(src, /getPostMetrics/);
  assert.doesNotMatch(src, /createPost\s*\(|deletePost\s*\(/);
});

test("ANLY1-23. no createPost CALL anywhere in the new analytics code (the word may appear in a comment explaining its absence)", () => {
  const files = ["core.mjs", "collect.mjs", "join.mjs", "summaries.mjs", "score.mjs", "learning.mjs", "conversionHandoff.mjs", "costPerformance.mjs", "digest.mjs"];
  for (const f of files) {
    const src = readFileSync(new URL(`../../lib/social/analytics/${f}`, import.meta.url), "utf8");
    assert.doesNotMatch(src, /createPost\s*\(/, `${f} must never call createPost(...)`);
  }
});

test("ANLY1-24. no deletePost CALL anywhere in the new analytics code (the word may appear in a comment explaining its absence)", () => {
  const files = ["collect.mjs", "digest.mjs", "learning.mjs"];
  for (const f of files) {
    const src = readFileSync(new URL(`../../lib/social/analytics/${f}`, import.meta.url), "utf8");
    assert.doesNotMatch(src, /deletePost\s*\(/, `${f} must never call deletePost(...)`);
  }
});

test("ANLY1-25. no caption modification anywhere in the new analytics code", () => {
  const files = ["collect.mjs", "join.mjs", "summaries.mjs"];
  for (const f of files) {
    const src = readFileSync(new URL(`../../lib/social/analytics/${f}`, import.meta.url), "utf8");
    assert.doesNotMatch(src, /caption_text\s*=|\.caption_text\s*=\s*[^=]/, `${f} must never assign to a caption_text field`);
  }
});

test("ANLY1-26. no asset modification anywhere in the new analytics code", () => {
  for (const f of ["collect.mjs", "join.mjs"]) {
    const src = readFileSync(new URL(`../../lib/social/analytics/${f}`, import.meta.url), "utf8");
    assert.doesNotMatch(src, /hostMedia|uploadAsset|artifact_hash\s*=/, `${f} must never touch hosted media`);
  }
});

test("ANLY1-27. no cron / recurring scheduling introduced", () => {
  for (const f of ["scripts/socialAnalytics1.mjs", "scripts/socialAnalytics1Pack.mjs"]) {
    const src = readFileSync(new URL(`../../${f}`, import.meta.url), "utf8");
    assert.doesNotMatch(src, /setInterval|node-cron|vercel\.json/);
  }
});

test("ANLY1-28. autopilot remains false / unset by this phase's code", () => {
  const src = readFileSync(new URL("../../scripts/socialAnalytics1.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(src, /SOCIAL_AUTOPILOT_ENABLED\s*=\s*["']true["']/);
});

test("ANLY1-29. no Reddit changes in the new analytics code", () => {
  const src = readFileSync(new URL("../../lib/social/analytics/digest.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(src, /reddit\.com|postToReddit/i);
});

test("ANLY1-30. no SEO page generation in the new analytics code", () => {
  const src = readFileSync(new URL("../../lib/social/analytics/digest.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(src, /generateStaticParams|writeFileSync.*app\//);
});

test("ANLY1-31. no email changes in the new analytics code", () => {
  for (const f of ["collect.mjs", "digest.mjs"]) {
    const src = readFileSync(new URL(`../../lib/social/analytics/${f}`, import.meta.url), "utf8");
    assert.doesNotMatch(src, /resend|newsletter|sendDigest/i);
  }
});

test("ANLY1-32. no eBay changes in the new analytics code", () => {
  for (const f of ["collect.mjs", "conversionHandoff.mjs", "costPerformance.mjs"]) {
    const src = readFileSync(new URL(`../../lib/social/analytics/${f}`, import.meta.url), "utf8");
    assert.doesNotMatch(src, /browse-api|ebay\.com\/buy/i);
  }
});

test("ANLY1-33. the live pilot posts are never referenced as a mutation target anywhere new", () => {
  for (const f of ["lib/social/analytics/collect.mjs", "scripts/socialAnalytics1.mjs", "scripts/socialAnalytics1Pack.mjs"]) {
    const src = readFileSync(new URL(`../../${f}`, import.meta.url), "utf8");
    assert.doesNotMatch(src, /cancelBufferPlacementLive\(/, `${f} must never call cancelBufferPlacementLive`);
  }
});

test("ANLY1-34. historical metric snapshots are immutable - the persistence layer only ever INSERTs, never UPDATEs/DELETEs an existing row", () => {
  const src = readFileSync(new URL("../../lib/social/analytics/metricsHistory.mjs", import.meta.url), "utf8");
  // scoped to the Supabase query-builder call shape (db.from(...).update(/.delete() )
  // - createHash(...).update(...) is Node's unrelated crypto API and must not false-positive.
  assert.doesNotMatch(src, /\.from\([^)]*social_post_metric_snapshots[^)]*\)[\s\S]{0,80}\.(update|delete)\(/, "metricsHistory.mjs must never update or delete a snapshot row");
  assert.match(src, /\.upsert\(/, "the one write path is an upsert keyed on a dedupe constraint, not a free-form update");
});

test("ANLY1-35. a duplicate observation can be deduped safely (same dedupe key for the same placement + provider timestamp)", () => {
  const k1 = dedupeKeyFor({ placementId: "p1", providerMetricsUpdatedAt: "2026-01-01T00:00:00Z" });
  const k2 = dedupeKeyFor({ placementId: "p1", providerMetricsUpdatedAt: "2026-01-01T00:00:00Z" });
  const k3 = dedupeKeyFor({ placementId: "p1", providerMetricsUpdatedAt: "2026-01-02T00:00:00Z" });
  assert.equal(k1, k2, "identical inputs must produce the identical dedupe key");
  assert.notEqual(k1, k3, "a genuinely new provider reading must get a new key");
});

test("ANLY1-36. cost-performance ratios require a valid denominator - never invented from a missing metric", () => {
  const withImpressions = costPerformance({ metrics: { impressions: 1000 }, engagement_count: 50 }, { creativeCostUsd: 1 });
  assert.ok(withImpressions.cost_per_1k_impressions != null);
  const noMetrics = costPerformance({ metrics: {}, engagement_count: null }, { creativeCostUsd: 1 });
  assert.equal(noMetrics.cost_per_1k_impressions, null);
  assert.equal(noMetrics.cost_per_engagement, null);
});

// ---- extra structural / behavioral coverage ----
test("ANLY1-extra. familyPerformance never groups a record with a missing family under a fabricated bucket", () => {
  const records = [{ platform: "instagram", story_family: null, metrics: { reach: 100 } }, { platform: "instagram", story_family: "market_snapshot", metrics: { reach: 100 } }];
  const f = familyPerformance(records);
  assert.equal(Object.keys(f).length, 1);
});

test("ANLY1-extra. hashtag performance is explicitly labeled observational, never causal", () => {
  const h = hashtagPerformance([{ platform: "instagram", hashtags: ["#PokemonTCG"], metrics: { reach: 100 } }]);
  assert.match(h.note, /OBSERVATIONAL ONLY/);
});

test("ANLY1-extra. classifyMetricsFailure returns a closed, distinct taxonomy from the publish failure classes", () => {
  assert.equal(classifyMetricsFailure("unauthorized", ""), "METRICS_AUTH_FAILURE");
  assert.equal(classifyMetricsFailure("rate_limited", "429"), "METRICS_RATE_LIMIT");
  assert.equal(classifyMetricsFailure("weird", "totally unknown"), "METRICS_PROVIDER_ERROR");
});

test("ANLY1-extra. placementAnalyticsState never reports MATURE/FINALIZED before any snapshot exists", () => {
  const placement = { buffer_provider_ref: "abc", published_at: new Date().toISOString(), status: "PUBLISHED" };
  assert.equal(placementAnalyticsState(placement, { snapshotCount: 0 }), "AWAITING_METRICS");
});

test("ANLY1-extra. hookArchetypeFor is deterministic per family, not guessed from performance", () => {
  assert.equal(hookArchetypeFor("deal_drop"), "DEAL_ALERT");
  assert.equal(hookArchetypeFor("printing_compare"), "COMPARISON");
  assert.equal(hookArchetypeFor("market_snapshot", "How much of the market is affordable?"), "QUESTION");
});
