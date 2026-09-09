// Phase SOCIAL-CREATIVE-4C.4 - PROFESSIONAL_SOCIAL_LOOP (the preferred
// production video mode).
//
//   approved static master
//     -> VIDEO-SAFE EDITORIAL DERIVATIVE      (simplify for vertical, §8)
//     -> 8-10s choreography                   (2-3 focal events, §17-24)
//     -> UNIVERSAL CTA END SCREEN             (~1.5s brand signature, §26)
//     -> professional-video QA                (cutoff / safe zone / mobile
//        readability / motion salience / real cards / website-first CTA /
//        professional trust)
//     -> READY_FOR_MANUAL_REVIEW  (or a WITHHOLD state)
//
//   HOOK -> STORY / VALUE -> PROOF -> CTA TO POKEMONDEALFINDER.COM
//
// $0 incremental image generation - the story master already exists for the
// static post and the CTA end screen is built programmatically from the
// approved brand mark + real canonical card PNGs. Deprecated video modes
// (4C / 4C.1 / 4C.2 / 4C.3) are kept for regression only.

import { existsSync, readFileSync } from "node:fs";
import { failure } from "../editorial/failureStates.mjs";
import { videoSemanticHash, SAFE } from "./videoDirector.mjs";
import { getMasterCreative } from "./masterCreativeCache.mjs";
import { masterApprovalGate } from "./premiumLoop.mjs";
import { buildVideoSafeDerivative, VIDEO_SAFE_DERIVATIVE_VERSION } from "./videoSafeDerivative.mjs";
import { buildUniversalCtaEndScreen, UNIVERSAL_CTA_END_SCREEN_VERSION, CTA_END_SCREEN_DEFAULT_MS } from "./universalCtaEndScreen.mjs";
import { runProfessionalVideoQa, auditVideoDerivedExact, unsanctionedShownPercents, PROFESSIONAL_VIDEO_QA_VERSION } from "./professionalVideoQa.mjs";
import { buildProfessionalLoopDocument, PROFESSIONAL_LOOP_DOC_VERSION } from "./professionalLoopDocument.mjs";

export const PROFESSIONAL_SOCIAL_LOOP_VERSION = "4c4.1";
export const PROFESSIONAL_SOCIAL_LOOP = "PROFESSIONAL_SOCIAL_LOOP"; // §1 preferred production mode
// §1 / §31 - kept for history / regression, NOT production
export const DEPRECATED_VIDEO_MODES = Object.freeze([
  "SPARSE_4C", "MULTI_BOARD_4C1", "MASTER_LAYERED_MOTION_LONG_4C2", "PREMIUM_5S_LOOP_4C3",
]);

// §2 - per-family target duration (ms). Do not pad weak content (§2/§3).
export const FAMILY_DURATION_MS = Object.freeze({
  deal_hero: 8000,
  asking_vs_sold: 8500,
  market_shape: 9500,
  three_up: 9500,
  printing_compare: 10000,
});
const CTA_MS = CTA_END_SCREEN_DEFAULT_MS; // ~1500

