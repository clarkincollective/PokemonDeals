// Phase 13E.3 - THE STRUCTURED CREATIVE SPEC.
//
// One declarative composition model that every social creative family
// inherits. Layout order, spacing, zone geometry, card scale / rotation,
// safe margins, platform geometry, and the dark visual tokens live HERE -
// never scattered as ad-hoc numbers through templates.mjs. templates.mjs
// is a pure  (spec + already-verified payload) -> HTML  function; this
// file is the design system it reads.
//
// Nothing in this module does I/O, touches OpenAI, or reads live data. It
// is evergreen STRUCTURE. (It imports `extractSpecies` from
// lib/pokemonSpecies.js - a pure name->species mapper over a static
// table, used only to keep a carousel's card identities distinct.) The
// deterministic renderer overlays 100% of the real facts; the OpenAI
// background (Layer 1) only ever receives the data-free {family,style,zone}
// enums defined in assetPrompts.mjs; the real canonical card artwork
// (Layer 2) is the exact matched printing resolved by cardArtwork.mjs.
// See docs/social-creative-system.md.

import { extractSpecies } from "../pokemonSpecies.js";

// ---------------------------------------------------------------------------
// 1. PLATFORM TARGETS  (aspect ratio / platform target)
// ---------------------------------------------------------------------------
// Each target is a fixed pixel canvas plus safe margins (regions no
// critical element may enter). Portrait 4:5 is the 13E.3 build + render
// target (Instagram feed / carousel, TikTok photo, paid portrait). The
// 9:16 targets are DECLARED so a later phase can drive Reels / TikTok
// video frames from this same spec without touching any family logic -
// 13E.3 does not render them (renders:false).

export const PLATFORM_TARGETS = Object.freeze({
  ig_portrait:   { w: 1080, h: 1350, ratio: "4:5",  safe: { top: 96,  right: 72, bottom: 112, left: 72 }, renders: true },
  ig_carousel:   { w: 1080, h: 1350, ratio: "4:5",  safe: { top: 96,  right: 72, bottom: 112, left: 72 }, renders: true },
  paid_portrait: { w: 1080, h: 1350, ratio: "4:5",  safe: { top: 96,  right: 72, bottom: 112, left: 72 }, renders: true },
  reel_9x16:     { w: 1080, h: 1920, ratio: "9:16", safe: { top: 260, right: 96, bottom: 440, left: 96 }, renders: false },
  tiktok_9x16:   { w: 1080, h: 1920, ratio: "9:16", safe: { top: 240, right: 96, bottom: 500, left: 96 }, renders: false },
});
export const DEFAULT_TARGET = "ig_portrait";
export const RENDERABLE_TARGETS = Object.freeze(
  Object.keys(PLATFORM_TARGETS).filter((k) => PLATFORM_TARGETS[k].renders)
);

// ---------------------------------------------------------------------------
// 2. DARK VISUAL TOKENS
// ---------------------------------------------------------------------------
// Foundation is charcoal / near-black premium surface; PokemonDealFinder
// red is the single accent; green appears ONLY when a real positive deal
// metric backs it (see resolveAccent). The real card artwork supplies the
// rest of the colour. No gradients-as-emphasis, no glass-as-decoration.

