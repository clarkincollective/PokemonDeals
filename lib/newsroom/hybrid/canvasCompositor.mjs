// Phase SOCIAL-CREATIVE-4B.2 - DETERMINISTIC COMPOSITOR (§21, §22, §23).
//
// OUR CODE OWNS THE TRUTH. Takes the selected, safety-reviewed design
// canvas (a full generated visual) and overlays the REAL card art + exact
// facts into the reserved semantic slots (canvasSlots.SLOT_LAYOUTS):
//
//   layer 0  the generated design canvas (data: image)   -- gpt-image-2
//   layer 1  per-slot readability scrim                    -- deterministic
//   layer 2  canonical card art + factual primitives      -- FACT_LOCK / resolver only
//
// Every value comes from buildSlots() (4B.1) which reads only the fact
// lock / sanctioned resolver output. Chart/bar PROPORTIONS are computed
// deterministically here (§23) - never taken from the image geometry.
// Text is measured-fit (§22) - never clipped. The CTA is website-first
// (§11) - "View on eBay" can never be the social CTA.

import { TOKENS } from "../../social/creativeSpec.mjs";
import { FONT_FACE_CSS } from "../../social/fontData.mjs";
import { renderPrimitive } from "./primitives.mjs";
import { fitText } from "./textFit.mjs";
import { SLOT_LAYOUTS, CANVAS_W, CANVAS_H } from "./canvasSlots.mjs";
import { buildSlots } from "./freeformRenderer.mjs";
import { webFirstCta, assertNotEbayDefaultCta } from "./cta.mjs";

const C = TOKENS.color;
const S = Object.fromEntries(Object.entries(TOKENS.type).map(([k, v]) => [k, v && typeof v === "object" ? v.size : v]));

export const CANVAS_COMPOSITOR_VERSION = "4b2.1";

// slot -> { primitive, props(slotData), scrim } per family. `slotData` is
// the buildSlots() output for the layout.
const CARD_SLOTS = new Set(["HERO_CARD_SLOT", "SECONDARY_CARD_SLOT", "CARD_TRIPTYCH_SLOT"]);

function slotPlan(layout, s, cta) {
  // s = buildSlots() output; cta = webFirstCta() result
  const chartFor = {
    deal_hero: ["price_gap_bar", s.price_gap_bar],
    market_shape: ["distribution_bar", s.distribution_bar],
    asking_vs_sold: ["market_range", s.market_range],
    printing_compare: ["mini_timeline", s.mini_timeline],
    three_up: ["metric_strip", s.metric_strip],
  }[layout] ?? ["metric_strip", s.metric_strip];
  const supportFor = {
    deal_hero: ["price_pair", s.price_pair],
    market_shape: ["metric_strip", s.metric_strip],
    asking_vs_sold: ["difference_arrow", s.difference_arrow],
    printing_compare: ["variant_badge", s.variant_badge],
    three_up: ["metric_strip", s.metric_strip],
  }[layout] ?? ["metric_strip", s.metric_strip];

  return {
    HERO_CARD_SLOT: ["hero_card", s.hero_card, 0],
    SECONDARY_CARD_SLOT: ["secondary_card", s.secondary_card ?? s.hero_card, 0],
    CARD_TRIPTYCH_SLOT: ["card_triptych", s.card_triptych, 0],
    HEADLINE_SLOT: ["headline", s.headline, 0.5],
    HERO_STAT_SLOT: ["hero_stat", s.hero_stat, 0.42],
    SUPPORTING_STAT_SLOT: supportFor.concat(0.4),
    CHART_SLOT: chartFor.concat(0.4),
    COMPARISON_SLOT: ["comparison_axis", s.comparison_axis, 0.42],
    WHY_THIS_MATTERS_SLOT: ["why_this_matters_box", s.why_this_matters_box, 0.0],
    CTA_SLOT: ["cta", { text: cta.text }, 0.35],
    BRAND_SLOT: ["brand_mark", {}, 0.3],
    FOOTER_SLOT: ["website_footer", {}, 0.3],
  };
}

