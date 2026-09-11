// Phase 17C.0 - analytics correction. Fixtures + fake runners only: no
// network, no PostHog credentials, no browser. (The real-browser pass -
// initial load, SPA navigation, reload, duplicate prevention - runs
// against a local production build with PostHog requests intercepted
// inside Chrome; see the phase notes.)

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { createPageViewTracker, ATTRIBUTION_SCOPES, NAV_TYPES } from "../../lib/analytics/pageview.js";
import { EVENTS, ALLOWED_EVENTS } from "../../lib/analytics/events.js";
import { classifyTrafficSource, sanitizeUtmValue, geoCountryProp, viewerCountryFromMarketplace, isAiAssistantUtm } from "../../lib/analytics/props.js";
import { sanitizeProps, buildBeforeSend, CLICK_ID_KEYS } from "../../lib/analytics/sanitize.js";
import { buildPostHogConfig } from "../../lib/analytics/config.js";
import { buildHomepageQuery, buildEventTotalsQuery, lastGroupKey, REPORT_PAGE_SIZE } from "../../scripts/reporting/query.mjs";
import { fetchCompleteReport, checkCompleteness, eventTotalsFromResponse, withoutSuspectedTestDays, IncompleteReportError } from "../../scripts/reporting/fetch.mjs";
import { aggregateRows, buildReport, headlineCounts } from "../../scripts/reporting/aggregate.mjs";
import { formatText } from "../../scripts/reporting/format.mjs";
import { REPORT_EVENTS, SUSPECTED_TEST_TRAFFIC, CONTINUITY_NOTES } from "../../scripts/reporting/homepageEvents.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => readFileSync(join(ROOT, p), "utf8");
const code = (p) => read(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");

// ===================================================================
// 1. page_view - initial load, SPA navigation, reload, dedupe
// ===================================================================

test("1. initial load fires one page_view with the landing context; a strict-mode / re-render repeat fires nothing", () => {
  const t = createPageViewTracker();
  const v = t.next("/cards/magneton-base-set", { navigationType: "navigate", trafficSource: "ai_assistant" });
  assert.deepEqual(v.props, { page_type: "card", nav_type: "initial", page_index: 1, attribution_scope: "landing", landing_page_type: "card" });
  assert.deepEqual(v.landingContext, { landing_page_type: "card" });
  assert.equal(t.next("/cards/magneton-base-set", { trafficSource: "ai_assistant" }), null, "same pathname again = no second view");
  assert.equal(t.next("/cards/magneton-base-set/", {}), null, "trailing slash is the same page");
});

test("2. client (SPA) navigation fires once per new pathname, carries the ORIGINAL landing attribution, never re-lands", () => {
  const t = createPageViewTracker();
  t.next("/", { trafficSource: "ai_assistant" });
  const a = t.next("/search", { trafficSource: "ai_assistant" });
  assert.deepEqual(a.props, { page_type: "search", nav_type: "client", page_index: 2, attribution_scope: "carried", landing_page_type: "home" });
  assert.equal(a.landingContext, null, "the landing context is set once per page-load chain");
  const b = t.next("/deals/34858", {});
  assert.equal(b.props.page_type, "deal");
  assert.equal(b.props.page_index, 3);
  // back to an earlier page (A -> B -> A) is a real new view
  assert.equal(t.next("/search", {}).props.page_index, 4);
});

test("3. a querystring-only change is not a page view (search terms / filters never create views, and the path never carries a query)", () => {
  const t = createPageViewTracker();
  t.next("/search", {});
  assert.equal(t.next("/search?q=charizard", {}), null);
  assert.equal(t.next("/search#results", {}), null);
  const v = createPageViewTracker().next("/search?q=pikachu+psa+10", {});
  assert.equal(v.props.page_type, "search");
  assert.doesNotMatch(JSON.stringify(v), /pikachu|psa|\?|q=/, "no query text anywhere in the payload");
});

test("4. reload / back-forward = a NEW page-load chain (fresh tracker), labelled by its navigation type; internal full loads are not new acquisitions", () => {
  // reload of a landing page reached from ChatGPT (utm still in the URL)
  const reload = createPageViewTracker().next("/cards/x", { navigationType: "reload", trafficSource: "ai_assistant" });
  assert.equal(reload.props.nav_type, "reload");
  assert.equal(reload.props.attribution_scope, "landing");
  // back/forward into a fresh page load
  assert.equal(createPageViewTracker().next("/", { navigationType: "back_forward" }).props.nav_type, "back_forward");
  // a full page load from this site (new tab, plain <a href>, reload of an internal page)
  const internal = createPageViewTracker().next("/deals/1", { navigationType: "navigate", trafficSource: "internal" });
  assert.equal(internal.props.attribution_scope, "internal_full_load");
  assert.equal(internal.props.nav_type, "initial");
  assert.deepEqual([...ATTRIBUTION_SCOPES].sort(), ["carried", "internal_full_load", "landing"]);
  assert.deepEqual([...NAV_TYPES].sort(), ["back_forward", "client", "initial", "reload"]);
});

test("5. page_view payload is structural only and survives the sanitiser unchanged; page_index is capped", () => {
  const t = createPageViewTracker();
  let last;
  for (let i = 0; i < 70; i++) last = t.next(`/cards/c${i}`, {}) ?? last;
  assert.equal(last.props.page_index, 50, "capped - no unbounded counter");
  const p = createPageViewTracker().next("/sets/base-set", { trafficSource: "direct" }).props;
  assert.deepEqual(Object.keys(p).sort(), ["attribution_scope", "landing_page_type", "nav_type", "page_index", "page_type"]);
  assert.deepEqual(sanitizeProps(p), p);
  for (const bad of [undefined, null, "", "cards/x", 42]) assert.equal(createPageViewTracker().next(bad, {}), null);
});

test("6. page_view is a declared event; the bootstrap fires it from usePathname, after the attribution effect, from a module-level tracker", () => {
  assert.equal(EVENTS.PAGE_VIEW, "page_view");
  assert.ok(ALLOWED_EVENTS.has("page_view"));
  const src = code("components/analytics/AnalyticsBootstrap.js");
  assert.match(src, /import \{ usePathname \} from "next\/navigation";/);
  assert.match(src, /^const pageViews = createPageViewTracker\(\);/m, "module scope: survives client navigation, resets on full load, dedupes a strict-mode double mount");
  const attributionAt = src.indexOf("readLandingAttribution()");
  const pageViewAt = src.indexOf("pageViews.next(pathname");
  assert.ok(attributionAt > 0 && pageViewAt > attributionAt, "the landing context is set before the first page_view");
  assert.match(src, /\}, \[pathname\]\);/, "fires on pathname change only");
  assert.match(src, /capture\(EVENTS\.PAGE_VIEW, view\.props\)/);
  assert.equal((src.match(/capture\(EVENTS\.PAGE_VIEW/g) ?? []).length, 1, "one emitter");
  // the homepage keeps its own module event, unchanged - reports never add the two
  assert.match(read("components/analytics/HomepageAnalytics.js"), /capture\(EVENTS\.HOMEPAGE_VIEW/);
});

// ===================================================================
// 2. attribution - ChatGPT / AI assistants
// ===================================================================

test("7. ChatGPT's utm_source=chatgpt.com survives the sanitiser and classifies as ai_assistant (it used to be dropped -> 'direct')", () => {
  assert.equal(sanitizeUtmValue("chatgpt.com"), "chatgpt.com");
  assert.equal(sanitizeUtmValue("ChatGPT.com"), "chatgpt.com");
  assert.equal(classifyTrafficSource({ utmSource: sanitizeUtmValue("chatgpt.com"), referrer: "" }), "ai_assistant");
  // the old failure mode reproduced: an unsanitised-away utm + no referrer read as direct
  assert.equal(classifyTrafficSource({ utmSource: undefined, referrer: "" }), "direct");
  // other URL-shaped utm values are still rejected - the allowlist is exact
  for (const bad of ["evil.com", "chatgpt.com.evil.io", "https://chatgpt.com", "chatgpt.com/x", "x@chatgpt.com"]) {
    assert.equal(sanitizeUtmValue(bad), undefined, bad);
  }
  assert.equal(isAiAssistantUtm("perplexity"), true);
  assert.equal(isAiAssistantUtm("chatgpt.com.evil.io"), false);
});

test("8. AI-assistant referrers classify as ai_assistant - including gemini.google.com, which must not read as Google organic search", () => {
  for (const host of ["chatgpt.com", "chat.openai.com", "www.perplexity.ai", "gemini.google.com", "copilot.microsoft.com", "claude.ai"]) {
    assert.equal(classifyTrafficSource({ referrer: `https://${host}/`, currentHost: "pokemondealfinder.com" }), "ai_assistant", host);
  }
  assert.equal(classifyTrafficSource({ referrer: "https://www.google.com/", currentHost: "pokemondealfinder.com" }), "organic_search");
  assert.equal(classifyTrafficSource({ referrer: "https://pokemondealfinder.com/cards/x", currentHost: "pokemondealfinder.com" }), "internal");
  // an explicit paid medium still wins
  assert.equal(classifyTrafficSource({ utmSource: "chatgpt.com", utmMedium: "cpc" }), "paid_search");
});

test("9. ai_assistant is documented as a traffic source, never as a verified customer", () => {
  const props = read("lib/analytics/props.js");
  assert.match(props, /says only WHERE the click came from -\s*\/\/ not who the visitor is, and not that they are a customer/);
  assert.ok(CONTINUITY_NOTES.length >= 3);
  assert.match(formatText(buildReport(aggregateRows([]), { from: "a", to: "b", continuityNotes: CONTINUITY_NOTES })), /not a customer or purchase signal/);
});

// ===================================================================
// 3. geography vs shopping context
// ===================================================================

test("10. geo_country is the edge-reported ISO-2 country or 'unknown' - never derived from marketplace / currency", () => {
  assert.equal(geoCountryProp("us"), "US");
  assert.equal(geoCountryProp("BR"), "BR", "countries we don't scan are still real geography");
  for (const v of [null, undefined, "", "XX", "USA", "1", "U S"]) assert.equal(geoCountryProp(v), "unknown", String(v));
  // the legacy marketplace bucket still behaves as before (continuity), and is not geography
  assert.equal(viewerCountryFromMarketplace("EBAY_AU"), "AU");
  assert.equal(viewerCountryFromMarketplace(null), "other");
  const boot = code("components/analytics/AnalyticsBootstrap.js");
  assert.match(boot, /geo_country: geoCountryProp\(geoCountry\)/);
  assert.doesNotMatch(boot, /geo_country:\s*[^,\n]*marketplace/, "geography never comes from the marketplace");
  assert.doesNotMatch(boot, /geo_country:\s*[^,\n]*viewer\b/, "...or the currency");
});

test("11. /api/rates exposes the coarse country from the SAME edge header; the currency cache never stores it", () => {
  const geo = code("lib/geo.js");
  assert.match(geo, /export async function edgeCountry\(\)/);
  assert.match(geo, /\/\^\[A-Z\]\{2\}\$\/\.test\(country\) && country !== "XX" \? country : null/);
  const rates = code("app/api/rates/route.js");
  assert.match(rates, /geo_country: geoCountry/);
  assert.match(rates, /"Cache-Control": "private, max-age=900"/, "still a per-visitor private response");
  const cp = code("components/CurrencyProvider.js");
  assert.match(cp, /const \{ geoCountry: _notCached, \.\.\.cacheable \} = clientSnapshot;/);
  assert.match(cp, /JSON\.stringify\(\{ \.\.\.cacheable, ts: Date\.now\(\) \}\)/);
  assert.match(cp, /rates: parsed\.rates,\s*geoCountry: null,/, "a cached prime never carries geography");
});

// ===================================================================
// 4. search result_type
// ===================================================================

test("12. search_result_clicked carries an explicit result_type (deal | card); raw search text still never sent", () => {
  const src = code("app/search/SearchClient.js");
  const blocks = [...src.matchAll(/capture\(EVENTS\.SEARCH_RESULT_CLICKED, \{([\s\S]*?)\}\);/g)].map((m) => m[1]);
  assert.equal(blocks.length, 2);
  assert.match(blocks[0], /surface: "deal",\s*result_type: "deal",/);
  assert.match(blocks[1], /surface: "catalog",\s*result_type: "card",/);
  for (const b of blocks) assert.doesNotMatch(b, /\bq\b|query|search_term|\.name\b|displayName/, "no query / free text in the click payload");
});

// ===================================================================
// 5. report - truncation, pagination, completeness, sensitivity
// ===================================================================

const COLS = ["event", "section", "source", "origin_section", "listing_type", "device_class", "traffic_source", "page_type", "day_flag", "n", "group_key_n", "group_key"];
const row = (event, n, key, over = {}) => {
  const r = { event, section: null, source: null, origin_section: null, listing_type: null, device_class: "mobile", traffic_source: "direct", page_type: null, day_flag: "normal", n, group_key_n: Number(key), group_key: String(key), ...over };
  return COLS.map((c) => r[c]);
};

test("13. every page query is explicitly ordered + limited and keyset-paged (never OFFSET); the totals query is independent", () => {
  const first = buildHomepageQuery("2026-09-03T00:00:00Z", "2026-09-11T00:00:00Z").query;
  assert.match(first, /ORDER BY group_key_n\nLIMIT 5000$/);
  assert.doesNotMatch(first, /OFFSET|group_key_n >|AND cityHash64\(.*\) >/s);
  const next = buildHomepageQuery("2026-09-03T00:00:00Z", "2026-09-11T00:00:00Z", REPORT_EVENTS, { afterKey: "18446744073709551000" }).query;
  assert.match(next, /\) > 18446744073709551000\n/);
  assert.throws(() => buildHomepageQuery("a", "b", REPORT_EVENTS, { afterKey: "1; DROP" }), /unsigned integer/);
  assert.throws(() => buildHomepageQuery("a", "b", REPORT_EVENTS, { limit: 0 }), /positive integer limit/);
  assert.equal(REPORT_PAGE_SIZE, 5000);
  const totals = buildEventTotalsQuery("2026-09-03T00:00:00Z", "2026-09-11T00:00:00Z").query;
  assert.match(totals, /SELECT\n  event,\n  count\(\) AS n\nFROM events/);
  assert.match(totals, /GROUP BY event\nORDER BY event\nLIMIT 1000$/);
  assert.doesNotMatch(totals, /event IN/, "the independent count covers EVERY event, so the report can state its scope");
  // the historical AI reclassification compares against a fixed allowlist - it never SELECTs utm_source
  assert.match(first, /lower\(ifNull\(properties\.utm_source, ''\)\) IN \('chatgpt\.com'/);
  assert.doesNotMatch(first, /properties\.utm_source AS|properties\.\$referring_domain AS/);
  // the group key is returned as a string (no 64-bit precision loss in JSON)
  assert.match(first, /toString\(group_key_n\) AS group_key/);
});

test("14. REGRESSION: a grouped response that stops at 100 rows with hasMore is paged onward, not silently read as complete", async () => {
  // page 1: exactly the old failure shape - 100 rows, hasMore:true, all of them early-alphabet events
  const page1 = Array.from({ length: 100 }, (_, i) => row(i < 60 ? "affiliate_click" : "deal_card_impression", 1, 1000 + i));
  const page2 = [row("homepage_view", 664, 5000), row("page_view", 10, 5001, { page_type: "card" })];
  const totals = { columns: ["event", "n"], results: [["affiliate_click", 60], ["deal_card_impression", 40], ["homepage_view", 664], ["page_view", 10]] };
  const calls = [];
  const run = async ({ query }) => {
    calls.push(query.query);
    if (/GROUP BY event\nORDER BY event/.test(query.query)) return totals;
    if (!/\) > \d+\n/.test(query.query)) return { columns: COLS, results: page1, hasMore: true };
    return { columns: COLS, results: page2, hasMore: false };
  };
  const out = await fetchCompleteReport({ creds: {}, from: "a", to: "b", pageSize: 100 }, run);
  assert.equal(out.pages, 2);
  assert.equal(calls.length, 3, "two pages + one independent totals query");
  assert.match(calls[1], /\) > 1099\n/, "page 2 starts after the last key of page 1");
  assert.equal(out.completeness.complete, true);
  const m = aggregateRows(out.rows);
  assert.equal(m.homepageViews, 664, "the old tool reported 0 here");
  assert.equal(m.pageViews, 10);
});

