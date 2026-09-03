// Phase 12A closeout - one explicit, same-unit contract for price alerts.
//
// A price alert's threshold is stored in USD (`price_alerts.target_price_usd`)
// and compared against a listing's USD total (`deals.total_price_usd`,
// which already includes shipping). Never against a native `total_price`.
//
// Pure so the six-market matrix is deterministically testable.

const { currencyForDeal } = require("./money");

const ALERT_DISCOUNT_FLOOR = 0.1; // "no target" -> notify on any listing >= 10% below market

// The USD total (item + shipping) for a listing, or NaN when it can't be
// trusted as USD. Mirrors lib/money.dealTotalUsd but returns NaN (not
// null) so callers can guard with Number.isFinite.
function listingTotalUsd(deal) {
  const usd = Number(deal?.total_price_usd);
  if (Number.isFinite(usd) && usd > 0) return usd;
  if (currencyForDeal(deal) === "USD") {
    const n = Number(deal?.total_price);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return NaN;
}

// Decide whether a confirmed alert matches the current cheapest listing.
// Pure. Returns { legacyDormant, matched, reason, comparison }.
//
//   legacyDormant  - a bare legacy `target_price` with no
//                    `target_price_usd`: unit is unprovable, so the alert
//                    stays dormant (no email) until the subscriber
//                    re-sets it. Never falls through to "any below-market".
//   target_price_usd set - matched := listingTotalUsd(cheapest) <= target_price_usd
//                          (fails closed - no match - when the USD total
//                           can't be established).
//   no target      - matched := discount_pct >= discountFloor
//                    (a percentage; currency-free).
function evaluateAlert(alert, cheapest, { discountFloor = ALERT_DISCOUNT_FLOOR } = {}) {
  if (alert && alert.target_price != null && alert.target_price_usd == null) {
    return { legacyDormant: true, matched: false, reason: "legacy-target-needs-reset", comparison: null };
  }

  const targetUsd = alert && alert.target_price_usd != null ? Number(alert.target_price_usd) : null;

  if (targetUsd != null && Number.isFinite(targetUsd)) {
    const usd = listingTotalUsd(cheapest);
    if (!Number.isFinite(usd) || usd <= 0) {
      return { legacyDormant: false, matched: false, reason: "no-trustworthy-usd-total", comparison: null };
    }
    const matched = usd <= targetUsd;
    return {
      legacyDormant: false,
      matched,
      reason: matched ? "usd-threshold-met" : "above-usd-threshold",
      comparison: { unit: "USD", listing: usd, target: targetUsd },
    };
  }

  const below = Number(cheapest && cheapest.discount_pct) >= discountFloor;
  return {
    legacyDormant: false,
    matched: below,
    reason: below ? "below-market" : "not-below-market",
    comparison: { unit: "percent", discountPct: Number(cheapest && cheapest.discount_pct) },
  };
}

module.exports = { evaluateAlert, listingTotalUsd, ALERT_DISCOUNT_FLOOR };
