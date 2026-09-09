// Phase SOCIAL-CREATIVE-4C.4 / 4C.5 - PROFESSIONAL SOCIAL VIDEO DOCUMENT.
//
// ONE HTML document, ONE shared paused timeline (the renderer seeks every
// animation per frame). Two stacked full-frame layers, each on its own
// PREMIUM ATMOSPHERE (charcoal base, soft spotlights, low-opacity red
// glow, fine grain, vignette - so the frame is never dead black, §6):
//
//   .story  - the VIDEO-SAFE DERIVATIVE composition (its own deterministic
//             layout - NOT a slice of the master). Framed content zones,
//             panel depth, red rule accents, spotlighting (§8). Restrained
//             premium text FX + premium easing (§9, §16). 3 focal events.
//   .end    - the UNIVERSAL CTA END SCREEN, held ~2.6s (§4): larger card
//             fan with staggered entrance (§20), pill value row (§21),
//             a hero URL field with ONE light sweep (§23, §24).
//
//   story -> end via a controlled 400ms transition (§17): the story
//   slightly darkens while the CTA environment resolves. Never a hard cut
//   or a fade to full black. Real card <img> as data: URIs - no network.

import { BRAND_MARK_SVG } from "../hybrid/brandLock.mjs";
import { buildAtmosphere } from "./premiumVideoAtmosphere.mjs";

export const PROFESSIONAL_LOOP_DOC_VERSION = "4c5.1";

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const pc = (ms, total) => Math.max(0, Math.min(100, (ms / total) * 100)).toFixed(3);

// small deterministic value-point icons for the CTA pills (§21)
function vpIcon(kind) {
  const a = "#e4483d";
  if (kind === "scale") return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="${a}" stroke-width="2.2"><path d="M12 3v18M5 7h14M7 7l-3 6h6zM17 7l-3 6h6z"/></svg>`;
  if (kind === "spark") return `<svg width="20" height="20" viewBox="0 0 24 24" fill="${a}"><path d="M12 2l2.2 6.3L20 10l-5.8 1.7L12 18l-2.2-6.3L4 10l5.8-1.7z"/></svg>`;
  return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="${a}" stroke-width="2.4"><circle cx="10" cy="10" r="6"/><line x1="15" y1="15" x2="21" y2="21" stroke-linecap="round"/></svg>`;
}

