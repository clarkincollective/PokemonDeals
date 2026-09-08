// Phase SOCIAL-CREATIVE-4B.1 - SENIOR AI ART DIRECTOR: multi-concept
// generation (§18), concept scoring + selection (§19), human-taste review
// (§20). FREEDOM IN DESIGN, RIGIDITY IN FACTS.
//
// One OpenAI call returns up to 3 lightweight design BLUEPRINTS (zone
// arrangement + strategy prose - NO factual values). Each is validated +
// clamped deterministically, scored, and the best non-generic one is
// selected. Then ONE background image is generated for the winner (the
// caller does that). No key / failure -> the deterministic per-family
// fallback blueprint.
//
// Lives in lib/newsroom/ (GenAI boundary, like creativeDirector.mjs).

import { detectFactMutation } from "../editorial/factLock.mjs";
import { failure } from "../editorial/failureStates.mjs";
import { canSpend, recordCall } from "./budget.mjs";
import { validateBlueprint, scoreConcept, chooseConcept, genericCompositionReject, COMPOSITION_STYLES, ZONE_ROLES } from "./blueprint.mjs";
import { fallbackBlueprintFor } from "./freeformRenderer.mjs";

const ENDPOINT = "https://api.openai.com/v1/chat/completions";
const MODEL = process.env.SOCIAL_ART_DIRECTOR_MODEL || "gpt-4o";
export const ART_DIRECTOR_VERSION = "4b1.1";
export const MAX_CONCEPTS = 3;

export function artDirectorAvailable(env = process.env) {
  return Boolean(env.SOCIAL_ART_DIRECTOR_API_KEY || env.OPENAI_API_KEY);
}

function buildPrompt({ factLock, contract, brief, layout, target, canvas, enrichmentsAvailable, recentFingerprints, engagementObjectives }) {
  const facts = {};
  for (const k of Object.keys(factLock)) if (k !== "_present") facts[k] = factLock[k];
  return (
    `You are a SENIOR ART DIRECTOR at a premium Pokemon-card collectibles media brand (PokemonDealFinder). ` +
    `Design ${MAX_CONCEPTS} DISTINCT full-post layout concepts for ONE post. You control the ENTIRE composition - ` +
    `you are NOT limited to "card left, text right".\n\n` +
    `STORY: ${contract?.id} — ${contract?.meaningful}\n` +
    `CANVAS: ${canvas.w}x${canvas.h} (${target}).\n` +
    `BRAND: charcoal/near-black ground, one restrained red accent, white type, green ONLY for a real positive saving. ` +
    `Premium editorial. NOT a SaaS dashboard, NOT a crypto infographic, NOT a finance chart, NOT a PowerPoint slide, ` +
    `NOT a static ad template, NOT empty black space with a few numbers.\n\n` +
    `IMMUTABLE FACTS (context only — you place them via primitives, you NEVER type a value; echo unchanged under "facts_echo"):\n` +
    JSON.stringify(facts, null, 1) + `\n\n` +
    `AVAILABLE DETERMINISTIC PRIMITIVES (a zone's "role" MUST be one of these — the renderer fills them with the real data):\n` +
    ZONE_ROLES.join(", ") + `\n\n` +
    `ENRICHMENTS BACKED BY REAL DATA (use only these): ${(enrichmentsAvailable ?? []).join(", ") || "none"}\n` +
    `COMPOSITION STYLES: ${COMPOSITION_STYLES.join(", ")}\n` +
    `RECENT FEED FINGERPRINTS (make your concepts DIFFERENT from these): ${JSON.stringify((recentFingerprints ?? []).slice(0, 6))}\n` +
    `OPTIMISE FOR: ${(engagementObjectives ?? ["SCROLL_STOP", "USEFULNESS", "COLLECTOR_RELEVANCE"]).join(", ")}.\n\n` +
    `For EACH concept return a design blueprint. content_zones give x,y,width,height IN PIXELS on the canvas, a priority 1-10, and an alignment. ` +
    `Keep every zone fully inside the canvas. Give it a real hero zone (hero_card / hero_stat / card_triptych / spotlight_panel), ` +
    `a "why this matters" zone, a brand zone, and useful supporting graphics. Avoid dead space AND crowding. ` +
    `Ask yourself: would this look good if a human designer posted it manually?\n\n` +
    `Respond with ONLY one JSON object:\n` +
    `{"concepts":[{"composition_style":"..","visual_flow":"..","visual_density":"low|medium|high","content_zones":[{"role":"..","x":0,"y":0,"width":0,"height":0,"priority":5,"alignment":"start"}],` +
    `"hero_card_strategy":"..","hero_fact_strategy":"..","supporting_graphics":[{"type":"..","purpose":"..","source_fact_ids":[]}],"callouts":[],"annotations":[],` +
    `"why_this_matters":"..","chart_strategy":"..","spacing_strategy":"..","brand_strategy":"..","cta_strategy":"..","thumbnail_strategy":"..",` +
    `"expected_scroll_stop_reason":"..","expected_share_save_reason":"..","engagement_objectives":[]}],` +
    `"facts_echo":{...immutable facts unchanged...},"human_taste":{"concept_index":0,"would_a_designer_post_this":true,"why":".."}}`
  );
}

