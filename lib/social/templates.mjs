// Phase 13D.4 -> 13E.3 - the deterministic social-creative renderer.
//
// Pure string building. No network resource of any kind (fonts are
// embedded base64 from lib/social/fontData.mjs, the OpenAI background is a
// local file:// CSS background, the real card artwork is a local file://
// <img> of the exact matched TCGplayer printing). An eBay seller photo /
// i.ebayimg.com URL / any remote URL can never appear - see
// tests/scanner/social-card-artwork.test.mjs.
//
// 13E.3: the layout system moved to lib/social/creativeSpec.mjs (zones,
// compositions, safe margins, card geometry, dark visual TOKENS). This
// file is now (spec + already-verified payload) -> HTML. Versions:
//   A/B  deterministic overlay (Mode B, or over an approved data-free
//        OpenAI background) - NO <img> tag at all
//   C    A/B plus the REAL canonical card artwork for the exact printing
//   D    brand ad = background + a REAL pokemondealfinder.com screenshot
// Four creative families (deal_drop / market_mover / hook_carousel /
// brand_ad) all inherit the same spec. See docs/social-creative-system.md.

import { TOKENS, resolveCreativeSpec, resolveAccent, familyForContentType } from "./creativeSpec.mjs";
import { FONT_FACE_CSS } from "./fontData.mjs";

const C = TOKENS.color;
const S = TOKENS.space;
const T = TOKENS.type;

// --- deterministic text safety (long-name stress test) ------------------
// Word-boundary truncation, never mid-word: a name under the limit is
// untouched; over the limit it breaks at the last space before the limit
// and adds an ellipsis. CSS is a backstop only.
function safeText(value, maxChars) {
  const s = String(value ?? "");
  if (s.length <= maxChars) return s;
  const cut = s.slice(0, maxChars);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > maxChars * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

// Two-tier identity sizing so a long card name steps down instead of
// clipping. Never below the small tier - safeText is the final backstop.
function headlineSizePx(text) {
  if (String(text).length > 24) return T.titleSm.size;
  if (String(text).length > 15) return Math.round((T.title.size + T.titleSm.size) / 2);
  return T.title.size;
}

const fmtUsd = (n) =>
  `$${Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// Absolute filesystem path -> file:// URL (no node:url dependency).
// Only ever a LOCAL, approved, data-free background PNG or a LOCAL cached
// canonical card image / site screenshot - never a network resource.
function pathToFileUrl(absPath) {
  const p = String(absPath).replace(/\\/g, "/");
  const encoded = p
    .split("/")
    .map((seg) => (/^[A-Za-z]:$/.test(seg) ? seg : encodeURIComponent(seg)))
    .join("/");
  return "file://" + (encoded.startsWith("/") ? "" : "/") + encoded;
}

// --- iconography: one original line-art magnifier, one consistent stroke --
function magnifier(color = C.brand, px = 30) {
  return `<svg width="${px}" height="${px}" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <circle cx="13.5" cy="13.5" r="8.5" stroke="${color}" stroke-width="3"/>
  <line x1="20" y1="20" x2="28" y2="28" stroke="${color}" stroke-width="3" stroke-linecap="round"/>
</svg>`;
}
function arrow(color = "currentColor", px = 30) {
  return `<svg width="${px}" height="${px}" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <path d="M6 16h18M18 9l8 7-8 7" stroke="${color}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;
}

