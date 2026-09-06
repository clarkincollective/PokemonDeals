// Phase 13E.4 - turn a video timeline + already-verified content into ONE
// animated HTML document. lib/social/videoRender.mjs rasterises it frame
// by frame under a deterministic virtual clock, so every element's motion
// is driven purely by CSS `animation-delay` / `-duration` in ms that map
// 1:1 onto virtual time.
//
// Reuses the frozen 13E.3D visual system (TOKENS, Geist, the real card
// artwork, the approved OpenAI background). It ADDS one restrained,
// reusable MOTION LANGUAGE and nothing else. No pixel of the real card
// is ever distorted (object-fit:contain, transform only on the frame,
// never a blur/skew on .card-art). No OpenAI. No network at render time
// (fonts are embedded base64; the card / background / screenshot are
// local file:// paths).

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { TOKENS, resolveCardGeometry } from "./creativeSpec.mjs";
import { FONT_FACE_CSS } from "./fontData.mjs";
import { fmtUsd, safeText, pathToFileUrl } from "./templates.mjs";

// The frame renderer injects this HTML with Page.setDocumentContent, which
// gives the document an opaque origin - Chrome then refuses to load its
// file:// subresources. So every local image (real card artwork, the
// approved OpenAI background, the site screenshot) is read off disk and
// inlined as a data: URI before the HTML ever reaches Chrome. Fonts are
// already base64 @font-face. Result: a fully self-contained document with
// zero external/file:// fetches at render time.
const MIME = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".gif": "image/gif" };
function toDataUri(fileUrl) {
  let p;
  try {
    p = fileUrl.startsWith("file:") ? fileURLToPath(fileUrl) : fileUrl;
    const ext = (p.match(/\.[a-z0-9]+$/i)?.[0] || ".png").toLowerCase();
    const b64 = readFileSync(p).toString("base64");
    return `data:${MIME[ext] || "image/png"};base64,${b64}`;
  } catch {
    return fileUrl; // leave it; QA / a blank slot will surface the miss
  }
}
function inlineLocalAssets(html) {
  return html
    .replace(/src="(file:[^"]+)"/g, (_, u) => `src="${toDataUri(u)}"`)
    .replace(/url\(['"]?(file:[^'")]+)['"]?\)/g, (_, u) => `url('${toDataUri(u)}')`);
}

