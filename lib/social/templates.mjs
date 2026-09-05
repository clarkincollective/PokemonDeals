// Phase 13D.4 / 13D.4.1 - Mode B (NO card image) local preview templates.
// Pure string-building, no network resources (no external fonts, no CDN,
// no image URLs of any kind) so the renderer can load this as a bare
// file:// document. Original layout/typography/iconography - not a
// reproduction of PriceCharting's or Collectr's presentation (see the
// per-family originality notes in the CLI's printed summary and
// docs/social-creative-system.md SS32).
//
// Deliberately excludes any <img> tag entirely - there is no code path
// in this file that can render a card photo, eBay or otherwise. See
// tests/scanner/social-no-ebay-image.test.mjs.
//
// 13D.4.1 rewrite: a small set of REUSABLE PRIMITIVES (header, category
// pill, hero metric panel, identity block, price-comparison block,
// evidence chips, CTA button, footer, carousel dots) composed in two
// genuinely different orders/emphases per variant - not a font-size-only
// swap. Every design decision below traces to docs/social-creative-system.md
// SS7 (visual system) and the 13D.4.1 brief's locked brand language.

// --- spacing scale & typography hierarchy (13D.4.1 SS4) --------------------
// One 8px-based scale, used consistently instead of ad-hoc numbers:
//   8 / 12 / 14 / 16 / 24 / 28 / 40 / 48 / 56 / 64  -> gaps and padding
// Type tiers (weight is the primary hierarchy signal, not just size):
//   900 hero metric value   (84-168px, set by metricPanel's `size`)
//   900 cover headline      (128px    - the single biggest element on a slide)
//   800 identity name       (44-72px, headlineSizePx() picks the tier)
//   800 CTA / price-main    (32-52px)
//   700 pill / metric-label / chip / eyebrow (22-28px, uppercase, tracked)
//   600-400 supporting text / footer / de-emphasized reference price (22-40px)
// Every content block below the header increases its margin-top down the
// page (56 -> 48 -> 48 -> 40 -> ...) so the composition reads top-to-bottom
// with growing, not shrinking, breathing room - this is also what shrinks
// the flex-fill gap above the CTA action bar (see the .cta-button comment).
const COLORS = {
  bg: "#FAFAF8",
  ink: "#18181B", // zinc-900
  sub: "#71717A", // zinc-500
  faint: "#A1A1AA", // zinc-400 - de-emphasized reference figures
  brand: "#DC2626", // red-600, matches the existing site brand
  brandTint: "#FEF2F2", // red-50 - pill/panel backgrounds, never used at full saturation for large areas
  opportunity: "#059669", // emerald-600 - "below market", used sparingly
  opportunityTint: "#ECFDF5", // emerald-50
  graded: "#475569", // slate-600 - visually distinct from opportunity green
  gradedTint: "#F1F5F9", // slate-100
  line: "#E4E4E7",
};

const FONT_STACK = "-apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

// A simple, original line-art magnifying glass - not a reproduction of
// any specific brand's mark, matching the site's own existing
// "magnifying-glass identity" motif described in docs/social-creative-system.md.
const MAGNIFIER_SVG = (color = COLORS.brand) => `
<svg width="26" height="26" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
  <circle cx="12" cy="12" r="8" stroke="${color}" stroke-width="2.5"/>
  <line x1="18" y1="18" x2="25" y2="25" stroke="${color}" stroke-width="2.5" stroke-linecap="round"/>
</svg>`;

