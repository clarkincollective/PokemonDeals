// 2026-09-19 growth brief §8 / §9 / §11 - detail-page labelling, the
// checklist's buyer-intent step, affiliate_click dimensions and the
// reporting view.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { rowsOf, clicksPerThousand, QUERIES } from "../../scripts/reporting/growthReport.mjs";

const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");

test("§11 affiliate_click carries page_type + placement + network, all structural, EPN and TCGPlayer never merged", () => {
  const src = read("components/AffiliateLink.js");
  assert.match(src, /page_type: typeof window !== "undefined" \? pageTypeFromPath\(window\.location\.pathname\) : undefined/);
  assert.match(src, /placement: p\.placement \?\? d\.page \?\? "unknown"/);
  assert.match(src, /network: networkFor\(eventName\)/);
  assert.match(src, /return \/tcgplayer\/i\.test\(String\(eventName \?\? ""\)\) \? "tcgplayer" : "ebay";/);
  // never the card name or any free text
  assert.doesNotMatch(src, /card: d\.card|card_name: /);
});

test("§11 reporting view: read-only HogQL, split by network, pre-ship rows labelled not back-filled, clicks per 1k views by page type", () => {
  assert.match(QUERIES.affiliate, /event = 'affiliate_click'/);
  assert.match(QUERIES.affiliate, /GROUP BY network, page_type, placement, origin_section/);
  assert.match(QUERIES.affiliate, /\(pre-2026-09-19\)/);
  assert.match(QUERIES.pageviews, /event = 'page_view'/);
  assert.match(QUERIES.loop, /'saved_view_opened', 'saved_search_saved', 'alert_created', 'filter_cleared'/);
  const src = read("scripts/reporting/growthReport.mjs");
  assert.doesNotMatch(src, /capture\(|\/capture|\/batch|persons|cohorts|feature_flags/);
  assert.match(src, /runPostHogQuery\(/);
  const rows = rowsOf({ columns: ["network", "page_type", "clicks"], results: [["ebay", "card", 30], ["tcgplayer", "card", 5], ["ebay", "deal", 10]] });
  const pv = rowsOf({ columns: ["page_type", "views"], results: [["card", 3000], ["deal", 500]] });
  const per = clicksPerThousand(rows, pv);
  assert.deepEqual(per.map((r) => [r.network, r.page_type, r.clicks, r.per_1k_views]), [["ebay", "card", 30, 10], ["ebay", "deal", 10, 20], ["tcgplayer", "card", 5, 1.7]]);
  assert.equal(clicksPerThousand([{ network: "ebay", page_type: "x", clicks: 1 }], [])[0].per_1k_views, null, "no views -> no rate, not a divide-by-zero");
  assert.match(read("package.json"), /"report:growth": "node scripts\/reporting\/growthReport\.mjs"/);
  assert.match(read("docs/ebay-affiliate-attribution.md"), /page_type/);
});

test("§8 grid and chart state currency, condition and provenance in their headers", () => {
  const panel = read("components/CardMarketPanel.js");
  assert.match(panel, /Reference figures are USD market prices \(shown ≈ in your\s+currency\)/);
  assert.match(panel, /the raw tile names the condition its reference is really for/);
  const card = read("app/cards/[slug]/page.js");
  assert.match(card, /Reference prices are recorded in\s+USD \(shown ≈ in your currency\); the legend below the chart names the condition and printing/);
});

test("§9 checklist: missing-only view offers 'Find offers for cards I'm missing' into each card's live-offers section; card-page eBay link is surface-tagged and client-localised", () => {
  const t = read("components/ChecklistTable.js");
  assert.match(t, /Find offers for cards I&apos;m missing \(\{counts\.missing\}\)/);
  assert.match(t, /view === "missing" && counts\.missing > 0 &&/);
  assert.match(t, /href=\{`\$\{r\.href\}#card-offers`\}/);
  assert.doesNotMatch(t, /fetch\(/, "nothing fetched, nothing invented");
  const card = read("app/cards/[slug]/page.js");
  // finding 8 (2026-09-25) wrapped the query in buildCardSearchQuery, so
  // the call spans several lines now. The contract this test exists for -
  // crawler-visible default domain, card page/search placement - is
  // unchanged and still asserted.
  assert.match(
    card,
    /buildEbaySearchLink\([\s\S]*?undefined,\s*\{ page: "card", placement: "search" \}\s*\)/,
    "server: crawler-visible default domain + card page/search placement (finding 5 split the fused surface token)"
  );
  assert.match(card, /buildCardSearchQuery\(\{[\s\S]*?cardNumber:/, "…and the query keeps the collector number (finding 8)");
  assert.match(read("components/EbaySearchLink.js"), /localizeEbaySearchUrl\(href, region\)/, "client: re-pointed at the viewer's marketplace");
});

test("§10 distribution kit and paid-test brief exist, say automation stays paused and the test is not launched", () => {
  const kit = read("docs/distribution-kit.md");
  assert.match(kit, /Social automation stays paused/);
  assert.match(kit, /an auction shows a \*\*bid\*\*, never a saving/);
  assert.match(kit, /disclosure: my site/);
  const brief = read("docs/paid-test-brief.md");
  assert.match(brief, /DISABLED, not launched/);
  assert.match(brief, /Break-even CPC/);
  assert.match(brief, /USD 50 total/);
});
