// Phase 13E.8A - FRESHNESS VS SCHEDULING (§15).
//
// Deal content has a shelf life. A Deal Drop cannot be planned hours ahead
// if its freshness contract would expire before it publishes. The planner
// computes latest_safe_publish_at and refuses to slot a placement past it.
//
//   latest_safe_publish_at (deal families) =
//       exact_verified_at
//     + SOCIAL_FRESHNESS_MAX_AGE_HOURS      (the 13E.5D freshness contract)
//     - PUBLISH_SAFETY_MARGIN_MINUTES       (so it is still fresh AT publish, not exactly at the edge)
//
// Market Movers / Brand Ads have a longer shelf life (their truth is
// canonical history / evergreen product framing, not a live listing).

import { SOCIAL_FRESHNESS_MAX_AGE_HOURS } from "../eligibility.mjs";

// leave this much headroom before the hard ceiling.
export const PUBLISH_SAFETY_MARGIN_MINUTES = 45;

// Market Mover / Brand Ad shelf life from the snapshot capture time.
export const MOVER_SHELF_LIFE_HOURS = 72;
export const BRAND_AD_SHELF_LIFE_HOURS = 24 * 14;

const MIN = 60_000;
const HRS = 3_600_000;

// Returns { at: ISO | null, basis: string, family }.
//   `now` is the snapshot capture time (frozen), NOT wall clock.
export function latestSafePublishAt(cand, { now = Date.now() } = {}) {
  const fam = cand.family;

  if (fam === "market_mover") {
    return {
      at: new Date(now + MOVER_SHELF_LIFE_HOURS * HRS).toISOString(),
      basis: `snapshot capture + ${MOVER_SHELF_LIFE_HOURS}h (canonical price history, not a live listing)`,
      family: fam,
    };
  }
  if (fam === "brand_ad") {
    return {
      at: new Date(now + BRAND_AD_SHELF_LIFE_HOURS * HRS).toISOString(),
      basis: `snapshot capture + ${BRAND_AD_SHELF_LIFE_HOURS / 24}d (evergreen product framing)`,
      family: fam,
    };
  }

  // deal_drop / hook_carousel - tied to the live listing's exact_verified_at.
  const iso = cand.exact_verified_at ?? cand.row?.exact_verified_at ?? null;
  const t = iso ? Date.parse(iso) : NaN;
  if (!Number.isFinite(t)) {
    return { at: null, basis: "no exact_verified_at on the candidate - cannot be safely scheduled", family: fam };
  }
  const at = t + SOCIAL_FRESHNESS_MAX_AGE_HOURS * HRS - PUBLISH_SAFETY_MARGIN_MINUTES * MIN;
  return {
    at: new Date(at).toISOString(),
    basis: `exact_verified_at + ${SOCIAL_FRESHNESS_MAX_AGE_HOURS}h freshness contract - ${PUBLISH_SAFETY_MARGIN_MINUTES}m safety margin`,
    family: fam,
  };
}

// Can this candidate still be published at `whenIso` and be truthful?
export function isPlannableAt(cand, whenIso, { now = Date.now() } = {}) {
  const { at } = latestSafePublishAt(cand, { now });
  if (at == null) return false;
  const when = Date.parse(whenIso);
  return Number.isFinite(when) && when <= Date.parse(at);
}

// The reason a slot was rejected on freshness grounds (for the operator
// output / plan record).
export function freshnessRejectReason(cand, whenIso, { now = Date.now() } = {}) {
  const { at, basis } = latestSafePublishAt(cand, { now });
  if (at == null) return "no exact_verified_at - needs revalidation before it can be scheduled";
  return `would publish ${whenIso} but is only safe until ${at} (${basis}) - reject or revalidate`;
}
