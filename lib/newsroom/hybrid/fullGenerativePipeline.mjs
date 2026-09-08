// Phase SOCIAL-CREATIVE-5 - FULL_GENERATIVE_SOCIAL orchestrator.
//
//   real story
//   -> editorial relevance gate (4A)
//   -> build fact manifest (§5)
//   -> gather canonical card image(s) (§3)
//   -> build master art-direction prompt (§9-§14, with the real facts §4)
//   -> generate up to 2 full images via images/edits (real cards as input)
//   -> per candidate: card fidelity (§20) -> fact verify (§17) -> quality (§21)
//   -> pick the strongest CLEAN candidate
//   -> SAFE_REPAIR_REQUIRED + footer-patchable -> deterministic repair (§19)
//   -> BUFFER_READY   (or a §27 failure state)
//
// No silent fallback to weak creative. The caller decides SAFE_FALLBACK.

import { readFileSync, existsSync } from "node:fs";
import { runEditorialGate } from "../editorial/index.mjs";
import { failure, ready } from "../editorial/failureStates.mjs";
import { newBudget, canSpend } from "./budget.mjs";
import {
  buildFactManifest, buildMasterPrompt, generateFullSocial,
  reviewCardFidelity, verifyFacts, reviewCreativeQuality, MAX_FULLGEN_CANDIDATES,
} from "./fullGenerative.mjs";
import { assessRepair, buildRepairOverlayHtml } from "./fullGenerativeRepair.mjs";

export const FULL_GENERATIVE_PIPELINE_VERSION = "5.1";

