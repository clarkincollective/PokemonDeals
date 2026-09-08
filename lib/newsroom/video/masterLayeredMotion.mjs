// Phase SOCIAL-CREATIVE-4C.2 - MASTER_LAYERED_MOTION (the NEW primary
// video mode, §3, §8-§18, §22, §24).
//
//   verified story
//   -> semantic_hash
//   -> resolve the approved FULL_GENERATIVE_SOCIAL master (cache HIT = $0)
//   -> derive motion layers / zones (deterministic, optional vision)
//   -> build timed motion choreography (per-family, §10-13)
//   -> auditVideoDerivedExact (§19) + auditMasterMotion (§20) + score (§21)
//   -> one bounded re-choreography for a soft motion fault
//   -> package { master, layers, choreography, audio_cue_timeline, cost }
//
// MULTI_BOARD_VIDEO (4C.1) is now EXPENSIVE_FALLBACK - not used by default.
// Only ONE optional extra generated frame, and only when justified (§22).

import { existsSync, readFileSync } from "node:fs";
import { failure } from "../editorial/failureStates.mjs";
import { totalCostUsd } from "../hybrid/budget.mjs";
import { directVideo, videoSemanticHash, SAFE } from "./videoDirector.mjs";
import { deriveLayers, analyzeMasterLayout, MASTER_LAYER_VERSION } from "./masterLayerExtractor.mjs";
import { getMasterCreative, putMasterCreative } from "./masterCreativeCache.mjs";
import { auditMasterMotion, scorePremiumMotion, auditVideoDerivedExact } from "./videoMasterQa.mjs";
import { buildMasterMotionDocument } from "./masterMotionDocument.mjs";

export const MASTER_LAYERED_MOTION_VERSION = "4c2.1";
export const MOTION_VERSION = "4c2.1";
export const MULTI_BOARD_VIDEO = "EXPENSIVE_FALLBACK"; // §2 - 4C.1 is no longer the default

