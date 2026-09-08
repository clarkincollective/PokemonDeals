// Phase SOCIAL-CREATIVE-4B - AI CREATIVE DIRECTOR (§2) + FACT MUTATION
// CHECK (§3) + PRE-RENDER CRITIQUE (§21).
//
// Lives in lib/newsroom/ (NOT lib/social/) - same boundary as
// visualReview.mjs and socialAssets.mjs: the social-preview tests forbid a
// GenAI call inside lib/social.
//
// The director receives the IMMUTABLE FACT_LOCK as context and returns a
// STRUCTURED direction object - layout intent, hierarchy, background
// direction, enrichment strategy, spacing, a collector takeaway, and a
// self-critique. It NEVER rewrites a factual value; detectFactMutation()
// runs over its output immediately and any drift -> AI_FACT_MUTATION.
//
// FALLBACK (§22 bounded): no key / http error / unparseable -> a
// deterministic direction built from the brief + contract. The pipeline
// still runs (as HYBRID_BACKGROUND at most, or DETERMINISTIC_ONLY).

import { detectFactMutation } from "../editorial/factLock.mjs";
import { failure } from "../editorial/failureStates.mjs";
import { canSpend, recordCall } from "./budget.mjs";

const ENDPOINT = "https://api.openai.com/v1/chat/completions";
const MODEL = process.env.SOCIAL_CREATIVE_DIRECTOR_MODEL || "gpt-4o";

export const DIRECTOR_FIELDS = Object.freeze([
  "layout_intent",
  "hero_strategy",
  "hierarchy",
  "supporting_graphics",
  "background_direction",
  "texture_direction",
  "accent_strategy",
  "chart_suggestion",
  "annotation_strategy",
  "spacing_strategy",
  "crop_strategy",
  "visual_density",
  "collector_takeaway",
  "why_this_works",
]);

// Fields the director is allowed to influence. Anything factual is passed
// as read-only context and echoed back for the mutation check ONLY.
const DIRECTION_ENUMS = {
  visual_density: ["low", "medium", "high"],
  accent_strategy: ["none", "single_red", "positive_green_if_real_saving"],
};

export function directorAvailable(env = process.env) {
  return Boolean(env.SOCIAL_CREATIVE_DIRECTOR_API_KEY || env.OPENAI_API_KEY);
}

