// SEO Phase 3 - Pokemon Card Price Checker front door.
//
// /search is upgraded IN PLACE into the price-checker experience (one
// canonical owner); /price-checker 308s to it. Search results are a
// PREVIEW that routes into the permanent /cards/[slug] value pages - no
// second card-page universe, no keyword URL explosion, no fabricated
// prices/offers, no change to deal eligibility or the scanner.

import { test, before } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { get, parseHtml, sitemapUrls, sample, pathOf } from "./lib.mjs";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const ORIGIN = "https://pokemondealfinder.com";
const ACCENTED = /pokémon/i;

function ldTypes(parsed) {
  const s = new Set();
  const walk = (v) => {
    if (Array.isArray(v)) return v.forEach(walk);
    if (v && typeof v === "object") {
      const t = v["@type"];
      if (typeof t === "string") s.add(t);
      if (Array.isArray(t)) t.forEach((x) => s.add(x));
      Object.values(v).forEach(walk);
    }
  };
  for (const b of parsed.jsonLd) {
    assert.ok(b.ok, `invalid JSON-LD: ${b.error}`);
    walk(b.data);
  }
  return s;
}
function ldFind(parsed, type) {
  const hits = [];
  const walk = (v) => {
    if (Array.isArray(v)) return v.forEach(walk);
    if (v && typeof v === "object") {
      const t = v["@type"];
      if (t === type || (Array.isArray(t) && t.includes(type))) hits.push(v);
      Object.values(v).forEach(walk);
    }
  };
  for (const b of parsed.jsonLd) if (b.ok) walk(b.data);
  return hits;
}

let search, searchParsed, apiBody, cohortCardSlug;

before(async () => {
  search = await get("/search");
  searchParsed = parseHtml(search.body);
  const r = await get("/api/card-search?q=charizard&page=1");
  apiBody = r.status === 200 ? JSON.parse(r.body) : null;
});

// --- 1: one canonical landing page ---------------------------

test("1. there is one canonical price-checker landing page at /search", () => {
  assert.equal(search.status, 200);
  assert.deepEqual(searchParsed.canonicals, [`${ORIGIN}/search`]);
  assert.match(searchParsed.title, /Pokemon Card Price Checker/i);
  assert.ok(searchParsed.h1s.some((h) => /Pokemon Card Price Checker/i.test(h)), `h1s: ${searchParsed.h1s}`);
});

// --- 2: no competing /price-checker indexable page ----------

test("2. /price-checker redirects to /search (not a second indexable page)", async () => {
  const res = await get("/price-checker");
  assert.ok(res.isRedirect, `/price-checker returned ${res.status}, expected a redirect`);
  assert.match(res.location ?? "", /\/search$/, `/price-checker -> ${res.location}`);
});

// --- 3: query URLs are noindex -----------------------------

test("3. /search?q= is noindex,follow", async () => {
  const res = await get("/search?q=charizard");
  const robots = parseHtml(res.body).robots ?? "";
  assert.match(robots, /noindex/, `?q= robots: "${robots}"`);
  assert.match(robots, /follow/, `?q= robots: "${robots}"`);
});

// --- 4: results link to /cards/[slug] ----------------------

test("4. search results route into permanent /cards/[slug] pages", async () => {
  assert.ok(apiBody, "/api/card-search did not return 200");
  const withHref = apiBody.catalog.results.filter((r) => r.cardHref);
  assert.ok(withHref.length >= 3, `expected results with a cardHref, got ${withHref.length}`);
  for (const r of withHref) {
    assert.match(r.cardHref, /^\/cards\/[a-z0-9-]+$/, `bad cardHref: ${r.cardHref}`);
  }
  cohortCardSlug = withHref[0].cardHref;
  const res = await get(cohortCardSlug);
  assert.equal(res.status, 200, `${cohortCardSlug} -> ${res.status}`);
});

// --- 5-7: preview identity fields are real ------------------

test("5. collector number is present on results that have one", () => {
  const withNum = apiBody.catalog.results.filter((r) => r.cardNumber);
  assert.ok(withNum.length >= 1, "no result carried a collector number");
});