export const TOKENS = Object.freeze({
  color: {
    bg:        "#0B0B0D", // near-black page ground
    surface:   "#161619", // raised panel (used sparingly, never nested)
    surfaceHi: "#1F1F24", // hover/active-weight surface, chart plot area
    hair:      "#2A2A31", // 1px hairlines only
    ink:       "#FAFAFA", // primary text - high contrast on bg (>=17:1)
    inkSub:    "#B4B4BD", // secondary text on dark (>=7:1)
    inkFaint:  "#8A8A94", // tertiary / de-emphasised reference figures (>=4.6:1)
    brand:     "#F0322E", // PokemonDealFinder red, tuned +lightness for dark ground
    brandDeep: "#C21B18", // red pressed / lower half of the CTA fill
    up:        "#3FCF8E", // positive movement / genuine saving - green
    down:      "#F0322E", // negative movement - reuses brand red (never "loss green")
    neutral:   "#8A8A94", // metric shown with no directional colour (data doesn't back one)
    onBrand:   "#FFFFFF", // text on the red CTA
  },
  // 8px base scale. Named steps, referenced by role in COMPOSITIONS.
  space: { xs: 8, sm: 12, md: 16, lg: 24, xl: 36, xxl: 56, xxxl: 80 },
  radius: { card: 16, panel: 20, pill: 999, cta: 18 },
  // Type: weight AND size both step. Display capped ~6rem (96px) per the
  // 4:5 frame; tracking tightens as size grows (floor -0.04em).
  type: {
    family: "'Geist', -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    mono:   "'Geist Mono', ui-monospace, 'SF Mono', 'Roboto Mono', Menlo, monospace",
    hook:      { size: 132, weight: 800, tracking: "-0.045em", leading: 0.98 }, // carousel cover line
    display:   { size: 96,  weight: 800, tracking: "-0.04em",  leading: 1.0 },  // metric value (deal_drop A)
    metric:    { size: 68,  weight: 800, tracking: "-0.03em",  leading: 1.0 },  // metric value (compact)
    title:     { size: 60,  weight: 700, tracking: "-0.03em",  leading: 1.06 }, // card / subject identity
    titleSm:   { size: 44,  weight: 700, tracking: "-0.025em", leading: 1.1 },  // long-name tier
    price:     { size: 52,  weight: 700, tracking: "-0.02em",  leading: 1.0 },  // listed price (mono figures)
    priceRef:  { size: 34,  weight: 500, tracking: "-0.01em",  leading: 1.0 },  // market reference
    cta:       { size: 34,  weight: 700, tracking: "0",        leading: 1.0 },
    label:     { size: 22,  weight: 600, tracking: "0.10em",   leading: 1.1 },  // uppercase micro-labels
    body:      { size: 30,  weight: 400, tracking: "-0.005em", leading: 1.35 },
    fine:      { size: 22,  weight: 400, tracking: "0",        leading: 1.3 },  // disclosure / freshness
  },
});

// Card artwork geometry bounds (the FRAME only is ever transformed;
// object-fit:contain keeps the pixels un-cropped, aspect intact).
export const CARD_GEOMETRY = Object.freeze({
  minScale: 0.7,
  maxScale: 1.0,
  maxRotationDeg: 4, // |rotation| never exceeds this - a card past ~4deg reads as a gimmick
  shadow: {
    deep: "0 40px 90px rgba(0,0,0,0.55)",
    soft: "0 24px 60px rgba(0,0,0,0.45)",
  },
});

// ---------------------------------------------------------------------------
// 3. ZONE VOCABULARY
// ---------------------------------------------------------------------------
// Every element on a creative belongs to exactly one zone. Families
// declare which zones they use; compositions declare the order.

export const ZONES = Object.freeze([
  "brand",      // wordmark + magnifier mark - always present, top row
  "product",    // real canonical card artwork (Layer 2) - deal_drop / market_mover / carousel
  "headline",   // card/subject identity, or the carousel hook line
  "metric",     // the ONE-SECOND number: % below market reference, or movement %
  "price",      // listed price vs market reference
  "chart",      // deterministic real price-history mini-chart (market_mover only)
  "screenshot", // real pokemondealfinder.com capture in a device frame (brand_ad only)
  "context",    // 1-2 supporting factual lines (grade, marketplace, period, what a "market reference" is)
  "cta",        // one concise call to action - never styled as a tappable button on a static image
  "disclosure", // "Ad" label + freshness line - always present, bottom row
]);

// ---------------------------------------------------------------------------
// 4. COMPOSITIONS
// ---------------------------------------------------------------------------
// A composition is a named layout: the vertical/rail order of zones plus
// the structural rule (split rail, centred stack, cover, ...). Spacing
// between successive content zones grows down the page (md -> lg -> xl) so
// the eye reads top-to-bottom with increasing air, and the CTA + disclosure
// are pinned as a fixed bottom bar on every composition.