function buildPrompt({ factLock, brief, contract, brandSystem, platform, aspectRatio, safeZones, recentFingerprints, enrichmentsAvailable }) {
  const facts = {};
  for (const k of Object.keys(factLock)) if (k !== "_present") facts[k] = factLock[k];
  return (
    `You are the CREATIVE DIRECTOR of a premium Pokemon-card / collectibles media brand (PokemonDealFinder). ` +
    `You plan the visual direction for ONE finished social post - like a real editorial art director, not a template filler.\n\n` +
    `STORY TYPE: ${contract?.id ?? brief?.story_type}\n` +
    `WHY IT MATTERS: ${contract?.meaningful ?? brief?.why_it_matters}\n` +
    `PLATFORM: ${platform} (${aspectRatio})\n` +
    `BRAND: charcoal/near-black ground, one restrained red accent, white type, green ONLY for a real positive saving. ` +
    `Premium editorial collector media - NOT crypto, NOT a SaaS dashboard, NOT a finance infographic, NOT neon gamer, NOT a discount blowout.\n` +
    `AVOID: ${(brandSystem?.antiPatterns ?? []).slice(0, 6).join("; ")}\n\n` +
    `IMMUTABLE FACTS (context only - you MUST NOT change, round, or invent any of these; echo them back verbatim under "facts_echo"):\n` +
    JSON.stringify(facts, null, 1) +
    `\n\nREQUIRED VISUAL EVIDENCE (from the story contract): ${(contract?.required_visual_evidence ?? []).join("; ")}\n` +
    `MUST NOT SHOW: ${(contract?.must_not_do ?? []).join("; ")}\n` +
    `ENRICHMENTS AVAILABLE FROM REAL DATA (you may call for these; never invent others): ${(enrichmentsAvailable ?? []).join(", ") || "none"}\n` +
    `SAFE ZONES (keep these clear for the deterministic text/data overlay): ${JSON.stringify(safeZones ?? {})}\n` +
    `RECENT FEED FINGERPRINTS (vary from these - do not repeat a layout/hero-location/background family that dominates): ${JSON.stringify((recentFingerprints ?? []).slice(0, 8))}\n\n` +
    `Think about: hierarchy, story clarity at THUMBNAIL size, premium feel, collector relevance, USEFUL supporting graphics, whitespace balance, visual rhythm, dead space, anything decorative-but-meaningless.\n\n` +
    `Then CRITIQUE your own plan honestly: is the story obvious? is the supporting visual evidence useful? is hierarchy strong? does it look collector-native? is anything redundant or dead space?\n\n` +
    `Respond with ONLY one JSON object:\n` +
    `{\n` +
    `  "direction": { ${DIRECTOR_FIELDS.map((f) => `"${f}": ...`).join(", ")} },\n` +
    `  "facts_echo": { ...every immutable fact key, unchanged... },\n` +
    `  "critique": { "story_clear": true|false, "evidence_useful": true|false, "hierarchy_strong": true|false, "collector_native": true|false, "redundancy": [".."], "dead_space_risk": true|false, "meaningless_decoration": [".."], "verdict": "PROCEED"|"REVISE"|"REJECT", "revise_hint": ".." }\n` +
    `}\n` +
    `"visual_density" must be one of ${JSON.stringify(DIRECTION_ENUMS.visual_density)}; "accent_strategy" one of ${JSON.stringify(DIRECTION_ENUMS.accent_strategy)}.`
  );
}

// Deterministic direction from the brief + contract (fallback / mode A).
export function deterministicDirection({ brief, contract, enrichmentsAvailable = [] }) {
  const commercial = contract?.classification === "COMMERCIAL";
  return {
    direction: {
      layout_intent: `${contract?.layout_family ?? brief?.layout_family ?? "editorial"} - one dominant element, evidence beneath`,
      hero_strategy: brief?.hero_element ?? contract?.required_visual_evidence?.[0] ?? "canonical card art, large",
      hierarchy: [...(brief?.visual_hierarchy ?? contract?.required_visual_evidence ?? [])],
      supporting_graphics: enrichmentsAvailable.slice(0, 3),
      background_direction: "clean premium dark editorial ground, low detail, calm behind the overlay",
      texture_direction: "fine grain, soft top-left light, no gradient-as-emphasis",
      accent_strategy: commercial ? "positive_green_if_real_saving" : "single_red",
      chart_suggestion: enrichmentsAvailable.includes("price_gap_bar") ? "price_gap_bar" : enrichmentsAvailable.includes("pct_distribution") ? "pct_distribution" : "none",
      annotation_strategy: "one short label per data point, no paragraphs",
      spacing_strategy: "generous; increasing air top-to-bottom; CTA + disclosure pinned",
      crop_strategy: "contain the card, no crop of the art",
      visual_density: "low",
      collector_takeaway: contract?.meaningful ?? brief?.why_it_matters ?? null,
      why_this_works: "the one fact that matters is the largest thing; the card is unmistakably real; nothing competes with it",
    },
    critique: { story_clear: true, evidence_useful: true, hierarchy_strong: true, collector_native: true, redundancy: [], dead_space_risk: false, meaningless_decoration: [], verdict: "PROCEED", revise_hint: null },
    source: "deterministic",
  };
}

function normaliseDirection(d) {
  const out = {};
  for (const f of DIRECTOR_FIELDS) out[f] = d?.[f] ?? null;
  if (!DIRECTION_ENUMS.visual_density.includes(out.visual_density)) out.visual_density = "low";
  if (!DIRECTION_ENUMS.accent_strategy.includes(out.accent_strategy)) out.accent_strategy = "single_red";
  if (!Array.isArray(out.hierarchy)) out.hierarchy = out.hierarchy ? [String(out.hierarchy)] : [];
  if (!Array.isArray(out.supporting_graphics)) out.supporting_graphics = out.supporting_graphics ? [String(out.supporting_graphics)] : [];
  return out;
}