const C = TOKENS.color;
const T = TOKENS.type;

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function magnifier(color = C.brand, px = 34) {
  return `<svg width="${px}" height="${px}" viewBox="0 0 32 32" fill="none" aria-hidden="true"><circle cx="13.5" cy="13.5" r="8.5" stroke="${color}" stroke-width="3"/><line x1="20" y1="20" x2="28" y2="28" stroke="${color}" stroke-width="3" stroke-linecap="round"/></svg>`;
}
function arrow(color = C.brand, px = 34) {
  return `<svg width="${px}" height="${px}" viewBox="0 0 32 32" fill="none" aria-hidden="true"><path d="M6 16h18M18 9l8 7-8 7" stroke="${color}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}

// MOTION MODEL
// Instead of CSS @keyframes animations (which headless Chrome composites
// on a separate thread and does NOT reliably sync to a CDP pause()+seek -
// producing dimmed / mid-transition frames), every animated element
// carries its motion as three CSS custom properties and starts in its
// "from" state. lib/social/videoRender.mjs then BAKES the exact resolved
// style for each frame's timestamp straight onto element.style on the main
// thread (see BAKE_JS below). Fully deterministic, no compositor race.
//
//   --va : the motion name   (mask_up | rise | scale_in | slide_up |
//                             slide_right | fade | scene | draw | pop | drift)
//   --vs : start time in ms
//   --vd : duration in ms

// the resting ("from") inline style for each motion, so a not-yet-baked
// document still reads as t=0.
const FROM_STYLE = {
  mask_up: "opacity:0;clip-path:inset(0 0 100% 0)",
  rise: "opacity:0;transform:translateY(40px)",
  scale_in: "opacity:0;transform:scale(0.9)",
  slide_up: "opacity:0;transform:translateY(140px)",
  slide_right: "opacity:0;transform:translateX(-160px)",
  fade: "opacity:0",
  scene: "opacity:0;transform:translateY(90px)",
  drift: "transform:scale(1.05)",
  draw: "stroke-dashoffset:1",
  pop: "opacity:0;transform:scale(0)",
};

function enter(anim, startMs, durMs, extra = "") {
  const a = String(anim);
  return `--va:${a};--vs:${startMs};--vd:${durMs};${FROM_STYLE[a] ?? ""}${extra ? ";" + extra : ""}`;
}
// windowed element (carousel per-card scene): enter -> hold -> short exit
function windowed(startMs, durMs) {
  return `--va:scene;--vs:${startMs};--vd:${durMs};${FROM_STYLE.scene}`;
}

// deterministic chart: the path `d` is the EXACT real series; a
// stroke-dashoffset animation draws it progressively between the real
// plotted points without inventing an endpoint, peak, or value.
function videoChart(series, { color, drawStartMs, drawDurMs }) {
  const pts = (series ?? []).filter((p) => p && Number.isFinite(Number(p.v)));
  if (pts.length < 2) return "";
  const W = 900, H = 520, pad = 12;
  const vs = pts.map((p) => Number(p.v));
  const lo = Math.min(...vs), hi = Math.max(...vs);
  const span = hi - lo || 1;
  const x = (i) => pad + (i * (W - 2 * pad)) / (pts.length - 1);
  const y = (v) => pad + (H - 2 * pad) * (1 - (v - lo) / span);
  const d = pts.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)} ${y(Number(p.v)).toFixed(1)}`).join(" ");
  const area = `${d} L${x(pts.length - 1).toFixed(1)} ${H - pad} L${x(0).toFixed(1)} ${H - pad} Z`;
  const endX = x(pts.length - 1).toFixed(1);
  const endY = y(vs[vs.length - 1]).toFixed(1);
  return `<svg class="v-chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">
    <path class="v-chart-area" d="${area}" fill="${color}" fill-opacity="0.12"
      style="${enter("fade", drawStartMs, 500)}"/>
    <path class="v-chart-line" d="${d}" fill="none" stroke="${color}" stroke-width="6"
      stroke-linecap="round" stroke-linejoin="round" pathLength="1" stroke-dasharray="1"
      style="${enter("draw", drawStartMs, drawDurMs)}"/>
    <circle class="v-chart-dot" cx="${endX}" cy="${endY}" r="9" fill="${color}"
      style="${enter("pop", drawStartMs + drawDurMs - 200, 380)}"/>
  </svg>`;
}

