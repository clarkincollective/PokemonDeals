// SEO Phase 4B - the ONE rule for "which /pokemon/[slug] does a permanent
// card page link to", shared by both /cards/[slug] render paths (the live
// deal hub in app/cards/[slug]/page.js and the catalogue fallback in
// components/CatalogCardView.js). Phase 0 found these two paths disagreed:
// the deal hub only linked a species that had cleared the deal threshold,
// the catalogue path linked its raw `species` column with no leads check
// (so a Trainer/Energy card that merely names a Pokemon could get a bogus
// link). This resolves both to the same predicate.
//
// Dependency-light (pokemonSpecies + speciesHub, both node-testable) so
// the route, the component and `node --test` agree.

import { extractSpecies, speciesLeadsCardName, speciesSlug } from "./pokemonSpecies.js";
import { isEligibleSpeciesCard } from "./speciesHub.js";

// The canonical Pokemon a card page should link to, or null.
//
//   - species identity must LEAD the card name (token 0, or just after an
//     owner possessive / form modifier) - never a mid-title mention.
//   - Trainer / Energy / Stadium / Spirit-Link names are rejected
//     (isEligibleSpeciesCard runs speciesLeadsCardName + the non-species
//     name guard, and the structured card_type when we have it).
//   - every canonical National Pokedex species resolves to a 200
//     /pokemon/[slug] (indexable when it has a hub, noindex-follow
//     otherwise), so a non-null result is always a live internal link.
//
// `card`: { name, cardType?, species? }. `species` (the card_catalog
// column) is trusted as the candidate when present; otherwise it's
// extracted from the name. Either way it must pass the leads check.
export function cardSpeciesLink(card) {
  if (!card) return null;
  const name = card.name ?? "";
  if (!name) return null;
  const candidate = card.species || extractSpecies(name);
  if (!candidate) return null;
  if (!isEligibleSpeciesCard({ name, card_type: card.cardType ?? card.card_type ?? null }, candidate)) {
    return null;
  }
  const slug = speciesSlug(candidate);
  return slug ? { name: candidate, slug } : null;
}

// Re-exported so callers importing from here don't also reach into
// pokemonSpecies for the raw helpers.
export { extractSpecies, speciesLeadsCardName, speciesSlug };
