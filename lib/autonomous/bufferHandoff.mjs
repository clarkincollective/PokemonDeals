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
import { getSocialProvider } from "../social/providers/index.mjs";
import * as realDb from "../social/newsroom/db.mjs";
import { canSubmitLive } from "./productionSafety.mjs";
import { verifyPackageIntegrity } from "./packageIntegrity.mjs";
import { checkStale, fetchLiveRecordFor } from "./staleGuard.mjs";
import { evaluateQaGate } from "./qaGate.mjs";
import { resolveChannel } from "./channelResolution.mjs";
import { verifyNoSnapshotDrift } from "./storySnapshot.mjs";
import { assertMediaPresent, buildPlatformMediaPayload } from "./mediaPackage.mjs";
import { verifyCaptionEncoding } from "./captionEncoding.mjs";

export const BUFFER_HANDOFF_VERSION = "auto2.1";

// §12 - a small, closed failure taxonomy. Every provider/validation error
// is classified into exactly one of these before any retry decision is
// made - "unknown" is a real, distinct outcome, never silently folded
// into a generic failure.
export const FAILURE_CLASSES = Object.freeze([
  "AUTH_FAILURE", "RATE_LIMIT", "CHANNEL_NOT_FOUND", "ASSET_UPLOAD_FAILURE",
  "CAPTION_REJECTED", "PROVIDER_VALIDATION_FAILURE", "UNKNOWN_PROVIDER_STATE", "NETWORK_FAILURE",
]);

export function classifyProviderFailure(reason = "", detail = "") {
  const s = `${reason} ${detail}`.toLowerCase();
  if (/unauthorized|auth|token|forbidden|401|403/.test(s)) return "AUTH_FAILURE";
  if (/rate.?limit|429|too many requests/.test(s)) return "RATE_LIMIT";
  if (/channel|not_found_error|no.*organization/.test(s)) return "CHANNEL_NOT_FOUND";
  if (/asset|image|video|upload/.test(s)) return "ASSET_UPLOAD_FAILURE";
  if (/caption|text|invalid_input/.test(s)) return "CAPTION_REJECTED";
  if (/limit.?reached|invalid.?input|validation|unexpected.?error|rest.?proxy/.test(s)) return "PROVIDER_VALIDATION_FAILURE";
  if (/timeout|network|fetch failed|econnreset|abort/.test(s)) return "NETWORK_FAILURE";
  return "UNKNOWN_PROVIDER_STATE";
}

// §12 - is a retry of THIS failure class ever safe to attempt automatically?
// Only RATE_LIMIT is (a bounded, delayed retry later) - everything else
// either needs reconciliation first (unknown outcome) or a human (auth/
// channel/asset/caption/validation faults do not fix themselves).
export function retryPolicyFor(failureClass) {
  if (failureClass === "RATE_LIMIT") return { safeToRetry: true, when: "bounded delayed retry (respect Retry-After)" };
  if (failureClass === "UNKNOWN_PROVIDER_STATE" || failureClass === "NETWORK_FAILURE") return { safeToRetry: false, when: "reconcile first - never resubmit on an unknown outcome" };
  return { safeToRetry: false, when: "operator attention required" };
}

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

