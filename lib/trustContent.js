// Single source of truth for the public "how we check listings" copy.
//
// This describes THE SYSTEM, not any one listing. Every statement here is
// verified against current production code (lib/dealQuality.js,
// lib/dealMatching.js, lib/visualAuthenticity.js, lib/ebay.js,
// app/api/refresh-deals, app/api/verify-deals, app/api/sweep-stale-deals).
// Outcome-level only - no thresholds, scores, quotas or bypass detail.

// Genuine editorial modification date for the trust/methodology pages.
// A fixed constant, bumped by hand when the copy is actually revised -
// NEVER `new Date()` on render. Used for a visible "Last updated" line
// and (on /about, /how-it-works, /methodology) a schema `dateModified`.
export const TRUST_CONTENT_UPDATED = "2026-09-02";
export const TRUST_CONTENT_UPDATED_DISPLAY = "2 September 2026";

// The compact bullet list shown by <ListingChecks> on card and deal
// pages. System-level statements a reader can rely on for every listing
// on the site - not a claim that this exact listing passed a specific
// check.
export const LISTING_CHECKS = [
  "The listing title is matched to one exact catalogue printing - name, set, collector number, card form (Mega, ex/EX/GX, and similar) and language all have to agree, or the listing is left off.",
  "The asking price (item plus shipping) is compared against a recent-sold market reference for that card and condition. Raw and graded cards use separate references.",
  "Listings that look like the wrong card, the wrong printing, a proxy, a reproduction, or something that isn't a single card (empty wrappers, sealed product, merchandise) are excluded.",
  "Selected higher-risk listings get an extra image check that compares the listing photo with the card's expected official printing; clear physical fakes and wrong-printing photos are hidden.",
  "Listings that end, sell, or go too long without being re-seen in an eBay scan stop being shown as live deals.",
];

// Longer, self-contained sentences for /methodology and /how-it-works.
// Written to be quotable in isolation.
export const TRUST_STATEMENTS = {
  whatItDoes:
    "Pokemon Deal Finder tracks Pokemon card and sealed-product listings on eBay and compares each one against recent-sold market-reference pricing to identify listings priced below market. It also keeps catalogue-backed Pokemon, card and set pages that show reference prices even when there is no live deal - a catalogued card is not a deal.",
  belowMarket:
    "A listing is only presented as below market after its total price - item price plus shipping - is compared against a recent-sold market reference for that card in that condition, and only when it is meaningfully below that reference. Listings priced far below the reference are excluded rather than shown as a headline discount, because at that level a wrong card, a fake, or a damaged item is more likely than a real bargain.",
  identityMatching:
    "Before a listing is trusted it is matched to one exact catalogue printing. The card name and set must appear in the listing, and conflicting identity evidence - a different collector number, a different card form such as Mega versus non-Mega, an ex/EX/GX distinction, or a different language - causes the listing to be excluded rather than forced onto the closest card.",
  visualScreening:
    "Selected higher-risk listings can receive an additional image-based check that compares the listing photo with the card's expected official printing. This can identify a listing whose photo shows an obvious physical counterfeit or novelty reproduction, and a listing whose photo is a genuine card but a different printing than the one described. It is automated, only runs on a subset of listings, and is not card authentication or grading.",
  counterfeitVsIdentity:
    "A counterfeit result means the photo shows a fake or novelty reproduction rather than a genuine card. A wrong-printing result means the card looks genuine but is not the printing the listing claims. Both cause the listing to be hidden, but only the first is treated as a counterfeit.",
  premium:
    "The site's most prominent recommendations - the homepage promotional modules and the curated best-deals lists - use a stricter standard than ordinary browsing. A sufficiently high-value, deeply discounted non-graded listing has to have passed the image check before it can appear in those placements.",
  freshness:
    "Auctions known to have ended are removed automatically. A listing that has gone too long without being re-seen in an eBay scan stops being promoted as a live deal, on a schedule that is shorter for higher-value and more deeply discounted cards. A separate, bounded process re-checks individual eBay items directly and retires ones that have ended or sold. Historical database rows are kept for internal history even after they stop being shown.",
  freshnessLimit:
    "The site records when each listing was last seen in an eBay scan; that is not the same as confirming the exact item on eBay at that moment. Prices and availability can change between scans, so every figure is accurate only as of the last time the listing was seen.",
  limitations:
    "Card-to-listing matching and image screening are automated and will occasionally be wrong. Market pricing depends on a third-party data source and can be thin for very obscure or very new cards. Always open the eBay listing and check its photos and description before buying.",
};
