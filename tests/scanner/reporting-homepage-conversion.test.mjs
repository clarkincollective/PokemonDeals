// Phase 13C.6.0 - the read-only PostHog homepage-conversion reporting
// tool. All tests run against fixtures - no live PostHog credentials or
// network access required.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { REPORT_EVENTS, REPORT_PROPERTIES } from "../../scripts/reporting/homepageEvents.mjs";
import {
  buildHomepageQuery,
  rowsFromResponse,
  loadCredentials,
  MissingCredentialsError,
  POSTHOG_EU_APP_HOST,
} from "../../scripts/reporting/query.mjs";
import {
  aggregateRows,
  buildReport,
  sampleStatus,
  ratePer,
  MIN_IMPRESSIONS_FOR_DIRECTIONAL_CTR,
  MIN_CLICKS_FOR_QCA_COMPARISON,
  MIN_QCA_FOR_QCA_COMPARISON,
} from "../../scripts/reporting/aggregate.mjs";
import { formatText } from "../../scripts/reporting/format.mjs";
import { CLEAN_WINDOW_START } from "../../scripts/reportHomepageConversion.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => readFileSync(join(ROOT, p), "utf8");
function walk(dir, out = []) {
  for (const name of readdirSync(join(ROOT, dir))) {
    const rel = `${dir}/${name}`;
    if (statSync(join(ROOT, rel)).isDirectory()) walk(rel, out);
    else out.push(rel);
  }
  return out;
}
const REPORTING_FILES = walk("scripts/reporting").concat(["scripts/reportHomepageConversion.mjs"]);

// ---- fixture: a realistic grouped-aggregate PostHog response ----------
const FIXTURE_RESPONSE = {
  columns: ["event", "section", "source", "origin_section", "listing_type", "device_class", "traffic_source", "n"],
  results: [
    ["homepage_view", null, null, null, null, "mobile", "direct", 700],
    ["homepage_view", null, null, null, null, "desktop", "organic_search", 300],
    ["discover_deals_clicked", null, null, null, null, "mobile", null, 20],
    ["hero_search_focus", null, "hero", null, null, "mobile", null, 50],
    ["hero_search_focus", null, "sticky", null, null, "mobile", null, 12],
    ["search_started", null, "hero", null, null, "mobile", null, 30],
    ["search_started", null, "sticky", null, null, "mobile", null, 9],
    ["search_submitted", null, "hero", null, null, "mobile", null, 14],
    ["search_submitted", null, "sticky", null, null, "mobile", null, 4],
    ["homepage_section_impression", "best_deals", null, null, null, "mobile", null, 1200],
    ["homepage_section_impression", "ending_soon", null, null, null, "mobile", null, 1100],
    ["homepage_section_impression", "all_deals", null, null, null, "mobile", null, 1050],
    ["homepage_section_impression", "just_added", null, null, null, "mobile", null, 40],
    ["homepage_section_impression", "browse", null, null, null, "mobile", null, 900],
    ["homepage_section_impression", "recently_viewed", null, null, null, "mobile", null, 60],
    ["deal_card_impression", "best_deals", null, null, "BIN", "mobile", null, 2400],
    ["deal_card_impression", "ending_soon", null, null, "AUCTION", "mobile", null, 1800],
    ["best_deal_clicked", "best_deals", null, null, null, "mobile", null, 45],
    ["ending_soon_clicked", "ending_soon", null, null, null, "mobile", null, 8],
    ["just_added_clicked", "just_added", null, null, null, "mobile", null, 2],
    ["most_active_clicked", null, null, null, null, "mobile", null, 10],
    ["browse_catalogue_clicked", null, null, null, null, "mobile", null, 6],
    ["browse_sets_clicked", null, null, null, null, "mobile", null, 5],
    ["browse_pokemon_clicked", null, null, null, null, "mobile", null, 7],
    ["affiliate_click", null, null, "best_deals", "BIN", "mobile", null, 18],
    ["affiliate_click", null, null, "ending_soon", "AUCTION", "mobile", null, 3],
    ["affiliate_click", null, null, "home_all_deals", "BIN", "mobile", null, 22],
    ["filter_bar_impression", null, null, null, null, "mobile", null, 1050],
    ["filter_applied", null, null, null, null, "mobile", null, 60],
    ["sort_changed", null, null, null, null, "mobile", null, 5],
    ["qualified_detail_view", null, null, "homepage", null, "mobile", null, 25],
    ["qualified_detail_view", null, null, "search", null, "mobile", null, 40],
    ["search_result_clicked", null, null, null, null, "mobile", null, 33],
  ],
};