// --- shared document shell --------------------------------------------------
// Dark premium ground. An OPTIONAL approved data-free OpenAI background
// sits behind a near-opaque charcoal wash (the overlay carries 100% of
// the real facts; the model never saw one). No <img> in this path.
function shell(bodyHtml, { spec, background = null } = {}) {
  const w = spec?.canvas?.w ?? 1080;
  const h = spec?.canvas?.h ?? 1350;
  const safe = spec?.safe ?? { top: 96, right: 72, bottom: 112, left: 72 };
  const hasBg = background && background.absFile;
  const bgUrl = hasBg ? pathToFileUrl(background.absFile) : null;
  const bgLayer = hasBg
    ? `<div class="bg-photo" style='background-image: url("${bgUrl}")'></div><div class="bg-wash"></div>`
    : "";
  return `<!doctype html>
<html><head><meta charset="utf-8"><style>
  ${FONT_FACE_CSS}
  *{margin:0;padding:0;box-sizing:border-box}
  html,body{width:${w}px;height:${h}px;background:${C.bg};font-family:${T.family};color:${C.ink};
    -webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility}
  ::selection{background:${C.brand};color:${C.onBrand}}
  .canvas{position:relative;width:${w}px;height:${h}px;padding:${safe.top}px ${safe.right}px ${safe.bottom}px ${safe.left}px;
    display:flex;flex-direction:column;overflow:hidden}
  .bg-photo{position:absolute;inset:0;background-size:cover;background-position:center;z-index:0}
  .bg-wash{position:absolute;inset:0;z-index:1;
    background:radial-gradient(120% 80% at 22% 8%, rgba(11,11,13,0.72), rgba(11,11,13,0.94) 62%, ${C.bg} 100%)}
  .canvas > *{position:relative;z-index:2}

  /* header: brand lockup only - no kicker/eyebrow above the headline */
  .brandrow{display:flex;align-items:center;justify-content:space-between}
  .wordmark{display:flex;align-items:center;gap:10px;font-size:26px;font-weight:600;letter-spacing:-0.02em}
  .wordmark .pdf-red{color:${C.brand}}
  .dots{display:flex;gap:9px}
  .dot{width:10px;height:10px;border-radius:${TOKENS.radius.pill}px;background:${C.hair}}
  .dot.on{background:${C.brand};width:26px}

  /* headline / identity */
  .headline{font-weight:${T.title.weight};letter-spacing:${T.title.tracking};line-height:${T.title.leading};color:${C.ink}}
  .headline .set{display:block;font-size:${T.fine.size}px;font-weight:600;letter-spacing:0.04em;
    text-transform:uppercase;color:${C.inkFaint};margin-top:${S.xs}px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .hook{font-size:${T.hook.size}px;font-weight:${T.hook.weight};letter-spacing:${T.hook.tracking};line-height:${T.hook.leading};
    color:${C.ink};text-wrap:balance;text-transform:uppercase}
  .hook .em{color:${C.brand}}

  /* metric: one large figure + an inline phrase, not a bordered panel */
  .metric{display:flex;align-items:baseline;gap:${S.md}px;flex-wrap:wrap}
  .metric .fig{font-size:${T.display.size}px;font-weight:${T.display.weight};letter-spacing:${T.display.tracking};
    line-height:1;font-variant-numeric:tabular-nums;font-feature-settings:"tnum" 1}
  .metric.compact .fig{font-size:${T.metric.size}px;letter-spacing:${T.metric.tracking}}
  .metric .phrase{font-size:${T.label.size}px;font-weight:${T.label.weight};letter-spacing:${T.label.tracking};
    text-transform:uppercase;color:${C.inkSub}}

  /* price: labeled, listed prominent, reference dim but fully legible - NO strikethrough.
     Full-width row below the split so the labels never wrap in a narrow rail. */
  .price{display:flex;gap:${S.xxl}px;align-items:flex-end}
  .price .col .lbl{font-size:${T.label.size}px;font-weight:${T.label.weight};letter-spacing:${T.label.tracking};
    text-transform:uppercase;color:${C.inkFaint};white-space:nowrap}
  .price .col .val{font-size:${T.price.size}px;font-weight:${T.price.weight};letter-spacing:${T.price.tracking};
    font-variant-numeric:tabular-nums;font-feature-settings:"tnum" 1;margin-top:8px}
  .price .listed .val{color:${C.ink}}
  .price .ref .val{color:${C.inkFaint};font-size:${T.priceRef.size}px;font-weight:${T.priceRef.weight}}

  /* context: exactly one or two quiet factual lines */
  .context{display:flex;flex-direction:column;gap:6px}
  .context .line{font-size:${T.fine.size}px;color:${C.inkSub};line-height:${T.fine.leading}}
  .context .line .k{color:${C.inkFaint}}
  .context .line .mk{color:${C.ink};font-weight:600}

  /* CTA: a strong text line with an arrow - never a filled tappable-looking button */
  .cta{margin-top:auto;display:flex;align-items:center;gap:${S.sm}px;font-size:${T.cta.size}px;font-weight:${T.cta.weight};
    color:${C.ink};padding-top:${S.xl}px}
  .cta .u{border-bottom:3px solid ${C.brand};padding-bottom:6px}
  .cta svg{flex:none}

  /* disclosure bar: Ad label + freshness, hairline above, always present */
  .disclosure-bar{display:flex;justify-content:space-between;align-items:baseline;margin-top:${S.lg}px;
    padding-top:${S.md}px;border-top:1px solid ${C.hair}}
  .fresh{font-size:${T.fine.size}px;color:${C.inkFaint};max-width:74%}
  .disclosure{font-size:${T.fine.size}px;font-weight:700;letter-spacing:0.06em;color:${C.inkSub}}

  /* HERO SPLIT - card on one side sized by an explicit px cap (the canvas
     is a fixed 1080x1350), identity + a dominant saving figure on the
     other, both aligned to the top so the column never floats in a void.
     The split grows to fill the space between header and the price row. */
  .hero-split{display:flex;gap:${S.xl}px;align-items:stretch;flex:1;min-height:0;margin:${S.lg}px 0}
  .hero-split.right{flex-direction:row-reverse}
  .hero-split .prod{display:flex;align-items:flex-start;justify-content:center;flex:none;align-self:flex-start}
  .hero-split .rail{flex:1;display:flex;flex-direction:column;justify-content:flex-start;gap:${S.md}px;min-width:0;padding-top:${S.sm}px}
  .hero-split .rail .metric{margin-top:${S.md}px}
  .hero-split .rail .metric .fig{font-size:140px}
  .hero-split .rail .metric.compact .fig{font-size:118px}

  /* PRODUCT STACK (variant B): headline, a card bounded by an explicit px
     cap, then the saving + price. The card can never overflow onto text. */
  .stack{display:flex;flex-direction:column;flex:1;min-height:0;gap:${S.lg}px}
  .stack .card-track{flex:1;min-height:0;display:flex;align-items:flex-start;justify-content:center;padding-top:${S.md}px}
  .stack-facts{display:flex;flex-direction:column;gap:${S.md}px}

  /* card artwork (Layer 2): the FRAME may rotate + cast a shadow; the
     PIXELS are never transformed - object-fit:contain, no crop, no filter.
     Sizing is capped in px per context because the canvas is fixed. */
  .card-frame{overflow:visible;border-radius:14px;flex:none}
  .card-frame .card-art{display:block;max-width:100%;max-height:100%;width:auto;height:auto;object-fit:contain;object-position:center;border-radius:12px}
  .hero-split .prod .card-art{max-height:860px;max-width:100%}
  .stack .card-track .card-art{max-height:660px;max-width:78%}
  .card-strip{display:flex;gap:${S.md}px;align-items:center;justify-content:center;flex:1;min-height:0;margin:${S.xl}px 0}
  .card-strip .cell{flex:1;display:flex;align-items:center;justify-content:center;min-height:0}
  .card-strip .card-art{max-height:440px}

  /* chart (market_mover): a real SVG line over the plot area - it IS the content */
  .chart{width:100%;background:${C.surfaceHi};border:1px solid ${C.hair};border-radius:${TOKENS.radius.panel}px;
    padding:${S.lg}px ${S.lg}px ${S.md}px;display:flex;flex-direction:column;gap:${S.md}px;flex:1;min-height:0}
  .chart .cap{display:flex;justify-content:flex-end;font-size:${T.label.size}px;font-weight:${T.label.weight};
    letter-spacing:${T.label.tracking};text-transform:uppercase}
  .chart svg{display:block;width:100%;flex:1;min-height:0}

  /* device frame (Version D): deterministic browser chrome around a REAL screenshot */
  .device-frame{border:1px solid ${C.hair};border-radius:${TOKENS.radius.panel}px;overflow:hidden;background:${C.surface};
    box-shadow:0 40px 90px rgba(0,0,0,0.55);margin-top:${S.xl}px}
  .device-frame .bar{display:flex;align-items:center;gap:10px;padding:16px 22px;background:${C.surfaceHi};border-bottom:1px solid ${C.hair}}
  .device-frame .bar .d{width:12px;height:12px;border-radius:${TOKENS.radius.pill}px;background:${C.hair}}
  .device-frame .bar .url{flex:1;margin-left:10px;background:${C.bg};border:1px solid ${C.hair};border-radius:${TOKENS.radius.pill}px;
    padding:10px 20px;font-size:${T.fine.size}px;color:${C.inkFaint}}
  .device-frame img{display:block;width:100%;height:auto}
  .subhead{font-size:${T.body.size}px;color:${C.inkSub};line-height:${T.body.leading};max-width:24ch}

  .swipe{display:flex;align-items:center;gap:10px;font-size:${T.label.size}px;font-weight:${T.label.weight};
    letter-spacing:${T.label.tracking};text-transform:uppercase;color:${C.inkFaint};margin-top:${S.lg}px}
  .fill{flex:1;min-height:0}
</style></head>
<body><div class="canvas">${bgLayer}${bodyHtml}</div></body></html>`;
}

