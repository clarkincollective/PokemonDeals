// Phase SOCIAL-ANALYTICS-1 §7 - JOIN PERFORMANCE BACK TO STORY METADATA.
//
// This IS the core value of the phase. Every metric snapshot is joined
// against the SAME placement/discovery metadata SOCIAL-DISCOVERY-2
// already persists in caption_style.discovery - reused, not
// re-derived or re-queried. No fresh factual lookups; if a dimension was
// never captured for a placement, the joined field is null, not invented.

import { computeKpis, engagementCount } from "../distribution/metrics.mjs";
import { brisbaneWeekdayHour } from "./core.mjs";

/**
 * joinPerformanceToStory(snapshotRow, placementRow) -> one flat,
 * attributable performance record. `snapshotRow` is a
 * social_post_metric_snapshots row; `placementRow` is the matching
 * social_story_placements row (caption_style.discovery holds everything
 * SOCIAL-DISCOVERY-2 persisted).
 */
export function joinPerformanceToStory(snapshotRow, placementRow) {
  const d = placementRow?.caption_style?.discovery ?? {};
  const local = brisbaneWeekdayHour(placementRow?.scheduled_for ?? placementRow?.published_at ?? snapshotRow?.observed_at);
  const kpis = computeKpis(snapshotRow?.metrics ?? {});

  return {
    // identity
    placement_id: snapshotRow?.placement_id ?? placementRow?.placement_id ?? null,
    story_id: snapshotRow?.story_id ?? placementRow?.story_id ?? null,
    snapshot_hash: snapshotRow?.snapshot_hash ?? null,
    platform: snapshotRow?.platform ?? placementRow?.platform ?? null,
    placement_type: placementRow?.placement_type ?? null,

    // story/discovery metadata (SS7) - reused from DISCOVERY-2, never re-derived
    story_family: d.family ?? null,
    pokemon: d.pokemon ?? null,
    card: d.card ?? null,
    set: d.set ?? null,
    editorial_angle: d.editorial_angle ?? null,
    primary_keyword: d.primary_keyword ?? null,
    secondary_keywords: d.secondary_keywords ?? [],
    search_intent: d.search_intent ?? [],
    primary_audience: d.primary_audience ?? null,
    hashtags: d.hashtags ?? [],
    emoji_count: d.emoji_count ?? null,
    related_site_route: d.related_site_route ?? null,
    hook_archetype: d.hook_archetype ?? null,
    growth_potential_score_at_creation: d.growth_potential_score ?? null,

    // timing (SS16)
    scheduled_at_utc: placementRow?.scheduled_for ?? null,
    published_at: placementRow?.published_at ?? null,
    local_weekday: local?.weekday ?? null,
    local_hour: local?.hour ?? null,

    // performance
    observed_at: snapshotRow?.observed_at ?? null,
    post_age_seconds: snapshotRow?.post_age_seconds ?? null,
    metrics: snapshotRow?.metrics ?? null,
    unsupported: snapshotRow?.unsupported ?? [],
    engagement_count: engagementCount(snapshotRow?.metrics ?? {}),
    kpis,
  };
}

/** joinManyToStory(snapshots, placementsById) -> array of joined records. */
export function joinManyToStory(snapshots, placementsById) {
  return snapshots.map((s) => joinPerformanceToStory(s, placementsById.get(s.placement_id) ?? null));
}