function reportFromFixture() {
  const rows = rowsFromResponse(FIXTURE_RESPONSE);
  const metrics = aggregateRows(rows);
  return buildReport(metrics, { from: CLEAN_WINDOW_START, to: "2026-09-11T00:00:00Z" });
}

// === 1. clean window default =======================================

test("13C.6.0 - default --from is the clean measurement window start", () => {
  assert.equal(CLEAN_WINDOW_START, "2026-09-04T20:18:17Z");
  const cli = read("scripts/reportHomepageConversion.mjs");
  assert.match(cli, /from:\s*CLEAN_WINDOW_START/);
  assert.match(cli, /to:\s*new Date\(\)\.toISOString\(\)/);
});

test("13C.6.0 - a --from before the clean window triggers a clear warning, not a silent include", () => {
  const cli = read("scripts/reportHomepageConversion.mjs");
  assert.match(cli, /WARNING: --from/);
  assert.match(cli, /Date\.parse\(args\.from\) < Date\.parse\(CLEAN_WINDOW_START\)/);
});

// === 2. credential contract =========================================

test("13C.6.0 - credentials are environment variables only; missing creds fail clean with instructions", () => {
  assert.throws(() => loadCredentials({}), MissingCredentialsError);
  try {
    loadCredentials({});
  } catch (e) {
    assert.deepEqual(e.missing.sort(), ["POSTHOG_PERSONAL_API_KEY", "POSTHOG_PROJECT_ID"]);
  }
  const creds = loadCredentials({ POSTHOG_PERSONAL_API_KEY: "x", POSTHOG_PROJECT_ID: "123" });
  assert.equal(creds.apiHost, POSTHOG_EU_APP_HOST);
  // a non-EU override is rejected, mirroring lib/analytics/config.js's own EU-only rule
  const rejected = loadCredentials({ POSTHOG_PERSONAL_API_KEY: "x", POSTHOG_PROJECT_ID: "123", POSTHOG_API_HOST: "https://us.posthog.com" });
  assert.equal(rejected.apiHost, POSTHOG_EU_APP_HOST);
});

test("13C.6.0 - no credential name is a NEXT_PUBLIC_ variable and none are logged", () => {
  for (const f of REPORTING_FILES) {
    const src = read(f);
    assert.ok(!/NEXT_PUBLIC_POSTHOG_PERSONAL|NEXT_PUBLIC_POSTHOG_PROJECT/.test(src));
    assert.ok(!/console\.(log|error|warn)\([^)]*apiKey/i.test(src), `${f} may log the API key`);
  }
});

test("13C.6.0 - the CLI never accepts credentials as a flag", () => {
  const cli = read("scripts/reportHomepageConversion.mjs");
  assert.ok(!/--key|--api-key|--token/.test(cli));
});

// === 3. no website runtime dependency ================================

test("13C.6.0 - nothing under app/ or components/ imports the reporting tool", () => {
  const appFiles = [...walk("app"), ...walk("components")].filter((f) => /\.jsx?$/.test(f));
  for (const f of appFiles) {
    const src = read(f);
    assert.ok(!/scripts\/report|scripts\/reporting/.test(src), `${f} must not import the reporting tool`);
  }
});

test("13C.6.0 - the reporting tool does not import next/react or ship as an API route", () => {
  for (const f of REPORTING_FILES) {
    const src = read(f);
    assert.ok(!/from ["']react["']|from ["']next/.test(src));
  }
  // no app/api route re-exports it
  const apiFiles = walk("app/api").filter((f) => /route\.js$/.test(f));
  for (const f of apiFiles) {
    assert.ok(!/scripts\/report/.test(read(f)), `${f} must not expose the reporting tool as an endpoint`);
  }
});

// === 4. no second event taxonomy / privacy property exclusions ======

