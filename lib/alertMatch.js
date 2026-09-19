// Phase 12A closeout - one explicit, same-unit contract for price alerts.
//
// A price alert's threshold is stored in USD (`price_alerts.target_price_usd`)
// and compared against a listing's USD total (`deals.total_price_usd`,
// which already includes shipping). Never against a native `total_price`.
//
// 2026-09-19 (growth brief §6) - alert CRITERIA on top of that contract:
//   marketplace / condition / grader+grade  narrow WHICH offers count
//   target_currency + target_amount         a threshold in the subscriber's
//                                           own currency, converted from the
//                                           listing's USD total at CHECK time
//                                           with the server's rate table
//                                           (never converted at entry)
//   target_scope "all_in" | "item"          compare the delivered total or the
//                                           item price alone; an all-in
//                                           threshold is NEVER satisfied by a
//                                           listing whose shipping is unknown
//   alert_kind "card" | "set"               a set alert fires on any offer in
//                                           the set with a supported saving of
//                                           at least criteria.min_discount
//   digest                                  one email per check run for the
//                                           subscriber instead of one per alert
// Pure so the six-market matrix is deterministically testable.

const { currencyForDeal } = require("./money");
const { storedDealCondition, hasPositiveComparison, savingsClaimTrusted } = require("./dealQuality");
const { shippingState } = require("./offerPresentation");

const ALERT_DISCOUNT_FLOOR = 0.1; // "no target" -> notify on any listing >= 10% below market

const ALERT_MARKETPLACES = ["EBAY_US", "EBAY_GB", "EBAY_AU", "EBAY_CA", "EBAY_DE", "EBAY_IT"];
// Condition vocabulary a subscriber can ask for. "graded" = any graded copy
// (optionally narrowed by grader / grade); raw tiers use the same stored
// tiers the cards display (lib/dealQuality storedDealCondition).
const ALERT_CONDITIONS = ["NM", "LP", "graded"];
// alert code -> the stored physical tier (lib/dealQuality PHYSICAL_CONDITION_TIERS)
const CONDITION_TIER = { NM: "Near Mint", LP: "Lightly Played" };
const ALERT_GRADERS = ["PSA", "CGC", "BGS", "SGC", "ACE", "TAG"];
const ALERT_CURRENCIES = ["USD", "GBP", "EUR", "AUD", "CAD"];
const ALERT_SCOPES = ["all_in", "item"];
const ALERT_KINDS = ["card", "set"];
const ALERT_MIN_DISCOUNTS = [0.1, 0.2, 0.3];

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

// The ITEM price in USD - the stored USD total scaled by the item's share
// of the native total (rate-invariant, so no second conversion). NaN when
// the total can't be trusted.
function listingItemUsd(deal) {
  const totalUsd = listingTotalUsd(deal);
  if (!Number.isFinite(totalUsd)) return NaN;
  const item = Number(deal?.price);
  const total = Number(deal?.total_price);
  if (!Number.isFinite(item) || item <= 0) return NaN;
  if (!Number.isFinite(total) || total <= 0) return NaN;
  if (item > total) return NaN;
  return totalUsd * (item / total);
}

// USD -> the alert's currency with the server's rate table (1 USD = rates[c]).
function usdToCurrency(usd, currency, rates) {
  if (!currency || currency === "USD") return usd;
  const r = rates && Number(rates[currency]);
  if (!Number.isFinite(r) || r <= 0) return NaN; // no trustworthy rate -> fail closed
  return usd * r;
}

