// Phase SOCIAL-ANALYTICS-1 §1/§3/§27/§32/§33 - READ-ONLY METRIC COLLECTION.
//
// REUSES lib/social/distribution/metrics.mjs's normalization model
// wholesale (Phase 13E.7A) - this file only adds the piece that model
// never had: reading from and writing to the CURRENT (Supabase-backed
// social_story_placements) placement system instead of the older local
// ledger.json. Every provider call here is a READ (getPostStatus,
// getPostMetrics) - this module contains no createPost, no deletePost, no
// caption/asset mutation, and cannot reach one transitively.

import { getSocialProvider } from "../providers/index.mjs";
import { normalizeProviderMetrics, buildSnapshot, serviceOf } from "../distribution/metrics.mjs";
import { recordMetricSnapshot } from "./metricsHistory.mjs";
import * as db from "../newsroom/db.mjs";

export const COLLECT_VERSION = "analytics1.1";

// §27 - a small, closed classification for a METRICS read failure,
// distinct from (and never confused with) bufferHandoff.mjs's PUBLISH
// failure taxonomy - this module never submits anything, so it can never
// hit CAPTION_REJECTED/ASSET_UPLOAD_FAILURE etc.
export function classifyMetricsFailure(reason = "", detail = "") {
  const s = `${reason} ${detail}`.toLowerCase();
  if (/unauthorized|auth|token|forbidden|401|403/.test(s)) return "METRICS_AUTH_FAILURE";
  if (/rate.?limit|429|too many requests/.test(s)) return "METRICS_RATE_LIMIT";
  if (/not.?supported|unsupported|no.?metrics/.test(s)) return "METRICS_NOT_SUPPORTED";
  return "METRICS_PROVIDER_ERROR";
}

/**
 * placementAnalyticsState(placement) -> one of core.ANALYTICS_STATE
 * Pure - derived from the placement's OWN already-persisted state, never
 * mutates it. AWAITING_METRICS/EARLY/MATURE are about the LOCAL metrics
 * history, not the provider - callers pass snapshotCount if known.
 */
export function placementAnalyticsState(placement, { snapshotCount = 0, hasError = false } = {}) {
  if (!placement?.buffer_provider_ref) return "NOT_PUBLISHED";
  if (placement.status !== "PUBLISHED" && !placement.published_at) return "AWAITING_METRICS"; // scheduled/queued, not yet live
  if (hasError && snapshotCount === 0) return "METRICS_UNAVAILABLE";
  if (snapshotCount === 0) return "AWAITING_METRICS";
  if (snapshotCount < 3) return "EARLY_METRICS";
  const ageMs = placement.published_at ? Date.now() - new Date(placement.published_at).getTime() : 0;
  if (ageMs > 28 * 24 * 3600_000) return "FINALIZED";
  return "MATURE_METRICS";
}

/**
 * collectOnePlacementMetrics(placement, { env, provider, persist }) ->
 *   { ok, state, snapshot?, reason?, failure_class? }
 * READ-ONLY against the provider. Never alters the placement's
 * publication state, provider_ref, captions, or assets (§27) - it only
 * ever calls provider.getPostMetrics() and, if `persist`, appends an
 * immutable row via recordMetricSnapshot() (INSERT-only).
 */
export async function collectOnePlacementMetrics(placement, { env = process.env, provider = null, persist = true } = {}) {
  if (!placement?.buffer_provider_ref) return { ok: false, state: "NOT_PUBLISHED", reason: "no provider_ref - nothing to measure yet" };
  const prov = provider ?? getSocialProvider(env);
  if (!prov?.isConfigured?.()) return { ok: false, state: "METRICS_UNAVAILABLE", failure_class: "METRICS_AUTH_FAILURE", reason: "provider not configured" };

  const r = await prov.getPostMetrics(placement.buffer_provider_ref);
  if (!r?.ok) {
    const failureClass = classifyMetricsFailure(r?.reason, r?.detail);
    return { ok: false, state: "METRICS_ERROR", failure_class: failureClass, reason: r?.reason ?? "unknown" };
  }

  const norm = normalizeProviderMetrics(r.metrics, placement.platform);
  const snapshot = buildSnapshot({ platform: placement.platform, metrics: norm.metrics, unsupported: norm.unsupported, units: norm.units, metricsUpdatedAt: r.metricsUpdatedAt, source: "buffer" });

  let persistResult = null;
  if (persist) persistResult = await recordMetricSnapshot({ placement, snapshot, source: "buffer" });

  return { ok: true, state: snapshot.metrics ? "EARLY_METRICS" : "AWAITING_METRICS", snapshot, reported: norm.reported, persist: persistResult };
}

/**
 * collectPublishedPostMetrics({ env, provider, persist, storyId }) ->
 *   { ok, collected:[{placement_id, platform, result}], skipped:[...] }
 * The exported hook a FUTURE cron/autopilot phase can call (§33) - NOT
 * scheduled or activated by this phase. Reads every PUBLISHED (or
 * BUFFER_QUEUED-with-a-real-provider_ref, so a just-gone-live post is
 * covered even before local status is reconciled) placement and collects
 * a snapshot for each. READ-ONLY.
 */
export async function collectPublishedPostMetrics({ env = process.env, provider = null, persist = true, storyId = null } = {}) {
  const { rows, ready } = await db.loadPlacements({ statuses: null, limit: 500 });
  if (!ready) return { ok: false, reason: "social_story_placements not reachable", collected: [], skipped: [] };
  const targets = rows.filter((r) => r.buffer_provider_ref && (!storyId || r.story_id === storyId));
  const collected = [];
  const skipped = [];
  for (const placement of targets) {
    // eslint-disable-next-line no-await-in-loop
    const result = await collectOnePlacementMetrics(placement, { env, provider, persist });
    (result.ok ? collected : skipped).push({ placement_id: placement.placement_id, platform: placement.platform, result });
  }
  return { ok: true, collected, skipped, total: targets.length };
}
