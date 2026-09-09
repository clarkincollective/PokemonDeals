// Phase SOCIAL-AUTOPILOT-1 §21/§22 - FUTURE-READY SEO + REDDIT HANDOFFS.
// Phase SOCIAL-DISCOVERY-1 §27 - strengthened (NOT activated - still no
// SEO page generation, no Reddit posting) with real keyword/route data
// from the new discovery engine, and a real routing bug fixed: the old
// routeFor() built `/cards/${numeric_tcgplayer_id}`, which never matched
// the real `/cards/[slug]` route's actual slug format
// (catalogCardSlug(name,set)) - it never surfaced because this handoff
// was never activated. Now reuses discovery/siteRouting.mjs's real,
// already-correct slug logic instead of a second, wrong one.
//
// Both handoffs remain pure derivations of the already-frozen snapshot +
// editorial decision, persisted on the story package so a LATER phase can
// consume them without re-deriving facts.

import { resolveRelatedSiteRoute } from "../newsroom/discovery/siteRouting.mjs";
import { buildKeywordSet } from "../newsroom/discovery/keywordEngine.mjs";

export const SEO_REDDIT_HANDOFF_VERSION = "discovery1.1";

export function buildSeoHandoff(pkg) {
  const snap = pkg.snapshot;
  if (!snap) return null;
  const cardMeta = Object.values(snap.canonical_card_metadata ?? {});
  const first = cardMeta[0] ?? {};
  const route = resolveRelatedSiteRoute(pkg);
  const kw = buildKeywordSet(pkg);
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
    related_site_route: route.route,
    internal_link_opportunities: [route.route, ...(kw.entity_keywords.length ? ["/search"] : [])].filter((v, i, a) => a.indexOf(v) === i),
    // SS27 - new fields connecting SOCIAL <-> SEO without generating anything.
    primary_query: kw.primary_search_query,
    secondary_queries: kw.secondary_search_queries,
    social_topic: kw.caption_keywords[0] ?? pkg.family,
    future_content_cluster: [kw.primary_search_query, ...kw.secondary_search_queries].filter(Boolean),
  };
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
