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

export const PROFESSIONAL_LOOP_DOC_VERSION = "4c6.1";

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
    const capH = (b.caption ? 44 : 0) + (b.example_label ? 40 : 0);
    const cw = Math.min((z.h - capH) * 0.72 * scale, ((z.w - gap * (n - 1)) / n) * (n === 1 ? scale : 1));
    const inner = ids.map((id, i) => {
      const b64 = cardImages[id] || cardImages[String(id)] || "";
      const src = b64 ? `data:image/jpeg;base64,${b64}` : "";
      return `<div class="slot slot${i}" style="width:${cw}px">${src ? `<img src="${src}" alt="">` : `<div class="ph"></div>`}<span class="sweep"></span>${st.framed_base ? `<span class="plinth"></span>` : ""}</div>`;
    }).join("");
    const exl = b.example_label ? `<div class="exlabel"><span class="dot"></span>${esc(b.example_label)}</div>` : "";
    const cap = b.caption ? `<div class="cap">${esc(b.caption)}</div>` : "";
    return `<div class="${cls} cardblk" style="${base}display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px">
      ${exl}<div class="cardrow" style="display:flex;gap:${gap}px;align-items:center;justify-content:center;height:${z.h - capH}px">${inner}</div>${cap}</div>`;
  }

  // 4C.6 §6/§7 - LEFT large hero card, RIGHT strong stacked comparison with
  // a drawn red comparison spine. High-contrast numbers, no soft glass.
  if (b.role === "hero_row") {
    const id = (b.cardIds ?? [])[0];
    const b64 = id ? (cardImages[id] || cardImages[String(id)] || "") : "";
    const src = b64 ? `data:image/jpeg;base64,${b64}` : "";
    const rows = (b.spine ?? []).map((r) => {
      if (r.op) return `<div class="sr op"><span class="tick"></span></div>`;
      const k = r.kind ? ` k-${r.kind}` : "";
      const emph = r.emphasis ? " emph" : "";
      return `<div class="sr${emph}${k}">${r.label && r.kind === "gap" ? `<span class="sv">${esc(r.label)}</span>`
        : `${r.label ? `<span class="sl">${esc(r.label)}</span>` : ""}${r.value ? `<span class="sv">${esc(r.value)}</span>` : ""}`}</div>`;
    }).join("");
    const cap = b.caption ? `<div class="hrcap">${esc(b.caption)}</div>` : "";
    return `<div class="${cls} herorow" style="${base}font-size:${b.font ?? 46}px">
      <div class="hrcard"><div class="slot slot0" style="width:100%">${src ? `<img src="${src}" alt="">` : `<div class="ph"></div>`}<span class="sweep"></span></div>${cap}</div>
      <div class="hrspine"><span class="rail"></span>${rows}<span class="glow"></span></div>
    </div>`;
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
    const bars = pts.map((p, i) => `<div class="bar${i === 0 && b.dominant_first ? " dom" : ""}"><i style="height:${Math.round((p.value / max) * (z.h - 110))}px"></i><b>${esc(p.label)}</b><u>${p.value}%</u></div>`).join("");
    return `<div class="${cls} chartblk" style="${base}display:flex;align-items:flex-end;justify-content:space-around;gap:22px;padding:24px 28px 18px">${bars}<span class="glow"></span></div>`;
  }

  const roleCss = {
    label: "font-weight:900;letter-spacing:.10em;text-transform:uppercase;color:#ffffff;",
    hook: "font-weight:900;letter-spacing:-0.01em;text-transform:uppercase;color:#ffffff;",
    hero_stat: "font-weight:900;letter-spacing:-0.02em;color:var(--accent);",
    primary_stat: "font-weight:900;letter-spacing:-0.01em;color:#ffffff;",
    comparison: "font-weight:800;color:#ffffff;",
    context: "font-weight:600;color:#dcdce2;",
    takeaway: "font-weight:700;color:#ffffff;",
    domain: "font-weight:800;color:#c8c8d0;letter-spacing:.02em;",
  }[b.role] ?? "font-weight:700;color:#f2f2f5;";
  const heroFx = (b.role === "hero_stat" || st.emphasis)
    ? "text-shadow:0 0 46px rgba(232,73,61,.5),0 3px 12px rgba(0,0,0,.65);"
    : "text-shadow:0 2px 12px rgba(0,0,0,.62);";
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
    // only card rows get per-slot sequential targeting
    if (sameTarget > 1 && (e.target === "card_row" || e.target === "card_pair")) sel = `.blk-${e.target} .slot${dup}`;
    // 4C.6 - hero_row events target distinct sub-elements so their
    // transforms never clobber each other on the one block
    if (e.target === "hero_row") {
      sel = e.kind === "stat_pulse" ? `.blk-hero_row .sr.emph`
        : (e.kind === "card_sweep" || e.kind === "sweep") ? `.blk-hero_row .hrcard`
        : `.blk-hero_row .hrspine`;
    }
    seenTargets[e.target] = dup + 1;

    if (e.kind === "stat_pulse") {
      kf.push(`@keyframes ${name}{0%,${a}%{transform:scale(1)}${mid}%{transform:scale(${(e.scale_to ?? 1.04).toFixed(3)})}${b}%,100%{transform:scale(1)}}`);
    } else if (e.kind === "card_sweep") {
      kf.push(`@keyframes ${name}{0%,${a}%{transform:translateY(0)}${mid}%{transform:translateY(-${(e.translate_pct ?? 1.4)}%)}${b}%,100%{transform:translateY(-${((e.translate_pct ?? 1.4) * 0.35).toFixed(2)}%)}}`);
      kf.push(`@keyframes ${name}_s{0%,${a}%{opacity:0;transform:translateX(-120%)}${mid}%{opacity:.85}${b}%,100%{opacity:0;transform:translateX(120%)}}`);
      (assign[`${sel} .sweep`] = assign[`${sel} .sweep`] ?? []).push(`${name}_s`);
      easeOf[`${sel} .sweep`] = e.ease;
    } else if (e.kind === "sweep") {
      // just the diagonal light pass, no transform
      kf.push(`@keyframes ${name}_s{0%,${a}%{opacity:0;transform:translateX(-120%)}${mid}%{opacity:.9}${b}%,100%{opacity:0;transform:translateX(140%)}}`);
      (assign[`${sel} .sweep`] = assign[`${sel} .sweep`] ?? []).push(`${name}_s`);
      easeOf[`${sel} .sweep`] = e.ease;
      continue;
    } else if (e.kind === "illuminate" || e.kind === "chart_fill" || e.kind === "highlight" || e.kind === "settle") {
      const of = e.opacity_from ?? 0, ot = e.opacity_to ?? 1;
      kf.push(`@keyframes ${name}{0%,${a}%{opacity:${of}}${b}%,100%{opacity:${ot}}}`);
      if (e.kind === "illuminate" || e.kind === "chart_fill") {
        kf.push(`@keyframes ${name}_g{0%,${a}%{opacity:0}${mid}%{opacity:.55}${b}%,100%{opacity:0}}`);
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
    const cx = 540 + (i - 1) * 262;
    const lift = i === 1 ? 0 : 34;
    const sc = (c.scale ?? 1) * (i === 1 ? 1.16 : 1.06);
    return `<div class="ec ${slot[i] ?? "c"}" style="--r:${c.rotation_deg ?? 0}deg;--sc:${sc};left:${cx - 186}px;top:${lift}px;z-index:${c.z ?? 2}">${src ? `<img src="${src}" alt="">` : `<div class="ph"></div>`}</div>`;
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
  // 4C.6 §17/§24 - the CTA is the brightest, most confident moment
  const atmoCta = buildAtmosphere({ variant: "cta", W, H, durationMs: total, bright: true });

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
  .blk .rule{position:absolute;left:50%;bottom:-16px;transform:translateX(-50%);width:96px;height:5px;border-radius:3px;background:var(--accent);box-shadow:0 0 26px rgba(232,73,61,.7)}
  .cardblk .cardrow{will-change:transform}
  .slot{position:relative;height:100%;display:flex;align-items:center;justify-content:center;overflow:hidden;border-radius:16px;
    box-shadow:${S.card_shadow || "0 40px 90px rgba(0,0,0,.66)"},${S.card_rim || "0 0 0 2px rgba(255,255,255,.09)"},${S.card_backlight || "0 0 90px rgba(232,73,61,.30)"}}
  .slot img{width:100%;height:100%;object-fit:contain;display:block;background:#0d0d10}
  .slot .ph{width:100%;height:100%;background:#15151a}
  .slot .sweep{position:absolute;top:0;bottom:0;width:60%;pointer-events:none;opacity:0;
    background:linear-gradient(105deg,transparent,rgba(255,255,255,.55),transparent);mix-blend-mode:screen}
  .slot .plinth{position:absolute;left:-6%;right:-6%;bottom:-14px;height:34px;border-radius:50%;
    background:radial-gradient(50% 100% at 50% 0,rgba(232,73,61,.34),transparent 72%);filter:blur(6px)}
  .cap,.hrcap{font-size:27px;font-weight:700;color:#dcdce2;text-shadow:0 2px 8px rgba(0,0,0,.6)}
  .exlabel{display:inline-flex;align-items:center;gap:10px;font-size:24px;font-weight:900;letter-spacing:.14em;color:#ff7a70;text-transform:uppercase}
  .exlabel .dot{width:9px;height:9px;border-radius:50%;background:var(--accent);box-shadow:0 0 14px rgba(232,73,61,.9)}
  /* ---- 4C.6 hero row: card left, strong comparison spine right ---- */
  .herorow{display:flex;align-items:center;justify-content:center;gap:30px}
  .herorow .hrcard{flex:0 0 43%;display:flex;flex-direction:column;align-items:center;gap:14px;will-change:transform}
  .herorow .hrcard .slot{height:auto;aspect-ratio:5/7;width:100%}
  .herorow .hrspine{position:relative;flex:1;display:flex;flex-direction:column;align-items:flex-start;justify-content:center;gap:16px;
    padding:26px 26px 26px 42px;background:${S.value_block_bg || "linear-gradient(180deg,#151518,#0e0e11)"};
    border:${S.value_block_border || "1px solid rgba(232,73,61,.30)"};border-left:4px solid var(--accent);border-radius:18px;
    box-shadow:${S.value_block_shadow || "0 28px 70px rgba(0,0,0,.55)"}}
  .herorow .hrspine .rail{position:absolute;left:19px;top:24%;bottom:24%;width:3px;border-radius:2px;
    background:linear-gradient(180deg,rgba(232,73,61,.15),var(--accent),rgba(232,73,61,.15))}
  .herorow .sr{display:flex;flex-direction:column;align-items:flex-start;line-height:1.02}
  .herorow .sr .sl{font-size:.5em;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:#9a9aa4}
  .herorow .sr .sv{font-size:1.08em;font-weight:900;letter-spacing:-0.02em;color:#ffffff;text-shadow:0 2px 12px rgba(0,0,0,.6)}
  .herorow .sr.emph .sv{color:var(--accent);font-size:1.02em;text-shadow:0 0 34px rgba(232,73,61,.55)}
  .herorow .sr.op{padding:2px 0}
  .herorow .sr.op .tick{display:block;width:0;height:0;margin-left:2px;border-left:8px solid transparent;border-right:8px solid transparent;border-top:11px solid var(--accent)}
  .herorow .hrspine .glow{position:absolute;inset:0;border-radius:18px;opacity:0;pointer-events:none;
    background:radial-gradient(120% 90% at 20% 50%,rgba(232,73,61,.30),transparent 66%);mix-blend-mode:screen}
  .ladder{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;padding:22px 30px;text-align:center}
  .ladder .lr{display:flex;align-items:baseline;justify-content:center;gap:16px;font-weight:800;letter-spacing:-0.01em}
  .ladder .lr .ll{color:var(--sub);font-weight:700;font-size:.62em;letter-spacing:.06em;text-transform:uppercase}
  .ladder .lr .lv{color:var(--ink)}
  .ladder .lr.emph{color:var(--accent);font-size:1.18em;text-shadow:0 0 34px rgba(228,72,61,.5)}
  .ladder .lr.op{color:rgba(255,255,255,.32);font-weight:400;font-size:.7em;line-height:.6}
  .ladder .glow,.chartblk .glow{position:absolute;inset:0;border-radius:22px;opacity:0;pointer-events:none;
    background:radial-gradient(120% 90% at 50% 45%,rgba(232,73,61,.30),transparent 68%);mix-blend-mode:screen}
  .chartblk{position:relative;border-radius:22px;border-left:4px solid var(--accent)}
  .chartblk .bar{display:flex;flex-direction:column;align-items:center;gap:10px;flex:1;justify-content:flex-end}
  .chartblk .bar i{display:block;width:64%;background:linear-gradient(180deg,#8f322b,#5f231e);border-radius:8px 8px 0 0;box-shadow:0 0 20px rgba(232,73,61,.22)}
  .chartblk .bar.dom i{width:88%;background:linear-gradient(180deg,var(--accent),#8f322b);box-shadow:0 0 40px rgba(232,73,61,.5)}
  .chartblk .bar b{font-size:24px;font-weight:700;color:#c2c2ca}
  .chartblk .bar.dom b{color:#ffffff}
  .chartblk .bar u{font-size:30px;font-weight:900;text-decoration:none;color:#e8e8ec}
  .chartblk .bar.dom u{font-size:38px;color:#ffffff}
  /* ---- end screen ---- */
  .end{opacity:0}
  ${atmoCta.css.replace(/\.atmo\b/g, ".end .atmo").replace(/@keyframes atmodust/, "@keyframes atmodust2")}
  .end .atmo .dust{animation-name:atmodust2}
  .ebrand{position:absolute;top:188px;left:0;right:0;display:flex;align-items:center;justify-content:center;gap:16px;z-index:6}
  .ebrand .wm{font-weight:900;font-size:46px;letter-spacing:-0.01em;color:#ffffff;text-shadow:0 2px 14px rgba(0,0,0,.55)}
  .ebrand .wm b{color:var(--accent)}
  .evps{position:absolute;top:306px;left:0;right:0;display:flex;align-items:center;justify-content:center;gap:18px;z-index:6}
  .evps .vp{display:inline-flex;align-items:center;gap:10px;font-weight:800;font-size:25px;letter-spacing:.04em;color:#f2f2f5;
    border:1px solid rgba(232,73,61,.5);background:rgba(20,20,24,.55);border-radius:999px;padding:12px 22px;box-shadow:0 8px 22px rgba(0,0,0,.4)}
  .efan{position:absolute;top:410px;left:0;right:0;height:588px;z-index:2}
  .ec{position:absolute;top:0;width:372px;height:520px;border-radius:22px;overflow:hidden;transform:rotate(var(--r)) scale(var(--sc));
    box-shadow:0 38px 90px rgba(0,0,0,.55),0 0 130px rgba(232,73,61,.42),0 0 0 2px rgba(255,255,255,.14)}
  .ec.c{box-shadow:0 46px 110px rgba(0,0,0,.58),0 0 180px rgba(232,73,61,.56),0 0 0 3px rgba(255,255,255,.18)}
  .ec::after{content:"";position:absolute;inset:0;border-radius:22px;
    box-shadow:inset 0 0 50px rgba(255,255,255,.10);background:linear-gradient(120deg,rgba(255,255,255,.08),transparent 40%);pointer-events:none}
  .ec img{width:100%;height:100%;object-fit:cover;display:block;filter:brightness(1.12) contrast(1.05) saturate(1.06)}
  .ec .ph{width:100%;height:100%;background:#15151a}
  .ecta{position:absolute;left:0;right:0;bottom:500px;text-align:center;z-index:7}
  .ecta .l{font-weight:900;font-size:68px;line-height:1.04;letter-spacing:-0.01em;text-transform:uppercase;color:#ffffff;
    text-shadow:0 0 34px rgba(255,255,255,.14),0 3px 18px rgba(0,0,0,.55)}
  .ecta::after{content:"";display:block;width:88px;height:5px;margin:20px auto 0;border-radius:3px;background:var(--accent);box-shadow:0 0 24px rgba(232,73,61,.75)}
  .ego{position:absolute;left:80px;right:80px;bottom:290px;background:#ffffff;color:#0e0e10;border:6px solid var(--accent);
    border-radius:24px;padding:30px 0;text-align:center;box-shadow:0 26px 64px rgba(0,0,0,.5),0 0 60px rgba(232,73,61,.28),inset 0 2px 6px rgba(0,0,0,.08);z-index:7;overflow:hidden}
  .ego .u{position:relative;z-index:2;display:inline-flex;align-items:center;gap:16px;font-weight:900;font-size:50px;letter-spacing:-0.01em}
  .ego .u b{color:var(--accent)}
  .ego .urlsweep{position:absolute;top:0;bottom:0;width:44%;opacity:0;z-index:3;pointer-events:none;
    background:linear-gradient(105deg,transparent,rgba(255,255,255,.85),transparent);mix-blend-mode:screen}
  .efoot{position:absolute;left:0;right:0;bottom:214px;text-align:center;color:#cccdd4;font-weight:800;font-size:25px;letter-spacing:.05em;z-index:7;text-shadow:0 2px 10px rgba(0,0,0,.5)}
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