test("15. completeness: any grouped-vs-independent difference fails loudly and names the events", () => {
  const rows = [{ event: "homepage_view", n: 100 }, { event: "affiliate_click", n: 5 }];
  const bad = checkCompleteness(rows, { homepage_view: 664, affiliate_click: 5 });
  assert.equal(bad.complete, false);
  assert.deepEqual(bad.mismatches, [{ event: "homepage_view", grouped: 100, independent: 664 }]);
  const text = formatText(buildReport(aggregateRows(rows), { from: "a", to: "b", completeness: bad }));
  assert.match(text, /Completeness:\s+FAILED - 1 event\(s\) differ .* DO NOT USE/);
  assert.match(text, /homepage_view: grouped 100 vs independent 664/);
  const good = checkCompleteness(rows, { homepage_view: 100, affiliate_click: 5 });
  assert.equal(good.complete, true);
  assert.match(formatText(buildReport(aggregateRows(rows), { from: "a", to: "b", completeness: good, completenessPages: 1 })), /Completeness:\s+VERIFIED/);
  // an event only one side knows about is a mismatch too
  assert.equal(checkCompleteness(rows, { homepage_view: 100, affiliate_click: 5, page_view: 3 }).complete, false);
});

test("16. partial results are refused: truncated totals, a page cap, or a keyset that does not advance all throw", async () => {
  assert.throws(() => eventTotalsFromResponse({ columns: ["event", "n"], results: [], hasMore: true }), IncompleteReportError);
  const full = { columns: COLS, results: Array.from({ length: 10 }, (_, i) => row("affiliate_click", 1, 7)), hasMore: true };
  await assert.rejects(fetchCompleteReport({ creds: {}, from: "a", to: "b", pageSize: 10, maxPages: 5 }, async () => full), (e) => e instanceof IncompleteReportError && /did not advance/.test(e.message));
  let k = 0;
  const endless = async () => ({ columns: COLS, results: Array.from({ length: 10 }, () => row("affiliate_click", 1, ++k)), hasMore: true });
  await assert.rejects(fetchCompleteReport({ creds: {}, from: "a", to: "b", pageSize: 10, maxPages: 3 }, endless), (e) => e instanceof IncompleteReportError && /after 3 pages/.test(e.message));
  assert.equal(lastGroupKey({ columns: COLS, results: [] }), null);
});