// ---- STORY BLOCKS ------------------------------------------------
function blockHtml(b, cardImages) {
  const z = b.zone;
  const st = b.style ?? {};
  const base = `position:absolute;left:${z.x}px;top:${z.y}px;width:${z.w}px;height:${z.h}px;`;
  const cls = `blk blk-${esc(b.id)}${st.panel ? " panel" : ""}${st.spotlight ? " spot" : ""}${st.rule ? " ruled" : ""}`;

  if (b.role === "card" || b.role === "card_row") {
    const ids = b.cardIds ?? [];
    const n = ids.length || 1;
    const gap = 24;
    const scale = b.cardScale ?? 0.92;
    const cw = Math.min(z.h * 0.72 * scale, ((z.w - gap * (n - 1)) / n) * (n === 1 ? scale : 1));
    const inner = ids.map((id, i) => {
      const b64 = cardImages[id] || cardImages[String(id)] || "";
      const src = b64 ? `data:image/jpeg;base64,${b64}` : "";
      return `<div class="slot slot${i}" style="width:${cw}px">${src ? `<img src="${src}" alt="">` : `<div class="ph"></div>`}<span class="sweep"></span></div>`;
    }).join("");
    const cap = b.caption ? `<div class="cap">${esc(b.caption)}</div>` : "";
    return `<div class="${cls} cardblk" style="${base}display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px">
      <div class="cardrow" style="display:flex;gap:${gap}px;align-items:center;justify-content:center;height:${z.h - (b.caption ? 48 : 0)}px">${inner}</div>${cap}</div>`;
  }

  if (b.role === "value_ladder") {
    const rows = (b.rows ?? []).map((r) => {
      if (r.op) return `<div class="lr op">${esc(r.op)}</div>`;
      const emph = r.emphasis ? " emph" : "";
      return `<div class="lr${emph}">${r.label ? `<span class="ll">${esc(r.label)}</span>` : ""}${r.value ? `<span class="lv">${esc(r.value)}</span>` : ""}</div>`;
    }).join("");
    return `<div class="${cls} ladder" style="${base}font-size:${b.font ?? 40}px">${rows}<span class="glow"></span></div>`;
  }

  if (b.role === "chart") {
    const pts = b.points ?? [];
    const max = Math.max(1, ...pts.map((p) => p.value));
    const bars = pts.map((p) => `<div class="bar"><i style="height:${Math.round((p.value / max) * (z.h - 96))}px"></i><b>${esc(p.label)}</b><u>${p.value}%</u></div>`).join("");
    return `<div class="${cls} chartblk" style="${base}display:flex;align-items:flex-end;justify-content:space-around;gap:22px;padding:22px 26px 16px">${bars}<span class="glow"></span></div>`;
  }

  const roleCss = {
    label: "font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:var(--ink);",
    hook: "font-weight:800;letter-spacing:-0.01em;text-transform:uppercase;",
    hero_stat: "font-weight:800;letter-spacing:-0.02em;color:var(--accent);",
    primary_stat: "font-weight:800;letter-spacing:-0.01em;",
    comparison: "font-weight:700;",
    context: "font-weight:500;color:var(--sub);",
    takeaway: "font-weight:600;color:var(--ink);",
    domain: "font-weight:700;color:var(--sub);letter-spacing:.02em;",
  }[b.role] ?? "font-weight:600;";
  const heroFx = (b.role === "hero_stat" || st.emphasis) ? "text-shadow:0 0 40px rgba(228,72,61,.45),0 2px 10px rgba(0,0,0,.6);" : "text-shadow:0 2px 10px rgba(0,0,0,.5);";
  const under = st.rule ? `<span class="rule"></span>` : "";
  return `<div class="${cls}" style="${base}display:flex;align-items:center;justify-content:center;text-align:center;font-size:${b.font ?? 34}px;${roleCss}${heroFx}">${esc(b.text ?? "")}${under}</div>`;
}

