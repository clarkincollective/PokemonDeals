// Phase SOCIAL-AUTOPILOT-1 §10 - VIDEO STAGE.
//
// Thin wrapper around the APPROVED, FROZEN 4C.7 video architecture
// (lib/newsroom/video/professionalSocialLoop.runProfessionalSocialLoop) -
// no new rendering mode, no next-phase video engine, no restoring
// 4C/4C.1/4C.2/4C.3. This
// module only decides WHETHER a family gets a video at all and passes
// through the exact same creative (cache-hit) + caption_handoff this
// story package already resolved - it builds nothing new visually.

import { runProfessionalSocialLoop } from "../newsroom/video/professionalSocialLoop.mjs";
import { failure, isFailureState } from "../newsroom/editorial/failureStates.mjs";

export const VIDEO_STAGE_VERSION = "auto1.1";

// Families the 4C.7 derivative supports today (videoSafeDerivative.mjs's
// own FRAME_DENSITY_BANDS keys). A pure-aggregate family with no example
// card (price_band_insight) and evergreen education (no live facts to
// visualize as a comparison/chart) are N/A, not a failure.
const VIDEO_ELIGIBLE_FAMILIES = Object.freeze({
  deal_drop: "deal_hero",
  three_under_25: "three_up",
  market_snapshot: "market_shape",
  asking_vs_sold: "asking_vs_sold",
  printing_compare: "printing_compare",
});

export function videoApplicable(family) {
  return Object.prototype.hasOwnProperty.call(VIDEO_ELIGIBLE_FAMILIES, family);
}

export function resolveVideo(pkg, { semanticManifest, factLock, cardImagePaths = [], heroCardId = null, heroCardName = null, cacheDir = null, ctaCacheDir = undefined } = {}) {
  if (!videoApplicable(pkg.family)) {
    return { ok: true, video: null, applicable: false };
  }
  if (!pkg.captions?.caption_handoff) {
    return { ok: false, ...failure("VIDEO_CAPTION_LINK_MISSING", "no caption_handoff to attach - video must not be built ahead of its caption", { story_id: pkg.story_id }) };
  }
  const family = VIDEO_ELIGIBLE_FAMILIES[pkg.family];
  const result = runProfessionalSocialLoop({
    story: { story_id: pkg.story_id, subject_id: pkg.story_id },
    semanticManifest, factLock, captionHandoff: pkg.captions.caption_handoff,
    cardImagePaths, heroCardId, heroCardName, family, cacheDir, ctaCacheDir,
  });
  if (!result.ok) {
    const state = isFailureState(result.state) ? result.state : "VIDEO_RENDER_FAILED";
    return { ok: false, applicable: true, ...failure(state, result.reason ?? "video plan failed", { story_id: pkg.story_id, detail: result.state }), video: result };
  }
  return { ok: true, applicable: true, video: result };
}