// -------------------------------------------------------------
// §21 - §25 CHOREOGRAPHY - 2-3 focal story events + the CTA transition.
// No whole-image push, no camera tour. Every second communicates.
// -------------------------------------------------------------
export function buildProfessionalTimeline({ family = "deal_hero", derivative = {}, durationMs = null } = {}) {
  const total = Math.round(durationMs ?? FAMILY_DURATION_MS[family] ?? 9000);
  const storyMs = total - CTA_MS;
  const has = (id) => (derivative.blocks ?? []).some((b) => b.id === id);
  const ev = [];
  const add = (o) => ev.push({ scale_from: 1, scale_to: 1, opacity_from: 1, opacity_to: 1, translate_pct: 0, ...o });

  if (family === "deal_hero" || family === "asking_vs_sold") {
    add({ id: "compare_illuminate", kind: "illuminate", target: "compare", at_ms: 1300, end_ms: 2800, opacity_from: 0, opacity_to: 1, reveal: ["compare"], note: "comparison path / arrow illuminates" });
    if (has("primary_stat")) add({ id: "stat_pulse", kind: "stat_pulse", target: "primary_stat", at_ms: 3000, end_ms: 4400, scale_from: 1, scale_to: 1.04, reveal: ["primary_stat"], note: "hero stat 1.00 -> 1.04 -> 1.00" });
    add({ id: "card_sweep", kind: "card_sweep", target: "hero_card", at_ms: 4600, end_ms: 6000, translate_pct: 1.5, reveal: ["hero_card"], note: "card gets a soft light sweep + 1.5% lift with shadow" });
    add({ id: "settle", kind: "settle", target: "takeaway", at_ms: 6000, end_ms: storyMs, opacity_from: 0.6, opacity_to: 1, note: "short collector value moment" });
  } else if (family === "market_shape") {
    add({ id: "hero_stat_pulse", kind: "stat_pulse", target: "hero_stat", at_ms: 200, end_ms: 1600, scale_from: 1, scale_to: 1.035, reveal: ["hero_stat"], note: "85.7% hero emphasis" });
    add({ id: "chart_fill", kind: "chart_fill", target: "chart", at_ms: 1600, end_ms: 3400, opacity_from: 0, opacity_to: 1, reveal: ["chart"], note: "distribution chart animates / fills; population resolves" });
    add({ id: "example_sweep", kind: "card_sweep", target: "example_card", at_ms: 4400, end_ms: 6000, translate_pct: 1.4, reveal: ["example_card"], note: "real example card light sweep / depth lift" });
    add({ id: "settle", kind: "settle", target: "takeaway", at_ms: 6000, end_ms: storyMs, opacity_from: 0.6, opacity_to: 1, note: "short takeaway" });
  } else if (family === "three_up") {
    add({ id: "hl_1", kind: "highlight", target: "card_row", at_ms: 600, end_ms: 2200, opacity_from: 0.55, opacity_to: 1, reveal: ["card_row"], note: "card 1 highlight" });
    add({ id: "hl_2", kind: "highlight", target: "card_row", at_ms: 2400, end_ms: 4000, opacity_from: 0.55, opacity_to: 1, note: "card 2 highlight" });
    add({ id: "hl_3", kind: "highlight", target: "card_row", at_ms: 4200, end_ms: 5800, opacity_from: 0.55, opacity_to: 1, note: "card 3 highlight; price strip settles" });
    add({ id: "settle", kind: "settle", target: "price_strip", at_ms: 5800, end_ms: storyMs, opacity_from: 0.7, opacity_to: 1, note: "price strip" });
  } else if (family === "printing_compare") {
    add({ id: "hl_a", kind: "highlight", target: "card_pair", at_ms: 1000, end_ms: 2600, opacity_from: 0.55, opacity_to: 1, reveal: ["card_pair"], note: "printing A highlight" });
    add({ id: "hl_b", kind: "highlight", target: "card_pair", at_ms: 2800, end_ms: 4400, opacity_from: 0.55, opacity_to: 1, note: "printing B highlight" });
    add({ id: "feature_illuminate", kind: "illuminate", target: "context", at_ms: 4600, end_ms: 6400, opacity_from: 0, opacity_to: 1, reveal: ["context"], note: "the actual distinguishing feature illuminates" });
    add({ id: "settle", kind: "settle", target: "compare", at_ms: 6400, end_ms: storyMs, opacity_from: 0.7, opacity_to: 1 });
  }

  // §26 the CTA transition - a clean 250ms cross-dissolve, never fade-to-black
  ev.push({ id: "cta_transition", kind: "cross_dissolve", at_ms: storyMs, end_ms: storyMs + 250, note: "clean cross-dissolve to the universal CTA end screen" });

  return Object.freeze({
    version: PROFESSIONAL_SOCIAL_LOOP_VERSION,
    family, width: 1080, height: 1920, fps: 24,
    duration_ms: total, story_ms: storyMs, cta_ms: CTA_MS,
    camera: { frames_whole_creative: true }, whole_image_push: false,
    events: ev,
    audio_cue_timeline: {
      music: "NONE (mood only; render silent unless an owned SFX library exists, §44)",
      cues: [
        { at_ms: 1300, id: "compare_tick", hint: "price comparison tick" },
        { at_ms: 3200, id: "stat_impact", hint: "light stat impact" },
        { at_ms: 4700, id: "card_lift", hint: "subtle card lift" },
        { at_ms: storyMs + 120, id: "cta_settle", hint: "CTA settle" },
      ],
    },
    safe_zones: SAFE,
  });
}

