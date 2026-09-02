// SEO Phase 2A - every-Pokemon template enrichment & metadata
// stabilization. The 848 indexable /pokemon/[slug] pages must be strong
// species-level landing pages built from REAL data, with stable metadata
// (no volatile live-listing counts or price ranges in title/description),
// without changing indexability, schema safety, or any deal/matcher/
// authenticity/freshness logic.

import { test, before } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { get, parseHtml, sitemapUrls, sample, pathOf } from "./lib.mjs";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const ORIGIN = "https://pokemondealfinder.com";
const ACCENTED = /pokémon/i;

function text(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function ldTypes(parsed) {
  const set = new Set();
  const walk = (v) => {
    if (Array.isArray(v)) return v.forEach(walk);
    if (v && typeof v === "object") {
      const t = v["@type"];
      if (typeof t === "string") set.add(t);
      if (Array.isArray(t)) t.forEach((x) => set.add(x));
      Object.values(v).forEach(walk);
    }
  };
  for (const b of parsed.jsonLd) {
    assert.ok(b.ok, `invalid JSON-LD: ${b.error}`);
    walk(b.data);
  }
  return set;
}

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Charizard always has active below-market deals; Finizen is the fixed
// noindex example (test 15 depends on it).
const DEAL_BACKED = "/pokemon/charizard";
const NOINDEX = "/pokemon/finizen";

// The "catalogue-only" fixture (indexable, catalogue-backed, but NO
// active deal) is chosen AT RUN TIME from the actual template state, not
// hardcoded - a specific Pokemon can gain a deal at any time and flip
// into the deal-backed template (this is exactly what happened to the
// former hardcoded /pokemon/caterpie). Candidates are very-low-value
// commons where a "40%+ below a ~$1-3 market ref" deal essentially never
// qualifies; the first one whose LIVE page is in the catalogue-only
// template wins, with a sitemap fallback. CAT_NAME / CAT_SLUG are then
// derived from that page so the assertions follow the fixture.
const CAT_CANDIDATES = [
  "caterpie", "weedle", "kakuna", "metapod", "pidgey", "rattata", "spearow",
  "sentret", "hoothoot", "ledyba", "sunkern", "wurmple", "zigzagoon",
  "bidoof", "patrat", "lillipup", "pidove", "bunnelby", "wingull", "bellsprout",
];

// Phase 8A: the species title/H1 is now the SAME stable
// "... Card Prices & Values" for both deal-backed and catalogue-only
// pages (search intent doesn't change because a deal appeared). So the
// catalogue-only STATE is identified from the body, not the title:
// the honest "no qualifying below-market <Name> deal to feature right
// now" line is present and there is no "Best <Name> deals" section.
const SPECIES_TITLE_RE = /^(.+?) Card Prices & Values \| Pokemon Deal Finder$/;

function catalogueOnlyState(res) {
  if (res.status !== 200) return null;
  const p = parseHtml(res.body);
  if (/noindex/.test(p.robots ?? "")) return null;
  const m = (p.title ?? "").match(SPECIES_TITLE_RE);
  if (!m) return null;
  const name = m[1].trim();
  if (!p.h1s[0] || !new RegExp(`^${esc(name)} Card Prices & Values$`).test(p.h1s[0])) return null;
  const body = text(res.body);
  if (!new RegExp(`no qualifying below-market ${esc(name)} deal to feature right now`, "i").test(body)) return null;
  if (new RegExp(`Best ${esc(name)} deals`, "i").test(body)) return null;
  return { name, parsed: p };
}

// resolved in before()
let CATALOGUE_ONLY = null;
let CAT_NAME = null;
let CAT_SLUG = null;

let dealRes, catRes, noindexRes, dealParsed, catParsed, noindexParsed;
let sitemapPokemon = [];

before(async () => {
  [dealRes, noindexRes] = await Promise.all([get(DEAL_BACKED), get(NOINDEX)]);
  dealParsed = parseHtml(dealRes.body);
  noindexParsed = parseHtml(noindexRes.body);
  const { byType } = await sitemapUrls();
  sitemapPokemon = (byType.get("pokemon") ?? []).map(pathOf);

  // 1) curated low-value candidates, 2) fall back to scanning the sitemap.
  const probeOrder = [
    ...CAT_CANDIDATES.map((s) => `/pokemon/${s}`),
    ...sitemapPokemon.filter((p) => !CAT_CANDIDATES.some((s) => p === `/pokemon/${s}`)),
  ];
  for (const path of probeOrder) {
    const res = await get(path);
    const state = catalogueOnlyState(res);
    if (state) {
      CATALOGUE_ONLY = path;
      CAT_SLUG = path.replace("/pokemon/", "");
      CAT_NAME = state.name;
      catRes = res;
      catParsed = state.parsed;
      break;
    }
  }
  assert.ok(
    CATALOGUE_ONLY && CAT_NAME,
    "no catalogue-only species fixture found (indexable, catalogue-backed, no active deal)"
  );
});

// --- 1-2: species facts from trusted data, no fabrication ---------------

test("1. species facts come from the shared trusted model", async () => {
  const { speciesFacts } = await import("../../lib/speciesFacts.js");
  const cz = speciesFacts("Charizard");
  assert.equal(cz.dexNumber, 6);
  assert.equal(cz.generation, 1);
  assert.deepEqual(cz.types, ["Fire", "Flying"]);
  assert.deepEqual(cz.evolutionLine, ["Charmander", "Charmeleon", "Charizard"]);
  // strip renders on the live page
  assert.match(text(dealRes.body), /#\s*0006/);
  assert.match(text(dealRes.body), /Fire \/ Flying/);
  assert.match(text(dealRes.body), /Charmander/);
});

test("2. a species with no evolution / unknown fact fabricates nothing", async () => {
  const { speciesFacts } = await import("../../lib/speciesFacts.js");
  const mew = speciesFacts("Mew");
  assert.equal(mew.evolutionLine, undefined);
  assert.equal(mew.evolvesFrom, undefined);
  assert.equal(mew.evolvesTo, undefined);
  const nonsense = speciesFacts("Notamon");
  assert.equal(nonsense, null);
  // Mew's live page shows real dex + type + generation and does not
  // invent an evolution line in the fact strip.
  const mewRes = await get("/pokemon/mew");
  if (mewRes.status === 200) {
    const t = text(mewRes.body);
    assert.match(t, /#\s*0151/);
    assert.match(t, /Psychic/);
    // window right after the dex number = the fact strip; no evo arrow there
    const at = t.search(/#\s*0151/);
    const strip = t.slice(at, at + 90);
    assert.ok(!/→/.test(strip), `Mew fact strip fabricated an evolution: ${strip}`);
  }
});

// --- 2b: the dynamic catalogue-only fixture is genuinely that state ---

test("2b. the catalogue-only fixture is catalogue-backed AND not deal-backed", () => {
  // if this fails, the selection in before() is wrong and every
  // catalogue-only template assertion below is meaningless - fail loudly
  // here rather than silently testing the wrong template.
  assert.ok(CATALOGUE_ONLY, "no catalogue-only fixture resolved");
  assert.equal(catRes.status, 200);
  assert.ok(!/noindex/.test(catParsed.robots ?? ""), `${CATALOGUE_ONLY} is noindex (not catalogue-backed)`);
  assert.match(catParsed.title, SPECIES_TITLE_RE, `${CATALOGUE_ONLY} is not on the species price template`);
  // catalogue-only state is now proven by the BODY (title no longer flips)
  assert.match(
    text(catRes.body),
    new RegExp(`no qualifying below-market ${esc(CAT_NAME)} deal to feature right now`, "i"),
    "fixture body does not carry the honest no-deal line"
  );
  assert.ok(
    !new RegExp(`Best ${esc(CAT_NAME)} deals`, "i").test(text(catRes.body)),
    "fixture has a 'Best <Name> deals' section (deal-backed)"
  );
  assert.deepEqual(catParsed.canonicals, [`${ORIGIN}/pokemon/${CAT_SLUG}`]);
});

test("2c. the species title/H1 is STABLE - identical for deal-backed and catalogue-only", () => {
  // Phase 8A: a below-market listing appearing must not flip the title
  // between "... & Value" and "... & Deals" (index churn, same intent).
  // The authored part (before " | Pokemon Deal Finder") is what matters.
  assert.match(dealParsed.title, SPECIES_TITLE_RE);
  assert.match(catParsed.title, SPECIES_TITLE_RE);
  assert.match(dealParsed.h1s[0] ?? "", /^.+ Card Prices & Values$/);
  assert.match(catParsed.h1s[0] ?? "", /^.+ Card Prices & Values$/);
  // the H1 (no site-name suffix) does not advertise "deals"
  assert.ok(!/deals?\b/i.test(dealParsed.h1s[0] ?? ""), `deal-backed H1 advertises deals: ${dealParsed.h1s[0]}`);
  assert.ok(!/deals?\b/i.test(catParsed.h1s[0] ?? ""));
});

// --- 3-6: metadata stabilization -------------------------------------

test("3. catalogue-only species metadata is stable (no counts, no ranges)", () => {
  assert.equal(catRes.status, 200);
  assert.match(catParsed.title, new RegExp(`^${esc(CAT_NAME)} Card Prices & Values \\| Pokemon Deal Finder$`));
  const d = catParsed.metaDescription ?? "";
  assert.ok(d.length > 0, "no meta description");
  assert.ok(!/\$\d/.test(d), `description has a price: ${d}`);
  assert.ok(!/\b\d+\s*(cards|sets|listings|deals)\b/i.test(d), `description has a volatile count: ${d}`);
});

test("4. deal-backed species metadata is stable (no counts, no ranges)", () => {
  assert.equal(dealRes.status, 200);
  assert.match(dealParsed.title, /^Charizard Card Prices & Values \| Pokemon Deal Finder$/);
  const d = dealParsed.metaDescription ?? "";
  assert.ok(d.length > 0, "no meta description");
  assert.ok(!/\$\d/.test(d), `description has a price: ${d}`);
  assert.ok(!/\b\d+\s*(cards|sets|listings|deals|active)\b/i.test(d), `description has a volatile count: ${d}`);
});

test("5. no volatile live-listing count anywhere in a species meta description", async () => {
  const picks = [DEAL_BACKED, CATALOGUE_ONLY, "/pokemon/pikachu", "/pokemon/umbreon"];
  for (const p of picks) {
    const res = await get(p);
    if (res.status !== 200) continue;
    const d = parseHtml(res.body).metaDescription ?? "";
    assert.ok(
      !/\d+\s*(active\s+)?(listings?|deals?)\b/i.test(d),
      `${p} meta description has a live count: ${d}`
    );
  }
});

test("6. no volatile price range in a species meta description", async () => {
  for (const p of [DEAL_BACKED, CATALOGUE_ONLY, "/pokemon/rattata", "/pokemon/dunsparce"]) {
    const res = await get(p);
    if (res.status !== 200) continue;
    const d = parseHtml(res.body).metaDescription ?? "";
    assert.ok(!/\$\s?\d/.test(d), `${p} meta description has a price range: ${d}`);
    assert.ok(!/from\s+\$/i.test(d), `${p} meta description has a "from $" range: ${d}`);
  }
});

// --- 7-8: H1 honesty ---------------------------------------------

test("7. deal-backed H1 uses the stable prices/values phrasing (no deal-state flip)", () => {
  assert.ok(dealParsed.h1s.length >= 1);
  assert.match(dealParsed.h1s[0], /^Charizard Card Prices & Values$/);
  // deal content is still visible on the page, just not in the H1
  assert.match(text(dealRes.body), /Best Charizard deals/i);
});

test("8. catalogue-only H1 does not claim active deals", () => {
  assert.ok(catParsed.h1s.length >= 1);
  assert.match(catParsed.h1s[0], new RegExp(`^${esc(CAT_NAME)} Card Prices & Values$`));
  assert.ok(!/deals?\b/i.test(catParsed.h1s[0]), `catalogue-only H1 mentions deals: ${catParsed.h1s[0]}`);
  // body is honest about no current deal
  assert.match(
    text(catRes.body),
    new RegExp(`no qualifying below-market ${esc(CAT_NAME)} deal to feature right now`, "i")
  );
});

// --- 9-11: sections use real data + safe links -----------------------

test("9. most-valuable cards link to /cards/[slug]", () => {
  const t = text(catRes.body);
  assert.match(t, new RegExp(`Most valuable ${esc(CAT_NAME)} cards we track`, "i"));
  const cardLinks = catParsed.internalLinks.filter((l) => l.startsWith("/cards/"));
  assert.ok(cardLinks.length >= 4, `expected /cards/ links in the most-valuable grid, got ${cardLinks.length}`);
});

test("10. specialty ranking (Jumbo / World Championship demotion) is intact", async () => {
  const cv = await import("../../lib/catalogueView.js");
  assert.equal(cv.isSpecialtyCard({ set: "Jumbo Cards", name: "Charizard" }), true);
  assert.equal(cv.isSpecialtyCard({ set: "World Championship Decks", name: "Pikachu" }), true);
  assert.equal(cv.isSpecialtyCard({ set: "Base Set", name: "Charizard" }), false);
  assert.equal(cv.cardTier({ set: "Jumbo Cards", name: "x" }), 2);
  assert.equal(cv.cardTier({ set: "Base Set", name: "x" }), 1);
  const ss = await import("../../lib/speciesSummary.js");
  const snap = ss.speciesPriceSnapshot([
    { set: "Base Set", refPrice: 300 },
    { set: "Jumbo Cards", refPrice: 5000 },
  ]);
  assert.equal(snap.maxPrice, 300, "a Jumbo price leaked into the headline range");
  assert.equal(snap.specialtyPricedCount, 1);
});

test("11. by-set summary links only to existing /sets/[slug] pages", async () => {
  const { locs, byType } = await sitemapUrls();
  const setSlugs = new Set((byType.get("sets") ?? []).map((u) => pathOf(u)));
  for (const p of [DEAL_BACKED, CATALOGUE_ONLY]) {
    const res = await get(p);
    const links = parseHtml(res.body).internalLinks.filter((l) => /^\/sets\/[^/]+$/.test(l));
    for (const l of links) {
      assert.ok(setSlugs.has(l), `${p} links to /sets page not in the sitemap: ${l}`);
    }
  }
});

// --- 12: quick answers use real counts ------------------------------

test("12. quick answers are present and use real catalogue counts", () => {
  const t = text(catRes.body);
  const N = esc(CAT_NAME);
  assert.match(t, new RegExp(`Common questions about ${N} cards`, "i"));
  assert.match(t, new RegExp(`How many ${N} cards are there\\?`, "i"));
  assert.match(t, new RegExp(`We currently track \\d+ ${N} card records? across \\d+ sets?`, "i"));
  assert.match(t, new RegExp(`How much are ${N} cards worth\\?`, "i"));
  assert.match(t, new RegExp(`There is no single ${N} card value|we can.?t give a range`, "i"));
});

// --- 13-14: schema safety -----------------------------------------

test("13. no FAQPage schema was added to species pages", () => {
  for (const [p, parsed] of [[DEAL_BACKED, dealParsed], [CATALOGUE_ONLY, catParsed], [NOINDEX, noindexParsed]]) {
    assert.ok(!ldTypes(parsed).has("FAQPage"), `${p} has FAQPage schema`);
  }
});

test("14. no Product / Offer / Review / AggregateRating on a catalogue-only species", () => {
  const types = ldTypes(catParsed);
  for (const bad of ["Product", "Offer", "Review", "AggregateRating"]) {
    assert.ok(!types.has(bad), `catalogue-only species has ${bad} schema`);
  }
  // it should still carry the conservative set it had before
  assert.ok(types.has("BreadcrumbList"));
});

// --- 15: Finizen stays noindex ----------------------------------

test("15. Finizen remains noindex and out of the sitemap", () => {
  assert.equal(noindexRes.status, 200);
  assert.match(noindexParsed.robots ?? "", /noindex/, "Finizen is no longer noindex");
  assert.ok(!sitemapPokemon.includes("/pokemon/finizen"), "Finizen appeared in the pokemon sitemap");
});

// --- 16: catalogue threshold is the current value ------------------

test("16. SPECIES_CATALOG_MIN_CARDS is 6 and SPECIES_MIN_LISTINGS is still 5", async () => {
  const sh = await import("../../lib/speciesHub.js");
  assert.equal(sh.SPECIES_CATALOG_MIN_CARDS, 6);
  const idx = await import("../../lib/indexability.js");
  assert.equal(idx.SPECIES_MIN_LISTINGS, 5);
});

// --- 17: canonicals unchanged --------------------------------

test("17. species canonicals are the bare /pokemon/[slug]", () => {
  assert.deepEqual(dealParsed.canonicals, [`${ORIGIN}/pokemon/charizard`]);
  assert.deepEqual(catParsed.canonicals, [`${ORIGIN}/pokemon/${CAT_SLUG}`]);
  assert.deepEqual(noindexParsed.canonicals, [`${ORIGIN}/pokemon/finizen`]);
});

// --- 18: sitemap / indexability parity ------------------------

test("18. sampled sitemap Pokemon URLs are indexable 200s", async () => {
  assert.ok(sitemapPokemon.length > 700, `pokemon sitemap unexpectedly small: ${sitemapPokemon.length}`);
  for (const p of sample(sitemapPokemon, 6)) {
    const res = await get(p);
    assert.equal(res.status, 200, `${p} -> ${res.status}`);
    const robots = parseHtml(res.body).robots ?? "";
    assert.ok(!/noindex/.test(robots), `${p} is in the sitemap but noindex`);
  }
});

// --- 19: spelling -------------------------------------------

test("19. species pages contain no accented \"Pokemon\"", () => {
  for (const [p, res] of [[DEAL_BACKED, dealRes], [CATALOGUE_ONLY, catRes], [NOINDEX, noindexRes]]) {
    assert.ok(!ACCENTED.test(res.body), `${p} HTML contains an accented "Pokémon"`);
  }
});

// --- 20: deal/matcher/authenticity/freshness libs untouched -------

test("20. the new species-template files touch no deal/matcher/authenticity/freshness logic", async () => {
  const newFiles = [
    "lib/speciesFacts.js",
    "lib/speciesSummary.js",
    "lib/pokemonSpeciesFacts.js",
    "components/SpeciesFactStrip.js",
    "components/SpeciesPriceSummary.js",
    "components/SpeciesBySet.js",
    "components/SpeciesQuickAnswers.js",
  ];
  const forbidden = [
    "isDisplayableDeal", "isPremiumDealEligible", "isVisualScreeningCandidate",
    "listingMatchesCard", "dealFreshness", "visualAuthenticityReason",
  ];
  for (const f of newFiles) {
    const src = readFileSync(join(REPO, f), "utf8");
    for (const fn of forbidden) {
      assert.ok(!src.includes(fn), `${f} references ${fn}`);
    }
  }
  // logic surfaces still intact
  const dq = await import("../../lib/dealQuality.js");
  assert.equal(typeof dq.isDisplayableDeal, "function");
  assert.equal(typeof dq.isPremiumDealEligible, "function");
  assert.equal(dq.PREMIUM_HIGH_RISK_MARKET_USD, 100);
  const dm = await import("../../lib/dealMatching.js");
  assert.equal(dm.MIN_SELLER_FEEDBACK_PCT, 95);
  const va = await import("../../lib/visualAuthenticity.js");
  assert.equal(typeof va.isVisualScreeningCandidate, "function");
});