// --- primitives (each renders exactly one zone) ---------------------------

function zBrand({ dots = null } = {}) {
  const dotsHtml = dots
    ? `<div class="dots">${Array.from({ length: dots.total }, (_, i) => `<span class="dot${i === dots.position - 1 ? " on" : ""}"></span>`).join("")}</div>`
    : "";
  return `<div class="brandrow"><div class="wordmark">${magnifier()}<span><span class="pdf-red">Pokemon</span>DealFinder</span></div>${dotsHtml}</div>`;
}

function zHeadline({ name, set }) {
  const safe = safeText(name, 32);
  const px = headlineSizePx(safe);
  return `<div class="headline" style="font-size:${px}px">${esc(safe)}${set ? `<span class="set">${esc(safeText(set, 38))}</span>` : ""}</div>`;
}

function zHook(html, sizePx = null) {
  return `<div class="hook"${sizePx ? ` style="font-size:${sizePx}px"` : ""}>${html}</div>`;
}

// metric: "<fig>" + phrase. `accent` is the resolved { color, allowed }
// from creativeSpec.resolveAccent - a colour only when the data backs it.
function zMetric({ figure, phrase, accent, compact = false }) {
  const col = accent?.color ?? C.neutral;
  return `<div class="metric${compact ? " compact" : ""}"><span class="fig" style="color:${col}">${esc(figure)}</span><span class="phrase">${esc(phrase)}</span></div>`;
}