function shell(timeline, bodyHtml, { background = null } = {}) {
  const s = timeline.safe;
  const bgUrl = background && background.absFile ? pathToFileUrl(background.absFile) : null;
  return `<!doctype html><html><head><meta charset="utf-8"><style>
  ${FONT_FACE_CSS}
  *{margin:0;padding:0;box-sizing:border-box}
  html,body{width:${timeline.width}px;height:${timeline.height}px;background:${C.bg};overflow:hidden}
  .stage{position:relative;width:${timeline.width}px;height:${timeline.height}px;background:${C.bg};
    font-family:${T.family};color:${C.ink};-webkit-font-smoothing:antialiased}
  .bg-photo{position:absolute;inset:-40px;background-image:url('${bgUrl}');background-size:cover;background-position:center;
    z-index:0;transform:scale(1.05)}
  .bg-wash{position:absolute;inset:0;z-index:1;
    background:radial-gradient(120% 70% at 50% 12%, rgba(11,11,13,0.68), rgba(11,11,13,0.92) 60%, ${C.bg} 100%)}
  /* the per-card scene wrappers get a baked transform/opacity, which makes
     each an atomic stacking context; pin them above .bg-wash (z1) so the
     wash never paints over scene text. .vdisc stays on top at z4. */
  .v-scenegroup{position:absolute;inset:0;z-index:2}
  .safe{position:absolute;left:${s.left}px;right:${s.right}px;top:${s.top}px;bottom:${s.bottom}px;z-index:3;
    display:flex;flex-direction:column;overflow:hidden}
  .vband{flex:none;display:flex;align-items:center;justify-content:center;min-height:0;overflow:hidden}
  .vspring{flex:1 1 auto;min-height:10px}
  .brandrow{display:flex;align-items:center;gap:12px;font-size:30px;font-weight:600;letter-spacing:-0.02em}
  .brandrow .r{color:${C.brand}}
  .vhook{font-weight:800;letter-spacing:-0.04em;line-height:1.02;text-transform:uppercase;color:${C.ink};text-wrap:balance}
  .vhook .em{color:${C.brand}}
  .vcard{will-change:transform}
  .vcard .card-frame{filter:drop-shadow(0 50px 110px rgba(0,0,0,0.6));border-radius:16px}
  .vcard .card-art{display:block;max-width:100%;max-height:var(--cah,620px);width:auto;height:auto;object-fit:contain;border-radius:12px}
  .vmetric{font-size:190px;font-weight:800;letter-spacing:-0.05em;line-height:1;font-variant-numeric:tabular-nums}
  .vmetric-label{font-size:30px;font-weight:600;letter-spacing:0.12em;text-transform:uppercase;color:${C.inkSub};margin-top:8px}
  .vprice{display:flex;gap:64px;align-items:flex-end}
  .vprice .k{font-size:26px;font-weight:600;letter-spacing:0.1em;text-transform:uppercase;color:${C.inkFaint}}
  .vprice .v{font-size:64px;font-weight:700;letter-spacing:-0.02em;font-variant-numeric:tabular-nums;margin-top:8px}
  .vprice .listed .v{color:${C.ink}}
  .vprice .ref .v{color:${C.inkFaint};font-size:44px;font-weight:500}
  .vname{font-size:78px;font-weight:800;letter-spacing:-0.035em;line-height:1.02}
  .vname .set{display:block;font-size:26px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;color:${C.inkFaint};margin-top:10px}
  .vsub{font-size:34px;color:${C.inkSub};line-height:1.35;max-width:22ch}
  .vcontext{font-size:26px;color:${C.inkSub}}
  .vcontext .k{color:${C.inkFaint}}
  .vcta{display:flex;flex-direction:column;gap:10px}
  .vcta .line{display:flex;align-items:center;gap:16px;font-size:44px;font-weight:800;text-transform:uppercase;letter-spacing:0.01em;color:${C.ink}}
  .vcta .line .u{border-bottom:5px solid ${C.brand};padding-bottom:8px}
  .vcta .url{font-size:30px;font-weight:700;letter-spacing:0.02em;color:${C.brand}}
  .vdisc{position:absolute;left:${s.left}px;right:${s.right}px;bottom:${s.bottom - 44}px;z-index:4;display:flex;justify-content:space-between;align-items:baseline;
    font-size:24px;color:${C.inkFaint};padding-top:16px;border-top:1px solid ${C.hair}}
  .vdisc .ad{font-weight:700;letter-spacing:0.06em;color:${C.inkSub}}
  .v-chart{display:block;width:100%;height:auto;overflow:visible}
  .vbadge{align-self:flex-start;font-size:26px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:${C.inkSub};
    border:1px solid ${C.hair};border-radius:999px;padding:12px 22px}
  .vbenefits{display:flex;flex-direction:column;gap:16px}
  .vbenefit{font-size:34px;font-weight:800;letter-spacing:0.02em;text-transform:uppercase;color:${C.ink};display:flex;align-items:center;gap:16px}
  .vbenefit::before{content:"";width:16px;height:16px;border-radius:4px;background:${C.brand};flex:none}
  .vdevice{border:1px solid ${C.hair};border-radius:24px;overflow:hidden;background:${C.surface};box-shadow:0 60px 130px rgba(0,0,0,0.6)}
  .vdevice .bar{display:flex;align-items:center;gap:12px;padding:20px 26px;background:${C.surfaceHi};border-bottom:1px solid ${C.hair}}
  .vdevice .bar .d{width:14px;height:14px;border-radius:999px;background:${C.hair}}
  .vdevice .bar .url{flex:1;margin-left:12px;background:${C.bg};border:1px solid ${C.hair};border-radius:999px;padding:12px 24px;font-size:24px;color:${C.inkFaint}}
  .vdevice img{display:block;width:100%;height:auto}
  .fanwrap{position:relative;flex:1;min-height:0;overflow:hidden}
  .fanwrap .card-frame{position:absolute;left:50%;bottom:0;border-radius:16px;filter:drop-shadow(0 50px 100px rgba(0,0,0,0.62))}
  .fanwrap .card-art{height:540px;width:auto;max-width:none}
  .fill{flex:1;min-height:0}
</style></head><body><div class="stage">
  ${bgUrl ? `<div class="bg-photo" style="${enter("drift", 0, timeline.durationMs)}"></div><div class="bg-wash"></div>` : ""}
  ${bodyHtml}
</div></body></html>`;
}

