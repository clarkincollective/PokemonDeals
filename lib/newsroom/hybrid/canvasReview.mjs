// Phase SOCIAL-CREATIVE-4B.2 - CANVAS SAFETY REVIEW (§20) + CANDIDATE
// SELECTION (§19).
//
// Reviews the RAW generated design canvas (before any factual overlay) for
// hard violations and for design usability, and - given two candidates -
// picks the stronger one BEFORE the compositor runs.
//
// A vision call (gpt-4o), same boundary as visualReview.mjs. No key -> the
// canvas CANNOT be cleared (the pipeline then falls back to a non-generative
// mode), it is never used unscanned.

import { failure } from "../editorial/failureStates.mjs";
import { recordCall } from "./budget.mjs";

const ENDPOINT = "https://api.openai.com/v1/chat/completions";
const MODEL = process.env.SOCIAL_VISUAL_REVIEW_MODEL || "gpt-4o";

export const CANVAS_VIOLATIONS = Object.freeze([
  "invented_trading_card",
  "pokemon_character_or_creature",
  "readable_text_or_letters",
  "fake_numbers_or_statistics",
  "fake_logos_or_brands",
  "watermark_or_signature",
  "broken_geometry_or_artifacts",
  "generic_ai_social_look",
]);

export const CANVAS_QUALITY_DIMS = Object.freeze([
  "premium_editorial_feel", // higher = better
  "information_design_richness",
  "composition_strength",
  "safe_zone_usability", // are the reserved regions actually calm + usable
  "scroll_stop_potential",
  "brand_atmosphere",
]);

function prompt(layout) {
  return (
    `This is a RAW design canvas for a premium Pokemon-card collector-media post (layout family: ${layout}). ` +
    `It should be a finished, richly art-directed NON-FACTUAL visual - panels, dividers, arrows, empty data-viz frames, ` +
    `editorial boxes, brand atmosphere - with EMPTY reserved regions where a real card image and real text/data will be composited later.\n\n` +
    `1) VIOLATIONS - answer true if present AT ALL:\n` +
    CANVAS_VIOLATIONS.map((v) => `- ${v}`).join("\n") +
    `\n"readable_text_or_letters" is true if ANY glyphs, words, or numbers are legible anywhere. ` +
    `"invented_trading_card" is true if anything looks like an actual trading card face / slab / card art (an EMPTY framed panel is fine and expected). ` +
    `"generic_ai_social_look" is true if it reads as generic AI filler / a SaaS dashboard / a crypto or PowerPoint graphic rather than hand-designed premium editorial.\n\n` +
    `2) QUALITY - score each 0-100 (higher = better):\n` +
    CANVAS_QUALITY_DIMS.join(", ") +
    `\n\nRespond with ONLY one JSON object: {"violations":{${CANVAS_VIOLATIONS.map((v) => `"${v}":<bool>`).join(",")}},"quality":{${CANVAS_QUALITY_DIMS.map((d) => `"${d}":<n>`).join(",")}},"notes":["short"]}`
  );
}

async function reviewOne({ b64, layout, key, fetchImpl, budget }) {
  const t0 = Date.now();
  try {
    const res = await fetchImpl(ENDPOINT, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: MODEL, temperature: 0, max_tokens: 400, response_format: { type: "json_object" },
        messages: [{ role: "user", content: [
          { type: "text", text: prompt(layout) },
          { type: "image_url", image_url: { url: `data:image/png;base64,${b64}`, detail: "low" } },
        ] }],
      }),
      signal: AbortSignal.timeout(45000),
    });
    if (budget) recordCall(budget, "visual_review_call", { ok: res.ok, latencyMs: Date.now() - t0, detail: "canvas_safety" });
    if (!res.ok) return { ok: false, availability: `http_${res.status}` };
    const body = await res.json();
    const m = (body?.choices?.[0]?.message?.content ?? "").match(/\{[\s\S]*\}/);
    const parsed = m ? JSON.parse(m[0]) : {};
    const violations = CANVAS_VIOLATIONS.filter((v) => parsed.violations?.[v] === true || parsed.violations?.[v] === "true");
    const quality = parsed.quality ?? {};
    const qScore = CANVAS_QUALITY_DIMS.reduce((a, d) => a + (Number(quality[d]) || 0), 0) / CANVAS_QUALITY_DIMS.length;
    return { ok: true, violations, quality, qScore: Math.round(qScore), notes: parsed.notes ?? [], availability: "openai" };
  } catch (e) {
    if (budget) recordCall(budget, "visual_review_call", { ok: false, latencyMs: Date.now() - t0, detail: "canvas_safety_error" });
    return { ok: false, availability: `error:${String(e?.message ?? e).slice(0, 80)}` };
  }
}

