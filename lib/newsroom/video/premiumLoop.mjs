// Phase SOCIAL-CREATIVE-4C.3 - PREMIUM_5S_LOOP (the NEW primary video mode).
//
//   APPROVED STATIC MASTER  ->  SUBTLE PREMIUM 5-SECOND LOOP  ->  5B CAPTION
//   ->  TIKTOK / YOUTUBE SHORTS / REELS
//
//   SIMPLE + POLISHED + TRUSTWORTHY  >  COMPLEX + CHEAP-LOOKING
//
// verified story -> resolve the approved static master (cache HIT = $0)
//   -> §18 master must be owner-approved + fact-clean
//   -> §19 no rounding drift (an old 45%-for-44% master is WITHHELD)
//   -> derive layers -> build a 5s loop plan (<= 3 restrained motion events)
//   -> auditPremiumLoop (camera-tour / seam / brand-trust / duplicate-text)
//   -> attach the existing 5B caption_handoff (not regenerated)
//   -> READY_FOR_MANUAL_REVIEW  (or a WITHHOLD state)
//
// $0 incremental image generation by default. The long camera choreography
// (4C.2) is now MASTER_LAYERED_MOTION_LONG = OPTIONAL_FALLBACK.

import { existsSync, readFileSync } from "node:fs";
import { failure } from "../editorial/failureStates.mjs";
import { totalCostUsd } from "../hybrid/budget.mjs";
import { videoSemanticHash, SAFE } from "./videoDirector.mjs";
import { deriveLayers, MASTER_LAYER_VERSION } from "./masterLayerExtractor.mjs";
import { getMasterCreative, putMasterCreative } from "./masterCreativeCache.mjs";
import { auditPremiumLoop, auditVideoDerivedExact, scoreLoopTrust, LOOP_MOTION_CAPS } from "./videoLoopQa.mjs";
import { buildPremiumLoopDocument } from "./premiumLoopDocument.mjs";

export const PREMIUM_LOOP_VERSION = "4c3.1";
export const LOOP_VERSION = "4c3.1";
export const MASTER_LAYERED_MOTION_LONG = "OPTIONAL_FALLBACK"; // §1 - 4C.2 is no longer default
// §31 - kept for history / regression, NOT production
export const DEPRECATED_VIDEO_MODES = Object.freeze(["SPARSE_4C", "MULTI_BOARD_4C1", "MASTER_LAYERED_MOTION_LONG_4C2"]);