// ==========================================================================
// SOCIAL-AUTOPILOT-2 §2/§6/§7/§9/§10 - THE REAL, LIVE SUBMIT PATH.
//
// Crash-recovery design (§6, documented exactly, not just claimed):
// Buffer's API has NO request-level idempotency key (see
// lib/social/providers/buffer.mjs's own header comment). The classic
// failure - request succeeds at the provider, this process dies before
// persisting provider_ref, a rerun creates a duplicate - is therefore NOT
// perfectly automatically recoverable. The safe design is:
//   1. Persist status:"BUFFER_SUBMITTING" to the DB FIRST, durably,
//      BEFORE the network call.
//   2. Call the provider.
//   3a. On a clean accept/reject, persist the outcome immediately
//       (BUFFER_QUEUED+provider_ref, or a classified failure) - done.
//   3b. If the process dies between step 1 and a confirmed 3a outcome,
//       the row is left at BUFFER_SUBMITTING with no provider_ref. The
//       NEXT run's submitBufferPlacementLive() sees this and REFUSES to
//       resubmit - it returns state:"BUFFER_SUBMIT_UNKNOWN" and requires
//       a human to check Buffer's queue directly and either clear the row
//       back to OWNER_APPROVED (nothing was created) or attach the real
//       provider_ref by hand (something was created). This is the
//       honest ceiling of safety without a provider-side idempotency key
//       - "resubmit and risk a duplicate" is never chosen over "hold and
//       ask a human".
export async function submitBufferPlacementLive(placement, pkg, { env = process.env, provider = null, db = realDb, mediaPackage = null } = {}) {
  // §8 (SOCIAL-AUTOPILOT-3) - the hard rule this phase exists to enforce:
  // a media-required placement can NEVER submit with assets:[]. Checked
  // before anything else touches the DB or the network.
  const mediaCheck = assertMediaPresent(mediaPackage, placement.platform);
  if (!mediaCheck.ok) return { ok: false, submitted: false, state: "MEDIA_REQUIRED_FAIL", reason: mediaCheck.reason };
  const gate = canSubmitLive(pkg, env);
  if (!gate.ok) return { ok: false, submitted: false, state: "BUFFER_HOLD", reason: gate.reason };

  const integrity = verifyPackageIntegrity(pkg, placement, mediaPackage);
  if (!integrity.ok) return { ok: false, submitted: false, state: "PLACEMENT_PACKAGE_DRIFT_FAIL", reason: integrity.mismatches.join("; ") };

  // SOCIAL-AUTOPILOT-4 §2/§4 - the caption that would actually be sent
  // must pass encoding verification immediately before submit, not just
  // whenever it was originally generated.
  const captionKeyForEncoding = placement.platform === "tiktok" || placement.platform === "youtube_shorts" ? "x" : placement.platform;
  const captionTextForEncoding = pkg.captions?.[captionKeyForEncoding]?.caption_text ?? "";
  const encodingCheck = verifyCaptionEncoding(captionTextForEncoding);
  if (!encodingCheck.ok) return { ok: false, submitted: false, state: "CAPTION_ENCODING_FAIL", reason: encodingCheck.reason };

  // §2/§10 - re-verify snapshot drift FRESH against the semantic manifest
  // actually attached to the package right now, independent of whatever
  // qaGate._sources recorded earlier in the pipeline.
  if (pkg.semantic_manifest) {
    const drift = verifyNoSnapshotDrift(pkg.snapshot, { comparison_direction: pkg.semantic_manifest.comparison_direction ?? pkg.snapshot?.comparison_direction }, { stage: "pre_submit" });
    if (!drift.ok) return { ok: false, submitted: false, state: "STORY_SNAPSHOT_DRIFT_FAIL", reason: drift.reason };
  }

  // re-verify the QA gate FRESH, immediately before the network call -
  // not just at BUFFER_READY build time (§2).
  const gateEval = evaluateQaGate(pkg);
  if (!gateEval.ok) return { ok: false, submitted: false, state: "PLATFORM_HOLD", reason: `QA gate failed at final pre-submit check: ${gateEval.results.filter((r) => r.verdict !== "PASS" && r.verdict !== "N_A").map((r) => r.key).join(", ")}` };

  // §9 - re-run the stale check fresh, without mutating the snapshot.
  const live = await fetchLiveRecordFor(pkg.snapshot).catch(() => null);
  const stale = checkStale(pkg.snapshot, live);
  if (!stale.ok) return { ok: false, submitted: false, state: stale.state === "LISTING_GONE_FAIL" ? "LISTING_GONE_HOLD" : "STALE_HOLD", reason: stale.reason };

  // §6 crash-recovery: reload the row's CURRENT DB state right before acting.
  const current = await db.getPlacement(placement.placement_id);
  if (current.ready && current.row) {
    if (current.row.buffer_provider_ref) {
      return { ok: true, submitted: false, state: "ALREADY_SUBMITTED", reason: "placement already has a provider_ref - reconcile, do not resubmit", provider_ref: current.row.buffer_provider_ref };
    }
    if (current.row.status === "BUFFER_SUBMITTING") {
      return { ok: false, submitted: false, state: "BUFFER_SUBMIT_UNKNOWN", reason: "a prior submit attempt left this placement at BUFFER_SUBMITTING with no provider_ref - reconcile with the provider by hand before any resubmit" };
    }
  }

  const channel = resolveChannel(placement.platform);
  if (!channel.ok) return { ok: false, submitted: false, state: "PLATFORM_HOLD", reason: channel.reason };

  // §6 step 1 - persist BEFORE the network call.
  await db.patchPlacement(placement.placement_id, { status: "BUFFER_SUBMITTING" });

  const prov = provider ?? getSocialProvider(env);
  if (!prov.isConfigured?.()) {
    await db.patchPlacement(placement.placement_id, { status: "BUFFER_HOLD" });
    return { ok: false, submitted: false, state: "CHANNEL_NOT_FOUND", reason: "BUFFER_ACCESS_TOKEN not configured" };
  }

  const captionKey = placement.platform === "tiktok" || placement.platform === "youtube_shorts" ? "x" : placement.platform;
  const caption = pkg.captions?.[captionKey]?.caption_text ?? "";
  // §7 (SOCIAL-AUTOPILOT-3) - the ONE place a verified media package
  // becomes a provider asset entry. mediaCheck already proved this
  // platform has a PUBLIC_VERIFIED hosted URL before we got here.
  const mediaPayload = buildPlatformMediaPayload(pkg, placement.platform, mediaPackage);
  if (!mediaPayload.ok) { // defensive - assertMediaPresent above should have already caught this
    await db.patchPlacement(placement.placement_id, { status: "BUFFER_HOLD" });
    return { ok: false, submitted: false, state: "MEDIA_REQUIRED_FAIL", reason: mediaPayload.reason };
  }
  const msg = {
    channelId: channel.channelId, platform: channel.service === "twitter" ? "x" : placement.platform,
    text: caption, assets: mediaPayload.assets, postType: mediaPayload.postType,
    dueAt: placement.scheduled_for, saveToDraft: false, schedulingType: "automatic",
  };

  let res;
  try {
    res = await prov.createPost(msg);
  } catch (e) {
    res = { accepted: false, reason: "provider_exception", detail: String(e?.message ?? e).slice(0, 300) };
  }

  if (res?.accepted && res.id) {
    await db.patchPlacement(placement.placement_id, { status: "BUFFER_QUEUED", buffer_provider_ref: res.id, provider_state: res.statusRaw ?? null, scheduled_for: placement.scheduled_for });
    return { ok: true, submitted: true, state: "BUFFER_QUEUED", provider_ref: res.id, provider_state: res.statusRaw ?? null };
  }

  const failureClass = classifyProviderFailure(res?.reason, res?.detail);
  // §7 - an ambiguous outcome (no clear accept, no clear reject reason we
  // can classify) is never silently treated as a clean failure that's
  // safe to retry - it stays BUFFER_SUBMIT_UNKNOWN for reconciliation.
  const finalState = failureClass === "UNKNOWN_PROVIDER_STATE" ? "BUFFER_SUBMIT_UNKNOWN" : "BUFFER_HOLD";
  await db.patchPlacement(placement.placement_id, { status: finalState, provider_state: res?.reason ?? "unknown" });
  return { ok: false, submitted: false, state: finalState, reason: res?.reason ?? "provider did not accept the post", detail: res?.detail ?? null, failure_class: failureClass, retry_policy: retryPolicyFor(failureClass) };
}