/**
 * renderCompositedCanvasHtml({ layout, canvasDataUrl, factLock, resolved,
 *   cardArt, classification })
 *  -> { html, overlayManifest } where overlayManifest lists every factual
 *     value placed and its source (for the §27 owner material).
 */
export function renderCompositedCanvasHtml({ layout, canvasDataUrl = null, factLock = {}, resolved = null, cardArt = {}, classification = "EDITORIAL" } = {}) {
  const slots = SLOT_LAYOUTS[layout];
  if (!slots) throw new Error(`canvasCompositor: no slot layout for "${layout}"`);
  const s = buildSlots(layout, { factLock, resolved, cardArt });
  const cta = webFirstCta({ classification, layout });
  assertNotEbayDefaultCta(cta.text); // §11 hard guard

  const plan = slotPlan(layout, s, cta);
  const manifest = [];
  const zonesHtml = Object.entries(slots).map(([slotName, r]) => {
    const entry = plan[slotName];
    if (!entry) return "";
    const [primName, props, scrimAlpha] = entry;
    const isCard = CARD_SLOTS.has(slotName);
    const ctx = { C, S, zone: { width: r.w, height: r.h }, fit: fitText };
    let inner = "";
    try {
      inner = renderPrimitive(primName, props ?? {}, ctx);
      recordManifest(manifest, slotName, primName, props);
    } catch (err) {
      inner = isCard
        ? `<div style="width:100%;height:100%;border:1px dashed ${C.hair};border-radius:14px"></div>`
        : `<div style="color:${C.inkFaint};font-size:15px">${primName}</div>`;
    }
    // §22 - a per-slot readability scrim (skipped for card slots - the
    // card image is opaque). Card slots get a faint frame instead.
    const scrim = isCard
      ? `background:rgba(11,11,13,0.28);border:1px solid rgba(255,255,255,0.05);border-radius:14px;`
      : scrimAlpha > 0
        ? `background:rgba(11,11,13,${scrimAlpha});backdrop-filter:blur(2px);border-radius:12px;`
        : "";
    const pad = isCard ? 6 : slotName === "WHY_THIS_MATTERS_SLOT" ? 0 : 14;
    return `<div style="position:absolute;left:${r.x}px;top:${r.y}px;width:${r.w}px;height:${r.h}px;overflow:hidden;z-index:2;display:flex;flex-direction:column;justify-content:center;${scrim}padding:${pad}px">${inner}</div>`;
  }).join("\n");

  const bgLayer = canvasDataUrl && /^data:image\//.test(String(canvasDataUrl))
    ? `<div style="position:absolute;inset:0;z-index:0;background:${C.bg} url('${String(canvasDataUrl).replace(/'/g, "%27")}') center/cover no-repeat"></div>
       <div style="position:absolute;inset:0;z-index:1;background:linear-gradient(180deg,rgba(11,11,13,.30),rgba(11,11,13,.14) 42%,rgba(11,11,13,.42))"></div>`
    : `<div style="position:absolute;inset:0;z-index:0;background:${C.bg}"></div>`;

  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
${FONT_FACE_CSS}
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:${CANVAS_W}px;height:${CANVAS_H}px;background:${C.bg};color:${C.ink};font-family:${S.family};-webkit-font-smoothing:antialiased;overflow:hidden}
</style></head><body>${bgLayer}<div style="position:absolute;inset:0">${zonesHtml}</div></body></html>`;

  return { html, overlayManifest: manifest, cta };
}

function recordManifest(manifest, slot, primitive, props) {
  const flat = [];
  const walk = (o, path) => {
    if (o == null || typeof o !== "object") { if (o != null && o !== "") flat.push({ key: path, value: String(o).slice(0, 60) }); return; }
    if (Array.isArray(o)) { o.forEach((v, i) => walk(v, `${path}[${i}]`)); return; }
    for (const [k, v] of Object.entries(o)) walk(v, path ? `${path}.${k}` : k);
  };
  walk(props ?? {}, "");
  manifest.push({ slot, primitive, values: flat, source: "FACT_LOCK / sanctioned resolver (buildSlots)" });
}