export const COMPOSITIONS = Object.freeze({
  // Card is the hero on a left rail; identity / metric / price stack on
  // the right; CTA + disclosure pinned bottom full-width.
  product_hero_split: {
    kind: "split",
    productSide: "left",
    productWidthPct: 52,
    rail: ["headline", "metric", "price", "context"],
    order: ["brand", "product", "headline", "metric", "price", "context", "cta", "disclosure"],
  },
  // Big centred card; the saving sits immediately under it (tight), then
  // identity, then price; CTA pinned bottom. Used as variant B and as the
  // thin-inventory fallback - never leaves dead centre space.
  product_stack: {
    kind: "stack",
    productWidthPct: 60,
    order: ["brand", "headline", "product", "metric", "price", "context", "cta", "disclosure"],
  },
  // Card on a narrow left rail, the real price-history chart fills the
  // right; the movement metric labels the chart. Market Mover only.
  product_chart_split: {
    kind: "split",
    productSide: "left",
    productWidthPct: 42,
    rail: ["headline", "metric", "chart", "context"],
    order: ["brand", "product", "headline", "metric", "chart", "context", "cta", "disclosure"],
  },
  // Carousel slide 1: one oversized hook line, an explicit swipe
  // affordance, almost nothing else.
  hook_cover: {
    kind: "cover",
    order: ["brand", "headline", "context", "swipe", "cta", "disclosure"],
  },
  // Carousel final slide: wordmark lockup, one-line value proposition, CTA.
  hook_close: {
    kind: "close",
    order: ["brand", "headline", "context", "cta", "disclosure"],
  },
  // Brand / conversion ad (Version D): hook headline, real site screenshot
  // in a deterministic browser frame, one-line explanation, CTA.
  brand_ad: {
    kind: "brandad",
    order: ["brand", "headline", "context", "screenshot", "cta", "disclosure"],
  },
});

// Gap (from TOKENS.space keys) applied ABOVE each content zone when it
// follows another. brand/disclosure are fixed rows and excluded.
export const ZONE_GAP_ABOVE = Object.freeze({
  product: "xl",
  headline: "xl",
  metric: "lg",
  price: "lg",
  chart: "lg",
  context: "lg",
  screenshot: "xl",
  swipe: "lg",
  cta: "auto", // margin-top:auto - pins CTA+disclosure to the bottom
});

// ---------------------------------------------------------------------------
// 5. FAMILY SPECS
// ---------------------------------------------------------------------------

export const FAMILIES = Object.freeze(["deal_drop", "market_mover", "hook_carousel", "brand_ad"]);

