// Phase SOCIAL-DISCOVERY-1 SS1/SS31/SS32 - CANONICAL DISCOVERY MANIFEST.
//
// ONE manifest per frozen SocialStorySnapshot, built ONCE and reused by
// every platform packager (SS32) - static/video/caption all already
// share pkg.snapshot the same way; this is the same discipline applied
// to discovery metadata. Pure function of pkg (+ optional real recent-
// hashtag history for rotation) - no I/O, no AI call, $0.

import { entityArrays } from "./entities.mjs";
import { classifyAudience } from "./audienceEngine.mjs";
import { classifySearchIntent } from "./searchIntent.mjs";
import { buildKeywordSet, scoreKeyword, auditKeywordEntityAlignment } from "./keywordEngine.mjs";
import { resolveRelatedSiteRoute } from "./siteRouting.mjs";
import { pickBestHook } from "./hookEngine.mjs";
import { auditOnScreenAlignment } from "./onScreenAlignment.mjs";
import { growthPotentialScore } from "./growthScore.mjs";
import { auditDiscoveryMetadata } from "./spamAudit.mjs";
import { packageInstagram, packageX, packageTikTok, packageYouTubeShorts } from "./platformPackagers.mjs";

export const DISCOVERY_MANIFEST_VERSION = "discovery2.1";

/**
 * buildSocialDiscoveryManifest(pkg, { recentTags, recentCombos,
 * recentPrimaryKeywords, now } = {}) -> { manifest, platform, audit, growth }
 *
 * recentTags/recentCombos: optional { instagram:[], x:[], tiktok:[],
 * youtube_shorts:[] } real recent-usage history (SS9/SS22) - defaults to
 * empty (no rotation penalty) rather than inventing history that doesn't
 * exist yet. recentPrimaryKeywords: optional string[] (SS11), real
 * publish/queue history from getRecentDiscoveryHistory() - a caller with
 * real placement history should supply all three; scripts/runOnePackage
 * both do via lib/social/newsroom/discoveryHistory.mjs.
 */
