// Phase 13E.10A - CONVERSION SCORE (§1, §12).
//
// A practical, funnel-based score. NOT likes. The KPI hierarchy is:
//   1. affiliate outbound clicks      (highest weight)
//   2. website visits                 (high)
//   3. deal-page engagement           (medium)
//   4. platform CTR where available   (medium)
//   5. views / reach                  (low, context only)
//
// Rules:
//   * every component is null unless BOTH its inputs are real numbers -
//     a missing / unsupported metric is NEVER treated as 0;
//   * the overall score is null unless the two dominant components
//     (affiliate outbound rate + website CTR) both have a value;
//   * raw components are returned separately - the score never hides them.

export const SCORE_WEIGHTS = Object.freeze({
  affiliate_outbound_rate: 0.45,
  website_ctr: 0.3,
  deal_page_engagement: 0.15,
  platform_ctr: 0.07,
  views_context: 0.03,
});

const ratio = (n, d) => {
  const nn = Number(n);
  const dd = Number(d);
  if (!Number.isFinite(nn) || !Number.isFinite(dd) || dd <= 0) return null;
  return nn / dd;
};

// funnel:
//   { impressions?, views?, reach?, siteVisits?, dealPageViews?,
//     affiliateOutbound?, platformCtr? }
// Returns { score, components:{ key:{ value, basis } }, missing:[...] }.
export function conversionScore(funnel = {}) {
  const impr = funnel.impressions ?? funnel.reach ?? funnel.views ?? null;

  const components = {
    affiliate_outbound_rate: {
      value: ratio(funnel.affiliateOutbound, funnel.siteVisits),
      basis: "affiliate_outbound / site_visits",
    },
    website_ctr: {
      value: ratio(funnel.siteVisits, impr),
      basis: impr === funnel.reach ? "site_visits / reach" : impr === funnel.views ? "site_visits / views" : "site_visits / impressions",
    },
    deal_page_engagement: {
      value: ratio(funnel.dealPageViews, funnel.siteVisits),
      basis: "deal_page_views / site_visits",
    },
    platform_ctr: {
      value: funnel.platformCtr != null && Number.isFinite(Number(funnel.platformCtr)) ? Number(funnel.platformCtr) : null,
      basis: "provider-reported platform CTR",
    },
    views_context: {
      value: impr != null && Number(impr) > 0 ? Math.min(1, Math.log10(Number(impr) + 1) / 6) : null,
      basis: "log10(impressions) / 6 - context only",
    },
  };

  const missing = Object.entries(components)
    .filter(([, c]) => c.value == null)
    .map(([k]) => k);

  // score requires the two dominant signals
  const haveDominant = components.affiliate_outbound_rate.value != null && components.website_ctr.value != null;
  if (!haveDominant) {
    return { score: null, components, missing, note: "score withheld - needs affiliate_outbound_rate AND website_ctr" };
  }

  let num = 0;
  let den = 0;
  for (const [k, w] of Object.entries(SCORE_WEIGHTS)) {
    const v = components[k].value;
    if (v == null) continue; // renormalise over the components we actually have
    num += Math.max(0, Math.min(1, v)) * w;
    den += w;
  }
  const score = den > 0 ? Number((num / den).toFixed(4)) : null;
  return { score, components, missing, note: "" };
}

// Compare two variants' scores. `minEffect` is the minimum relative
// difference (of the higher over the lower) to call it "meaningful".
export const MEANINGFUL_RELATIVE_EFFECT = 0.15;

export function compareVariants(scoreA, scoreB, { minEffect = MEANINGFUL_RELATIVE_EFFECT } = {}) {
  if (scoreA == null || scoreB == null) return { leader: null, effect: null, meaningful: false, reason: "one side has no score yet" };
  const hi = Math.max(scoreA, scoreB);
  const lo = Math.min(scoreA, scoreB);
  const effect = lo > 0 ? (hi - lo) / lo : hi > 0 ? 1 : 0;
  const meaningful = effect >= minEffect;
  const leader = !meaningful ? null : scoreA > scoreB ? "A" : "B";
  return { leader, effect: Number(effect.toFixed(4)), meaningful, reason: meaningful ? "" : `relative effect ${(effect * 100).toFixed(1)}% < ${(minEffect * 100).toFixed(0)}% threshold` };
}
