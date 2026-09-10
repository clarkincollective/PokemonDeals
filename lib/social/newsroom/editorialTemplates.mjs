// Phase SOCIAL-NEWSROOM-2C - DETERMINISTIC EDITORIAL LAYOUT FAMILIES.
//
// Pure HTML string builders for the newsroom's editorial series. NO
// network resource: fonts are the same embedded base64 as
// lib/social/templates.mjs (FONT_FACE_CSS), no <img>, no card artwork, no
// OpenAI background. These are typographic editorial compositions, not
// the deal/mover/carousel creative families - each family below has a
// MATERIALLY DIFFERENT structure (dashboard / ranking / reveal / process
// / statement) so a feed of them does not read as one template (SS11).
//
// Tokens come from lib/social/creativeSpec.TOKENS so the house palette /
// type scale is shared. Every composition: one wordmark lockup, at most
// one CTA zone (often none), a >= 3-line hook ceiling, safe-zone padding.

import { TOKENS } from "../creativeSpec.mjs";
import { FONT_FACE_CSS } from "../fontData.mjs";

const C = TOKENS.color;
const T = TOKENS.type;

export const EDITORIAL_LAYOUTS = Object.freeze([
  "editorial_dashboard",
  "data_ranking",
  "story_reveal",
  "process_explainer",
  "trust_editorial",
  "compare_split",
]);

// target -> canvas + safe insets
export const EDITORIAL_TARGETS = Object.freeze({
  ig_45: { w: 1080, h: 1350, safe: { t: 104, r: 84, b: 116, l: 84 }, ratio: "4:5" },
  short_916: { w: 1080, h: 1920, safe: { t: 300, r: 96, b: 480, l: 96 }, ratio: "9:16" },
});

const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// house shell - one place for the reset + font faces + safe frame.
function shell({ target, bg = C.bg, inner }) {
  const t = EDITORIAL_TARGETS[target] ?? EDITORIAL_TARGETS.ig_45;
  return `<!doctype html><html><head><meta charset="utf-8"><style>
${FONT_FACE_CSS}
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:${t.w}px;height:${t.h}px;background:${bg};color:${C.ink};font-family:${T.family};-webkit-font-smoothing:antialiased;overflow:hidden}
.frame{position:absolute;inset:${t.safe.t}px ${t.safe.r}px ${t.safe.b}px ${t.safe.l}px;display:flex;flex-direction:column}
.eyebrow{font-size:${T.label}px;letter-spacing:.18em;text-transform:uppercase;color:${C.inkFaint};font-weight:600}
.wordmark{font-size:${T.fine}px;letter-spacing:.02em;color:${C.inkFaint};font-weight:600}
.wordmark b{color:${C.inkSub};font-weight:700}
.rule{height:1px;background:${C.hair};width:100%}
.spring{flex:1 1 auto}
.mono{font-family:${T.mono};font-variant-numeric:tabular-nums}
</style></head><body><div class="frame">${inner}</div></body></html>`;
}

const wordmark = () => `<div class="wordmark"><b>PokemonDealFinder</b> · editorial</div>`;

// SOCIAL-NEWSROOM-14B: one original line-art trading-card glyph (same
// stroke language as the house icon set - plain strokes, no fill, no
// gradient) so a purely-typographic composition still carries an
// immediate "this is about physical cards" signal at thumbnail size,
// without drawing or implying any specific real card/data. Used small
// (masthead accent) and, at low opacity, large (a deliberate watermark
// filling what was previously bare dead space - L5 repeatedly cited both
// "no visual elements related to Pokemon cards" and "too much empty
// space" for trust_editorial/process_explainer; this addresses both with
// one shape rather than two separate changes).
// no xmlns attribute - this <svg> is parsed inline inside an HTML5
// document (the house shell() below), where the HTML parser assigns the
// SVG namespace automatically; an explicit xmlns value is unnecessary and
// its literal "http://" text otherwise trips the self-contained-HTML
// scanner in tests/scanner/social-newsroom-2c.test.mjs.
const cardGlyph = (color, px) => `<svg width="${px}" height="${px}" viewBox="0 0 32 32" fill="none" aria-hidden="true">
  <rect x="6" y="2.5" width="20" height="27" rx="2.4" stroke="${color}" stroke-width="2.4"/>
  <rect x="9" y="5.6" width="14" height="11.2" rx="1.1" stroke="${color}" stroke-width="2"/>
  <line x1="9" y1="20.6" x2="23" y2="20.6" stroke="${color}" stroke-width="1.8" stroke-linecap="round"/>
  <line x1="9" y1="23.6" x2="19" y2="23.6" stroke="${color}" stroke-width="1.8" stroke-linecap="round"/>
  <line x1="9" y1="26.6" x2="15.5" y2="26.6" stroke="${color}" stroke-width="1.8" stroke-linecap="round"/>
  <path d="M23.6 3.6l.62 1.32 1.42.18-1.05.98.28 1.44-1.27-.7-1.27.7.28-1.44-1.05-.98 1.42-.18z" fill="${color}"/>
</svg>`;

