// Phase SOCIAL-DISCOVERY-1 SS28 - RELATED SITE ROUTE.
//
// Uses ONLY real, already-existing repo route/slug logic - never invents
// a path. Priority: specific card page -> Pokemon page -> set page ->
// category/deal page -> homepage.

import { slugifySet } from "../../slugify.js";
import { catalogCardSlug } from "../../cardSlug.js";
// pokemonSpecies.js is deliberately CommonJS (shared with lib/deals.js and
// a plain-node audit script) - imported the same way the rest of this
// codebase already does (see marketData.mjs / captionEntityLock.mjs).
import { speciesSlug } from "../../pokemonSpecies.js";
import { entityArrays } from "./entities.mjs";

const FAMILY_FALLBACK_ROUTE = Object.freeze({
  market_snapshot: "/market-data",
  price_band_insight: "/market-data/pokemon-card-value-distribution",
  asking_vs_sold: "/deals",
  deal_drop: "/deals",
  printing_compare: "/guides/vintage-vs-modern-pokemon-cards",
  three_under_25: "/deals",
  evergreen: "/guides",
});

/**
 * resolveRelatedSiteRoute(pkg) -> { route, tier, reason }
 * tier: "card" | "pokemon" | "set" | "category" | "homepage"
 */
export function resolveRelatedSiteRoute(pkg) {
  const { card_entities, pokemon_entities, set_entities } = entityArrays(pkg);
  const primaryCard = card_entities[0] ?? null;
  const primarySet = set_entities[0] ?? null;
  const primaryPokemon = pokemon_entities[0] ?? null;

  if (primaryCard && primarySet) {
    return { route: `/cards/${catalogCardSlug(primaryCard, primarySet)}`, tier: "card", reason: `specific card page for "${primaryCard}" (${primarySet})` };
  }
  if (primaryPokemon) {
    const slug = speciesSlug(primaryPokemon);
    if (slug) return { route: `/pokemon/${slug}`, tier: "pokemon", reason: `species page for "${primaryPokemon}"` };
  }
  if (primarySet) {
    return { route: `/sets/${slugifySet(primarySet)}`, tier: "set", reason: `set page for "${primarySet}"` };
  }
  const fallback = FAMILY_FALLBACK_ROUTE[pkg?.family] ?? "/";
  return { route: fallback, tier: fallback === "/" ? "homepage" : "category", reason: `family-level fallback for "${pkg?.family}"` };
}
