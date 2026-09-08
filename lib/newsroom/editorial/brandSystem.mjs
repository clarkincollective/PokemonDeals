// Phase SOCIAL-CREATIVE-4A - FORMAL BRAND SYSTEM (§12), TYPE HIERARCHY
// (§13), COMPOSITION CONTRACTS (§14).
//
// This is the editorial-direction layer ON TOP OF the existing structural
// design system in lib/social/creativeSpec.mjs (TOKENS / COMPOSITIONS).
// It adds the things the AI creative director and the taste gate need:
// the voice, the explicit anti-patterns, the per-role type contract, and
// the per-family visual-occupancy bands.
//
// Pure data + tiny validators. No I/O.

import { TOKENS } from "../../social/creativeSpec.mjs";

// ---- §12 BRAND ---------------------------------------------------
export const BRAND_PALETTE = Object.freeze({
  ground: TOKENS.color.bg, // charcoal / near-black
  panel: TOKENS.color.surface,
  ink: TOKENS.color.ink, // white typography
  ink_sub: TOKENS.color.inkSub,
  red: TOKENS.color.brand, // restrained red - accents / brand only
  red_pressed: TOKENS.color.brandDeep,
  positive_green: TOKENS.color.up, // ONLY for a genuine positive saving / value
  neutral: TOKENS.color.neutral,
  // green is NEVER used for anything but a real, positive, data-backed
  // saving or gain. Red is NEVER "loss" styling by default.
  green_is_only_for: "a real positive saving or a confident positive price move",
});

export const BRAND_VOICE = Object.freeze({
  tone: ["plain", "specific", "collector-native", "unhyped", "trustworthy"],
  do: [
    "name the card and the real number",
    "explain why a collector should care in one line",
    "let the real card art carry the colour",
    "high contrast, generous air, one dominant element",
  ],
  dont: [
    "manufacture urgency or scarcity",
    "round or invent a market reference",
    "use exclamation hype or emoji stacks",
    "bury the point under decoration",
  ],
});

// The looks this brand must NOT drift into (§12). The taste gate's
// AI_SPAM_RISK and PREMIUM_FEEL dimensions score against this list.
export const ANTI_PATTERNS = Object.freeze([
  "crypto aesthetic (glows, 3D coins, hexagons)",
  "SaaS dashboard look (cards-in-cards, chart chrome, KPI tiles)",
  "generic finance infographic (arrows, stock tickers, bull/bear)",
  "neon gamer style (electric gradients, chrome bevels)",
  "fake luxury (marble, gold foil, serif + gold)",
  "excessive gradients as emphasis",
  "oversized logo / wordmark",
  "clutter - more than one competing focal point",
  "AI-looking decorative nonsense (melted shapes, nonsense text, fake charts)",
]);

// ---- §13 TYPOGRAPHY HIERARCHY ----------------------------------
// One contract per semantic role. `ratio` is relative to the layout's
// headline. `min_px` is the platform-safe floor (nothing on a factual
// creative may render below the smallest here). References the scalar
// sizes in TOKENS.type but pins the editorial rules (line/word limits).
export const TYPE_ROLES = Object.freeze({
  headline: { token: "title", ratio: 1.0, max_lines: 3, max_words: 12, weight: 800, tracking: "-0.03em", min_px: 40 },
  hero_number: { token: "display", ratio: 1.6, max_lines: 1, max_words: 3, weight: 800, tracking: "-0.04em", min_px: 64 },
  supporting_stat: { token: "metric", ratio: 0.85, max_lines: 1, max_words: 4, weight: 800, tracking: "-0.03em", min_px: 40 },
  label: { token: "label", ratio: 0.28, max_lines: 1, max_words: 5, weight: 600, tracking: "0.10em", min_px: 20 },
  annotation: { token: "body", ratio: 0.36, max_lines: 2, max_words: 18, weight: 400, tracking: "-0.005em", min_px: 24 },
  footer: { token: "fine", ratio: 0.24, max_lines: 2, max_words: 20, weight: 400, tracking: "0", min_px: 20 },
  cta: { token: "cta", ratio: 0.34, max_lines: 1, max_words: 5, weight: 700, tracking: "0", min_px: 28 },
});

export const TYPE_ROLE_NAMES = Object.freeze(Object.keys(TYPE_ROLES));

// No factual data label may be smaller than this on any platform (§13
// "No tiny data labels").
export const MIN_DATA_LABEL_PX = 20;

