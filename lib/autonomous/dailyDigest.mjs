// Phase SOCIAL-AUTOPILOT-1 §19 - DAILY DIGEST / OBSERVABILITY.
//
// A concise persisted run summary so the owner can tell "did social
// autopilot work today?" without reading logs. Pure - built from the
// orchestrator's own run result, no I/O.

export const DAILY_DIGEST_VERSION = "auto1.1";

export function buildDailyDigest({
  candidatesDiscovered = 0, candidatesRejected = [], storiesSelected = [],
  masterReuseCount = 0, masterGeneratedCount = 0, apiSpendUsd = 0,
  captionsReady = 0, captionsHeld = 0, videosReady = 0, videosHeld = 0,
  platformPlacementsReady = 0, bufferPlacementsQueued = 0,
  withholds = [], duplicatesPrevented = 0, staleRejected = 0,
  now = Date.now(),
} = {}) {
  return {
    digest_version: DAILY_DIGEST_VERSION,
    run_at: new Date(now).toISOString(),
    candidates_discovered: candidatesDiscovered,
    candidates_rejected: candidatesRejected.length,
    candidates_rejected_reasons: candidatesRejected,
    stories_selected: storiesSelected.length,
    families_selected: [...new Set(storiesSelected.map((s) => s.family))],
    why_selected: Object.fromEntries(storiesSelected.map((s) => [s.story_id, s.why_selected ?? []])),
    master_reused: masterReuseCount,
    master_generated: masterGeneratedCount,
    api_spend_usd: Math.round(apiSpendUsd * 100) / 100,
    captions_ready: captionsReady,
    captions_held: captionsHeld,
    videos_ready: videosReady,
    videos_held: videosHeld,
    platform_placements_ready: platformPlacementsReady,
    buffer_placements_queued: bufferPlacementsQueued,
    withholds,
    duplicates_prevented: duplicatesPrevented,
    stale_stories_rejected: staleRejected,
    headline: storiesSelected.length
      ? `${storiesSelected.length} stor${storiesSelected.length === 1 ? "y" : "ies"} selected (${[...new Set(storiesSelected.map((s) => s.family))].join(", ")}); $${(Math.round(apiSpendUsd * 100) / 100).toFixed(2)} spent; ${bufferPlacementsQueued} placement(s) queued`
      : `no story cleared the quality floor today - 0 posts (never filler)`,
  };
}
