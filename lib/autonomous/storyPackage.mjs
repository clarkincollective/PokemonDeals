// Phase SOCIAL-AUTOPILOT-1 §6/§13 - THE SOCIAL STORY PACKAGE + STATE MACHINE.
//
// One persisted canonical object moves through the whole system. This
// module owns its shape and its strict, no-skip-gates state machine.
// Separate from lib/social/newsroom/story.mjs's STORY_STATES (the older
// NEWSROOM-1/2 editorial-template pipeline) - this is the new
// FULL_GENERATIVE_SOCIAL + 4C.7 pipeline's own, more granular states, per
// this phase's explicit §13 list. Both state machines may coexist; they
// govern different creative substrates and never share a row.

export const STORY_PACKAGE_VERSION = "auto1.1";

// §13 - the strict progressive path. SOCIAL-AUTOPILOT-2 (§3) inserts a real
// owner-approval + crash-safe submitting step between the simulated
// BUFFER_READY gate and BUFFER_QUEUED, for the LIVE path only -
// AUTOPILOT-1's dry-run proof still goes BUFFER_READY -> BUFFER_QUEUED
// directly (disambiguated by publishing.mode, never by skipping a real
// provider gate).
export const PACKAGE_STATES = Object.freeze([
  "DISCOVERED",
  "CANDIDATE",
  "EDITORIAL_READY",
  "SNAPSHOT_LOCKED",
  "CREATIVE_READY",
  "CAPTION_READY",
  "VIDEO_READY",
  "QA_READY",
  "BUFFER_READY",
  "OWNER_APPROVED",
  "BUFFER_SUBMITTING",
  "BUFFER_QUEUED",
  "PUBLISHED",
  "RECONCILED",
]);

// §13 - failure states. A HOLD is where a package stops; it is NEVER
// force-advanced past a failed gate ("best effort" publishing is banned).
export const PACKAGE_HOLD_STATES = Object.freeze([
  "EDITORIAL_HOLD",
  "FACT_HOLD",
  "ASSET_HOLD",
  "CAPTION_HOLD",
  "VIDEO_HOLD",
  "PLATFORM_HOLD",
  "BUFFER_HOLD",
  "STALE_HOLD",
  // SOCIAL-AUTOPILOT-2 (§9) - the live listing a deal-family story was
  // built on no longer exists, distinct from "still exists but moved" -
  // never silently folded into the generic STALE_HOLD.
  "LISTING_GONE_HOLD",
  // SOCIAL-AUTOPILOT-2 (§7/§12) - a provider response that cannot be
  // trusted as accept/reject. Reconciliation must resolve it before any
  // further submit attempt for this placement.
  "BUFFER_SUBMIT_UNKNOWN",
]);

const NEXT = Object.freeze({
  DISCOVERED: ["CANDIDATE", "EDITORIAL_HOLD"],
  CANDIDATE: ["EDITORIAL_READY", "EDITORIAL_HOLD"],
  EDITORIAL_READY: ["SNAPSHOT_LOCKED", "EDITORIAL_HOLD"],
  SNAPSHOT_LOCKED: ["CREATIVE_READY", "FACT_HOLD", "ASSET_HOLD"],
  // CAPTION_HOLD is reachable directly from here too (SOCIAL-DISCOVERY-1
  // found this real gap): resolveCaptions() can return ok:false - EVERY
  // platform failed, not just one going HOLD after CAPTION_READY - and
  // runOnePackage transitions straight to CAPTION_HOLD without ever
  // reaching CAPTION_READY in that case.
  CREATIVE_READY: ["CAPTION_READY", "CAPTION_HOLD", "ASSET_HOLD", "FACT_HOLD"],
  CAPTION_READY: ["VIDEO_READY", "VIDEO_HOLD", "CAPTION_HOLD", "FACT_HOLD"],
  // VIDEO_READY is optional (not every family gets a video) - a package
  // may go straight from CAPTION_READY to QA_READY when video is N/A.
  VIDEO_READY: ["QA_READY", "VIDEO_HOLD"],
  QA_READY: ["BUFFER_READY", "PLATFORM_HOLD", "STALE_HOLD", "FACT_HOLD"],
  // AUTOPILOT-1's simulated dry-run proof goes straight to BUFFER_QUEUED.
  // AUTOPILOT-2's real path goes through OWNER_APPROVED + BUFFER_SUBMITTING
  // first - both arrive at the SAME BUFFER_QUEUED state, disambiguated by
  // `publishing.mode` ("MANUAL_REVIEW_DRY_RUN" vs "LIVE_SUBMIT"), never by
  // skipping a real gate.
  BUFFER_READY: ["BUFFER_QUEUED", "OWNER_APPROVED", "BUFFER_HOLD", "STALE_HOLD"],
  OWNER_APPROVED: ["BUFFER_SUBMITTING", "BUFFER_HOLD"],
  BUFFER_SUBMITTING: ["BUFFER_QUEUED", "BUFFER_HOLD", "BUFFER_SUBMIT_UNKNOWN"],
  BUFFER_QUEUED: ["PUBLISHED", "BUFFER_HOLD"],
  PUBLISHED: ["RECONCILED"],
  RECONCILED: [],
  // holds: a human/re-run can send it back to CANDIDATE for a fresh
  // snapshot+attempt, or terminate it. A hold never skips forward.
  EDITORIAL_HOLD: ["CANCELLED"],
  FACT_HOLD: ["CANCELLED"],
  ASSET_HOLD: ["CANCELLED"],
  CAPTION_HOLD: ["CANCELLED"],
  VIDEO_HOLD: ["QA_READY", "CANCELLED"], // a video hold may still allow static-only platforms through
  PLATFORM_HOLD: ["CANCELLED"],
  BUFFER_HOLD: ["CANCELLED"],
  STALE_HOLD: ["CANCELLED"],
  LISTING_GONE_HOLD: ["CANCELLED"],
  // a provider response we cannot trust: reconcile, never resubmit blind.
  BUFFER_SUBMIT_UNKNOWN: ["BUFFER_QUEUED", "BUFFER_HOLD", "CANCELLED"],
  CANCELLED: [],
});