export const FAMILY_SPECS = Object.freeze({
  deal_drop: {
    label: "Deal Drop",
    purpose: "Drive one qualified click to a genuine live under-market listing.",
    composition: "product_hero_split", // variant A
    altComposition: "product_stack",   // variant B
    zones: ["brand", "product", "headline", "metric", "price", "context", "cta", "disclosure"],
    oneSecondRead: ["product", "metric", "price", "cta"],
    card: { scale: 1.0, rotationDeg: -3, shadow: "deep" },
    background: { density: "low", lighting: "top-left" },
    text: { density: "medium" },
    accentPolicy: "saving",          // green ONLY, and only from a real positive discount_pct
    metricLabel: "below market reference",
    ctaText: "See it on eBay",       // factual, not a button verb; the caption carries the link
    contentTypes: ["deal_of_day", "just_found"],
    assetCategory: "deal_intelligence",
  },
  market_mover: {
    label: "Market Mover",
    purpose: "Shareable market context - one real card's real price movement over a stated period.",
    composition: "product_chart_split",
    altComposition: "product_stack",
    zones: ["brand", "product", "headline", "metric", "chart", "context", "cta", "disclosure"],
    oneSecondRead: ["product", "metric", "chart"],
    card: { scale: 0.86, rotationDeg: -3, shadow: "deep" },
    background: { density: "low", lighting: "top-left" },
    text: { density: "low" },
    accentPolicy: "movement",        // up=green / down=red, ONLY from confidentTrendWindows
    requiresRealHistory: true,       // no confident window -> fail closed (caller falls back / skips)
    metricLabel: "over the last",    // completed with the real window label
    ctaText: "Track this card",
    contentTypes: ["market_mover"],
    assetCategory: "market_watch",
  },
  hook_carousel: {
    label: "Hook Carousel",
    purpose: "Stop scroll on slide 1, earn swipes, close on the brand + CTA.",
    coverComposition: "hook_cover",
    slideComposition: "product_hero_split",
    closeComposition: "hook_close",
    zones: ["brand", "headline", "product", "metric", "price", "context", "cta", "disclosure"],
    oneSecondRead: ["headline"],
    card: { scale: 0.82, rotationDeg: -3, shadow: "deep" },
    background: { density: "medium", lighting: "top" },
    text: { density: "low" },
    accentPolicy: "saving",
    ctaText: "See it on eBay",
    contentTypes: ["best_deals_found_today", "pokemon_spotlight", "set_spotlight"],
    assetCategory: "deal_intelligence",
    sequence: { minSlides: 3, maxSlides: 6 }, // cover + >=1 card slide + close
  },
  brand_ad: {
    label: "Brand / Conversion Ad",
    purpose: "Explain PokemonDealFinder fast - stop overpaying; we scan eBay and compare to market references.",
    composition: "brand_ad",
    zones: ["brand", "headline", "context", "screenshot", "cta", "disclosure"],
    oneSecondRead: ["headline"],
    card: null,
    background: { density: "low", lighting: "top" },
    text: { density: "medium" },
    accentPolicy: "none",
    requiresRealScreenshot: true,    // Version D - no cached real capture -> fail closed
    hook: "STOP OVERPAYING FOR POKEMON CARDS", // ASCII "Pokemon" per the brand rule (PRODUCT.md)
    subhead: "PokemonDealFinder scans live eBay listings and compares each one to a real market reference, so you see the ones priced below it.",
    ctaText: "pokemondealfinder.com",
    contentTypes: ["brand_ad"],
    assetCategory: "trust_verification",
  },
});

// ---------------------------------------------------------------------------
// 6. RESOLUTION + GUARDS
// ---------------------------------------------------------------------------

export function familySpec(family) {
  const s = FAMILY_SPECS[family];
  if (!s) throw new Error(`creativeSpec: unknown family "${family}". Known: ${FAMILIES.join(", ")}`);
  return s;
}

// The content_type on a payload -> its creative family.
const CONTENT_TYPE_TO_FAMILY = (() => {
  const m = {};
  for (const fam of FAMILIES) for (const ct of FAMILY_SPECS[fam].contentTypes) m[ct] = fam;
  return Object.freeze(m);
})();
export function familyForContentType(contentType) {
  return CONTENT_TYPE_TO_FAMILY[contentType] ?? null;
}

// Clamp a card geometry request into the allowed envelope.
export function resolveCardGeometry(req = {}) {
  const scale = Math.min(CARD_GEOMETRY.maxScale, Math.max(CARD_GEOMETRY.minScale, Number(req.scale ?? 1)));
  let rot = Number(req.rotationDeg ?? 0);
  if (!Number.isFinite(rot)) rot = 0;
  rot = Math.max(-CARD_GEOMETRY.maxRotationDeg, Math.min(CARD_GEOMETRY.maxRotationDeg, rot));
  const shadow = CARD_GEOMETRY.shadow[req.shadow] ?? CARD_GEOMETRY.shadow.soft;
  return { scale, rotationDeg: rot, shadow };
}

