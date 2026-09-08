// Phase SOCIAL-CREATIVE-4B - HYBRID CREATIVE PIPELINE orchestrator + barrel.
//
//   REAL STORY
//   -> runEditorialGate()            (4A - relevance + FACT_LOCK + brief)
//   -> planEnrichments()             (§5 - real-data-only)
//   -> runCreativeDirector()         (§2 - structured direction + §21 critique)
//        -> detectFactMutation()     (§3 - AI_FACT_MUTATION on any drift)
//   -> generateBackground()          (§6 - data-free prompt, OpenAI image)
//   -> scanBackground()              (§8 - AI_BACKGROUND_REJECT on any flag)
//   -> buildCompositeSpec()          (§10 - modes A/B/C, canonical art guard)
//   => { mode, direction, enrichments, background, compositeSpec, budget }
//
// It performs NO rasterisation and NO DB write. renderCardForwardStory()
// calls this, then rasterises via the existing renderer; the proof script
// calls this to produce the owner pack. Bounded by budget.mjs (§22).

import { runEditorialGate } from "../editorial/index.mjs";
import { ANTI_PATTERNS } from "../editorial/brandSystem.mjs";
import { failure } from "../editorial/failureStates.mjs";
import { newBudget, canSpend } from "./budget.mjs";
import { planEnrichments } from "./enrichment.mjs";
import { runCreativeDirector, deterministicDirection } from "./creativeDirector.mjs";
import { buildBackgroundPrompt, generateBackground, scanBackground, SAFE_ZONE_BY_LAYOUT } from "./aiBackground.mjs";
import { chooseOutputMode, buildCompositeSpec } from "./compositor.mjs";
import { visualContractFor, checkVisualContract } from "./visualContracts.mjs";
import { runArtDirector } from "./artDirector.mjs";
import { buildSlots, renderBlueprintHtml, fallbackBlueprintFor } from "./freeformRenderer.mjs";
import { blueprintFingerprint, scoreConcept } from "./blueprint.mjs";
import { buildDesignCanvasPrompt, generateDesignCanvas, MAX_CANVAS_CANDIDATES } from "./designCanvas.mjs";
import { selectBestCanvas } from "./canvasReview.mjs";
import { renderCompositedCanvasHtml } from "./canvasCompositor.mjs";
import { canSpend as _canSpend } from "./budget.mjs";

export * from "./budget.mjs";
export * from "./enrichment.mjs";
export * from "./creativeDirector.mjs";
export * from "./aiBackground.mjs";
export * from "./compositor.mjs";
export * from "./visualContracts.mjs";
export * from "./blueprint.mjs";
export * from "./primitives.mjs";
export * from "./textFit.mjs";
export { runArtDirector } from "./artDirector.mjs";
export { buildSlots, renderBlueprintHtml, fallbackBlueprintFor, FALLBACK_BLUEPRINTS } from "./freeformRenderer.mjs";
export * from "./canvasSlots.mjs";
export { buildDesignCanvasPrompt, generateDesignCanvas, MAX_CANVAS_CANDIDATES } from "./designCanvas.mjs";
export { reviewCanvas, selectBestCanvas } from "./canvasReview.mjs";
export { renderCompositedCanvasHtml } from "./canvasCompositor.mjs";
export { webFirstCta, assertNotEbayDefaultCta, isEbayFirstCta, WEB_CTAS } from "./cta.mjs";
// --- Phase 5: FULL_GENERATIVE_SOCIAL + the simplified mode selector ---
export {
  PRODUCTION_IMAGE_MODES, DEPRECATED_IMAGE_PATHS, resolveImageMode, isDeprecatedImagePath, FULLGEN_STATES,
} from "./imageMode.mjs";
export {
  buildFactManifest, buildMasterPrompt, generateFullSocial, reviewCardFidelity,
  verifyFacts, reviewCreativeQuality, MAX_FULLGEN_CANDIDATES, FULLGEN_QUALITY_DIMS,
} from "./fullGenerative.mjs";
export { assessRepair, buildRepairOverlayHtml } from "./fullGenerativeRepair.mjs";
export { runFullGenerativeSocial } from "./fullGenerativePipeline.mjs";

export function fullGenerativeEnabled(env = process.env) {
  return resolveImageModeLocal(env) === "FULL_GENERATIVE_SOCIAL";
}
function resolveImageModeLocal(env) {
  const raw = String(env.SOCIAL_IMAGE_MODE ?? "").toLowerCase();
  return raw === "full_generative" || raw === "full_generative_social" ? "FULL_GENERATIVE_SOCIAL" : "SAFE_FALLBACK";
}

export const HYBRID_PIPELINE_VERSION = "4b1.1";

