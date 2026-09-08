// Phase SOCIAL-CREATIVE-4C - VIDEO PACING AUDIT (§23) + MOTION QUALITY
// AUDIT (§24).
//
// Rejects anything that feels like a slideshow, a static poster, a
// repeated zoom, or a long dead hold. Scores motion polish, collector
// relevance, hierarchy, premium feel, readability, originality, platform
// fit, save/share and completion likelihood. The OWNER remains the final
// aesthetic gate - these are guard rails, not a certificate.
//
// Pure. No I/O, no OpenAI.

import { failure } from "../editorial/failureStates.mjs";
import { APPROVED_MOTIONS, ANTI_SLIDESHOW, isBannedMotion, motionKind } from "./motionLanguage.mjs";

export const VIDEO_PACING_VERSION = "4c.1";

// ---- §23 PACING AUDIT ---------------------------------
export function auditPacing({ plan = {} } = {}) {
  const scenes = plan.scenes ?? [];
  const dur = plan.duration ?? (scenes.at(-1)?.end_ms ?? 0);
  const A = ANTI_SLIDESHOW;
  const findings = [];
  const dims = {};

  // hook speed
  const hookEnd = plan.hook?.lands_by_ms ?? scenes[0]?.end_ms ?? 99999;
  dims.hook_speed = hookEnd <= A.hook_must_land_by_ms ? 20 : hookEnd <= 1800 ? 12 : 3;
  if (hookEnd > 2000) findings.push({ code: "VIDEO_PACING_HOLD", detail: `the hook does not land until ${hookEnd}ms (want <= ${A.hook_must_land_by_ms}ms)` });

  // no logo intro
  const firstScene = scenes[0];
  const leadsWithBrand = firstScene && /logo|wordmark|brand splash/i.test(firstScene.visual ?? "") && firstScene.purpose !== "cta";
  dims.no_logo_intro = leadsWithBrand ? 0 : 10;
  if (leadsWithBrand) findings.push({ code: "VIDEO_PACING_HOLD", detail: "the first scene leads with brand/logo, not the hook" });

  // scene count + lengths
  dims.scene_count = scenes.length >= A.min_scenes ? 10 : 3;
  if (scenes.length < A.min_scenes) findings.push({ code: "VIDEO_PACING_HOLD", detail: `only ${scenes.length} scenes (want >= ${A.min_scenes})` });

  let deadScenes = 0, tooShort = 0, tooLong = 0, banned = 0, activeScenes = 0, storyKindScenes = 0;
  const seenMotions = [];
  for (const s of scenes) {
    const len = s.end_ms - s.start_ms;
    if (len < A.min_scene_ms && s.purpose !== "hook") tooShort += 1;
    if (len > A.max_scene_ms) tooLong += 1;
    if (isBannedMotion(s.animation)) banned += 1;
    const kind = motionKind(s.animation);
    // "active" = any approved motion that is not a bare transition/hold.
    // Kinetic typography on a real figure IS motion-native.
    const active = Boolean(APPROVED_MOTIONS[s.animation]) && kind !== "transition";
    if (active) activeScenes += 1;
    // "story advancing" = an approved motion tied to something concrete:
    // a real card, a real stat asset, or a verified data ref. Kinetic
    // typography of a real figure counts; an untethered caption does not.
    if (active && (s.card_asset != null || s.stat_asset || (s.data_refs ?? []).length > 0)) storyKindScenes += 1;
    const isHold = !APPROVED_MOTIONS[s.animation];
    if (isHold && len > A.max_dead_hold_ms) deadScenes += 1;
    seenMotions.push(s.animation);
  }
  dims.scene_length = tooShort + tooLong === 0 ? 12 : Math.max(0, 12 - (tooShort + tooLong) * 4);
  if (tooLong) findings.push({ code: "VIDEO_PACING_HOLD", detail: `${tooLong} scene(s) longer than ${A.max_scene_ms}ms without sustained motion` });
  if (tooShort) findings.push({ code: "VIDEO_PACING_HOLD", detail: `${tooShort} scene(s) shorter than ${A.min_scene_ms}ms - choppy` });

  // dead time
  dims.dead_time = deadScenes === 0 ? 15 : Math.max(0, 15 - deadScenes * 8);
  if (deadScenes) findings.push({ code: "VIDEO_PACING_HOLD", detail: `${deadScenes} scene(s) hold with no approved motion for > ${A.max_dead_hold_ms}ms` });

  // motion purpose / progression / variety
  const activeRatio = scenes.length ? activeScenes / scenes.length : 0;
  const storyRatio = scenes.length ? storyKindScenes / scenes.length : 0;
  dims.visual_progression = activeRatio >= A.min_active_scene_ratio ? 15 : Math.round(activeRatio * 20);
  if (activeRatio < A.min_active_scene_ratio) findings.push({ code: "VIDEO_PACING_HOLD", detail: `only ${Math.round(activeRatio * 100)}% of scenes carry an approved motion (want >= ${Math.round(A.min_active_scene_ratio * 100)}%)` });
  if (storyRatio < 0.45) findings.push({ code: "VIDEO_PACING_HOLD", detail: `only ${Math.round(storyRatio * 100)}% of scenes carry a data/card/emphasis motion that advances the story` });

  const distinctMotions = new Set(seenMotions).size;
  dims.motion_purpose = banned ? 0 : distinctMotions >= 3 ? 10 : distinctMotions * 3;
  if (banned) findings.push({ code: "VIDEO_PACING_HOLD", detail: `${banned} banned motion(s) (spin / constant zoom / ken burns / glitch / ...)` });
  const repeatedZoom = seenMotions.filter((m) => m === "crop_detail_reveal" || m === "stamp_variant_zoom").length >= 3;
  if (repeatedZoom) findings.push({ code: "VIDEO_PACING_HOLD", detail: "repeated zoom is the only motion - reads as a slideshow" });

  // text density (<= 2 lines per beat, not every scene wordy)
  const overText = (plan.on_screen_text ?? []).filter((b) => (b.lines ?? []).length > 2).length;
  dims.text_density = overText === 0 ? 8 : Math.max(0, 8 - overText * 4);
  if (overText) findings.push({ code: "VIDEO_PACING_HOLD", detail: `${overText} text beat(s) exceed 2 lines` });

  // card visibility
  const cardScenes = scenes.filter((s) => s.card_asset != null).length;
  dims.card_visibility = cardScenes >= 2 ? 10 : cardScenes * 4;

  // CTA timing (last ~2-3s, not earlier, not missing)
  const ctaScene = scenes.find((s) => s.purpose === "cta");
  const ctaStart = ctaScene?.start_ms ?? null;
  const ctaOk = ctaStart != null && ctaStart >= dur - 3400 && ctaStart <= dur - 1500;
  dims.cta_timing = ctaOk ? 10 : 3;
  if (!ctaOk) findings.push({ code: "VIDEO_PACING_HOLD", detail: `CTA scene starts at ${ctaStart}ms - want the last ~2-3s of a ${dur}ms cut` });

  const score = Math.round(Object.values(dims).reduce((a, b) => a + b, 0)); // out of ~135
  const scaled = Math.round((score / 135) * 100);
  const slideshowFeel = deadScenes >= 2 || activeRatio < 0.5 || storyRatio < 0.4 || distinctMotions <= 2 || repeatedZoom;
  const verdict = scaled >= 70 && !slideshowFeel && findings.filter((f) => /banned|slideshow|reads as|dead|does not land|no approved motion/.test(f.detail)).length === 0 ? "PASS" : "HOLD";
  return { ok: verdict === "PASS", score: scaled, verdict, dims, slideshow_feel: slideshowFeel, findings };
}

