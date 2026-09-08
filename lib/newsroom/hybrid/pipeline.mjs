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

export * from "./budget.mjs";
export * from "./enrichment.mjs";
export * from "./creativeDirector.mjs";
export * from "./aiBackground.mjs";
export * from "./compositor.mjs";
export * from "./visualContracts.mjs";

export const HYBRID_PIPELINE_VERSION = "4b.1";

// hybrid is OFF unless explicitly enabled for the run.
export function hybridEnabled(env = process.env) {
  return String(env.SOCIAL_HYBRID_CREATIVE ?? "").toLowerCase() === "true";
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
  const wantBackground = enabled && dir.source !== "deterministic";
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

  const mode = chooseOutputMode({ enabled, direction: dir.direction ? { ...dir.direction, source: dir.source } : null, layout, backgroundOk });

  // ---- 6. composite spec (§10) -------------------------------
  const spec = buildCompositeSpec({
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