// A raised icon TILE (reuses the exact panel language already used by
// editorialDashboard/compareSplit in this file - surface fill + hairline
// border) holding the glyph at full contrast. A large near-invisible
// watermark tested WORSE than nothing (identical AI-reviewer blockers
// before/after - "not clear at thumbnail size" is a literal complaint
// that low-contrast large shapes fail first under downscaling); a
// smaller, high-contrast, genuinely visible tile is the honest fix.
const cardTile = (px, glyphPx) => `<div style="width:${px}px;height:${px}px;border-radius:24px;background:${C.surface};border:1px solid ${C.hair};display:flex;align-items:center;justify-content:center;flex:none">${cardGlyph(C.brand, glyphPx)}</div>`;

// --- 1. editorial_dashboard - a stat panel grid (MARKET_SNAPSHOT) ----
// eyebrow + headline top-left; a 2x2 grid of big-number stat cards; a
// thin source line + wordmark at the foot. Cool + neutral, no red.
export function editorialDashboard({ target = "ig_45", eyebrow = "Market snapshot", headline, stats = [], source, cta = null } = {}) {
  const big = target === "short_916" ? 92 : 76;
  const cells = stats.slice(0, 4).map(
    (s) => `<div style="background:${C.surface};border:1px solid ${C.hair};border-radius:18px;padding:34px 30px;display:flex;flex-direction:column;gap:10px">
      <div class="eyebrow" style="letter-spacing:.14em">${esc(s.label)}</div>
      <div class="mono" style="font-size:${big}px;font-weight:700;line-height:1">${esc(s.value)}</div>
      ${s.sub ? `<div style="font-size:${T.fine}px;color:${C.inkFaint}">${esc(s.sub)}</div>` : ""}
    </div>`
  ).join("");
  return shell({ target, inner: `
    <div class="eyebrow">${esc(eyebrow)}</div>
    <h1 style="font-size:${target === "short_916" ? 76 : 60}px;font-weight:700;line-height:1.08;margin-top:18px;max-width:14ch">${esc(headline)}</h1>
    <div class="spring"></div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:22px">${cells}</div>
    <div class="spring"></div>
    <div class="rule"></div>
    <div style="display:flex;justify-content:space-between;align-items:center;margin-top:20px">
      <div style="font-size:${T.fine}px;color:${C.inkFaint}">${esc(source ?? "")}</div>
      ${wordmark()}
    </div>
    ${cta ? `<div style="margin-top:14px;font-size:${T.fine}px;color:${C.inkSub}">${esc(cta)}</div>` : ""}
  ` });
}

// --- 2. data_ranking - a LEAD MOVER + compact list (BIGGEST_MOVERS) ---
// SOCIAL-NEWSROOM-2D: not a flat list. The single biggest mover is the
// hero (large name + a big delta in an accent-bordered panel); the
// remaining moves are a tight secondary list, and up/down are visually
// split with a small caret + label so the ranking reads at a glance.
// Green for up, grey for down (NEVER red - mover creative was
// neutralised in 13E.11A). Right-aligned tabular deltas throughout.
export function dataRanking({ target = "ig_45", eyebrow = "7-day movers", headline, rows = [], footnote, cta = null } = {}) {
  const sorted = [...rows].sort((a, b) => Math.abs(Number(b.deltaPct)) - Math.abs(Number(a.deltaPct)));
  const lead = sorted[0] ?? { name: "-", deltaPct: 0 };
  const rest = sorted.slice(1, 5);
  const leadUp = Number(lead.deltaPct) >= 0;
  const leadCol = leadUp ? C.up : C.neutral;
  const caret = (up) => (up ? "&#9650;" : "&#9660;"); // ▲ ▼
  const restLine = rest
    .map(
      (r, i) => {
        const up = Number(r.deltaPct) >= 0;
        return `<div style="display:flex;align-items:baseline;gap:18px;padding:20px 0;${i ? `border-top:1px solid ${C.hair}` : ""}">
      <div style="flex:1;font-size:${target === "short_916" ? 36 : 30}px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(r.name)}</div>
      <div class="mono" style="font-size:${target === "short_916" ? 38 : 32}px;font-weight:700;color:${up ? C.up : C.neutral};min-width:130px;text-align:right">
        <span style="font-size:.6em;vertical-align:middle;margin-right:6px">${caret(up)}</span>${up ? "+" : ""}${Number(r.deltaPct).toFixed(1)}%
      </div>
    </div>`;
      }
    )
    .join("");
  return shell({ target, inner: `
    <div class="eyebrow">${esc(eyebrow)}</div>
    <h1 style="font-size:${target === "short_916" ? 68 : 52}px;font-weight:700;line-height:1.12;margin-top:14px;max-width:17ch">${esc(headline)}</h1>

    <div style="margin-top:${target === "short_916" ? 44 : 34}px;border-left:3px solid ${leadCol};padding:6px 0 6px 26px">
      <div class="eyebrow" style="letter-spacing:.14em;color:${C.inkFaint}">Biggest move</div>
      <div style="display:flex;align-items:flex-end;justify-content:space-between;gap:24px;margin-top:12px">
        <div style="font-size:${target === "short_916" ? 46 : 38}px;font-weight:700;line-height:1.1;max-width:12ch">${esc(lead.name)}</div>
        <div class="mono" style="font-size:${target === "short_916" ? 84 : 66}px;font-weight:800;color:${leadCol};line-height:.9;white-space:nowrap">
          ${leadUp ? "+" : ""}${Number(lead.deltaPct).toFixed(1)}%
        </div>
      </div>
    </div>

    <div style="margin-top:${target === "short_916" ? 40 : 30}px">${restLine}</div>
    <div class="spring"></div>
    <div class="rule"></div>
    <div style="display:flex;justify-content:space-between;align-items:center;margin-top:20px">
      <div style="font-size:${T.fine}px;color:${C.inkFaint};max-width:26ch">${esc(footnote ?? "")}</div>
      ${wordmark()}
    </div>
    ${cta ? `<div style="margin-top:14px;font-size:${T.fine}px;color:${C.inkSub}">${esc(cta)}</div>` : ""}
  ` });
}

