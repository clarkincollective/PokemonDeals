// Phase 13C.6.0 - pure aggregation/classification logic. Everything here
// takes already-fetched, already-aggregate rows (never a live PostHog
// connection) so it is fully unit-testable with fixtures. No I/O.

import { EVENTS } from "./homepageEvents.mjs";

// ---- sample-size rule (reused verbatim from the Phase 13C.5 guidance) --
export const MIN_IMPRESSIONS_FOR_DIRECTIONAL_CTR = 1000;
export const MIN_CLICKS_FOR_QCA_COMPARISON = 30;
export const MIN_QCA_FOR_QCA_COMPARISON = 15;

// "READY" here means only "enough volume to look at directionally" - it
// is never a recommendation, and the report never calls anything a
// winner/loser/underperformer.
export function sampleStatus({ impressions = 0, clicks = 0, qca = 0 }) {
  if (impressions < MIN_IMPRESSIONS_FOR_DIRECTIONAL_CTR) return "LOW SAMPLE";
  if (clicks < MIN_CLICKS_FOR_QCA_COMPARISON && qca < MIN_QCA_FOR_QCA_COMPARISON) return "LOW SAMPLE";
  return "READY";
}

// Safe rate per N (default 1,000). Never Infinity, never a misleading 0%.
export function ratePer(numerator, denominator, per = 1000) {
  if (!denominator) return "N/A";
  const v = (Number(numerator) / Number(denominator)) * per;
  return v.toFixed(v >= 100 ? 0 : 1);
}

const sum = (rows) => rows.reduce((acc, r) => acc + (Number(r.n) || 0), 0);
const where = (rows, pred) => rows.filter(pred);

