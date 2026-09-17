// sitemap-withdrawal-parity - what happens to a card in the sitemap when its
// catalogue price is WITHDRAWN (market_price -> NULL).
//
// The question this answers. "A withdrawal produces no new lastmod" does NOT
// mean the card has no lastmod: it may carry one from an EARLIER genuine
// price change, and selectSitemapCards admits a card that has a lastmod OR an
// editorial link OR a live hub. So a withdrawn card could in principle be
// advertised while its page has gone noindex. Checking one absent URL in
// production cannot settle that. These are the four cases, on controlled
// data, through the real functions.
//
// THE PAGE CONTRACT (app/cards/[slug]/page.js generateMetadata):
//   * a LIVE-DEAL HUB (resolveCardSlug hits) returns metadata with NO robots
//     key at all -> indexable, whatever the catalogue price is. A hub is a
//     card with live listings; that is the content justifying the page.
//   * CATALOGUE-ONLY falls back to resolveCatalogCard and returns
//     `robots: card.indexable ? undefined : { index: false, follow: true }`,
//     where catalogCardShape sets `indexable: priceOk`. So a catalogue-only
//     card with no usable price is noindex,follow - "too thin to index",
//     and the URL stays live at 200.
//
// So the correct sitemap behaviour is NOT "every withdrawn card disappears".
// It is: a withdrawn card stays advertised exactly when it still has a live
// hub, and drops otherwise - matching the page's own indexability decision.
//
// WHY THE LASTMOD / EDITORIAL BRANCHES CANNOT LEAK ONE THROUGH. The price
// gate is applied UPSTREAM of selectSitemapCards, when the candidate list is
// built (lib/sitemap.js fetchCardSitemapDataset): catalogue candidates come
// from fetchCatalogCardSitemapRows, whose query filters
// `.not("market_price","is",null).gt("market_price",0)` and then re-checks
// catalogPriceOk per row. A withdrawn card is therefore never a candidate,
// so `lastmod` and `editorialSlugs` never get the chance to rescue it. Only
// the `hubs` list can still carry it in - and a hub is indexable.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => readFileSync(join(REPO, p), "utf8");
const code = (p) => read(p).replace(/\/\/[^\n]*/g, "");

const { selectSitemapCards, assignCardShards } = await import("../../lib/cardSitemap.js");
const { catalogPriceOk } = await import("../../lib/cardSlug.js");

// The real candidate-building filter from fetchCatalogCardSitemapRows,
// applied to controlled catalogue rows exactly as PostgREST + the per-row
// re-check would: not null, > 0, then catalogPriceOk.
const catalogueCandidates = (rows) =>
  rows
    .filter((r) => r.market_price != null && r.market_price > 0 && catalogPriceOk(r.market_price))
    .map((r) => ({ slug: r.slug, tcgplayerId: String(r.tcgplayer_id), marketPrice: Number(r.market_price), hub: false }));

// The page's own decision, transcribed from generateMetadata.
const pageIsIndexable = ({ hub, marketPrice }) => (hub ? true : catalogPriceOk(marketPrice));

// keyed by TCGPLAYER ID, as selectSitemapCards/assignCardShards look it up
// (lastmodByTcg.get(String(c.tcgplayerId))) - not by slug
const LASTMOD = new Map([
  ["1", "2026-09-10"], // withdrawn-with-lastmod: an EARLIER genuine price change
  ["2", "2026-09-11"], // withdrawn-editorial
  ["3", "2026-09-09"], // withdrawn-hub
  ["5", "2026-09-12"], // priced-normal
]);
const EDITORIAL = new Set(["withdrawn-editorial"]);

// Four catalogue rows: three withdrawn (price NULL), one still priced.
const CATALOGUE = [
  { slug: "withdrawn-with-lastmod", tcgplayer_id: 1, market_price: null },
  { slug: "withdrawn-editorial", tcgplayer_id: 2, market_price: null },
  { slug: "withdrawn-hub", tcgplayer_id: 3, market_price: null },
  { slug: "withdrawn-plain", tcgplayer_id: 4, market_price: null },
  { slug: "priced-normal", tcgplayer_id: 5, market_price: 42.5 },
];
// only "withdrawn-hub" still has live listings
const HUBS = [{ slug: "withdrawn-hub", tcgplayerId: "3" }];

function buildDataset() {
  // mirrors fetchCardSitemapDataset: hubs first, then catalogue candidates
  const cards = [];
  const seen = new Set();
  for (const h of HUBS) {
    const cat = CATALOGUE.find((c) => c.slug === h.slug);
    cards.push({ slug: h.slug, tcgplayerId: h.tcgplayerId, marketPrice: cat?.market_price ?? null, hub: true });
    seen.add(h.slug);
  }
  for (const c of catalogueCandidates(CATALOGUE)) {
    if (seen.has(c.slug)) continue;
    seen.add(c.slug);
    cards.push(c);
  }
  return cards;
}