// --- deterministic text safety (SS14: long-name stress test) -------------
// Word-boundary truncation, never mid-word, never into ambiguity: a name
// under the limit is untouched; over the limit, it breaks at the last
// space before the limit and adds an ellipsis. CSS word-break is a
// backstop only, not the primary strategy - this function is what
// actually bounds the string before it ever reaches the template.
function safeText(value, maxChars) {
  const s = String(value ?? "");
  if (s.length <= maxChars) return s;
  const cut = s.slice(0, maxChars);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > maxChars * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

// Two-tier headline sizing so a long card name shrinks a step instead of
// clipping or wrapping into a cramped block. Never below the smaller tier
// - if still too long at the smaller size, safeText's truncation is the
// backstop.
function headlineSizePx(text) {
  if (text.length > 26) return 44;
  if (text.length > 16) return 56;
  return 72;
}

const fmtUsd = (n) => `$${Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// --- primitives ------------------------------------------------------------

function header({ pillText, pillColor = COLORS.brand, pillTint = COLORS.brandTint, carousel = null }) {
  const dots = carousel
    ? `<div class="carousel-dots">${Array.from({ length: carousel.total }, (_, i) => `<span class="dot${i === carousel.position - 1 ? " dot-active" : ""}"></span>`).join("")}</div>`
    : "";
  return `
  <div class="header-row">
    <div class="pill" style="background:${pillTint};color:${pillColor}">${pillText}</div>
    ${dots}
    <div class="brand-mark">${MAGNIFIER_SVG()}<span>PokemonDealFinder</span></div>
  </div>`;
}

// The hero metric PANEL - a tinted, bordered block so the number reads as
// a designed feature, not text floating in empty space (the single
// biggest problem identified in the 13D.4.1 visual audit).
function metricPanel({ value, label, accent, tint, size = "large" }) {
  const numSize = size === "large" ? 168 : 84;
  return `
  <div class="metric-panel" style="background:${tint};border:2px solid ${accent}22">
    <div class="metric-value" style="color:${accent};font-size:${numSize}px">${value}</div>
    <div class="metric-label">${label}</div>
  </div>`;
}

function identityBlock({ name, set, size = "large" }) {
  const safeName = safeText(name, 34);
  const px = size === "large" ? headlineSizePx(safeName) : 40;
  return `
  <div class="identity">
    <div class="identity-name" style="font-size:${px}px">${safeName}</div>
    ${set ? `<div class="identity-set">${safeText(set, 40)}</div>` : ""}
  </div>`;
}

// Listed price (bold, prominent) vs market reference (de-emphasized,
// light strikethrough - the standard, truthful "compared against"
// convention already used elsewhere on-site, never implying a fake
// "was" retail price).
//
// Both figures are always total_price_usd / market_price - the site's
// canonical USD reference values (see lib/social/payload.mjs), never a
// marketplace-native amount. A listing chip can legitimately read "GB"
// or "DE" (the eBay marketplace it's buyable from - see the scanner's
// country model) while its price is still shown in USD, so the eyebrow
// spells out "(USD)" explicitly rather than relying on the "$" glyph
// alone to disambiguate for a non-US viewer. Unlike the live site
// (which geo-converts to the viewer's local currency, marked with "≈"),
// a static generated image can't be per-viewer, so it fixes to USD and
// says so.
function priceCompare({ listed, reference }) {
  return `
  <div class="price-compare">
    <div class="price-col">
      <div class="price-eyebrow">LISTED (USD)</div>
      <div class="price-main">${fmtUsd(listed)}</div>
    </div>
    <div class="price-col price-col-ref">
      <div class="price-eyebrow">MARKET REF (USD)</div>
      <div class="price-ref">${fmtUsd(reference)}</div>
    </div>
  </div>`;
}

function evidenceChips(chips) {
  return `<div class="chips">${chips
    .filter(Boolean)
    .map((c) => `<span class="chip">${c}</span>`)
    .join("")}</div>`;
}

function ctaButton(text) {
  return `<div class="cta-button">${text} →</div>`;
}

function footer({ freshnessLabel, disclosure = "Ad" }) {
  return `
  <div class="footer">
    <div class="footer-note">${freshnessLabel}</div>
    <div class="disclosure">${disclosure}</div>
  </div>`;
}

function listRow(text) {
  return `<div class="list-row">${text}</div>`;
}

// --- per-content-type slide content builders (data -> slot values) -------
// Every value read here comes from the ALREADY-NORMALIZED payload built
// by lib/social/payload.mjs - never a raw row, never raw seller title
// text. `carousel` is optional {position, total} for a multi-slide family.

function dealSlideData(payload, { eyebrow = "FOUND", cta = "Find the deal", carousel = null } = {}) {
  const d = payload.deal_data;
  const accent = d.is_graded ? COLORS.graded : COLORS.opportunity;
  const tint = d.is_graded ? COLORS.gradedTint : COLORS.opportunityTint;
  return {
    kind: "deal",
    eyebrow,
    carousel,
    accent,
    tint,
    metricValue: `${Math.round(d.discount_pct * 100)}%`,
    metricLabel: "UNDER MARKET REF",
    name: d.card_name,
    set: d.card_set,
    listed: d.total_price_usd,
    reference: d.market_price,
    chips: [d.is_graded ? `${d.grader ?? "Graded"} ${d.grade ?? ""}`.trim() : "Raw", d.marketplace?.replace("EBAY_", "") ?? null],
    freshnessLabel: payload.freshness.label,
    ctaText: cta,
  };
}

function justFoundSlideData(payload) {
  const base = dealSlideData(payload, { eyebrow: "JUST FOUND", cta: "See verified deals" });
  return { ...base, metricLabel: "UNDER MARKET REF", freshnessLabel: `Discovered ${payload.freshness.discoveryAgeLabel} ago · ${payload.freshness.label}` };
}

function coverSlideData(payload) {
  const deals = payload.deal_data;
  return {
    kind: "cover",
    eyebrow: "TODAY'S FINDS",
    carousel: { position: 1, total: deals.length + 1 },
    accent: COLORS.opportunity,
    tint: COLORS.opportunityTint,
    headline: `${deals.length} DEALS`,
    subheadline: "FOUND TODAY",
    supporting: "All verified below our market reference",
    freshnessLabel: payload.freshness.label,
    ctaText: "See verified deals",
  };
}

function spotlightSlideData(payload) {
  const s = payload.subject;
  const top = payload.deal_data[0];
  const isPokemon = payload.content_type === "pokemon_spotlight";
  // Only stats computable from ALREADY-fetched, already-eligible current
  // inventory - never PPT historical movement, never an unmeasured
  // popularity claim (13D.4.1 SS10/SS11).
  const prices = payload.deal_data.map((d) => d.total_price_usd).sort((a, b) => a - b);
  const median = prices.length ? prices[Math.floor((prices.length - 1) / 2)] : null;
  return {
    kind: "spotlight",
    eyebrow: isPokemon ? "POKEMON WATCH" : "SET WATCH",
    carousel: null,
    accent: COLORS.opportunity,
    tint: COLORS.opportunityTint,
    metricValue: top ? `${Math.round(top.discount_pct * 100)}%` : "—",
    metricLabel: "BEST CURRENT GAP",
    name: s.display_name,
    set: null,
    stats: [
      `${s.deal_count} live verified deals`,
      median != null ? `Median current listing: ${fmtUsd(median)} (USD)` : null,
    ],
    listItems: payload.deal_data.slice(0, 4).map((d) => `${safeText(d.card_name, 28)} — ${fmtUsd(d.total_price_usd)}`),
    freshnessLabel: payload.freshness.label,
    ctaText: isPokemon ? "Explore this Pokemon" : "Explore this set",
  };
}

const SLIDE_DATA_BUILDERS = {
  deal_of_day: (p, opts) => dealSlideData(p, opts),
  just_found: (p) => justFoundSlideData(p),
  best_deals_found_today: (p, opts) => dealSlideData(p, opts), // per-deal slides reuse the same deal-card shape (see socialPreview.mjs slide loop)
  pokemon_spotlight: spotlightSlideData,
  set_spotlight: spotlightSlideData,
};

export function buildSlideContent(payload, opts = {}) {
  const fn = SLIDE_DATA_BUILDERS[payload.content_type];
  if (!fn) throw new Error(`buildSlideContent: no template for content_type "${payload.content_type}"`);
  return fn(payload, opts);
}

export function buildCoverSlideContent(payload) {
  return coverSlideData(payload);
}

// --- the shared document shell ---------------------------------------------

function shell(bodyHtml) {
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { width: 1080px; height: 1350px; background: ${COLORS.bg}; font-family: ${FONT_STACK}; }
  .canvas { width: 1080px; height: 1350px; display: flex; flex-direction: column; padding: 60px 64px; }
  .header-row { display: flex; align-items: center; justify-content: space-between; }
  .pill { font-size: 24px; font-weight: 800; letter-spacing: 0.06em; text-transform: uppercase; padding: 10px 20px; border-radius: 999px; }
  .brand-mark { display: flex; align-items: center; gap: 8px; font-size: 24px; font-weight: 700; color: ${COLORS.ink}; }
  .carousel-dots { display: flex; gap: 8px; }
  .dot { width: 10px; height: 10px; border-radius: 999px; background: ${COLORS.line}; }
  .dot-active { background: ${COLORS.brand}; }

  .metric-panel { border-radius: 32px; padding: 64px 40px; margin-top: 56px; display: flex; flex-direction: column; align-items: center; }
  .metric-value { font-weight: 900; line-height: 1; }
  .metric-label { font-size: 28px; font-weight: 700; letter-spacing: 0.04em; color: ${COLORS.sub}; margin-top: 16px; text-transform: uppercase; }

  .identity { margin-top: 48px; }
  .identity-name { font-weight: 800; color: ${COLORS.ink}; line-height: 1.08; }
  .identity-set { font-size: 32px; color: ${COLORS.sub}; margin-top: 8px; }

  .price-compare { display: flex; gap: 48px; margin-top: 48px; }
  .price-eyebrow { font-size: 22px; font-weight: 700; letter-spacing: 0.05em; color: ${COLORS.faint}; }
  .price-main { font-size: 52px; font-weight: 800; color: ${COLORS.ink}; margin-top: 4px; }
  .price-ref { font-size: 40px; font-weight: 600; color: ${COLORS.faint}; margin-top: 4px; text-decoration: line-through; text-decoration-color: ${COLORS.line}; text-decoration-thickness: 3px; }

  .chips { display: flex; gap: 14px; margin-top: 40px; flex-wrap: wrap; }
  .chip { font-size: 24px; font-weight: 700; color: ${COLORS.ink}; background: #F4F4F5; border: 2px solid ${COLORS.line}; border-radius: 999px; padding: 14px 24px; }

  .stats { margin-top: 40px; }
  .stats div { font-size: 30px; color: ${COLORS.ink}; margin-top: 16px; }

  .list-row { font-size: 28px; color: ${COLORS.ink}; margin-top: 18px; padding-bottom: 18px; border-bottom: 1px solid ${COLORS.line}; }

  /* margin-top: auto pins the CTA + footer as a fixed bottom "action bar"
     on every slide regardless of how much content sits above it (a name
     that wraps, a spotlight with 2 stats vs 4, a deal with 1 chip vs 2).
     On a fixed 1080x1350 canvas this is the only robust way to guarantee
     the CTA lands in the same place across every generated image without
     per-family height math - the same flex-fill technique the cover
     slide already uses via .cover-fill. The resulting whitespace above
     it is deliberate breathing room, not unfilled leftover space - see
     the spacing-scale comment above COLORS. */
  .cta-button { margin-top: auto; background: ${COLORS.brand}; color: white; font-size: 32px; font-weight: 800; text-align: center; border-radius: 20px; padding: 26px; }

  .footer { margin-top: 24px; padding-top: 20px; border-top: 2px solid ${COLORS.line}; display: flex; justify-content: space-between; align-items: baseline; }
  .footer-note { font-size: 22px; color: ${COLORS.sub}; max-width: 780px; }
  .disclosure { font-size: 22px; font-weight: 700; color: ${COLORS.sub}; }

  .cover-headline { font-size: 128px; font-weight: 900; color: ${COLORS.ink}; line-height: 1; margin-top: 60px; }
  .cover-sub { font-size: 72px; font-weight: 900; color: ${COLORS.opportunity}; line-height: 1; margin-top: 4px; }
  .cover-supporting { font-size: 34px; color: ${COLORS.sub}; margin-top: 28px; }
  .cover-fill { flex: 1; }
</style>
</head>
<body>
  <div class="canvas">${bodyHtml}</div>
</body>
</html>`;
}