// §20 - review one canvas. HARD violations (invented card / character /
// readable text / fake numbers / fake logos / watermark) => reject.
// broken_geometry / generic_ai_look => reject only if quality is also
// weak. Returns { ok } | { ok:false, ...failure("AI_BACKGROUND_REJECT"), violations }.
const HARD = new Set(["invented_trading_card", "pokemon_character_or_creature", "readable_text_or_letters", "fake_numbers_or_statistics", "fake_logos_or_brands", "watermark_or_signature"]);

export async function reviewCanvas({ b64, layout = "market_shape", env = process.env, fetchImpl = fetch, budget = null } = {}) {
  const key = env.SOCIAL_VISUAL_REVIEW_API_KEY || env.OPENAI_API_KEY;
  if (!key) return { ok: false, availability: "no_key", ...failure("AI_BACKGROUND_REJECT", "no key to run the §20 canvas safety review - canvas not used") };
  if (!b64) return { ok: false, ...failure("AI_BACKGROUND_REJECT", "no canvas bytes to review") };
  const r = await reviewOne({ b64, layout, key, fetchImpl, budget });
  if (!r.ok) return { ok: false, availability: r.availability, ...failure("AI_BACKGROUND_REJECT", `canvas safety review unavailable (${r.availability}) - canvas not used`) };

  const hard = r.violations.filter((v) => HARD.has(v));
  if (hard.length) return { ok: false, availability: "openai", violations: r.violations, quality: r.quality, ...failure("AI_BACKGROUND_REJECT", `canvas violates: ${hard.join(", ")}`) };
  const soft = r.violations.filter((v) => !HARD.has(v));
  if (soft.includes("generic_ai_social_look") && r.qScore < 58) {
    return { ok: false, availability: "openai", violations: r.violations, quality: r.quality, ...failure("AI_BACKGROUND_REJECT", `canvas reads as generic AI filler and quality is weak (${r.qScore})`) };
  }
  if (soft.includes("broken_geometry_or_artifacts") && r.qScore < 55) {
    return { ok: false, availability: "openai", violations: r.violations, quality: r.quality, ...failure("AI_BACKGROUND_REJECT", `canvas has broken geometry and quality is weak (${r.qScore})`) };
  }
  return { ok: true, availability: "openai", violations: r.violations, quality: r.quality, q_score: r.qScore, notes: r.notes };
}

// §19 - given candidate canvases, review each and return the strongest
// CLEAN one. candidates = [{ b64, sha256, prompt_sha }].
export async function selectBestCanvas({ candidates = [], layout = "market_shape", env = process.env, fetchImpl = fetch, budget = null } = {}) {
  const reviewed = [];
  for (const c of candidates) {
    // eslint-disable-next-line no-await-in-loop
    const r = await reviewCanvas({ b64: c.b64, layout, env, fetchImpl, budget });
    reviewed.push({ candidate: c, review: r });
  }
  const clean = reviewed.filter((x) => x.review.ok);
  if (!clean.length) {
    return { ok: false, reviewed, ...failure("AI_BACKGROUND_REJECT", `no design canvas passed the §20 safety review (${reviewed.map((x) => x.review.reason).join(" | ")})`) };
  }
  clean.sort((a, b) => (b.review.q_score ?? 0) - (a.review.q_score ?? 0));
  return { ok: true, selected: clean[0].candidate, selectedReview: clean[0].review, reviewed };
}

export const CANVAS_REVIEW_VERSION = "4b2.1";