// The accent-colour decision. This is a GUARD, not a lookup: a colour is
// only returned when the real data supports the claim it would make.
//   policy "saving"   -> green only when discountPct is a real number > 0
//   policy "movement" -> green (up) / red (down) only when `movement` is a
//                        real confident trend { pct, direction } from
//                        lib/priceHistory.confidentTrendWindows; anything
//                        else -> neutral, no directional colour
//   policy "none"     -> always neutral
export function resolveAccent({ policy, discountPct = null, movement = null }) {
  if (policy === "saving") {
    const d = Number(discountPct);
    if (Number.isFinite(d) && d > 0) {
      return { color: TOKENS.color.up, kind: "saving", allowed: true, reason: `real positive discount ${(d * 100).toFixed(1)}%` };
    }
    return { color: TOKENS.color.neutral, kind: "neutral", allowed: false, reason: "no real positive discount - metric shown without directional colour" };
  }
  if (policy === "movement") {
    const dir = movement && movement.direction;
    const pct = movement && Number(movement.pct);
    if ((dir === "up" || dir === "down") && Number.isFinite(pct)) {
      return {
        color: dir === "up" ? TOKENS.color.up : TOKENS.color.down,
        kind: dir === "up" ? "up" : "down",
        allowed: true,
        reason: `confident ${dir} trend ${(pct * 100).toFixed(1)}%`,
      };
    }
    return { color: TOKENS.color.neutral, kind: "neutral", allowed: false, reason: "no confident trend window - no directional colour" };
  }
  return { color: TOKENS.color.neutral, kind: "neutral", allowed: false, reason: "policy=none" };
}

// Resolve a fully-concrete spec the renderer consumes.
//   family     - one of FAMILIES
//   variant    - "A" (primary composition) | "B" (altComposition)
//   target     - a PLATFORM_TARGETS key (default ig_portrait)
//   slide      - for hook_carousel: { index, count } -> picks cover /
//                slide / close composition; ignored for other families
export function resolveCreativeSpec({ family, variant = "A", target = DEFAULT_TARGET, slide = null } = {}) {
  const spec = familySpec(family);
  const tgt = PLATFORM_TARGETS[target];
  if (!tgt) throw new Error(`creativeSpec: unknown target "${target}". Known: ${Object.keys(PLATFORM_TARGETS).join(", ")}`);

  let compositionKey;
  if (family === "hook_carousel") {
    const idx = slide?.index ?? 0;
    const count = slide?.count ?? 1;
    compositionKey =
      idx === 0 ? spec.coverComposition : idx >= count - 1 ? spec.closeComposition : spec.slideComposition;
  } else {
    compositionKey = variant === "B" && spec.altComposition ? spec.altComposition : spec.composition;
  }
  const composition = COMPOSITIONS[compositionKey];
  if (!composition) throw new Error(`creativeSpec: family "${family}" resolved to unknown composition "${compositionKey}"`);

  return Object.freeze({
    family,
    label: spec.label,
    variant,
    target,
    canvas: { w: tgt.w, h: tgt.h, ratio: tgt.ratio, renders: tgt.renders },
    safe: tgt.safe,
    compositionKey,
    composition,
    zones: spec.zones,
    oneSecondRead: spec.oneSecondRead,
    card: spec.card ? resolveCardGeometry(spec.card) : null,
    background: spec.background,
    text: spec.text,
    accentPolicy: spec.accentPolicy,
    metricLabel: spec.metricLabel ?? null,
    ctaText: spec.ctaText ?? null,
    hook: spec.hook ?? null,
    subhead: spec.subhead ?? null,
    requiresRealHistory: Boolean(spec.requiresRealHistory),
    requiresRealScreenshot: Boolean(spec.requiresRealScreenshot),
    sequence: spec.sequence ?? null,
    tokens: TOKENS,
  });
}

// ---------------------------------------------------------------------------
// 6b. CONVERSION LAYER (13E.3D) - website-first CTAs, truthful hook engine,
//     content intent, and deterministic trackable identifiers.
// ---------------------------------------------------------------------------
// Everything here is deterministic and derives ONLY from already-verified
// payload fields. No fabricated destination, no exaggerated claim, no
// fake scarcity. The website (never the creative) owns the eBay affiliate
// click.

// FNV-1a 32-bit - tiny, dependency-free, stable across platforms/runs.
// Used only for deterministic (non-random) rotation of hook variants and
// for compact content_id hashes.
function fnv1a(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < String(str).length; i++) {
    h ^= String(str).charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h >>> 0;
}

export const CONTENT_GOALS = Object.freeze(["REACH", "ENGAGEMENT", "TRUST", "CONVERSION", "BRAND"]);