export function canAdvance(from, to) {
  return (NEXT[from] ?? []).includes(to);
}

export function isHold(state) {
  return PACKAGE_HOLD_STATES.includes(state);
}
export function isTerminal(state) {
  return state === "RECONCILED" || state === "CANCELLED" || isHold(state);
}

// Advance a package's status, refusing any transition NEXT doesn't allow -
// "no skipping gates" is enforced here, not just by convention.
export function transition(pkg, to, { reason = null, now = Date.now() } = {}) {
  const from = pkg.status;
  if (!canAdvance(from, to)) {
    throw new Error(`storyPackage: illegal transition ${from} -> ${to}`);
  }
  const at = new Date(now).toISOString();
  return {
    ...pkg,
    status: to,
    status_history: [...(pkg.status_history ?? []), { from, to, at, reason }],
    updated_at: at,
  };
}

// §3 - explicit, human-only approval. Only a BUFFER_READY package may be
// approved; approving does not itself submit anything (a separate,
// explicit submit step - lib/autonomous/bufferHandoff.submitBufferPlacementLive
// - still re-verifies everything before any provider call).
export function approveStoryPackage(pkg, { approvedBy, now = Date.now() } = {}) {
  if (pkg.status !== "BUFFER_READY") {
    throw new Error(`storyPackage: cannot approve from status ${pkg.status} (must be BUFFER_READY)`);
  }
  if (!approvedBy || typeof approvedBy !== "string") {
    throw new Error("storyPackage: approveStoryPackage requires an approvedBy string - approval must be attributable, never anonymous");
  }
  const at = new Date(now).toISOString();
  const approved = transition(
    { ...pkg, owner_review: { required: true, approved: true, approved_at: at, approved_by: approvedBy } },
    "OWNER_APPROVED",
    { reason: `approved by ${approvedBy}`, now }
  );
  return approved;
}

/**
 * §6 - the canonical shape. Every stage function in this phase reads and
 * returns one of these (never a bespoke ad hoc object), so the whole
 * pipeline is inspectable/persistable as ONE record at any point.
 */
export function makeStoryPackage({ storyId, family, series, editorialAngle, bucket, priority = 5, now = Date.now() } = {}) {
  const at = new Date(now).toISOString();
  return {
    story_id: storyId,
    family, series, editorial_angle: editorialAngle, bucket, priority,
    status: "DISCOVERED",
    status_history: [{ from: null, to: "DISCOVERED", at, reason: "discovered" }],
    created_at: at, updated_at: at,
    snapshot: null,
    editorial_decision: null,
    semantic_manifest: null,
    fact_lock: null,
    fact_trace: null,
    visualization_manifest: null,
    card_metadata_lock: null,
    creative: null,
    captions: null,
    video: null,
    platform_variants: null,
    qa: null,
    publishing: null,
    reconciliation: null,
    seo_handoff: null,
    reddit_handoff: null,
    scoring: null,
    diversity: null,
    // SOCIAL-AUTOPILOT-2 §3 - explicit, deterministic owner-approval gate.
    // Autopilot must never treat BUFFER_READY as automatic approval.
    owner_review: { required: true, approved: false, approved_at: null, approved_by: null },
  };
}