test("17. pageviews come from page_view ONLY - homepage_view is never added to them", () => {
  const m = aggregateRows([
    { event: "page_view", page_type: "home", n: 40 },
    { event: "page_view", page_type: "card", n: 25 },
    { event: "homepage_view", n: 40 },
  ]);
  assert.equal(m.pageViews, 65);
  assert.deepEqual(m.pageViewsByType, { home: 40, card: 25 });
  assert.equal(m.homepageViews, 40);
  const agg = code("scripts/reporting/aggregate.mjs");
  assert.doesNotMatch(agg, /\bpageViews:[^\n]*HOMEPAGE_VIEW/);
  assert.match(agg, /\bpageViews: sum\(byEvent\(EVENTS\.PAGE_VIEW\)\),/);
});

test("18. suspected test traffic is a SENSITIVITY comparison, never an automatic exclusion", () => {
  const rows = [
    { event: "affiliate_click", n: 66, day_flag: "suspected_test" },
    { event: "affiliate_click", n: 221, day_flag: "normal" },
  ];
  const main = aggregateRows(rows);
  assert.equal(main.qca.affiliate_click, 287, "main figures include everything");
  assert.equal(headlineCounts(aggregateRows(withoutSuspectedTestDays(rows))).affiliate_click, 221);
  assert.equal(SUSPECTED_TEST_TRAFFIC[0].day, "2026-09-04");
  assert.ok(SUSPECTED_TEST_TRAFFIC[0].reason.length > 40, "a flag always carries its evidence");
  const cli = code("scripts/reportHomepageConversion.mjs");
  assert.match(cli, /const metrics = aggregateRows\(rows\);/, "the main report is built from ALL rows");
  assert.match(cli, /withoutFlagged: headlineCounts\(aggregateRows\(withoutSuspectedTestDays\(rows\)\)\)/);
  const text = formatText(buildReport(main, { from: "a", to: "b", sensitivity: { flags: SUSPECTED_TEST_TRAFFIC, all: headlineCounts(main), withoutFlagged: headlineCounts(aggregateRows(withoutSuspectedTestDays(rows))) } }));
  assert.match(text, /main figures above INCLUDE it/);
  assert.match(text, /no figure in this report is automatically excluded/);
});

