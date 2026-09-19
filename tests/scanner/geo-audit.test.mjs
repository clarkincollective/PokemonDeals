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
  assert.match(src, /propertyValue\("Printing", deal\.reference_printing\)/);
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
  assert.match(lib, /\.eq\("is_active", true\)\.is\("disqualified_reason", null\)/);
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
  assert.match(src, /absolute: "Pokemon Card Deals Below Market Price — Checked eBay Listings \| Pokemon Deal Finder"/);
});

test("organization: entity context added, still no Person/founder, still no rating", () => {
  const src = read("app/layout.js");
  assert.match(src, /knowsAbout: \[/);
  assert.match(src, /publishingPrinciples: `\$\{SITE_URL\}\/methodology`/);
  assert.match(src, /contactType: "editorial"/);
  assert.doesNotMatch(src, /"@type": "Person"|founder:/);
  assert.doesNotMatch(src, /aggregateRating/);
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
