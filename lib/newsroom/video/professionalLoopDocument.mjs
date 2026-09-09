// Phase SOCIAL-CREATIVE-4C.4 - PROFESSIONAL SOCIAL VIDEO DOCUMENT.
//
// ONE HTML document, ONE shared paused timeline (the renderer seeks every
// animation per frame). Two stacked full-frame layers:
//
//   .story  - the VIDEO-SAFE DERIVATIVE composition (its own deterministic
//             layout from derivative.blocks zones - NOT a slice of the
//             master, so nothing ghosts and nothing clips). 2-3 focal
//             motion events animate individual blocks.
//   .end    - the UNIVERSAL CTA END SCREEN (real canonical card fan,
//             value points, big CTA, white domain panel).
//
//   story -> end via a clean 250ms cross-dissolve at story_ms (never a
//   fade to black). No whole-image push. No camera tour. Real card <img>
//   as data: URIs - no network at render time.

import { BRAND_MARK_SVG } from "../hybrid/brandLock.mjs";

export const PROFESSIONAL_LOOP_DOC_VERSION = "4c4.1";

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const pc = (ms, total) => Math.max(0, Math.min(100, (ms / total) * 100)).toFixed(3);

function blockHtml(b, cardImages) {
  const z = b.zone;
  const base = `position:absolute;left:${z.x}px;top:${z.y}px;width:${z.w}px;height:${z.h}px;`;
  const cls = `blk blk-${esc(b.id)}`;
  if (b.role === "card" || b.role === "card_row") {
    const ids = b.cardIds ?? [];
    const n = ids.length || 1;
    const gap = 24;
    const cw = Math.min(z.h * 0.72, (z.w - gap * (n - 1)) / n);
    const inner = ids.map((id, i) => {
      const b64 = cardImages[id] || cardImages[String(id)] || "";
      const src = b64 ? `data:image/jpeg;base64,${b64}` : "";
      return `<div class="slot slot${i}" style="width:${cw}px">${src ? `<img src="${src}" alt="">` : `<div class="ph"></div>`}<span class="sweep"></span></div>`;
    }).join("");
    const cap = b.caption ? `<div class="cap">${esc(b.caption)}</div>` : "";
    return `<div class="${cls} cardblk" style="${base}display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px">
      <div class="cardrow" style="display:flex;gap:${gap}px;align-items:center;justify-content:center;height:${z.h - (b.caption ? 46 : 0)}px">${inner}</div>${cap}</div>`;
  }
  const roleCss = {
    hook: "font-weight:800;letter-spacing:-0.01em;text-transform:uppercase;",
    hero_stat: "font-weight:800;letter-spacing:-0.02em;color:var(--accent);",
    primary_stat: "font-weight:800;letter-spacing:-0.01em;",
    comparison: "font-weight:700;",
    context: "font-weight:500;color:var(--sub);",
    takeaway: "font-weight:600;color:var(--ink);",
    domain: "font-weight:700;color:var(--sub);letter-spacing:.02em;",
  }[b.role] ?? "font-weight:600;";
  if (b.role === "chart") {
    const pts = b.points ?? [];
    const max = Math.max(1, ...pts.map((p) => p.value));
    const bars = pts.map((p) => `<div class="bar"><i style="height:${Math.round((p.value / max) * (z.h - 70))}px"></i><b>${esc(p.label)}</b><u>${p.value}%</u></div>`).join("");
    return `<div class="${cls} chartblk" style="${base}display:flex;align-items:flex-end;justify-content:space-around;gap:20px">${bars}</div>`;
  }
  return `<div class="${cls}" style="${base}display:flex;align-items:center;justify-content:center;text-align:center;font-size:${b.font ?? 34}px;${roleCss}">${esc(b.text ?? "")}</div>`;
}

