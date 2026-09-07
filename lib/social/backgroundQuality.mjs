// Phase 13E.11A - BACKGROUND QUALITY RANKING (§8).
//
// A deterministic curation of the EXISTING OpenAI background style
// families (lib/social/assetPrompts.STYLE_FAMILIES). Nothing is
// regenerated - this only ranks the four style classes and marks which
// are eligible for the FIRST-LIVE rotation, so a first controlled post
// never ships on a weak, generic-AI-looking, or trading-app-flavoured
// ground.
//
// The rationale is the phase's own §8 checklist: generic AI look,
// excessive gradients, fake product-stage feel, noisy texture, visual
// competition with the card, financial-trading aesthetic (§15).

import { STYLE_FAMILIES } from "./assetPrompts.mjs";

export const BACKGROUND_TIER = Object.freeze({
  STRONG: "STRONG",
  OK: "OK",
  WEAK: "WEAK",
});

// style family -> { tier, why }
export const BACKGROUND_RANK = Object.freeze({
  clean_editorial: {
    tier: "STRONG",
    why: "Deep charcoal ground, generous negative space, magazine-cover minimalism. Supports the card, never competes, reads premium. No gradients, no data grid, no fake stage.",
  },
  collector_desk: {
    tier: "OK",
    why: "Authentic collectible-market feel (a lit research desk). Slightly busier - lamp / cloth / magnifier objects can pull focus - so allowed for first-live but not the default.",
  },
  dark_market_intelligence: {
    tier: "WEAK",
    why: "A faint dark-on-dark data grid + soft red glow + luminous plotting lines reads as a finance / crypto price-alert app (§8 fake product-stage, §15 trading aesthetic). Fine as a Market Mover option later; NOT for a first-live Deal Drop.",
  },
  abstract_market: {
    tier: "WEAK",
    why: "Geometric abstraction of price movement - ascending step lines, scatter dots, scanner sweep, red light shafts, translucent planes. Most 'generic AI look' + gradient density; competes with the card. Kept in the library, excluded from first-live rotation.",
  },
});

// The styles a FIRST-LIVE creative may use (STRONG + OK). WEAK styles stay
// in the library for later A/B once we have data, but the first controlled
// posts never draw one.
export const FIRST_LIVE_BACKGROUND_STYLES = Object.freeze(
  STYLE_FAMILIES.filter((s) => BACKGROUND_RANK[s] && BACKGROUND_RANK[s].tier !== "WEAK")
);

export const EXCLUDED_FROM_FIRST_LIVE = Object.freeze(
  new Set(STYLE_FAMILIES.filter((s) => !FIRST_LIVE_BACKGROUND_STYLES.includes(s)))
);

// The frozen default background class for the Deal Drop first-live spec (§21).
export const FIRST_LIVE_DEAL_DROP_BACKGROUND = "clean_editorial";

export function backgroundTier(styleId) {
  return BACKGROUND_RANK[styleId]?.tier ?? "WEAK";
}

export function isFirstLiveEligible(styleId) {
  return FIRST_LIVE_BACKGROUND_STYLES.includes(styleId);
}

// A ranked table for the review pack / docs.
export function rankedBackgrounds() {
  const order = { STRONG: 0, OK: 1, WEAK: 2 };
  return STYLE_FAMILIES
    .map((s) => ({ style: s, tier: backgroundTier(s), first_live: isFirstLiveEligible(s), why: BACKGROUND_RANK[s]?.why ?? "" }))
    .sort((a, b) => order[a.tier] - order[b.tier] || a.style.localeCompare(b.style));
}
