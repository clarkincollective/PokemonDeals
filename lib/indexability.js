// The site's indexability rule (brief Phase 20), in one place.
//
// A page qualifies for indexing only if ALL THREE hold:
//
//   1. VERIFIED IDENTITY  - it resolves to a real record, not a guessed
//      or reversed slug. (resolveSetSlug / resolveCardSlug /
//      resolveSpeciesSlug match against the real computed list;
//      /deals/[id] and /sealed-deals/[id] load by primary key.)
//
//   2. CATEGORY / CONTEXT - it sits in a real set or category, not
//      floating. Card hubs and deal pages carry a set; species and set
//      pages ARE the category.
//
//   3. MEANINGFUL DATA    - it has genuine listing or pricing data right
//      now, above a per-page-type minimum, so it isn't thin or a
//      near-duplicate of another page.
//
// Enforcement is distributed (each page type checks at its own data
// layer, which is where the data actually is) rather than one central
// gate, but the thresholds and the live-listing check live here so the
// rule is legible and tunable in one file. See docs/indexability.md for
// the full per-page-type table.

// Card hub (/cards/[slug]): 2+ simultaneous active listings of the exact
// printing. With 1, the hub would be a near-duplicate of that single
// /deals/[id] page - nothing to consolidate. Enforced in
// fetchCardHubsUncached (lib/deals.js): entries below this are dropped
// from the list, so resolveCardSlug can't resolve them and the page
// 404s.
export const CARD_HUB_MIN_LISTINGS = 2;

// Set page (/sets/[slug]): 3+ active deals in the set. A set page is a
// browsable category - a paginated, filterable grid - so it needs enough
// inventory to actually browse. With 1-2 it's one or two deal cards plus
// boilerplate: thin, and it can't serve "<set> card values / deals"
// intent. Enforced in computeAggregates (lib/catalogAggregates.js):
// sub-threshold sets are dropped from the list, so resolveSetSlug can't
// resolve them and the page 404s (and they're not in the sitemap).
export const SET_MIN_LISTINGS = 3;

// Species page (/pokemon/[slug]): 5+ simultaneous active listings for the
// Pokemon across all its printings, so the page carries a real price
// range and spans several prints rather than being one thin listing.
// Enforced in fetchSpeciesHubsUncached (lib/deals.js).
export const SPECIES_MIN_LISTINGS = 5;

// Listing detail (/deals/[id], /sealed-deals/[id]): the row exists and is
// still active. An expired/sold listing is no longer real, buyable data,
// so its page is served with `robots: noindex` (and a plain "expired"
// body) rather than a hard 404 - a link shared before expiry still lands
// somewhere sensible, just not in the index.
export function shouldIndexDeal(deal) {
  return Boolean(deal && deal.is_active);
}