// --- 3. story_reveal - one dramatic quoted frame (PRICE_STORY) --------
// big centred statement, a hairline, then a single reveal line. Lots of
// negative space. No CTA. A "1 / 1" corner mark implies a series.
export function storyReveal({ target = "ig_45", quote, reveal, mark = "01" } = {}) {
  const qz = target === "short_916" ? 88 : 72;
  return shell({ target, inner: `
    <div style="display:flex;justify-content:space-between;align-items:flex-start">
      <div class="eyebrow">A price story</div>
      <div class="mono" style="font-size:${T.label}px;color:${C.inkFaint}">${esc(mark)}</div>
    </div>
    <div class="spring"></div>
    <blockquote style="font-size:${qz}px;font-weight:700;line-height:1.14;letter-spacing:-.01em;max-width:18ch">&ldquo;${esc(quote)}&rdquo;</blockquote>
    <div class="rule" style="margin:44px 0;max-width:220px"></div>
    <div style="font-size:${target === "short_916" ? 40 : 32}px;color:${C.inkSub};line-height:1.35;max-width:24ch">${esc(reveal)}</div>
    <div class="spring"></div>
    <div style="display:flex;justify-content:flex-end">${wordmark()}</div>
  ` });
}

// --- 4. process_explainer - numbered steps (HOW_WE_FIND_DEALS) --------
// headline top; 3 numbered steps stacked with hairlines; left-aligned,
// generous leading. BRAND_ONLY footer.
export function processExplainer({ target = "ig_45", eyebrow = "How it works", headline, steps = [], cta = null } = {}) {
  const sh = target === "short_916";
  const s = steps.slice(0, 4).map((st, i) => `
    <div style="display:flex;gap:26px;padding:${sh ? 40 : 34}px 0;${i ? `border-top:1px solid ${C.hair}` : ""}">
      <div class="mono" style="font-size:${T.label}px;color:${C.brand};font-weight:700;padding-top:6px">${String(i + 1).padStart(2, "0")}</div>
      <div>
        <div style="font-size:${sh ? 42 : 34}px;font-weight:700;line-height:1.15">${esc(st.title)}</div>
        <div style="font-size:${T.fine + 4}px;color:${C.inkSub};line-height:1.4;margin-top:8px;max-width:30ch">${esc(st.detail)}</div>
      </div>
    </div>`).join("");
  return shell({ target, inner: `
    <div style="display:flex;align-items:center;gap:12px">${cardGlyph(C.inkFaint, 22)}<div class="eyebrow">${esc(eyebrow)}</div></div>
    <h1 style="font-size:${sh ? 74 : 58}px;font-weight:700;line-height:1.1;margin-top:16px;max-width:15ch">${esc(headline)}</h1>
    <div style="margin-top:30px">${s}</div>
    <div style="margin-top:${sh ? 48 : 38}px;display:flex">${cardTile(sh ? 300 : 224, sh ? 158 : 118)}</div>
    <div class="spring"></div>
    <div style="border-left:2px solid ${C.brand};padding-left:20px;margin-top:8px">
      ${wordmark()}
      ${cta ? `<div style="font-size:${T.fine}px;color:${C.inkFaint};margin-top:6px">${esc(cta)}</div>` : ""}
    </div>
  ` });
}

