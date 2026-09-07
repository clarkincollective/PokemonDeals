// eBay Partner Network affiliate sub-ID attribution (customid /
// affiliateReferenceId). A small, FIXED, privacy-safe allowlist of coarse
// product surfaces - never a card/listing/deal/user identity, never a
// search query, never a marketplace/country. This is the ONLY module
// allowed to decide what string reaches eBay's customid param; every
// caller in the app goes through affiliateSurface() or
// surfaceForPageName() below, never a raw string of its own construction.
//
// See docs/ebay-affiliate-attribution.md for the full policy, the
// rationale for reusing the existing `pageName` analytics taxonomy as the
// mapping source (rather than inventing a second parallel prop
// everywhere), and the explicit non-goals (no PostHog/user-identity
// crossover, no per-country cardinality, no per-card/listing granularity).

const AFFILIATE_SURFACES = new Set([
  "home_best",
  "home_auction",
  "home_all",
  "home_just_added",
  "best_finds",
  "deals",
  "auctions",
  "search",
  "pokemon",
  "set",
  "card",
  "deal_page",
  "recently_viewed",
  "other",
]);

// The ONLY function that decides what reaches eBay's customid param. Any
// value not on the fixed allowlist above - including undefined, a typo,
// or a caller accidentally passing something identity-shaped - resolves
// to "other" rather than ever reaching eBay verbatim. Deterministic, no
// I/O, no randomness.
function affiliateSurface(value) {
  return typeof value === "string" && AFFILIATE_SURFACES.has(value) ? value : "other";
}

// The site's existing internal `pageName` prop (DealCard / SealedDealCard
// / SpeciesCard / DetailViewAnalytics, used today for Vercel Analytics /
// PostHog page-type context) already carries a similar but more granular,
// implementation-specific taxonomy ("home_ending", "deals_index",
// "card_hub", "species_detail", ...). Reusing pageName as the SOURCE -
// never inventing a second parallel prop at every render site - keeps
// wiring this up a one-line addition wherever a card/CTA component
// already receives pageName. This table is the one place that maps that
// internal vocabulary onto the public, fixed EPN surface enum; anything
// not listed here (including a future pageName nobody has mapped yet)
// deliberately falls through to "other" via affiliateSurface() above,
// never a guess. pageName itself is a coarse page-TYPE label, never a
// user/session/card/deal identity, so reusing it here crosses no privacy
// boundary (see docs/ebay-affiliate-attribution.md's PostHog-separation
// note).
const PAGE_NAME_TO_SURFACE = {
  home_best: "home_best",
  home_ending: "home_auction",
  home_all_deals: "home_all",
  home_fresh: "home_just_added",
  best_finds: "best_finds",
  deals_index: "deals",
  price_checker: "search",
  card_hub: "card",
  species_detail: "pokemon",
  set_detail: "set",
  set_detail_sealed: "set",
  species_catalog: "pokemon",
  species_card: "pokemon",
  // UX-CVR-1 - the "more live deals" module on a deal detail / expired
  // deal page. Still a deal-page surface for EPN attribution.
  deal_related: "deal_page",
};

function surfaceForPageName(pageName) {
  return affiliateSurface(PAGE_NAME_TO_SURFACE[pageName]);
}

module.exports = { AFFILIATE_SURFACES, affiliateSurface, surfaceForPageName, PAGE_NAME_TO_SURFACE };
