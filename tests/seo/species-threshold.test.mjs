// SEO Phase 2B - bounded long-tail indexability experiment:
// SPECIES_CATALOG_MIN_CARDS 8 -> 6. The 72-species exactly-6 / exactly-7
// cohort becomes indexable and enters /sitemaps/pokemon.xml; the
// exactly-5 group (Finizen included) and the 1-4 group stay noindex.
// Nothing else changes - same template, same metadata pattern, same
// schema, same canonicals, no deal/matcher/authenticity/freshness edits.

import { test, before } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { get, parseHtml, sitemapUrls, sample, pathOf } from "./lib.mjs";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const ORIGIN = "https://pokemondealfinder.com";
const ACCENTED = /pokémon/i;

// Stable cohort members (from docs/seo-species-threshold-experiment.md):
const EXACTLY_6 = ["spinda", "cranidos", "happiny"];   // newly indexable
const EXACTLY_7 = ["blacephalon", "staravia", "baxcalibur"]; // newly indexable
const STAY_NOINDEX_5 = ["finizen", "munchlax", "type-null"]; // exactly-5, stay noindex

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

let sitemapPokemon = [];
let sitemapSets = new Set();
let c6, c6parsed, c7, c7parsed, fin, finParsed;

before(async () => {
  const sm = await sitemapUrls();
  sitemapPokemon = (sm.byType.get("pokemon") ?? []).map(pathOf);
  sitemapSets = new Set((sm.byType.get("sets") ?? []).map(pathOf));
  [c6, c7, fin] = await Promise.all([
    get(`/pokemon/${EXACTLY_6[0]}`),
    get(`/pokemon/${EXACTLY_7[0]}`),
    get("/pokemon/finizen"),
  ]);
  c6parsed = parseHtml(c6.body);
  c7parsed = parseHtml(c7.body);
  finParsed = parseHtml(fin.body);
});

// --- 1-2: thresholds ------------------------------------------

test("1. SPECIES_CATALOG_MIN_CARDS is exactly 6", async () => {
  const sh = await import("../../lib/speciesHub.js");
  assert.equal(sh.SPECIES_CATALOG_MIN_CARDS, 6);
});

test("2. SPECIES_MIN_LISTINGS is still 5 (deal path untouched)", async () => {
  const idx = await import("../../lib/indexability.js");
  assert.equal(idx.SPECIES_MIN_LISTINGS, 5);
});

// --- 3-4: 6 / 7 cohort is indexable --------------------------

test("3. an exactly-6-eligible species is indexable", async () => {
  for (const slug of EXACTLY_6) {
    const res = await get(`/pokemon/${slug}`);
    assert.equal(res.status, 200, `${slug} -> ${res.status}`);
    const robots = parseHtml(res.body).robots ?? "";
    assert.ok(!/noindex/.test(robots), `${slug} is noindex: "${robots}"`);
  }
});

test("4. an exactly-7-eligible species is indexable", async () => {
  for (const slug of EXACTLY_7) {
    const res = await get(`/pokemon/${slug}`);
    assert.equal(res.status, 200, `${slug} -> ${res.status}`);
    const robots = parseHtml(res.body).robots ?? "";
    assert.ok(!/noindex/.test(robots), `${slug} is noindex: "${robots}"`);
  }
});

// --- 5-7: 5 group and below stay noindex ---------------------

test("5. exactly-5-eligible catalogue-only species stay noindex", async () => {
  for (const slug of STAY_NOINDEX_5) {
    const res = await get(`/pokemon/${slug}`);
    if (res.status !== 200) continue; // slug spelling tolerance
    const robots = parseHtml(res.body).robots ?? "";
    assert.match(robots, /noindex/, `${slug} is no longer noindex`);
  }
});

test("6. a below-threshold species stays out of the sitemap", () => {
  // the pokemon sitemap must not contain any noindex species; spot-check
  // that the 5-group control is absent
  assert.ok(!sitemapPokemon.includes("/pokemon/finizen"), "finizen in the pokemon sitemap");
  assert.ok(!sitemapPokemon.includes("/pokemon/munchlax"), "munchlax in the pokemon sitemap");
});

test("7. Finizen (5 eligible) remains noindex, follow", () => {
  assert.equal(fin.status, 200);
  assert.match(finParsed.robots ?? "", /noindex/, "Finizen is no longer noindex");
  assert.match(finParsed.robots ?? "", /follow/, "Finizen lost follow");
});

// --- 8: full Phase 2A template on a newly indexable page -----

