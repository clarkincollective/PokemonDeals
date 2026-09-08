// Phase SOCIAL-CREATIVE-4C - MOTION-NATIVE ANIMATED DOCUMENT.
//
// Turns a videoDirector scene plan into ONE self-contained animated HTML
// document (1080x1920). Motion is expressed as @keyframes on a SINGLE
// shared timeline: every animated element has the same animation-duration
// (= the whole video), animation-play-state: paused, fill-mode: both, and
// keyframe percentages mapped from absolute ms. The renderer seeks all
// animations to an exact currentTime per frame - fully deterministic.
//
// Real card art is embedded as a data: URI. No network at render time, no
// external fonts, no OpenAI. This module builds a string and nothing else.

import { readFileSync, existsSync } from "node:fs";

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const dataUri = (p) => {
  const f = String(p ?? "").replace(/^file:\/\//, "");
  if (!f || !existsSync(f)) return null;
  const ext = f.split(".").pop().toLowerCase();
  const mime = ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";
  return `data:${mime};base64,${readFileSync(f).toString("base64")}`;
};

// map an absolute ms window to keyframe % on the shared timeline
const pct = (ms, total) => Math.max(0, Math.min(100, (ms / total) * 100));

// one enter/hold/exit keyframe block for a scene layer
function sceneLayerKeyframes(name, s, total, enterFrom) {
  const inMs = s.start_ms;
  const inDone = Math.min(s.end_ms, s.start_ms + 520);
  const outStart = Math.max(inDone, s.end_ms - 420);
  const outMs = s.end_ms;
  const p = (ms) => pct(ms, total).toFixed(3);
  return `@keyframes ${name}{
    0%,${p(Math.max(0, inMs - 1))}%{opacity:0;transform:${enterFrom};}
    ${p(inMs)}%{opacity:0;transform:${enterFrom};}
    ${p(inDone)}%{opacity:1;transform:translate3d(0,0,0) scale(1);}
    ${p(outStart)}%{opacity:1;transform:translate3d(0,0,0) scale(1);}
    ${p(outMs)}%{opacity:0;transform:translate3d(0,-28px,0) scale(0.99);}
    100%{opacity:0;}
  }`;
}

// the primitive that drives the HERO element inside a scene
function primitiveKeyframes(name, s, total, motion) {
  const p = (ms) => pct(ms, total).toFixed(3);
  const a = s.start_ms, b = Math.min(s.end_ms, s.start_ms + 900), h = Math.max(b, s.end_ms - 300);
  switch (motion) {
    case "card_slide_reveal":
      return `@keyframes ${name}{0%,${p(a)}%{opacity:0;transform:translate3d(0,140px,0) scale(0.96);}${p(b)}%{opacity:1;transform:translate3d(0,0,0) scale(1);}100%{opacity:1;}}`;
    case "crop_detail_reveal":
      return `@keyframes ${name}{0%,${p(a)}%{transform:scale(1);}${p(h)}%{transform:scale(1.6);}100%{transform:scale(1.6);}}`;
    case "stamp_variant_zoom":
      return `@keyframes ${name}{0%,${p(a)}%{transform:scale(1);filter:brightness(1);}${p(b)}%{transform:scale(1.35);filter:brightness(1.12);}100%{transform:scale(1.35);}}`;
    case "number_count_up":
      return `@keyframes ${name}{0%,${p(a)}%{clip-path:inset(0 100% 0 0);transform:scale(0.9);}${p(b)}%{clip-path:inset(0 0 0 0);transform:scale(1);}100%{clip-path:inset(0 0 0 0);}}`;
    case "price_compare_move":
      return `@keyframes ${name}{0%,${p(a)}%{transform:scaleX(0);}${p(b)}%{transform:scaleX(1);}100%{transform:scaleX(1);}}`;
    case "bar_growth":
      return `@keyframes ${name}{0%,${p(a)}%{transform:scaleY(0);}${p(h)}%{transform:scaleY(1);}100%{transform:scaleY(1);}}`;
    case "range_reveal":
      return `@keyframes ${name}{0%,${p(a)}%{transform:scaleX(0);opacity:.4;}${p(b)}%{transform:scaleX(1);opacity:1;}100%{transform:scaleX(1);}}`;
    case "chart_draw":
      return `@keyframes ${name}{0%,${p(a)}%{stroke-dashoffset:1200;}${p(h)}%{stroke-dashoffset:0;}100%{stroke-dashoffset:0;}}`;
    case "pointer_callout":
      return `@keyframes ${name}{0%,${p(a)}%{opacity:0;transform:translate3d(-40px,0,0);}${p(b)}%{opacity:1;transform:translate3d(0,0,0);}${p(Math.min(s.end_ms, b + 240))}%{transform:translate3d(0,0,0) scale(1.08);}100%{opacity:1;transform:translate3d(0,0,0) scale(1);}}`;
    case "mask_reveal":
      return `@keyframes ${name}{0%,${p(a)}%{clip-path:inset(0 0 100% 0);}${p(b)}%{clip-path:inset(0 0 0 0);}100%{clip-path:inset(0 0 0 0);}}`;
    case "typographic_emphasis":
      return `@keyframes ${name}{0%,${p(a)}%{opacity:0;transform:scale(0.82);letter-spacing:.08em;}${p(b)}%{opacity:1;transform:scale(1);letter-spacing:0;}100%{opacity:1;transform:scale(1);}}`;
    case "kinetic_caption":
    default:
      return `@keyframes ${name}{0%,${p(a)}%{opacity:0;transform:translate3d(0,26px,0);}${p(b)}%{opacity:1;transform:translate3d(0,0,0);}100%{opacity:1;}}`;
  }
}

/**
 * buildVideoDocument(plan) -> { html, total }
 * plan = the videoDirector.directVideo() output.
 */
export function buildVideoDocument(plan) {
  const total = plan.duration;
  const W = plan.width, H = plan.height;
  const S = plan.safe_zones;
  const cards = (plan.card_assets ?? []).map((c) => ({ ...c, uri: dataUri(c.path) }));

  const kf = [];
  const layers = [];

  plan.scenes.forEach((s, i) => {
    const enterFrom =
      /price_compare|range/.test(s.animation) ? "translate3d(0,40px,0) scale(1)"
      : s.animation === "card_slide_reveal" ? "translate3d(0,90px,0) scale(0.98)"
      : "translate3d(0,44px,0) scale(0.98)";
    kf.push(sceneLayerKeyframes(`layer${i}`, s, total, enterFrom));
    kf.push(primitiveKeyframes(`prim${i}`, s, total, s.animation));

    const card = s.card_asset != null ? cards[s.card_asset] : null;
    const lines = (s.text?.lines ?? []).filter(Boolean).map((l) => `<div class="ln">${esc(l)}</div>`).join("");
    const isCta = s.purpose === "cta";

    // stat visual sugar per motion
    let statHtml = "";
    if (s.animation === "price_compare_move" || s.animation === "range_reveal") {
      statHtml = `<div class="gapbar" style="animation-name:prim${i}"></div>`;
    } else if (s.animation === "bar_growth") {
      const pts = (plan.stat_assets?.[s.stat_asset]?.points ?? []).slice(0, 4);
      const maxV = Math.max(1, ...pts.map((p) => Number(p.value) || 0));
      statHtml = `<div class="bars">${pts.map((p, bi) => `<div class="bwrap"><div class="bar" style="animation-name:prim${i};animation-delay:0s;height:${Math.round((Number(p.value) / maxV) * 420)}px"></div><div class="blab">${esc(p.label)}</div><div class="bval">${esc(String(p.value))}${/%/.test(String(p.value)) ? "" : ""}</div></div>`).join("")}</div>`;
    }

    layers.push(`<div class="scene ${isCta ? "cta" : ""}" style="animation-name:layer${i}">
      ${card && card.uri ? `<div class="cardwrap"><img class="card ${s.animation === "crop_detail_reveal" || s.animation === "stamp_variant_zoom" ? "zoom" : ""}" style="animation-name:prim${i}" src="${card.uri}" alt=""/></div>` : ""}
      ${statHtml}
      <div class="txt ${isCta ? "ctatxt" : ""}" style="${card ? "" : `animation-name:prim${i};`}">${lines}</div>
      ${isCta ? `<div class="wm">Pokemon Deal Finder</div>` : ""}
    </div>`);
  });

  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
  *{margin:0;padding:0;box-sizing:border-box}
  html,body{width:${W}px;height:${H}px;overflow:hidden;background:#0b0b0d}
  .stage{position:relative;width:${W}px;height:${H}px;background:
    radial-gradient(1200px 900px at 50% 18%, #17171b 0%, #0b0b0d 60%);
    font-family:"Helvetica Neue",Arial,system-ui,-apple-system,sans-serif;color:#fff}
  .brand{position:absolute;top:${S.top - 132}px;left:${S.left}px;display:flex;align-items:center;gap:12px;opacity:.9;z-index:50}
  .brand .dot{width:26px;height:26px;border-radius:50%;border:5px solid #e4483d}
  .brand .name{font-size:30px;font-weight:800;letter-spacing:.01em}
  .brand .name b{color:#e4483d}
  .scene{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;
    padding:${S.top + 40}px ${S.right}px ${S.bottom}px ${S.left}px;opacity:0;will-change:transform,opacity}
  .cardwrap{width:${Math.round((W - S.left - S.right) * 0.78)}px;max-width:640px;filter:drop-shadow(0 30px 60px rgba(0,0,0,.55));margin-bottom:40px}
  .card{width:100%;height:auto;display:block;border-radius:20px}
  .card.zoom{transform-origin:50% 42%}
  .txt{text-align:center;max-width:${W - S.left - S.right}px}
  .txt .ln{font-size:78px;line-height:1.06;font-weight:850;letter-spacing:-0.01em;text-wrap:balance}
  .txt .ln:nth-child(2){font-size:44px;font-weight:650;color:#c9c9cf;margin-top:16px;letter-spacing:0}
  .ctatxt .ln{font-size:64px}
  .ctatxt .ln:nth-child(2){color:#e4483d;font-weight:800;font-size:40px}
  .gapbar{height:14px;width:${Math.round((W - S.left - S.right) * 0.7)}px;background:linear-gradient(90deg,#e4483d,#ff8a5c);
    border-radius:8px;margin:28px 0;transform:scaleX(0);transform-origin:left center}
  .bars{display:flex;gap:34px;align-items:flex-end;height:460px;margin:20px 0 30px}
  .bwrap{display:flex;flex-direction:column;align-items:center;gap:12px}
  .bar{width:120px;background:linear-gradient(180deg,#e4483d,#a8322b);border-radius:12px 12px 4px 4px;transform:scaleY(0);transform-origin:bottom center}
  .blab{font-size:26px;color:#c9c9cf;font-weight:600}
  .bval{font-size:34px;font-weight:800}
  .wm{position:absolute;bottom:${S.bottom - 120}px;left:0;right:0;text-align:center;font-size:34px;font-weight:800;opacity:.85}
  .scene *{animation-duration:${total}ms;animation-timing-function:cubic-bezier(.22,.61,.36,1);animation-play-state:paused;animation-fill-mode:both}
  .scene{animation-duration:${total}ms;animation-timing-function:linear;animation-play-state:paused;animation-fill-mode:both}
  ${kf.join("\n")}
  </style></head><body><div class="stage">
    <div class="brand"><span class="dot"></span><span class="name"><b>Pokemon</b> Deal Finder</span></div>
    ${layers.join("\n")}
  </div></body></html>`;

  return { html, total };
}

// The renderer injects this and calls __seek(tMs) per frame. All
// animations share one timeline, so one currentTime seeks everything.
export const SEEK_JS = `(function(){window.__seek=function(t){document.getAnimations().forEach(function(a){try{a.currentTime=t;}catch(e){}});};})()`;