test("19. continuity is labelled from VERIFIED behaviour: server-side sessions span full page loads, the site's in-memory context does not, and cross-day continuity is not measurable", () => {
  const cfg = code("lib/analytics/config.js");
  assert.match(cfg, /cookieless_mode: "always"/);
  assert.match(cfg, /persistence: "memory"/);
  const notes = CONTINUITY_NOTES.join(" ");
  assert.match(notes, /INCLUDING across full page loads \(verified on production data\)/);
  assert.doesNotMatch(notes, /Sessions reset on every FULL page load/, "the earlier audit claim was disproved and must not reappear");
  assert.match(notes, /Across days nothing can be joined/);
  assert.match(notes, /internal_full_load/);
  assert.match(notes, /recovered in analysis from the first event of its server-side session/);
  // the evidence is recorded where the notes are defined
  assert.match(read("scripts/reporting/homepageEvents.mjs"), /changed 99 times,\n\/\/ every one after a >= 30-minute gap/);
  // and no new persistence was introduced anywhere in the analytics layer for this
  for (const f of ["lib/analytics/pageview.js", "components/analytics/AnalyticsBootstrap.js", "lib/analytics/props.js"]) {
    assert.doesNotMatch(code(f), /localStorage|sessionStorage|document\.cookie|indexedDB/i, f);
  }
});

