// Phase 13E.8A - DETERMINISTIC CANDIDATE SCORE (§5, §18).
//
// No AI. Every component is a pure function of real snapshot data. The
// weights are documented here and frozen; scoreBreakdown() returns each
// component so the CLI can print "WHY SELECTED" and tests can pin it.
//
// Range: every component is clamped to 0..1, the weighted sum is clamped
// to 0..1. Diversity penalties are applied SEPARATELY (see diversity.mjs)
// so an "exceptional" raw score can still override a soft penalty.

import { SOCIAL_FRESHNESS_MAX_AGE_HOURS } from "../eligibility.mjs";

// Component weights. Positive components only - repetition penalties live
// in diversity.mjs. Sum of weights = 1.00.
export const SCORE_WEIGHTS = Object.freeze({
  freshness: 0.2, // how recently exact_verified_at (deals); data recency proxy (movers)
  discount_strength: 0.18, // discount_pct, scaled
  dollars_saved: 0.13, // absolute USD below reference, log-scaled
  card_popularity: 0.1, // recognizable species / clean short name
  visual_quality: 0.1, // canonical exact-printing art available
  market_confidence: 0.12, // mover trend confidence / deal reference validity
  printing_uniqueness: 0.05, // a real numeric tcgplayer id (exact printing)
  platform_fit: 0.06, // family fits the target platform's role
  performance: 0.06, // §18 design hook - perf?.score in -1..1, default 0
});

// A small, fixed table of instantly-recognizable Pokemon. Mirrors the
// spirit of lib/social/dailyMix's Charizard/Pikachu check but broader.
export const RECOGNIZABLE_SPECIES = Object.freeze(
  new Set([
    "charizard", "pikachu", "mewtwo", "mew", "eevee", "umbreon", "espeon",
    "rayquaza", "lugia", "gengar", "gyarados", "snorlax", "dragonite",
    "blastoise", "venusaur", "gardevoir", "lucario", "greninja", "sylveon",
    "typhlosion", "tyranitar", "garchomp",
  ])
);

const clamp01 = (n) => (Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0);

// --- individual components (each returns 0..1) ---------------------

// deals: 1.0 at verification time, linearly to 0 at the social ceiling.
// movers / data pieces: a flat 0.7 (their truth is canonical history, not
// per-listing freshness).
export function freshnessComponent(cand, now = Date.now()) {
  if (cand.family === "market_mover" || cand.family === "brand_ad") return 0.7;
  const iso = cand.exact_verified_at ?? cand.row?.exact_verified_at ?? null;
  const t = iso ? Date.parse(iso) : NaN;
  if (!Number.isFinite(t)) return 0;
  const ageH = (now - t) / 3_600_000;
  if (ageH < 0) return 1;
  return clamp01(1 - ageH / SOCIAL_FRESHNESS_MAX_AGE_HOURS);
}

// discount_pct is a fraction (0.72 = 72% below). Scales so 15% -> ~0.19,
// 40% -> ~0.5, 80%+ -> 1.0.
export function discountComponent(cand) {
  const d = Number(cand.discount_pct ?? cand.row?.discount_pct);
  if (!Number.isFinite(d) || d <= 0) return 0;
  return clamp01(d / 0.8);
}

// absolute USD saved, log-scaled: $10 -> ~0.15, $75 -> ~0.6, $300 -> ~0.9,
// $1000+ -> 1.0.
export function dollarsSavedComponent(cand) {
  const market = Number(cand.market_price ?? cand.row?.market_price);
  const paid = Number(cand.total_price_usd ?? cand.row?.total_price_usd);
  if (!Number.isFinite(market) || !Number.isFinite(paid)) return 0;
  const saved = market - paid;
  if (saved <= 0) return 0;
  return clamp01(Math.log10(saved + 1) / Math.log10(1001)); // log10(1001) ~ 3.0004
}

export function popularityComponent(cand) {
  const species = String(cand.species ?? "").toLowerCase();
  const name = String(cand.card_name ?? cand.row?.card_name ?? "");
  let s = 0.35; // baseline: a real named card
  if (RECOGNIZABLE_SPECIES.has(species)) s = 0.95;
  else if (name && name.length <= 16) s = 0.55; // short, clean name reads well on a creative
  return clamp01(s);
}

// canonical exact-printing art is available when there is a numeric
// tcgplayer id (lib/social/cardArtwork resolves art from it).
export function visualQualityComponent(cand) {
  const id = String(cand.card_tcgplayer_id ?? cand.row?.card_tcgplayer_id ?? "").trim();
  const hasArt = /^\d+$/.test(id);
  if (!hasArt) return 0.35;
  // a graded slab photographs differently - still fine, marginally lower.
  return cand.is_graded || cand.row?.is_graded ? 0.85 : 1;
}

export function marketConfidenceComponent(cand) {
  if (cand.family === "market_mover") {
    const lvl = cand.movement?.confidence ?? cand.confidence ?? null;
    if (lvl === "high") return 1;
    if (lvl === "ok" || lvl === "medium") return 0.75;
    if (lvl === "low") return 0.3;
    return 0.6;
  }
  const market = Number(cand.market_price ?? cand.row?.market_price);
  return Number.isFinite(market) && market > 0 ? 0.8 : 0.2;
}

export function printingUniquenessComponent(cand) {
  const id = String(cand.card_tcgplayer_id ?? cand.row?.card_tcgplayer_id ?? "").trim();
  return /^\d+$/.test(id) ? 0.9 : 0.2;
}

// family fits the target platform's role (platformRoles.PLATFORM_ROLES).
// When no platform is bound yet, score the family's best-fit average.
export function platformFitComponent(cand, roles) {
  const fam = cand.family;
  if (cand.platform_service) {
    return roles?.[cand.platform_service]?.families?.includes(fam) ? 1 : 0.2;
  }
  const services = Object.values(roles ?? {});
  if (!services.length) return 0.6;
  const fitCount = services.filter((r) => r.families.includes(fam)).length;
  return clamp01(fitCount / services.length);
}

// §18 - performance feedback hook. `perf` is an optional
// { score: <-1..1> } the planner may pass once 13E.7A data is wired.
// Default 0 -> a neutral 0.5 component (no effect on ranking order among
// candidates that all lack perf data).
export function performanceComponent(cand) {
  const s = Number(cand.perf?.score);
  if (!Number.isFinite(s)) return 0.5;
  return clamp01((Math.max(-1, Math.min(1, s)) + 1) / 2);
}

// --- the score --------------------------------------------------

export function scoreBreakdown(cand, { now = Date.now(), roles = null } = {}) {
  const c = {
    freshness: freshnessComponent(cand, now),
    discount_strength: discountComponent(cand),
    dollars_saved: dollarsSavedComponent(cand),
    card_popularity: popularityComponent(cand),
    visual_quality: visualQualityComponent(cand),
    market_confidence: marketConfidenceComponent(cand),
    printing_uniqueness: printingUniquenessComponent(cand),
    platform_fit: platformFitComponent(cand, roles),
    performance: performanceComponent(cand),
  };
  let total = 0;
  const weighted = {};
  for (const k of Object.keys(SCORE_WEIGHTS)) {
    weighted[k] = Number((c[k] * SCORE_WEIGHTS[k]).toFixed(4));
    total += weighted[k];
  }
  return { components: c, weighted, raw: Number(clamp01(total).toFixed(3)) };
}

export function scoreCandidate(cand, opts = {}) {
  return scoreBreakdown(cand, opts).raw;
}