// ---- §24 MOTION QUALITY AUDIT (heuristic) -------------
export const MOTION_QUALITY_DIMS = Object.freeze([
  "visual_polish", "collector_relevance", "motion_coherence", "hierarchy",
  "premium_feel", "readability", "originality", "platform_fit",
  "save_share_likelihood", "completion_likelihood",
]);

export function scoreMotionQuality({ plan = {}, pacing = null } = {}) {
  const scenes = plan.scenes ?? [];
  const p = pacing ?? auditPacing({ plan });
  const dims = {};
  const kinds = new Set(scenes.map((s) => motionKind(s.animation)).filter(Boolean));

  dims.visual_polish = p.dims?.dead_time >= 12 ? 10 : 5;
  dims.collector_relevance = (plan.card_assets ?? []).length ? 10 : 4;
  dims.motion_coherence = new Set(scenes.map((s) => s.animation)).size >= 3 && !p.slideshow_feel ? 10 : 4;
  dims.hierarchy = (plan.on_screen_text ?? []).every((b) => (b.lines ?? []).length <= 2) ? 10 : 4;
  dims.premium_feel = kinds.has("data") && kinds.has("card") ? 10 : 5;
  dims.readability = (plan.on_screen_text ?? []).every((b) => b.lines.join(" ").length <= 46) ? 10 : 5;
  dims.originality = kinds.size >= 4 ? 10 : kinds.size * 2;
  dims.platform_fit = plan.width === 1080 && plan.height === 1920 && plan.safe_zones?.bottom >= 440 ? 10 : 3;
  dims.save_share_likelihood = p.verdict === "PASS" ? 9 : 5;
  dims.completion_likelihood = (plan.duration ?? 0) <= 22000 && p.dims?.hook_speed >= 12 ? 9 : 5;

  const score = Math.round(Object.values(dims).reduce((a, b) => a + b, 0)); // /100
  const verdict = score >= 72 ? "PASS" : "HOLD";
  return { score, verdict, dims, owner_review_required: true };
}

// ---- combined pacing + motion-quality gate -----------
export function auditVideoCraft({ plan = {} } = {}) {
  const pacing = auditPacing({ plan });
  const quality = scoreMotionQuality({ plan, pacing });
  if (!pacing.ok) {
    return { ok: false, ...failure("VIDEO_PACING_HOLD", `pacing ${pacing.score}/100: ${pacing.findings.map((f) => f.detail).slice(0, 3).join(" | ")}`, { stage: "video_pacing" }), pacing, quality };
  }
  if (quality.verdict !== "PASS") {
    return { ok: false, ...failure("VIDEO_MOTION_QUALITY_HOLD", `motion quality ${quality.score}/100 - below the bar`, { stage: "video_motion_quality" }), pacing, quality };
  }
  return { ok: true, pacing, quality };
}
