// Phase SOCIAL-CREATIVE-4C.2 - ANIMATED DOCUMENT FROM ONE MASTER CREATIVE.
//
// The approved master is a SINGLE finished premium image and stays the
// visual source of truth (§7). Motion "reveals and builds" it with a
// PREMIUM CAMERA over that one image - never re-drawn copies (which ghost)
// and never a poster-to-poster crossfade:
//   * a tight crop on the hook zone that pulls back to the full master
//   * timed crops that frame each panel in reveal order (stat, comparison,
//     card) - so the master appears to build panel by panel
//   * a <=3% scale drift during holds (subtle depth, never a dead hold)
//   * a single light sweep across the hero-card edge
//   * short kinetic captions OUTSIDE the camera for the few facts the
//     master does not already say (the hook figure, the exact %, the lesson)
//   * the approved brand corner chip + domain, composited deterministically
//
// One shared paused timeline; the renderer seeks it per frame. The master
// is a data: URI - no network subresource.

const BRAND = { red: "#e4483d", ink: "#f4f4f6", faint: "#9aa0aa", bg: "#0b0b0d" };
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const pc = (ms, total) => Math.max(0, Math.min(100, (ms / total) * 100)).toFixed(3);
const mark = (px) => `<svg width="${px}" height="${px}" viewBox="0 0 150 150"><circle cx="58" cy="58" r="40" fill="none" stroke="${BRAND.red}" stroke-width="13"/><line x1="87" y1="87" x2="128" y2="128" stroke="${BRAND.red}" stroke-width="17" stroke-linecap="round"/></svg>`;

// a zone (0..1 over the master) -> the camera transform that frames it,
// given the master is width-fit (imgH = W * masterAR) and vertically
// centred with dark bands.
function cameraFor(zone, scale, W, H, imgTop, imgH) {
  if (!zone) return { s: scale ?? 1, tx: 0, ty: 0 };
  const s = scale ?? Math.min(1.9, Math.max(1.08, 0.66 / Math.max(zone.w, zone.h)));
  const px = (zone.x + zone.w / 2) * W;
  const py = imgTop + (zone.y + zone.h / 2) * imgH;
  return { s, tx: Math.round((W / 2 - px) * s), ty: Math.round((H / 2 - py) * s) };
}

/**
 * buildMasterMotionDocument({ masterB64, masterMime, choreography, layers, ctaText })
 *  -> { html, total }
 */