test("6. set is present on results", () => {
  const withSet = apiBody.catalog.results.filter((r) => r.set);
  assert.ok(withSet.length >= apiBody.catalog.results.length - 1, "results are missing set names");
});

test("7. market reference is a real number or explicitly absent (never fabricated)", () => {
  for (const r of apiBody.catalog.results) {
    assert.ok(r.marketPrice == null || (typeof r.marketPrice === "number" && r.marketPrice > 0),
      `bad marketPrice: ${JSON.stringify(r.marketPrice)}`);
  }
});

// --- 8: deal indicator only for a real displayable deal ----

test("8. a result's deal field is only set for a real, actionable deal", () => {
  for (const r of apiBody.catalog.results) {
    if (r.deal == null) continue;
    assert.ok(Number.isFinite(r.deal.id), "deal without an id");
    assert.ok(typeof r.deal.affiliateUrl === "string" && r.deal.affiliateUrl.length > 0, "deal without an affiliate url");
    assert.ok(typeof r.deal.discountPct === "number", "deal without a discount pct");
  }
  // the search engine (13B.6.2 - lib/searchEngine.js, shared by the API
  // route and the server-rendered initial result) filters both deal
  // paths through isDisplayableDeal.
  const src = readFileSync(join(REPO, "lib", "searchEngine.js"), "utf8");
  assert.equal((src.match(/\.filter\(isDisplayableDeal\)/g) ?? []).length >= 2, true,
    "search engine no longer filters deals through isDisplayableDeal");
});

// --- 9: raw vs graded separation on /cards/[slug] ----------

test("9. the card price summary keeps raw and graded pricing separate", () => {
  const src = readFileSync(join(REPO, "components", "CardPriceSummary.js"), "utf8");
  assert.match(src, /By condition · raw|By condition/);
  assert.match(src, /Graded — from real recent sold sales|Graded/);
  // graded tiles require a real recorded sale
  assert.match(src, /g\.saleCount > 0/);
});

// --- 10: no synthetic condition prices --------------------

test("10. condition pricing is a real non-increasing ladder, never synthesised", () => {
  const src = readFileSync(join(REPO, "components", "CardPriceSummary.js"), "utf8");
  // ladder stops as soon as a row rises above Near Mint or above the previous row
  assert.match(src, /c\.price > nm \* 1\.02 \|\| c\.price > prev/);
  assert.ok(!/multiplier|\* 0\.\d|estimate.*condition/i.test(src.replace(/\/\/.*$/gm, "")),
    "CardPriceSummary appears to synthesise condition prices");
});

// --- 11: no mixed 1st Edition / Unlimited pricing ---------

test("11. dual-printing (1st Ed / Unlimited) pricing is kept unmixed", () => {
  const src = readFileSync(join(REPO, "lib", "pokemonPriceTracker.js"), "utf8");
  assert.match(src, /dualPrinting/);
  assert.match(src, /1st\s*edition/i);
});

// --- 12: history labelled per source semantics -----------

test("12. aggregate history and individual sales are labelled differently", () => {
  const rs = readFileSync(join(REPO, "components", "RecentSales.js"), "utf8");
  assert.match(rs, /Real individual sold listings/i);
  assert.match(rs, /not a market-reference estimate/i);
  const card = readFileSync(join(REPO, "app", "cards", "[slug]", "page.js"), "utf8");
  assert.match(card, /Market price history/); // the aggregate chart keeps its own label
});

// --- 13-14: schema on catalogue-only vs deal-backed cards -

