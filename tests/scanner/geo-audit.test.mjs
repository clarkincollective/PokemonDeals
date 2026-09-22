// GEO / AI-crawlability audit, 2026-09-19 - the implementation pins.
// Crawl policy names the AI agents; llms.txt carries freshness + quotable
// definitions; deal and card pages emit an entity with the deal's facts as
// PropertyValues; market-data + integrity pages are Datasets; the homepage
// FAQ answers the "authentic?" question literally; every answer capsule is
// visible HTML, never only schema.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import robots, { AI_AGENTS } from "../../app/robots.js";
import { dataset, propertyValue, FIGURES_LICENSE } from "../../lib/jsonLd.js";
import { groupReasons, reasonFamily, REASON_LABELS } from "../../lib/integrityReasons.js";
import { GUIDES } from "../../lib/guides.js";

const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");

test("robots: every named AI retrieval agent is explicitly allowed on public pages; /api and /saved excluded for all", () => {
  const r = robots();
  for (const agent of ["GPTBot", "OAI-SearchBot", "ClaudeBot", "Claude-SearchBot", "PerplexityBot", "Google-Extended", "CCBot"]) {
    assert.ok(AI_AGENTS.includes(agent), agent);
    const rule = r.rules.find((x) => x.userAgent === agent);
    assert.ok(rule, `${agent} rule`);
    assert.equal(rule.allow, "/");
    assert.deepEqual(rule.disallow, ["/api/", "/saved"]);
  }
  assert.deepEqual(r.rules[0], { userAgent: "*", allow: "/", disallow: ["/api/", "/saved"] });
  assert.equal(r.sitemap, "https://pokemondealfinder.com/sitemap.xml");
});