// Validate + normalise the criteria a form/API submits. Unknown values are
// dropped WITH a note (never silently accepted); the result is what gets
// stored. `graded` implies the condition even when only a grader/grade is
// given.
function normalizeAlertCriteria(body = {}) {
  const notes = [];
  const pick = (v, allowed, code, transform = (x) => x) => {
    if (v == null || v === "" || v === "any" || v === "all") return null;
    const t = transform(String(v).trim());
    if (allowed.includes(t)) return t;
    notes.push(code);
    return null;
  };
  const marketplace = pick(body.marketplace, ALERT_MARKETPLACES, "marketplace_invalid", (s) => s.toUpperCase());
  let condition = pick(body.condition, ALERT_CONDITIONS, "condition_invalid", (s) => (s.toLowerCase() === "graded" ? "graded" : s.toUpperCase()));
  const grader = pick(body.grader, ALERT_GRADERS, "grader_invalid", (s) => s.toUpperCase());
  let grade = null;
  if (body.grade != null && body.grade !== "" && body.grade !== "any") {
    const g = Number(body.grade);
    if (Number.isFinite(g) && g >= 1 && g <= 10) grade = String(g);
    else notes.push("grade_invalid");
  }
  if ((grader || grade) && condition !== "graded") {
    if (condition) notes.push("condition_vs_graded");
    condition = "graded";
  }
  const target_currency = pick(body.targetCurrency ?? body.target_currency, ALERT_CURRENCIES, "currency_invalid", (s) => s.toUpperCase()) ?? "USD";
  const target_scope = pick(body.targetScope ?? body.target_scope, ALERT_SCOPES, "scope_invalid", (s) => s.toLowerCase()) ?? "all_in";
  const alert_kind = pick(body.alertKind ?? body.alert_kind, ALERT_KINDS, "kind_invalid", (s) => s.toLowerCase()) ?? "card";
  let min_discount = null;
  const md = body.minDiscount ?? body.min_discount;
  if (md != null && md !== "") {
    const n = Number(md);
    const asFraction = n > 1 ? n / 100 : n;
    if (ALERT_MIN_DISCOUNTS.some((x) => Math.abs(x - asFraction) < 1e-9)) min_discount = asFraction;
    else notes.push("min_discount_invalid");
  }
  const digest = body.digest === true || body.digest === "true";
  return { marketplace, condition, grader, grade, target_currency, target_scope, alert_kind, min_discount, digest, notes };
}

