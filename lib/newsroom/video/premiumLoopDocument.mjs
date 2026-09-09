// Phase SOCIAL-CREATIVE-4C.3 - 5-SECOND PREMIUM LOOP DOCUMENT.
//
// The approved static master IS the creative. This document makes it feel
// alive with the most restrained motion possible over a seamless 5-second
// loop, and it NEVER re-draws a slice of the master (re-drawn slices
// ghost and look cheap):
//   1. a <=2% slow push-in on the WHOLE image - starts and ends at scale 1
//   2. one soft glow over the key stat / comparison zone (a "restrained
//      glow on a factual highlight", §9) - opacity 0 -> ~0.3 -> 0
//   3. a gentle light lift over the CTA / domain zone - opacity 0 -> ~0.22 -> 0
// The whole composition stays visible the entire time (no camera tour).
// No new / duplicate text over the master's own typography.
//
// One shared paused timeline; the renderer seeks it per frame. The master
// is a data: URI. If the master already carries the brand mark, no corner
// chip is added.

const BRAND = { red: "#e4483d", ink: "#f4f4f6", bg: "#0b0b0d" };
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const pc = (ms, total) => Math.max(0, Math.min(100, (ms / total) * 100)).toFixed(3);
const mark = (px) => `<svg width="${px}" height="${px}" viewBox="0 0 150 150"><circle cx="58" cy="58" r="40" fill="none" stroke="${BRAND.red}" stroke-width="13"/><line x1="87" y1="87" x2="128" y2="128" stroke="${BRAND.red}" stroke-width="17" stroke-linecap="round"/></svg>`;

function zonePx(z, W, imgTop, imgH) {
  return { left: Math.round((z?.x ?? 0) * W), top: Math.round(imgTop + (z?.y ?? 0) * imgH), w: Math.round((z?.w ?? 1) * W), h: Math.round((z?.h ?? 1) * imgH) };
}

/**
 * buildPremiumLoopDocument({ masterB64, masterMime, loopPlan, layers, brandInMaster })
 *  -> { html, total }
 */