const localOf = (p) => (p ? String(p).replace(/^file:\/\//, "") : null);
const b64Of = (p) => { const f = localOf(p); return f && existsSync(f) ? readFileSync(f).toString("base64") : null; };

/**
 * runFullGenerativeSocial({
 *   story, platform, layout, printingPair, originality,
 *   resolved,               // sanctioned resolver payload { data: {...} }
 *   cardImagePaths,          // [file:// | local] canonical card PNGs (§3)
 *   candidates, budget, env, fetchImpl,
 * })
 *
 * -> { ok:true, state:"BUFFER_READY", imageB64 | repairedHtml, factManifest,
 *      candidates:[...], selected, verification, budget }
 * -> { ok:false, state:<§27>, reason, factManifest?, budget }
 */
export async function runFullGenerativeSocial(opts = {}) {
  const {
    story, platform = "instagram", layout = "market_shape", printingPair = null, originality = null,
    resolved = null, cardImagePaths = [], candidates = MAX_FULLGEN_CANDIDATES,
    budget = newBudget(), env = process.env, fetchImpl = fetch,
  } = opts;

  // ---- editorial gate -------------------------------------
  const gate = runEditorialGate({ story, platform, printingPair, originality });
  if (!gate.ok) return { ok: false, state: "EDITORIAL_WITHHOLD", reason: gate.reason, relevance: gate.relevance, budget };
  const { factLock, contract, brief } = gate;

  // ---- fact manifest (§5) --------------------------------
  const factManifest = buildFactManifest({ layout, factLock, resolved, contract });

  // ---- gather real card images (§3) ---------------------
  const cardB64s = cardImagePaths.map(b64Of).filter(Boolean);
  if (!cardB64s.length && layout !== "market_shape") {
    return { ok: false, state: "GENERATION_FAILED", reason: "no canonical card image available to design around", factManifest, budget };
  }

  // ---- master prompt (§9-§14) --------------------------
  const prompt = buildMasterPrompt({ layout, factManifest });

  // ---- generate up to 2 candidates (§16) --------------
  const gen = [];
  for (let i = 0; i < Math.max(1, candidates); i++) {
    if (budget && !canSpend(budget, "background_generation")) break;
    // candidate 2 nudges toward a different composition
    const p = i === 0 ? prompt : `${prompt}\n\nCOMPOSITION NOTE: make this version a distinctly different layout from a typical treatment - vary the card scale, the placement, and the hierarchy.`;
    // eslint-disable-next-line no-await-in-loop
    const r = await generateFullSocial({ prompt: p, cardImagePaths, budget, env, fetchImpl });
    if (r.ok) gen.push({ b64: r.b64, sha256: r.sha256, model: r.model, prompt: p });
    else gen.push({ failed: true, availability: r.availability, detail: r.detail });
  }
  const made = gen.filter((g) => !g.failed);
  if (!made.length) {
    return { ok: false, state: "GENERATION_FAILED", reason: `image generation failed (${gen.map((g) => g.availability).join(", ")})`, detail: gen.find((g) => g.detail)?.detail, factManifest, budget };
  }

  // ---- per-candidate verification (§17, §20, §21) -----
  const assessed = [];
  for (const cand of made) {
    // eslint-disable-next-line no-await-in-loop
    const fidelity = await reviewCardFidelity({ b64: cand.b64, cardImageB64s: cardB64s, cardIdentity: factManifest.card_identity, env, fetchImpl, budget });
    // eslint-disable-next-line no-await-in-loop
    const facts = await verifyFacts({ b64: cand.b64, factManifest, env, fetchImpl, budget });
    // eslint-disable-next-line no-await-in-loop
    const quality = await reviewCreativeQuality({ b64: cand.b64, layout, env, fetchImpl, budget });
    assessed.push({ cand, fidelity, facts, quality });
  }

  // clean = card faithful AND (facts ok OR only footer-repairable) AND quality != FAIL
  const scoreOf = (a) => {
    const q = a.quality.scores ?? {};
    const good = ["scroll_stop", "professional_polish", "premium_feel", "card_is_hero", "story_instantly_clear", "supporting_graphics_useful", "information_rich_not_cluttered", "looks_like_a_real_media_brand", "save_share_likelihood", "click_curiosity"];
    const mean = good.reduce((s, k) => s + (Number(q[k]) || 0), 0) / good.length;
    return Math.round(mean - Math.max(0, (Number(q.ai_spam_risk) || 0) - 45) * 0.6 + (a.fidelity.fidelity_score ?? 70) * 0.15);
  };

  const usable = assessed
    .filter((a) => a.fidelity.ok && a.quality.verdict !== "FAIL")
    .map((a) => ({ ...a, needsRepair: !a.facts.ok && a.facts.state === "SAFE_REPAIR_REQUIRED", repair: !a.facts.ok && a.facts.state === "SAFE_REPAIR_REQUIRED" ? assessRepair(a.facts.repairable) : null }))
    .filter((a) => a.facts.ok || (a.needsRepair && a.repair.patchable))
    .sort((x, y) => scoreOf(y) - scoreOf(x));

  if (!usable.length) {
    // surface the strongest reason
    const cardFail = assessed.find((a) => !a.fidelity.ok);
    const factFail = assessed.find((a) => a.facts.state === "FACT_VERIFY_FAIL");
    const qualFail = assessed.every((a) => a.quality.verdict === "FAIL");
    if (cardFail && !factFail) return { ok: false, state: "CARD_FIDELITY_FAIL", reason: cardFail.fidelity.reason, factManifest, assessed: summ(assessed), budget };
    if (factFail) return { ok: false, state: "FACT_VERIFY_FAIL", reason: factFail.facts.reason, factManifest, assessed: summ(assessed), budget };
    if (qualFail) return { ok: false, state: "VISUAL_QUALITY_HOLD", reason: "every candidate was a FAIL on the creative quality review", factManifest, assessed: summ(assessed), budget };
    const repairNeeded = assessed.find((a) => a.facts.state === "SAFE_REPAIR_REQUIRED");
    if (repairNeeded) return { ok: false, state: "SAFE_REPAIR_REQUIRED", reason: repairNeeded.facts.reason, factManifest, assessed: summ(assessed), budget };
    return { ok: false, state: "VISUAL_QUALITY_HOLD", reason: "no candidate cleared verification", factManifest, assessed: summ(assessed), budget };
  }

  const best = usable[0];
  let repairedHtml = null;
  if (best.needsRepair) {
    if (budget) budget.used.revisions = (budget.used.revisions ?? 0) + 1;
    repairedHtml = buildRepairOverlayHtml({
      generatedDataUrl: `data:image/png;base64,${best.cand.b64}`,
      ctaText: factManifest.classification === "COMMERCIAL" ? factManifest.cta.text : null,
      domain: "pokemondealfinder.com",
    });
  }

  const finalVerdict = best.quality.verdict; // PASS | WATCH
  return {
    ok: true,
    ...ready({ stage: "full_generative_social" }),
    state: "BUFFER_READY",
    layout,
    imageB64: best.cand.b64,
    imageSha256: best.cand.sha256,
    model: best.cand.model,
    repairedHtml, // present only when a footer patch was applied
    repaired: Boolean(repairedHtml),
    factManifest,
    factLockHash: gate.factLockHash,
    master_prompt: prompt,
    selected: { fidelity_score: best.fidelity.fidelity_score, quality_verdict: finalVerdict, quality_scores: best.quality.scores, score: scoreOf(best) },
    verification: { card_fidelity: best.fidelity.ok, fact_verify: best.facts.ok ? "PASS" : best.facts.state, quality_verdict: finalVerdict },
    candidates_generated: made.length,
    candidates_rejected: assessed.length - usable.length,
    caption_handoff: { // §30 - persist for the later caption director
      story_angle: brief?.editorial_angle ?? null,
      hook_rule: brief?.hook_rule ?? contract?.acceptable_hook ?? null,
      why_it_matters: brief?.why_it_matters ?? contract?.meaningful ?? null,
      supporting_facts: brief?.supporting_facts ?? [],
      cta_intent: factManifest.cta,
    },
    quality_hold: finalVerdict === "WATCH",
    budget,
  };
}

function summ(assessed) {
  return assessed.map((a) => ({
    fidelity_ok: a.fidelity.ok, fidelity_score: a.fidelity.fidelity_score ?? null,
    fact_state: a.facts.ok ? "PASS" : a.facts.state,
    quality: a.quality.verdict,
  }));
}