function zBrand() {
  return `<div class="brandrow">${magnifier()}<span><span class="r">Pokemon</span>DealFinder</span></div>`;
}
function zDisc(timeline) {
  return `<div class="vdisc" style="${enter("fade", timeline.disclosureFromMs, 400)}"><div>${esc(timeline.facts.freshness_label ?? "Checked recently. Availability can change.")}</div><div class="ad">${esc(timeline.facts.disclosure_label)}</div></div>`;
}
function zCta(timeline) {
  const cue = timeline.cues.cta ?? { start: timeline.ctaAtMs, dur: 500 };
  return `<div class="vcta" style="${enter(cue.anim ?? "rise", cue.start, cue.dur)}">
    <div class="line"><span class="u">${esc(timeline.facts.cta_label)}</span>${arrow()}</div>
    <div class="url">${esc(timeline.facts.cta_url)}</div>
  </div>`;
}
function cardFrameV(fileUrl, { rotationDeg = -3 } = {}) {
  return `<div class="card-frame" style="transform:rotate(${rotationDeg}deg)"><img class="card-art" src="${fileUrl}" alt=""></div>`;
}

// ---------------------------------------------------------------------------
// FAMILY DOCUMENTS
// ---------------------------------------------------------------------------

function dealDropDoc(timeline, content, { background, cardArtwork }) {
  const cue = timeline.cues;
  const acc = content.accentColor || C.up;
  const cardUrl = cardArtwork?.card?.fileUrl;
  const geo = resolveCardGeometry({ rotationDeg: -3 });
  const body = `<div class="safe">
    ${zBrand()}
    <div class="vhook" style="font-size:70px;margin-top:26px;${enter("mask_up", cue.hook.start, cue.hook.dur)}">${esc(content.hookText)}</div>
    ${cardUrl
      ? `<div class="vband" style="flex-basis:430px;margin:16px 0">
           <div class="vcard" style="--cah:430px;max-width:66%;${enter("slide_up", cue.card.start, cue.card.dur)}">${cardFrameV(cardUrl, { rotationDeg: geo.rotationDeg })}</div>
         </div>`
      : `<div class="vspring"></div>`}
    <div class="vmetric" style="font-size:132px;color:${acc};${enter("scale_in", cue.metric.start, cue.metric.dur)}">${esc(content.metricValue)}</div>
    <div class="vmetric-label" style="${enter("rise", cue.metric.start + 120, 400)}">${esc(content.metricLabel || "BELOW RECENT MARKET")} · ${esc(content.tag || "eBay")}</div>
    <div class="vprice" style="margin-top:22px;${enter("rise", cue.price.start, cue.price.dur)}">
      <div class="listed"><div class="k">LISTED (USD)</div><div class="v">${fmtUsd(content.listed)}</div></div>
      <div class="ref"><div class="k">MARKET REF (USD)</div><div class="v">${fmtUsd(content.reference)}</div></div>
    </div>
    <div class="vspring"></div>
    ${zCta(timeline)}
  </div>
  ${zDisc(timeline)}`;
  return shell(timeline, body, { background });
}

