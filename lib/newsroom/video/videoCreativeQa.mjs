// Phase SOCIAL-CREATIVE-4C.1 - GENERATIVE VIDEO CREATIVE-QUALITY GATE (§17).
//
// The 4C engineering was sound but the visuals looked like sparse animated
// templates - black ground, centred card, a couple of text lines, huge
// empty areas. A generated scene board must be visually comparable to the
// owner-approved FULL_GENERATIVE_SOCIAL images:
//
//   SPARSE_TEMPLATE_FAIL          - sparse animated-template layout
//   CENTERED_CARD_ONLY_FAIL       - just a centred card on empty ground
//   EXCESS_EMPTY_SPACE_FAIL       - most of the frame is empty
//   GENERIC_MOTION_GRAPHICS_FAIL  - generic MG / SaaS UI / gaming HUD
//   VISUAL_STYLE_MISMATCH_FAIL    - not the premium collector-editorial style
//
// One gpt-4o vision call per board, scored deterministically. No key ->
// the board is NOT certified (fail closed). Lives in lib/newsroom/.

import { failure } from "../editorial/failureStates.mjs";
import { recordCall } from "../hybrid/budget.mjs";

export const VIDEO_CREATIVE_QA_VERSION = "4c1.1";

const ENDPOINT = "https://api.openai.com/v1/chat/completions";
const MODEL = process.env.SOCIAL_VISUAL_REVIEW_MODEL || "gpt-4o";

// The style bar, in words the vision model can check a frame against.
export const STYLE_BAR =
  "Premium Pokemon-card collector editorial. Modern trading-card magazine / high-end collectibles publication / professional social infographic. " +
  "Rich, layered information design. Card-first hierarchy. Strong typography. Tasteful charts, stat blocks, why-this-matters panels, a branded header/footer treatment. " +
  "Depth, texture, shadows. Clean but visually DENSE. Save/share worthy. Editorial - NOT templated, NOT sparse, NOT a centred card on black, NOT SaaS UI, NOT a gaming HUD, NOT PowerPoint.";

/**
 * auditVideoCreativeQa({ b64, frameRole, env, fetchImpl, budget })
 *  -> { ok, findings, scores } | { ok:false, ...failure(<state>) }
 */
export async function auditVideoCreativeQa({ b64, frameRole = "scene", env = process.env, fetchImpl = fetch, budget = null } = {}) {
  const key = env.SOCIAL_VISUAL_REVIEW_API_KEY || env.OPENAI_API_KEY;
  if (!key) return { ok: false, ...failure("VISUAL_STYLE_MISMATCH_FAIL", "no key to run the §17 generative creative-quality review") };
  const t0 = Date.now();
  const prompt =
    `This is ONE keyframe (role: ${frameRole}) from a premium Pokemon-card collector-media short-form video. ` +
    `Judge it against this bar:\n"${STYLE_BAR}"\n\n` +
    `Respond with ONLY one JSON object:\n` +
    `{"composition_density":<0-100, how much of the frame carries designed content - panels, type, chart, card, texture>,` +
    `"empty_space_pct":<0-100, share of the frame that is flat empty background with nothing on it>,` +
    `"is_centered_card_only":<bool - a single card centred on an otherwise empty ground with maybe one line of text>,` +
    `"is_sparse_template":<bool - looks like a sparse animated template / lower-third slate, not a designed editorial frame>,` +
    `"is_generic_motion_graphics":<bool - generic motion-graphics / SaaS dashboard / gaming HUD / tactical UI / crypto infographic look>,` +
    `"has_designed_background":<bool - a real designed/textured/layered ground, not flat black or a plain gradient>,` +
    `"editorial_richness":<0-100 - layered panels, hierarchy, charts/stat blocks, magazine feel>,` +
    `"matches_premium_collector_editorial":<bool - would sit convincingly next to a top collector publication's graphics>,` +
    `"card_is_hero":<bool>,` +
    `"notes":["short"]}`;
  try {
    const res = await fetchImpl(ENDPOINT, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: MODEL, temperature: 0, max_tokens: 500, response_format: { type: "json_object" }, messages: [{ role: "user", content: [{ type: "text", text: prompt }, { type: "image_url", image_url: { url: `data:image/png;base64,${b64}`, detail: "high" } }] }] }),
      signal: AbortSignal.timeout(60000),
    });
    if (budget) recordCall(budget, "visual_review_call", { ok: res.ok, latencyMs: Date.now() - t0, detail: "video_creative_qa" });
    if (!res.ok) return { ok: false, ...failure("VISUAL_STYLE_MISMATCH_FAIL", `creative-quality review unavailable (http_${res.status})`) };
    const body = await res.json();
    const m = (body?.choices?.[0]?.message?.content ?? "").match(/\{[\s\S]*\}/);
    if (!m) return { ok: false, ...failure("VISUAL_STYLE_MISMATCH_FAIL", "creative-quality review unparseable") };
    const p = JSON.parse(m[0]);
    return gradeCreativeQa(p, frameRole);
  } catch (e) {
    if (budget) recordCall(budget, "visual_review_call", { ok: false, latencyMs: Date.now() - t0, detail: "video_creative_qa_error" });
    return { ok: false, ...failure("VISUAL_STYLE_MISMATCH_FAIL", `creative-quality review error: ${String(e?.message ?? e).slice(0, 80)}`) };
  }
}