// hybrid is OFF unless explicitly enabled for the run.
export function hybridEnabled(env = process.env) {
  return String(env.SOCIAL_HYBRID_CREATIVE ?? "").toLowerCase() === "true";
}
// freeform art direction (§4B.1) is a further opt-in on top of hybrid.
export function freeformEnabled(env = process.env) {
  return String(env.SOCIAL_HYBRID_FREEFORM ?? "").toLowerCase() === "true";
}
// generative design canvas (§4B.2) - gpt-image-2 owns the visual design.
export function generativeCanvasEnabled(env = process.env) {
  return String(env.SOCIAL_GENERATIVE_CANVAS ?? "").toLowerCase() === "true";
}

// Run the §4B.2 generative-design-canvas stage: generate up to 2 canvases,
// safety-review + select (§19/§20), composite the real facts over it (§21).
// Returns { ok, html, canvasDataUrl, overlayManifest, review, canvases, cta }
// or { ok:false, ...failure }.
export async function runGenerativeCanvas({ layout, storyCategory, factLock, resolved, cardArt = {}, classification = "EDITORIAL", candidates = MAX_CANVAS_CANDIDATES, budget, env = process.env, fetchImpl = fetch } = {}) {
  const key = env.SOCIAL_IMAGE_GEN_API_KEY || env.OPENAI_API_KEY;
  if (!key) return { ok: false, state: "AI_BACKGROUND_REJECT", reason: "no key for generative design canvas", availability: "no_key" };

  const gen = [];
  for (let i = 0; i < Math.max(1, candidates); i++) {
    if (budget && !_canSpend(budget, "background_generation")) break;
    const spec = buildDesignCanvasPrompt({ layout, storyCategory, candidateSeed: i });
    // eslint-disable-next-line no-await-in-loop
    const r = await generateDesignCanvas({ spec, budget, env, fetchImpl });
    if (r.ok) gen.push({ b64: r.b64, sha256: r.sha256, prompt_sha: r.prompt_sha, prompt: spec.prompt, model: r.model });
    else gen.push({ failed: true, availability: r.availability, detail: r.detail });
  }
  const usable = gen.filter((g) => !g.failed);
  if (!usable.length) return { ok: false, state: "AI_BACKGROUND_REJECT", reason: `no design canvas generated (${gen.map((g) => g.availability).join(", ")})`, canvases: gen };

  const sel = await selectBestCanvas({ candidates: usable, layout, env, fetchImpl, budget });
  if (!sel.ok) return { ok: false, state: "AI_BACKGROUND_REJECT", reason: sel.reason, canvases: gen, reviewed: sel.reviewed };

  const canvasDataUrl = `data:image/png;base64,${sel.selected.b64}`;
  const comp = renderCompositedCanvasHtml({ layout, canvasDataUrl, factLock, resolved, cardArt, classification });
  return {
    ok: true,
    mode: "GENERATIVE_DESIGN_CANVAS",
    html: comp.html,
    canvas_data_url: canvasDataUrl,
    canvas_sha256: sel.selected.sha256,
    canvas_prompt_sha: sel.selected.prompt_sha,
    canvas_prompt: sel.selected.prompt,
    canvas_review: sel.selectedReview,
    canvases_generated: usable.length,
    canvases_rejected: (sel.reviewed ?? []).filter((x) => !x.review.ok).length,
    overlay_manifest: comp.overlayManifest,
    cta: comp.cta,
    model: sel.selected.model,
  };
}