const b64Of = (p) => { const f = String(p ?? "").replace(/^file:\/\//, ""); return f && existsSync(f) ? readFileSync(f).toString("base64") : null; };

// which zone gets the single stat-emphasis pulse, per family (§10-14)
const STAT_TARGET = {
  deal_hero: "comparison_graphic",
  asking_vs_sold: "comparison_graphic",
  market_shape: "chart",
  three_up: "primary_stat",
  printing_compare: "comparison_graphic",
};

/**
 * buildLoopPlan({ family, layers, semanticManifest, masterAr, durationMs })
 *  -> a 5-second loop plan with <= 3 motion events, a declared seam, and an
 *     audio cue timeline. Fully deterministic.
 */
export function buildLoopPlan({ family = "deal_hero", layers = {}, semanticManifest = {}, masterAr = 1350 / 1080, durationMs = LOOP_MOTION_CAPS.default_duration_ms, master = {} } = {}) {
  const dur = Math.max(LOOP_MOTION_CAPS.min_duration_ms, Math.min(LOOP_MOTION_CAPS.max_duration_ms, durationMs));
  const statTarget = layers.layers?.[STAT_TARGET[family] ?? "primary_stat"]?.present
    ? (STAT_TARGET[family] ?? "primary_stat")
    : (layers.layers?.primary_stat?.present ? "primary_stat" : "headline");
  const ctaTarget = layers.layers?.cta?.present ? "cta" : "brand";

  // §8 timing - restrained, seamless. NO re-drawn master slices (they
  // ghost): the push is a whole-image scale, the emphases are soft glows.
  const events = [
    { id: "push", kind: "push", target: "full", at_ms: 300, end_ms: dur, push_pct: 2.0, note: "slow whole-image push-in, eases back to scale 1 (seamless)" },
    { id: "stat_emph", kind: "stat_emphasis", target: statTarget, at_ms: 1800, end_ms: 3200, glow: true, note: "one soft glow over the key stat / comparison zone" },
    { id: "cta_emph", kind: "cta_emphasis", target: ctaTarget, at_ms: 3200, end_ms: 4300, glow: true, note: "gentle light lift over the CTA / domain zone; no text added" },
  ];

  const seam = {
    // 0.0s and dur both sit at the untouched master
    start_state: { cam_scale: 1, cam_tx: 0, cam_ty: 0, max_overlay_opacity: 0 },
    end_state: { cam_scale: 1, cam_tx: 0, cam_ty: 0, max_overlay_opacity: 0 },
  };

  return Object.freeze({
    version: PREMIUM_LOOP_VERSION,
    loop_version: LOOP_VERSION,
    family, width: 1080, height: 1920, fps: 24, duration_ms: dur, master_ar: masterAr,
    // the whole composition is visible for the entire loop (§16)
    camera: { frames_whole_creative: true },
    master_visible_ratio: 1.0,
    opening_blank: false,
    new_large_caption: false,
    motion_events: events,
    seam,
    audio_cue_timeline: {
      version: "4c3.1", music: "NONE (mood only; render silent if no owned SFX)",
      cues: [
        { at_ms: 300, id: "soft_whoosh", hint: "soft whoosh under the push start" },
        { at_ms: 2500, id: "stat_hit", hint: "subtle stat hit on the emphasis pulse" },
        { at_ms: 3400, id: "cta_tick", hint: "small CTA tick" },
      ],
    },
    safe_zones: SAFE,
  });
}

// §18/§19 - is this master allowed into the loop engine? (also reused by
// the 4C.4 PROFESSIONAL_SOCIAL_LOOP orchestrator)
export function masterApprovalGate({ master, semanticManifest }) {
  const v = master.verification ?? {};
  // an explicit approved:false always wins; otherwise a BUFFER_READY / pre-approved artifact is in.
  const approved = v.approved !== false && (v.approved === true || v.buffer_ready === true || String(v.state ?? "").includes("BUFFER_READY") || (v.source_kind === "pre-approved" && v.approved == null));
  if (!approved) return { ok: false, state: "MASTER_NOT_APPROVED", reason: `master ${master.story_id ?? ""} is not owner-approved / fact-clean (verification: ${JSON.stringify(v).slice(0, 120)})` };
  // an old artifact flagged as having rounding drift, or a known shown %
  // that disagrees with the manifest -> WITHHOLD (§19)
  if (v.derived_values === "DRIFT" || v.rounding_drift === true) {
    return { ok: false, state: "VIDEO_DERIVED_VALUE_EXACT_FAIL", reason: `master carries a rounded derived value (e.g. old 45% for a true 44%) - do not animate it (§19)` };
  }
  const shown = Array.isArray(master.known_shown_pct) ? master.known_shown_pct : (master.known_shown_pct != null ? [master.known_shown_pct] : []);
  if (shown.length) {
    const exact = auditVideoDerivedExact({ extraction: { all_numbers: shown.map((n) => `${n}%`) }, semanticManifest });
    if (!exact.ok) return { ok: false, state: "VIDEO_DERIVED_VALUE_EXACT_FAIL", reason: exact.reason };
  }
  return { ok: true };
}

/**
 * runPremiumLoop({ story, semanticManifest, factLock, resolved, contract,
 *   captionHandoff, cardImagePaths, family, cacheDir, allowGenerate,
 *   budget, env, fetchImpl })
 */
export async function runPremiumLoop(opts = {}) {
  const {
    story = {}, semanticManifest = {}, factLock = {}, resolved = null, contract = null,
    captionHandoff = null, cardImagePaths = [],
    family = semanticManifest.layout ?? "deal_hero",
    cacheDir = null, allowGenerate = false, budget = null, env = process.env, fetchImpl = fetch,
  } = opts;

  const storyId = story.story_id ?? story.subject_id ?? captionHandoff?.story_id ?? "story";
  const semanticHash = videoSemanticHash(semanticManifest);
  const cost = { master_generation_cost: 0, extra_frame_cost: 0, video_incremental_api_cost: 0, local_render_cost: 0 };

  // ---- resolve the master (cache HIT = $0) ----
  let master = getMasterCreative({ storyId, semanticHash, dir: cacheDir });
  let masterSource = master ? "cache_hit" : null;

  if (!master && allowGenerate) {
    const { runFullGenerativeSocial } = await import("../hybrid/fullGenerativePipeline.mjs");
    const gen = await runFullGenerativeSocial({ story, platform: "instagram", layout: family, resolved, cardImagePaths, cardCatalogRow: opts.cardCatalogRow ?? null, budget, env, fetchImpl }).catch((e) => ({ ok: false, state: "GENERATION_FAILED", reason: e.message }));
    if (budget) cost.master_generation_cost = totalCostUsd(budget);
    if (!gen.ok) return { ok: false, ...failure("MASTER_CREATIVE_UNAVAILABLE", `no approved master and generation failed: ${gen.reason ?? gen.state}`, { stage: "premium_loop" }), cost };
    const exact = auditVideoDerivedExact({ extraction: gen.selected?.extracted_claims ?? {}, semanticManifest });
    if (!exact.ok) return { ok: false, ...exact, cost, note: "master shows a rounded % - regenerate before caching" };
    let pngBuf = null;
    try {
      const os = await import("node:os");
      const { createRenderer } = await import("../../social/render.mjs");
      const rr = await createRenderer();
      const tmp = `${os.tmpdir()}/loop-master-${Date.now()}.png`;
      await rr.renderToPng(gen.finalHtml, tmp); await rr.close?.();
      pngBuf = readFileSync(tmp);
    } catch (e) { return { ok: false, ...failure("MASTER_CREATIVE_UNAVAILABLE", `master rasterise failed: ${e.message}`), cost }; }
    master = putMasterCreative({
      story_id: storyId, semantic_hash: semanticHash, family, brand_in_master: true,
      card_assets: cardImagePaths.map((p) => String(p).replace(/^file:\/\//, "")),
      fact_manifest: gen.factManifest ?? null, visualization_manifest: gen.semanticManifest?.visualization_data_manifest ?? null,
      card_metadata_lock: gen.semanticManifest?.card_metadata_lock ?? null, caption_handoff: captionHandoff,
      verification: { ...gen.verification, approved: true, derived_values: "EXACT", state: "BUFFER_READY" }, source: "full_generative_social",
    }, { dir: cacheDir, imageBufferOrPath: pngBuf });
    masterSource = "generated";
  }

  if (!master) {
    return { ok: false, ...failure("MASTER_CREATIVE_UNAVAILABLE", `no approved master cached for ${storyId} (semantic ${semanticHash}); allowGenerate=false`, { stage: "premium_loop" }), cost, semantic_hash: semanticHash };
  }

  // ---- §18/§19 master approval + exact-fact gate ----
  const gate = masterApprovalGate({ master, semanticManifest });
  if (!gate.ok) return { ok: false, ...failure(gate.state, gate.reason, { stage: "premium_loop_master_gate" }), cost, master: { source: masterSource, image_path: master.master_image_path } };

  // ---- layers + loop plan ----
  const masterAr = master.image_h && master.image_w ? master.image_h / master.image_w : 1350 / 1080;
  const layers = deriveLayers({ family, semanticManifest });
  let loopPlan = buildLoopPlan({ family, layers, semanticManifest, masterAr, master });

  // ---- §26/§27 loop QA + one bounded re-plan ----
  let loopAudit = auditPremiumLoop({ loopPlan, layers, master: { ...master, cta_present: layers.layers?.cta?.present, domain_present: Boolean(master.brand_in_master) } });
  let replanned = false;
  if (!loopAudit.ok && ["BRAND_TRUST_HOLD", "LOOP_SEAM_FAIL"].includes(loopAudit.state)) {
    replanned = true;
    // trim to the two gentlest events + re-assert the seam
    const ev = loopPlan.motion_events.slice(0, 2).map((e) => ({ ...e, push_pct: Math.min(e.push_pct ?? 2, 1.8), scale: Math.min(e.scale ?? 1.03, 1.03), parallax_pct: Math.min(e.parallax_pct ?? 1.4, 1.2) }));
    loopPlan = Object.freeze({ ...loopPlan, motion_events: ev, seam: { start_state: { cam_scale: 1, cam_tx: 0, cam_ty: 0, max_overlay_opacity: 0 }, end_state: { cam_scale: 1, cam_tx: 0, cam_ty: 0, max_overlay_opacity: 0 } } });
    loopAudit = auditPremiumLoop({ loopPlan, layers, master: { ...master, cta_present: layers.layers?.cta?.present, domain_present: Boolean(master.brand_in_master) } });
  }
  const trust = loopAudit.trust ?? scoreLoopTrust({ loopPlan });

  const blockers = [];
  if (!captionHandoff || !captionHandoff.semantic_hash) blockers.push("VIDEO_CAPTION_LINK_MISSING - no verified 5B caption_handoff to attach (§22)");

  const ok = loopAudit.ok;
  return {
    ok,
    ...(ok ? { state: "READY_FOR_MANUAL_REVIEW", at: new Date().toISOString() }
           : failure(loopAudit.state ?? "BRAND_TRUST_HOLD", loopAudit.reason ?? "loop did not clear the premium bar", { stage: "premium_loop" })),
    mode: "PREMIUM_5S_LOOP",
    story_id: storyId, semantic_hash: semanticHash, family,
    master: {
      source: masterSource, image_path: master.master_image_path, image_sha256: master.master_image_sha256,
      brand_in_master: Boolean(master.brand_in_master), image_w: master.image_w ?? null, image_h: master.image_h ?? null,
      verification: master.verification ?? {}, from_cache: Boolean(master._cache_hit),
    },
    layers, loop_plan: loopPlan,
    audio_cue_timeline: loopPlan.audio_cue_timeline,
    loop_audit: { ...(loopAudit.verification ?? {}), ok: loopAudit.ok, state: loopAudit.state ?? null, findings: (loopAudit.findings ?? []).map((f) => f.detail) },
    brand_trust: trust,
    replanned,
    poster_from: "the approved static master, verbatim (§23)",
    caption_link: captionHandoff ? { semantic_hash: captionHandoff.semantic_hash, image_artifact_id: captionHandoff.image_artifact_id ?? null, reused: true } : null,
    dedupe_key: `${master.master_image_sha256}::${LOOP_VERSION}`, // §25
    cost,
    safe_zones: SAFE,
    versions: { premium_loop: PREMIUM_LOOP_VERSION, loop: LOOP_VERSION, layers: MASTER_LAYER_VERSION },
  };
}

// ---- RENDER -----------------------------------------
export async function renderPremiumLoopToMp4(result, outPath, { posterPath = null, keepFrames = null } = {}) {
  const { renderVideoPlanToMp4 } = await import("./videoRenderer.mjs");
  const p = String(result.master.image_path).replace(/^file:\/\//, "");
  const masterB64 = readFileSync(p).toString("base64");
  const doc = buildPremiumLoopDocument({ masterB64, masterMime: "image/png", loopPlan: result.loop_plan, layers: result.layers, brandInMaster: Boolean(result.master?.brand_in_master) });
  // §23 poster = the approved static master, verbatim (not a rendered frame)
  const r = await renderVideoPlanToMp4({ duration: result.loop_plan.duration_ms, fps: result.loop_plan.fps || 24, width: 1080, height: 1920, poster_frame: { at_ms: 0 } }, outPath, { keepFrames, document: doc });
  if (r.ok && posterPath) {
    const { copyFileSync, mkdirSync } = await import("node:fs");
    const path = await import("node:path");
    mkdirSync(path.dirname(posterPath), { recursive: true });
    copyFileSync(p, posterPath);
    r.poster = posterPath;
  }
  return r;
}
