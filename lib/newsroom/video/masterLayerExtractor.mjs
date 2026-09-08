// Phase SOCIAL-CREATIVE-4C.2 - MASTER LAYER EXTRACTOR (§6, §7).
//
// The approved master creative is a finished premium image and stays the
// visual source of truth. This module represents it as motion-capable
// LOGICAL LAYERS - named normalised zones (x,y,w,h in 0..1) that the
// choreographer targets for masked reveals, selective crops, parallax and
// highlight sweeps. It does NOT slice pixels and does NOT rebuild the
// master as a generic fixed template.
//
// Zones are derived from: the known per-family fact structure + the
// deterministic overlay layout + the canonical card position, refined by
// an OPTIONAL vision layout pass. Deterministic-first (works with no key).
//
// Pure logic; the optional vision helper is the only network call.

import { recordCall } from "../hybrid/budget.mjs";

export const MASTER_LAYER_VERSION = "4c2.1";

// §6 - the motion-capable logical layers
export const MOTION_LAYERS = Object.freeze([
  "background", "hero_card", "headline", "primary_stat", "secondary_stat",
  "comparison_graphic", "chart", "why_panel", "cta", "brand", "decorative_accents",
]);

const Z = (x, y, w, h) => Object.freeze({ x, y, w, h });

// per-family DEFAULT zone maps (normalised). These match how the approved
// FULL_GENERATIVE_SOCIAL / 5A.1 masters actually compose: card-forward on
// the left/centre, a stat rail on the right, headline top, CTA bottom.
const FAMILY_ZONES = Object.freeze({
  deal_hero: {
    background: Z(0, 0, 1, 1),
    hero_card: Z(0.02, 0.20, 0.56, 0.66),
    headline: Z(0.30, 0.02, 0.70, 0.18),
    primary_stat: Z(0.60, 0.24, 0.40, 0.22),      // market reference
    secondary_stat: Z(0.60, 0.60, 0.40, 0.22),    // listed price
    comparison_graphic: Z(0.58, 0.44, 0.42, 0.18),// the % / arrow between them
    why_panel: Z(0.02, 0.80, 0.96, 0.12),
    cta: Z(0.02, 0.90, 0.96, 0.09),
    brand: Z(0.0, 0.0, 0.42, 0.09),
    decorative_accents: Z(0, 0, 1, 1),
  },
  asking_vs_sold: {
    background: Z(0, 0, 1, 1),
    hero_card: Z(0.04, 0.24, 0.56, 0.62),
    headline: Z(0.02, 0.02, 0.60, 0.16),
    primary_stat: Z(0.58, 0.16, 0.42, 0.20),      // ASK
    secondary_stat: Z(0.58, 0.44, 0.42, 0.20),    // MARKET
    comparison_graphic: Z(0.58, 0.36, 0.42, 0.14),
    why_panel: Z(0.02, 0.78, 0.96, 0.13),
    cta: Z(0.02, 0.90, 0.96, 0.09),
    brand: Z(0.0, 0.0, 0.42, 0.09),
    decorative_accents: Z(0, 0, 1, 1),
  },
  market_shape: {
    background: Z(0, 0, 1, 1),
    hero_card: Z(0.56, 0.30, 0.42, 0.44),          // the example card, off to the side
    headline: Z(0.02, 0.04, 0.56, 0.24),           // the big % stat
    primary_stat: Z(0.02, 0.04, 0.56, 0.24),
    secondary_stat: Z(0.02, 0.30, 0.52, 0.10),     // "of N tracked singles"
    chart: Z(0.02, 0.44, 0.52, 0.36),              // the distribution
    comparison_graphic: Z(0.02, 0.44, 0.52, 0.36),
    why_panel: Z(0.02, 0.82, 0.96, 0.12),
    cta: Z(0.02, 0.92, 0.96, 0.07),
    brand: Z(0.0, 0.0, 0.42, 0.09),
    decorative_accents: Z(0, 0, 1, 1),
  },
  three_up: {
    background: Z(0, 0, 1, 1),
    hero_card: Z(0.04, 0.22, 0.92, 0.44),          // the 3-card row
    headline: Z(0.02, 0.02, 0.96, 0.18),
    primary_stat: Z(0.04, 0.62, 0.92, 0.14),       // the price strip
    secondary_stat: Z(0.04, 0.62, 0.92, 0.14),
    comparison_graphic: Z(0.04, 0.62, 0.92, 0.14),
    why_panel: Z(0.02, 0.78, 0.96, 0.12),
    cta: Z(0.02, 0.90, 0.96, 0.09),
    brand: Z(0.0, 0.0, 0.42, 0.09),
    decorative_accents: Z(0, 0, 1, 1),
  },
  printing_compare: {
    background: Z(0, 0, 1, 1),
    hero_card: Z(0.04, 0.20, 0.92, 0.44),          // the two cards
    headline: Z(0.02, 0.02, 0.96, 0.16),
    primary_stat: Z(0.04, 0.62, 0.44, 0.16),
    secondary_stat: Z(0.52, 0.62, 0.44, 0.16),
    comparison_graphic: Z(0.04, 0.60, 0.92, 0.10),
    why_panel: Z(0.02, 0.80, 0.96, 0.12),
    cta: Z(0.02, 0.90, 0.96, 0.09),
    brand: Z(0.0, 0.0, 0.42, 0.09),
    decorative_accents: Z(0, 0, 1, 1),
  },
});