function marketMoverDoc(timeline, content, { background, cardArtwork }) {
  const cue = timeline.cues;
  const acc = content.accentColor || C.up;
  const cardUrl = cardArtwork?.card?.fileUrl;
  const chart = videoChart(content.series, { color: acc, drawStartMs: cue.chartDrawStart, drawDurMs: cue.chartDrawDur });
  const body = `<div class="safe">
    ${zBrand()}
    <div class="vname" style="margin-top:28px;${enter("mask_up", cue.name.start, cue.name.dur)}">${esc(safeText(content.name, 28))}${content.set ? `<span class="set">${esc(safeText(content.set, 30))}</span>` : ""}</div>
    <div class="vmetric" style="font-size:150px;color:${acc};margin-top:10px;${enter("scale_in", cue.move.start, cue.move.dur)}">${esc(content.moveValue)}</div>
    <div class="vmetric-label" style="${enter("rise", cue.move.start + 120, 400)}">${esc(content.periodLabel)}</div>
    <div class="vband" style="flex-basis:430px;gap:40px;margin:18px 0">
      ${cardUrl ? `<div class="vcard" style="--cah:400px;flex:0 0 38%;display:flex;align-items:center;justify-content:center;${enter("slide_right", cue.card.start, cue.card.dur)}">${cardFrameV(cardUrl, { rotationDeg: -3 })}</div>` : ""}
      <div style="flex:1;min-width:0">${chart}</div>
    </div>
    <div class="vcontext" style="margin-top:10px;${enter("rise", cue.period.start, cue.period.dur)}"><span class="k">Source</span> canonical price history · start ${fmtUsd(content.firstValue)} → now ${fmtUsd(content.lastValue)}</div>
    <div class="vspring"></div>
    ${zCta(timeline)}
  </div>
  ${zDisc(timeline)}`;
  return shell(timeline, body, { background });
}

function carouselDoc(timeline, content, { background }) {
  const seq = timeline.carousel;
  const cue = timeline.cues;
  const cards = content.cards || []; // [{ fileUrl, metricValue, listed, reference, name }]
  const fanUrls = cards.slice(0, 3).map((c) => c.fileUrl);
  const rot = [-11, -1, 9];
  const dx = [-340, -40, 260];
  const zi = [0, 2, 1];

  const hookScene = `<div class="v-scenegroup" style="position:absolute;inset:0;${windowed(0, seq.hookMs)}">
    <div class="safe">
      ${zBrand()}
      <div class="vhook" style="font-size:74px;margin-top:28px">${esc(content.hookText)}</div>
      <div class="vsub" style="margin-top:14px">Every one checked against a real market reference. Swipe →</div>
      <div class="fanwrap" style="margin-top:${TOKENS.space.xl}px">
        ${fanUrls.map((u, i) => `<div class="card-frame" style="transform:translateX(calc(-50% + ${dx[i] ?? -40}px)) rotate(${rot[i] ?? 0}deg);z-index:${zi[i] ?? i}"><img class="card-art" src="${u}" alt=""></div>`).join("")}
      </div>
    </div>
  </div>`;

  const cardScenes = cards
    .map((c, i) => {
      const start = seq.hookMs + i * seq.perCardMs;
      const acc = c.accentColor || C.up;
      return `<div class="v-scenegroup" style="position:absolute;inset:0;${windowed(start, seq.perCardMs)}">
        <div class="safe">
          ${zBrand()}
          <div class="vbadge" style="margin-top:20px">Card ${i + 1} / ${cards.length}</div>
          <div class="vband" style="flex-basis:560px;margin:18px 0">
            <div class="vcard" style="--cah:560px;max-width:70%">${cardFrameV(c.fileUrl, { rotationDeg: -3 })}</div>
          </div>
          <div class="vname" style="font-size:58px">${esc(safeText(c.name, 26))}</div>
          <div class="vmetric" style="font-size:118px;color:${acc};margin-top:4px">${esc(c.metricValue)}</div>
          <div class="vmetric-label">BELOW RECENT MARKET</div>
          <div class="vprice" style="margin-top:18px">
            <div class="listed"><div class="k">LISTED (USD)</div><div class="v">${fmtUsd(c.listed)}</div></div>
            <div class="ref"><div class="k">MARKET REF (USD)</div><div class="v">${fmtUsd(c.reference)}</div></div>
          </div>
          <div class="vspring"></div>
        </div>
      </div>`;
    })
    .join("");

  const moreLine = content.moreCount > 0 ? `${content.moreCount} more under-market find${content.moreCount === 1 ? "" : "s"} on the site right now.` : "Free. We scan live eBay listings against a real market reference.";
  const closeScene = `<div class="v-scenegroup" style="position:absolute;inset:0;${windowed(timeline.ctaAtMs, seq.closeMs)}">
    <div class="safe">
      ${zBrand()}
      <div class="fill"></div>
      <div class="brandrow" style="font-size:70px;font-weight:800">${magnifier(C.brand, 58)}<span><span class="r">Pokemon</span>DealFinder</span></div>
      <div class="vsub" style="margin-top:18px;max-width:26ch;font-size:32px">${esc(moreLine)}</div>
      <div class="fill"></div>
      ${zCta(timeline)}
    </div>
  </div>`;

  const body = `${hookScene}${cardScenes}${closeScene}${zDisc(timeline)}`;
  return shell(timeline, body, { background });
}

