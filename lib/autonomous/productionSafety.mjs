// Phase SOCIAL-AUTOPILOT-2 §4 - PRODUCTION KILL SWITCHES.
//
// Every flag here defaults to the SAFE value. Reading the environment is
// the ONLY thing this module does - it never writes config, never flips a
// flag, holds no credential. Fail-closed: a missing or ambiguous flag
// value is treated exactly like the flag being off.
//
// This is additive to (never a replacement for) the EXISTING distribution
// safety stack: RIGHTS_STATE.publishing, lib/social/distribution/config's
// SOCIAL_PUBLISH_ENABLED/SOCIAL_PUBLISH_DRY_RUN/SOCIAL_EPN_AI_CLASSIFICATION,
// and lib/autonomous/config's SOCIAL_AUTONOMOUS_* posture for the OLDER
// ledger/batch pipeline. A real live submit through THIS package's path
// (lib/autonomous/bufferHandoff.submitBufferPlacementLive) checks ITS OWN
// flags below - it does not read or depend on the older system's flags,
// and the older system does not read these.

const truthy = (v) => String(v ?? "").trim().toLowerCase() === "true";
const falsy = (v) => String(v ?? "").trim().toLowerCase() === "false";

/**
 * resolveProductionSafety(env) ->
 *   { autopilotEnabled, bufferLiveSubmit, videoEnabled, staticEnabled }
 *
 *   SOCIAL_AUTOPILOT_ENABLED   "true" -> the daily engine MAY select/build
 *                              stories unattended. Default false. This
 *                              phase never sets it true - runSocialAutopilot
 *                              also independently refuses mode:"AUTOPILOT"
 *                              regardless of this flag (defense in depth).
 *   SOCIAL_BUFFER_LIVE_SUBMIT  "true" -> a real Buffer provider call is
 *                              even POSSIBLE. Default false - anything
 *                              else (unset, "1", "yes", garbage) stays
 *                              false. queueBufferPlacement()/
 *                              submitBufferPlacementLive() both re-check
 *                              this independently of the caller.
 *   SOCIAL_VIDEO_ENABLED       "false" -> skip the video stage entirely
 *                              (static-only run). Default true (video
 *                              stage still runs its OWN QA independently).
 *   SOCIAL_STATIC_ENABLED      "false" -> skip static creative entirely -
 *                              an extreme kill switch (no creative at all
 *                              means no story can ever reach BUFFER_READY).
 *                              Default true.
 */
export function resolveProductionSafety(env = process.env) {
  return {
    // exact match required - "true" only; everything else is OFF.
    autopilotEnabled: truthy(env.SOCIAL_AUTOPILOT_ENABLED),
    bufferLiveSubmit: truthy(env.SOCIAL_BUFFER_LIVE_SUBMIT),
    // these two default ON; only an EXPLICIT "false" turns a stage off,
    // so an unset/garbage value never silently disables real content.
    videoEnabled: !falsy(env.SOCIAL_VIDEO_ENABLED),
    staticEnabled: !falsy(env.SOCIAL_STATIC_ENABLED),
  };
}

export function describeProductionSafety(s = resolveProductionSafety()) {
  return [
    `autopilot: ${s.autopilotEnabled ? "ENABLED" : "disabled (default)"}`,
    `Buffer live submit: ${s.bufferLiveSubmit ? "LIVE" : "off - dry-run only (default)"}`,
    `video stage: ${s.videoEnabled ? "on (default)" : "DISABLED"}`,
    `static creative: ${s.staticEnabled ? "on (default)" : "DISABLED"}`,
  ].join("  |  ");
}

// A single boolean gate a submit call-site checks FIRST, before touching
// the provider, the DB, or anything else. Fail closed on any falsy/absent
// production-safety AND owner-approval signal.
export function canSubmitLive(pkg, env = process.env) {
  const safety = resolveProductionSafety(env);
  if (!safety.bufferLiveSubmit) return { ok: false, reason: "SOCIAL_BUFFER_LIVE_SUBMIT is not \"true\"" };
  if (pkg?.owner_review?.approved !== true) return { ok: false, reason: "owner_review.approved is not true" };
  if (pkg?.status !== "OWNER_APPROVED") return { ok: false, reason: `package status is ${pkg?.status}, not OWNER_APPROVED` };
  return { ok: true };
}