test("SWP-1. the candidate list already excludes a withdrawn price, before any lastmod/editorial rule runs", () => {
  const candidates = catalogueCandidates(CATALOGUE).map((c) => c.slug);
  assert.deepEqual(candidates, ["priced-normal"], `withdrawn cards reached the candidate list: ${candidates}`);
  // and that filter really is in the source, not just in this test
  const src = code("lib/deals.js");
  const fn = src.slice(src.indexOf("function fetchCatalogCardSitemapRowsUncached"));
  assert.match(fn.slice(0, 1200), /\.not\("market_price", "is", null\)/, "the sitemap-rows query no longer excludes NULL prices");
  assert.match(fn.slice(0, 1200), /catalogPriceOk\(r\.market_price\)/, "the per-row price re-check is gone");
});

test("SWP-2. all four withdrawal cases: sitemap membership matches the page's own indexability", () => {
  const cards = buildDataset();
  const { kept } = selectSitemapCards(cards, { lastmodByTcg: LASTMOD, editorialSlugs: EDITORIAL, enforce: true });
  const keptSlugs = new Set(kept.map((c) => c.slug));

  const cases = [
    // slug                     hub    expected in sitemap   why
    ["withdrawn-with-lastmod", false, false, "withdrawn, but carries an EARLIER real price-change lastmod"],
    ["withdrawn-editorial", false, false, "withdrawn, but linked from a guide"],
    ["withdrawn-hub", true, true, "withdrawn price, but still has live listings"],
    ["withdrawn-plain", false, false, "withdrawn, nothing else to justify the page"],
    ["priced-normal", false, true, "still priced, and has a lastmod"],
  ];
  for (const [slug, hub, expected, why] of cases) {
    const inSitemap = keptSlugs.has(slug);
    assert.equal(inSitemap, expected, `${slug} (${why}): sitemap=${inSitemap}, expected ${expected}`);
    // THE PARITY RULE: never advertise a URL the page itself noindexes
    const indexable = pageIsIndexable({ hub, marketPrice: CATALOGUE.find((c) => c.slug === slug).market_price });
    assert.ok(!(inSitemap && !indexable), `${slug}: advertised in the sitemap while the page renders noindex`);
  }

  // the lastmod and editorial branches are NOT dead - they still admit a
  // priced card, which is what they exist for
  assert.ok(keptSlugs.has("priced-normal"), "the lastmod branch stopped admitting a priced card");
});

test("SWP-3. a withdrawn hub keeps its page AND its sitemap entry - a missing price is not grounds to hide it", () => {
  const cards = buildDataset();
  const { kept } = selectSitemapCards(cards, { lastmodByTcg: LASTMOD, editorialSlugs: EDITORIAL, enforce: true });
  const hubRow = kept.find((c) => c.slug === "withdrawn-hub");
  assert.ok(hubRow, "a live-deal hub was dropped because its catalogue price went away");
  assert.equal(hubRow.marketPrice, null, "fixture no longer represents a withdrawn-price hub");
  assert.equal(pageIsIndexable({ hub: true, marketPrice: null }), true, "the hub page contract changed");

  // it is shard-placed by the no-reference rule, never given a guessed band
  const { shards, noReference } = assignCardShards(kept, LASTMOD);
  const placed = [...shards.values()].flat().filter((e) => e.slug === "withdrawn-hub");
  assert.equal(placed.length, 1, "the withdrawn-price hub was placed in 0 or >1 shards");
  assert.equal(placed[0].noReference, true, "a withdrawn-price hub was given a value band it cannot support");
  assert.ok(noReference.includes("withdrawn-hub"), `the no-reference list does not include the withdrawn hub: ${noReference}`);
});

test("SWP-4. the page contract this parity depends on is still the one transcribed here", () => {
  const page = code("app/cards/[slug]/page.js");
  // catalogue-only: noindex unless the shape says indexable
  assert.match(
    page,
    /robots: card\.indexable \? undefined : \{ index: false, follow: true \}/,
    "the catalogue-only noindex rule changed - re-derive this test's parity expectation"
  );
  // and indexable is exactly the price gate
  assert.match(code("lib/deals.js"), /indexable: priceOk,/, "catalogCardShape.indexable is no longer the price gate");
  // hub branch: the metadata it returns carries no robots key at all
  const hubReturn = page.slice(page.indexOf("const { deals: offers } = await fetchCardOffers(hub.id)"));
  const firstReturn = hubReturn.slice(hubReturn.indexOf("return {"), hubReturn.indexOf("alternates:"));
  assert.ok(!/robots/.test(firstReturn), "the hub branch now sets robots - the hub-always-indexable premise is broken");
});
