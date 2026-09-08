// Phase SOCIAL-CREATIVE-5A - BRAND LOCK (§12, §13, §14).
//
// The image model MUST NOT draw the final PokemonDealFinder brand mark:
//   * the prompt asks it to leave a clean brand-safe strip;
//   * the approved deterministic wordmark + magnifier icon (components/
//     Logo.js - a red circle-with-handle, NOT a Poke Ball) is composited
//     over that strip after generation;
//   * the visual verifier flags a generated Poke Ball-like / red-and-white
//     ball / official-Pokemon-style mark as GENERATED_BRAND_RISK.
//
// Pure string building for the overlay + a small policy clause.

import { TOKENS } from "../../social/creativeSpec.mjs";
import { FONT_FACE_CSS } from "../../social/fontData.mjs";

const C = TOKENS.color;
const e = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

export const BRAND_LOCK_VERSION = "5a.1";
export const APPROVED_BRAND = Object.freeze({
  wordmark_pokemon: "Pokemon", // red
  wordmark_rest: "Deal Finder", // white/ink
  domain: "pokemondealfinder.com",
  icon: "magnifier", // circle + diagonal handle - NEVER a ball
  icon_forbidden: ["Poke Ball", "red/white split circle", "any ball-shaped logo", "official Pokemon / Nintendo / TPC style mark"],
});

// §1 - the HARD brand-safe-zone reservation, added to every generation
// prompt. The top ~8% of the 1350px canvas (roughly the top 110px) is
// OWNED by the deterministic compositor and must be completely empty.
export const BRAND_SAFE_ZONE_TOP_PX = 110; // of a 1080x1350 canvas (~8.1%)
export const BRAND_SAFE_ZONE_CLAUSE =
  "BRAND-SAFE ZONE (HARD RULE): leave the ENTIRE top ~8% of the image - roughly the top 110 pixels of the 1350px-tall canvas, edge to edge - " +
  "COMPLETELY EMPTY. Do NOT place any headline, title, large text, card art, logo, icon, chart, badge, price, number, arrow, or important visual element " +
  "inside that top strip. It may carry only a calm dark background / faint texture. It will be filled after generation. " +
  "Start the real composition (headline, card, everything) BELOW that strip. " +
  "Also: do NOT draw the PokemonDealFinder logo or wordmark yourself anywhere, and NEVER draw a Poke Ball, a red-and-white ball / circle icon, " +
  "or any official-Pokemon / Nintendo-style brand mark - the approved brand mark is composited into the top strip afterward.";

// The approved brand mark as an inline SVG (mirrors components/Logo.js).
function brandMarkSvg(px = 34) {
  const s = px;
  return `<svg width="${s}" height="${s}" viewBox="0 0 150 150" style="flex:0 0 auto">
  <circle cx="58" cy="58" r="40" fill="none" stroke="${C.brand}" stroke-width="13"/>
  <line x1="87" y1="87" x2="128" y2="128" stroke="${C.brand}" stroke-width="17" stroke-linecap="round"/>
</svg>`;
}

// §14 - composite the approved brand asset + domain over the generated
// image. `where` = "top" | "bottom" | "both".
export function compositeBrandAssetHtml({ generatedDataUrl, where = "top", ctaText = null, canvasW = 1080, canvasH = 1350 } = {}) {
  if (!generatedDataUrl || !/^data:image\//.test(String(generatedDataUrl))) throw new Error("compositeBrandAssetHtml: need a data: image URL");
  const bar = (pos) => `<div style="position:absolute;left:0;right:0;${pos}:0;height:${pos === "top" ? BRAND_SAFE_ZONE_TOP_PX : 88}px;z-index:3;` +
    `background:${pos === "top" ? "rgba(11,11,13,0.96)" : "linear-gradient(0deg,rgba(11,11,13,0.92),rgba(11,11,13,0.72) 55%,rgba(11,11,13,0))"};` +
    `display:flex;align-items:center;justify-content:space-between;padding:0 44px">` +
    `<span style="display:inline-flex;align-items:center;gap:12px">${brandMarkSvg(pos === "top" ? 34 : 28)}` +
    `<span style="font-weight:800;letter-spacing:-0.01em;font-size:${pos === "top" ? 27 : 23}px"><span style="color:${C.brand}">Pokemon</span> <span style="color:${C.ink}">Deal Finder</span></span></span>` +
    (pos === "bottom" && ctaText ? `<span style="font-weight:800;color:${C.ink};font-size:24px">${e(ctaText)} &rarr;</span>` : "") +
    `<span style="color:${C.inkFaint};font-size:${pos === "top" ? 21 : 20}px">${APPROVED_BRAND.domain}</span>` +
    `</div>`;
  const bars = (where === "both" ? ["top", "bottom"] : [where]).map(bar).join("");
  return `<!doctype html><html><head><meta charset="utf-8"><style>
${FONT_FACE_CSS}
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:${canvasW}px;height:${canvasH}px;background:${C.bg};overflow:hidden;font-family:${TOKENS.type.body?.family ?? "Geist, system-ui, sans-serif"}}
</style></head><body>
<div style="position:absolute;inset:0;z-index:0;background:${C.bg} url('${String(generatedDataUrl).replace(/'/g, "%27")}') center/cover no-repeat"></div>
${bars}
</body></html>`;
}

export const BRAND_MARK_SVG = brandMarkSvg;
