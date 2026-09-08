// Phase SOCIAL-CREATIVE-4C - MOTION-NATIVE SHORT-FORM VIDEO ENGINE barrel.
//
//   verified newsroom story (image + caption already audited + owner-reviewable)
//     -> directVideo()          motion-native scene plan (§2-§20)
//     -> auditVideo()           fact timeline + semantic audit (§21, §22)
//     -> auditVideoCraft()      pacing (§23) + motion quality (§24)
//     -> ONE 9:16 master + platform_handoff (TikTok / YouTube Shorts, §28)
//   renderVideoPlanToMp4()      -> real H.264 MP4 + poster PNG (§25)
//
// Reuses the existing safety stack unchanged (editorial gate, FACT_LOCK,
// semantic manifest, fact-source locks, CARD_METADATA_LOCK,
// visualization_data_manifest, source/timeframe locks, caption_handoff,
// website-first CTA, brand lock, printing identity proof). Nothing is
// published: no TikTok / YouTube upload, no Buffer, no cron, no RIGHTS
// change, no email, no eBay Browse.

import { failure } from "../editorial/failureStates.mjs";

export {
  directVideo, videoSemanticHash, VIDEO_DIRECTOR_VERSION,
  VIDEO_W, VIDEO_H, VIDEO_FPS, SAFE, DURATION_WINDOWS, BRAND_STRIP_TOP_PX,
} from "./videoDirector.mjs";
export {
  MOTION_LANGUAGE_VERSION, APPROVED_MOTIONS, APPROVED_MOTION_KEYS, BANNED_MOTIONS,
  ANTI_SLIDESHOW, isApprovedMotion, isBannedMotion, motionKind,
} from "./motionLanguage.mjs";
export {
  VIDEO_SEMANTIC_AUDIT_VERSION, auditVideo, auditVideoFactTimeline, auditVideoSemantics,
} from "./videoSemanticAudit.mjs";
export {
  VIDEO_PACING_VERSION, MOTION_QUALITY_DIMS, auditPacing, scoreMotionQuality, auditVideoCraft,
} from "./videoPacing.mjs";
export { buildVideoDocument, SEEK_JS } from "./videoDocument.mjs";
export { renderVideoPlanToMp4, probeMp4, VIDEO_RENDERER_VERSION } from "./videoRenderer.mjs";

import { directVideo } from "./videoDirector.mjs";
import { auditVideo } from "./videoSemanticAudit.mjs";
import { auditVideoCraft } from "./videoPacing.mjs";

/**
 * runVideoDirector({ story, semanticManifest, factTrace, captionHandoff,
 *                    cardImagePaths, family })
 *
 * Deterministic - builds and audits the plan; does NOT render (call
 * renderVideoPlanToMp4 with .plan for a real MP4). Returns:
 *   { ok, state, plan, audit, craft, blockers }
 */
export function runVideoDirector(opts = {}) {
  const { captionHandoff = null } = opts;

  const built = directVideo(opts);
  if (!built.ok) return { ok: false, state: built.state, reason: built.reason, plan: null };

  const audit = auditVideo({ plan: built, semanticManifest: opts.semanticManifest ?? {}, factTrace: opts.factTrace ?? [] });
  const craft = auditVideoCraft({ plan: built });

  const blockers = [];
  if (!captionHandoff || !captionHandoff.semantic_hash) blockers.push("VIDEO_CAPTION_LINK_MISSING - no verified caption_handoff to attach the video to (§29)");
  if (!(built.card_assets ?? []).length && built.family !== "market_shape") blockers.push("no real canonical card image resolved");
  if (built.family === "printing_compare" && (built.card_assets ?? []).length < 2) blockers.push("printing_compare needs TWO canonical card images (§13)");

  let state = "VIDEO_PLAN_READY";
  let ok = true;
  if (!audit.ok) { state = audit.state; ok = false; }
  else if (!craft.ok) { state = craft.state; ok = false; }
  else if (blockers.length) { state = "VIDEO_WITHHELD_PENDING_LINK"; ok = false; }

  return {
    ok,
    ...(ok ? { state: "VIDEO_PLAN_READY", at: new Date().toISOString() }
           : failure(
               ["VIDEO_SEMANTIC_FAIL", "VIDEO_FACT_FAIL", "VIDEO_PACING_HOLD", "VIDEO_MOTION_QUALITY_HOLD"].includes(state) ? state : "CAPTION_WITHHELD",
               ok ? "" : (audit.reason || craft.reason || blockers[0] || "video plan not ready"),
               { stage: "video_director" },
             )),
    plan: built,
    audit: { ...audit.verification, ok: audit.ok, findings: audit.findings ?? [] },
    craft: { pacing: craft.pacing, quality: craft.quality, ok: craft.ok, state: craft.state ?? null },
    blockers,
  };
}