test("llms.txt: freshness, the integrity report, quotable definitions, crawl policy pointer - and still no authenticity claim", () => {
  const t = read("public/llms.txt");
  assert.match(t, /## Freshness/);
  assert.match(t, /https:\/\/pokemondealfinder\.com\/integrity/);
  assert.match(t, /last reviewed 2026-09-19/);
  assert.match(t, /## Quotable definitions/);
  assert.match(t, /never states that a listing is verified authentic/);
  assert.match(t, /Crawl policy: https:\/\/pokemondealfinder\.com\/robots\.txt/);
  assert.doesNotMatch(t, /guaranteed authentic|100% authentic/i);
});

test("jsonLd: dataset() and propertyValue() shapes; propertyValue drops empties", () => {
  const d = dataset({ name: "n", description: "d", url: "/x", dateModified: "2026-09-19T00:00:00Z", temporalCoverage: "2026-08-20/2026-09-19", variableMeasured: ["a"], license: FIGURES_LICENSE });
  assert.equal(d["@type"], "Dataset");
  assert.equal(d.url, "https://pokemondealfinder.com/x");
  assert.equal(d.creator["@id"], "https://pokemondealfinder.com/#organization");
  assert.equal(d.isAccessibleForFree, true);
  assert.equal(d.license, "https://creativecommons.org/licenses/by/4.0/");
  assert.equal(d.temporalCoverage, "2026-08-20/2026-09-19");
  assert.deepEqual(propertyValue("Set", "Base Set"), { "@type": "PropertyValue", name: "Set", value: "Base Set" });
  assert.equal(propertyValue("Set", null), null);
  assert.equal(propertyValue("Set", ""), null);
  assert.equal(propertyValue("Ref", 12.5, { unitCode: "USD" }).unitCode, "USD");
});

test("deal page: Product carries the deal's facts as PropertyValues, the reference ONLY when the saving is supported and never for an auction; shippingDetails stays absent (SEO-2.6.1)", () => {
  const src = read("app/deals/[id]/page.js");
  assert.match(src, /"@id": `\$\{SITE_URL\}\/deals\/\$\{deal\.id\}#product`/);
  assert.match(src, /propertyValue\("Set", cardSet\)/);
  assert.match(src, /propertyValue\("Collector number", dealCollectorNumber\)/);
  // 2026-09-22 (deal 42127): the Product states a printing only when
  // the LISTING evidences it. reference_printing describes the
  // reference we hold, and emitting it here asserted the item was a
  // reverse holo purely because our reference was.
  assert.match(src, /propertyValue\("Printing", statedPrinting\)/);
  assert.match(src, /propertyValue\("Condition \(seller-stated, checked\)", conditionLabel\(deal\)\)/);
  assert.match(src, /showSavings && showRef && !isAuction\s*\? propertyValue\(`Market reference/);
  assert.match(src, /showSavings && showRef && !isAuction \? propertyValue\("Below reference"/);
  assert.match(src, /propertyValue\("Listing type", isAuction \? "Auction — bids can rise" : "Buy It Now"\)/);
  assert.match(src, /propertyValue\("Listing last checked"/);
  // code only - the page's own comment explains why these are absent
  const code = src.replace(/^\s*\/\/[^\n]*$/gm, "");
  assert.doesNotMatch(code, /shippingDetails:|"OfferShippingDetails"|priceValidUntil:|aggregateRating|"@type": "Review"/);
  // the capsule is visible text, the same string the schema describes
  assert.match(src, /description: dealCapsule,/);
  assert.match(src, /<p className="[^"]*" data-answer-capsule>\s*\{dealCapsule\}/);
  assert.match(src, /bids can rise before the auction ends/);
});

test("card page: Product carries identity, the reference's condition + recorded date and the live range as properties; the R3 priced-offer gate and array form stay", () => {
  const src = read("app/cards/[slug]/page.js");
  assert.match(src, /"@id": `\$\{SITE_URL\}\/cards\/\$\{slug\}#product`/);
  assert.match(src, /\{schemaOffers\.length > 0 && \(\s*<script/, "R3: no Product without a priced offer");
  assert.match(src, /offers: schemaOffers,/, "R3: offers stays the priced-listing array");
  assert.doesNotMatch(src, /"@type": "AggregateOffer"/);
  assert.match(src, /propertyValue\(`Market reference\$\{refCondition \? ` \(\$\{refCondition\}\)` : ""\}`/);
  assert.match(src, /propertyValue\("Reference recorded", refRecorded\)/);
  assert.match(src, /propertyValue\("Lowest live total"/);
  assert.match(src, /a reference, not a guaranteed sale price/);
  assert.doesNotMatch(src, /aggregateRating|"@type": "Review"/);
});

test("market-data pages and the integrity page are Datasets with the figures licence; /integrity is in the sitemap and the footer", () => {
  for (const p of ["most-expensive-cards", "most-listed-cards", "pokemon-card-value-distribution", "pokemon-reference-price-changes"]) {
    const src = read(`app/market-data/${p}/page.js`);
    assert.match(src, /dataset\(\{/, p);
    assert.match(src, /license: FIGURES_LICENSE/, p);
  }
  const integrity = read("app/integrity/page.js");
  assert.match(integrity, /dataset\(\{/);
  assert.match(integrity, /data-answer-capsule/);
  assert.match(integrity, /do not make any listing &ldquo;verified authentic&rdquo;/);
  assert.match(read("lib/sitemap.js"), /\/integrity`, changefreq: "daily"/);
  assert.match(read("components/SiteFooter.js"), /\{ href: "\/integrity", label: "Listing Integrity Report" \}/);
});

test("integrity report: reasons group by recorded family, unknown families count under 'other', nothing is modelled", () => {
  assert.equal(reasonFamily("variant:title_asserts_jumbo"), "variant");
  assert.equal(reasonFamily("identity:title_names_other_set:fates_collide"), "identity");
  assert.equal(reasonFamily("zzz:whatever"), "other");
  const g = groupReasons(["variant:a", "variant:b", "identity:c", "zzz:d"]);
  assert.deepEqual(g.map((r) => [r.family, r.count]), [["variant", 2], ["identity", 1], ["other", 1]]);
  for (const r of g) assert.equal(r.label, REASON_LABELS[r.family]);
  const lib = read("lib/integrityReport.js");
  assert.match(lib, /countDisplayableActiveDeals\(\)/, "'shown' is the feed's own displayable count - one figure site-wide");
  assert.match(lib, /\.not\("disqualified_reason", "is", null\)/);
  assert.doesNotMatch(lib, /Math\.random|estimate|\* 1\.\d/);
});

test("homepage: the four GEO FAQ answers are literal; the answer capsule is visible and dated from live counts", () => {
  const src = read("app/page.js");
  assert.match(src, /question: "Are the Pokemon cards listed here authentic\?"/);
  assert.match(src, /never labels a listing \\"verified authentic\\"/);
  assert.match(src, /question: "Where does the market price come from\?"/);
  assert.match(src, /question: "Do you sell cards or take a cut of the price\?"/);
  assert.match(src, /question: "How current is a deal\?"/);
  assert.match(src, /data-answer-capsule/);
  assert.match(src, /fetchIntegrityReport\(\)/);
  // structured-data brief 2026-09-20: the title constant lives in lib/homeContent
  assert.match(src, /title: \{ absolute: HOME_TITLE \}/);
  assert.match(read("lib/homeContent.js"), /export const HOME_TITLE = "Pokemon Card Deals Below Market Price \| Pokemon Deal Finder"/);
});

test("organization: entity context added, still no Person/founder, still no rating", () => {
  // structured-data brief 2026-09-20: the entity moved from the root layout
  // into lib/jsonLd (organizationNode) and is emitted on the home page only
  const src = read("lib/jsonLd.js");
  assert.match(src, /knowsAbout: \[/);
  assert.match(src, /publishingPrinciples: `\$\{SITE_URL\}\/methodology`/);
  assert.match(src, /contactType: "general enquiries"/);
  assert.doesNotMatch(src, /"@type": "Person"|founder:/);
  assert.doesNotMatch(src, /aggregateRating/);
  assert.doesNotMatch(read("app/layout.js"), /"@type": "Organization"|"@type": "WebSite"/, "layout emits no site entities any more");
});

test("integrity follow-up: 'stopped showing' comes from a trigger-stamped column and is omitted (never 0) until it exists; the daily snapshot cron is guarded and idempotent", () => {
  const mig = read("supabase/integrity_migration.sql");
  assert.match(mig, /add column if not exists deactivated_at timestamptz/);
  assert.match(mig, /create trigger deals_stamp_deactivated_at\s+before update of is_active on deals/);
  assert.match(mig, /create table if not exists integrity_snapshots/);
  assert.match(mig, /create policy integrity_snapshots_public_read/);
  assert.doesNotMatch(mig, /drop column|drop table|delete from|update deals set/i);
  const lib = read("lib/integrityReport.js");
  assert.match(lib, /\.gte\("deactivated_at", since24h\)/);
  assert.match(lib, /if \(error\) return null;/, "column missing -> null, not 0");
  const page = read("app/integrity/page.js");
  assert.match(page, /r\.stopped24h != null \? ` and \$\{n\(r\.stopped24h\)\} stopped being shown/);
  assert.match(page, /history\.length > 0 && \(/);
  const cron = read("app/api/integrity-snapshot/route.js");
  assert.match(cron, /authorization"\) !== `Bearer \$\{process\.env\.CRON_SECRET\}`/);
  assert.match(cron, /upsert\(row, \{ onConflict: "day" \}\)/);
  assert.match(cron, /skipped: "table_missing"/);
  assert.match(read("vercel.json"), /"path": "\/api\/integrity-snapshot",\s*"schedule": "40 5 \* \* \*"/);
  // no scanner code path was touched for the stamp
  for (const f of ["app/api/verify-deals/route.js", "app/api/sweep-stale-deals/route.js", "app/api/refresh-deals/route.js", "app/api/ingest-feed/route.js"]) {
    assert.doesNotMatch(read(f), /deactivated_at/, `${f}: the trigger stamps it, not the scanner`);
  }
});

test("card page: graded worth lines come from references STORED on live graded listings (no provider call), one per grader+grade, labelled as references", () => {
  const src = read("app/cards/[slug]/page.js");
  assert.match(src, /storedReferenceEvidence\(d\)\?\.kind === "graded"/);
  assert.match(src, /isUsableUsdPrice\(d\.market_price\)/);
  assert.match(src, /data-worth-graded=\{gradedRefs\.length\}/);
  assert.match(src, /references, not sale prices\./);
  assert.match(src, /propertyValue\(`Graded market reference \(\$\{g\.key\}\)`/);
  assert.doesNotMatch(src, /getFullPriceAnalysis|loadCardPriceAnalysis/, "no provider call at render");
});

test("SEO audit 2026-09-20 follow-ups: SERP-length titles/descriptions, LCP hints, sitemap lastmod for sets/pokemon, crawl-capped pagination", () => {
  const read2 = (p) => read(p);
  // static titles fit a mobile SERP with the 22-char brand suffix
  for (const [f, max] of [["app/page.js", 40], ["app/deals/page.js", 48], ["app/guides/page.js", 40], ["app/integrity/page.js", 40], ["app/methodology/page.js", 45], ["app/news/page.js", 45], ["app/pokemon/page.js", 45], ["app/best-finds/page.js", 45]]) {
    const src = read2(f);
    const m =
      src.match(/const TITLE = "([^"]+)"/) ||
      src.match(/absolute: "([^"|]+) \| Pokemon Deal Finder"/) ||
      (src.includes("absolute: HOME_TITLE") ? read2("lib/homeContent.js").match(/HOME_TITLE = "([^"|]+) \| Pokemon Deal Finder"/) : null);
    assert.ok(m, `${f} title`);
    assert.ok(m[1].length <= max, `${f}: "${m[1]}" is ${m[1].length} chars (max ${max})`);
  }
  for (const f of ["app/page.js", "app/deals/page.js", "app/integrity/page.js", "app/methodology/page.js", "app/cards/page.js", "app/market-data/page.js", "app/guides/page.js", "app/news/page.js", "app/pokemon/page.js"]) {
    const src = read2(f);
    const m = src.match(/(?:const DESCRIPTION =|description:)\s*\n?\s*"([^"]+)"/);
    assert.ok(m && m[1].length <= 160, `${f}: description ${m ? m[1].length : "?"} chars`);
  }
  // LCP: preconnect to both image hosts; the above-the-fold card image is fetchpriority high
  const layout = read2("app/layout.js");
  assert.match(layout, /<link rel="preconnect" href="https:\/\/i\.ebayimg\.com" \/>/);
  assert.match(layout, /<link rel="preconnect" href="https:\/\/tcgplayer-cdn\.tcgplayer\.com" \/>/);
  assert.match(read2("components/DealImage.js"), /fetchPriority=\{priority \? "high" : undefined\}/);
  assert.match(read2("components/HomeFeed.js"), /priority=\{i < 2\}/);
  // sitemaps: sets + pokemon carry the catalogue sync date, never an invented one
  const sm = read2("lib/sitemap.js");
  assert.match(sm, /fetchCatalogSyncedAt\(\),\s*\]\);\s*\/\/ SEO audit 2026-09-20/);
  assert.match(sm, /const lastmod = syncedAt \? \{ lastmod: syncedAt \} : \{\};/);
  assert.match(read2("lib/deals.js"), /export function fetchCatalogSyncedAt\(\)/);
  // pagination: pages 6+ nofollow, 1-5 followable
  const pg = read2("components/Pagination.js");
  assert.match(pg, /const CRAWLABLE_PAGES = 5;/);
  assert.match(pg, /rel=\{targetPage > CRAWLABLE_PAGES \? "nofollow" : undefined\}/);
});

test("crawl budget 2026-09-20: cards-bulk is advertised again but lists hubs and article-linked cards only; the route and the segment list are untouched", async () => {
  const sm = read("lib/sitemap.js");
  assert.match(sm, /export const UNADVERTISED_SEGMENTS = new Set\(\[\]\);/, "the mechanism stays, empty");
  assert.match(sm, /SITEMAP_SEGMENTS\.filter\(\(id\) => !UNADVERTISED_SEGMENTS\.has\(id\)\)\.map\(/);
  assert.match(sm, /selectBulkShardCards\(out\[NO_REFERENCE_SHARD\] \?\? \[\], \{ editorialSlugs: EDITORIAL_CARD_SLUGS \}\)/);
  assert.match(sm, /bulk-rule on \(live-deal hubs and article-linked cards only/);
  // the segment list itself is unchanged (card-sitemap pins it too)
  assert.match(sm, /SITEMAP_SEGMENTS = \["pages", "sets", "pokemon", \.\.\.CARD_SITEMAP_SEGMENTS, "deals", "sealed-deals"\]/);
  assert.match(sm, /Re-read the report on 2026-10-04/);
});

test("guides: the buyer-intent cluster is registered, grouped, dated, and price-free", () => {
  for (const slug of ["buying-pokemon-cards-on-ebay-safely", "how-to-read-a-pokemon-card-listing", "vintage-pokemon-cards-worth-buying", "pokemon-booster-box-prices"]) {
    const g = GUIDES.find((x) => x.slug === slug);
    assert.ok(g, slug);
    assert.equal(g.published, "2026-09-19");
    const src = read(`app/guides/${slug}/page.js`);
    assert.match(src, /GuideLayout slug=\{SLUG\}/);
    assert.doesNotMatch(src, /\$\s?\d/);
    assert.doesNotMatch(src, /verified authentic(?!&rdquo;)/);
  }
  assert.match(read("app/guides/page.js"), /title: "Buy with confidence"/);
  assert.match(read("app/guides/raw-vs-graded-pokemon-cards/page.js"), /Raw or graded for the same budget: a decision table/);
  // set pages carry the capsule
  assert.match(read("app/sets/[slug]/page.js"), /data-answer-capsule/);
});