// ===================================================================
// 6. final pre-send checks (17C.0 closeout)
// ===================================================================

const runBeforeSend = (event) => buildBeforeSend().reduce((e, fn) => (e == null ? e : fn(e)), event);

test("20. the SDK no longer copies landing-URL campaign params onto events (save_campaign_params off)", () => {
  const cfg = buildPostHogConfig({ beforeSend: [] });
  assert.equal(cfg.save_campaign_params, false);
  // the rest of the privacy posture is unchanged
  assert.equal(cfg.cookieless_mode, "always");
  assert.equal(cfg.persistence, "memory");
});

test("21. the FINAL payload keeps only approved attribution: click IDs, utm_term, bad utm values, null campaign keys, search keywords and their $initial_ copies are removed", () => {
  const sdkShaped = {
    event: EVENTS.SEARCH_RESULT_CLICKED,
    properties: {
      token: "phc_x",
      distinct_id: "$posthog_cookieless",
      $lib: "web",
      $current_url: "https://pokemondealfinder.com/cards/charizard-base-set?gclid=Cj0&utm_term=psa",
      // what posthog-js attaches from the landing URL when campaign capture is on
      utm_source: "chatgpt.com",
      utm_medium: "social",
      utm_campaign: "reach-me@example.com",
      utm_content: null,
      utm_term: "psa 10 charizard",
      ph_keyword: "charizard psa 10",
      $search_keyword: "charizard",
      $initial_gclid: "Cj0",
      $initial_utm_source: "chatgpt.com",
      $initial_utm_term: "psa",
      ...Object.fromEntries(CLICK_ID_KEYS.map((k) => [k, "abc123"])),
      // our structural props, which must survive
      card_slug: "charizard-base-set",
      result_type: "card",
      surface: "catalog",
      rank: 3,
      traffic_source: "ai_assistant",
      geo_country: "BR",
    },
  };
  const out = runBeforeSend(sdkShaped);
  assert.ok(out, "the event itself is kept");
  const p = out.properties;
  for (const k of [...CLICK_ID_KEYS, "utm_term", "ph_keyword", "$search_keyword", "$initial_gclid", "$initial_utm_term", "utm_campaign", "utm_content"]) {
    assert.ok(!(k in p), `${k} must not leave the browser`);
  }
  assert.equal(p.utm_source, "chatgpt.com", "an approved AI-assistant source is kept");
  assert.equal(p.utm_medium, "social");
  assert.equal(p.$initial_utm_source, "chatgpt.com");
  assert.equal(p.$current_url, "https://pokemondealfinder.com/cards/charizard-base-set", "querystring (with click ids) stripped");
  assert.equal(p.card_slug, "charizard-base-set", "valid card slug preserved");
  assert.equal(p.result_type, "card", "result_type preserved");
  assert.equal(p.token, "phc_x", "ingestion token untouched");
  assert.equal(p.distinct_id, "$posthog_cookieless");
  assert.equal(p.geo_country, "BR");
  // an unapproved utm value is removed, an approved one is kept verbatim
  assert.equal(runBeforeSend({ event: EVENTS.PAGE_VIEW, properties: { utm_source: "https://evil.example/x" } }).properties.utm_source, undefined);
  assert.equal(runBeforeSend({ event: EVENTS.PAGE_VIEW, properties: { utm_campaign: "spring_sale" } }).properties.utm_campaign, "spring_sale");
  // the step runs LAST, on the fully assembled event
  const src = code("lib/analytics/sanitize.js");
  assert.match(src, /return \[dropDisallowedEvents, scrubProperties, enforceAttributionAllowlist\];/);
});