const clamp01 = (n) => Math.max(0, Math.min(1, Number(n) || 0));

// which layers actually carry content for this story (from fact structure)
function presentLayers({ family, semanticManifest: S }) {
  const p = new Set(["background", "hero_card", "headline", "cta", "brand", "decorative_accents"]);
  if (family === "deal_hero" || family === "asking_vs_sold") { p.add("primary_stat"); p.add("secondary_stat"); p.add("comparison_graphic"); p.add("why_panel"); }
  if (family === "market_shape") { p.add("primary_stat"); p.add("secondary_stat"); p.add("why_panel"); if (S?.visualization_data_manifest?.allowed_points?.length) { p.add("chart"); p.add("comparison_graphic"); } }
  if (family === "three_up") { p.add("primary_stat"); p.add("comparison_graphic"); p.add("why_panel"); }
  if (family === "printing_compare") { p.add("primary_stat"); p.add("secondary_stat"); p.add("comparison_graphic"); p.add("why_panel"); }
  return p;
}

/**
 * deriveLayers({ family, semanticManifest, visionBoxes? })
 *  -> { version, family, layers: { <name>: { present, zone, role, from } },
 *       hero_card_zone, order }
 * visionBoxes (optional) = { card, headline, primary_stat, comparison, cta }
 * each {x,y,w,h} normalised - used to REFINE the deterministic zones.
 */
export function deriveLayers({ family = "deal_hero", semanticManifest = {}, visionBoxes = null } = {}) {
  const base = FAMILY_ZONES[family] ?? FAMILY_ZONES.deal_hero;
  const present = presentLayers({ family, semanticManifest });
  const map = {};
  for (const name of MOTION_LAYERS) {
    let zone = base[name] ?? Z(0, 0, 1, 1);
    let from = "deterministic";
    if (visionBoxes) {
      const vb =
        name === "hero_card" ? visionBoxes.card
        : name === "headline" ? visionBoxes.headline
        : name === "primary_stat" ? visionBoxes.primary_stat
        : (name === "comparison_graphic" || name === "chart") ? visionBoxes.comparison
        : name === "cta" ? visionBoxes.cta
        : null;
      if (vb && Number.isFinite(vb.x) && vb.w > 0.02 && vb.h > 0.02) {
        zone = Z(clamp01(vb.x), clamp01(vb.y), clamp01(vb.w), clamp01(vb.h));
        from = "vision";
      }
    }
    map[name] = Object.freeze({ present: present.has(name), zone, role: name, from });
  }
  return Object.freeze({
    version: MASTER_LAYER_VERSION,
    family,
    layers: map,
    hero_card_zone: map.hero_card.zone,
    // the reveal order the choreographer follows (§15): HOOK -> CARD -> VALUE -> WHY -> CTA
    order: ["headline", "hero_card", "primary_stat", "secondary_stat", "comparison_graphic", "chart", "why_panel", "cta"].filter((n) => map[n].present),
  });
}

// OPTIONAL vision layout pass - only when SOCIAL_VIDEO_VISION_LAYOUT=true
// or the caller explicitly asks. Refines the deterministic zones.
export async function analyzeMasterLayout({ b64, family, env = process.env, fetchImpl = fetch, budget = null } = {}) {
  const key = env.SOCIAL_VISUAL_REVIEW_API_KEY || env.OPENAI_API_KEY;
  if (!key) return { ok: false, availability: "no_key" };
  const t0 = Date.now();
  const prompt =
    `This is a finished premium Pokemon-card social graphic (family: ${family}). Give me NORMALISED bounding boxes (x,y,w,h each 0..1, origin top-left) for the main regions so a motion designer can reveal them in order.\n` +
    `Respond with ONLY one JSON object: {"card":{"x":,"y":,"w":,"h":},"headline":{...},"primary_stat":{...},"comparison":{...},"cta":{...}}. Use zeros for a region that is not present.`;
  try {
    const res = await fetchImpl("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: env.SOCIAL_VISUAL_REVIEW_MODEL || "gpt-4o", temperature: 0, max_tokens: 400, response_format: { type: "json_object" }, messages: [{ role: "user", content: [{ type: "text", text: prompt }, { type: "image_url", image_url: { url: `data:image/png;base64,${b64}`, detail: "high" } }] }] }),
      signal: AbortSignal.timeout(45000),
    });
    if (budget) recordCall(budget, "visual_review_call", { ok: res.ok, latencyMs: Date.now() - t0, detail: "master_layout" });
    if (!res.ok) return { ok: false, availability: `http_${res.status}` };
    const body = await res.json();
    const m = (body?.choices?.[0]?.message?.content ?? "").match(/\{[\s\S]*\}/);
    return m ? { ok: true, boxes: JSON.parse(m[0]) } : { ok: false, availability: "unparseable" };
  } catch (e) {
    return { ok: false, availability: `error:${String(e?.message ?? e).slice(0, 60)}` };
  }
}