// price comparison - keeps the exact "LISTED (USD)" / "MARKET REF (USD)"
// labels; NO strikethrough (the reference is dimmed + smaller, never a
// line through the digits).
function zPrice({ listed, reference }) {
  return `<div class="price">
    <div class="col listed"><div class="lbl">LISTED (USD)</div><div class="val">${fmtUsd(listed)}</div></div>
    <div class="col ref"><div class="lbl">MARKET REF (USD)</div><div class="val">${fmtUsd(reference)}</div></div>
  </div>`;
}

function zContext(lines = []) {
  const l = lines.filter(Boolean).map((x) => `<div class="line">${x}</div>`).join("");
  return l ? `<div class="context">${l}</div>` : "";
}

function zCta(text, { plain = false } = {}) {
  return plain
    ? `<div class="cta"><span class="u">${esc(text)}</span></div>`
    : `<div class="cta"><span class="u">${esc(text)}</span>${arrow(C.brand, 30)}</div>`;
}

function zDisclosure({ freshnessLabel, disclosure = "Ad" }) {
  return `<div class="disclosure-bar"><div class="fresh">${esc(freshnessLabel)}</div><div class="disclosure">${esc(disclosure)}</div></div>`;
}

const DEFAULT_CARD_SHADOW = "0 40px 90px rgba(0,0,0,0.55)";
function cardFrame(fileUrl, { rotationDeg = 0, shadow } = {}) {
  const sh = shadow || DEFAULT_CARD_SHADOW;
  const style = `transform:rotate(${rotationDeg}deg);filter:drop-shadow(${sh});max-height:100%;max-width:100%`;
  return `<div class="card-frame" style="${style}"><img class="card-art" src="${fileUrl}" alt=""></div>`;
}