const money = (n) => (n == null || !Number.isFinite(Number(n)) ? null : `$${Number(n).toLocaleString("en-US", { minimumFractionDigits: Number(n) < 100 && !Number.isInteger(Number(n)) ? 2 : 0, maximumFractionDigits: Number(n) < 100 ? 2 : 0 })}`);
const b64Of = (p) => { try { const f = String(p ?? "").replace(/^file:\/\//, ""); return f && existsSync(f) ? readFileSync(f).toString("base64") : null; } catch { return null; } };

// ---- CHOREOGRAPHY (§10-§16) ---------------------------
// one dominant thought per beat; HOOK -> CARD -> VALUE -> WHY -> CTA;
// <= 2 lines / <= 7 words per beat; the master builds in, it is not
// crossfaded poster-to-poster.
function words(s, n) { return String(s ?? "").split(/\s+/).filter(Boolean).slice(0, n).join(" "); }

function beat(o) {
  const dur = o.end_ms - o.at_ms;
  return {
    id: o.id, at_ms: Math.round(o.at_ms), end_ms: Math.round(o.end_ms), dur_ms: Math.round(dur),
    dominant: o.dominant, visual: o.visual,
    camera: o.camera ?? { crop_to: "full", scale: 1, pan: { x: 0, y: 0 } },
    reveals: o.reveals ?? [], emphasis: o.emphasis ?? null,
    text: o.text ? { lines: o.text.lines.map((l) => words(l, 7)).slice(0, 2), style: o.text.style ?? "kinetic" } : null,
    motion: o.motion,
  };
}

function choreoDealHero(F, dur) {
  const cta = Math.round(dur - 2000);
  return [
    beat({ id: "b0", at_ms: 0, end_ms: 380, dominant: "hero_card", visual: "tight crop on the card + the hook figure, immediate move",
      camera: { crop_to: "hero_card", scale: 1.35 }, reveals: ["hero_card", "primary_stat"], emphasis: "primary_stat",
      text: { lines: [`${money(F.listed)} vs ${money(F.market)} market`] }, motion: "crop_pullback" }),
    beat({ id: "b1", at_ms: 380, end_ms: 1500, dominant: "primary_stat", visual: "card pulls back to full hero; market reference appears",
      camera: { crop_to: "full", scale: 1.0 }, reveals: ["headline"], emphasis: "primary_stat", motion: "mask_reveal" }),
    beat({ id: "b2", at_ms: 1500, end_ms: 3200, dominant: "comparison_graphic", visual: "the comparison builds; listed price locks in",
      camera: { crop_to: "comparison_graphic", scale: 1.18 }, reveals: ["comparison_graphic", "secondary_stat"], emphasis: "comparison_graphic", motion: "bar_build" }),
    beat({ id: "b3", at_ms: 3200, end_ms: 4500, dominant: "comparison_graphic", visual: "the exact below-market figure reveals",
      camera: { crop_to: "comparison_graphic", scale: 1.28 }, reveals: [], emphasis: "comparison_graphic",
      text: { lines: [`${F.discount_pct}% below market`] }, motion: "count_up_reveal" }),
    beat({ id: "b4", at_ms: 4500, end_ms: 7000, dominant: "hero_card", visual: "card depth / parallax + one short collector insight",
      camera: { crop_to: "full", scale: 1.04 }, reveals: ["why_panel"], emphasis: "hero_card",
      text: { lines: ["A real reference,", "not a 'was' price"] }, motion: "parallax" }),
    beat({ id: "b5", at_ms: 7000, end_ms: cta, dominant: "hero_card", visual: "hold the built master; light sweep on the card edge",
      camera: { crop_to: "full", scale: 1.02 }, reveals: [], emphasis: null, motion: "light_sweep" }),
    beat({ id: "b6", at_ms: cta, end_ms: dur - 1200, dominant: "cta", visual: "CTA + domain enter, card stays visible",
      camera: { crop_to: "full", scale: 1.0 }, reveals: ["cta"], emphasis: "cta",
      text: { lines: ["See the live deal"] }, motion: "panel_slide" }),
    beat({ id: "b7", at_ms: dur - 1200, end_ms: dur, dominant: "full", visual: "clean readable hold, no dead outro",
      camera: { crop_to: "full", scale: 1.0 }, reveals: [], emphasis: null, motion: "hold" }),
  ];
}

function choreoAskingVsSold(F, dur) {
  const cta = Math.round(dur - 2000);
  return [
    beat({ id: "b0", at_ms: 0, end_ms: 500, dominant: "primary_stat", visual: "ASK figure, immediate",
      camera: { crop_to: "primary_stat", scale: 1.4 }, reveals: ["primary_stat"], emphasis: "primary_stat",
      text: { lines: [`${money(F.listed)} ASK`] }, motion: "crop_pullback" }),
    beat({ id: "b1", at_ms: 500, end_ms: 1200, dominant: "secondary_stat", visual: "MARKET figure drops in",
      camera: { crop_to: "secondary_stat", scale: 1.35 }, reveals: ["secondary_stat"], emphasis: "secondary_stat",
      text: { lines: [`${money(F.market)} MARKET`] }, motion: "mask_reveal" }),
    beat({ id: "b2", at_ms: 1200, end_ms: 3500, dominant: "comparison_graphic", visual: "the visual relationship builds; card enters",
      camera: { crop_to: "full", scale: 1.0 }, reveals: ["hero_card", "comparison_graphic", "headline"], emphasis: "comparison_graphic", motion: "bar_build" }),
    beat({ id: "b3", at_ms: 3500, end_ms: 5000, dominant: "comparison_graphic", visual: "the exact below-market figure",
      camera: { crop_to: "comparison_graphic", scale: 1.25 }, reveals: [], emphasis: "comparison_graphic",
      text: { lines: [`${F.comparison_pct}% ${F.direction_word} market`] }, motion: "count_up_reveal" }),
    beat({ id: "b4", at_ms: 5000, end_ms: 8000, dominant: "hero_card", visual: "card hero + short explanation, parallax",
      camera: { crop_to: "hero_card", scale: 1.12 }, reveals: ["why_panel"], emphasis: "hero_card", motion: "parallax" }),
    beat({ id: "b5", at_ms: 8000, end_ms: cta, dominant: "why_panel", visual: "the reusable lesson",
      camera: { crop_to: "full", scale: 1.02 }, reveals: [], emphasis: "why_panel",
      text: { lines: ["Asking price ≠", "market value"] }, motion: "underline" }),
    beat({ id: "b6", at_ms: cta, end_ms: dur - 1200, dominant: "cta", visual: "site CTA enters",
      camera: { crop_to: "full", scale: 1.0 }, reveals: ["cta"], emphasis: "cta",
      text: { lines: ["See it on Pokemon Deal Finder"] }, motion: "panel_slide" }),
    beat({ id: "b7", at_ms: dur - 1200, end_ms: dur, dominant: "full", visual: "readable hold",
      camera: { crop_to: "full", scale: 1.0 }, reveals: [], emphasis: null, motion: "hold" }),
  ];
}

function choreoMarketShape(F, dur) {
  const cta = Math.round(dur - 2000);
  return [
    beat({ id: "b0", at_ms: 0, end_ms: 500, dominant: "primary_stat", visual: "the headline percentage, immediate",
      camera: { crop_to: "primary_stat", scale: 1.35 }, reveals: ["primary_stat", "headline"], emphasis: "primary_stat",
      text: { lines: [`${F.claim_value}% under $25`] }, motion: "crop_pullback" }),
    beat({ id: "b1", at_ms: 500, end_ms: 2000, dominant: "secondary_stat", visual: "the full scoped claim - N tracked singles",
      camera: { crop_to: "secondary_stat", scale: 1.2 }, reveals: ["secondary_stat"], emphasis: "secondary_stat",
      text: { lines: [`of ${F.population}`] }, motion: "mask_reveal" }),
    beat({ id: "b2", at_ms: 2000, end_ms: 5000, dominant: "chart", visual: "the distribution builds from the supported manifest only",
      camera: { crop_to: "chart", scale: 1.15 }, reveals: ["chart", "comparison_graphic"], emphasis: "chart", motion: "bar_build" }),
    beat({ id: "b3", at_ms: 5000, end_ms: 7000, dominant: "hero_card", visual: "the real example card enters (labelled example)",
      camera: { crop_to: "hero_card", scale: 1.1 }, reveals: ["hero_card"], emphasis: "hero_card", motion: "parallax" }),
    beat({ id: "b4", at_ms: 7000, end_ms: 10000, dominant: "why_panel", visual: "the takeaway",
      camera: { crop_to: "full", scale: 1.02 }, reveals: ["why_panel"], emphasis: "why_panel",
      text: { lines: ["Most of the market", "is inexpensive"] }, motion: "underline" }),
    beat({ id: "b5", at_ms: 10000, end_ms: cta, dominant: "why_panel", visual: "why it matters, hold the built master",
      camera: { crop_to: "full", scale: 1.0 }, reveals: [], emphasis: null, motion: "light_sweep" }),
    beat({ id: "b6", at_ms: cta, end_ms: dur - 1200, dominant: "cta", visual: "domain / brand",
      camera: { crop_to: "full", scale: 1.0 }, reveals: ["cta"], emphasis: "cta",
      text: { lines: ["Explore the market"] }, motion: "panel_slide" }),
    beat({ id: "b7", at_ms: dur - 1200, end_ms: dur, dominant: "full", visual: "readable hold",
      camera: { crop_to: "full", scale: 1.0 }, reveals: [], emphasis: null, motion: "hold" }),
  ];
}

function choreoThreeUp(F, dur) {
  const cta = Math.round(dur - 2200);
  return [
    beat({ id: "b0", at_ms: 0, end_ms: 400, dominant: "hero_card", visual: "reveal all 3 cards quickly + the figure",
      camera: { crop_to: "hero_card", scale: 1.2 }, reveals: ["hero_card", "headline"], emphasis: "hero_card",
      text: { lines: ["3 cards under $25"] }, motion: "crop_pullback" }),
    beat({ id: "b1", at_ms: 400, end_ms: 2600, dominant: "hero_card", visual: "sequential emphasis, card 1 then 2",
      camera: { crop_to: "full", scale: 1.06 }, reveals: [], emphasis: "hero_card", motion: "pointer" }),
    beat({ id: "b2", at_ms: 2600, end_ms: 5200, dominant: "primary_stat", visual: "the price tags animate in",
      camera: { crop_to: "primary_stat", scale: 1.15 }, reveals: ["primary_stat", "comparison_graphic"], emphasis: "primary_stat", motion: "bar_build" }),
    beat({ id: "b3", at_ms: 5200, end_ms: 8000, dominant: "comparison_graphic", visual: "the comparison strip builds",
      camera: { crop_to: "comparison_graphic", scale: 1.12 }, reveals: ["why_panel"], emphasis: "comparison_graphic", motion: "count_up_reveal" }),
    beat({ id: "b4", at_ms: 8000, end_ms: cta, dominant: "full", visual: "the 3-card summary stays visible; light sweep",
      camera: { crop_to: "full", scale: 1.02 }, reveals: [], emphasis: null, motion: "light_sweep" }),
    beat({ id: "b5", at_ms: cta, end_ms: dur - 1200, dominant: "cta", visual: "website CTA",
      camera: { crop_to: "full", scale: 1.0 }, reveals: ["cta"], emphasis: "cta",
      text: { lines: ["Find more live deals"] }, motion: "panel_slide" }),
    beat({ id: "b6", at_ms: dur - 1200, end_ms: dur, dominant: "full", visual: "readable hold",
      camera: { crop_to: "full", scale: 1.0 }, reveals: [], emphasis: null, motion: "hold" }),
  ];
}

const CHOREO = { deal_hero: choreoDealHero, asking_vs_sold: choreoAskingVsSold, market_shape: choreoMarketShape, three_up: choreoThreeUp, printing_compare: choreoThreeUp };
const TARGET_DUR = { deal_hero: 11000, asking_vs_sold: 13000, market_shape: 15000, three_up: 15000, printing_compare: 18000 };

export function buildChoreography({ family = "deal_hero", semanticManifest = {}, durationMs = null, masterAr = 1350 / 1080 } = {}) {
  const dur = durationMs || TARGET_DUR[family] || 12000;
  const S = semanticManifest || {};
  const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : null);
  const F = {
    listed: num(S.comparison_left?.value), market: num(S.comparison_right?.value),
    comparison_pct: S.comparison_pct ?? null,
    direction_word: S.comparison_direction === "ABOVE_MARKET" ? "above" : S.comparison_direction === "NEAR_MARKET" ? "at" : "below",
    discount_pct: S.required_numeric_facts?.discount_pct ?? (num(S.comparison_left?.value) && num(S.comparison_right?.value) && family === "deal_hero" ? Math.round((1 - S.comparison_left.value / S.comparison_right.value) * 100) : S.comparison_pct),
    claim_value: S.claim_value ?? null, population: S.claim_population ?? "the tracked set",
    example_card: S.example_card ?? null,
  };
  const beats = (CHOREO[family] ?? choreoDealHero)(F, dur);
  return Object.freeze({
    version: MASTER_LAYERED_MOTION_VERSION,
    family, width: 1080, height: 1920, fps: 30, duration_ms: dur,
    master_ar: masterAr,
    reveal_order: ["headline", "hero_card", "primary_stat", "secondary_stat", "comparison_graphic", "chart", "why_panel", "cta"],
    beats,
    audio_cue_timeline: buildAudioCueTimeline(beats),
  });
}

// §18 - premium sound-design cues, no music asset, no external TTS
export function buildAudioCueTimeline(beats) {
  const cues = [{ at_ms: 0, id: "hook_impact", hint: "soft impact under the first figure" }];
  for (const b of beats) {
    if (b.motion === "crop_pullback") cues.push({ at_ms: b.at_ms, id: "card_reveal_whoosh", hint: "card reveal whoosh" });
    if (b.motion === "bar_build") cues.push({ at_ms: b.at_ms + 120, id: "comparison_snap", hint: "comparison snap" });
    if (b.motion === "count_up_reveal") cues.push({ at_ms: b.at_ms, id: "price_tick", hint: "price tick / soft impact on the hero percentage" });
    if (b.dominant === "cta") cues.push({ at_ms: b.at_ms, id: "cta_cue", hint: "subtle CTA cue" });
  }
  return { version: "4c2.1", music: "NONE (mood only, no copyrighted asset)", cues };
}

// ---- ORCHESTRATOR (§3) --------------------------------
/**
 * runMasterLayeredMotion({
 *   story, semanticManifest, factLock, resolved, contract, factTrace,
 *   captionHandoff, cardImagePaths, family, cacheDir, allowGenerate,
 *   visionLayout, budget, env, fetchImpl
 * })
 */
export async function runMasterLayeredMotion(opts = {}) {
  const {
    story = {}, semanticManifest = {}, factLock = {}, resolved = null, contract = null,
    factTrace = [], captionHandoff = null, cardImagePaths = [],
    family = semanticManifest.layout ?? "deal_hero",
    cacheDir = null, allowGenerate = false, visionLayout = false,
    budget = null, env = process.env, fetchImpl = fetch,
  } = opts;

  const storyId = story.story_id ?? story.subject_id ?? captionHandoff?.story_id ?? "story";
  const semanticHash = videoSemanticHash(semanticManifest);
  const cost = { master_generation_cost: 0, extra_frame_cost: 0, video_incremental_api_cost: 0, local_render_cost: 0 };

  // ---- 1. resolve the master (cache HIT = $0) -------------
  let master = getMasterCreative({ storyId, semanticHash, dir: cacheDir });
  let masterSource = master ? "cache_hit" : null;

  if (!master && allowGenerate) {
    const { runFullGenerativeSocial } = await import("../hybrid/fullGenerativePipeline.mjs");
    const gen = await runFullGenerativeSocial({
      story, platform: "instagram", layout: family, resolved,
      cardImagePaths, cardCatalogRow: opts.cardCatalogRow ?? null, budget, env, fetchImpl,
    }).catch((e) => ({ ok: false, state: "GENERATION_FAILED", reason: e.message }));
    if (budget) cost.master_generation_cost = totalCostUsd(budget);
    if (!gen.ok) return { ok: false, ...failure("MASTER_CREATIVE_UNAVAILABLE", `no approved master and generation failed: ${gen.reason ?? gen.state}`, { stage: "master_layered_motion" }), cost };
    // §19 exact rounding: reject a master whose shown % is off by 1
    const exact = auditVideoDerivedExact({ extraction: gen.selected?.extracted_claims ?? {}, semanticManifest });
    if (!exact.ok) return { ok: false, ...exact, cost, note: "master shows a rounded % - regenerate before caching" };
    // rasterise the brand-composited final and cache it
    let pngBuf = null;
    try {
      const os = await import("node:os");
      const { createRenderer } = await import("../../social/render.mjs");
      const rr = await createRenderer();
      const tmp = `${os.tmpdir()}/master-${Date.now()}.png`;
      await rr.renderToPng(gen.finalHtml, tmp); await rr.close?.();
      pngBuf = readFileSync(tmp);
    } catch (e) { return { ok: false, ...failure("MASTER_CREATIVE_UNAVAILABLE", `master rasterise failed: ${e.message}`), cost }; }
    master = putMasterCreative({
      story_id: storyId, semantic_hash: semanticHash, family,
      brand_in_master: true, // the FULL_GENERATIVE_SOCIAL final composites the approved brand
      card_assets: cardImagePaths.map((p) => String(p).replace(/^file:\/\//, "")),
      fact_manifest: gen.factManifest ?? null, visualization_manifest: gen.semanticManifest?.visualization_data_manifest ?? null,
      card_metadata_lock: gen.semanticManifest?.card_metadata_lock ?? null,
      caption_handoff: captionHandoff, verification: { ...gen.verification, derived_values: "EXACT" }, source: "full_generative_social",
    }, { dir: cacheDir, imageBufferOrPath: pngBuf });
    masterSource = "generated";
  }

  if (!master) {
    return { ok: false, ...failure("MASTER_CREATIVE_UNAVAILABLE", `no approved master cached for ${storyId} (semantic ${semanticHash}) and allowGenerate=false`, { stage: "master_layered_motion" }), cost, semantic_hash: semanticHash };
  }

  // ---- 2. layers (deterministic; optional vision refine) --
  let visionBoxes = null;
  if (visionLayout) {
    const b64 = b64Of(master.master_image_path);
    if (b64) { const a = await analyzeMasterLayout({ b64, family, env, fetchImpl, budget }); if (a.ok) { visionBoxes = a.boxes; if (budget) cost.video_incremental_api_cost = totalCostUsd(budget) - cost.master_generation_cost; } }
  }
  const layers = deriveLayers({ family, semanticManifest, visionBoxes });

  // ---- 3. choreography (4C director for timing) -----------
  const plan = directVideo({ story, semanticManifest, factTrace, captionHandoff, cardImagePaths, family });
  const planDur = plan.ok ? plan.duration : (TARGET_DUR[family] ?? 12000);
  const masterAr = master.image_h && master.image_w ? master.image_h / master.image_w : 1350 / 1080;
  let choreography = buildChoreography({ family, semanticManifest, durationMs: Math.max(9000, Math.min(planDur, TARGET_DUR[family] ?? 15000)), masterAr });

  // ---- 4. motion QA + one bounded re-choreography --------
  let motionAudit = auditMasterMotion({ choreography, layers, plan: plan.ok ? plan : {} });
  let recut = false;
  if (!motionAudit.ok && ["DEAD_OPENING_FAIL", "WEAK_HOOK_FAIL", "EXCESSIVE_STATIC_HOLD_FAIL", "CTA_BANNER_AD_FAIL"].includes(motionAudit.state)) {
    recut = true;
    // tighten: pull the hook forward, shorten the closing hold
    const beats = choreography.beats.map((b, i) => {
      if (i === 0) return { ...b, at_ms: 0, end_ms: Math.min(b.end_ms, 340) };
      if (i === choreography.beats.length - 1) return { ...b, at_ms: choreography.duration_ms - 1100, end_ms: choreography.duration_ms };
      return b;
    });
    choreography = Object.freeze({ ...choreography, beats });
    motionAudit = auditMasterMotion({ choreography, layers, plan: plan.ok ? plan : {} });
  }

  const premium = scorePremiumMotion({ choreography, layers, motionAudit });

  const blockers = [];
  if (!captionHandoff || !captionHandoff.semantic_hash) blockers.push("VIDEO_CAPTION_LINK_MISSING - no verified caption_handoff (§28)");

  const ok = motionAudit.ok;
  return {
    ok,
    ...(ok ? { state: "MASTER_LAYERED_MOTION_READY", at: new Date().toISOString() }
           : failure(motionAudit.state ?? "CHEAP_EDIT_FAIL", motionAudit.reason ?? "motion did not clear the premium bar", { stage: "master_layered_motion" })),
    mode: "MASTER_LAYERED_MOTION",
    story_id: storyId, semantic_hash: semanticHash, family,
    master: {
      source: masterSource, image_path: master.master_image_path, image_sha256: master.master_image_sha256,
      verification: master.verification ?? {}, from_cache: Boolean(master._cache_hit),
      brand_in_master: Boolean(master.brand_in_master),
      image_w: master.image_w ?? null, image_h: master.image_h ?? null,
    },
    layers, choreography,
    audio_cue_timeline: choreography.audio_cue_timeline,
    motion_audit: { ...(motionAudit.verification ?? {}), ok: motionAudit.ok, state: motionAudit.state ?? null, findings: (motionAudit.findings ?? []).map((f) => f.detail) },
    premium_motion: premium,
    recut,
    poster_from: "master_animated_state (local, no AI - §27)",
    extra_frame: null, extra_frame_reason: null, // §22 - none unless a hard rule demands it
    caption_link: captionHandoff ? { semantic_hash: captionHandoff.semantic_hash, image_artifact_id: captionHandoff.image_artifact_id ?? null } : null,
    cost,
    safe_zones: SAFE,
    versions: { master_layered_motion: MASTER_LAYERED_MOTION_VERSION, motion: MOTION_VERSION, layers: MASTER_LAYER_VERSION },
  };
}

// ---- RENDER -------------------------------------------
export async function renderMasterLayeredMotionToMp4(result, outPath, { posterPath = null, keepFrames = null } = {}) {
  const { renderVideoPlanToMp4 } = await import("./videoRenderer.mjs");
  const p = String(result.master.image_path).replace(/^file:\/\//, "");
  const masterB64 = readFileSync(p).toString("base64");
  const doc = buildMasterMotionDocument({ masterB64, masterMime: "image/png", choreography: result.choreography, layers: result.layers, ctaText: result.caption_link ? null : "See the live deal", brandInMaster: Boolean(result.master?.brand_in_master) });
  // §27 poster = the strongest ANIMATED state, local from the master: a
  // full-frame beat (the built master) with no caption covering it - the
  // "why it matters" / hold beat, near its start before the drift.
  const beats = result.choreography.beats;
  const full = beats.filter((b) => (!b.camera || b.camera.crop_to === "full") && !(b.text?.lines ?? []).length && b.dominant !== "cta");
  const posterBeat = full[Math.max(0, full.length - 2)] ?? full[0] ?? beats.find((b) => b.dominant === "hero_card") ?? beats[Math.floor(beats.length / 2)];
  const planShim = { duration: result.choreography.duration_ms, fps: 30, width: 1080, height: 1920, poster_frame: { at_ms: Math.round(posterBeat.at_ms + Math.min(500, (posterBeat.end_ms - posterBeat.at_ms) * 0.35)) } };
  return renderVideoPlanToMp4(planShim, outPath, { posterPath, keepFrames, document: doc });
}
