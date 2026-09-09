// Phase SOCIAL-AUTOPILOT-1 §12/§15 - BUFFER HANDOFF (DRY-RUN ONLY THIS PHASE).
//
// buildBufferPlacement / queueBufferPlacement / reconcileBufferPlacement.
// Reuses the EXISTING Buffer provider adapter (lib/social/providers/buffer)
// and the EXISTING social_story_placements table (SOCIAL-NEWSROOM-1/2
// schema) - no second implementation, no new table.
//
// THIS PHASE NEVER CALLS THE REAL PROVIDER. queueBufferPlacement has no
// code path that reaches provider.createPost - it only computes what
// WOULD be submitted and returns a SIMULATED result. Wiring the real
// submit call is explicitly deferred to a future phase per the owner's
// "do not publish anything during this phase" instruction (§26).
//
// Idempotency: the dedupe key is deterministic - story_id + snapshot_hash
// + platform + placement_type. A rerun of the SAME snapshot for the SAME
// platform always produces the SAME placement_id, so upserting it (as
// db.upsertPlacements already does, on the placement_id primary key) can
// never create a duplicate row, live or simulated.

import { createHash } from "node:crypto";

export const BUFFER_HANDOFF_VERSION = "auto1.1";

export function placementDedupeKey({ storyId, snapshotHash, platform, placementType }) {
  return createHash("sha256").update(`${storyId}::${snapshotHash}::${platform}::${placementType}`).digest("hex").slice(0, 24);
}

/**
 * Pure - builds the placement row shape (matches social_story_placements'
 * columns) without touching the network or the DB. Never sets
 * published_at; that only happens from verified provider evidence.
 */
export function buildBufferPlacement({ storyPackage, platform, placementType, assetHash, captionText, scheduledFor = null }) {
  if (!storyPackage?.snapshot?.snapshot_hash) {
    return { ok: false, state: "BUFFER_HOLD", reason: "no locked snapshot - refusing to build a placement from an unfrozen story", platform };
  }
  const dedupeKey = placementDedupeKey({ storyId: storyPackage.story_id, snapshotHash: storyPackage.snapshot.snapshot_hash, platform, placementType });
  return {
    ok: true,
    placement: {
      placement_id: dedupeKey,
      story_id: storyPackage.story_id,
      platform,
      placement_type: placementType,
      planned_for: scheduledFor,
      status: "PLANNED",
      content_id: dedupeKey,
      artifact_hash: assetHash ?? null,
      caption_style: { caption_sha256: captionText ? createHash("sha256").update(captionText).digest("hex") : null },
      buffer_provider_ref: null,
      scheduled_for: scheduledFor,
      provider_state: null,
      published_at: null,
    },
  };
}

/**
 * DRY-RUN ONLY. Simulates submitting `placement` to Buffer and returns
 * what the real call WOULD do, without any network access. `existing` is
 * the caller's already-loaded set of placement_ids (from
 * db.loadPlacements) used to prove idempotency - a placement whose id is
 * already present is reported ALREADY_QUEUED, never resubmitted.
 */
export function queueBufferPlacement(placement, { existingPlacementIds = new Set(), dryRun = true } = {}) {
  if (!dryRun) {
    // Defence in depth: this phase ships no live path. Any caller that
    // somehow flips dryRun=false still gets refused here, not a real call.
    return { ok: false, simulated: false, state: "BUFFER_HOLD", reason: "live Buffer submission is not wired in SOCIAL-AUTOPILOT-1 - dry-run only", placement_id: placement.placement_id };
  }
  if (existingPlacementIds.has(placement.placement_id)) {
    return { ok: true, simulated: true, outcome: "ALREADY_QUEUED", placement_id: placement.placement_id };
  }
  return {
    ok: true, simulated: true, outcome: "WOULD_QUEUE",
    placement_id: placement.placement_id,
    would_submit: { platform: placement.platform, placement_type: placement.placement_type, scheduled_for: placement.scheduled_for },
  };
}

/**
 * Reconciliation (§15) - given a set of ALREADY-queued placements (real
 * provider_state values, from a future live phase) and a matching set of
 * fresh polled states, compute what changed. Pure; does not poll itself.
 */
export function reconcileBufferPlacement(placement, polledState = null) {
  if (!polledState) return { ...placement, provider_state: placement.provider_state ?? "unknown" };
  const nextStatus = polledState === "sent" ? "PUBLISHED" : placement.status;
  return {
    ...placement,
    provider_state: polledState,
    status: nextStatus,
    published_at: nextStatus === "PUBLISHED" ? (placement.published_at ?? new Date().toISOString()) : placement.published_at,
  };
}

export function summarizeReconciliation(placements = []) {
  const buckets = { queued: 0, scheduled: 0, published: 0, failed: 0, deleted: 0, unknown: 0 };
  for (const p of placements) {
    const s = String(p.provider_state ?? "unknown").toLowerCase();
    if (s in buckets) buckets[s]++;
    else if (s === "sent") buckets.published++;
    else if (s === "error") buckets.failed++;
    else buckets.unknown++;
  }
  return buckets;
}