// rows: the flat array from query.rowsFromResponse(). Builds every count
// this report needs. Pure grouping/summing only - no rates, no
// classification (that happens in buildReport below).
export function aggregateRows(rows) {
  const r = rows || [];
  const byEvent = (name) => where(r, (x) => x.event === name);
  const bySectionImpression = (section) => sum(where(byEvent(EVENTS.HOMEPAGE_SECTION_IMPRESSION), (x) => x.section === section));
  const byDealImpression = (section) => sum(where(byEvent(EVENTS.DEAL_CARD_IMPRESSION), (x) => x.section === section));
  const byAffiliateOrigin = (origin) => sum(where(byEvent(EVENTS.AFFILIATE_CLICK), (x) => x.origin_section === origin));
  const byListingType = (event, listingType) => sum(where(byEvent(event), (x) => x.listing_type === listingType));
  const bySource = (event, source) => sum(where(byEvent(event), (x) => x.source === source));
  const breakdownBy = (event, prop) => {
    const out = {};
    for (const row of byEvent(event)) {
      const key = row[prop] ?? "unknown";
      out[key] = (out[key] || 0) + row.n;
    }
    return out;
  };

  return {
    homepageViews: sum(byEvent(EVENTS.HOMEPAGE_VIEW)),
    discoverClicks: sum(byEvent(EVENTS.DISCOVER_DEALS_CLICKED)),

    heroFocus: bySource(EVENTS.HERO_SEARCH_FOCUS, "hero"),
    stickyFocus: bySource(EVENTS.HERO_SEARCH_FOCUS, "sticky"),
    heroSearchStarted: bySource(EVENTS.SEARCH_STARTED, "hero"),
    stickySearchStarted: bySource(EVENTS.SEARCH_STARTED, "sticky"),
    heroSearchSubmitted: bySource(EVENTS.SEARCH_SUBMITTED, "hero"),
    stickySearchSubmitted: bySource(EVENTS.SEARCH_SUBMITTED, "sticky"),

    sections: {
      best_deals: { impressions: bySectionImpression("best_deals"), dealImpressions: byDealImpression("best_deals") },
      ending_soon: { impressions: bySectionImpression("ending_soon"), dealImpressions: byDealImpression("ending_soon") },
      just_added: { impressions: bySectionImpression("just_added"), dealImpressions: byDealImpression("just_added") },
      all_deals: { impressions: bySectionImpression("all_deals") },
      browse: { impressions: bySectionImpression("browse") },
      recently_viewed: { impressions: bySectionImpression("recently_viewed") },
      how_it_works: { impressions: bySectionImpression("how_it_works") },
      guides: { impressions: bySectionImpression("guides") },
    },

    laneClicks: {
      best_deal_clicked: sum(byEvent(EVENTS.BEST_DEAL_CLICKED)),
      ending_soon_clicked: sum(byEvent(EVENTS.ENDING_SOON_CLICKED)),
      just_added_clicked: sum(byEvent(EVENTS.JUST_ADDED_CLICKED)),
      most_active_clicked: sum(byEvent(EVENTS.MOST_ACTIVE_CLICKED)),
      browse_catalogue_clicked: sum(byEvent(EVENTS.BROWSE_CATALOGUE_CLICKED)),
      browse_sets_clicked: sum(byEvent(EVENTS.BROWSE_SETS_CLICKED)),
      browse_pokemon_clicked: sum(byEvent(EVENTS.BROWSE_POKEMON_CLICKED)),
    },

    // affiliate_click is the one event that is directly, honestly
    // attributable to a specific homepage lane via origin_section (see
    // components/DealCard.js / AffiliateLink.js) - unlike
    // qualified_detail_view, whose origin_section is only the coarse
    // "homepage"/"search"/"internal", not a specific lane (see
    // components/analytics/DetailViewAnalytics.js). This report never
    // pretends otherwise.
    affiliateByOrigin: {
      best_deals: byAffiliateOrigin("best_deals"),
      ending_soon: byAffiliateOrigin("ending_soon"),
      just_added: byAffiliateOrigin("just_added"),
      home_all_deals: byAffiliateOrigin("home_all_deals"),
    },
    affiliateByListingType: {
      BIN: byListingType(EVENTS.AFFILIATE_CLICK, "BIN"),
      AUCTION: byListingType(EVENTS.AFFILIATE_CLICK, "AUCTION"),
    },

    filterBarImpressions: sum(byEvent(EVENTS.FILTER_BAR_IMPRESSION)),
    filterInteractions:
      sum(byEvent(EVENTS.FILTER_APPLIED)) +
      sum(byEvent(EVENTS.FILTER_CLEARED)) +
      sum(byEvent(EVENTS.SORT_CHANGED)) +
      sum(byEvent(EVENTS.COUNTRY_CHANGED)),

    // site-wide QCA context (NOT lane-attributed beyond affiliate_click,
    // per the origin_section limitation noted above)
    qca: {
      affiliate_click: sum(byEvent(EVENTS.AFFILIATE_CLICK)),
      search_result_clicked: sum(byEvent(EVENTS.SEARCH_RESULT_CLICKED)),
      qualified_detail_view: sum(byEvent(EVENTS.QUALIFIED_DETAIL_VIEW)),
      qualified_detail_view_from_homepage: sum(where(byEvent(EVENTS.QUALIFIED_DETAIL_VIEW), (x) => x.origin_section === "homepage")),
    },

    deviceBreakdown: {
      homepage_view: breakdownBy(EVENTS.HOMEPAGE_VIEW, "device_class"),
      search_submitted: breakdownBy(EVENTS.SEARCH_SUBMITTED, "device_class"),
      discover_deals_clicked: breakdownBy(EVENTS.DISCOVER_DEALS_CLICKED, "device_class"),
      affiliate_click: breakdownBy(EVENTS.AFFILIATE_CLICK, "device_class"),
    },
    trafficSourceBreakdown: {
      homepage_view: breakdownBy(EVENTS.HOMEPAGE_VIEW, "traffic_source"),
    },
  };
}

