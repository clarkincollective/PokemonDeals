// Phase SOCIAL-NEWSROOM-1 - PRE-PUBLISH CONVERSION PROXY (§15).
//
// lib/social/experiments/score.conversionScore() is the AUTHORITATIVE
// conversion model, but it needs a real post-publish funnel (impressions,
// site visits, affiliate outbound). Before a story is published there is
// no funnel, so this proxy scores the PRE-PUBLISH conversion factors the
// spec lists - purchase intent, price contrast, absolute saving, deal
// confidence, CTA relevance, destination relevance - deterministically.
//
// It is NEVER merged with the organic score (§14/§15 keep them separate)
// and it is explicitly labelled a proxy. Once 13E.7A metrics exist for a
// series, conversionScore(funnel) supersedes it in ranking.
//
// Pure. No I/O.

const clamp01 = (n) => (Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0);

export const PROXY_WEIGHTS = Object.freeze({
  price_contrast: 0.28, // discount_pct
  absolute_saving: 0.24, // USD below reference
  purchase_intent: 0.16, // recognisable + in a "buyable now" band
  deal_confidence: 0.14, // valid market reference / freshness
  cta_relevance: 0.10, // series CTA intensity matches a conversion goal
  destination_relevance: 0.08, // exact-listing destination exists
});

export function conversionProxyBreakdown(story = {}) {
  const f = story.facts_json ?? {};
  const disc = Number(f.discount_pct ?? 0);
  const saved = Number(f.dollars_saved ?? 0);
  const paid = Number(f.total_price_usd ?? f.paid_usd ?? NaN);
  const isDealPillar = story.pillar === "DEALS" || story.pillar === "BUDGET";
  const hasRef = Number(f.market_price ?? 0) > 0;
  const hasDest = Boolean(f.has_exact_destination ?? story.deal_ids?.length);

  const c = {
    price_contrast: isDealPillar ? clamp01(disc / 0.7) : 0.1,
    absolute_saving: isDealPillar && saved > 0 ? clamp01(Math.log10(saved + 1) / Math.log10(1001)) : 0.1,
    purchase_intent: isDealPillar
      ? clamp01((Number.isFinite(paid) && paid <= 300 ? 0.5 : 0.25) + (f.recognisable ? 0.4 : 0.15))
      : 0.15,
    deal_confidence: isDealPillar ? clamp01((hasRef ? 0.6 : 0.2) + (story.shelf_life_class === "LIVE" ? 0.4 : 0.2)) : 0.2,
    cta_relevance: story.cta_intensity === "HARD" ? 1 : story.cta_intensity === "SOFT" ? 0.6 : 0.15,
    destination_relevance: hasDest ? 1 : 0.2,
  };
  let raw = 0;
  const weighted = {};
  for (const k of Object.keys(PROXY_WEIGHTS)) {
    weighted[k] = Number((clamp01(c[k]) * PROXY_WEIGHTS[k]).toFixed(4));
    raw += weighted[k];
  }
  return { components: c, weighted, score: Number(clamp01(raw).toFixed(3)), is_proxy: true };
}

export function conversionProxy(story) {
  return conversionProxyBreakdown(story).score;
}
