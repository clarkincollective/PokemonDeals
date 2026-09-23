// ONE rule for what a CARD-PAGE SUMMARY may say about the cheapest live
// listing. Pure, dependency-light, CommonJS (tests require it directly).
//
// WHY THIS EXISTS (SEO/affiliate audit 2026-09-23, finding 2).
// /cards/[slug] renders two summaries above the listing grid - the "how
// much is it worth" answer and the Price intelligence panel - and both were
// handed a bare USD number (the cheapest offer's dealTotalUsd) with no
// record of what that number was, nor of whether the listing it came from
// is allowed to claim a saving at all. The panel then did its own
// arithmetic against the RAW catalogue reference:
//
//     belowPct = round((1 - listing / marketValueUsd) * 100)
//
// That is a SECOND, independently maintained savings rule, and it disagreed
// with the tile rendered directly below it. Measured on 2026-09-24 across
// 225 live English card hubs, 221 summaries asserted a saving, and of those:
//
//   14   asserted one the cheapest listing's own trust checks REFUSE - a
//        reverse-holo reference on a listing that never says "reverse"
//        (referenceIsUnevidencedParallelPrinting), or no evidenced stored
//        reference at all. The tile said "shown without a savings claim"
//        while the panel above it said "56% below this market reference".
//    3   compared a GRADED listing (e.g. CGC 9) to the raw catalogue figure.
//   50   described an AUCTION's current bid as a listing price.
//  155   dropped the " before shipping" qualifier the tile carries.
//   63   stated a different percentage from the tile's.
//
// WHAT THIS MODULE DOES NOT DO: decide anything. It asks the established
// gates - dealQuality.listingPresentation for whether a saving may be
// claimed at all, offerPresentation.offerShipping for what the stored total
// IS, money.dealTotalUsd for the USD figure - and returns their answers as
// one plain, serialisable descriptor the summaries render. A summary can
// therefore no longer recover a claim the tile refuses, because it is
// literally the same refusal. Adding a condition here would recreate the
// defect; the gates are the place to change a rule.
//
// The offer described is always offers[0] - the genuinely cheapest
// displayable listing, which is what the page leads with and what the grid
// shows first. When that listing may not claim a saving, the summary states
// no saving; it never walks the list looking for a more expensive one that
// can, because "the cheapest active listing" would then be a false subject.
const { listingPresentation } = require("./dealQuality.js");
const { offerShipping } = require("./offerPresentation.js");
const { dealTotalUsd } = require("./money.js");

// offers: the array /cards/[slug] renders, already displayable-gated and
// sorted cheapest-first by USD total (lib/deals.fetchCardOffers).
// Returns null when there is no live listing at all.
function cardSummaryOffer(offers, now = Date.now()) {
  const offer = Array.isArray(offers) ? offers[0] ?? null : null;
  if (!offer) return null;
  const lowUsd = dealTotalUsd(offer);
  const ship = offerShipping(offer);
  const pres = listingPresentation(offer, now);
  // listingPresentation.savings is "trusted" only when savingsClaimTrusted
  // AND hasPositiveComparison both hold, so this pair is the WHOLE
  // eligibility question - there is deliberately no third condition.
  const mayClaim = pres.savings === "trusted" && ship.savingClaim !== "none";
  const pct = Number(offer.discount_pct);
  const referenceUsd = Number(offer.market_price);
  const grade = offer.is_graded && offer.grader ? `${String(offer.grader).toUpperCase()} ${offer.grade ?? ""}`.trim() : null;
  return {
    dealId: offer.id ?? null,
    lowUsd: Number.isFinite(lowUsd) && lowUsd > 0 ? lowUsd : null,
    // WHAT THE FIGURE IS, so no surface can imply a delivered cost from a
    // total whose shipping charge was never recorded:
    //   "delivered"        a recorded charge is included
    //   "before_shipping"  item price only
    //   "none"             breakdown unknown - neither may be claimed
    priceBasis: ship.savingClaim,
    // An auction's figure is a CURRENT BID, not an asking price.
    isAuction: offer.listing_type === "AUCTION",
    graded: Boolean(offer.is_graded),
    // Raw and graded references stay separate: a graded listing's saving is
    // against its own grade-specific reference, never the raw catalogue one
    // the panel shows as "current market value".
    gradeLabel: grade || null,
    saving:
      mayClaim && Number.isFinite(pct) && pct > 0 && Number.isFinite(referenceUsd) && referenceUsd > 0
        ? { pct, referenceUsd, qualifier: ship.savingQualifier }
        : null,
    // Why there is no claim, in the SAME vocabulary the tile uses
    // (listingPresentation.savingsReason), plus the shipping-only refusal.
    savingsReason: mayClaim ? null : ship.savingClaim === "none" ? "shipping_not_recorded" : pres.savingsReason,
  };
}

module.exports = { cardSummaryOffer };