export function buildMasterMotionDocument({ masterB64, masterMime = "image/png", choreography, layers, ctaText = null }) {
  const total = choreography.duration_ms;
  const W = choreography.width || 1080;
  const H = choreography.height || 1920;
  const masterAR = choreography.master_ar || 1350 / 1080;
  const imgH = Math.round(W * masterAR);
  const imgTop = Math.round((H - imgH) / 2);
  const src = `data:${masterMime};base64,${masterB64}`;
  const L = layers?.layers ?? {};
  const beats = choreography.beats;

  // ---- camera track ----
  const stops = beats.map((b) => {
    const z = b.camera?.crop_to && b.camera.crop_to !== "full" ? L[b.camera.crop_to]?.zone : null;
    return { at: b.at_ms, end: b.end_ms, ...cameraFor(z, b.camera?.scale, W, H, imgTop, imgH), full: !z };
  });
  const cf = [`0%{transform:translate3d(0,0,0) scale(1);}`];
  for (let i = 0; i < stops.length; i++) {
    const s = stops[i];
    const prev = stops[i - 1] ?? { tx: 0, ty: 0, s: 1 };
    const settle = Math.min(s.end, s.at + 640);
    // a full-frame beat gets a gentle <=3% drift instead of a hard hold
    const driftS = s.full ? (s.s * 1.024).toFixed(4) : s.s;
    const driftY = s.full ? Math.round(s.ty - 14) : s.ty;
    cf.push(`${pc(s.at, total)}%{transform:translate3d(${prev.tx}px,${prev.ty}px,0) scale(${prev.s});}`);
    cf.push(`${pc(settle, total)}%{transform:translate3d(${s.tx}px,${s.ty}px,0) scale(${s.s});}`);
    cf.push(`${pc(s.end, total)}%{transform:translate3d(${s.tx}px,${driftY}px,0) scale(${driftS});}`);
  }
  const camKf = `@keyframes cam{${cf.join("")}100%{}}`;

  // ---- kinetic captions (outside the camera) - only the few beats that
  // carry text the master does not already say ----
  let ci = 0;
  const capKf = [];
  const caps = [];
  for (const b of beats) {
    const lines = (b.text?.lines ?? []).filter(Boolean);
    if (!lines.length) continue;
    const a = b.at_ms, inn = Math.min(b.end_ms, a + 340), out = Math.max(inn, b.end_ms - 240);
    // hook caption sits centred; later captions sit low so they don't cover the built master
    const low = b.id !== "b0" && b.id !== "b1";
    capKf.push(`@keyframes cap${ci}{0%,${pc(Math.max(0, a - 1), total)}%{opacity:0;transform:translate3d(0,24px,0);}${pc(a, total)}%{opacity:0;transform:translate3d(0,24px,0);}${pc(inn, total)}%{opacity:1;transform:translate3d(0,0,0);}${pc(out, total)}%{opacity:1;transform:translate3d(0,0,0);}${pc(b.end_ms, total)}%{opacity:0;transform:translate3d(0,-12px,0);}100%{opacity:0;}}`);
    caps.push(`<div class="cap ${low ? "low" : ""}" style="animation-name:cap${ci}">
      ${lines.map((l, k) => `<span style="display:block;font-weight:${k ? 650 : 850};font-size:${k ? 40 : 62}px;line-height:1.06;color:${k ? BRAND.faint : BRAND.ink}">${esc(l)}</span>`).join("")}</div>`);
    ci += 1;
  }

  // ---- one light sweep across the hero-card edge ----
  const cz = L.hero_card?.zone ?? { x: 0.04, y: 0.22, w: 0.55, h: 0.6 };
  const sweepAt = ((beats.find((b) => (b.reveals ?? []).includes("hero_card")) ?? beats[1] ?? beats[0]).at_ms) + 420;
  const sweepKf = `@keyframes sweep{0%,${pc(sweepAt, total)}%{transform:translateX(-130%);opacity:0;}${pc(sweepAt + 80, total)}%{opacity:.45;}${pc(sweepAt + 620, total)}%{transform:translateX(130%);opacity:0;}100%{opacity:0;}}`;

  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
  *{margin:0;padding:0;box-sizing:border-box}
  html,body{width:${W}px;height:${H}px;overflow:hidden;background:${BRAND.bg}}
  .stage{position:relative;width:${W}px;height:${H}px;background:${BRAND.bg};font-family:"Helvetica Neue",Arial,system-ui,sans-serif}
  .cam{position:absolute;inset:0;transform-origin:${W / 2}px ${H / 2}px;will-change:transform;animation-name:cam}
  .master{position:absolute;left:0;top:${imgTop}px;width:${W}px;height:${imgH}px;background:url('${src}') center/cover no-repeat;background-size:${W}px ${imgH}px}
  .sweep{position:absolute;left:${Math.round(cz.x * W)}px;top:${Math.round(imgTop + cz.y * imgH)}px;width:${Math.round(cz.w * W)}px;height:${Math.round(cz.h * imgH)}px;z-index:6;pointer-events:none;
    background:linear-gradient(105deg,transparent 43%,rgba(255,255,255,.5) 50%,transparent 57%);animation-name:sweep}
  .cap{position:absolute;left:6%;right:6%;top:34%;z-index:70;text-align:center;text-shadow:0 3px 26px rgba(0,0,0,.9),0 0 60px rgba(0,0,0,.7);letter-spacing:-0.01em}
  .cap.low{top:auto;bottom:20%}
  .brand{position:absolute;top:${Math.max(26, imgTop - 64)}px;left:56px;z-index:90;display:inline-flex;align-items:center;gap:11px;padding:11px 19px 11px 13px;border-radius:999px;background:rgba(11,11,13,.7);box-shadow:0 6px 22px rgba(0,0,0,.4)}
  .brand .wm{font-weight:800;font-size:25px;color:${BRAND.ink};letter-spacing:-0.01em}
  .brand .wm b{color:${BRAND.red}}
  .dom{position:absolute;left:0;right:0;bottom:${Math.max(26, imgTop - 56)}px;text-align:center;z-index:90;color:${BRAND.ink};font-weight:700;font-size:23px;opacity:.9;text-shadow:0 2px 16px rgba(0,0,0,.85)}
  .stage *{animation-duration:${total}ms;animation-timing-function:cubic-bezier(.33,0,.15,1);animation-play-state:paused;animation-fill-mode:both}
  ${camKf}
  ${sweepKf}
  ${capKf.join("\n")}
  </style></head><body><div class="stage">
    <div class="cam"><div class="master"></div><div class="sweep"></div></div>
    ${caps.join("\n")}
    <div class="brand">${mark(30)}<span class="wm"><b>Pokemon</b> Deal Finder</span></div>
    <div class="dom">pokemondealfinder.com</div>
  </div></body></html>`;
  return { html, total };
}

export const MASTER_MOTION_DOC_VERSION = "4c2.2";
