// Phase 13D.4 - Mode B (NO card image) local preview templates. Pure
// string-building, no network resources (no external fonts, no CDN, no
// image URLs of any kind) so the renderer can load this as a bare
// file:// document. Original layout/typography/iconography - not a
// reproduction of PriceCharting's or Collectr's presentation (see the
// per-family originality notes in the CLI's printed summary and
// docs/social-creative-system.md SS32).
//
// Deliberately excludes any <img> tag entirely - there is no code path
// in this file that can render a card photo, eBay or otherwise. See
// tests/scanner/social-no-ebay-image.test.mjs.

const COLORS = {
  bg: "#FAFAF8",
  ink: "#18181B", // zinc-900
  sub: "#71717A", // zinc-500
  brand: "#DC2626", // red-600, matches the existing site brand
  opportunity: "#059669", // emerald-600 - "below market", used sparingly
  graded: "#475569", // slate-600 - visually distinct from opportunity green
};

const FONT_STACK = "-apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

// A simple, original line-art magnifying glass - not a reproduction of
// any specific brand's mark, matching the site's own existing
// "magnifying-glass identity" motif described in docs/social-creative-system.md.
const MAGNIFIER_SVG = `
<svg width="28" height="28" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
  <circle cx="12" cy="12" r="8" stroke="${COLORS.brand}" stroke-width="2.5"/>
  <line x1="18" y1="18" x2="25" y2="25" stroke="${COLORS.brand}" stroke-width="2.5" stroke-linecap="round"/>
</svg>`;

// --- per-content-type slide content (pure data -> slot values) -----------
// Every value here is read from the ALREADY-NORMALIZED payload built by
// lib/social/payload.mjs - never a raw row, never raw seller title text.

function dealSlide(payload) {
  const d = payload.deal_data;
  return {
    eyebrow: "FOUND",
    headline: d.card_name,
    subhead: d.card_set,
    primaryNumber: `${Math.round(d.discount_pct * 100)}%`,
    primaryLabel: "below our market reference",
    secondary: [
      `Current listing: $${d.total_price_usd.toFixed(2)}`,
      `Market reference: $${d.market_price.toFixed(2)}`,
      d.is_graded ? `${d.grader ?? "Graded"} ${d.grade ?? ""}`.trim() : "Raw",
    ],
    footer: payload.freshness.label,
    accent: d.is_graded ? COLORS.graded : COLORS.opportunity,
  };
}

function justFoundSlide(payload) {
  const base = dealSlide(payload);
  return { ...base, eyebrow: "JUST FOUND", footer: `Discovered ${payload.freshness.discoveryAgeLabel} ago · ${payload.freshness.label}` };
}

function bestDealsSlide(payload) {
  const deals = payload.deal_data;
  return {
    eyebrow: "TODAY'S FINDS",
    headline: `${deals.length} deals under market`,
    subhead: "Buy It Now · below our market reference",
    primaryNumber: String(deals.length),
    primaryLabel: "live opportunities found today",
    secondary: deals.slice(0, 5).map((d) => `${d.card_name} — ${Math.round(d.discount_pct * 100)}% below reference`),
    footer: payload.freshness.label,
    accent: COLORS.opportunity,
  };
}

function spotlightSlide(payload) {
  const s = payload.subject;
  const top = payload.deal_data[0];
  return {
    eyebrow: payload.content_type === "pokemon_spotlight" ? "POKEMON WATCH" : "SET WATCH",
    headline: s.display_name,
    subhead: `${s.deal_count} live deals right now`,
    primaryNumber: top ? `${Math.round(top.discount_pct * 100)}%` : "—",
    primaryLabel: top ? "best current discount" : "",
    secondary: payload.deal_data.slice(0, 4).map((d) => `${d.card_name} — $${d.total_price_usd.toFixed(2)}`),
    footer: payload.freshness.label,
    accent: COLORS.opportunity,
  };
}

const SLIDE_BUILDERS = {
  deal_of_day: dealSlide,
  just_found: justFoundSlide,
  best_deals_found_today: bestDealsSlide,
  pokemon_spotlight: spotlightSlide,
  set_spotlight: spotlightSlide,
};

export function buildSlideContent(payload) {
  const fn = SLIDE_BUILDERS[payload.content_type];
  if (!fn) throw new Error(`buildSlideContent: no template for content_type "${payload.content_type}"`);
  return fn(payload);
}

// variant: "A" (number-led - the primary number is the largest element)
// or "B" (headline-led - the card/subject name is the largest element).
// Two controlled variants per family, per docs/social-creative-system.md
// SS20 - not dozens of arbitrary layouts.
export function renderHtml(slide, { variant = "A" } = {}) {
  const numberFirst = variant === "A";
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { width: 1080px; height: 1350px; background: ${COLORS.bg}; font-family: ${FONT_STACK}; }
  .canvas { width: 1080px; height: 1350px; display: flex; flex-direction: column; padding: 64px; }
  .eyebrow { font-size: 28px; font-weight: 700; letter-spacing: 0.08em; color: ${COLORS.brand}; text-transform: uppercase; }
  .headline { font-size: ${numberFirst ? "56px" : "84px"}; font-weight: 800; color: ${COLORS.ink}; margin-top: 16px; line-height: 1.05; order: ${numberFirst ? 3 : 1}; }
  .subhead { font-size: 32px; color: ${COLORS.sub}; margin-top: 12px; order: ${numberFirst ? 4 : 2}; }
  .art-zone { flex: 1; display: flex; align-items: center; justify-content: center; order: 2; }
  .primary-number { font-size: ${numberFirst ? "220px" : "120px"}; font-weight: 900; color: ${slide.accent}; line-height: 1; }
  .primary-label { font-size: 30px; color: ${COLORS.sub}; margin-top: 8px; text-align: center; }
  .secondary { order: 5; margin-top: 32px; }
  .secondary div { font-size: 30px; color: ${COLORS.ink}; margin-top: 10px; }
  .footer { order: 6; margin-top: auto; padding-top: 32px; border-top: 2px solid #E4E4E7; display: flex; justify-content: space-between; align-items: center; }
  .footer-note { font-size: 22px; color: ${COLORS.sub}; max-width: 760px; }
  .brand { display: flex; align-items: center; gap: 10px; font-size: 26px; font-weight: 700; color: ${COLORS.ink}; }
</style>
</head>
<body>
  <div class="canvas">
    <div class="eyebrow">${slide.eyebrow}</div>
    <div class="headline">${slide.headline}</div>
    ${slide.subhead ? `<div class="subhead">${slide.subhead}</div>` : ""}
    <div class="art-zone">
      <div>
        <div class="primary-number" style="text-align:center">${slide.primaryNumber}</div>
        ${slide.primaryLabel ? `<div class="primary-label">${slide.primaryLabel}</div>` : ""}
      </div>
    </div>
    <div class="secondary">${slide.secondary.map((s) => `<div>${s}</div>`).join("")}</div>
    <div class="footer">
      <div class="footer-note">${slide.footer}</div>
      <div class="brand">${MAGNIFIER_SVG}<span>PokemonDealFinder</span></div>
    </div>
  </div>
</body>
</html>`;
}