test("8. a newly indexable species gets the complete Phase 2A catalogue template", () => {
  const t = text(c6.body);
  assert.match(t, /#\s*0327/, "no fact strip / dex number");           // Spinda = #327
  assert.match(t, /Spinda card prices at a glance/i, "no price summary");
  assert.match(t, /Most valuable Spinda cards we track/i, "no most-valuable section");
  assert.match(t, /Spinda cards by set/i, "no by-set summary");
  assert.match(t, /Common questions about Spinda cards/i, "no quick answers");
  assert.match(t, /Every Spinda card, by set/i, "no full catalogue");
});

// --- 9-10: metadata stable + no false deal claim ------------

test("9. newly indexable metadata is stable (catalogue pattern, no counts, no ranges)", () => {
  assert.match(c6parsed.title, /^Spinda Card Prices & Value \| Pokemon Deal Finder$/);
  assert.match(c7parsed.title, /^Blacephalon Card Prices & Value \| Pokemon Deal Finder$/);
  for (const p of [c6parsed, c7parsed]) {
    const d = p.metaDescription ?? "";
    assert.ok(d.length > 0);
    assert.ok(!/\$\d/.test(d), `price in description: ${d}`);
    assert.ok(!/\b\d+\s*(cards|sets|listings|deals)\b/i.test(d), `volatile count in description: ${d}`);
  }
});

test("10. a newly indexable page makes no false live-deal claim", () => {
  const t = text(c6.body);
  assert.match(t, /no qualifying below-market Spinda deal to feature right now/i);
  assert.ok(!/Best Spinda deals/i.test(t), "catalogue-only page rendered a Best deals module");
});

// --- 11: canonical unchanged --------------------------------

test("11. newly indexable canonicals are the bare /pokemon/[slug]", async () => {
  assert.deepEqual(c6parsed.canonicals, [`${ORIGIN}/pokemon/${EXACTLY_6[0]}`]);
  assert.deepEqual(c7parsed.canonicals, [`${ORIGIN}/pokemon/${EXACTLY_7[0]}`]);
  // param variants keep the same bare canonical
  for (const q of ["?country=EBAY_GB", "?from=%2Fpokemon", "?type=graded&maxPrice=50"]) {
    const res = await get(`/pokemon/${EXACTLY_6[0]}${q}`);
    if (res.status !== 200) continue;
    assert.deepEqual(parseHtml(res.body).canonicals, [`${ORIGIN}/pokemon/${EXACTLY_6[0]}`], `canonical drifted for ${q}`);
  }
});

// --- 12-13: sitemap membership -----------------------------

test("12. the pokemon sitemap now includes the 6/7 cohort", () => {
  assert.ok(sitemapPokemon.length >= 900, `pokemon sitemap only has ${sitemapPokemon.length} URLs`);
  for (const slug of [...EXACTLY_6, ...EXACTLY_7]) {
    assert.ok(sitemapPokemon.includes(`/pokemon/${slug}`), `${slug} missing from the pokemon sitemap`);
  }
});

test("13. every pokemon sitemap URL is a 200 and index,follow", async () => {
  for (const p of sample(sitemapPokemon, 8)) {
    const res = await get(p);
    assert.equal(res.status, 200, `${p} -> ${res.status}`);
    const robots = parseHtml(res.body).robots ?? "";
    assert.ok(!/noindex/.test(robots), `${p} is in the sitemap but noindex ("${robots}")`);
  }
});

// --- 14: schema safety on the cohort -----------------------

test("14. no FAQPage / Product / Offer / Review / AggregateRating on a newly indexable species", () => {
  const types = ldTypes(c6parsed);
  for (const bad of ["FAQPage", "Product", "Offer", "Review", "AggregateRating"]) {
    assert.ok(!types.has(bad), `cohort species has ${bad} schema`);
  }
  assert.ok(types.has("BreadcrumbList"));
  assert.ok(types.has("CollectionPage"), "indexable catalogue species should have CollectionPage");
});

// --- 15: spelling ----------------------------------------

test("15. cohort pages contain no accented \"Pokemon\"", () => {
  assert.ok(!ACCENTED.test(c6.body), `${EXACTLY_6[0]} HTML has accented "Pokémon"`);
  assert.ok(!ACCENTED.test(c7.body), `${EXACTLY_7[0]} HTML has accented "Pokémon"`);
});

// --- 16: only the threshold constant changed --------------

test("16. no deal / matcher / authenticity / freshness logic was changed", () => {
  // the only non-test, non-doc source file this phase touches is
  // lib/speciesHub.js, and only its constant.
  const sh = readFileSync(join(REPO, "lib", "speciesHub.js"), "utf8");
  assert.match(sh, /SPECIES_CATALOG_MIN_CARDS = 6/);
  for (const f of ["lib/dealQuality.js", "lib/dealMatching.js", "lib/visualAuthenticity.js", "lib/deals.js"]) {
    const src = readFileSync(join(REPO, f), "utf8");
    // these files must not hardcode a species catalogue threshold
    assert.ok(!/SPECIES_CATALOG_MIN_CARDS\s*=/.test(src), `${f} defines its own SPECIES_CATALOG_MIN_CARDS`);
  }
});

// --- 17: card + set links on the cohort remain valid -------

test("17. cohort card links resolve and set links point at real /sets pages", async () => {
  const cardLinks = c6parsed.internalLinks.filter((l) => /^\/cards\/[^/]+$/.test(l));
  assert.ok(cardLinks.length >= 4, `expected /cards/ links, got ${cardLinks.length}`);
  for (const l of sample(cardLinks, 4)) {
    const res = await get(l);
    assert.equal(res.status, 200, `${l} -> ${res.status}`);
  }
  const setLinks = c6parsed.internalLinks.filter((l) => /^\/sets\/[^/]+$/.test(l));
  for (const l of setLinks) {
    assert.ok(sitemapSets.has(l), `${EXACTLY_6[0]} links to a /sets page not in the sitemap: ${l}`);
  }
});

// --- 18: specialty ranking rules intact -------------------

test("18. specialty (Jumbo / World Championship) ranking rules are intact", async () => {
  const cv = await import("../../lib/catalogueView.js");
  assert.equal(cv.isSpecialtyCard({ set: "Jumbo Cards", name: "x" }), true);
  assert.equal(cv.isSpecialtyCard({ set: "World Championship Decks", name: "x" }), true);
  assert.equal(cv.isSpecialtyCard({ set: "Base Set", name: "x" }), false);
  assert.equal(cv.cardTier({ set: "Jumbo Cards", name: "x" }), 2);
  assert.equal(cv.cardTier({ set: "Base Set", name: "x" }), 1);
});