// ---- MOTION -----------------------------------------------------
function motionCss(timeline) {
  const total = timeline.duration_ms;
  const kf = [];
  const assign = {};
  const easeOf = {};
  const seenTargets = {};
  const storyMs = timeline.story_ms ?? total;
  const trans = timeline.transition_ms ?? 400;

  for (const e of timeline.events ?? []) {
    if (e.kind === "cta_transition" || e.kind === "cross_dissolve") continue;
    const name = `m_${e.id}`;
    const a = pc(e.at_ms, total), b = pc(e.end_ms, total), mid = pc((e.at_ms + e.end_ms) / 2, total);
    let sel = `.blk-${e.target}`;
    const dup = (seenTargets[e.target] = (seenTargets[e.target] ?? 0));
    const sameTarget = (timeline.events.filter((x) => x.target === e.target && x.kind !== "cross_dissolve" && x.kind !== "cta_transition").length);
    // only card rows get per-slot sequential targeting; everything else
    // stacks its animations on the one block element
    if (sameTarget > 1 && (e.target === "card_row" || e.target === "card_pair")) sel = `.blk-${e.target} .slot${dup}`;
    seenTargets[e.target] = dup + 1;

    if (e.kind === "stat_pulse") {
      kf.push(`@keyframes ${name}{0%,${a}%{transform:scale(1)}${mid}%{transform:scale(${(e.scale_to ?? 1.04).toFixed(3)})}${b}%,100%{transform:scale(1)}}`);
    } else if (e.kind === "card_sweep") {
      kf.push(`@keyframes ${name}{0%,${a}%{transform:translateY(0)}${mid}%{transform:translateY(-${(e.translate_pct ?? 1.4)}%)}${b}%,100%{transform:translateY(-${((e.translate_pct ?? 1.4) * 0.35).toFixed(2)}%)}}`);
      kf.push(`@keyframes ${name}_s{0%,${a}%{opacity:0;transform:translateX(-120%)}${mid}%{opacity:.85}${b}%,100%{opacity:0;transform:translateX(120%)}}`);
      assign[`${sel} .sweep`] = [`${name}_s`];
      easeOf[`${sel} .sweep`] = e.ease;
    } else if (e.kind === "illuminate" || e.kind === "chart_fill" || e.kind === "highlight" || e.kind === "settle") {
      const of = e.opacity_from ?? 0, ot = e.opacity_to ?? 1;
      kf.push(`@keyframes ${name}{0%,${a}%{opacity:${of}}${b}%,100%{opacity:${ot}}}`);
      if (e.kind === "illuminate" || e.kind === "chart_fill") {
        kf.push(`@keyframes ${name}_g{0%,${a}%{opacity:0}${mid}%{opacity:.5}${b}%,100%{opacity:0}}`);
        assign[`${sel} .glow`] = [`${name}_g`];
      }
    }
    (assign[sel] = assign[sel] ?? []).push(name);
    easeOf[sel] = e.ease;
  }

  // §17 - controlled story->CTA transition: story darkens (dim overlay +
  // slight scale-down) while .end resolves. Never fade-to-black.
  const s = pc(storyMs, total), s2 = pc(storyMs + trans, total);
  kf.push(`@keyframes storydim{0%,${s}%{opacity:1;transform:scale(1)}${s2}%,100%{opacity:.12;transform:scale(.986)}}`);
  kf.push(`@keyframes storyveil{0%,${s}%{opacity:0}${s2}%,100%{opacity:.9}}`);
  kf.push(`@keyframes endin{0%,${s}%{opacity:0}${s2}%,100%{opacity:1}}`);
  assign[".story .scene"] = ["storydim"];
  assign[".story .veil"] = ["storyveil"];
  assign[".end"] = ["endin"];

  // CTA sub-animations, timed from the CTA content start
  const cs = timeline.cta_content_start_ms ?? (storyMs + trans);
  const ck = (ms) => pc(cs + ms, total);
  kf.push(`@keyframes ecL{0%,${s}%{opacity:0;transform:translate(-12px,10px) rotate(var(--r)) scale(var(--sc))}${ck(60)}%{opacity:0;transform:translate(-12px,10px) rotate(var(--r)) scale(var(--sc))}${ck(420)}%,100%{opacity:1;transform:translate(0,0) rotate(var(--r)) scale(var(--sc))}}`);
  kf.push(`@keyframes ecC{0%,${s}%{opacity:0;transform:translate(0,14px) rotate(var(--r)) scale(var(--sc))}${ck(120)}%{opacity:0;transform:translate(0,14px) rotate(var(--r)) scale(var(--sc))}${ck(480)}%,100%{opacity:1;transform:translate(0,0) rotate(var(--r)) scale(var(--sc))}}`);
  kf.push(`@keyframes ecR{0%,${s}%{opacity:0;transform:translate(12px,10px) rotate(var(--r)) scale(var(--sc))}${ck(180)}%{opacity:0;transform:translate(12px,10px) rotate(var(--r)) scale(var(--sc))}${ck(540)}%,100%{opacity:1;transform:translate(0,0) rotate(var(--r)) scale(var(--sc))}}`);
  kf.push(`@keyframes eRise{0%,${s}%{opacity:0;transform:translateY(14px)}${ck(300)}%{opacity:0;transform:translateY(14px)}${ck(720)}%,100%{opacity:1;transform:translateY(0)}}`);
  kf.push(`@keyframes eRise2{0%,${s}%{opacity:0;transform:translateY(14px)}${ck(560)}%{opacity:0;transform:translateY(14px)}${ck(1000)}%,100%{opacity:1;transform:translateY(0)}}`);
  kf.push(`@keyframes eGo{0%,${s}%{opacity:0;transform:translateY(16px);box-shadow:0 20px 50px rgba(0,0,0,.5)}${ck(900)}%{opacity:0;transform:translateY(16px)}${ck(1300)}%{opacity:1;transform:translateY(0);box-shadow:0 20px 50px rgba(0,0,0,.5),0 0 30px rgba(228,72,61,.35)}100%{opacity:1;transform:translateY(0);box-shadow:0 20px 50px rgba(0,0,0,.5),0 0 30px rgba(228,72,61,.35)}}`);
  kf.push(`@keyframes eSweep{0%,${ck(1100)}%{opacity:0;transform:translateX(-70%)}${ck(1450)}%{opacity:.85}${ck(1900)}%,100%{opacity:0;transform:translateX(170%)}}`);
  kf.push(`@keyframes eFloat{0%{transform:translateY(0)}50%{transform:translateY(-2px)}100%{transform:translateY(0)}}`);
  assign[".end .ec.l"] = ["ecL"]; assign[".end .ec.c"] = ["ecC"]; assign[".end .ec.r"] = ["ecR"];
  assign[".end .ebrand"] = ["eRise"]; assign[".end .evps"] = ["eRise"]; assign[".end .ecta"] = ["eRise2"];
  assign[".end .ego"] = ["eGo"]; assign[".end .ego .urlsweep"] = ["eSweep"]; assign[".end .efoot"] = ["eRise2"];

  const rules = Object.entries(assign).map(([sel, names]) => {
    const ease = easeOf[sel] ? `;animation-timing-function:${easeOf[sel]}` : "";
    return `${sel}{animation-name:${names.join(",")}${ease}}`;
  }).join("\n");
  return `${kf.join("\n")}\n${rules}`;
}