export function buildPremiumLoopDocument({ masterB64, masterMime = "image/png", loopPlan, layers, brandInMaster = false }) {
  const total = loopPlan.duration_ms;
  const W = loopPlan.width || 1080;
  const H = loopPlan.height || 1920;
  const masterAR = loopPlan.master_ar || 1350 / 1080;
  const imgH = Math.round(W * masterAR);
  const imgTop = Math.round((H - imgH) / 2);
  const src = `data:${masterMime};base64,${masterB64}`;
  const L = layers?.layers ?? {};
  const ev = loopPlan.motion_events ?? [];

  const push = ev.find((e) => e.kind === "push") ?? { push_pct: 1.8, at_ms: 300, end_ms: total };
  const stat = ev.find((e) => e.kind === "stat_emphasis");
  const cta = ev.find((e) => e.kind === "cta_emphasis");

  // 1) whole-image push: scale 1 -> 1+push -> 1  (seamless, no slice)
  const pk = Math.min(0.025, (push.push_pct ?? 1.8) / 100);
  const peak = Math.round((push.at_ms + push.end_ms) / 2);
  const camKf = `@keyframes cam{0%{transform:scale(1);}${pc(peak, total)}%{transform:scale(${(1 + pk).toFixed(4)});}100%{transform:scale(1);}}`;

  // 2) stat emphasis: a soft radial glow over the stat zone (NO redraw)
  let statKf = "", statEl = "";
  if (stat) {
    const sz = L[stat.target]?.zone ?? L.primary_stat?.zone ?? L.comparison_graphic?.zone ?? { x: 0.58, y: 0.28, w: 0.4, h: 0.24 };
    const sp = zonePx(sz, W, imgTop, imgH);
    const a = stat.at_ms, mid = Math.round((stat.at_ms + stat.end_ms) / 2), b = stat.end_ms;
    statKf = `@keyframes statglow{0%,${pc(a, total)}%{opacity:0;}${pc(mid, total)}%{opacity:.30;}${pc(b, total)}%,100%{opacity:0;}}`;
    statEl = `<div class="glow stat" style="left:${sp.left - 40}px;top:${sp.top - 40}px;width:${sp.w + 80}px;height:${sp.h + 80}px;animation-name:statglow"></div>`;
  }

  // 3) CTA / domain emphasis: a gentle upward light lift over the CTA zone
  let ctaKf = "", ctaEl = "";
  if (cta) {
    const tz = L[cta.target]?.zone ?? L.cta?.zone ?? L.brand?.zone ?? { x: 0.02, y: 0.9, w: 0.96, h: 0.08 };
    const tp = zonePx(tz, W, imgTop, imgH);
    const a = cta.at_ms, mid = Math.round((cta.at_ms + cta.end_ms) / 2), b = cta.end_ms;
    ctaKf = `@keyframes ctaglow{0%,${pc(a, total)}%{opacity:0;}${pc(mid, total)}%{opacity:.22;}${pc(b, total)}%,100%{opacity:0;}}`;
    ctaEl = `<div class="ctaglow" style="left:${tp.left}px;top:${tp.top}px;width:${tp.w}px;height:${tp.h}px;animation-name:ctaglow"></div>`;
  }

  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
  *{margin:0;padding:0;box-sizing:border-box}
  html,body{width:${W}px;height:${H}px;overflow:hidden;background:${BRAND.bg}}
  .stage{position:relative;width:${W}px;height:${H}px;background:${BRAND.bg};font-family:"Helvetica Neue",Arial,system-ui,sans-serif}
  .cam{position:absolute;inset:0;transform-origin:${W / 2}px ${H / 2}px;will-change:transform;animation-name:cam}
  .master{position:absolute;left:0;top:${imgTop}px;width:${W}px;height:${imgH}px;background:url('${src}') 0 0/${W}px ${imgH}px no-repeat}
  .glow{position:absolute;z-index:6;opacity:0;mix-blend-mode:screen;will-change:opacity;pointer-events:none;
    background:radial-gradient(ellipse at center,rgba(255,255,255,.55),rgba(255,255,255,0) 70%)}
  .ctaglow{position:absolute;z-index:7;opacity:0;mix-blend-mode:screen;will-change:opacity;pointer-events:none;border-radius:16px;
    background:linear-gradient(0deg,rgba(255,255,255,.30),rgba(255,255,255,0) 72%)}
  .brand{position:absolute;top:${Math.max(24, imgTop - 62)}px;left:52px;z-index:90;display:inline-flex;align-items:center;gap:10px;padding:10px 18px 10px 12px;border-radius:999px;background:rgba(11,11,13,.7);box-shadow:0 6px 20px rgba(0,0,0,.4)}
  .brand .wm{font-weight:800;font-size:24px;color:${BRAND.ink};letter-spacing:-0.01em}
  .brand .wm b{color:${BRAND.red}}
  .dom{position:absolute;left:0;right:0;bottom:${Math.max(22, imgTop - 52)}px;text-align:center;z-index:90;color:${BRAND.ink};font-weight:700;font-size:22px;opacity:.88;text-shadow:0 2px 14px rgba(0,0,0,.85)}
  .stage *{animation-duration:${total}ms;animation-timing-function:cubic-bezier(.37,0,.16,1);animation-play-state:paused;animation-fill-mode:both}
  ${camKf}
  ${statKf}
  ${ctaKf}
  </style></head><body><div class="stage">
    <div class="cam">
      <div class="master"></div>
      ${statEl}
      ${ctaEl}
    </div>
    ${brandInMaster ? "" : `<div class="brand">${mark(28)}<span class="wm"><b>Pokemon</b> Deal Finder</span></div><div class="dom">pokemondealfinder.com</div>`}
  </div></body></html>`;
  return { html, total };
}

export const PREMIUM_LOOP_DOC_VERSION = "4c3.2";
