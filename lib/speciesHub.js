// Catalog-backed /pokemon/[slug] hub rules (Phase 4 P1). Dependency-free
// so the route, the sitemap and `node --test` all agree on the same
// thresholds and link precedence.

// A species gets a durable, indexable "prices & values" hub (even with no
// live deal) when it has at least this many real, priced, imaged catalog
// cards - each of which has its own permanent /cards/[slug] (P0). Below
// this it keeps the lean noindex fallback. Audit-proposed value; lower
// than SET_CATALOG_MIN_CARDS (10) because a species' prints are naturally
// fewer than a whole set's cards.
export const SPECIES_CATALOG_MIN_CARDS = 8;

// `stats` from fetchSpeciesCatalog: { cardCount, pricedCount,
// eligibleCount, setCount, minPrice, maxPrice }. `eligibleCount` = cards
// that are a real card + non-sentinel price + image, i.e. cards that
// actually have a permanent /cards/[slug].
export function speciesIndexable(stats, min = SPECIES_CATALOG_MIN_CARDS) {
  return Boolean(stats) && Number(stats.eligibleCount) >= min;
}

// The permanent card page for a species-catalog card: the deal hub if it
// has live listings, else the P0 catalog page, else null (no page exists
// - render plain text, never a 404 link).
export function cardPermanentHref(card) {
  if (!card) return null;
  if (card.hubSlug) return `/cards/${card.hubSlug}`;
  if (card.catalogSlug) return `/cards/${card.catalogSlug}`;
  return null;
}