function brandDoc(timeline, content, { background, screenshot }) {
  const cue = timeline.cues;
  const benefits = (content.benefits && content.benefits.length ? content.benefits : ["Live eBay listings", "Real price history", "Below-market finds"]).slice(0, 3);
  const bh = String(timeline.facts.hook_text || "Stop overpaying for Pokemon cards").split(" ");
  const body = `<div class="safe">
    ${zBrand()}
    <div class="vhook" style="font-size:72px;margin-top:26px;${enter("mask_up", cue.hook.start, cue.hook.dur)}"><span class="em">${esc(bh.slice(0, 2).join(" "))}</span> ${esc(bh.slice(2).join(" "))}</div>
    <div class="vband" style="flex-basis:620px;align-items:flex-start;margin:22px 0">
      <div class="vdevice" style="width:100%;max-height:100%;${enter("scale_in", cue.site.start, cue.site.dur)}">
        <div class="bar"><span class="d"></span><span class="d"></span><span class="d"></span><span class="url">${esc(content.urlLabel || "pokemondealfinder.com")}</span></div>
        <img src="${screenshot.fileUrl}" alt="">
      </div>
    </div>
    <div class="vbenefits">
      ${benefits.map((b, i) => `<div class="vbenefit" style="${enter("rise", (cue["benefit" + i] ?? cue.benefit0).start, (cue["benefit" + i] ?? cue.benefit0).dur)}">${esc(b)}</div>`).join("")}
    </div>
    <div class="vspring"></div>
    ${zCta(timeline)}
  </div>
  ${zDisc(timeline)}`;
  return shell(timeline, body, { background });
}

// ---------------------------------------------------------------------------
// PUBLIC
// ---------------------------------------------------------------------------
// content: the normalised slot values for the family (see socialVideo.mjs
// which builds these from the verified payload). layers: { background,
// cardArtwork, screenshot }.
export function renderVideoHtml(timeline, content, layers = {}) {
  const fam = timeline.creative_family;
  let html;
  if (fam === "market_mover") html = marketMoverDoc(timeline, content, layers);
  else if (fam === "hook_carousel") html = carouselDoc(timeline, content, layers);
  else if (fam === "brand_ad") html = brandDoc(timeline, content, layers);
  else html = dealDropDoc(timeline, content, layers);
  return inlineLocalAssets(html);
}

// The set of motion names an element's `--va` can carry. Kept in sync with
// FROM_STYLE and BAKE_JS; a test asserts every rendered `--va` is in here.
export const MOTIONS = Object.freeze(Object.keys(FROM_STYLE));

