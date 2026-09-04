// SEO Phase 4A - catalogue-backed set hubs + Set -> Pokemon linking.
// A set page no longer disappears just because there are no live deals:
// a set with >= SET_CATALOG_MIN_CARDS priced imaged catalogue cards gets
// a durable indexable hub. SET_MIN_LISTINGS (deal path) is unchanged.
// One template, stable metadata, no Pokemon x Set URLs, no fabricated
// complete-set value, no FAQPage/Product/Offer.

import { test, before } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { get, parseHtml, sitemapUrls, sample, pathOf } from "./lib.mjs";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const ORIGIN = "https://pokemondealfinder.com";
const ACCENTED = /pokémon/i;

const BELOW_THRESHOLD = "/sets/kids-wb-promos"; // 2 eligible -> stays noindex, no page
const SPECIALTY_SET = "/sets/world-championship-decks";

const esc = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// The "catalogue-only" set fixture (an indexable set hub with NO
// qualifying live deal) is chosen AT RUN TIME from the real sitemap, not
// hardcoded: a set can gain a qualifying below-market deal at any time and
// flip into the deal-backed template - exactly what happened to the
// former hardcoded /sets/celebrations fixture. Curated low-deal-likelihood
// promo / boxset sets are probed first (a "40%+ below a market ref" deal
// essentially never qualifies for these); a full sitemap scan is the
// fallback. CAT_NAME / CAT_SLUG / CAT_PATH are then derived from the page
// that wins, so every former Celebrations-specific assertion is generic.
const CAT_CANDIDATES = [
  "/sets/mcdonald-s-promos-2014", "/sets/mcdonald-s-promos-2015", "/sets/mcdonald-s-promos-2016",
  "/sets/mcdonald-s-promos-2017", "/sets/mcdonald-s-promos-2018", "/sets/mcdonald-s-promos-2019",
  "/sets/mcdonald-s-promos-2021", "/sets/mcdonald-s-promos-2022", "/sets/mcdonald-s-promos-2023",
  "/sets/southern-islands", "/sets/wizards-black-star-promos", "/sets/nintendo-black-star-promos",
  "/sets/pop-series-1", "/sets/pop-series-2", "/sets/pop-series-3", "/sets/pop-series-4",
  "/sets/pop-series-5", "/sets/dp-black-star-promos", "/sets/hgss-black-star-promos",
  "/sets/np-black-star-promos", "/sets/best-of-game", "/sets/legendary-collection",
];

// Phase 8A parallel: the set H1/title is the SAME stable
// "<Set> Card List, Prices & Values" for deal-backed AND catalogue-only
// pages. The catalogue-only STATE is read from the BODY: the honest
// "no qualifying below-market <Set> deal to feature right now" line is
// present and there is no "<Set> deals" H2 / id="deals" deal module.
const CATSET_H1_RE = /^(.+?) Card List, Prices & Values$/;

function catalogueOnlyState(res) {
  if (res.status !== 200) return null;
  const p = parseHtml(res.body);
  if (/noindex/.test(p.robots ?? "")) return null;
  const m = (p.h1s[0] ?? "").match(CATSET_H1_RE);
  if (!m) return null;
  const name = m[1].trim();
  const body = text(res.body);
  if (!new RegExp(`no qualifying below-market ${esc(name)} deal to feature right now`, "i").test(body)) return null;
  if (new RegExp(`${esc(name)} deals</h2>`, "i").test(res.body) || /id="deals"/i.test(res.body)) return null;
  return { name, parsed: p };
}