/**
 * runCreativeDirector({ factLock, brief, contract, brandSystem, platform,
 *   aspectRatio, safeZones, recentFingerprints, enrichmentsAvailable,
 *   budget, env, fetchImpl })
 *
 * Returns:
 *   { ok:true, direction, critique, source, factMutation:null, budget }
 *   { ok:false, ...failure("AI_FACT_MUTATION"|"CREATIVE_BRIEF_REJECT"), budget }
 */
export async function runCreativeDirector(opts = {}) {
  const {
    factLock = {}, brief = null, contract = null, brandSystem = null, platform = "instagram",
    aspectRatio = "4:5", safeZones = null, recentFingerprints = [], enrichmentsAvailable = [],
    budget = null, env = process.env, fetchImpl = fetch,
  } = opts;

  const key = env.SOCIAL_CREATIVE_DIRECTOR_API_KEY || env.OPENAI_API_KEY;
  const det = deterministicDirection({ brief, contract, enrichmentsAvailable });

  if (!key || (budget && !canSpend(budget, "creative_director_call"))) {
    return { ok: true, ...det, factMutation: null, availability: key ? "budget_exhausted" : "no_key", budget };
  }

  const t0 = Date.now();
  let raw = null;
  let httpErr = null;
  try {
    const res = await fetchImpl(ENDPOINT, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0.4,
        max_tokens: 900,
        response_format: { type: "json_object" },
        messages: [{ role: "user", content: buildPrompt({ factLock, brief, contract, brandSystem, platform, aspectRatio, safeZones, recentFingerprints, enrichmentsAvailable }) }],
      }),
      signal: AbortSignal.timeout(45000),
    });
    if (!res.ok) { httpErr = `http ${res.status}`; }
    else {
      const body = await res.json();
      const text = body?.choices?.[0]?.message?.content ?? "";
      const m = text.match(/\{[\s\S]*\}/);
      raw = m ? JSON.parse(m[0]) : null;
    }
  } catch (e) {
    httpErr = String(e?.message ?? e).slice(0, 140);
  }
  if (budget) recordCall(budget, "creative_director_call", { ok: !httpErr && !!raw, latencyMs: Date.now() - t0, detail: httpErr });

  if (httpErr || !raw) {
    return { ok: true, ...det, factMutation: null, availability: `fallback:${httpErr ?? "unparseable"}`, budget };
  }

  // §3 - the fact mutation check, over BOTH the echoed facts and the whole
  // direction object (a smuggled number anywhere is caught).
  const mut = detectFactMutation(factLock, { facts_echo: raw.facts_echo ?? {}, direction: raw.direction ?? {} }, { stage: "creative_director" });
  if (!mut.ok) {
    return { ok: false, ...failure("AI_FACT_MUTATION", mut.reason, { stage: "creative_director", detail: { mutations: mut.mutations } }), mutations: mut.mutations, budget };
  }

  const critique = raw.critique ?? {};
  const verdict = String(critique.verdict ?? "PROCEED").toUpperCase();
  if (verdict === "REJECT") {
    return { ok: false, ...failure("CREATIVE_BRIEF_REJECT", `creative director rejected the plan: ${critique.revise_hint ?? "weak premise / weak layout"}`, { stage: "creative_director_critique", detail: critique }), critique, budget };
  }

  return {
    ok: true,
    direction: normaliseDirection(raw.direction ?? {}),
    critique,
    needs_revision: verdict === "REVISE",
    revise_hint: critique.revise_hint ?? null,
    source: "openai",
    model: MODEL,
    factMutation: null,
    availability: "openai",
    budget,
  };
}

export const CREATIVE_DIRECTOR_VERSION = "4b.1";
