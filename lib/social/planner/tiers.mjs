// Phase 13E.8A - DEAL QUALITY TIERS (§8).
//
//   S_TIER      exceptional discount + strong confidence + recognizable
//               card + real canonical art
//   A_TIER      strong legitimate deal
//   B_TIER      valid, but less scroll-stopping
//   NOT_SOCIAL  a valid SITE deal that is a weak SOCIAL candidate
//
// IMPORTANT: NOT_SOCIAL does NOT mean the website deal is bad. This is
// creative suitability ONLY. Deterministic - no AI.

import {
  discountComponent,
  dollarsSavedComponent,
  visualQualityComponent,
  marketConfidenceComponent,
  popularityComponent,
  RECOGNIZABLE_SPECIES,
} from "./scoring.mjs";

export const QUALITY_TIERS = Object.freeze(["S_TIER", "A_TIER", "B_TIER", "NOT_SOCIAL"]);

// numeric rank so tests can assert "stronger deal ranks above weaker".
export const TIER_RANK = Object.freeze({ S_TIER: 3, A_TIER: 2, B_TIER: 1, NOT_SOCIAL: 0 });

// signals used for the tier decision (all 0..1 except dollarsSaved which
// is the raw USD figure, and a couple of booleans).
export function tierSignals(cand) {
  const market = Number(cand.market_price ?? cand.row?.market_price);
  const paid = Number(cand.total_price_usd ?? cand.row?.total_price_usd);
  const savedUsd = Number.isFinite(market) && Number.isFinite(paid) ? market - paid : 0;
  const id = String(cand.card_tcgplayer_id ?? cand.row?.card_tcgplayer_id ?? "").trim();
  return {
    discount: discountComponent(cand), // 0..1
    dollarsSaved01: dollarsSavedComponent(cand), // 0..1
    savedUsd,
    visual: visualQualityComponent(cand), // 0..1
    confidence: marketConfidenceComponent(cand), // 0..1
    popularity: popularityComponent(cand), // 0..1
    recognizable: RECOGNIZABLE_SPECIES.has(String(cand.species ?? "").toLowerCase()),
    hasCanonicalArt: /^\d+$/.test(id),
    discountPct: Number(cand.discount_pct ?? cand.row?.discount_pct ?? 0),
    freshnessState: cand.freshness_state ?? null,
  };
}

export function qualityTier(cand) {
  const s = tierSignals(cand);

  // --- NOT_SOCIAL: valid site deal, weak social candidate --------------
  if (cand.family === "deal_drop" || cand.family === "hook_carousel") {
    if (!s.hasCanonicalArt) return "NOT_SOCIAL"; // no exact-printing art to composite
    if (s.discountPct < 0.15) return "NOT_SOCIAL"; // real but shallow - not scroll-stopping
    if (cand.freshness_state == null) return "NOT_SOCIAL"; // not socially fresh at snapshot time
  }
  // --- Market Mover: graded on MOVEMENT magnitude + data confidence +
  //     recognizability (§9), NOT on discount. ---------------------------
  if (cand.family === "market_mover") {
    if (!s.hasCanonicalArt) return "NOT_SOCIAL";
    if (s.confidence < 0.5) return "NOT_SOCIAL"; // low-confidence trend - fail closed
    const mag = Math.abs(Number(cand.movement?.pct ?? cand.movementPct ?? 0)); // fraction
    if (mag >= 0.35 && s.confidence >= 0.9 && s.recognizable) return "S_TIER";
    if (mag >= 0.12 && s.confidence >= 0.6) return "A_TIER";
    return "B_TIER";
  }

  // --- Deal Drop S_TIER --------------------------------------------
  if (cand.family === "deal_drop") {
    if (s.discountPct >= 0.5 && s.savedUsd >= 100 && s.recognizable && s.visual >= 0.85 && s.confidence >= 0.75) {
      return "S_TIER";
    }
    if (s.discountPct >= 0.3 && (s.recognizable || s.savedUsd >= 60) && s.visual >= 0.7) {
      return "A_TIER";
    }
  }
  if (cand.family === "hook_carousel") {
    // a carousel's strength is the group, not one discount - grade on
    // how many distinct real cards it has.
    const n = Number(cand.item_count ?? 0);
    if (n >= 5 && s.hasCanonicalArt) return "A_TIER";
    if (n >= 3) return "B_TIER";
    return "NOT_SOCIAL";
  }
  if (cand.family === "brand_ad") {
    // brand content is never "S/A" on deal signals - it is a steady B.
    return "B_TIER";
  }

  // --- B_TIER (still socially eligible) -----------------------------
  return "B_TIER";
}
