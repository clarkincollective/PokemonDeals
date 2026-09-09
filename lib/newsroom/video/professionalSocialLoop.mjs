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
import { buildVideoSafeDerivative, VIDEO_SAFE_DERIVATIVE_VERSION, VS_SAFE } from "./videoSafeDerivative.mjs";
import { buildUniversalCtaEndScreen, UNIVERSAL_CTA_END_SCREEN_VERSION, CTA_END_SCREEN_DEFAULT_MS } from "./universalCtaEndScreen.mjs";
import { runProfessionalVideoQa, auditVideoDerivedExact, unsanctionedShownPercents, PROFESSIONAL_VIDEO_QA_VERSION } from "./professionalVideoQa.mjs";
import { buildProfessionalLoopDocument, PROFESSIONAL_LOOP_DOC_VERSION } from "./professionalLoopDocument.mjs";
import { PREMIUM_VIDEO_ATMOSPHERE_VERSION } from "./premiumVideoAtmosphere.mjs";

export const PROFESSIONAL_SOCIAL_LOOP_VERSION = "4c6.1";
export const PROFESSIONAL_SOCIAL_LOOP = "PROFESSIONAL_SOCIAL_LOOP"; // §1 preferred production mode
// kept for history / regression, NOT production
export const DEPRECATED_VIDEO_MODES = Object.freeze([
  "SPARSE_4C", "MULTI_BOARD_4C1", "MASTER_LAYERED_MOTION_LONG_4C2", "PREMIUM_5S_LOOP_4C3",
]);

// 4C.5 §3 - HOOK -> PROOF/VALUE -> TAKEAWAY -> CTA. Story content time per
// family (ms); the CTA hold + transition are added on top. Total lands in
// the 8.5-10.5s window. Do not pad weak content.
export const FAMILY_STORY_MS = Object.freeze({
  deal_hero: 5500,
  asking_vs_sold: 6100,
  market_shape: 6300,
  three_up: 6400,
  printing_compare: 7500,
});
// 4C.5 §4 - the CTA is a conversion moment. Held (fully readable, past the
// transition) for ~2.6s.
export const CTA_HOLD_MS = CTA_END_SCREEN_DEFAULT_MS; // 2600
// 4C.5 §17 - a controlled 400ms story->CTA transition (never a hard cut / fade-to-black)
export const STORY_CTA_TRANSITION_MS = 400;

export function familyDurationMs(family) {
  return (FAMILY_STORY_MS[family] ?? 6200) + STORY_CTA_TRANSITION_MS + CTA_HOLD_MS;
}
// back-compat: total target duration per family
export const FAMILY_DURATION_MS = Object.freeze(Object.fromEntries(
  Object.keys(FAMILY_STORY_MS).map((f) => [f, familyDurationMs(f)]),
));

// 4C.5 §16 - premium easing (no linear for emphasis, no bounce/elastic/overshoot)
const EASE = Object.freeze({
  outCubic: "cubic-bezier(.215,.61,.355,1)",
  outQuart: "cubic-bezier(.165,.84,.44,1)",
  inOutCubic: "cubic-bezier(.645,.045,.355,1)",
});