// content_type -> the primary goal of that creative. Lets a later mix
// planner keep the feed from becoming all-affiliate.
export const CONTENT_GOAL_FOR = Object.freeze({
  deal_of_day: "CONVERSION",
  just_found: "CONVERSION",
  best_deals_found_today: "REACH",
  pokemon_spotlight: "REACH",
  set_spotlight: "REACH",
  market_mover: "ENGAGEMENT",
  market_snapshot: "TRUST",
  brand_ad: "BRAND",
});
export function contentGoalFor(contentType) {
  return CONTENT_GOAL_FOR[contentType] ?? "ENGAGEMENT";
}

// The deterministic CTA intents. Each is website-first: the visitor lands
// on PokemonDealFinder.com and the site handles the affiliate hop.
export const CTA_INTENTS = Object.freeze({
  live_deal:       "SEE THE LIVE DEAL",
  card_history:    "FULL PRICE HISTORY",
  compare_live:    "COMPARE LIVE LISTINGS",
  todays_deals:    "SEE TODAY'S DEALS",
  all_live_finds:  "SEE ALL LIVE FINDS",
});
export const SITE_HOST = "PokemonDealFinder.com";

// Choose a CTA from the real content + the real destination route. Returns
// { variant, label, url } - `url` is only ever a real on-site route.
export function resolveCta({ family, contentType, route } = {}) {
  const r = typeof route === "string" && route.startsWith("/") ? route : "/deals";
  let variant;
  if (family === "brand_ad") variant = "todays_deals";
  else if (family === "market_mover") variant = "card_history";
  else if (family === "hook_carousel") variant = r === "/deals" || r === "/best-finds" ? "all_live_finds" : "compare_live";
  else if (contentType === "just_found") variant = "live_deal";
  else if (r.startsWith("/deals/")) variant = "live_deal";
  else if (r.startsWith("/cards/")) variant = "card_history";
  else if (r.startsWith("/pokemon/") || r.startsWith("/sets/")) variant = "compare_live";
  else variant = "todays_deals";
  return {
    variant,
    label: CTA_INTENTS[variant],
    url: `${SITE_HOST}${r === "/" ? "" : r}`,
  };
}

// --- Deal Drop hook engine ------------------------------------------------
// Pick the STRONGEST truthful angle for one deal. Every branch is gated on
// the data actually supporting it; nothing is exaggerated.
//   freshness      - only for just_found (it genuinely was just found)
//   price_contrast - only when the reference is a big number and the
//                    listing is well under it ("$894 CARD. LISTED FOR $350.")
//   absolute_saving- only when the $ gap is materially large
//   percent_gap    - the always-valid default
export const DEAL_HOOK_VARIANTS = Object.freeze(["freshness", "price_contrast", "absolute_saving", "percent_gap"]);

const PRICE_CONTRAST_MIN_REF = 100;   // the "$X CARD" figure must be worth saying
const PRICE_CONTRAST_MIN_RATIO = 1.8; // reference / listed
const ABS_SAVING_MIN = 60;            // $ gap worth leading with

const money0 = (n) => `$${Math.round(Number(n)).toLocaleString("en-US")}`;

export function selectDealHook(deal, { contentType } = {}) {
  const listed = Number(deal?.total_price_usd ?? deal?.total_price);
  const ref = Number(deal?.market_price);
  const pct = Number(deal?.discount_pct);
  const okBase = Number.isFinite(listed) && listed > 0 && Number.isFinite(ref) && ref > 0 && Number.isFinite(pct) && pct > 0;
  const pctTxt = okBase ? `${Math.round(pct * 100)}%` : null;
  const gap = okBase ? ref - listed : 0;

  if (!okBase) {
    return { variant: "percent_gap", text: "BELOW RECENT MARKET", supported: false };
  }
  if (contentType === "just_found") {
    return { variant: "freshness", text: `JUST FOUND: ${pctTxt} BELOW RECENT MARKET`, supported: true };
  }
  if (ref >= PRICE_CONTRAST_MIN_REF && listed >= 1 && ref / listed >= PRICE_CONTRAST_MIN_RATIO) {
    return { variant: "price_contrast", text: `${money0(ref)} CARD. LISTED FOR ${money0(listed)}.`, supported: true };
  }
  if (gap >= ABS_SAVING_MIN) {
    return { variant: "absolute_saving", text: `SAVE ${money0(gap)} VS RECENT MARKET`, supported: true };
  }
  return { variant: "percent_gap", text: `WE FOUND THIS ${pctTxt} BELOW RECENT MARKET`, supported: true };
}