test("13C.6.0 - events are imported from the real taxonomy, never redeclared", () => {
  const src = read("scripts/reporting/homepageEvents.mjs");
  assert.match(src, /from "\.\.\/\.\.\/lib\/analytics\/events\.js"/);
  assert.ok(!/const EVENTS = \{/.test(src), "must not redefine EVENTS locally");
  assert.ok(REPORT_EVENTS.length > 15);
});

test("13C.6.0 - only approved structural properties are ever selected; no identity/query properties", () => {
  const forbidden = ["query", "card_name", "pokemon", "title", "deal_id", "content_id", "card_slug", "affiliate_url", "distinct_id", "person", "$session_id", "rank", "price_band_usd", "discount_band"];
  for (const p of forbidden) assert.ok(!REPORT_PROPERTIES.includes(p), `${p} must not be a selected report property`);
  assert.deepEqual([...REPORT_PROPERTIES].sort(), ["device_class", "listing_type", "origin_section", "section", "source", "traffic_source"].sort());

  const query = buildHomepageQuery("2026-09-04T20:18:17Z", "2026-09-11T00:00:00Z");
  // check the exact property-ACCESS form ("properties.<name>"), not a
  // naive substring - several event names legitimately contain these
  // words (e.g. browse_pokemon_clicked contains "pokemon").
  for (const p of forbidden) assert.ok(!query.query.includes(`properties.${p}`), `query text must not select properties.${p}`);
  assert.ok(!/properties\.q\b/.test(query.query), "must not select the raw query property");
  assert.ok(!/properties\.ip\b|\$ip\b/i.test(query.query));
  assert.ok(!/distinct_id|person\.|properties\.\$ip/i.test(query.query));
});

// === 5. Search hero vs sticky ========================================

test("13C.6.0 - hero and sticky search sources are reported separately AND combined", () => {
  const report = reportFromFixture();
  assert.equal(report.searchVsDiscover.hero.started, 30);
  assert.equal(report.searchVsDiscover.sticky.started, 9);
  assert.equal(report.searchVsDiscover.combined.started, 39);
  assert.equal(report.searchVsDiscover.hero.submitted, 14);
  assert.equal(report.searchVsDiscover.sticky.submitted, 4);
  assert.equal(report.searchVsDiscover.combined.submitted, 18);
  assert.equal(report.searchVsDiscover.discoverClicks, 20);
});

// === 6. lane mappings =================================================

test("13C.6.0 - lane impressions/clicks/affiliate map to the correct section", () => {
  const report = reportFromFixture();
  assert.equal(report.bestDeals.impressions, 1200);
  assert.equal(report.bestDeals.clicks, 45);
  assert.equal(report.bestDeals.affiliateClicks, 18);
  assert.equal(report.auctions.impressions, 1100);
  assert.equal(report.auctions.clicks, 8);
  assert.equal(report.auctions.affiliateClicks, 3);
  assert.equal(report.allDeals.impressions, 1050);
  assert.equal(report.allDeals.affiliateClicks, 22);
  assert.equal(report.justAdded.impressions, 40);
  assert.equal(report.explore.impressions, 900);
  assert.equal(report.explore.clicksByType.most_active_clicked, 10);
  assert.equal(report.explore.totalClicks, 10 + 6 + 5 + 7);
  assert.equal(report.recentlyViewed.impressions, 60);
  assert.equal(report.recentlyViewed.status, "MISSING COVERAGE");
});

// === 7. QCA definition ================================================

test("13C.6.0 - QCA totals are affiliate_click / search_result_clicked / qualified_detail_view, and lane QCA is affiliate_click only", () => {
  const report = reportFromFixture();
  assert.equal(report.qca.affiliate_click, 18 + 3 + 22);
  assert.equal(report.qca.search_result_clicked, 33);
  assert.equal(report.qca.qualified_detail_view, 25 + 40);
  assert.equal(report.qca.qualified_detail_view_from_homepage, 25);
  // the report text explains why qualified_detail_view isn't lane-attributed
  const text = formatText(report);
  assert.match(text, /cannot be attributed to a specific homepage LANE/);
});

// === 8. sample thresholds + decision-readiness classifications =======

test("13C.6.0 - sample thresholds match the Phase 13C.5 rule exactly", () => {
  assert.equal(MIN_IMPRESSIONS_FOR_DIRECTIONAL_CTR, 1000);
  assert.equal(MIN_CLICKS_FOR_QCA_COMPARISON, 30);
  assert.equal(MIN_QCA_FOR_QCA_COMPARISON, 15);
  assert.equal(sampleStatus({ impressions: 999, clicks: 100, qca: 100 }), "LOW SAMPLE");
  assert.equal(sampleStatus({ impressions: 1000, clicks: 29, qca: 14 }), "LOW SAMPLE");
  assert.equal(sampleStatus({ impressions: 1000, clicks: 30, qca: 0 }), "READY");
  assert.equal(sampleStatus({ impressions: 1000, clicks: 0, qca: 15 }), "READY");
});

test("13C.6.0 - decision-readiness table never says winner/loser/remove", () => {
  const report = reportFromFixture();
  const text = formatText(report);
  assert.ok(!/\bwinner\b|\bloser\b|\bremove\b|\bunderperform/i.test(text));
  for (const d of report.decisionReadiness) {
    assert.ok(["READY", "LOW SAMPLE", "MISSING COVERAGE"].includes(d.status));
  }
  // Recently Viewed is always MISSING COVERAGE regardless of impression volume
  const rv = report.decisionReadiness.find((d) => d.question === "Recently Viewed");
  assert.equal(rv.status, "MISSING COVERAGE");
});

test("13C.6.0 - Best Deals vs Auctions is only compared when BOTH lanes are individually READY", () => {
  const report = reportFromFixture(); // best_deals 1200 impr/45 clicks -> READY; ending_soon 1100/8 clicks/3 qca -> LOW SAMPLE (8<30, 3<15)
  assert.equal(report.bestDeals.status, "READY");
  assert.equal(report.auctions.status, "LOW SAMPLE");
  const bva = report.decisionReadiness.find((d) => d.question === "Best Deals vs Auctions");
  assert.equal(bva.status, "LOW SAMPLE");
});

// === 9. zero-denominator handling ====================================

test("13C.6.0 - a zero denominator renders N/A, never Infinity or a misleading 0%", () => {
  assert.equal(ratePer(5, 0), "N/A");
  assert.equal(ratePer(0, 0), "N/A");
  assert.equal(ratePer(0, 100), "0.0");
  const empty = buildReport(aggregateRows([]), { from: CLEAN_WINDOW_START, to: "2026-09-11T00:00:00Z" });
  assert.equal(empty.justAdded.clickRatePer1000, "N/A");
  assert.equal(empty.allDeals.filterRatePer1000, "N/A");
  const text = formatText(empty);
  assert.ok(!/Infinity/.test(text));
});

// === 10. --json output ================================================

test("13C.6.0 - --json prints only the aggregate report object, no text banner", () => {
  const cli = read("scripts/reportHomepageConversion.mjs");
  assert.match(cli, /if \(args\.json\) \{\s*console\.log\(JSON\.stringify\(report, null, 2\)\);/);
  const report = reportFromFixture();
  const json = JSON.stringify(report);
  assert.doesNotThrow(() => JSON.parse(json));
  // the JSON itself carries no identity property
  for (const bad of ["distinct_id", "person", "\"q\":", "card_name", "affiliate_url", "$ip"]) {
    assert.ok(!json.includes(bad), `serialized report must not contain ${bad}`);
  }
});

// === 11. no write operations =========================================

test("13C.6.0 - the tool issues exactly one query, never a write/mutation call", () => {
  const stripComments = (s) =>
    s
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .split("\n")
      .filter((l) => !l.trim().startsWith("//"))
      .join("\n");
  for (const f of REPORTING_FILES) {
    const src = stripComments(read(f));
    assert.ok(!/\bcapture\(/.test(src), `${f} must never call capture()`);
    assert.ok(!/\bidentify\(|\balias\(|\.group\(/.test(src));
    assert.ok(!/method:\s*["'](PUT|PATCH|DELETE)["']/.test(src), `${f} must not use a mutating HTTP method`);
    assert.ok(!/\/api\/projects\/[^/]*\/(dashboards|insights|cohorts|persons|feature_flags)\b/.test(src), `${f} must not touch a write-capable PostHog resource`);
  }
  // the one endpoint it does call is the read-only query API, via POST (the
  // Query API's read semantics use POST for the query body, not a mutation)
  const q = read("scripts/reporting/query.mjs");
  assert.match(q, /\/api\/projects\/\$\{encodeURIComponent\(projectId\)\}\/query\//);
  assert.equal((q.match(/fetchImpl\(|await fetch\(/g) ?? []).length, 1, "exactly one network call site");
});

// === 12. API efficiency ===============================================

test("13C.6.0 - the whole report is built from a single grouped query (no per-metric loop of calls)", () => {
  const q = read("scripts/reporting/query.mjs");
  assert.match(q, /GROUP BY/);
  assert.ok(!/for\s*\(.*await runPostHogQuery/s.test(q), "must not loop calling the API per metric");
  const cli = read("scripts/reportHomepageConversion.mjs");
  assert.equal((cli.match(/runPostHogQuery\(/g) ?? []).length, 1);
});
