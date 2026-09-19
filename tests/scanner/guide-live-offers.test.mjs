// Growth batch 2026-09-20 - the guide live-offers module. Explicit
// registry mapping (30th Celebration cluster only), one render site in
// GuideLayout, set-page data with the supported-saving sort, nothing when
// empty, measurable origin.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { GUIDES, guideOffersSet, getGuide } from "../../lib/guides.js";

const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");

test("mapping: every 30th Celebration guide draws from ME: 30th Celebration; evergreen and pre-release guides get no module", () => {
  const thirtieth = GUIDES.filter((g) => /30th-celebration/.test(g.slug));
  assert.ok(thirtieth.length >= 9);
  for (const g of thirtieth) assert.equal(guideOffersSet(g), "ME: 30th Celebration", g.slug);
  for (const slug of ["how-pokemon-card-prices-work", "buying-pokemon-cards-on-ebay-safely", "pokemon-delta-reign-release-date-what-is-official", "storm-emeralda-vs-delta-reign-japanese-or-english"]) {
    assert.equal(guideOffersSet(getGuide(slug)), null, slug);
  }
  assert.equal(guideOffersSet(null), null);
});

test("module: set-page data, supported-saving sort, Buy It Now only, at most three, nothing when empty, measurable origin", () => {
  const src = read("components/guides/GuideLiveOffers.js");
  assert.match(src, /fetchSetDealsPage\(\{ setName, language: "english", sort: "discount", listingType: "FIXED_PRICE", page: 1, pageSize: MAX_OFFERS \}\)/);
  assert.match(src, /const MAX_OFFERS = 3;/);
  assert.match(src, /if \(!deals\?\.length\) return null;/);
  assert.match(src, /pageName="guide_offers"/);
  assert.match(src, /below their market reference/);
  assert.doesNotMatch(src, /verified authentic|guaranteed/i);
});

test("layout: rendered once by GuideLayout after the article, and no guide page carries its own", () => {
  const layout = read("components/GuideLayout.js");
  assert.equal((layout.match(/<GuideLiveOffers/g) ?? []).length, 1);
  assert.match(layout, /\{offersSet && <GuideLiveOffers setName=\{offersSet\} \/>\}/);
  assert.ok(layout.indexOf("<GuideLiveOffers") < layout.indexOf("<RelatedReading"), "offers before related reading");
  assert.ok(layout.indexOf("{children}") < layout.indexOf("<GuideLiveOffers"), "offers after the article body");
  for (const g of GUIDES) assert.doesNotMatch(read(`app/guides/${g.slug}/page.js`), /GuideLiveOffers/, g.slug);
});
