// Phase SOCIAL-ANALYTICS-1 §3/§34 - METRIC SNAPSHOT PERSISTENCE.
//
// Reuses the EXISTING normalization model (lib/social/distribution/
// metrics.mjs, Phase 13E.7A) - this module is ONLY persistence for the
// CURRENT (AUTOPILOT/DISCOVERY) placement system's real Supabase-backed
// social_story_placements rows. social_post_metric_snapshots is append-
// only: a sync NEVER updates or deletes a prior row (see the migration's
// own comment). Every read here degrades gracefully (empty/not-ready) if
// the migration has not been applied yet - nothing in this codebase ever
// throws because this table happens to be missing.

import { createHash } from "node:crypto";
import { supabaseAdmin } from "../../supabaseAdmin.js";

export const METRICS_HISTORY_VERSION = "analytics1.1";

let _probe = null;
export async function metricsTableReady(db = supabaseAdmin()) {
  if (_probe != null) return _probe;
  const { error } = await db.from("social_post_metric_snapshots").select("id").limit(1);
  _probe = !error;
  return _probe;
}
export function _resetMetricsProbe() { _probe = null; }

/**
 * dedupeKeyFor({ placementId, providerMetricsUpdatedAt, observedAt }) -> string
 * Prefers the PROVIDER's own freshness stamp (a real observation is only
 * "new" if the provider's numbers actually moved); falls back to the
 * observation hour so two syncs run back-to-back with no provider
 * timestamp still collapse into one row rather than spamming duplicates.
 */
export function dedupeKeyFor({ placementId, providerMetricsUpdatedAt = null, observedAt = new Date().toISOString() }) {
  const basis = providerMetricsUpdatedAt ?? String(observedAt).slice(0, 13); // hour granularity fallback
  return createHash("sha256").update(`${placementId}::${basis}`).digest("hex").slice(0, 32);
}

/**
 * recordMetricSnapshot({ placement, snapshot, source, dedupe }) ->
 *   { ok, ready, written, deduped, reason? }
 * Read-only against the PROVIDER (the caller already did that); this is
 * the one, only, INSERT (never update/delete) against
 * social_post_metric_snapshots. `snapshot` is the buildSnapshot() shape
 * from lib/social/distribution/metrics.mjs.
 */
export async function recordMetricSnapshot({ placement, snapshot, source = "buffer", collectorVersion = METRICS_HISTORY_VERSION } = {}) {
  const db = supabaseAdmin();
  if (!(await metricsTableReady(db))) return { ok: false, ready: false, written: false, reason: "social_post_metric_snapshots not migrated yet - see supabase/social_analytics_migration.sql" };
  if (!placement?.placement_id) return { ok: false, ready: true, written: false, reason: "no placement_id" };

  const dedupe_key = dedupeKeyFor({ placementId: placement.placement_id, providerMetricsUpdatedAt: snapshot.provider_metrics_updated_at, observedAt: snapshot.captured_at });
  const postAgeSeconds = placement.published_at
    ? Math.max(0, Math.round((new Date(snapshot.captured_at).getTime() - new Date(placement.published_at).getTime()) / 1000))
    : null;

  const row = {
    placement_id: placement.placement_id,
    story_id: placement.story_id ?? null,
    snapshot_hash: placement.snapshot_hash ?? null,
    provider_ref: placement.buffer_provider_ref ?? null,
    platform: placement.platform,
    channel: placement.channel ?? null,
    observed_at: snapshot.captured_at,
    published_at: placement.published_at ?? null,
    post_age_seconds: postAgeSeconds,
    metrics: snapshot.metrics,
    unsupported: snapshot.unsupported ?? [],
    units: snapshot.units ?? {},
    provider_metrics_raw_sanitized: snapshot.raw_sanitized ?? null,
    provider_metrics_updated_at: snapshot.provider_metrics_updated_at ?? null,
    source,
    collector_version: collectorVersion,
    dedupe_key,
  };

  // §37 test 35 - a duplicate observation is deduped SAFELY: the unique
  // index on dedupe_key means a repeat insert is a harmless no-op, not an
  // error and not a second row.
  const { error } = await db.from("social_post_metric_snapshots").upsert(row, { onConflict: "dedupe_key", ignoreDuplicates: true });
  if (error) return { ok: false, ready: true, written: false, reason: error.message };
  return { ok: true, ready: true, written: true, dedupe_key };
}

/** loadMetricSnapshots(placementId, { limit }) -> { ready, rows } - oldest first. */
export async function loadMetricSnapshots(placementId, { limit = 200 } = {}) {
  const db = supabaseAdmin();
  if (!(await metricsTableReady(db))) return { ready: false, rows: [] };
  const { data, error } = await db
    .from("social_post_metric_snapshots")
    .select("*")
    .eq("placement_id", placementId)
    .order("observed_at", { ascending: true })
    .limit(limit);
  if (error) return { ready: true, rows: [], error: error.message };
  return { ready: true, rows: data ?? [] };
}

/** loadRecentSnapshots({ platform, limit }) -> { ready, rows } - newest first, for aggregate summaries. */
export async function loadRecentSnapshots({ platform = null, limit = 500 } = {}) {
  const db = supabaseAdmin();
  if (!(await metricsTableReady(db))) return { ready: false, rows: [] };
  let q = db.from("social_post_metric_snapshots").select("*").order("observed_at", { ascending: false }).limit(limit);
  if (platform) q = q.eq("platform", platform);
  const { data, error } = await q;
  if (error) return { ready: true, rows: [], error: error.message };
  return { ready: true, rows: data ?? [] };
}

/** latestSnapshotFor(placementId) -> { ready, snapshot } - the newest row, or null. */
export async function latestSnapshotFor(placementId) {
  const { ready, rows } = await loadMetricSnapshots(placementId, { limit: 1000 });
  return { ready, snapshot: rows.length ? rows[rows.length - 1] : null };
}
