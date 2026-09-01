// Catalog-backed /pokemon/[slug] hub rules (Phase 4 P1). Dependency-free
// so the route, the sitemap and `node --test` all agree on the same
// thresholds and link precedence.

import { isRealCardName } from "./cardSlug.js";
import { speciesLeadsCardName } from "./pokemonSpecies.js";

// THE shared "does this card belong on /pokemon/<species>" predicate.
// Every consumer - the visible SpeciesCardsBySet grid, the species card
// count, set count, min/max price, ItemList JSON-LD, CollectionPage,
// SPECIES_CATALOG_MIN_CARDS indexability, and the species sitemap - runs
// this, so a card can never be hidden visually yet still counted in
// schema/stats.
//
// Layered, structured-identity first:
//   1. real single card / not a product (code card, box, blister, deck, ...)
//   2. structured card_type, where the catalogue carries it - a Trainer /
//      Energy / anything non-Pokemon is out
//   3. name fallback (card_type is null on the ~29k /export-backfilled
//      rows): the species must LEAD the card name, not be a mid-name
//      mention, and the name must not be an Energy / Spirit Link / Stadium
//   This is an entity-identity test, never a price test - a genuine $0.10
//   Pokemon card stays in; an expensive Trainer/Energy/product is out.
export function isEligibleSpeciesCard(card, species) {
  if (!card || !species) return false;
  const name = card.name ?? "";
  if (!isRealCardName(name)) return false;
  const ct = String(card.cardType ?? card.card_type ?? "").trim().toLowerCase();
  if (ct && !/^pok[eé]mon$/.test(ct)) return false;
  return speciesLeadsCardName(name, species);
}

// A species gets a durable, indexable "prices & values" hub (even with no
// live deal) when it has at least this many real, priced, imaged catalog
// cards - each of which has its own permanent /cards/[slug] (P0). Below
// this it keeps the lean noindex fallback. Lower than SET_CATALOG_MIN_CARDS
// (10) because a species' prints are naturally fewer than a whole set's
// cards.
//
// SEO Phase 2B: lowered 8 -> 6 after a bounded quality audit of the
// exactly-6 and exactly-7-card cohort (72 species, all Gen 3-9
// mid-evolutions / paradox Pokemon). Every one had 6+ real priced imaged
// prints spanning 3+ sets, full card-number coverage, all /cards/[slug]
// resolvable, a genuine price range, and the full Phase 2A template
// (fact strip / price summary / by-set / quick answers) - not doorway
// pages. See docs/seo-species-threshold-experiment.md. Not lowered to 5
// yet; Finizen (5 eligible) stays the control for a later expansion.
export const SPECIES_CATALOG_MIN_CARDS = 6;

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