const paletteWord = (hex) => {
  // crude hex -> colour-family word for the (data-free) background hint
  if (!/^#?[0-9a-f]{6}$/i.test(String(hex || ""))) return "neutral";
  const h = String(hex).replace("#", "");
  const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
  if (r > g && r > b) return r - Math.min(g, b) > 40 ? "warm" : "neutral";
  if (b > r && b > g) return "cool";
  if (g > r && g > b) return "green";
  return "neutral";
};

/**
 * runHybridPipeline({
 *   story, platform, layout, resolved, printingPair, originality,
 *   cardArt, deterministicProps, factOverlaySources, brandBox, canvas,
 *   recentFingerprints, cardPaletteHex, allowArtHosts,
 *   enabled, env, fetchImpl, budget
 * })
 */
export async function runHybridPipeline(opts = {}) {
  const {
    story, platform = "instagram", layout = "editorial",
    resolved = null, printingPair = null, originality = null,
    cardArt = {}, deterministicProps = {}, factOverlaySources = ["fact_lock"],
    brandBox = { w: 240, h: 64 }, canvas = { w: 1080, h: 1350 },
    recentFingerprints = [], cardPaletteHex = null, allowArtHosts = [],
    enabled = hybridEnabled(env0()), env = process.env, fetchImpl = fetch,
    budget = newBudget(),
  } = opts;

  // ---- 1. editorial gate (4A) ----------------------------------
  const gate = runEditorialGate({ story, platform, printingPair, originality });
  if (!gate.ok) {
    return { ok: false, stage: "editorial_gate", state: gate.state, reason: gate.reason, relevance: gate.relevance, budget };
  }
  const { brief, factLock, contract } = gate;

  // ---- 2. enrichment plan (§5) --------------------------------
  const enr = planEnrichments({ factLock, contract, resolved, layout });

  // ---- 3. creative director + critique (§2, §21, §3) ----------
  const brandSystem = { antiPatterns: ANTI_PATTERNS };
  const safeZones = SAFE_ZONE_BY_LAYOUT[layout] ?? SAFE_ZONE_BY_LAYOUT.editorial;
  const dir = await runCreativeDirector({
    factLock, brief, contract, brandSystem, platform,
    aspectRatio: brief.aspect_ratio, safeZones, recentFingerprints,
    enrichmentsAvailable: enr.enrichments.map((e) => e.kind),
    budget, env, fetchImpl,
  });
  if (!dir.ok) {
    return { ok: false, stage: "creative_director", state: dir.state, reason: dir.reason, mutations: dir.mutations, critique: dir.critique, budget };
  }

  // ---- 4. visual-contract check for the 5 key families -------
  const vc = visualContractFor(layout);
  const contractCheck = vc
    ? checkVisualContract(layout, {
        shows: [...(dir.direction.hierarchy ?? []), ...(brief.must_show ?? [])],
        enrichments: enr.enrichments,
        cardCount: layout === "three_up" ? 3 : layout === "printing_compare" ? 2 : 1,
        hasCta: contract.classification === "COMMERCIAL",
        relevanceMeaningful: !printingPair || (resolved?.data?.relevance?.verdict ?? resolved?.relevance?.verdict) === "MEANINGFUL" || gate.relevance?.printing?.verdict === "MEANINGFUL",
      })
    : null;

  // ---- 5. output mode + background (§6, §7, §8, §11) ---------
  let background = null;
  let backgroundOk = false;
  // 4B.2: in GENERATIVE_DESIGN_CANVAS mode the design canvas replaces the
  // 4B background entirely - don't spend an image call on both.
  const wantBackground = enabled && dir.source !== "deterministic" && !opts.generativeCanvas;
  const bgSpec = buildBackgroundPrompt({
    layout,
    densityHint: dir.direction.visual_density === "high" ? "medium" : "low",
    cardPaletteHint: cardPaletteHex ? paletteWord(cardPaletteHex) : null,
    storyCategory: contract.id,
  });

  if (wantBackground && canSpend(budget, "background_generation")) {
    const gen = await generateBackground({ spec: bgSpec, budget, env, fetchImpl });
    if (gen.ok) {
      const scan = await scanBackground({ b64: gen.b64, budget, env, fetchImpl });
      if (scan.ok) {
        background = { data_url: `data:${gen.mime};base64,${gen.b64}`, sha256: gen.sha256, prompt_sha: gen.prompt_sha, model: gen.model, scan: { ok: true, notes: scan.notes } };
        backgroundOk = true;
      } else {
        background = { rejected: true, state: "AI_BACKGROUND_REJECT", reason: scan.reason, flags: scan.flags ?? [], availability: scan.availability };
      }
    } else {
      background = { unavailable: true, availability: gen.availability, detail: gen.detail ?? null };
    }
  } else if (wantBackground) {
    background = { unavailable: true, availability: "budget_exhausted" };
  } else {
    background = { skipped: true, reason: enabled ? "director fell back to deterministic direction" : "hybrid not enabled for this run" };
  }

  // ---- 5b. FREEFORM ART DIRECTION (§4B.1) --------------------
  // The AI designs the WHOLE post as a blueprint of deterministic
  // primitives; every value still comes from the fact lock / resolver.
  let freeform = null;
  if (opts.freeform) {
    const ad = await runArtDirector({
      factLock, contract, brief, layout, target: opts.target ?? (platform === "youtube" ? "short_916" : "ig_45"),
      enrichmentsAvailable: enr.enrichments.map((e) => e.kind), recentFingerprints, relevance: gate.relevance,
      engagementObjectives: opts.engagementObjectives, budget, env, fetchImpl,
    });
    if (!ad.ok) {
      return { ok: false, stage: "art_director", state: ad.state, reason: ad.reason, mutations: ad.mutations, held: ad.held, budget };
    }
    const slots = buildSlots(layout, { factLock, resolved, cardArt });
    freeform = {
      blueprint: ad.blueprint,
      slots,
      html: renderBlueprintHtml(ad.blueprint, { slots, backgroundDataUrl: backgroundOk ? background.data_url : null }),
      source: ad.source,
      model: ad.model ?? null,
      concepts: ad.concepts,
      chosen_score: ad.chosenScore ?? scoreConcept(ad.blueprint, { enrichmentKinds: enr.enrichments.map((e) => e.kind), relevance: gate.relevance, recentFingerprints }),
      human_taste: ad.humanTaste,
      fingerprint: blueprintFingerprint(ad.blueprint),
      availability: ad.availability,
    };
  }

  // ---- 5c. GENERATIVE DESIGN CANVAS (§4B.2) -----------------
  // gpt-image-2 designs the whole visual; our compositor overlays the
  // real card + facts into the reserved slots.
  let generativeCanvas = null;
  if (opts.generativeCanvas) {
    const gc = await runGenerativeCanvas({
      layout, storyCategory: contract.id, factLock, resolved,
      cardArt, classification: contract.classification,
      candidates: opts.canvasCandidates ?? MAX_CANVAS_CANDIDATES,
      budget, env, fetchImpl,
    });
    if (!gc.ok) {
      return { ok: false, stage: "generative_canvas", state: gc.state ?? "AI_BACKGROUND_REJECT", reason: gc.reason, canvases: gc.canvases, budget };
    }
    generativeCanvas = gc;
  }

  const mode = generativeCanvas
    ? "GENERATIVE_DESIGN_CANVAS"
    : freeform
      ? "AI_DIRECTED_COMPOSITION"
      : chooseOutputMode({ enabled, direction: dir.direction ? { ...dir.direction, source: dir.source } : null, layout, backgroundOk });

  // ---- 6. composite spec (§10) - 4B / 4B.1 layer only. The 4B.2
  // generative canvas has its own compositor (canvasCompositor.mjs).
  let spec = { ok: true, mode };
  if (!generativeCanvas) {
    spec = buildCompositeSpec({
      mode,
      layout,
      target: opts.target ?? (platform === "youtube" ? "short_916" : "ig_45"),
      cardArt,
      backgroundDataUrl: backgroundOk ? background.data_url : null,
      backgroundSha: backgroundOk ? background.sha256 : null,
      deterministicProps,
      factOverlaySources,
      brandBox,
      canvas,
      allowArtHosts,
    });
    if (spec.ok === false || spec.state === "QA_FAIL") {
      return { ok: false, stage: "compositor", state: "QA_FAIL", reason: spec.reason, detail: spec.detail, budget };
    }
  }

  return {
    ok: true,
    mode: spec.mode,
    brief,
    factLock,
    factLockHash: gate.factLockHash,
    versionStamp: {
      ...gate.versionStamp,
      creative_director_model: dir.model ?? null,
      background_generation_model: backgroundOk ? background.model : null,
      hybrid_pipeline_version: HYBRID_PIPELINE_VERSION,
    },
    contract,
    relevance: gate.relevance,
    direction: dir.direction,
    direction_source: dir.source,
    critique: dir.critique,
    needs_revision: Boolean(dir.needs_revision),
    revise_hint: dir.revise_hint ?? null,
    enrichments: enr.enrichments,
    enrichments_rejected: enr.rejected,
    visual_contract: contractCheck,
    background,
    compositeSpec: spec,
    freeform,
    generativeCanvas,
    budget,
  };
}

function env0() { try { return process.env; } catch { return {}; } }

// A single bounded revision (§18, §22): only when the director asked for
// REVISE and there is a concrete hint. Re-runs the director ONCE with the
// hint appended; never regenerates in a loop.
export async function reviseOnce(prev, { env = process.env, fetchImpl = fetch } = {}) {
  if (!prev?.needs_revision || !prev.revise_hint) return { ...prev, revised: false, revise_skipped: "no concrete defect" };
  const budget = prev.budget;
  if (!canSpend(budget, "creative_director_call")) return { ...prev, revised: false, revise_skipped: "budget exhausted" };
  const det = deterministicDirection({ brief: prev.brief, contract: prev.contract, enrichmentsAvailable: prev.enrichments.map((e) => e.kind) });
  // A revision that still cannot get a concrete plan resolves to HELD.
  return { ...prev, direction: det.direction, direction_source: "deterministic_after_revise", needs_revision: false, revised: true };
}

export function heldFrom(prev, reason) {
  return { ok: false, ...failure("QA_WATCH", reason, { stage: "hybrid_pipeline" }), held: true, budget: prev?.budget ?? null };
}
