// Phase SOCIAL-CREATIVE-4C.1 - ANIMATED DOCUMENT FROM DESIGNED KEYFRAMES.
//
// Each board is a fully-designed 1080x1920-intent keyframe (a data: URI).
// Motion lives BETWEEN the designed frames: a masked editorial entrance, a
// subtle <=3% parallax push during the hold (never a dead static hold), an
// editorial-wipe exit, and a match-cut hand-off to the next board. The
// approved PokemonDealFinder brand strip is composited deterministically
// on top (5A.1 rules - never a generated logo / Poke Ball).
//
// One shared paused animation timeline; the renderer seeks it per frame.
// No network subresource - boards are embedded as data: URIs.

import { APPROVED_BRAND } from "../hybrid/brandLock.mjs";

const BRAND = { red: "#e4483d", ink: "#f4f4f6", faint: "#9a9aa2", bg: "#0b0b0d" };
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const pct = (ms, total) => Math.max(0, Math.min(100, (ms / total) * 100)).toFixed(3);

function markSvg(px) {
  return `<svg width="${px}" height="${px}" viewBox="0 0 150 150" style="flex:0 0 auto"><circle cx="58" cy="58" r="40" fill="none" stroke="${BRAND.red}" stroke-width="13"/><line x1="87" y1="87" x2="128" y2="128" stroke="${BRAND.red}" stroke-width="17" stroke-linecap="round"/></svg>`;
}

// board layer keyframes: entrance (masked wipe + push) -> hold with a
// small parallax drift -> exit (editorial wipe / settle)
function boardKeyframes(name, mp, total) {
  const a = mp.start_ms, b = mp.end_ms;
  const inEnd = Math.min(b, a + (mp.entrance?.dur_ms ?? 480));
  const outStart = Math.max(inEnd, b - (mp.exit?.dur_ms ?? 360));
  const p = (ms) => pct(ms, total);
  const fs = mp.entrance?.from_scale ?? 1.05;
  const fx = mp.entrance?.from_offset?.x ?? 0;
  const fy = mp.entrance?.from_offset?.y ?? 0;
  const drift = (mp.hold?.parallax_pct ?? 2.6) / 100;
  const pd = mp.hold?.push_dir ?? { x: 0, y: -1 };
  const holdScale = (1 + drift).toFixed(4);
  const holdX = (pd.x * drift * 40).toFixed(2);
  const holdY = (pd.y * drift * 40).toFixed(2);
  const toScale = mp.exit?.to_scale ?? 1.0;
  const clipIn = mp.entrance?.type === "mask_reveal_up" ? "inset(0 0 100% 0)" : "inset(0 100% 0 0)";
  return `@keyframes ${name}{
    0%,${p(Math.max(0, a - 1))}%{opacity:0;transform:translate3d(${fx}px,${fy}px,0) scale(${fs});clip-path:${clipIn};}
    ${p(a)}%{opacity:0;transform:translate3d(${fx}px,${fy}px,0) scale(${fs});clip-path:${clipIn};}
    ${p(inEnd)}%{opacity:1;transform:translate3d(0,0,0) scale(1);clip-path:inset(0 0 0 0);}
    ${p(outStart)}%{opacity:1;transform:translate3d(${holdX}px,${holdY}px,0) scale(${holdScale});clip-path:inset(0 0 0 0);}
    ${p(b)}%{opacity:0;transform:translate3d(${holdX}px,${holdY}px,0) scale(${toScale});clip-path:inset(0 0 0 0);}
    100%{opacity:0;}
  }`;
}

/**
 * buildGenerativeVideoDocument({ plan, boardImages, motionPlan, ctaText })
 *  -> { html, total }
 * boardImages = [{ index, role, b64 }]  (from runGenerativeVideoDirector)
 */
export function buildGenerativeVideoDocument({ plan, boardImages = [], motionPlan = [], ctaText = null }) {
  const total = plan.duration;
  const W = plan.width || 1080, H = plan.height || 1920;
  const S = plan.safe_zones || { top: 260, right: 96, bottom: 500, left: 96 };
  const byIdx = new Map(boardImages.map((b) => [b.index, b]));

  const kf = [];
  const layers = motionPlan.map((mp, i) => {
    const img = byIdx.get(mp.board_index);
    if (!img) return "";
    kf.push(boardKeyframes(`board${i}`, mp, total));
    return `<div class="board" style="animation-name:board${i};z-index:${10 + i}"><img src="data:${img.mime || "image/png"};base64,${img.b64}" alt=""/></div>`;
  }).join("\n");

  // §11/§18 - the approved brand is a SMALL deterministic corner mark, not
  // a full-width reserved bar (so a designed headline can sit high in the
  // frame). It rides above every board layer; the image model is told to
  // keep the top-left corner clear and never draw a logo / Poke Ball.
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
  *{margin:0;padding:0;box-sizing:border-box}
  html,body{width:${W}px;height:${H}px;overflow:hidden;background:${BRAND.bg}}
  .stage{position:relative;width:${W}px;height:${H}px;background:${BRAND.bg};font-family:"Helvetica Neue",Arial,system-ui,sans-serif;color:${BRAND.ink}}
  .board{position:absolute;inset:0;opacity:0;will-change:transform,opacity,clip-path;overflow:hidden}
  .board img{width:100%;height:100%;object-fit:cover;object-position:center;display:block}
  .brand{position:absolute;top:${Math.max(28, S.top - 210)}px;left:${S.left}px;z-index:90;display:inline-flex;align-items:center;gap:11px;
    padding:12px 20px 12px 14px;border-radius:999px;background:rgba(11,11,13,0.72);backdrop-filter:blur(3px);
    box-shadow:0 6px 22px rgba(0,0,0,.4)}
  .brand .wm{font-weight:800;letter-spacing:-0.01em;font-size:26px;color:${BRAND.ink}}
  .brand .wm b{color:${BRAND.red}}
  .dom{position:absolute;left:0;right:0;bottom:${Math.max(30, S.bottom - 260)}px;text-align:center;z-index:90;
    color:${BRAND.ink};font-weight:700;font-size:23px;letter-spacing:.02em;opacity:.92;text-shadow:0 2px 16px rgba(0,0,0,.8)}
  .stage *{animation-duration:${total}ms;animation-timing-function:cubic-bezier(.4,0,.2,1);animation-play-state:paused;animation-fill-mode:both}
  ${kf.join("\n")}
  </style></head><body><div class="stage">
    ${layers}
    <div class="brand">${markSvg(30)}<span class="wm"><b>Pokemon</b> Deal Finder</span></div>
    <div class="dom">${esc(APPROVED_BRAND.domain)}</div>
  </div></body></html>`;
  return { html, total };
}

export const GEN_VIDEO_DOC_VERSION = "4c1.1";