// Does one displayable offer satisfy the alert's narrowing criteria?
function offerMatchesCriteria(alert, offer) {
  if (!offer) return false;
  if (alert?.marketplace && offer.marketplace !== alert.marketplace) return false;
  const cond = alert?.condition ?? null;
  if (cond === "graded") {
    if (!offer.is_graded) return false;
    if (alert.grader && String(offer.grader ?? "").toUpperCase() !== alert.grader) return false;
    if (alert.grade != null && Number(offer.grade) !== Number(alert.grade)) return false;
  } else if (cond) {
    if (offer.is_graded) return false;
    if (storedDealCondition(offer) !== (CONDITION_TIER[cond] ?? cond)) return false;
  }
  return true;
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

// The threshold an alert carries, in its own currency, or null for an
// untargeted (percentage) alert. target_amount + target_currency are the
// criteria-era columns; a USD-only row still carries target_price_usd.
function alertThreshold(alert) {
  if (!alert) return null;
  if (alert.target_amount != null && Number.isFinite(Number(alert.target_amount)) && Number(alert.target_amount) > 0) {
    return { amount: Number(alert.target_amount), currency: alert.target_currency || "USD" };
  }
  if (alert.target_price_usd != null && Number.isFinite(Number(alert.target_price_usd))) {
    return { amount: Number(alert.target_price_usd), currency: "USD" };
  }
  return null;
}

// One offer against one alert's threshold + scope. Pure.
function evaluateOfferForAlert(alert, offer, { rates = null, discountFloor = ALERT_DISCOUNT_FLOOR } = {}) {
  if (alert && alert.target_price != null && alert.target_price_usd == null && alert.target_amount == null) {
    return { legacyDormant: true, matched: false, reason: "legacy-target-needs-reset", comparison: null };
  }
  if (!offerMatchesCriteria(alert, offer)) {
    return { legacyDormant: false, matched: false, reason: "criteria-not-met", comparison: null };
  }
  const threshold = alertThreshold(alert);
  const scope = alert?.target_scope === "item" ? "item" : "all_in";

  if (threshold) {
    // An all-in threshold needs a KNOWN delivered total. Shipping that was
    // never recorded (or recorded as 0, which may mean "unstated") cannot
    // prove the total is at or below the target, so it never satisfies it.
    if (scope === "all_in" && shippingState(offer) !== "confirmed") {
      return { legacyDormant: false, matched: false, reason: "shipping-unknown-for-all-in", comparison: null };
    }
    const usd = scope === "item" ? listingItemUsd(offer) : listingTotalUsd(offer);
    if (!Number.isFinite(usd) || usd <= 0) {
      return { legacyDormant: false, matched: false, reason: "no-trustworthy-usd-total", comparison: null };
    }
    const inCurrency = usdToCurrency(usd, threshold.currency, rates);
    if (!Number.isFinite(inCurrency)) {
      return { legacyDormant: false, matched: false, reason: "no-rate-for-currency", comparison: null };
    }
    const matched = inCurrency <= threshold.amount;
    return {
      legacyDormant: false,
      matched,
      reason: matched ? "threshold-met" : "above-threshold",
      comparison: { unit: threshold.currency, scope, listing: inCurrency, listingUsd: usd, target: threshold.amount },
    };
  }

  // Untargeted: a supported saving of at least the alert's own floor.
  const floor = alert?.min_discount != null && Number.isFinite(Number(alert.min_discount)) ? Number(alert.min_discount) : discountFloor;
  const pct = Number(offer && offer.discount_pct);
  const below = hasPositiveComparison(offer) && savingsClaimTrusted(offer) && pct >= floor;
  return {
    legacyDormant: false,
    matched: below,
    reason: below ? "below-market" : "not-below-market",
    comparison: { unit: "percent", discountPct: pct, floor },
  };
}

// The first offer (cheapest-first input) that satisfies the alert, with its
// evaluation, or { matched: false, reason } when none does.
function evaluateAlertAgainstOffers(alert, offers, opts = {}) {
  let last = { legacyDormant: false, matched: false, reason: "no-offers", comparison: null };
  for (const offer of offers ?? []) {
    const r = evaluateOfferForAlert(alert, offer, opts);
    if (r.legacyDormant) return { ...r, offer: null };
    if (r.matched) return { ...r, offer };
    last = r;
  }
  return { ...last, matched: false, offer: null };
}

// Notification gate shared by immediate and digest sends: never the same
// listing twice for one alert, never inside the cooldown.
function shouldNotify(alert, offer, now, cooldownMs) {
  if (!alert || !offer) return false;
  if (alert.last_notified_deal_id != null && String(alert.last_notified_deal_id) === String(offer.id)) return false;
  if (alert.last_notified_at && now - new Date(alert.last_notified_at).getTime() < cooldownMs) return false;
  return true;
}

// A one-line, human description of an alert's criteria for emails / UI.
function describeCriteria(alert) {
  const parts = [];
  if (alert?.marketplace) parts.push(`eBay ${alert.marketplace.replace("EBAY_", "")}`);
  if (alert?.condition === "graded") parts.push([alert.grader, alert.grade != null ? `grade ${alert.grade}` : null].filter(Boolean).join(" ") || "graded");
  else if (alert?.condition) parts.push(alert.condition === "NM" ? "Near Mint" : alert.condition === "LP" ? "Lightly Played" : alert.condition);
  const t = alertThreshold(alert);
  if (t) parts.push(`${alert?.target_scope === "item" ? "item price" : "total incl. shipping"} ≤ ${t.amount.toFixed(2)} ${t.currency}`);
  else if (alert?.min_discount != null) parts.push(`≥ ${Math.round(Number(alert.min_discount) * 100)}% below market`);
  return parts.join(" · ");
}

module.exports = {
  evaluateAlert,
  listingTotalUsd,
  listingItemUsd,
  usdToCurrency,
  ALERT_DISCOUNT_FLOOR,
  ALERT_MARKETPLACES,
  ALERT_CONDITIONS,
  ALERT_GRADERS,
  ALERT_CURRENCIES,
  ALERT_SCOPES,
  ALERT_KINDS,
  ALERT_MIN_DISCOUNTS,
  normalizeAlertCriteria,
  offerMatchesCriteria,
  alertThreshold,
  evaluateOfferForAlert,
  evaluateAlertAgainstOffers,
  shouldNotify,
  describeCriteria,
};
