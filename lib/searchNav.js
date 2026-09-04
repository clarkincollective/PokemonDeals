// Phase 13B.4.x / 13B.5.3 - pure link + copy helpers for the /search
// interpretation panel. No React, no I/O - unit-testable in node --test.
//
// The hard rules these encode:
//   * a destination that DROPS a constraint (species-only, set-only) must
//     be LABELLED as a broadening, never as if it preserved the intent.
//   * permanent-route links (/pokemon, /sets, /cards) carry the NORMALISED
//     structured filters only - never the raw `q` text.

function qsFrom(src) {
  const p = new URLSearchParams();
  if (src && typeof src === "object") {
    for (const [k, v] of Object.entries(src)) {
      if (v != null && v !== "") p.set(k, String(v));
    }
  }
  return p.toString();
}

// /pokemon/<species> - carries the current normalised deal facets
// (resolution.pokemon_link_query), never raw q. Returns null with no slug.
export function speciesDealsHref(interpreted, resolution) {
  const slug = interpreted?.species_slug;
  if (!slug) return null;
  let src = resolution?.pokemon_link_query ?? null;
  if (!src) {
    const i = interpreted ?? {};
    src = {};
    if (i.format === "graded") src.type = "graded";
    else if (i.format === "raw") src.type = "raw";
    if (i.grader) src.grader = i.grader;
    if (i.grade != null) src.grade = String(i.grade);
    if (i.listing_type === "AUCTION") src.listing = "AUCTION";
    else if (i.listing_type === "BIN") src.listing = "BIN";
    if (i.price_max != null) src.maxPrice = String(i.price_max);
    if (i.price_min != null) src.minPrice = String(i.price_min);
  }
  const qs = qsFrom(src);
  return qs ? `/pokemon/${slug}?${qs}` : `/pokemon/${slug}`;
}

// /cards/<slug> for a resolved exact card - carries resolution.filter_query.
export function exactCardHref(exact, resolution) {
  if (!exact?.card_slug) return null;
  const base = `/cards/${exact.card_slug}`;
  const qs = qsFrom(resolution?.filter_query ?? null);
  return qs ? `${base}?${qs}` : base;
}

// /sets/<slug> - only when the route confirmed a real set page
// (resolution.set_link). Carries resolution.filter_query.
export function setDealsHref(resolution) {
  const base = resolution?.set_link;
  if (!base) return null;
  const qs = qsFrom(resolution?.filter_query ?? null);
  return qs ? `${base}?${qs}` : base;
}

// 13B.5.3 - the truthful copy for species × set intersection states.
// `mode` is resolution.mode; `species` / `set` are the interpreted values.
export function intersectionCopy({ mode, species, set } = {}) {
  const isSpeciesSet = mode === "species_set";
  const isNoMatch = mode === "species_set_no_match";
  const hasBoth = Boolean(species && set) && (isSpeciesSet || isNoMatch);
  return {
    isSpeciesSet,
    isNoMatch,
    hasSetConstraint: hasBoth,
    // headline shown for a valid intersection ("Umbreon cards in <set>")
    headline: isSpeciesSet && hasBoth ? `Showing ${species} cards in ${set}` : null,
    // the "no such card in the set" fact (stronger than "no deals")
    noMatchLine:
      isNoMatch && hasBoth
        ? `Our catalogue has no ${species} card in ${set}.`
        : null,
    // broadening-link labels - MUST name the constraint being dropped
    broadenSpeciesLabel: hasBoth
      ? `View all ${species} deals — every set →`
      : species
        ? `View all matching ${species} deals →`
        : null,
    broadenSetLabel: hasBoth
      ? `Browse the whole ${set} set →`
      : set
        ? `Browse ${set} deals →`
        : null,
    dropSetLabel: species ? `Search ${species} only (drop the set)` : null,
  };
}
