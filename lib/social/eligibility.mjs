// Phase 13D.4 - the social eligibility gate. This is a WRAPPER around the
// existing, unchanged truth contracts in lib/dealQuality.js -
// deliberately not a parallel deal-quality model. Nothing here re-derives
// is_active, authenticity, condition/language matching, exact-listing
// destination, or auction-ended state - it only adds ONE thing on top:
// a freshness ceiling stricter than the homepage's own premium bound,
// because social content can sit in a human-review queue for a while
// after being generated, and a post (unlike a live webpage) can't
// silently self-correct once it's out.

import {
  isDisplayableDeal,
  isPremiumDealEligible,
  isExactVerifiedFresh,
  hoursSinceExactVerification,
  discoveryAgeHours,
  auctionEnded,
  JUST_ADDED_MAX_DISCOVERY_AGE_HOURS,
  PREMIUM_EXACT_VERIFICATION_MAX_AGE_HOURS,
} from "../dealQuality.js";

// Deliberately HALF of the homepage's own premium bound (12h). Reasoning
// (documented, not arbitrary): a homepage tile re-renders on every
// request and self-heals within POOL_REVALIDATE_SECONDS if the
// underlying data goes stale; a social preview generated now might sit
// in a human-review queue for a while before anyone looks at it, and
// once published it can't be silently corrected the way a webpage can.
// The candidate is re-validated again at render time regardless (see
// buildCandidatePayload) - this constant only bounds how old the
// snapshot is allowed to be at SELECTION time.
export const SOCIAL_FRESHNESS_MAX_AGE_HOURS = PREMIUM_EXACT_VERIFICATION_MAX_AGE_HOURS / 2;

// Re-exported so callers (candidates.mjs, tests) don't need a second
// import line for a value that's really "the Just Added contract,
// unchanged" - see lib/deals.js fetchFreshFindsUncached / P0.2.
export const SOCIAL_JUST_FOUND_MAX_DISCOVERY_AGE_HOURS = JUST_ADDED_MAX_DISCOVERY_AGE_HOURS;

// Base social eligibility - every social candidate, of any template
// family, must clear this. Builds on isDisplayableDeal (never replaces
// it), matching the same "build on top, never bypass" pattern
// lib/dealQuality.isPremiumDealEligible itself already uses.
export function isSociallyEligible(row, now = Date.now()) {
  if (!isDisplayableDeal(row)) return false;
  if (auctionEnded(row, now)) return false; // explicit, even though isDisplayableDeal already covers it
  if (!isExactVerifiedFresh(row, now)) return false; // premium-level check first (cheap short-circuit)
  if (hoursSinceExactVerification(row, now) > SOCIAL_FRESHNESS_MAX_AGE_HOURS) return false; // then the stricter social ceiling
  const marketPrice = Number(row?.market_price);
  const discountPct = Number(row?.discount_pct);
  if (!Number.isFinite(marketPrice) || marketPrice <= 0) return false; // reference-price valid
  if (!Number.isFinite(discountPct) || discountPct <= 0) return false; // a genuine, positive discount exists
  return true;
}

// The stricter tier for Deal of the Day / Best Deals Found Today -
// reuses isPremiumDealEligible (the same gate Best Deals/Auctions/Just
// Added/the digest already use) UNCHANGED, then applies the same social
// freshness ceiling on top. Never loosens premium eligibility; only ever
// tightens it further.
export function isSociallyEligiblePremium(row, now = Date.now()) {
  return isPremiumDealEligible(row, now) && isSociallyEligible(row, now);
}

// MVP scope boundary (documented, deliberate - see docs/social-creative-system.md
// SS4 family #4 and the P0.4 brief SS15): auction wording/truth-contract
// UI isn't built in this spike, so any auction that reaches a selector
// must be rejected outright rather than rendered with BIN-style "Save $X"
// language. This is the single check every selector runs before anything
// else touches a row.
export function isBuyItNowOnly(row) {
  return row?.listing_type !== "AUCTION";
}

// "Just Found" needs BOTH: recently discovered (the homepage's own
// Just-Added window, unchanged) AND exactly verified within the social
// freshness ceiling - a listing that was merely discovered recently but
// never independently re-confirmed is exactly the P0.2 failure class,
// so recency alone is never sufficient here.
export function isJustFoundEligible(row, now = Date.now()) {
  if (!isSociallyEligiblePremium(row, now)) return false;
  if (!isBuyItNowOnly(row)) return false;
  return discoveryAgeHours(row, now) <= SOCIAL_JUST_FOUND_MAX_DISCOVERY_AGE_HOURS;
}

// Freshness language for the structured payload / caption "EVIDENCE"
// line. Never fabricates "live now" for anything outside the approved
// social freshness threshold - a candidate that fails isSociallyEligible
// is excluded by the selector before this is ever called, so this
// function only ever describes an already-fresh candidate; it does not
// itself decide eligibility.
export function socialFreshnessLine(row, { at = new Date() } = {}) {
  const hrs = hoursSinceExactVerification(row, at.getTime());
  if (!Number.isFinite(hrs) || hrs > SOCIAL_FRESHNESS_MAX_AGE_HOURS) {
    // Defensive: a caller must never reach this branch for a row that
    // passed isSociallyEligible, but if it somehow does, fail honest
    // rather than fabricate freshness.
    return { label: "Verification age outside social freshness threshold - not eligible for preview.", checkedAt: null };
  }
  const checkedAt = at.toISOString();
  return {
    label: `Live when checked at ${checkedAt}. Availability can change.`,
    checkedAt,
  };
}
