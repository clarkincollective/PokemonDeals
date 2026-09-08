// Phase SOCIAL-CREATIVE-5 - DETERMINISTIC REPAIR, NOT REBUILD (§19).
//
// If the generated post is visually excellent but has a SMALL factual /
// text slip, apply a limited deterministic patch - never rebuild the
// design. What can be safely patched without pixel coordinates:
//   * a missing / wrong PokemonDealFinder wordmark
//   * a missing / wrong pokemondealfinder.com domain
//   * a missing / wrong website-first CTA
// -> composite a clean brand+CTA footer strip over the bottom band.
//
// Anything that would require replacing a factual value MID-DESIGN
// (a wrong price, a wrong %, a garbled fact) is NOT patchable here ->
// the caller holds it as SAFE_REPAIR_REQUIRED (no silent weak fallback).
//
// Pure string building - returns HTML the renderer rasterises over the
// generated image.

import { TOKENS } from "../../social/creativeSpec.mjs";
import { FONT_FACE_CSS } from "../../social/fontData.mjs";

const C = TOKENS.color;
const e = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// Which missing-text items a footer patch can satisfy.
const FOOTER_PATCHABLE = /pokemondealfinder|pokemondealfinder\.com|see the live deal|find more deals|browse live deals|see it on pokemondealfinder/i;

// Decide whether the verify result is repairable by a footer patch alone.
//   repairable = { missing:[], typos:[] }
// Returns { patchable:boolean, reason, footerNeeds:[] }.
export function assessRepair(repairable = {}) {
  const missing = repairable.missing ?? [];
  const typos = repairable.typos ?? [];
  const footerNeeds = missing.filter((t) => FOOTER_PATCHABLE.test(String(t)));
  const nonFooterMissing = missing.filter((t) => !FOOTER_PATCHABLE.test(String(t)));
  if (typos.length) return { patchable: false, reason: `garbled/typo text cannot be safely patched without coordinates: ${typos.join(", ")}`, footerNeeds };
  if (nonFooterMissing.length) return { patchable: false, reason: `missing factual text needs an in-design fix, not a footer patch: ${nonFooterMissing.join(", ")}`, footerNeeds };
  if (!footerNeeds.length) return { patchable: false, reason: "nothing footer-patchable", footerNeeds };
  return { patchable: true, reason: null, footerNeeds };
}

// Build the repair overlay: the generated image full-bleed + a clean
// bottom brand/CTA strip carrying the correct wordmark, domain and CTA.
export function buildRepairOverlayHtml({ generatedDataUrl, ctaText = null, domain = "pokemondealfinder.com", canvasW = 1080, canvasH = 1350 } = {}) {
  if (!generatedDataUrl || !/^data:image\//.test(String(generatedDataUrl))) throw new Error("buildRepairOverlayHtml: need a data: image URL");
  const strip =
    `<div style="position:absolute;left:0;right:0;bottom:0;height:96px;z-index:2;` +
    `background:linear-gradient(180deg,rgba(11,11,13,0),rgba(11,11,13,0.86) 40%,rgba(11,11,13,0.95));` +
    `display:flex;align-items:flex-end;justify-content:space-between;padding:0 48px 22px">` +
    `<span style="font-weight:800;letter-spacing:.02em;color:${C.inkSub};font-size:24px">PokemonDealFinder</span>` +
    (ctaText ? `<span style="font-weight:800;color:${C.ink};font-size:26px">${e(ctaText)} &rarr;</span>` : "") +
    `<span style="color:${C.inkFaint};font-size:22px">${e(domain)}</span>` +
    `</div>`;
  return `<!doctype html><html><head><meta charset="utf-8"><style>
${FONT_FACE_CSS}
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:${canvasW}px;height:${canvasH}px;background:${C.bg};overflow:hidden;font-family:${(TOKENS.type.body?.size, "Geist, system-ui, sans-serif")}}
</style></head><body>
<div style="position:absolute;inset:0;z-index:0;background:${C.bg} url('${String(generatedDataUrl).replace(/'/g, "%27")}') center/cover no-repeat"></div>
${strip}
</body></html>`;
}

export const FULLGEN_REPAIR_VERSION = "5.1";