// ---- §14 COMPOSITION CONTRACTS -------------------------------
// Per family: the fraction of frame each element group should occupy,
// [min, max] of total canvas area. `dead_space_max` caps the frame left
// UNCLAIMED by any listed element (background texture + intentional air is
// legitimate up to this ceiling - a bigger gap reads as an unfinished
// layout).
export const COMPOSITION_CONTRACTS = Object.freeze({
  deal_hero: {
    card: [0.35, 0.55], // hero
    price_contrast: [0.18, 0.34], // dominant secondary
    headline: [0.08, 0.2],
    supporting_text: [0.02, 0.1], // labels / context line
    cta: [0.0, 0.1],
    brand: [0.0, 0.05],
    disclosure: [0.01, 0.05],
    dead_space_max: 0.18,
    focal_points: 1,
  },
  market_shape: {
    hero_stat: [0.2, 0.4], // primary
    chart: [0.14, 0.3], // secondary
    example_card: [0.18, 0.34],
    headline: [0.06, 0.18],
    supporting_text: [0.02, 0.1],
    cta: [0.0, 0.08],
    brand: [0.0, 0.05],
    disclosure: [0.01, 0.05],
    dead_space_max: 0.18,
    focal_points: 1,
  },
  printing_compare: {
    card_a: [0.2, 0.32],
    card_b: [0.2, 0.32], // two cards balanced (within 20% of each other)
    difference_callout: [0.1, 0.24], // between / alongside the cards
    prices: [0.06, 0.16],
    headline: [0.06, 0.18],
    brand: [0.0, 0.05],
    disclosure: [0.01, 0.05],
    balance_tolerance: 0.2, // |card_a - card_b| / max
    dead_space_max: 0.2,
    focal_points: 2,
  },
  three_up: {
    card_1: [0.14, 0.24],
    card_2: [0.14, 0.24],
    card_3: [0.14, 0.24], // three panels balanced
    headline: [0.1, 0.22],
    prices: [0.08, 0.2], // each price readable at thumbnail size
    supporting_text: [0.02, 0.1],
    cta: [0.0, 0.08],
    brand: [0.0, 0.05],
    disclosure: [0.01, 0.05],
    balance_tolerance: 0.2,
    dead_space_max: 0.2,
    focal_points: 1,
  },
  asking_vs_sold: {
    card: [0.2, 0.34],
    asking_number: [0.1, 0.22],
    sold_reference: [0.1, 0.22],
    difference: [0.06, 0.16],
    takeaway: [0.06, 0.16],
    headline: [0.04, 0.16],
    brand: [0.0, 0.05],
    disclosure: [0.01, 0.05],
    dead_space_max: 0.2,
    focal_points: 1,
  },
});

export const COMPOSITION_FAMILIES = Object.freeze(Object.keys(COMPOSITION_CONTRACTS));

// Validate a planned occupancy map { element: fraction } against a
// family's contract. Returns { ok, violations: [...] }.
export function validateComposition(family, occupancy = {}) {
  const contract = COMPOSITION_CONTRACTS[family];
  if (!contract) return { ok: false, violations: [`unknown composition family "${family}"`] };
  const violations = [];
  let claimed = 0;
  for (const [el, band] of Object.entries(contract)) {
    if (!Array.isArray(band)) continue;
    const v = Number(occupancy[el]);
    if (!Number.isFinite(v)) {
      if (band[0] > 0) violations.push(`${family}.${el} missing (needs ${band[0]}-${band[1]} of frame)`);
      continue;
    }
    claimed += v;
    if (v < band[0] - 1e-6) violations.push(`${family}.${el} = ${(v * 100).toFixed(0)}% < min ${(band[0] * 100).toFixed(0)}%`);
    if (v > band[1] + 1e-6) violations.push(`${family}.${el} = ${(v * 100).toFixed(0)}% > max ${(band[1] * 100).toFixed(0)}%`);
  }
  const dead = 1 - claimed;
  if (contract.dead_space_max != null && dead > contract.dead_space_max + 1e-6) {
    violations.push(`${family} dead space ${(dead * 100).toFixed(0)}% > max ${(contract.dead_space_max * 100).toFixed(0)}%`);
  }
  if (contract.balance_tolerance != null) {
    const cards = Object.keys(contract).filter((k) => /^card(_|$)/.test(k) || /^card_[abc123]$/.test(k));
    const vals = cards.map((k) => Number(occupancy[k])).filter(Number.isFinite);
    if (vals.length >= 2) {
      const spread = (Math.max(...vals) - Math.min(...vals)) / Math.max(...vals);
      if (spread > contract.balance_tolerance + 1e-6) violations.push(`${family} card panels unbalanced (${(spread * 100).toFixed(0)}% > ${(contract.balance_tolerance * 100).toFixed(0)}%)`);
    }
  }
  return { ok: violations.length === 0, violations };
}

export const BRAND_SYSTEM_VERSION = "4a.1";