test("22. /api/rates can never be shared between visitors: dynamic, private, no shared-cache directives; the FX rate cache is unchanged and holds no visitor data", () => {
  const route = code("app/api/rates/route.js");
  assert.match(route, /export const dynamic = "force-dynamic";/);
  assert.match(route, /"Cache-Control": "private, max-age=900"/);
  assert.doesNotMatch(route, /s-maxage|public|CDN-Cache-Control|Vercel-CDN-Cache-Control|stale-while-revalidate|revalidate\s*=/i);
  assert.doesNotMatch(route, /unstable_cache|"use cache"/);
  // the only cached thing is the exchange-rate table (module memory, 6h) - no header / geo input
  const fx = code("lib/fx.js");
  assert.match(fx, /const CACHE_TTL_MS = 6 \* 60 \* 60 \* 1000;/);
  assert.match(fx, /async function getUsdRates\(\) \{/, "takes no request input");
  assert.doesNotMatch(fx, /headers\(|x-vercel|country/i);
  // nothing re-headers /api/rates for a shared cache
  assert.doesNotMatch(read("vercel.json"), /api\/rates/);
  assert.doesNotMatch(read("next.config.mjs"), /api\/rates/);
});

test("23. the report states its event scope and reconciles it with the all-event total", () => {
  const rows = [{ event: "homepage_view", n: 664 }, { event: "affiliate_click", n: 287 }];
  const totals = { homepage_view: 664, affiliate_click: 287, search_request: 463, homepage_scroll_depth: 500 };
  const c = checkCompleteness(rows, totals, ["homepage_view", "affiliate_click"]);
  assert.equal(c.complete, true, "out-of-scope events are not mismatches");
  assert.deepEqual(c.scope, {
    reportEventNames: 2,
    inScopeTotal: 951,
    allEventsTotal: 1914,
    outOfScopeTotal: 963,
    outOfScope: [{ event: "homepage_scroll_depth", n: 500 }, { event: "search_request", n: 463 }],
  });
  const text = formatText(buildReport(aggregateRows(rows), { from: "a", to: "b", completeness: c, completenessPages: 1 }));
  assert.match(text, /951 = 951 report-scope events/);
  assert.match(text, /Report scope:\s+951 of 1914 events in this window are this report's 2 selected event types;/);
  assert.match(text, /the other 963 are events this homepage report does not read:/);
  assert.match(text, /homepage_scroll_depth 500, search_request 463/);
  // a grouped row for an event outside the report's list is a query bug -> mismatch
  assert.equal(checkCompleteness([...rows, { event: "rogue", n: 1 }], { ...totals, rogue: 1 }, ["homepage_view", "affiliate_click"]).complete, false);
});