// --- 5. trust_editorial - an editorial statement (METHODOLOGY etc) ----
// wordmark + eyebrow pinned TOP (a masthead), a large multi-line thesis
// as the hero, a short supporting paragraph, an optional plain domain
// line low-left. Deliberately a different vertical rhythm from the other
// four families (SS11/SS13).
export function trustEditorial({ target = "ig_45", eyebrow = "Editorial", thesis, support, cta = null } = {}) {
  const sh = target === "short_916";
  const tz = sh ? 82 : 64;
  return shell({ target, inner: `
    <div style="display:flex;justify-content:space-between;align-items:baseline;padding-bottom:22px;border-bottom:1px solid ${C.hair}">
      <div style="display:flex;align-items:center;gap:12px">${cardGlyph(C.inkFaint, 24)}${wordmark()}</div>
      <div class="eyebrow">${esc(eyebrow)}</div>
    </div>
    <div style="margin-top:${sh ? 72 : 48}px">
      <h1 style="font-size:${tz}px;font-weight:700;line-height:1.12;letter-spacing:-.01em;max-width:17ch">${esc(thesis)}</h1>
      <div style="font-size:${sh ? 38 : 30}px;color:${C.inkSub};line-height:1.45;margin-top:28px;max-width:30ch">${esc(support)}</div>
      <div style="width:64px;height:4px;background:${C.brand};margin-top:${sh ? 44 : 34}px;border-radius:2px"></div>
    </div>
    <div style="margin-top:${sh ? 56 : 44}px;display:flex">${cardTile(sh ? 320 : 240, sh ? 168 : 126)}</div>
    <div class="spring"></div>
    ${cta ? `<div style="font-size:${T.fine}px;color:${C.inkFaint}">${esc(cta)}</div>` : ""}
  ` });
}

// --- 6. compare_split - a two-column A vs B contrast (EDUCATION) ------
// SOCIAL-NEWSROOM-2D: a genuinely distinct education/explainer layout for
// the "same thing, two numbers/ideas" series (asking vs sold, bid vs
// landed, printing A vs printing B). Two stacked panels with a centre
// divider + a one-line takeaway. Not a dashboard, not a statement.
export function compareSplit({ target = "ig_45", eyebrow = "Education", headline, left = {}, right = {}, takeaway, cta = null } = {}) {
  const panel = (p, accent) => `<div style="flex:1;background:${C.surface};border:1px solid ${C.hair};border-radius:18px;padding:${target === "short_916" ? 40 : 32}px 30px;display:flex;flex-direction:column;gap:12px;${accent ? `border-top:3px solid ${accent}` : ""}">
      <div class="eyebrow" style="letter-spacing:.14em">${esc(p?.label)}</div>
      <div style="font-size:${target === "short_916" ? 52 : 42}px;font-weight:800;line-height:1.05">${esc(p?.value)}</div>
      <div style="font-size:${T.fine + 2}px;color:${C.inkSub};line-height:1.4">${esc(p?.note)}</div>
    </div>`;
  return shell({ target, inner: `
    <div class="eyebrow">${esc(eyebrow)}</div>
    <h1 style="font-size:${target === "short_916" ? 70 : 54}px;font-weight:700;line-height:1.12;margin-top:16px;max-width:16ch">${esc(headline)}</h1>
    <div class="spring"></div>
    <div style="display:flex;gap:22px;align-items:stretch">
      ${panel(left, C.inkFaint)}
      <div style="display:flex;align-items:center"><div style="font-size:${T.label}px;color:${C.inkFaint};font-weight:700">vs</div></div>
      ${panel(right, C.brand)}
    </div>
    <div style="margin-top:${target === "short_916" ? 40 : 30}px;font-size:${target === "short_916" ? 38 : 30}px;font-weight:600;line-height:1.3;max-width:26ch">${esc(takeaway)}</div>
    <div class="spring"></div>
    <div class="rule"></div>
    <div style="display:flex;justify-content:space-between;align-items:center;margin-top:20px">
      ${cta ? `<div style="font-size:${T.fine}px;color:${C.inkFaint}">${esc(cta)}</div>` : `<div></div>`}
      ${wordmark()}
    </div>
  ` });
}

const DISPATCH = {
  editorial_dashboard: editorialDashboard,
  data_ranking: dataRanking,
  story_reveal: storyReveal,
  process_explainer: processExplainer,
  trust_editorial: trustEditorial,
  compare_split: compareSplit,
};

// content: the already-derived, deterministic props for the layout family.
export function renderEditorialHtml(layoutFamily, content = {}) {
  const fn = DISPATCH[layoutFamily];
  if (!fn) throw new Error(`unknown editorial layout family: ${layoutFamily}`);
  return fn(content);
}