function text(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#39;|&apos;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}
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

let catRes, catParsed, dealSetPath, dealSetParsed, setSitemap;
// runtime-resolved catalogue-only set fixture
let CAT_PATH = null, CAT_SLUG = null, CAT_NAME = null;
// the curated candidates that actually have an indexable hub - a small
// dynamic stand-in for the old hardcoded CATALOGUE_SETS cohort
let CATALOGUE_SETS = [];

before(async () => {
  const sm = await sitemapUrls();
  setSitemap = (sm.byType.get("sets") ?? []).map(pathOf);

  // a deal-backed set = one in the sitemap that shows a "deals" module
  for (const p of sample(setSitemap, 10)) {
    const r = await get(p);
    if (r.status === 200 && / deals<\/h2>|id="deals"/i.test(r.body) && !/no qualifying below-market/i.test(text(r.body))) {
      dealSetPath = p;
      dealSetParsed = parseHtml(r.body);
      break;
    }
  }

  // the catalogue-only fixture: curated low-deal-likelihood sets first,
  // then a full sitemap scan. First page whose LIVE state is genuinely
  // catalogue-only (indexable hub, honest "no qualifying deal" line, no
  // deal module) wins.
  const probeOrder = [
    ...CAT_CANDIDATES.filter((p) => setSitemap.includes(p)),
    ...setSitemap.filter((p) => !CAT_CANDIDATES.includes(p)),
  ];
  for (const path of probeOrder) {
    const res = await get(path);
    const state = catalogueOnlyState(res);
    if (state) {
      CAT_PATH = path;
      CAT_SLUG = path.replace("/sets/", "");
      CAT_NAME = state.name;
      catRes = res;
      catParsed = state.parsed;
      break;
    }
  }
  assert.ok(
    CAT_PATH && CAT_NAME,
    "no catalogue-only set fixture found: no sitemap set hub is currently in the " +
      "indexable-but-no-qualifying-deal state. If every set now has a qualifying " +
      "deal this invariant needs a synthetic fixture rather than a live one."
  );

  // indexable curated candidates -> the dynamic CATALOGUE_SETS cohort used
  // by the metadata-stability / index-linking assertions below.
  CATALOGUE_SETS = [CAT_PATH];
  for (const p of CAT_CANDIDATES) {
    if (p !== CAT_PATH && setSitemap.includes(p)) CATALOGUE_SETS.push(p);
    if (CATALOGUE_SETS.length >= 4) break;
  }
});

// --- 1-2: one model, deal threshold unchanged ----------------

test("1. one shared set-indexability model (lib/setHub) drives route + sitemap", async () => {
  const sh = await import("../../lib/setHub.js");
  assert.equal(typeof sh.SET_CATALOG_MIN_CARDS, "number");
  assert.equal(typeof sh.setIndexable, "function");
  assert.equal(typeof sh.setEligibleCard, "function");
  const sitemapSrc = readFileSync(join(REPO, "lib", "sitemap.js"), "utf8");
  assert.match(sitemapSrc, /fetchCatalogSets/);
});

test("2. SET_MIN_LISTINGS is still 3 (deal path untouched)", async () => {
  const idx = await import("../../lib/indexability.js");
  assert.equal(idx.SET_MIN_LISTINGS, 3);
});

// --- 3-5: catalogue path works / thresholds / no false deals -

test("3. a catalogue-qualified set with no live deal is an indexable 200", async () => {
  for (const p of CATALOGUE_SETS) {
    const res = await get(p);
    assert.equal(res.status, 200, `${p} -> ${res.status}`);
    const robots = parseHtml(res.body).robots ?? "";
    assert.ok(!/noindex/.test(robots), `${p} is noindex: "${robots}"`);
  }
});

test("4. a below-threshold set stays out of the index and the sitemap", async () => {
  const res = await get(BELOW_THRESHOLD);
  assert.equal(res.status, 404, `${BELOW_THRESHOLD} -> ${res.status} (expected 404)`);
  assert.ok(!setSitemap.includes(BELOW_THRESHOLD), "below-threshold set is in the sitemap");
});

test("5. a catalogue-only set does not claim live deals", () => {
  const t = text(catRes.body);
  assert.match(t, new RegExp(`no qualifying below-market ${esc(CAT_NAME)} deal to feature right now`, "i"));
  assert.ok(
    !new RegExp(`${esc(CAT_NAME)} deals</h2>`, "i").test(catRes.body) && !/id="deals"/i.test(catRes.body),
    `catalogue-only set ${CAT_PATH} rendered a deals module`
  );
});

// --- 6-8: stable metadata + H1 intent ----------------------

test("6. set metadata is stable (no volatile live count / price range)", async () => {
  for (const p of [...CATALOGUE_SETS.slice(0, 3), dealSetPath].filter(Boolean)) {
    const d = parseHtml((await get(p)).body).metaDescription ?? "";
    assert.ok(d.length > 0, `${p}: no meta description`);
    assert.ok(!/\$\s?\d/.test(d), `${p}: price in description: ${d}`);
    assert.ok(!/\b\d+\s*(active|deals?|listings?|cards|sets)\b/i.test(d), `${p}: volatile count in description: ${d}`);
  }
});

test("7. set H1/title is the STABLE checklist+prices+values phrasing (Phase 8A - no deal-state flip)", () => {
  assert.ok(dealSetPath, "no deal-backed set found to sample");
  assert.match(dealSetParsed.h1s[0] ?? "", /Card List, Prices & Values$/);
  assert.match(dealSetParsed.title ?? "", /Card List, Prices & Values \| Pokemon Deal Finder$/);
  // deal content stays visible on the page, just not in the H1/title
  assert.ok(!/deals?\b/i.test(dealSetParsed.h1s[0] ?? ""), `set H1 advertises deals: ${dealSetParsed.h1s[0]}`);
});

test("8. catalogue-only set H1 is a checklist/prices intent, no deal claim", () => {
  assert.match(catParsed.h1s[0] ?? "", new RegExp(`^${esc(CAT_NAME)} Card List, Prices & Values$`));
  assert.ok(!/deals?\b/i.test(catParsed.h1s[0] ?? ""), `catalogue H1 mentions deals: ${catParsed.h1s[0]}`);
});

// --- 9-12: checklist + Pokemon-in-set links ----------------

test("9. the card checklist links to /cards/[slug]", () => {
  const t = text(catRes.body);
  assert.match(t, new RegExp(`${esc(CAT_NAME)} card checklist`, "i"));
  const cardLinks = catParsed.internalLinks.filter((l) => /^\/cards\/[^/]+$/.test(l));
  assert.ok(cardLinks.length >= 6, `expected /cards/ links in the checklist, got ${cardLinks.length}`);
});

test("10. the Pokemon-in-set section links valid /pokemon/[slug]", async () => {
  const t = text(catRes.body);
  assert.match(t, new RegExp(`Pokemon in ${esc(CAT_NAME)}`, "i"));
  const pkLinks = catParsed.internalLinks.filter((l) => /^\/pokemon\/[^/]+$/.test(l));
  assert.ok(pkLinks.length >= 5, `expected /pokemon/ links, got ${pkLinks.length}`);
  for (const l of sample(pkLinks, 4)) {
    const r = await get(l);
    assert.equal(r.status, 200, `${l} -> ${r.status}`);
  }
});

test("11. Trainer / Energy names are excluded from the Pokemon section", async () => {
  const ss = await import("../../lib/setSummary.js");
  const cards = [
    { name: "Charizard V" },
    { name: "Boss's Orders" },
    { name: "Twin Energy" },
    { name: "Houndoom Spirit Link" },
    { name: "Professor's Research" },
    { name: "Rocket's Sneasel" },
  ];
  const names = ss.setSpeciesList(cards).map((s) => s.name);
  assert.deepEqual(names.sort(), ["Charizard", "Sneasel"]);
});

test("12. no Pokemon x Set URL pattern is created", async () => {
  for (const p of [
    `/sets/${CAT_SLUG}/charizard`,
    `/sets/${CAT_SLUG}/rare`,
    `/sets/${CAT_SLUG}/pokemon/charizard`,
    `/sets/${CAT_SLUG}/under-50`,
  ]) {
    const r = await get(p);
    assert.ok(r.status === 404, `${p} -> ${r.status} (a set x facet URL universe must not exist)`);
  }
});

// --- 13-14: specialty + no fabricated set value -----------

test("13. specialty-set price rules are preserved (WCD range not thrown away, cardTier intact)", async () => {
  const ss = await import("../../lib/setSummary.js");
  // wholly-specialty set -> falls back to all priced cards, not "no data"
  const snap = ss.setPriceSnapshot([
    { set: "World Championship Decks", refPrice: 0.1 },
    { set: "World Championship Decks", refPrice: 250 },
  ]);
  assert.equal(snap.pricedCount, 2);
  assert.equal(snap.maxPrice, 250);
  // a mixed set still demotes the specialty outlier from the range
  const mixed = ss.setPriceSnapshot([
    { set: "Base Set", refPrice: 300 },
    { set: "Jumbo Cards", refPrice: 5000 },
  ]);
  assert.equal(mixed.maxPrice, 300);
  assert.equal(mixed.specialtyPricedCount, 1);
  const res = await get(SPECIALTY_SET);
  if (res.status === 200) {
    assert.ok(!/we don't have a trustworthy market reference/i.test(text(res.body)), "WCD falsely reports no price data");
  }
});

test("14. no fabricated complete-set valuation anywhere", () => {
  const t = text(catRes.body);
  assert.ok(!new RegExp(`${esc(CAT_NAME)} is worth \\$`, "i").test(t), "page states a single set value");
  assert.ok(!/complete set value|full set value|set value: \$/i.test(t), "page implies a complete-set valuation");
  assert.match(t, /not a valuation of the complete set|not a complete-set valuation/i);
});

// --- 15-16: schema safety --------------------------------

test("15. no FAQPage schema on set pages", () => {
  assert.ok(!ldTypes(catParsed).has("FAQPage"), "catalogue set has FAQPage schema");
});

test("16. no Product / Offer / Review / AggregateRating on a catalogue-only set", () => {
  const types = ldTypes(catParsed);
  for (const bad of ["Product", "Offer", "Review", "AggregateRating"]) {
    assert.ok(!types.has(bad), `catalogue-only set has ${bad} schema`);
  }
  assert.ok(types.has("BreadcrumbList"));
  assert.ok(types.has("CollectionPage"));
  assert.ok(types.has("ItemList"));
});

// --- 17-18: canonical + sitemap parity ------------------

test("17. set canonical is the bare /sets/[slug] under filters/params", async () => {
  assert.deepEqual(catParsed.canonicals, [`${ORIGIN}/sets/${CAT_SLUG}`]);
  for (const q of ["?country=EBAY_GB", "?rarity=Rare", "?sort=value", "?page=2"]) {
    const r = await get(`/sets/${CAT_SLUG}${q}`);
    if (r.status !== 200) continue;
    assert.deepEqual(parseHtml(r.body).canonicals, [`${ORIGIN}/sets/${CAT_SLUG}`], `canonical drifted for ${q}`);
  }
});

test("18. every set sitemap URL is a 200, index,follow, self-canonical", async () => {
  assert.ok(setSitemap.length >= 195, `set sitemap unexpectedly small: ${setSitemap.length}`);
  for (const p of sample(setSitemap, 8)) {
    const r = await get(p);
    assert.equal(r.status, 200, `${p} -> ${r.status}`);
    const parsed = parseHtml(r.body);
    assert.ok(!/noindex/.test(parsed.robots ?? ""), `${p} is in the sitemap but noindex`);
    assert.deepEqual(parsed.canonicals, [`${ORIGIN}${p}`], `${p} canonical mismatch`);
  }
});

// --- 19-20: /sets index + card->set edge ---------------

test("19. /sets index exposes the new catalogue-backed set hubs", async () => {
  const res = await get("/sets");
  assert.equal(res.status, 200);
  const links = parseHtml(res.body).internalLinks;
  for (const p of CATALOGUE_SETS) {
    assert.ok(links.includes(p), `/sets index does not link ${p}`);
  }
});

test("20. a card in a newly-qualifying set links to that set hub", async () => {
  // a card on the catalogue-only set page should link back to its set hub
  const cardLink = catParsed.internalLinks.find((l) => /^\/cards\//.test(l));
  assert.ok(cardLink, `no card link found on the ${CAT_PATH} set page`);
  const card = await get(cardLink);
  if (card.status === 200) {
    assert.ok(parseHtml(card.body).internalLinks.includes(`/sets/${CAT_SLUG}`),
      `${cardLink} does not link back to /sets/${CAT_SLUG}`);
  }
});

// --- 21-24: methodology, spelling, logic, source -------

test("21. /methodology describes the catalogue-backed set path", async () => {
  const t = text((await get("/methodology")).body);
  assert.match(t, /set[\s\S]{0,80}can also exist from catalogue data alone/i);
  assert.ok(!/set page exists, and is indexed, when the set has enough active below-market listings to browse\.$/i.test(t),
    "methodology still states the old deal-only set rule verbatim");
});

test("22. set pages contain no accented \"Pokemon\"", () => {
  assert.ok(!ACCENTED.test(catRes.body), `${CAT_PATH} set page has an accented "Pokemon"`);
});

test("23. no deal / matcher / authenticity / freshness logic changed", () => {
  for (const f of ["lib/setHub.js", "lib/setSummary.js", "components/SetFactStrip.js", "components/SetPriceSummary.js", "components/SetPokemonList.js", "components/SetQuickAnswers.js"]) {
    const src = readFileSync(join(REPO, f), "utf8");
    for (const fn of ["isDisplayableDeal", "isPremiumDealEligible", "isVisualScreeningCandidate", "listingMatchesCard", "dealFreshness"]) {
      assert.ok(!src.includes(fn), `${f} references ${fn}`);
    }
  }
  const dm = readFileSync(join(REPO, "lib", "dealMatching.js"), "utf8");
  assert.match(dm, /function listingMatchesCard\(/);
});

test("24. setEligibleCard is exactly catalogCardIndexable (no parallel predicate)", async () => {
  const sh = await import("../../lib/setHub.js");
  const cs = await import("../../lib/cardSlug.js");
  const row = { name: "Charizard", image_url: "x", tcgplayer_id: "1", market_price: 5 };
  const bad = { name: "Booster Box", image_url: "x", tcgplayer_id: "2", market_price: 5 };
  const noPrice = { name: "Pikachu", image_url: "x", tcgplayer_id: "3", market_price: 9999 };
  assert.equal(sh.setEligibleCard(row), cs.catalogCardIndexable(row));
  assert.equal(sh.setEligibleCard(row), true);
  assert.equal(sh.setEligibleCard(bad), false);
  assert.equal(sh.setEligibleCard(noPrice), false);
});