// ---- CTA END SCREEN LAYER --------------------------------------
function endScreenLayer(es, endCardImages, atmoCta) {
  const slot = ["l", "c", "r"];
  const cards = (es.cards ?? []).map((c, i) => {
    const b64 = endCardImages[c.id] || "";
    const src = b64 ? `data:image/jpeg;base64,${b64}` : "";
    const cx = 540 + (i - 1) * 250;
    const lift = i === 1 ? 0 : 30;
    return `<div class="ec ${slot[i] ?? "c"}" style="--r:${c.rotation_deg ?? 0}deg;--sc:${(c.scale ?? 1) * 1.05};left:${cx - 168}px;top:${lift}px;z-index:${c.z ?? 2}">${src ? `<img src="${src}" alt="">` : `<div class="ph"></div>`}</div>`;
  }).join("");
  const icons = es.value_point_icons ?? [];
  const vps = (es.value_points ?? []).map((v, i) => `<span class="vp">${vpIcon(icons[i] ?? "magnifier")}<span>${esc(v)}</span></span>`).join("");
  return `<div class="end">
    ${atmoCta.html}
    <div class="ebrand"><span style="display:inline-flex">${BRAND_MARK_SVG(48)}</span><span class="wm"><b>Pokemon</b> Deal Finder</span></div>
    <div class="evps">${vps}</div>
    <div class="efan">${cards}</div>
    <div class="ecta"><div class="l">${esc(es.primary_cta?.line1 ?? "")}</div>${es.primary_cta?.line2 ? `<div class="l">${esc(es.primary_cta.line2)}</div>` : ""}</div>
    <div class="ego"><span class="u">${BRAND_MARK_SVG(40)}<span><b>pokemondealfinder</b>.com</span></span><span class="urlsweep"></span></div>
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

  const atmoStory = buildAtmosphere({ variant: "story", W, H, durationMs: total });
  const atmoCta = buildAtmosphere({ variant: "cta", W, H, durationMs: total });

  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
  *{margin:0;padding:0;box-sizing:border-box}
  :root{--bg:${S.bg || "#0b0b0d"};--ink:${S.ink || "#f4f4f6"};--sub:${S.sub || "#b9b9c1"};--accent:${S.accent || "#e4483d"}}
  html,body{width:${W}px;height:${H}px;overflow:hidden;background:var(--bg)}
  .stage{position:relative;width:${W}px;height:${H}px;background:var(--bg);font-family:${S.font || '"Helvetica Neue",Arial,sans-serif'};color:var(--ink)}
  .story,.end{position:absolute;inset:0}
  .story .scene{position:absolute;inset:0;transform-origin:50% 46%}
  .story .veil{position:absolute;inset:0;background:radial-gradient(120% 90% at 50% 40%,rgba(0,0,0,.35),rgba(0,0,0,.82));opacity:0;z-index:40;pointer-events:none}
  ${atmoStory.css}
  .blk{will-change:transform,opacity;z-index:2}
  .blk.panel{background:${S.panel_bg};border:${S.panel_border};border-radius:22px;box-shadow:${S.panel_shadow};backdrop-filter:blur(2px)}
  .blk.spot::before{content:"";position:absolute;left:50%;top:50%;width:150%;height:150%;transform:translate(-50%,-50%);
    background:radial-gradient(circle at center,rgba(255,255,255,.10),transparent 62%);z-index:-1;pointer-events:none}
  .blk .rule{position:absolute;left:50%;bottom:-14px;transform:translateX(-50%);width:74px;height:4px;border-radius:3px;background:var(--accent);box-shadow:0 0 22px rgba(228,72,61,.6)}
  .cardblk .cardrow{will-change:transform}
  .slot{position:relative;height:100%;display:flex;align-items:center;justify-content:center;overflow:hidden;border-radius:16px;
    box-shadow:${S.card_shadow || "0 30px 70px rgba(0,0,0,.6)"},${S.card_rim || "0 0 0 2px rgba(255,255,255,.07)"},0 0 60px rgba(228,72,61,.14)}
  .slot img{width:100%;height:100%;object-fit:contain;display:block;background:#0d0d10}
  .slot .ph{width:100%;height:100%;background:#15151a}
  .slot .sweep{position:absolute;top:0;bottom:0;width:60%;pointer-events:none;opacity:0;
    background:linear-gradient(105deg,transparent,rgba(255,255,255,.5),transparent);mix-blend-mode:screen}
  .cap{font-size:26px;font-weight:600;color:var(--sub);text-shadow:0 2px 8px rgba(0,0,0,.6)}
  .ladder{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;padding:22px 30px;text-align:center}
  .ladder .lr{display:flex;align-items:baseline;justify-content:center;gap:16px;font-weight:800;letter-spacing:-0.01em}
  .ladder .lr .ll{color:var(--sub);font-weight:700;font-size:.62em;letter-spacing:.06em;text-transform:uppercase}
  .ladder .lr .lv{color:var(--ink)}
  .ladder .lr.emph{color:var(--accent);font-size:1.18em;text-shadow:0 0 34px rgba(228,72,61,.5)}
  .ladder .lr.op{color:rgba(255,255,255,.32);font-weight:400;font-size:.7em;line-height:.6}
  .ladder .glow,.chartblk .glow{position:absolute;inset:0;border-radius:22px;opacity:0;pointer-events:none;
    background:radial-gradient(120% 90% at 50% 45%,rgba(228,72,61,.28),transparent 68%);mix-blend-mode:screen}
  .chartblk{position:relative;border-radius:22px}
  .chartblk .bar{display:flex;flex-direction:column;align-items:center;gap:10px;flex:1;justify-content:flex-end}
  .chartblk .bar i{display:block;width:66%;background:linear-gradient(180deg,var(--accent),#7a2a25);border-radius:7px 7px 0 0;box-shadow:0 0 24px rgba(228,72,61,.35)}
  .chartblk .bar b{font-size:24px;font-weight:600;color:var(--sub)}
  .chartblk .bar u{font-size:30px;font-weight:800;text-decoration:none}
  /* ---- end screen ---- */
  .end{opacity:0}
  ${atmoCta.css.replace(/\.atmo\b/g, ".end .atmo").replace(/@keyframes atmodust/, "@keyframes atmodust2")}
  .end .atmo .dust{animation-name:atmodust2}
  .ebrand{position:absolute;top:196px;left:0;right:0;display:flex;align-items:center;justify-content:center;gap:16px;z-index:6}
  .ebrand .wm{font-weight:800;font-size:44px;letter-spacing:-0.01em;text-shadow:0 2px 12px rgba(0,0,0,.6)}
  .ebrand .wm b{color:var(--accent)}
  .evps{position:absolute;top:314px;left:0;right:0;display:flex;align-items:center;justify-content:center;gap:18px;z-index:6}
  .evps .vp{display:inline-flex;align-items:center;gap:10px;font-weight:700;font-size:25px;letter-spacing:.04em;color:#e6e6ea;
    border:1px solid rgba(228,72,61,.35);background:rgba(255,255,255,.04);border-radius:999px;padding:11px 20px;box-shadow:0 6px 20px rgba(0,0,0,.4)}
  .efan{position:absolute;top:486px;left:0;right:0;height:540px;z-index:2}
  .ec{position:absolute;top:0;width:336px;height:470px;border-radius:20px;overflow:hidden;transform:rotate(var(--r)) scale(var(--sc));
    box-shadow:0 34px 80px rgba(0,0,0,.62),0 0 80px rgba(228,72,61,.26),0 0 0 2px rgba(255,255,255,.07)}
  .ec.c{box-shadow:0 40px 90px rgba(0,0,0,.66),0 0 100px rgba(228,72,61,.34),0 0 0 2px rgba(255,255,255,.10)}
  .ec img{width:100%;height:100%;object-fit:cover;display:block}
  .ec .ph{width:100%;height:100%;background:#15151a}
  .ecta{position:absolute;left:0;right:0;bottom:470px;text-align:center;z-index:7}
  .ecta .l{font-weight:800;font-size:62px;line-height:1.05;letter-spacing:-0.01em;text-transform:uppercase;text-shadow:0 2px 16px rgba(0,0,0,.7)}
  .ego{position:absolute;left:88px;right:88px;bottom:296px;background:#f6f6f8;color:#111;border:5px solid var(--accent);
    border-radius:22px;padding:26px 0;text-align:center;box-shadow:0 22px 55px rgba(0,0,0,.55),inset 0 2px 6px rgba(0,0,0,.12);z-index:7;overflow:hidden}
  .ego .u{position:relative;z-index:2;display:inline-flex;align-items:center;gap:16px;font-weight:800;font-size:46px;letter-spacing:-0.01em}
  .ego .u b{color:var(--accent)}
  .ego .urlsweep{position:absolute;top:0;bottom:0;width:44%;opacity:0;z-index:3;pointer-events:none;
    background:linear-gradient(105deg,transparent,rgba(255,255,255,.75),transparent);mix-blend-mode:screen}
  .efoot{position:absolute;left:0;right:0;bottom:222px;text-align:center;color:#a9a9b2;font-weight:700;font-size:24px;letter-spacing:.05em;z-index:7}
  .stage *{animation-duration:${total}ms;animation-timing-function:cubic-bezier(.215,.61,.355,1);animation-play-state:paused;animation-fill-mode:both}
  ${motionCss(timeline)}
  </style></head><body><div class="stage">
    <div class="story">
      ${atmoStory.html}
      <div class="scene">${blocks}</div>
      <div class="veil"></div>
    </div>
    ${endScreenLayer(es, endCardImages, atmoCta)}
  </div></body></html>`;
  return { html, total };
}