/**
 * runArtDirector({ factLock, contract, brief, layout, target,
 *   enrichmentsAvailable, recentFingerprints, relevance, budget, env, fetchImpl })
 *
 * ->  { ok:true, blueprint, source, concepts:[{blueprint,score}], chosenScore,
 *       humanTaste, factMutation:null }
 *     { ok:false, ...failure("AI_FACT_MUTATION"|"COMPOSITION_REJECT"|"QA_WATCH") }
 */
export async function runArtDirector(opts = {}) {
  const {
    factLock = {}, contract = null, brief = null, layout = "editorial", target = "ig_45",
    enrichmentsAvailable = [], recentFingerprints = [], relevance = null,
    budget = null, env = process.env, fetchImpl = fetch,
  } = opts;

  const canvas = target === "short_916" ? { w: 1080, h: 1920 } : { w: 1080, h: 1350 };
  const fb = fallbackBlueprintFor(layout);
  const key = env.SOCIAL_ART_DIRECTOR_API_KEY || env.OPENAI_API_KEY;

  const deterministicResult = () => {
    if (!fb) return { ok: false, ...failure("CARD_FORWARD_RENDER_UNAVAILABLE", `no fallback blueprint for layout "${layout}"`, { stage: "art_director" }) };
    const v = validateBlueprint(fb, { target, factIds: factLock._present ?? [] });
    return { ok: true, blueprint: v.blueprint, source: "deterministic", concepts: [{ blueprint: v.blueprint, ...scoreConcept(v.blueprint, { enrichmentKinds: enrichmentsAvailable, relevance, recentFingerprints }) }], humanTaste: { would_a_designer_post_this: true, why: "curated deterministic layout" }, factMutation: null, availability: key ? "fallback" : "no_key" };
  };

  if (!key || (budget && !canSpend(budget, "creative_director_call"))) return deterministicResult();

  const t0 = Date.now();
  let raw = null, err = null;
  try {
    const res = await fetchImpl(ENDPOINT, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: MODEL, temperature: 0.6, max_tokens: 4000, response_format: { type: "json_object" },
        messages: [{ role: "user", content: buildPrompt({ factLock, contract, brief, layout, target, canvas, enrichmentsAvailable, recentFingerprints, engagementObjectives: opts.engagementObjectives }) }],
      }),
      signal: AbortSignal.timeout(60000),
    });
    if (!res.ok) err = `http ${res.status}`;
    else {
      const body = await res.json();
      const text = body?.choices?.[0]?.message?.content ?? "";
      const m = text.match(/\{[\s\S]*\}/);
      raw = m ? JSON.parse(m[0]) : null;
    }
  } catch (ex) {
    err = String(ex?.message ?? ex).slice(0, 140);
  }
  if (budget) recordCall(budget, "creative_director_call", { ok: !err && !!raw, latencyMs: Date.now() - t0, detail: err ? `art_director:${err}` : "art_director" });

  if (err || !raw || !Array.isArray(raw.concepts) || !raw.concepts.length) {
    return { ...deterministicResult(), availability: `fallback:${err ?? "unparseable"}` };
  }

  // §3 - fact mutation over the echo + the concept prose (a smuggled
  // number anywhere is caught).
  const mut = detectFactMutation(factLock, { facts_echo: raw.facts_echo ?? {}, concepts: raw.concepts }, { stage: "art_director" });
  if (!mut.ok) return { ok: false, ...failure("AI_FACT_MUTATION", mut.reason, { stage: "art_director", detail: { mutations: mut.mutations } }), mutations: mut.mutations };

  // validate + clamp each concept
  const validated = raw.concepts.slice(0, MAX_CONCEPTS).map((c) => validateBlueprint(c, { target, factIds: factLock._present ?? [] }));
  const usable = validated.filter((v) => v.ok).map((v) => v.blueprint);
  if (!usable.length) {
    return { ...deterministicResult(), availability: "fallback:all_concepts_invalid", concept_errors: validated.flatMap((v) => v.errors) };
  }

  const pick = chooseConcept(usable, { enrichmentKinds: enrichmentsAvailable, relevance, recentFingerprints });
  if (!pick.chosen) {
    // §8 - every concept was GENERIC_COMPOSITION_REJECT -> fall back
    return { ...deterministicResult(), availability: "fallback:generic_composition_reject", generic_reasons: pick.scored.flatMap((s) => s.generic_reasons ?? []) };
  }

  // §21 - the hand-tuned per-family fallback is a QUALITY FLOOR: if the
  // AI's best concept does not beat it, use the fallback.
  if (fb) {
    const fbv = validateBlueprint(fb, { target, factIds: factLock._present ?? [] });
    const fbScore = scoreConcept(fbv.blueprint, { enrichmentKinds: enrichmentsAvailable, relevance, recentFingerprints });
    if (pick.chosenScore.overall < fbScore.overall - 2) {
      return {
        ok: true, blueprint: fbv.blueprint, source: "deterministic_fallback_beat_ai", model: MODEL,
        concepts: [...pick.scored.map((s) => ({ blueprint: s.blueprint, overall: s.overall, generic: s.generic })), { blueprint: fbv.blueprint, overall: fbScore.overall, generic: false, fallback: true }],
        chosenScore: fbScore, humanTaste: raw.human_taste ?? {}, factMutation: null,
        availability: `fallback:ai_${pick.chosenScore.overall}_below_floor_${fbScore.overall}`,
      };
    }
  }

  // §20 - human-taste review
  const ht = raw.human_taste ?? {};
  const designerWouldPost = ht.would_a_designer_post_this !== false;
  const chosenScore = pick.chosenScore;
  if (!designerWouldPost && chosenScore.overall < 62) {
    return { ok: false, ...failure("QA_WATCH", `human-taste review: a designer would not post this (overall ${chosenScore.overall})`, { stage: "art_director_taste", detail: ht }), held: true };
  }

  return {
    ok: true,
    blueprint: pick.chosen,
    source: "openai",
    model: MODEL,
    concepts: pick.scored.map((s) => ({ blueprint: s.blueprint, overall: s.overall, generic: s.generic, dead_space_score: s.dead_space_score, crowding_score: s.crowding_score, scores: s.scores })),
    chosenScore,
    humanTaste: ht,
    factMutation: null,
    availability: "openai",
  };
}

export { validateBlueprint, scoreConcept, genericCompositionReject };