const b64Of = (p) => { const f = String(p ?? "").replace(/^file:\/\//, ""); return f && existsSync(f) ? readFileSync(f).toString("base64") : null; };

/**
 * runProfessionalSocialLoop({ story, semanticManifest, factLock, resolved,
 *   contract, captionHandoff, cardImagePaths, heroCardId, heroCardName,
 *   family, cacheDir, ctaCacheDir, ctaBrandAssetPath, durationMs })
 *
 * Deterministic - builds + audits; does NOT render (call
 * renderProfessionalSocialLoopToMp4 with the result). $0.
 */
export function runProfessionalSocialLoop(opts = {}) {
  const {
    story = {}, semanticManifest = {}, factLock = {}, captionHandoff = null,
    cardImagePaths = [], heroCardId = null, heroCardName = null,
    family = semanticManifest.layout ?? "deal_hero",
    cacheDir = null, ctaCacheDir = undefined, ctaBrandAssetPath = null, durationMs = null,
  } = opts;

  const storyId = story.story_id ?? story.subject_id ?? captionHandoff?.story_id ?? "story";
  const semanticHash = videoSemanticHash(semanticManifest);
  const cost = { master_generation_cost: 0, cta_generation_cost: 0, video_incremental_api_cost: 0, local_render_cost: 0 };

  // ---- 1. resolve the approved static master (cache HIT = $0, §6) ----
  const master = getMasterCreative({ storyId, semanticHash, dir: cacheDir });
  if (!master) {
    return { ok: false, ...failure("MASTER_CREATIVE_UNAVAILABLE", `no approved static master cached for ${storyId} (semantic ${semanticHash}); PROFESSIONAL_SOCIAL_LOOP reuses the story master, it does not generate one`, { stage: "professional_social_loop" }), cost, semantic_hash: semanticHash };
  }
  const gate = masterApprovalGate({ master, semanticManifest });
  if (!gate.ok) return { ok: false, ...failure(gate.state, gate.reason, { stage: "professional_social_loop_master_gate" }), cost, master: { image_path: master.master_image_path } };

  // ---- 2. VIDEO-SAFE DERIVATIVE (§7-§9) ----
  let derivative = buildVideoSafeDerivative({ family, semanticManifest, factLock, cardAssets: cardImagePaths, safe: SAFE });

  // ---- 3. UNIVERSAL CTA END SCREEN (§26) ----
  const endScreenRes = buildUniversalCtaEndScreen({
    family, heroCardId: heroCardId ?? semanticManifest.card_identity?.tcgplayer_id ?? null,
    heroCardName: heroCardName ?? semanticManifest.card_identity?.name ?? null,
    cacheDir: ctaCacheDir, durationMs: CTA_MS, brandAssetPath: ctaBrandAssetPath,
  });
  if (!endScreenRes.ok) return { ok: false, ...failure(endScreenRes.state, endScreenRes.reason, { stage: "professional_social_loop_cta" }), cost, derivative, end_screen: endScreenRes.end_screen };
  const endScreen = endScreenRes;

  // ---- 4. CHOREOGRAPHY (§21-§25) ----
  const total = durationMs ?? FAMILY_DURATION_MS[family] ?? 9000;
  let timeline = buildProfessionalTimeline({ family, derivative, durationMs: total });

  // ---- 5. QA + one bounded re-simplify / re-plan (§48) ----
  const cardAssets = [...(derivative.card_asset_paths ?? []), ...(endScreen.end_screen?.cards ?? []).map((c) => c.path)];
  let qa = runProfessionalVideoQa({ derivative, timeline, endScreen, semanticManifest, captionHandoff, cardAssets });
  let revised = false;
  if (!qa.ok && ["PROFESSIONAL_BRAND_FAIL", "CONTENT_PURPOSE_UNCLEAR_FAIL", "MOTION_TOO_SUBTLE_FAIL", "MOTION_TOO_AGGRESSIVE_FAIL", "PARTIAL_PANEL_FAIL", "SAFE_ZONE_VIOLATION_FAIL", "MOBILE_TEXT_TOO_SMALL_FAIL"].includes(qa.state)) {
    revised = true;
    // drop the lowest-priority kept block and rebuild the timeline once
    const trimmed = { ...derivative, blocks: (derivative.blocks ?? []).filter((b, i, arr) => !(b.priority >= 2 && i === arr.map((x) => x.priority).lastIndexOf(Math.max(...arr.map((x) => x.priority))))) };
    derivative = Object.freeze({ ...trimmed, removed: Object.freeze([...(derivative.removed ?? []), { id: "auto", reason: `dropped to clear ${qa.state} on the one bounded revision (§48)` }]) });
    timeline = buildProfessionalTimeline({ family, derivative, durationMs: total });
    qa = runProfessionalVideoQa({ derivative, timeline, endScreen, semanticManifest, captionHandoff, cardAssets });
  }

  // ---- 6. §42 exact-fact lock (scrutinise only unsanctioned percentages) ----
  const exact = auditVideoDerivedExact({ extraction: { all_numbers: unsanctionedShownPercents(derivative, semanticManifest) }, semanticManifest });

  const blockers = [];
  if (!captionHandoff || !captionHandoff.semantic_hash) blockers.push("VIDEO_CAPTION_LINK_MISSING - no verified 5B caption_handoff to attach (§22)");

  const ok = qa.ok && exact.ok;
  return {
    ok,
    ...(ok ? { state: "READY_FOR_MANUAL_REVIEW", at: new Date().toISOString() }
           : failure(exact.ok ? (qa.state ?? "PROFESSIONAL_BRAND_FAIL") : "VIDEO_DERIVED_VALUE_EXACT_FAIL", exact.ok ? (qa.reason ?? "professional video QA did not pass") : exact.reason, { stage: "professional_social_loop" })),
    mode: PROFESSIONAL_SOCIAL_LOOP,
    story_id: storyId, semantic_hash: semanticHash, family,
    duration_ms: timeline.duration_ms, story_ms: timeline.story_ms, cta_ms: timeline.cta_ms,
    master: { image_path: master.master_image_path, image_sha256: master.master_image_sha256, image_w: master.image_w ?? null, image_h: master.image_h ?? null, from_cache: Boolean(master._cache_hit), verification: master.verification ?? {} },
    derivative,
    end_screen: endScreen.end_screen,
    timeline,
    audio_cue_timeline: timeline.audio_cue_timeline,
    qa: { ok: qa.ok, state: qa.state, verification: qa.verification, findings: qa.findings ?? [], sub: qa.sub },
    professional_brand: qa.trust ?? null,
    comprehension: qa.verification?.content_comprehension ?? null,
    cutoff_audit: qa.verification?.cutoff_safe_zone ?? null,
    safe_zone_audit: (derivative.overflow ?? []).length ? "FAIL" : "PASS",
    mobile_readability: qa.verification?.mobile_readability ?? null,
    motion_salience: { verdict: qa.verification?.motion ?? null, perceivable_events: qa.verification?.perceivable_events ?? null },
    cta_audit: { website_first: qa.verification?.website_first_cta ?? null, purpose: endScreen.end_screen?.audits?.purpose ?? null },
    fact_audit: { exact_values: exact.ok ? "PASS" : "FAIL", shown_numbers: [...(derivative.shown_numbers ?? [])] },
    revised,
    caption_link: captionHandoff ? { semantic_hash: captionHandoff.semantic_hash, image_artifact_id: captionHandoff.image_artifact_id ?? null, reused: true } : null,
    dedupe_key: `${master.master_image_sha256}::${PROFESSIONAL_SOCIAL_LOOP_VERSION}`, // §25 = master sha + mode version
    poster_from: "a clean early story frame of the video-safe derivative (~0.8s), plus the static master kept alongside",
    cost,
    blockers,
    versions: {
      professional_social_loop: PROFESSIONAL_SOCIAL_LOOP_VERSION,
      derivative: VIDEO_SAFE_DERIVATIVE_VERSION,
      cta_end_screen: UNIVERSAL_CTA_END_SCREEN_VERSION,
      qa: PROFESSIONAL_VIDEO_QA_VERSION,
      doc: PROFESSIONAL_LOOP_DOC_VERSION,
    },
  };
}

// ---- RENDER --------------------------------------------------
export async function renderProfessionalSocialLoopToMp4(result, outPath, { posterPath = null, endScreenPngPath = null, keepFrames = null } = {}) {
  const { renderVideoPlanToMp4 } = await import("./videoRenderer.mjs");
  const masterPath = String(result.master.image_path).replace(/^file:\/\//, "");

  // real canonical card images -> base64 (JPEG from the card-art cache)
  const cardImages = {};
  for (const p of result.derivative.card_asset_paths ?? []) { const b = b64Of(p); if (b) cardImages[p] = b; }
  const endCardImages = {};
  for (const c of result.end_screen?.cards ?? []) { const b = b64Of(c.path); if (b) endCardImages[c.id] = b; }

  const doc = buildProfessionalLoopDocument({
    derivative: result.derivative, endScreen: result.end_screen, timeline: result.timeline,
    cardImages, endCardImages,
  });

  const posterAtMs = Math.min(900, Math.round((result.story_ms ?? 6000) * 0.12));
  const r = await renderVideoPlanToMp4(
    { duration: result.timeline.duration_ms, fps: result.timeline.fps || 24, width: 1080, height: 1920, poster_frame: { at_ms: posterAtMs } },
    outPath, { keepFrames, document: doc, posterPath },
  );

  if (r.ok && endScreenPngPath) {
    // a still of the CTA end screen ~ mid its window
    const { execFile } = await import("node:child_process");
    const { promisify } = await import("node:util");
    const { FFMPEG } = await import("../../social/videoRender.mjs");
    const at = (result.story_ms + result.cta_ms * 0.55) / 1000;
    try { await promisify(execFile)(FFMPEG, ["-y", "-ss", String(at), "-i", outPath, "-frames:v", "1", endScreenPngPath]); r.end_screen_png = endScreenPngPath; } catch { /* best effort */ }
  }
  return r;
}