// deterministic grading of the vision extraction
export function gradeCreativeQa(p = {}, frameRole = "scene") {
  const density = Number(p.composition_density ?? 0);
  const empty = Number(p.empty_space_pct ?? 100);
  const rich = Number(p.editorial_richness ?? 0);
  const findings = [];
  // a pure hook / CTA frame is allowed to be a touch airier than a data frame
  const emptyCap = /hook|cta/i.test(frameRole) ? 52 : 42;
  const denseFloor = /hook|cta/i.test(frameRole) ? 45 : 55;

  if (p.is_centered_card_only === true) findings.push({ code: "CENTERED_CARD_ONLY_FAIL", detail: "a centred card on an otherwise empty ground" });
  if (p.is_sparse_template === true || density < denseFloor) findings.push({ code: "SPARSE_TEMPLATE_FAIL", detail: `sparse / template layout (density ${density}, floor ${denseFloor})` });
  if (empty > emptyCap) findings.push({ code: "EXCESS_EMPTY_SPACE_FAIL", detail: `${empty}% of the frame is empty (cap ${emptyCap}%)` });
  if (p.is_generic_motion_graphics === true) findings.push({ code: "GENERIC_MOTION_GRAPHICS_FAIL", detail: "generic motion-graphics / SaaS / HUD look" });
  if (p.matches_premium_collector_editorial === false || p.has_designed_background === false || rich < 45) {
    findings.push({ code: "VISUAL_STYLE_MISMATCH_FAIL", detail: `not the premium collector-editorial style (richness ${rich}, designed_bg ${p.has_designed_background})` });
  }

  const scores = {
    composition_density: density,
    empty_space_pct: empty,
    editorial_richness: rich,
    matches_style: p.matches_premium_collector_editorial === true,
    has_designed_background: p.has_designed_background === true,
    card_is_hero: p.card_is_hero === true,
    notes: p.notes ?? [],
  };
  if (!findings.length) return { ok: true, findings: [], scores };
  // specific diagnoses first, then the general "sparse / off-style" ones
  const ORDER = ["CENTERED_CARD_ONLY_FAIL", "GENERIC_MOTION_GRAPHICS_FAIL", "EXCESS_EMPTY_SPACE_FAIL", "SPARSE_TEMPLATE_FAIL", "VISUAL_STYLE_MISMATCH_FAIL"];
  const state = ORDER.find((s) => findings.some((f) => f.code === s)) ?? findings[0].code;
  return { ok: false, ...failure(state, findings.map((f) => f.detail).join(" | ").slice(0, 300), { stage: "video_creative_qa", detail: { findings } }), findings, scores };
}
