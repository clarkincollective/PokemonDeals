// Catalogue-backed /sets/[slug] hub rules (SEO Phase 4A). The set-level
// twin of lib/speciesHub.js - same ESM shape, dependency-light, so the
// route, the sitemap and `node --test` all agree on one threshold.
//
// TWO paths make a /sets/[slug] page indexable, and they never mix:
//   - DEAL path:      >= SET_MIN_LISTINGS (3) active below-market deals
//                     in the set  (lib/indexability.js, computeAggregates)
//   - CATALOGUE path: >= SET_CATALOG_MIN_CARDS real, priced, imaged
//                     catalogue cards - each with its own permanent
//                     /cards/[slug] - even with zero live deals
//
// SET_MIN_LISTINGS is unchanged. This file only adds the catalogue bar.

import { catalogCardIndexable } from "./cardSlug.js";

// A set's "eligible" catalogue card = one that has an INDEXABLE permanent
// /cards/[slug]: a real single card (not a box/tin/code card), imaged, a
// stable id, AND a non-sentinel market price. Exactly the same predicate
// the species hub and the cards sitemap use - never a parallel one.
export function setEligibleCard(row) {
  return catalogCardIndexable(row);
}

// SEO Phase 4A: chosen from the production audit (see
// docs/seo-set-catalogue-expansion.md). At 10, the newly-indexable
// cohort is 60 sets - dominated by major modern expansions missing a
// page only for lack of live deals today (SWSH / SV base sets, Crown
// Zenith, Celebrations, Shining Fates, Champion's Path, Pokemon GO) plus
// legitimate small promo / trainer-kit sets (McDonald's yearly promos,
// Burger King Promos, EX/DP Trainer Kits). Every one has 100% image
// coverage, ~90-100% card-number coverage, real market references and
// real species. Below 10 the remainder is thin deck-kit / Energy-only
// junk (0-9 eligible cards). Same numeric value the browse grid already
// used - now the indexability gate too.
export const SET_CATALOG_MIN_CARDS = 10;

// `stats` from fetchSetCatalog: { cardCount, totalCards, pricedCount,
// eligibleCount, rarityCount }. eligibleCount is the indexability basis.
export function setIndexable(stats, min = SET_CATALOG_MIN_CARDS) {
  return Boolean(stats) && Number(stats.eligibleCount) >= min;
}