// build @keyframes + animation-name assignments for the focal events
function motionCss(timeline) {
  const total = timeline.duration_ms;
  const kf = [];
  const assign = {}; // selector -> [animName]
  const seenTargets = {};
  for (const e of timeline.events ?? []) {
    if (e.kind === "cta_transition" || e.kind === "cross_dissolve") continue;
    const name = `m_${e.id}`;
    const a = pc(e.at_ms, total), b = pc(e.end_ms, total), mid = pc((e.at_ms + e.end_ms) / 2, total);
    // resolve a selector: multiple events on one block -> sequential child slots
    let sel = `.blk-${e.target}`;
    const dup = (seenTargets[e.target] = (seenTargets[e.target] ?? 0));
    if ((timeline.events.filter((x) => x.target === e.target && x.kind !== "cross_dissolve" && x.kind !== "cta_transition").length) > 1) {
      sel = `.blk-${e.target} .slot${dup}`;
    }
    seenTargets[e.target] = dup + 1;

    if (e.kind === "stat_pulse") {
      kf.push(`@keyframes ${name}{0%,${a}%{transform:scale(1)}${mid}%{transform:scale(${(e.scale_to ?? 1.04).toFixed(3)})}${b}%,100%{transform:scale(1)}}`);
    } else if (e.kind === "card_sweep") {
      kf.push(`@keyframes ${name}{0%,${a}%{transform:translateY(0)}${mid}%{transform:translateY(-${(e.translate_pct ?? 1.5)}%)}${b}%,100%{transform:translateY(-${((e.translate_pct ?? 1.5) * 0.4).toFixed(2)}%)}}`);
      // the light sweep runs on the child .sweep
      kf.push(`@keyframes ${name}_s{0%,${a}%{opacity:0;transform:translateX(-120%)}${mid}%{opacity:.9}${b}%,100%{opacity:0;transform:translateX(120%)}}`);
      assign[`${sel} .sweep`] = [`${name}_s`];
    } else if (e.kind === "illuminate" || e.kind === "chart_fill" || e.kind === "highlight" || e.kind === "settle") {
      const of = e.opacity_from ?? 0, ot = e.opacity_to ?? 1;
      kf.push(`@keyframes ${name}{0%,${a}%{opacity:${of}}${b}%,100%{opacity:${ot}}}`);
      if (e.kind === "illuminate") kf.push(`@keyframes ${name}_g{0%,${a}%{box-shadow:0 0 0 rgba(228,72,61,0)}${mid}%{box-shadow:0 0 46px rgba(228,72,61,.5)}${b}%,100%{box-shadow:0 0 0 rgba(228,72,61,0)}}`);
    }
    (assign[sel] = assign[sel] ?? []).push(name);
    if (e.kind === "illuminate") (assign[sel] = assign[sel] ?? []).push(`${name}_g`);
  }
  // cross-dissolve story -> end
  const s = pc(timeline.story_ms, total), s2 = pc(timeline.story_ms + 250, total);
  kf.push(`@keyframes storyout{0%,${s}%{opacity:1}${s2}%,100%{opacity:0}}`);
  kf.push(`@keyframes endin{0%,${s}%{opacity:0}${s2}%,100%{opacity:1}}`);
  assign[".story"] = ["storyout"];
  assign[".end"] = ["endin"];

  const rules = Object.entries(assign).map(([sel, names]) => `${sel}{animation-name:${names.join(",")}}`).join("\n");
  return `${kf.join("\n")}\n${rules}`;
}

function endScreenLayer(es, endCardImages) {
  const cards = (es.cards ?? []).map((c, i) => {
    const b64 = endCardImages[c.id] || "";
    const src = b64 ? `data:image/jpeg;base64,${b64}` : "";
    const cx = 540 + (i - 1) * 236;
    const lift = i === 1 ? 0 : 26;
    return `<div class="ec" style="left:${cx - 156}px;top:${lift}px;transform:rotate(${c.rotation_deg ?? 0}deg) scale(${c.scale ?? 1});z-index:${c.z ?? 2}">${src ? `<img src="${src}" alt="">` : `<div class="ph"></div>`}</div>`;
  }).join("");
  const vps = (es.value_points ?? []).map((v) => `<span class="vp">${esc(v)}</span>`).join("");
  return `<div class="end">
    <div class="ebrand"><span style="display:inline-flex">${BRAND_MARK_SVG(46)}</span><span class="wm"><b>Pokemon</b> Deal Finder</span></div>
    <div class="evps">${vps}</div>
    <div class="efan">${cards}</div>
    <div class="ecta"><div class="l">${esc(es.primary_cta?.line1 ?? "")}</div>${es.primary_cta?.line2 ? `<div class="l">${esc(es.primary_cta.line2)}</div>` : ""}</div>
    <div class="ego"><span class="u">${BRAND_MARK_SVG(38)}<span><b>pokemondealfinder</b>.com</span></span></div>
    <div class="efoot">${esc(es.footer ?? "")}</div>
  </div>`;
}

/**
 * buildProfessionalLoopDocument({ derivative, endScreen, timeline,
 *   cardImages, endCardImages }) -> { html, total }
 */