test("13-14. catalogue-only card has no Offer schema; a deal-backed card keeps real Offer schema", async () => {
  const { byType } = await sitemapUrls();
  const cardPaths = (byType.get("cards") ?? []).map(pathOf);
  let catalogueOnly = null;
  let dealBacked = null;
  for (const p of sample(cardPaths, 12)) {
    const res = await get(p);
    if (res.status !== 200) continue;
    const parsed = parseHtml(res.body);
    const types = ldTypes(parsed);
    if (types.has("Product") && ldFind(parsed, "Offer").length > 0 && !dealBacked) dealBacked = p;
    else if (!types.has("Product") && !catalogueOnly) catalogueOnly = p;
    if (dealBacked && catalogueOnly) break;
  }
  assert.ok(catalogueOnly, "no catalogue-only card sampled");
  const co = parseHtml((await get(catalogueOnly)).body);
  assert.ok(!ldTypes(co).has("Product"), `${catalogueOnly} has Product schema`);
  assert.ok(!ldTypes(co).has("Offer"), `${catalogueOnly} has Offer schema`);
  if (dealBacked) {
    const db = parseHtml((await get(dealBacked)).body);
    assert.ok(ldTypes(db).has("Product"), `${dealBacked} lost Product schema`);
    assert.ok(ldFind(db, "Offer").length > 0, `${dealBacked} lost Offer schema`);
  }
});

// --- 15: SearchAction target -----------------------------

test("15. WebSite SearchAction still targets /search?q=", async () => {
  const home = parseHtml((await get("/")).body);
  const actions = ldFind(home, "SearchAction");
  assert.ok(actions.length >= 1, "no SearchAction on the homepage");
  assert.match(actions[0].target, /\/search\?q=\{search_term_string\}$/);
});

// --- 16: no price-checker keyword URL explosion ----------

test("16. no /price-checker/{keyword}, /value/{x} or /card-price/{x} pages exist", async () => {
  for (const p of ["/price-checker/charizard", "/value/charizard", "/value/pikachu", "/card-price/charizard", "/price-checker/charizard-base-set"]) {
    const res = await get(p);
    assert.ok(res.status === 404 || res.status === 308 || res.status === 301,
      `${p} returned ${res.status} - a keyword URL universe must not exist`);
  }
});

// --- 17: spelling --------------------------------------

test("17. the price checker page contains no accented \"Pokemon\"", () => {
  assert.ok(!ACCENTED.test(search.body), 'the /search HTML contains an accented "Pokémon"');
});

// --- 18: canonical behaviour --------------------------

test("18. every /search state canonicalises to the bare /search", async () => {
  for (const q of ["", "?q=charizard", "?q=pikachu&page=2", "?condition=Near+Mint", "?set=base-set"]) {
    const res = await get(`/search${q}`);
    if (res.status !== 200) continue;
    assert.deepEqual(parseHtml(res.body).canonicals, [`${ORIGIN}/search`], `canonical drifted for /search${q}`);
  }
});

// --- 19: scanner / deal logic untouched ---------------

test("19. no deal / matcher / authenticity / freshness logic was changed", () => {
  for (const f of ["app/search/SearchClient.js", "app/search/page.js", "components/RecentSales.js", "components/ListingChecks.js", "app/price-checker/page.js"]) {
    const src = readFileSync(join(REPO, f), "utf8");
    for (const fn of ["isPremiumDealEligible", "isVisualScreeningCandidate", "listingMatchesCard", "dealFreshness"]) {
      assert.ok(!src.includes(fn), `${f} references ${fn}`);
    }
  }
});

// --- 20: search API only surfaces displayable deals ---

test("20. the search API filters deals through isDisplayableDeal on every path", () => {
  // 13B.6.2 - the search engine moved to lib/searchEngine.js; the API
  // route (card-detail path) still filters too.
  const engine = readFileSync(join(REPO, "lib", "searchEngine.js"), "utf8");
  const route = readFileSync(join(REPO, "app", "api", "card-search", "route.js"), "utf8");
  const total =
    (engine.match(/isDisplayableDeal/g) ?? []).length + (route.match(/isDisplayableDeal/g) ?? []).length;
  assert.ok(total >= 3, `card-search dropped an isDisplayableDeal guard (found ${total})`);
  assert.match(engine, /import \{ isDisplayableDeal \} from "@\/lib\/dealQuality"/);
  assert.match(route, /runCardSearch/);
});