// deterministic real price-history mini-chart. `series` is [{ t, v }]
// already validated + downsampled by the caller (lib/social/priceMovement.mjs);
// this only draws it. No axis fabrication - min/max come from the data.
function zChart({ series, accent, periodLabel, deltaLabel }) {
  const pts = (series ?? []).filter((p) => p && Number.isFinite(Number(p.v)));
  if (pts.length < 2) return ""; // caller guarantees >=2; belt & braces
  const W = 560, H = 300, pad = 10;
  const vs = pts.map((p) => Number(p.v));
  const lo = Math.min(...vs), hi = Math.max(...vs);
  const span = hi - lo || 1;
  const x = (i) => pad + (i * (W - 2 * pad)) / (pts.length - 1);
  const y = (v) => pad + (H - 2 * pad) * (1 - (v - lo) / span);
  const d = pts.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)} ${y(Number(p.v)).toFixed(1)}`).join(" ");
  const area = `${d} L${x(pts.length - 1).toFixed(1)} ${H - pad} L${x(0).toFixed(1)} ${H - pad} Z`;
  const col = accent?.color ?? C.neutral;
  return `<div class="chart">
    <div class="cap"><span style="color:${col}">${esc(deltaLabel)}</span></div>
    <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
      <path d="${area}" fill="${col}" fill-opacity="0.12"/>
      <path d="${d}" fill="none" stroke="${col}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>
      <circle cx="${x(pts.length - 1).toFixed(1)}" cy="${y(vs[vs.length - 1]).toFixed(1)}" r="6" fill="${col}"/>
    </svg>
  </div>`;
}

// --- payload -> slide content (field names preserved for back-compat) ----

function dealSlideData(payload, { carousel = null } = {}) {
  const d = Array.isArray(payload.deal_data) ? payload.deal_data[0] : payload.deal_data;
  const accent = resolveAccent({ policy: "saving", discountPct: d.discount_pct });
  return {
    kind: "deal",
    family: "deal_drop",
    contentType: payload.content_type,
    carousel,
    accent,
    metricValue: `${Math.round(d.discount_pct * 100)}%`,
    metricLabel: "UNDER MARKET REF",
    name: d.card_name,
    set: d.card_set,
    listed: d.total_price_usd,
    reference: d.market_price,
    graded: d.is_graded ? `${d.grader ?? "Graded"} ${d.grade ?? ""}`.trim() : "Raw",
    marketplace: (d.marketplace ?? "").replace("EBAY_", "") || null,
    chips: [d.is_graded ? `${d.grader ?? "Graded"} ${d.grade ?? ""}`.trim() : "Raw", (d.marketplace ?? "").replace("EBAY_", "") || null],
    freshnessLabel: payload.freshness.label,
    ctaText: "See it on eBay",
  };
}

function justFoundSlideData(payload) {
  const base = dealSlideData(payload);
  return {
    ...base,
    family: "deal_drop",
    freshnessLabel: `Found ${payload.freshness.discoveryAgeLabel} ago · ${payload.freshness.label}`,
  };
}

// Phase 13E.3 - MARKET MOVER. `payload.movement` MUST be a real confident
// trend window (lib/social/priceMovement.mjs). No movement -> the daily
// builder never selects this family; this builder still fails closed.
function moverSlideData(payload) {
  const d = Array.isArray(payload.deal_data) ? payload.deal_data[0] : payload.deal_data;
  const m = payload.movement || null;
  const accent = resolveAccent({ policy: "movement", movement: m });
  const pct = m && Number.isFinite(Number(m.pct)) ? `${m.pct > 0 ? "+" : ""}${Math.round(m.pct * 100)}%` : "—";
  return {
    kind: "mover",
    family: "market_mover",
    contentType: payload.content_type,
    accent,
    metricValue: pct,
    metricLabel: m?.windowLabel ? `OVER THE LAST ${String(m.windowLabel).toUpperCase()}` : "PRICE MOVEMENT",
    name: d?.card_name ?? payload.subject?.display_name ?? "",
    set: d?.card_set ?? null,
    series: payload.movement?.series ?? [],
    deltaLabel: m ? `${m.pct > 0 ? "+" : ""}${Math.round(m.pct * 100)}% · ${m.direction === "up" ? "up" : "down"}` : "",
    // Market Mover is about the card's price history, not one listing's
    // freshness - so the footer speaks to the data, not to availability.
    freshnessLabel: "Based on canonical price history. Card prices can move.",
    ctaText: "Track this card",
  };
}

function coverSlideData(payload) {
  const deals = payload.deal_data;
  const n = Array.isArray(deals) ? deals.length : 0;
  return {
    kind: "cover",
    family: "hook_carousel",
    carousel: { position: 1, total: n + 2 },
    headline: `${n} Pokemon cards`,
    headlineEm: "under market today",
    supporting: "Every one checked against a real market reference. Swipe.",
    freshnessLabel: payload.freshness.label,
    ctaText: "See all today's finds",
  };
}

function closeSlideData(payload) {
  const deals = payload.deal_data;
  const n = Array.isArray(deals) ? deals.length : 0;
  return {
    kind: "close",
    family: "hook_carousel",
    carousel: { position: n + 2, total: n + 2 },
    headline: "PokemonDealFinder",
    supporting: "Free. We scan live eBay listings and compare each one to a real market reference — so you see the ones priced below it.",
    freshnessLabel: payload.freshness.label,
    ctaText: "pokemondealfinder.com",
  };
}

function spotlightSlideData(payload) {
  const s = payload.subject;
  const top = payload.deal_data[0];
  const isPokemon = payload.content_type === "pokemon_spotlight";
  const prices = payload.deal_data.map((d) => d.total_price_usd).sort((a, b) => a - b);
  const median = prices.length ? prices[Math.floor((prices.length - 1) / 2)] : null;
  const accent = resolveAccent({ policy: "saving", discountPct: top ? top.discount_pct : null });
  return {
    kind: "spotlight",
    family: "hook_carousel",
    accent,
    metricValue: top ? `${Math.round(top.discount_pct * 100)}%` : "—",
    metricLabel: "BEST CURRENT GAP",
    name: s.display_name,
    set: null,
    stats: [
      `${s.deal_count} live verified deals`,
      median != null ? `Median current listing: ${fmtUsd(median)} (USD)` : null,
    ],
    listItems: payload.deal_data.slice(0, 4).map((d) => `${safeText(d.card_name, 26)} — ${fmtUsd(d.total_price_usd)}`),
    freshnessLabel: payload.freshness.label,
    ctaText: isPokemon ? "Explore this Pokemon" : "Explore this set",
  };
}

function marketSnapshotSlideData(payload) {
  const m = payload.market_snapshot;
  const accent = resolveAccent({ policy: "saving", discountPct: m.biggest_gap_pct });
  return {
    kind: "spotlight",
    family: "market_mover",
    accent,
    metricValue: m.biggest_gap_pct != null ? `${Math.round(m.biggest_gap_pct * 100)}%` : "—",
    metricLabel: "BIGGEST GAP TODAY",
    name: m.biggest_gap_card ?? "Today's finds",
    set: null,
    stats: [
      `${m.deal_count} cards listed under market reference`,
      m.median_gap_pct != null ? `Median gap: ${Math.round(m.median_gap_pct * 100)}%` : null,
      m.median_listed_usd != null ? `Median listed: ${fmtUsd(m.median_listed_usd)} (USD)` : null,
    ],
    listItems: [],
    // the SS2 pillar string, kept verbatim for tests / captions
    pillar: "UNDER MARKET",
    freshnessLabel: payload.freshness.label,
    ctaText: "See today's deals",
  };
}

const SLIDE_DATA_BUILDERS = {
  deal_of_day: (p, opts) => dealSlideData(p, opts),
  just_found: (p) => justFoundSlideData(p),
  best_deals_found_today: (p, opts) => dealSlideData(p, opts),
  market_mover: (p) => moverSlideData(p),
  pokemon_spotlight: spotlightSlideData,
  set_spotlight: spotlightSlideData,
  market_snapshot: marketSnapshotSlideData,
};

export function buildSlideContent(payload, opts = {}) {
  const fn = SLIDE_DATA_BUILDERS[payload.content_type];
  if (!fn) throw new Error(`buildSlideContent: no template for content_type "${payload.content_type}"`);
  return fn(payload, opts);
}
export function buildCoverSlideContent(payload) {
  return coverSlideData(payload);
}
export function buildCloseSlideContent(payload) {
  return closeSlideData(payload);
}

// --- Layer 2 presentations (unchanged names for back-compat) -------------
export const CARD_PRESENTATIONS = Object.freeze(["hero_left", "hero_right", "center_card", "card_metric_panel", "multi_card"]);

// --- renderers -----------------------------------------------------------

function accentOf(s) {
  return s.accent && s.accent.color ? s.accent : { color: C.neutral, allowed: false };
}

// Deal Drop + Just Found. A = product hero split (card left ~50%, identity
// + saving stacked and vertically centred on the right); price is a
// full-width row below the split so its labels never wrap; one context
// line; CTA + disclosure pinned bottom. B = product stack: identity, a
// height-bounded card track, then saving + price - the card can never
// overflow onto the text. No card image -> a metric-led centred stack.
function renderDealSlide(s, { spec, variant, background, cardArtwork }) {
  const acc = accentOf(s);
  const metric = zMetric({ figure: s.metricValue, phrase: s.metricLabel, accent: acc, compact: variant === "B" });
  const headline = zHeadline({ name: s.name, set: s.set });
  const price = s.listed != null && s.reference != null ? zPrice({ listed: s.listed, reference: s.reference }) : "";
  const mk = s.marketplace ? `<span class="mk">${esc(s.marketplace)}</span>` : "";
  const context = zContext([
    `<span class="k">Market ref</span> — recent sold prices for this exact printing`,
    s.graded && s.marketplace ? `${esc(s.graded)} · buyable on eBay ${mk}` : s.graded ? esc(s.graded) : s.marketplace ? `Buyable on eBay ${mk}` : null,
  ]);
  const cta = zCta(s.ctaText || spec?.ctaText || "See it on eBay");
  const disc = zDisclosure({ freshnessLabel: s.freshnessLabel });
  const brand = zBrand({ dots: s.carousel ? { total: s.carousel.total, position: s.carousel.position } : null });
  const geo = spec?.card ?? { rotationDeg: -3 };

  if (cardArtwork && cardArtwork.card) {
    const frame = cardFrame(cardArtwork.card.fileUrl, { rotationDeg: geo.rotationDeg ?? -3, shadow: geo.shadow });
    if (variant === "B") {
      return shell(
        `${brand}<div class="stack">${headline}<div class="card-track">${frame}</div>
         <div class="stack-facts">${metric}${price}</div></div>${context}${cta}${disc}`,
        { spec, background }
      );
    }
    const side = spec?.composition?.productSide === "left" ? "" : " right";
    const pw = spec?.composition?.productWidthPct ?? 50;
    return shell(
      `${brand}<div class="hero-split${side}"><div class="prod" style="width:${pw}%">${frame}</div>
       <div class="rail">${headline}${metric}</div></div>
       ${price}${context}${cta}${disc}`,
      { spec, background }
    );
  }

  // No card image (Version A / B): a metric-led centred composition -
  // never a hero split with an empty product slot.
  const body =
    variant === "B"
      ? `${brand}<div class="stack-mid">${headline}${metric}</div>${price}${context}${cta}${disc}`
      : `${brand}<div class="stack-mid">${metric}${headline}</div>${price}${context}${cta}${disc}`;
  return shell(body, { spec, background });
}

// Market Mover: real card on a narrow left rail, identity + the movement
// figure above the real chart which fills the remaining height (the chart
// IS the content). Fails closed to identity + figure when no chart.
function renderMoverSlide(s, { spec, variant, background, cardArtwork }) {
  const acc = accentOf(s);
  const metric = zMetric({ figure: s.metricValue, phrase: s.metricLabel, accent: acc, compact: true });
  const headline = zHeadline({ name: s.name, set: s.set });
  const chart = zChart({ series: s.series, accent: acc, deltaLabel: s.deltaLabel });
  const context = zContext([`<span class="k">Source</span> canonical price history · recent sold references`]);
  const cta = zCta(s.ctaText || "Track this card");
  const disc = zDisclosure({ freshnessLabel: s.freshnessLabel });
  const brand = zBrand();
  const geo = spec?.card ?? { rotationDeg: -3 };

  if (!chart) {
    return shell(`${brand}<div class="stack-mid">${headline}${metric}</div>${context}${cta}${disc}`, { spec, background });
  }
  if (cardArtwork && cardArtwork.card && variant !== "B") {
    const frame = cardFrame(cardArtwork.card.fileUrl, { rotationDeg: geo.rotationDeg ?? -3, shadow: geo.shadow });
    const pw = spec?.composition?.productWidthPct ?? 40;
    return shell(
      `${brand}<div class="hero-split"><div class="prod" style="width:${pw}%">${frame}</div>
       <div class="rail" style="justify-content:flex-start;padding-top:${S.md}px">${headline}${metric}${chart}</div></div>
       ${context}${cta}${disc}`,
      { spec, background }
    );
  }
  return shell(
    `${brand}<div style="height:${S.xl}px"></div>${headline}<div style="height:${S.lg}px"></div>${metric}
     <div style="height:${S.md}px"></div>${chart}${context}${cta}${disc}`,
    { spec, background }
  );
}

// Spotlight (carousel middle slide shape) + market snapshot aggregate.
function renderSpotlightSlide(s, { spec, variant, background, cardArtwork }) {
  const acc = accentOf(s);
  const metric = zMetric({ figure: s.metricValue, phrase: s.metricLabel, accent: acc, compact: variant === "B" });
  const headline = zHeadline({ name: s.name, set: null });
  const stats = (s.stats || []).filter(Boolean).map((x) => `<div class="line">${esc(x)}</div>`).join("");
  const statsBlock = stats ? `<div class="context">${stats}</div>` : "";
  const list = (s.listItems || []).map((x) => `<div class="line">${esc(x)}</div>`).join("");
  const listBlock = list ? `<div class="context">${list}</div>` : "";
  const pillar = s.pillar ? `<div class="metric compact"><span class="phrase">${esc(s.pillar)}</span></div>` : "";
  const cta = zCta(s.ctaText || "Explore");
  const disc = zDisclosure({ freshnessLabel: s.freshnessLabel });
  const brand = zBrand();

  if (cardArtwork && cardArtwork.presentation === "multi_card" && Array.isArray(cardArtwork.cards)) {
    const geo = spec?.card ?? { rotationDeg: 0 };
    const strip = `<div class="card-strip">${cardArtwork.cards
      .slice(0, 4)
      .map((c) => `<div class="cell">${cardFrame(c.fileUrl, { rotationDeg: 0, shadow: geo.shadow })}</div>`)
      .join("")}</div>`;
    return shell(`${brand}${headline}${strip}${metric}${statsBlock}${cta}${disc}`, { spec, background });
  }
  const body =
    variant === "B"
      ? `${brand}${headline}${pillar}<div class="fill"></div>${statsBlock}${metric}${listBlock}${cta}${disc}`
      : `${brand}<div class="stack-mid">${pillar}${metric}${headline}</div>${statsBlock}${listBlock}${cta}${disc}`;
  return shell(body, { spec, background });
}

function renderCoverSlide(s, { spec, background }) {
  const brand = zBrand({ dots: s.carousel ? { total: s.carousel.total, position: s.carousel.position } : null });
  const body = `${brand}<div class="fill" style="max-height:${S.xxl}px"></div>
    ${zHook(`${esc(s.headline)} <span class="em">${esc(s.headlineEm || "")}</span>`, 116)}
    <div style="height:${S.lg}px"></div>
    <div class="subhead">${esc(s.supporting)}</div>
    <div class="fill"></div>
    <div class="swipe">${arrow(C.brand, 26)} swipe</div>
    ${zCta(s.ctaText, { plain: true })}
    ${zDisclosure({ freshnessLabel: s.freshnessLabel })}`;
  return shell(body, { spec, background });
}

function renderCloseSlide(s, { spec, background }) {
  const brand = zBrand({ dots: s.carousel ? { total: s.carousel.total, position: s.carousel.position } : null });
  const body = `${brand}<div class="fill"></div>
    <div class="wordmark" style="font-size:64px;font-weight:700">${magnifier(C.brand, 56)}<span><span class="pdf-red">Pokemon</span>DealFinder</span></div>
    <div style="height:${S.lg}px"></div>
    <div class="subhead" style="max-width:26ch;font-size:${T.body.size}px">${esc(s.supporting)}</div>
    <div class="fill"></div>
    ${zCta(s.ctaText)}
    ${zDisclosure({ freshnessLabel: s.freshnessLabel })}`;
  return shell(body, { spec, background });
}

// Version D: brand ad. `screenshot` = { fileUrl }. Deterministic browser
// chrome; the screenshot is a REAL capture; OpenAI drew none of it.
function renderBrandAdSlide({ spec, background = null, screenshot, headline, sub, ctaText, freshnessLabel, urlLabel = "pokemondealfinder.com" }) {
  const brand = zBrand();
  // The hook is uppercase by CSS; keep the emphasis on the imperative.
  const hookHtml = headline
    ? `<div class="hook" style="font-size:88px">${esc(headline)}</div>`
    : `<div class="hook" style="font-size:88px"><span class="em">Stop overpaying</span> for Pokemon cards</div>`;
  const body = `${brand}
    <div style="height:${S.xl}px"></div>
    ${hookHtml}
    <div style="height:${S.lg}px"></div>
    <div class="subhead" style="max-width:30ch;font-size:${T.body.size}px">${esc(sub || spec?.subhead || "PokemonDealFinder scans live eBay listings and compares each one to a real market reference.")}</div>
    <div style="height:${S.xl}px"></div>
    <div class="device-frame">
      <div class="bar"><span class="d"></span><span class="d"></span><span class="d"></span><span class="url">${esc(urlLabel)}</span></div>
      <img src="${screenshot.fileUrl}" alt="">
    </div>
    <div class="fill"></div>
    ${zCta(ctaText || "pokemondealfinder.com")}
    ${zDisclosure({ freshnessLabel: freshnessLabel || "Real screenshot of the live site." })}`;
  return shell(body, { spec, background });
}

// --- public entry (signature preserved) --------------------------------
// renderHtml(slide, { variant, background, cardArtwork, brandAd, target })
export function renderHtml(slide, { variant = "A", background = null, cardArtwork = null, brandAd = null, target = "ig_portrait" } = {}) {
  const family =
    slide?.family ||
    familyForContentType(slide?.contentType) ||
    (slide?.kind === "mover" ? "market_mover" : slide?.kind === "cover" || slide?.kind === "close" ? "hook_carousel" : slide?.kind === "spotlight" ? "hook_carousel" : "deal_drop");
  let spec = null;
  try {
    spec = resolveCreativeSpec({ family, variant, target });
  } catch {
    spec = resolveCreativeSpec({ family: "deal_drop", variant: "A", target: "ig_portrait" });
  }
  const ctx = { spec, variant, background, cardArtwork, brandAd };

  if (brandAd) return renderBrandAdSlide({ spec, background, ...brandAd });
  if (slide.kind === "cover") return renderCoverSlide(slide, ctx);
  if (slide.kind === "close") return renderCloseSlide(slide, ctx);
  if (slide.kind === "mover") return renderMoverSlide(slide, ctx);
  if (slide.kind === "spotlight") return renderSpotlightSlide(slide, ctx);
  return renderDealSlide(slide, ctx);
}

export { safeText, headlineSizePx, fmtUsd, cardFrame, pathToFileUrl, esc };