export function buildSocialDiscoveryManifest(pkg, { recentTags = {}, recentCombos = {}, recentPrimaryKeywords = [], now = Date.now() } = {}) {
  if (!pkg?.snapshot) return { ok: false, reason: "no locked snapshot - refusing to build discovery metadata from unfrozen facts" };

  const entities = entityArrays(pkg);
  const audience = classifyAudience(pkg.family);
  const intent = classifySearchIntent(pkg.family);
  const keywords = buildKeywordSet(pkg);
  const route = resolveRelatedSiteRoute(pkg);
  const hook = pickBestHook(pkg);

  const onScreenAlignment = auditOnScreenAlignment(pkg, keywords.on_screen_keywords);

  const instagram = packageInstagram(pkg, { keywords, route, audience, recentTags: recentTags.instagram ?? [], recentCombos: recentCombos.instagram ?? [] });
  const x = packageX(pkg, { keywords, route, audience, recentTags: recentTags.x ?? [], recentCombos: recentCombos.x ?? [] });
  const tiktok = packageTikTok(pkg, { keywords, route, audience, hook, recentTags: recentTags.tiktok ?? [], recentCombos: recentCombos.tiktok ?? [], onScreenAlignment });
  const youtube_shorts = packageYouTubeShorts(pkg, { keywords, route, audience, hook, recentTags: recentTags.youtube_shorts ?? [], recentCombos: recentCombos.youtube_shorts ?? [] });

  const allLockedTerms = [...entities.pokemon_entities, ...entities.card_entities, ...entities.set_entities];
  const entityMismatchFindings = auditKeywordEntityAlignment(
    [...keywords.secondary_search_queries, ...keywords.long_tail_queries, ...keywords.entity_keywords, ...keywords.caption_keywords],
    pkg,
  );

  // SS11 - keyword history: penalize (score-wise) a primary query that
  // exactly repeats a recent one, WITHOUT rewriting a correct keyword
  // just for uniqueness - the signal is exposed for a future ranking
  // consumer (story_scoring itself is frozen this phase), never acted on
  // here by silently substituting a different keyword.
  const keywordScores = [keywords.primary_search_query, ...keywords.secondary_search_queries, ...keywords.entity_keywords]
    .filter(Boolean)
    .map((k) => scoreKeyword(k, { family: pkg.family, lockedEntityTerms: allLockedTerms, recentKeywords: recentPrimaryKeywords }));
  const keywordTotal = keywordScores.reduce((s, k) => s + k.total, 0) / Math.max(1, keywordScores.length);
  const primaryKeywordRepeatedRecently = recentPrimaryKeywords.filter((k) => String(k).toLowerCase() === String(keywords.primary_search_query ?? "").toLowerCase()).length;

  const platform = { instagram, x, tiktok, youtube_shorts };
  const spam = auditDiscoveryMetadata(pkg, platform);

  const growth = growthPotentialScore({
    hookScore: hook?.score ?? 0, keywordTotal, hashtagScore: instagram.hashtags.length,
    onScreenVerdict: onScreenAlignment.verdict, audienceCount: audience.audience_segments.length,
    hasEntity: entities.card_entities.length > 0,
  });

  const manifest = {
    story_id: pkg.story_id,
    snapshot_hash: pkg.snapshot.snapshot_hash,
    generated_at: new Date(now).toISOString(),
    metadata_version: DISCOVERY_MANIFEST_VERSION,

    core_topic: keywords.primary_search_query,
    content_family: pkg.family,
    editorial_angle: pkg.editorial_angle ?? null,

    pokemon_entities: entities.pokemon_entities,
    card_entities: entities.card_entities,
    set_entities: entities.set_entities,
    printing_entities: entities.printing_entities,

    primary_search_query: keywords.primary_search_query,
    secondary_search_queries: keywords.secondary_search_queries,
    long_tail_queries: keywords.long_tail_queries,

    audience_segments: audience.audience_segments,
    primary_audience: audience.primary_audience,
    secondary_audience: audience.secondary_audience,

    search_intent: intent.search_intent,
    collector_intent: intent.collector_intent,
    commercial_intent: intent.commercial_intent,

    caption_keywords: keywords.caption_keywords,
    on_screen_keywords: keywords.on_screen_keywords,
    entity_keywords: keywords.entity_keywords,

    related_site_route: route.route,
    seo_handoff: pkg.seo_handoff ?? null,

    trend_eligibility: { eligible: false, reason: "no deterministic trend-relevance rule exists yet (SS0) - lazy trend hashtags are never used" },

    growth_potential_score: growth.score,
    growth_score_dims: growth.dims,
    on_screen_alignment: onScreenAlignment.verdict,
    primary_keyword_repeated_recently_count: primaryKeywordRepeatedRecently,

    platform,
  };

  const findings = [...entityMismatchFindings, ...spam.findings, ...onScreenAlignment.findings];
  return {
    ok: findings.length === 0,
    manifest, platform, findings,
    audit: { spam, entity_mismatch: entityMismatchFindings, on_screen_alignment: onScreenAlignment, keyword_scores: keywordScores },
    growth,
  };
}

/** persistenceShape(result) -> the compact record SS31 asks to persist alongside the story package. */
export function persistenceShape(result) {
  const m = result.manifest;
  if (!m) return null;
  return {
    generated_at: m.generated_at, snapshot_hash: m.snapshot_hash, metadata_version: m.metadata_version,
    keywords: { primary: m.primary_search_query, secondary: m.secondary_search_queries, long_tail: m.long_tail_queries },
    hashtags: { instagram: m.platform.instagram.hashtags, x: m.platform.x.hashtags, tiktok: m.platform.tiktok.hashtags, youtube_shorts: m.platform.youtube_shorts.hashtags },
    audience: { primary: m.primary_audience, segments: m.audience_segments },
    search_intent: m.search_intent,
    growth_score: m.growth_potential_score,
  };
}