export function buildProfessionalLoopDocument({ derivative, endScreen, timeline, cardImages = {}, endCardImages = {} }) {
  const total = timeline.duration_ms;
  const W = derivative.width || 1080, H = derivative.height || 1920;
  const S = derivative.style || {};
  const es = endScreen?.end_screen ?? endScreen ?? {};
  const blocks = (derivative.blocks ?? []).map((b) => blockHtml(b, cardImages)).join("\n");

  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
  *{margin:0;padding:0;box-sizing:border-box}
  :root{--bg:${S.bg || "#0b0b0d"};--ink:${S.ink || "#f4f4f6"};--sub:${S.sub || "#b9b9c1"};--accent:${S.accent || "#e4483d"}}
  html,body{width:${W}px;height:${H}px;overflow:hidden;background:var(--bg)}
  .stage{position:relative;width:${W}px;height:${H}px;background:var(--bg);font-family:${S.font || '"Helvetica Neue",Arial,sans-serif'};color:var(--ink)}
  .story,.end{position:absolute;inset:0}
  .story{background:radial-gradient(120% 70% at 50% 30%,#17171c 0%,var(--bg) 60%)}
  .blk{will-change:transform,opacity}
  .cardblk .cardrow{will-change:transform}
  .slot{position:relative;height:100%;display:flex;align-items:center;justify-content:center;overflow:hidden;border-radius:16px;
    box-shadow:${S.card_shadow || "0 24px 60px rgba(0,0,0,.55)"},${S.card_rim || "0 0 0 2px rgba(255,255,255,.06)"}}
  .slot img{width:100%;height:100%;object-fit:contain;display:block;background:#0d0d10}
  .slot .ph{width:100%;height:100%;background:#15151a}
  .slot .sweep{position:absolute;top:0;bottom:0;width:60%;pointer-events:none;opacity:0;
    background:linear-gradient(105deg,transparent,rgba(255,255,255,.55),transparent);mix-blend-mode:screen}
  .cap{font-size:26px;font-weight:600;color:var(--sub)}
  .chartblk .bar{display:flex;flex-direction:column;align-items:center;gap:8px;flex:1}
  .chartblk .bar i{display:block;width:70%;background:linear-gradient(180deg,var(--accent),#7a2a25);border-radius:6px 6px 0 0}
  .chartblk .bar b{font-size:24px;font-weight:600;color:var(--sub)}
  .chartblk .bar u{font-size:30px;font-weight:800;text-decoration:none}
  /* ---- end screen ---- */
  .end{opacity:0;background:radial-gradient(120% 80% at 50% 34%,#1b1b21 0%,#0a0a0c 62%)}
  .ebrand{position:absolute;top:196px;left:0;right:0;display:flex;align-items:center;justify-content:center;gap:16px;z-index:6}
  .ebrand .wm{font-weight:800;font-size:44px;letter-spacing:-0.01em}
  .ebrand .wm b{color:var(--accent)}
  .evps{position:absolute;top:314px;left:0;right:0;display:flex;align-items:center;justify-content:center;gap:22px;z-index:6}
  .evps .vp{font-weight:700;font-size:25px;letter-spacing:.05em;color:#d9d9df;border:1px solid rgba(255,255,255,.16);border-radius:999px;padding:9px 17px}
  .efan{position:absolute;top:500px;left:0;right:0;height:520px;z-index:2}
  .ec{position:absolute;top:0;width:322px;height:451px;border-radius:18px;overflow:hidden;
    box-shadow:0 30px 70px rgba(0,0,0,.6),0 0 60px rgba(228,72,61,.22),0 0 0 2px rgba(255,255,255,.06)}
  .ec img{width:100%;height:100%;object-fit:cover;display:block}
  .ec .ph{width:100%;height:100%;background:#15151a}
  .ecta{position:absolute;left:0;right:0;bottom:462px;text-align:center;z-index:7}
  .ecta .l{font-weight:800;font-size:60px;line-height:1.06;letter-spacing:-0.01em;text-transform:uppercase}
  .ego{position:absolute;left:96px;right:96px;bottom:300px;background:#f4f4f6;color:#111;border:4px solid var(--accent);
    border-radius:20px;padding:24px 0;text-align:center;box-shadow:0 20px 50px rgba(0,0,0,.5);z-index:7}
  .ego .u{display:inline-flex;align-items:center;gap:14px;font-weight:800;font-size:44px;letter-spacing:-0.01em}
  .ego .u b{color:var(--accent)}
  .efoot{position:absolute;left:0;right:0;bottom:224px;text-align:center;color:#a9a9b2;font-weight:700;font-size:24px;letter-spacing:.05em;z-index:7}
  .stage *{animation-duration:${total}ms;animation-timing-function:cubic-bezier(.37,0,.16,1);animation-play-state:paused;animation-fill-mode:both}
  ${motionCss(timeline)}
  </style></head><body><div class="stage">
    <div class="story">${blocks}</div>
    ${endScreenLayer(es, endCardImages)}
  </div></body></html>`;
  return { html, total };
}