// BAKE_JS is injected into the render page ONCE, then called with the
// current frame time (ms) before every screenshot. It walks every element
// that carries a `--va` motion and writes the exact resolved style for
// that instant directly onto element.style - on the main thread, so there
// is no compositor-thread animation to fall out of sync. Pure arithmetic;
// no @keyframes, no Web Animations, no timers. Deterministic by
// construction: the same `t` always yields the same styles.
export const BAKE_JS = `function __vbake(t){
  function bez(x1,y1,x2,y2){
    var ax=1-3*x2+3*x1, bx=3*x2-6*x1, cx=3*x1;
    var ay=1-3*y2+3*y1, by=3*y2-6*y1, cy=3*y1;
    function cvx(u){return ((ax*u+bx)*u+cx)*u;}
    function cvy(u){return ((ay*u+by)*u+cy)*u;}
    function dvx(u){return (3*ax*u+2*bx)*u+cx;}
    return function(x){
      if(x<=0)return 0; if(x>=1)return 1;
      var u=x;
      for(var i=0;i<8;i++){ var xe=cvx(u)-x; if(Math.abs(xe)<1e-4)break; var d=dvx(u); if(Math.abs(d)<1e-6)break; u-=xe/d; }
      return cvy(u);
    };
  }
  var E = bez(.16,1,.3,1);          // default expo-out
  var E_LINE = bez(.33,0,.28,1);    // chart draw
  var E_OUT = bez(0,0,.58,1);       // ease-out (chart area fade)
  function lerp(a,b,p){return a+(b-a)*p;}
  function seg(lp, stops, easer){
    // stops: [[pos,vals...],...]; returns eased vals at lp
    for(var i=1;i<stops.length;i++){
      if(lp<=stops[i][0] || i===stops.length-1){
        var s0=stops[i-1], s1=stops[i];
        var u=(s1[0]-s0[0])>0 ? (lp-s0[0])/(s1[0]-s0[0]) : 1;
        if(u<0)u=0; if(u>1)u=1;
        var e=easer(u), out=[];
        for(var k=1;k<s0.length;k++) out.push(lerp(s0[k], s1[k], e));
        return out;
      }
    }
    return stops[stops.length-1].slice(1);
  }
  var els = document.querySelectorAll('[style*="--va"]');
  for(var n=0;n<els.length;n++){
    var el = els[n];
    var a = (el.style.getPropertyValue('--va')||'').trim();
    if(!a) continue;
    var s = parseFloat(el.style.getPropertyValue('--vs'))||0;
    var d = parseFloat(el.style.getPropertyValue('--vd'))||1;
    var lp = (t - s) / d; if(lp<0)lp=0; if(lp>1)lp=1;
    var e = E(lp);
    if(a==='mask_up'){
      el.style.opacity = e;
      el.style.clipPath = 'inset(0 0 ' + lerp(100,-6,e) + '% 0)';
    } else if(a==='rise'){
      el.style.opacity = e; el.style.transform = 'translateY(' + lerp(40,0,e) + 'px)';
    } else if(a==='scale_in'){
      el.style.opacity = e; el.style.transform = 'scale(' + lerp(0.9,1,e) + ')';
    } else if(a==='slide_up'){
      el.style.opacity = e; el.style.transform = 'translateY(' + lerp(140,0,e) + 'px)';
    } else if(a==='slide_right'){
      el.style.opacity = e; el.style.transform = 'translateX(' + lerp(-160,0,e) + 'px)';
    } else if(a==='fade'){
      el.style.opacity = E_OUT(lp);
    } else if(a==='scene'){
      var v = seg(lp, [[0,0,90],[0.11,1,0],[0.93,1,0],[1,0,-26]], E);
      el.style.opacity = v[0]; el.style.transform = 'translateY(' + v[1] + 'px)';
    } else if(a==='drift'){
      el.style.transform = 'scale(' + lerp(1.05,1.11,lp) + ') translate3d(' + lerp(0,-22,lp) + 'px,' + lerp(0,-30,lp) + 'px,0)';
    } else if(a==='draw'){
      el.style.strokeDashoffset = String(1 - E_LINE(lp));
    } else if(a==='pop'){
      var pv = seg(lp, [[0,0,0],[0.7,1.25,1],[1,1,1]], E);
      el.style.transform = 'scale(' + pv[0] + ')'; el.style.opacity = pv[1];
    }
  }
  void document.documentElement.offsetHeight;
  return els.length;
}`;