// --- Hook Carousel cover hook -------------------------------------------
// Truthful, generated from the REAL distinct count. Deterministic variant
// per (count, rotationKey) so the feed varies without any randomness.
export const CAROUSEL_HOOK_TEMPLATES = Object.freeze([
  (n) => `${n} POKEMON CARD${n === 1 ? "" : "S"} WE FOUND BELOW MARKET`,
  (n) => `TODAY'S ${n} BIGGEST POKEMON CARD DEAL${n === 1 ? "" : "S"}`,
  (n) => `THESE ${n} EBAY LISTING${n === 1 ? "" : "S"} LOOK UNDERPRICED`,
  (n) => `${n} CARD${n === 1 ? "" : "S"} SELLING BELOW RECENT MARKET`,
]);
export function selectCarouselHook({ count, rotationKey = "" } = {}) {
  const n = Math.max(1, Number(count) || 1);
  const idx = fnv1a(`carousel-hook:${n}:${rotationKey}`) % CAROUSEL_HOOK_TEMPLATES.length;
  return { variant: `cover_${idx}`, text: CAROUSEL_HOOK_TEMPLATES[idx](n), count: n };
}

// --- Deterministic trackable identifiers (13E.3D §8) --------------------
// Prepared for 13E.5 measurement. NO analytics/distribution wiring here -
// these are stable strings a later phase can attribute website clicks to.
function slugify(s) {
  return String(s ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "x";
}
// tiny stable base36 hash for a compact content_id suffix
function shortHash(s) {
  return (fnv1a(String(s)) >>> 0).toString(36).padStart(7, "0").slice(0, 7);
}
export function buildCreativeIdentifiers({ family, contentType, subject, generatedAt, variant = "A", hookVariant = null, ctaVariant = null } = {}) {
  const day = String(generatedAt ?? "").slice(0, 10) || "0000-00-00";
  const subj = slugify(subject);
  const family_ = family ?? familyForContentType(contentType) ?? "creative";
  const content_id = `pdf-${slugify(family_)}-${slugify(contentType ?? family_)}-${subj}-${day.replace(/-/g, "")}-${variant}-${shortHash(`${family_}|${contentType}|${subj}|${day}|${variant}|${hookVariant}|${ctaVariant}`)}`;
  return Object.freeze({
    content_id,
    content_goal: contentGoalFor(contentType),
    creative_family: family_,
    hook_variant: hookVariant,
    cta_variant: ctaVariant,
  });
}

// ---------------------------------------------------------------------------
// 7. CAROUSEL SEQUENCING
// ---------------------------------------------------------------------------
// Deterministic, reusable ordering for a Hook Carousel: a cover, then one
// card slide per real deal (capped), then a fixed close slide. No random
// order, no hard-coded post - the same inputs always produce the same
// sequence.

// 13E.3C - a carousel that claims "N Pokemon cards" must contain N
// DISTINCT card identities. This sequencer:
//   * never shows the same exact printing twice (dedupe by the P0.3-strict
//     tcgplayer id, else a normalised name|set key; a row with no usable
//     identity is dropped, never shown)
//   * prefers distinct Pokemon (species) - a same-species / different-
//     printing card is only used as a filler when there aren't enough
//     distinct species to fill the carousel
//   * is deterministic (input order preserved through both passes, no sort,
//     no randomness)
//   * does NOT invent replacements and does NOT re-gate deal quality
//     (the caller passes already-eligible rows)
//   * if there aren't enough distinct cards, the carousel is SHORTER -
//     `distinctCount` is the truthful number the cover hook must state,
//     and the cover's slide count equals the real content-slide count
// The final close (brand + CTA) slide is unchanged.
export function buildCarouselSequence(deals, { minSlides, maxSlides, speciesOf } = {}) {
  const seq = FAMILY_SPECS.hook_carousel.sequence;
  const min = minSlides ?? seq.minSlides;
  const max = maxSlides ?? seq.maxSlides;
  const maxCardSlides = Math.max(1, max - 2); // reserve cover + close
  const rows = (Array.isArray(deals) ? deals : []).filter(Boolean);

  const printKey = (d) => {
    const id = d?.card_tcgplayer_id != null ? String(d.card_tcgplayer_id).trim() : "";
    if (/^\d+$/.test(id)) return "tcg:" + id;
    const n = String(d?.card_name ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    const s = String(d?.card_set ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    return n ? `ns:${n}|${s}` : null;
  };
  const spec = typeof speciesOf === "function" ? speciesOf : (name) => extractSpecies(name);
  const specKey = (d) => {
    try {
      const s = spec(d?.card_name ?? "");
      return s ? String(s).toLowerCase() : null;
    } catch {
      return null;
    }
  };

  const seenPrint = new Set();
  const seenSpecies = new Set();
  const primary = []; // distinct printing AND distinct species
  const fillers = []; // distinct printing, species already used
  for (const d of rows) {
    const pk = printKey(d);
    if (!pk || seenPrint.has(pk)) continue; // never repeat an exact printing; drop unidentifiable rows
    seenPrint.add(pk);
    const sk = specKey(d);
    if (sk && seenSpecies.has(sk)) {
      fillers.push(d);
      continue;
    }
    if (sk) seenSpecies.add(sk);
    primary.push(d);
  }
  const chosen = [...primary, ...fillers].slice(0, maxCardSlides);

  const content = chosen.map((deal, i) => ({ kind: "card", index: i + 1, deal }));
  const slides = [
    { kind: "cover", index: 0 },
    ...content,
    { kind: "close", index: content.length + 1 },
  ];
  const distinctCount = content.length; // == distinct card identities actually shown == the cover's truthful "N"
  const distinctPrintings = seenPrint.size;
  const ok = distinctCount >= Math.max(1, min - 2) && slides.length >= min;
  return {
    ok,
    slides,
    count: slides.length, // cover + N content + close
    distinctCount,
    distinctPrintings,
    dedupedFrom: rows.length,
    reason: ok ? null : `only ${distinctCount} distinct card${distinctCount === 1 ? "" : "s"} - a carousel needs at least ${Math.max(1, min - 2)}`,
  };
}

// ---------------------------------------------------------------------------
// 8. VALIDATION (tests / socialDaily use this)
// ---------------------------------------------------------------------------

export function validateFamilySpec(family) {
  const problems = [];
  const s = FAMILY_SPECS[family];
  if (!s) return [`unknown family "${family}"`];
  const comps =
    family === "hook_carousel"
      ? [s.coverComposition, s.slideComposition, s.closeComposition]
      : [s.composition, s.altComposition].filter(Boolean);
  for (const c of comps) if (!COMPOSITIONS[c]) problems.push(`${family}: composition "${c}" is not defined`);
  for (const z of s.zones) if (!ZONES.includes(z)) problems.push(`${family}: zone "${z}" is not in the ZONES vocabulary`);
  for (const z of s.oneSecondRead) if (!s.zones.includes(z)) problems.push(`${family}: one-second-read zone "${z}" is not one of its zones`);
  if (s.card) {
    const g = resolveCardGeometry(s.card);
    if (Math.abs(g.rotationDeg) > CARD_GEOMETRY.maxRotationDeg) problems.push(`${family}: card rotation exceeds the cap`);
  }
  if (!["saving", "movement", "none"].includes(s.accentPolicy)) problems.push(`${family}: unknown accentPolicy "${s.accentPolicy}"`);
  return problems;
}

export function validateAllFamilySpecs() {
  return FAMILIES.flatMap(validateFamilySpec);
}