// Builds the full report object (aggregate-only; safe to JSON.stringify
// verbatim - no person/session data ever enters this object).
export function buildReport(m, { from, to, generatedAt = new Date().toISOString() } = {}) {
  const searchStarts = m.heroSearchStarted + m.stickySearchStarted;
  const searchSubmits = m.heroSearchSubmitted + m.stickySearchSubmitted;

  const lane = (section, clickKey, affiliateOriginKey) => {
    const impressions = m.sections[section]?.impressions ?? 0;
    const clicks = m.laneClicks[clickKey] ?? 0;
    const qca = affiliateOriginKey != null ? m.affiliateByOrigin[affiliateOriginKey] ?? 0 : 0;
    return {
      impressions,
      dealImpressions: m.sections[section]?.dealImpressions,
      clicks,
      affiliateClicks: qca,
      clickRatePer1000: ratePer(clicks, impressions),
      affiliateRatePer1000: ratePer(qca, impressions),
      status: sampleStatus({ impressions, clicks, qca }),
    };
  };

  const bestDeals = lane("best_deals", "best_deal_clicked", "best_deals");
  const auctions = lane("ending_soon", "ending_soon_clicked", "ending_soon");
  const justAdded = lane("just_added", "just_added_clicked", "just_added");

  const browseClicks =
    m.laneClicks.most_active_clicked +
    m.laneClicks.browse_catalogue_clicked +
    m.laneClicks.browse_sets_clicked +
    m.laneClicks.browse_pokemon_clicked;
  const explore = {
    impressions: m.sections.browse.impressions,
    clicksByType: {
      most_active_clicked: m.laneClicks.most_active_clicked,
      browse_catalogue_clicked: m.laneClicks.browse_catalogue_clicked,
      browse_sets_clicked: m.laneClicks.browse_sets_clicked,
      browse_pokemon_clicked: m.laneClicks.browse_pokemon_clicked,
    },
    totalClicks: browseClicks,
    ratePer1000: ratePer(browseClicks, m.sections.browse.impressions),
    status: sampleStatus({ impressions: m.sections.browse.impressions, clicks: browseClicks, qca: 0 }),
  };

  const allDeals = {
    impressions: m.sections.all_deals.impressions,
    filterBarImpressions: m.filterBarImpressions,
    filterInteractions: m.filterInteractions,
    affiliateClicks: m.affiliateByOrigin.home_all_deals,
    filterRatePer1000: ratePer(m.filterInteractions, m.sections.all_deals.impressions),
    affiliateRatePer1000: ratePer(m.affiliateByOrigin.home_all_deals, m.sections.all_deals.impressions),
    status: sampleStatus({ impressions: m.sections.all_deals.impressions, clicks: m.filterInteractions, qca: m.affiliateByOrigin.home_all_deals }),
  };

  const recentlyViewed = {
    impressions: m.sections.recently_viewed.impressions,
    clickCoverage: "NOT CURRENTLY INSTRUMENTED",
    status: "MISSING COVERAGE",
  };

  const searchVsDiscover = {
    homepageViews: m.homepageViews,
    hero: { focus: m.heroFocus, started: m.heroSearchStarted, submitted: m.heroSearchSubmitted },
    sticky: { focus: m.stickyFocus, started: m.stickySearchStarted, submitted: m.stickySearchSubmitted },
    combined: { started: searchStarts, submitted: searchSubmits },
    discoverClicks: m.discoverClicks,
    searchStartsPer1000: ratePer(searchStarts, m.homepageViews),
    searchSubmitsPer1000: ratePer(searchSubmits, m.homepageViews),
    discoverClicksPer1000: ratePer(m.discoverClicks, m.homepageViews),
    status: sampleStatus({ impressions: m.homepageViews, clicks: searchStarts + m.discoverClicks, qca: 0 }),
  };

  const decisionReadiness = [
    { question: "Search vs Discover", sample: `${m.homepageViews} homepage views`, status: searchVsDiscover.status },
    {
      question: "Best Deals vs Auctions",
      sample: `${bestDeals.impressions} / ${auctions.impressions} section impressions`,
      status: bestDeals.status === "READY" && auctions.status === "READY" ? "READY" : "LOW SAMPLE",
    },
    { question: "Just Added vertical cost", sample: `${justAdded.impressions} section impressions`, status: justAdded.status },
    { question: "Explore Pokemon Cards engagement", sample: `${explore.impressions} section impressions`, status: explore.status },
    { question: "All Deals filter engagement", sample: `${allDeals.impressions} section impressions`, status: allDeals.status },
    { question: "Recently Viewed", sample: `${recentlyViewed.impressions} section impressions`, status: "MISSING COVERAGE" },
  ];

  return {
    window: { from, to, generatedAt },
    homepageViews: m.homepageViews,
    searchVsDiscover,
    bestDeals,
    auctions,
    allDeals,
    justAdded,
    explore,
    recentlyViewed,
    otherSections: {
      how_it_works: m.sections.how_it_works,
      guides: m.sections.guides,
    },
    affiliateByListingType: m.affiliateByListingType,
    qca: m.qca,
    device: m.deviceBreakdown,
    trafficSource: m.trafficSourceBreakdown,
    decisionReadiness,
  };
}
