// Phase 13C.6.0 - turns the aggregate report object into human-readable
// text. Pure formatting only - no new numbers are computed here.

const line = (n = 60) => "-".repeat(n);

function fmtLane(name, lane, { showDealImpressions = false } = {}) {
  const rows = [
    `  ${name}`,
    `    section impressions:        ${lane.impressions}`,
  ];
  if (showDealImpressions && lane.dealImpressions != null) {
    rows.push(`    deal-card impressions:      ${lane.dealImpressions}`);
  }
  rows.push(
    `    lane clicks:                ${lane.clicks}  (${lane.clickRatePer1000}/1,000 impressions)`,
    `    affiliate clicks:           ${lane.affiliateClicks}  (${lane.affiliateRatePer1000}/1,000 impressions)`,
    `    sample status:              ${lane.status}`
  );
  return rows.join("\n");
}

export function formatText(report) {
  const out = [];
  out.push("POKEMONDEALFINDER HOMEPAGE CONVERSION REPORT");
  out.push(line());
  out.push(`Measurement window: ${report.window.from}  ->  ${report.window.to}`);
  if (report.measurementContext?.productState) {
    out.push(`Product state:      ${report.measurementContext.productState}`);
  }
  if (report.measurementContext?.instrumentationStart) {
    out.push(`Historical instrumentation start: ${report.measurementContext.instrumentationStart}`);
  }
  out.push(`Generated:          ${report.window.generatedAt}`);
  out.push(`Homepage views:     ${report.homepageViews}`);
  out.push("");
  out.push("All figures are AGGREGATE COUNTS only. No person, session, card,");
  out.push("Pokemon, listing, or query-text data is included anywhere below.");

  out.push("");
  out.push("SEARCH VS DISCOVER");
  out.push(line());
  const sd = report.searchVsDiscover;
  out.push(`  Hero search    focus ${sd.hero.focus}  started ${sd.hero.started}  submitted ${sd.hero.submitted}`);
  out.push(`  Sticky search  focus ${sd.sticky.focus}  started ${sd.sticky.started}  submitted ${sd.sticky.submitted}`);
  out.push(`  Combined (hero+sticky) started ${sd.combined.started}  submitted ${sd.combined.submitted}`);
  out.push(`  Discover CTA clicks: ${sd.discoverClicks}`);
  out.push(`  Search starts    / 1,000 homepage views: ${sd.searchStartsPer1000}`);
  out.push(`  Search submits   / 1,000 homepage views: ${sd.searchSubmitsPer1000}`);
  out.push(`  Discover clicks  / 1,000 homepage views: ${sd.discoverClicksPer1000}`);
  out.push(`  Sample status: ${sd.status} (side-by-side comparison only, not a recommendation)`);

  out.push("");
  out.push("BEST DEALS (flagship, Buy It Now)");
  out.push(line());
  out.push(fmtLane("best_deals", report.bestDeals, { showDealImpressions: true }));
  out.push(`    BIN affiliate clicks (site-wide, structural check): ${report.affiliateByListingType.BIN}`);

  out.push("");
  out.push("AUCTIONS (ending_soon)");
  out.push(line());
  out.push(fmtLane("ending_soon", report.auctions, { showDealImpressions: true }));
  out.push(`    AUCTION affiliate clicks (site-wide, structural check): ${report.affiliateByListingType.AUCTION}`);
  if (report.bestDeals.status === "READY" && report.auctions.status === "READY") {
    out.push(`  Best Deals vs Auctions QCA/1,000: ${report.bestDeals.affiliateRatePer1000} vs ${report.auctions.affiliateRatePer1000} (directional only)`);
  } else {
    out.push("  Best Deals vs Auctions: not compared yet - one or both lanes are LOW SAMPLE");
  }

  out.push("");
  out.push("ALL DEALS");
  out.push(line());
  const ad = report.allDeals;
  out.push(`  section impressions:          ${ad.impressions}`);
  out.push(`  filter_bar_impression:        ${ad.filterBarImpressions}`);
  out.push(`  filter interactions (applied/cleared/sort/country): ${ad.filterInteractions}  (${ad.filterRatePer1000}/1,000 impressions)`);
  out.push(`  affiliate clicks (home_all_deals): ${ad.affiliateClicks}  (${ad.affiliateRatePer1000}/1,000 impressions)`);
  out.push(`  sample status: ${ad.status}`);
  out.push("  (no per-card impression exists for this grid by design - not fabricated here)");

  out.push("");
  out.push("JUST ADDED");
  out.push(line());
  out.push(fmtLane("just_added", report.justAdded, { showDealImpressions: true }));
  out.push("  (this phase does not recommend removing or keeping the lane)");

  out.push("");
  out.push("EXPLORE POKEMON CARDS");
  out.push(line());
  const ex = report.explore;
  out.push(`  section impressions: ${ex.impressions}`);
  out.push(`  most_active_clicked:        ${ex.clicksByType.most_active_clicked}`);
  out.push(`  browse_catalogue_clicked:   ${ex.clicksByType.browse_catalogue_clicked}`);
  out.push(`  browse_sets_clicked:        ${ex.clicksByType.browse_sets_clicked}`);
  out.push(`  browse_pokemon_clicked:     ${ex.clicksByType.browse_pokemon_clicked}`);
  out.push(`  total Browse engagement / 1,000 impressions: ${ex.ratePer1000}`);
  out.push(`  sample status: ${ex.status}`);

  out.push("");
  out.push("RECENTLY VIEWED");
  out.push(line());
  out.push(`  section impressions: ${report.recentlyViewed.impressions}`);
  out.push(`  CLICK COVERAGE: ${report.recentlyViewed.clickCoverage}`);
  out.push(`  sample status: ${report.recentlyViewed.status}`);

  out.push("");
  out.push("SITE-WIDE QCA CONTEXT (affiliate_click / search_result_clicked / qualified_detail_view)");
  out.push(line());
  out.push(`  affiliate_click total:                 ${report.qca.affiliate_click}`);
  out.push(`  search_result_clicked total:            ${report.qca.search_result_clicked}`);
  out.push(`  qualified_detail_view total:            ${report.qca.qualified_detail_view}`);
  out.push(`  qualified_detail_view from homepage:    ${report.qca.qualified_detail_view_from_homepage}`);
  out.push("  (qualified_detail_view's origin_section is homepage/search/internal/unknown only -");
  out.push("   it cannot be attributed to a specific homepage LANE; only affiliate_click can, above)");

  out.push("");
  out.push("DEVICE");
  out.push(line());
  for (const [event, counts] of Object.entries(report.device)) {
    out.push(`  ${event}: ${JSON.stringify(counts)}`);
  }

  out.push("");
  out.push("TRAFFIC SOURCE");
  out.push(line());
  for (const [event, counts] of Object.entries(report.trafficSource)) {
    out.push(`  ${event}: ${JSON.stringify(counts)}`);
  }

  out.push("");
  out.push("DECISION READINESS");
  out.push(line());
  for (const d of report.decisionReadiness) {
    out.push(`  [${d.status.padEnd(17)}]  ${d.question}  (sample: ${d.sample})`);
  }
  out.push("");
  out.push("This report never recommends a homepage change. LOW SAMPLE / MISSING");
  out.push("COVERAGE rows must not be treated as a verdict.");

  return out.join("\n");
}