// -------------------------------------------------------------
// §21 - §25 CHOREOGRAPHY - 2-3 focal story events + the CTA transition.
// No whole-image push, no camera tour. Every second communicates.
// -------------------------------------------------------------
export function buildProfessionalTimeline({ family = "deal_hero", derivative = {}, durationMs = null } = {}) {
  const total = Math.round(durationMs ?? familyDurationMs(family));
  const storyMs = total - STORY_CTA_TRANSITION_MS - CTA_HOLD_MS; // when the CTA begins resolving
  const has = (id) => (derivative.blocks ?? []).some((b) => b.id === id);
  const ev = [];
  const add = (o) => ev.push({ scale_from: 1, scale_to: 1, opacity_from: 1, opacity_to: 1, translate_pct: 0, ease: EASE.outCubic, ...o });

  if (family === "deal_hero" || family === "asking_vs_sold") {
    // 4C.6 §14 - the card settles with a real lift; the comparison spine
    // draws downward; the % row lands with a controlled impact; the card
    // gets a diagonal light sweep. More obvious, still classy.
    add({ id: "card_lift", kind: "card_sweep", target: "hero_row", at_ms: 100, end_ms: 1200, translate_pct: 1.7, ease: EASE.outQuart, reveal: ["hero_row"], note: "hero card settles with a 10-18px lift" });
    add({ id: "spine_draw", kind: "illuminate", target: "hero_row", at_ms: 900, end_ms: 2600, opacity_from: 0.12, opacity_to: 1, ease: EASE.outQuart, reveal: ["hero_row"], note: "the ASK -> % -> MARKET spine illuminates downward" });
    add({ id: "gap_impact", kind: "stat_pulse", target: "hero_row", at_ms: 2700, end_ms: 4000, scale_from: 1, scale_to: 1.045, ease: EASE.inOutCubic, note: "the % BELOW MARKET row lands with a controlled impact" });
    add({ id: "card_glint", kind: "sweep", target: "hero_row", at_ms: 4300, end_ms: 5600, ease: EASE.outQuart, note: "card gets a soft diagonal light sweep" });
    add({ id: "settle", kind: "settle", target: "takeaway", at_ms: 5600, end_ms: storyMs, opacity_from: 0.5, opacity_to: 1, ease: EASE.outCubic, note: "short lesson resolves" });
  } else if (family === "market_shape") {
    // 4C.6 §15 - 85.7% lands with restrained scale; the chart grows and its
    // bucket values resolve; Clefairy lifts with a light sweep.
    add({ id: "stat_reveal", kind: "stat_pulse", target: "hero_stat", at_ms: 200, end_ms: 1400, scale_from: 1.02, scale_to: 1.045, ease: EASE.outQuart, reveal: ["hero_stat"], note: "85.7% lands with a restrained scale" });
    add({ id: "chart_fill", kind: "chart_fill", target: "chart", at_ms: 1500, end_ms: 3400, opacity_from: 0, opacity_to: 1, ease: EASE.outCubic, reveal: ["chart"], note: "chart grows; bucket values resolve" });
    add({ id: "card_sweep", kind: "card_sweep", target: "example_card", at_ms: 3800, end_ms: 5200, translate_pct: 1.5, ease: EASE.outQuart, reveal: ["example_card"], note: "Clefairy lifts / light sweep" });
    add({ id: "settle", kind: "settle", target: "takeaway", at_ms: 5200, end_ms: storyMs, opacity_from: 0.5, opacity_to: 1, ease: EASE.outCubic, note: "short takeaway resolves" });
  } else if (family === "three_up") {
    add({ id: "hl_1", kind: "highlight", target: "card_row", at_ms: 500, end_ms: 2000, opacity_from: 0.5, opacity_to: 1, reveal: ["card_row"], note: "card 1 highlight" });
    add({ id: "hl_2", kind: "highlight", target: "card_row", at_ms: 2100, end_ms: 3600, opacity_from: 0.5, opacity_to: 1, note: "card 2 highlight" });
    add({ id: "hl_3", kind: "highlight", target: "card_row", at_ms: 3700, end_ms: 5200, opacity_from: 0.5, opacity_to: 1, note: "card 3 highlight; price strip settles" });
    add({ id: "settle", kind: "settle", target: "price_strip", at_ms: 5200, end_ms: storyMs, opacity_from: 0.65, opacity_to: 1, note: "price strip" });
  } else if (family === "printing_compare") {
    add({ id: "hl_a", kind: "highlight", target: "card_pair", at_ms: 900, end_ms: 2600, opacity_from: 0.5, opacity_to: 1, reveal: ["card_pair"], note: "printing A highlight" });
    add({ id: "hl_b", kind: "highlight", target: "card_pair", at_ms: 2700, end_ms: 4400, opacity_from: 0.5, opacity_to: 1, note: "printing B highlight" });
    add({ id: "feature_illuminate", kind: "illuminate", target: "context", at_ms: 4500, end_ms: 6400, opacity_from: 0, opacity_to: 1, reveal: ["context"], note: "the actual distinguishing feature illuminates" });
    add({ id: "settle", kind: "settle", target: "compare", at_ms: 6400, end_ms: storyMs, opacity_from: 0.65, opacity_to: 1 });
  }

  // §17 - a controlled 400ms story->CTA transition: the story darkens while
  // the CTA environment resolves. Never a hard cut / fade-to-full-black.
  ev.push({ id: "cta_transition", kind: "cta_transition", at_ms: storyMs, end_ms: storyMs + STORY_CTA_TRANSITION_MS, style: "story-darkens+cta-resolves", to_black: false, ease: EASE.inOutCubic, note: "story slightly darkens; CTA environment + card fan resolve with depth" });

  const ctaContentStart = storyMs + STORY_CTA_TRANSITION_MS;
  return Object.freeze({
    version: PROFESSIONAL_SOCIAL_LOOP_VERSION,
    family, width: 1080, height: 1920, fps: 24,
    duration_ms: total, story_ms: storyMs, cta_ms: CTA_HOLD_MS,
    transition_ms: STORY_CTA_TRANSITION_MS, cta_content_start_ms: ctaContentStart,
    camera: { frames_whole_creative: true }, whole_image_push: false, replay_to_black: false,
    easing: EASE,
    events: ev,
    audio_cue_timeline: {
      music: "NONE (mood only; render silent unless an owned SFX library exists, §33)",
      cues: [
        { at_ms: 800, id: "reveal_tick", hint: "soft reveal tick" },
        { at_ms: 2100, id: "stat_impact", hint: "light stat impact" },
        { at_ms: 3600, id: "card_whoosh", hint: "subtle card lift whoosh" },
        { at_ms: ctaContentStart + 150, id: "cta_settle", hint: "CTA settle" },
        { at_ms: ctaContentStart + 1200, id: "url_cue", hint: "URL light-sweep cue" },
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

  // ---- 2. VIDEO-SAFE DERIVATIVE (4C.4 §7-§9 / 4C.5 §8) ----
  let derivative = buildVideoSafeDerivative({ family, semanticManifest, factLock, cardAssets: cardImagePaths, safe: VS_SAFE });

  // ---- 3. UNIVERSAL CTA END SCREEN (2.6s hold, §4) ----
  const endScreenRes = buildUniversalCtaEndScreen({
    family, heroCardId: heroCardId ?? semanticManifest.card_identity?.tcgplayer_id ?? null,
    heroCardName: heroCardName ?? semanticManifest.card_identity?.name ?? null,
    cacheDir: ctaCacheDir, durationMs: CTA_HOLD_MS, brandAssetPath: ctaBrandAssetPath,
  });
  if (!endScreenRes.ok) return { ok: false, ...failure(endScreenRes.state, endScreenRes.reason, { stage: "professional_social_loop_cta" }), cost, derivative, end_screen: endScreenRes.end_screen };
  const endScreen = endScreenRes;

  // ---- 4. CHOREOGRAPHY (premium easing, §12/§14/§16) ----
  const total = durationMs ?? familyDurationMs(family);
  let timeline = buildProfessionalTimeline({ family, derivative, durationMs: total });

  // ---- 5. QA + one bounded re-simplify / re-plan ----
  const cardAssets = [...(derivative.card_asset_paths ?? []), ...(endScreen.end_screen?.cards ?? []).map((c) => c.path)];
  let qa = runProfessionalVideoQa({ derivative, timeline, endScreen, semanticManifest, captionHandoff, cardAssets });
  let revised = false;
  if (!qa.ok && ["PROFESSIONAL_BRAND_FAIL", "CONTENT_PURPOSE_UNCLEAR_FAIL", "MOTION_TOO_SUBTLE_FAIL", "MOTION_TOO_AGGRESSIVE_FAIL", "PARTIAL_PANEL_FAIL", "SAFE_ZONE_VIOLATION_FAIL", "MOBILE_TEXT_TOO_SMALL_FAIL", "FRAME_DENSITY_TOO_HIGH_FAIL", "DEAD_BLACK_SPACE_FAIL", "STATIC_MASTER_PARITY_FAIL", "UNDERCOMPOSED_FRAME_FAIL", "MOBILE_HIERARCHY_FAIL"].includes(qa.state)) {
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
    motion_salience: { verdict: qa.verification?.motion ?? null, perceivable_events: qa.verification?.perceivable_events ?? null, score: qa.verification?.motion_salience_score ?? null },
    cta_audit: { website_first: qa.verification?.website_first_cta ?? null, purpose: endScreen.end_screen?.audits?.purpose ?? null },
    // 4C.5 polish verdicts
    cta_hold: { verdict: qa.verification?.cta_hold ?? null, hold_ms: qa.verification?.cta_hold_ms ?? null, target_ms: CTA_HOLD_MS },
    cta_readability_audit: qa.verification?.cta_readability ?? null,
    frame_density_audit: { verdict: qa.verification?.frame_density ?? null, content_ratio: qa.verification?.content_ratio ?? null },
    dead_black_audit: qa.verification?.dead_black_space ?? null,
    mobile_preview_audit: qa.verification?.mobile_preview ?? null,
    replay_transition_audit: qa.verification?.replay_transition ?? null,
    atmosphere: { variant: derivative.atmosphere?.variant ?? null, version: PREMIUM_VIDEO_ATMOSPHERE_VERSION },
    // 4C.6 static-master parity / composition
    static_master_parity: { verdict: qa.verification?.static_master_parity ?? null, overall: qa.verification?.parity_overall ?? null, dimensions: qa.verification?.parity_dimensions ?? null },
    mobile_hierarchy_audit: qa.verification?.mobile_hierarchy ?? null,
    owner_taste: qa.trust?.owner_taste ?? null,
    density: derivative.density ?? null,
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
      atmosphere: PREMIUM_VIDEO_ATMOSPHERE_VERSION,
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
    // 4C.6 - sample the SETTLED CTA (well past the entrance), not a mid-animation frame
    const cts = result.timeline?.cta_content_start_ms ?? (result.story_ms + 400);
    const at = Math.min(cts + 2100, result.duration_ms - 120) / 1000;
    try { await promisify(execFile)(FFMPEG, ["-y", "-ss", String(at), "-i", outPath, "-frames:v", "1", endScreenPngPath]); r.end_screen_png = endScreenPngPath; } catch { /* best effort */ }
  }
  return r;
}
