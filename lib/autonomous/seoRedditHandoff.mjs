// Phase SOCIAL-AUTOPILOT-1 §21/§22 - FUTURE-READY SEO + REDDIT HANDOFFS.
//
// Neither is activated this phase (no SEO page generation, no Reddit
// posting). Both handoffs are pure derivations of the already-frozen
// snapshot + editorial decision, persisted on the story package so a
// LATER phase can consume them without re-deriving facts.

export const SEO_REDDIT_HANDOFF_VERSION = "auto1.1";

export function buildSeoHandoff(pkg) {
  const snap = pkg.snapshot;
  if (!snap) return null;
  const cardMeta = Object.values(snap.canonical_card_metadata ?? {});
  const first = cardMeta[0] ?? {};
  return {
    topic: pkg.family,
    pokemon: first.name ?? null,
    card: (snap.canonical_card_ids ?? [])[0] ?? null,
    set: first.set ?? null,
    query_intent: pkg.bucket === "PRICE_EDUCATION" || pkg.bucket === "PRINTING_EDUCATION" ? "informational" : "commercial",
    story_angle: pkg.editorial_angle,
    facts: {
      prices: snap.prices, market_reference_values: snap.market_reference_values,
      derived_percentages: snap.derived_percentages, tracked_population: snap.tracked_population,
    },
    source_refs: snap.fact_trace ?? [],
    related_site_route: routeFor(pkg),
    internal_link_opportunities: (snap.canonical_card_ids ?? []).map((id) => `/cards/${id}`),
  };
}

function routeFor(pkg) {
  if ((pkg.snapshot?.canonical_card_ids ?? []).length === 1) return `/cards/${pkg.snapshot.canonical_card_ids[0]}`;
  if (pkg.family === "market_snapshot" || pkg.family === "price_band_insight") return "/market-data";
  return "/deals";
}

export function buildRedditHandoff(pkg) {
  const snap = pkg.snapshot;
  if (!snap) return null;
  return {
    story_id: pkg.story_id,
    editorial_angle: pkg.editorial_angle,
    facts: {
      prices: snap.prices, market_reference_values: snap.market_reference_values,
      derived_percentages: snap.derived_percentages, tracked_population: snap.tracked_population,
    },
    recommended_subreddit_style: pkg.bucket === "PRINTING_EDUCATION" ? "educational/discussion (r/PokemonTCG-style)" : "market-observation (no affiliate link)",
    commercial_risk: snap.classification === "COMMERCIAL" ? "HIGH - affiliate-adjacent, omit link" : "LOW - editorial/educational",
    omit_affiliate_link: true,
    suggested_discussion_framing: pkg.editorial_angle,
    posting_automated: false,
  };
}
