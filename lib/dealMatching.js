// Shared between the scheduled scanner (app/api/refresh-deals) and the
// on-demand card search (app/api/card-search) - both need the exact same
// rules for "is this eBay listing actually the card we think it is, and
// is the seller trustworthy enough to believe the price."

// Filters out obviously-wrong/scam-tier listings (e.g. a $2 "Charizard"
// that's actually a proxy or the wrong item) rather than genuine deals.
const SANITY_FLOOR_PCT = 0.25;
const MIN_SELLER_FEEDBACK_PCT = 95;
const MIN_SELLER_FEEDBACK_SCORE = 10;

// "Choose your card" / "pick your card" listings sell a pool of cards at
// one price - the listing's price isn't actually for the specific card
// we matched it to, so it can't be trusted for a discount calculation.
// acrylic/sketch/coa/fan art/original art catch novelty items (display
// cases, hand-drawn "sketch cards") that aren't the actual TCG card but
// still legitimately mention the card's name in their title.
const EXCLUDED_TITLE_PATTERN =
  /\b(lot|bundle|playset|proxy|custom|repack|digital|code|acrylic|sketch|coa)\b|choose your|pick your|fan ?art|original art|case card|display case|trading service|pokemon ?go\b|account trade/i;

// eBay's search is relevance-based, not a strict title match - a search
// for one card can return a completely different card that just ranks in
// the same category (verified: a "Pikachu" search returned a Darkrai
// promo and a Rayquaza promo, both priced against Pikachu's market
// value). Requires every meaningful word from the card's name to
// actually appear in the listing title before trusting the price
// comparison. Cards whose name has no distinctive token left after
// filtering (rare) skip the check rather than reject everything.
const MATCH_STOPWORDS = new Set([
  "ex", "gx", "v", "vmax", "vstar", "promo", "promos", "full", "art",
  "holo", "holofoil", "near", "mint", "nm", "the", "a", "an", "of",
  "star", "black", "prerelease",
]);

function coreTokens(name) {
  return (name.toLowerCase().match(/[a-z0-9]+/g) ?? []).filter(
    (word) => word.length >= 2 && !MATCH_STOPWORDS.has(word)
  );
}

// card is {name, set} - a watchlist row or a plain object both work.
function listingMatchesCard(listing, card) {
  const normalizedTitle = listing.title.toLowerCase();

  const nameTokens = coreTokens(card.name);
  if (nameTokens.length > 0 && !nameTokens.every((token) => normalizedTitle.includes(token))) return false;

  // The card name alone is often just the Pokemon's name ("Charizard",
  // "Gengar", "Pikachu"...), which is shared across dozens of sets worth
  // wildly different amounts - verified a sweep matched "Charizard" (SM -
  // Team Up) to a listing for a completely different, much more recent
  // "Charizard ex... Paldean Fates" print before this check existed.
  // Requiring the set to match too is what actually disambiguates which
  // specific print a listing is.
  const setTokens = coreTokens(card.set ?? "");
  if (setTokens.length > 0 && !setTokens.every((token) => normalizedTitle.includes(token))) return false;

  // A Japanese-catalog card's name/set text is often the same English
  // romanization TCGPlayer uses for the English print too (e.g. "Pikachu",
  // "Neo Genesis"-style set names appear in both catalogs) - name+set
  // tokens alone can't tell the prints apart. Sellers listing a genuine
  // Japanese-print card overwhelmingly say so in the title, so require it
  // explicitly rather than risk pricing a Japanese print against (or
  // showing up as) an English one.
  if (card.language === "japanese" && !/\bjapan(?:ese)?\b/i.test(listing.title)) return false;

  return true;
}

function isTrustworthyListing(listing) {
  if (EXCLUDED_TITLE_PATTERN.test(listing.title)) return false;
  if (listing.sellerFeedbackScore != null && listing.sellerFeedbackScore < MIN_SELLER_FEEDBACK_SCORE)
    return false;
  if (listing.sellerFeedbackPct != null && listing.sellerFeedbackPct < MIN_SELLER_FEEDBACK_PCT)
    return false;
  return true;
}

// Sealed product needs a different exclusion list than singles -
// "bundle"/"box"/"case"/"display" are legitimate real product types here
// (Build & Battle Bundle, Booster Box, Booster Box Case), not junk-listing
// signals, so unlike EXCLUDED_TITLE_PATTERN above they're deliberately
// absent. This instead excludes listings that plainly aren't genuine
// factory-sealed product.
const SEALED_EXCLUDED_TITLE_PATTERN =
  /\b(opened|empty|resealed|repack|proxy|custom|digital|no product|missing packs?|single pack|loose packs?|damaged box|torn|water ?damage|photo only|picture only|box only|box art only)\b|code only|choose your|pick your|trading service|account trade/i;

function isTrustworthySealedListing(listing) {
  if (SEALED_EXCLUDED_TITLE_PATTERN.test(listing.title)) return false;
  if (listing.sellerFeedbackScore != null && listing.sellerFeedbackScore < MIN_SELLER_FEEDBACK_SCORE)
    return false;
  if (listing.sellerFeedbackPct != null && listing.sellerFeedbackPct < MIN_SELLER_FEEDBACK_PCT)
    return false;
  return true;
}

// product is {name, set} - a sealed_watchlist row or plain object.
// Deliberately the same name+set token logic as listingMatchesCard (reuses
// coreTokens) - "Twilight Masquerade Booster Box" requires "booster" AND
// "box" in the title, so it can't cross-match an Elite Trainer Box (or a
// different set's box) listing.
function listingMatchesSealedProduct(listing, product) {
  const normalizedTitle = listing.title.toLowerCase();

  const nameTokens = coreTokens(product.name);
  if (nameTokens.length > 0 && !nameTokens.every((token) => normalizedTitle.includes(token))) return false;

  const setTokens = coreTokens(product.set ?? "");
  if (setTokens.length > 0 && !setTokens.every((token) => normalizedTitle.includes(token))) return false;

  return true;
}

module.exports = {
  SANITY_FLOOR_PCT,
  MIN_SELLER_FEEDBACK_PCT,
  MIN_SELLER_FEEDBACK_SCORE,
  EXCLUDED_TITLE_PATTERN,
  SEALED_EXCLUDED_TITLE_PATTERN,
  coreTokens,
  listingMatchesCard,
  isTrustworthyListing,
  isTrustworthySealedListing,
  listingMatchesSealedProduct,
};