// §11 - reconciliation against the REAL provider. Never resubmits; only
// reads and maps provider truth into our own states.
export async function reconcileBufferPlacementLive(placement, { env = process.env, provider = null, db = realDb } = {}) {
  if (!placement.buffer_provider_ref) {
    return { ok: false, state: "UNKNOWN", reason: "no provider_ref to reconcile against" };
  }
  const prov = provider ?? getSocialProvider(env);
  if (!prov.isConfigured?.()) return { ok: false, state: "UNKNOWN", reason: "provider not configured" };
  const st = await prov.getPostStatus(placement.buffer_provider_ref);
  if (!st.ok) {
    const state = st.reason === "buffer_post_not_found" ? "DELETED" : "UNKNOWN";
    await db.patchPlacement(placement.placement_id, { provider_state: st.reason ?? "unknown" });
    return { ok: false, state, reason: st.reason };
  }
  const patch = { provider_state: st.statusRaw ?? null };
  let state = "BUFFER_QUEUED";
  if (st.published) { state = "PUBLISHED"; patch.status = "PUBLISHED"; patch.published_at = st.publishedAt; if (st.platformPostUrl) patch.platform_post_url = st.platformPostUrl; }
  else if (st.failed) { state = "FAILED"; patch.status = "BUFFER_HOLD"; }
  await db.patchPlacement(placement.placement_id, patch);
  return { ok: true, state, published: st.published === true, publishedAt: st.publishedAt ?? null, platformPostUrl: st.platformPostUrl ?? null };
}

// §14 - cancel exactly ONE placement. Requires the exact placement_id +
// its current provider_ref; refuses a post that has already sent
// (guarded again inside providers/buffer.mjs's own deletePost); cannot be
// called with a family/platform/story-wide selector - one call, one post.
export async function cancelBufferPlacementLive(placementId, { env = process.env, provider = null, db = realDb } = {}) {
  if (!placementId || typeof placementId !== "string") return { ok: false, cancelled: false, reason: "an exact placement_id is required" };
  const current = await db.getPlacement(placementId);
  if (!current.ready || !current.row) return { ok: false, cancelled: false, reason: "placement not found" };
  if (!current.row.buffer_provider_ref) return { ok: false, cancelled: false, reason: "placement has no provider_ref - nothing to cancel at the provider" };
  const prov = provider ?? getSocialProvider(env);
  if (!prov.isConfigured?.() || typeof prov.deletePost !== "function") return { ok: false, cancelled: false, reason: "provider not configured or does not support deletion" };
  const res = await prov.deletePost(current.row.buffer_provider_ref);
  if (res.deleted) await db.patchPlacement(placementId, { status: "CANCELLED", provider_state: "deleted" });
  return { ok: res.ok, cancelled: Boolean(res.deleted), reason: res.reason ?? null, statusRaw: res.statusRaw ?? null };
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