// --- variant assemblers -----------------------------------------------------
// A = Metric Led: the hero panel comes FIRST (right after the header),
//     identity/evidence follow - the number is the one-second read.
// B = Identity Led: the card/subject identity comes FIRST and is the
//     largest element; the metric appears as a smaller supporting panel
//     alongside the price comparison, not as the dominant visual.
// These are genuinely different compositions, not a font-size swap of
// the same order (the 13D.4.1 audit finding on the 13D.4 originals).

function renderDealSlide(s, variant) {
  const head = header({ pillText: s.eyebrow, carousel: s.carousel });
  const metric = metricPanel({ value: s.metricValue, label: s.metricLabel, accent: s.accent, tint: s.tint, size: variant === "A" ? "large" : "small" });
  const identity = identityBlock({ name: s.name, set: s.set, size: variant === "A" ? "medium" : "large" });
  const price = priceCompare({ listed: s.listed, reference: s.reference });
  const chips = evidenceChips(s.chips);
  const cta = ctaButton(s.ctaText);
  const foot = footer({ freshnessLabel: s.freshnessLabel });

  const body =
    variant === "A"
      ? `${head}${metric}${identity}${price}${chips}${cta}${foot}`
      : `${head}${identity}${price}${metric}${chips}${cta}${foot}`;
  return shell(body);
}

function renderSpotlightSlide(s, variant) {
  const head = header({ pillText: s.eyebrow });
  const metric = metricPanel({ value: s.metricValue, label: s.metricLabel, accent: s.accent, tint: s.tint, size: variant === "A" ? "large" : "small" });
  const identity = identityBlock({ name: s.name, set: null, size: "large" });
  const stats = `<div class="stats">${s.stats.filter(Boolean).map((t) => `<div>${t}</div>`).join("")}</div>`;
  const list = s.listItems.map(listRow).join("");
  const cta = ctaButton(s.ctaText);
  const foot = footer({ freshnessLabel: s.freshnessLabel });

  const body =
    variant === "A"
      ? `${head}${metric}${identity}${stats}${list}${cta}${foot}`
      : `${head}${identity}${stats}${metric}${list}${cta}${foot}`;
  return shell(body);
}

function renderCoverSlide(s) {
  const head = header({ pillText: s.eyebrow, carousel: s.carousel });
  const body = `
    ${head}
    <div class="cover-headline">${s.headline}</div>
    <div class="cover-sub">${s.subheadline}</div>
    <div class="cover-supporting">${s.supporting}</div>
    <div class="cover-fill"></div>
    ${ctaButton(s.ctaText)}
    ${footer({ freshnessLabel: s.freshnessLabel })}
  `;
  return shell(body);
}

// variant: "A" (Metric Led) | "B" (Identity Led). Two controlled variants
// per family, per docs/social-creative-system.md SS20 - not dozens of
// arbitrary layouts.
export function renderHtml(slide, { variant = "A" } = {}) {
  if (slide.kind === "cover") return renderCoverSlide(slide);
  if (slide.kind === "spotlight") return renderSpotlightSlide(slide, variant);
  return renderDealSlide(slide, variant);
}

export { safeText, headlineSizePx, fmtUsd };
