// SEO Phase 4A closeout - full-set vs browse-capped aggregate integrity.
//
// fetchSetCatalog trims its returned card array to SET_CATALOG_MAX_BROWSE
// (600) non-deal cards so a ~1,900-card set does not ship ~1,900 tiles to
// the client. The Phase 4A route then computed the SET-LEVEL aggregates
// (price snapshot, species list, most-valuable ranking, fact-strip
// count, quick-answer counts) from that already-trimmed slice - so World
// Championship Decks reported "491 priced cards" / ~241 Pokemon while
// wording them as whole-set statistics.
//
// The fix: set-level aggregates are computed server-side in
// fetchSetCatalogUncached from the COMPLETE `cards` list, before the
// trim, and returned as small objects (priceSnapshot / speciesList /
// topValueCards). The browse-capped array still feeds only the
// interactive CatalogueBrowser grid and the bounded ItemList schema.
//
// SET_CATALOG_MIN_CARDS (10) and SET_MIN_LISTINGS (3) are unchanged; no
// deal-matching / authenticity / freshness logic is touched.

import { test, before } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { get } from "./lib.mjs";

import { setPriceSnapshot, setSpeciesList } from "../../lib/setSummary.js";
import { cardTier } from "../../lib/catalogueView.js";
import { SET_CATALOG_MIN_CARDS } from "../../lib/setHub.js";
import { SET_MIN_LISTINGS } from "../../lib/indexability.js";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const WCD = "/sets/world-championship-decks";
const NORMAL_SET = "/sets/celebrations";

// Mirrors lib/deals.js exactly: cards are card-number sorted, then
// non-deal cards past SET_CATALOG_MAX_BROWSE are dropped from the grid.
const MAX_BROWSE = 600;
function browseTrim(cards) {
  const dealCards = cards.filter((c) => c.deal);
  const browseCards = cards.filter((c) => !c.deal);
  return [...dealCards, ...browseCards.slice(0, MAX_BROWSE)];
}
// Mirrors lib/deals.js topValueCards.
function topValue(cards) {
  return cards
    .filter((c) => !c.deal && Number.isFinite(Number(c.refPrice)) && Number(c.refPrice) > 0)
    .sort((a, b) => cardTier(a) - cardTier(b) || Number(b.refPrice) - Number(a.refPrice))
    .slice(0, 24);
}

// A synthetic set larger than the browse cap. Card numbers 1..1200 in
// order. The single most-valuable card and a whole second pool of
// species live in positions 601..1200 - i.e. exactly the region the
// browse trim discards.
const POOL_A = ["Pikachu", "Charizard", "Bulbasaur", "Squirtle", "Eevee", "Snorlax", "Gengar", "Machamp", "Onix", "Lapras"];
const POOL_B = ["Umbreon", "Espeon", "Lucario", "Garchomp", "Rayquaza", "Metagross", "Tyranitar", "Dragonite", "Gardevoir", "Blaziken", "Greninja", "Sceptile"];
const CHASE_NAME = "Rayquaza"; // only in POOL_B -> only in the dropped tail
function syntheticSet() {
  const cards = [];
  for (let i = 1; i <= 1200; i++) {
    const inTail = i > 600;
    const pool = inTail ? POOL_B : POOL_A;
    const species = pool[i % pool.length];
    const chase = i === 1180 && species === CHASE_NAME;
    // cheap head (1..97), distinctly pricier tail (200..296) so the
    // full-set median clearly differs from the 600-card slice median,
    // plus one $5000 chase card in the tail.
    const refPrice = chase ? 5000 : inTail ? 200 + (i % 97) : (i % 97) + 1;
    cards.push({
      name: species,
      set: "Test Expansion",
      cardNumber: String(i),
      rarity: i % 3 === 0 ? "Rare" : "Common",
      refPrice,
      deal: null,
    });
  }
  // guarantee exactly one 5000-priced chase card in the tail
  const chaseIdx = cards.findIndex((c) => c.refPrice === 5000);
  if (chaseIdx === -1) {
    cards[1179] = { ...cards[1179], name: CHASE_NAME, refPrice: 5000 };
  }
  return cards;
}

let wcdRes, wcdBody, wcdText, normalRes;

function plain(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#39;|&apos;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}
function jsonLdBlocks(html) {
  const out = [];
  for (const m of html.matchAll(
    /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  )) {
    try {
      out.push(JSON.parse(m[1]));
    } catch {
      /* covered elsewhere */
    }
  }
  return out;
}

before(async () => {
  wcdRes = await get(WCD);
  wcdBody = wcdRes.body || "";
  wcdText = plain(wcdBody);
  normalRes = await get(NORMAL_SET);
});

// ---------------------------------------------------------------------------
// 1-2. Wiring: aggregates are produced from the full set, before the trim,
//      and the route consumes them instead of recomputing on the slice.
// ---------------------------------------------------------------------------

test("1. lib/deals.js computes the set-level aggregates from the full `cards` list BEFORE the browse trim", () => {
  const src = readFileSync(join(REPO, "lib", "deals.js"), "utf8");
  const iSnapshot = src.indexOf("setPriceSnapshot(cards)");
  const iSpecies = src.indexOf("setSpeciesList(cards)");
  const iTrim = src.indexOf("browseCards.slice(0, SET_CATALOG_MAX_BROWSE)");
  assert.ok(iSnapshot > 0, "setPriceSnapshot(cards) not found in lib/deals.js");
  assert.ok(iSpecies > 0, "setSpeciesList(cards) not found in lib/deals.js");
  assert.ok(iTrim > 0, "browse trim not found in lib/deals.js");
  assert.ok(iSnapshot < iTrim, "priceSnapshot must be computed before the browse trim");
  assert.ok(iSpecies < iTrim, "speciesList must be computed before the browse trim");
  // and they are returned to callers
  assert.match(src, /\n\s*priceSnapshot,\n\s*speciesList,\n\s*topValueCards,/);
});

test("2. app/sets/[slug]/page.js consumes fetchSetCatalog's aggregates and never recomputes them on the trimmed slice", () => {
  const src = readFileSync(join(REPO, "app", "sets", "[slug]", "page.js"), "utf8");
  // takes the pre-computed objects off the fetch result
  assert.match(src, /priceSnapshot,\s*\n?\s*speciesList,\s*\n?\s*topValueCards,/);
  // does NOT call the aggregators locally on catalogCards / catalogueItems
  assert.ok(!/setPriceSnapshot\s*\(/.test(src), "page.js still calls setPriceSnapshot()");
  assert.ok(!/setSpeciesList\s*\(/.test(src), "page.js still calls setSpeciesList()");
  // only setEra is still imported from lib/setSummary
  assert.match(src, /import\s*\{\s*setEra\s*\}\s*from\s*["']@\/lib\/setSummary["']/);
});

// ---------------------------------------------------------------------------
// 3-6. The browse cap changes every set-level number when the set is
//      bigger than the cap - proving the pre-fix path was lossy and the
//      full-set computation is the one that must be shipped.
// ---------------------------------------------------------------------------

test("3. browse cap changes the priced-card count on a > 600-card set; the full-set count is complete", () => {
  const full = syntheticSet();
  const capped = browseTrim(full);
  const fullSnap = setPriceSnapshot(full);
  const cappedSnap = setPriceSnapshot(capped);
  assert.equal(fullSnap.pricedCount, 1200);
  assert.equal(cappedSnap.pricedCount, 600);
  assert.notEqual(fullSnap.pricedCount, cappedSnap.pricedCount);
  assert.equal(fullSnap.cardCount, 1200);
});

test("4. browse cap changes the price range / median; the full-set snapshot keeps the tail chase card", () => {
  const full = syntheticSet();
  const capped = browseTrim(full);
  const fullSnap = setPriceSnapshot(full);
  const cappedSnap = setPriceSnapshot(capped);
  assert.equal(fullSnap.maxPrice, 5000, "full snapshot must see the $5000 tail card");
  assert.notEqual(cappedSnap.maxPrice, 5000, "capped snapshot must not see the tail card");
  assert.notEqual(fullSnap.medianPrice, cappedSnap.medianPrice);
});

test("5. browse cap changes the Pokemon-in-set count; the full-set species list covers the whole set", () => {
  const full = syntheticSet();
  const capped = browseTrim(full);
  const fullSpecies = setSpeciesList(full);
  const cappedSpecies = setSpeciesList(capped);
  const fullSlugs = new Set(fullSpecies.map((s) => s.slug));
  assert.ok(fullSpecies.length > cappedSpecies.length, "full set has more species than the 600-card slice");
  // every POOL_B species is present in the full list, absent from the slice
  for (const name of POOL_B) {
    assert.ok([...fullSlugs].some((sl) => sl.includes(name.toLowerCase())), `full species list missing ${name}`);
  }
  assert.ok(!cappedSpecies.some((s) => s.name === "Rayquaza"), "slice wrongly contains a tail-only species");
});

test("6. browse cap changes the most-valuable ranking; the full-set ranking is led by the true top card", () => {
  const full = syntheticSet();
  const capped = browseTrim(full);
  assert.equal(topValue(full)[0].name, CHASE_NAME);
  assert.equal(topValue(full)[0].refPrice, 5000);
  assert.notEqual(topValue(capped)[0].refPrice, 5000);
});

// ---------------------------------------------------------------------------
// 7-8. setPriceSnapshot invariants the closeout relies on.
// ---------------------------------------------------------------------------

test("7. wholly-specialty set still gets a real range via the all-priced fallback", () => {
  const cards = Array.from({ length: 20 }, (_, i) => ({
    name: `Pikachu`,
    set: "World Championship Decks",
    cardNumber: String(i + 1),
    rarity: "Promo",
    refPrice: (i + 1) * 3,
    deal: null,
  }));
  const snap = setPriceSnapshot(cards);
  assert.equal(snap.pricedCount, 20);
  assert.equal(snap.minPrice, 3);
  assert.equal(snap.maxPrice, 60);
  assert.ok(snap.medianPrice > 0);
  assert.equal(snap.specialtyPricedCount, 0, "fallback folds specialty into the basis, so the excluded count is 0");
});

test("8. setPriceSnapshot.cardCount is the length it was handed (the fact-strip 'N cards tracked' basis)", () => {
  const cards = [
    { name: "Pikachu", set: "S", cardNumber: "1", refPrice: 5, deal: null },
    { name: "Eevee", set: "S", cardNumber: "2", refPrice: null, deal: null }, // unpriced still counts as tracked
    { name: "Snorlax", set: "S", cardNumber: "3", refPrice: 0, deal: null },
  ];
  assert.equal(setPriceSnapshot(cards).cardCount, 3);
  assert.equal(setPriceSnapshot(cards).pricedCount, 1);
  assert.equal(setPriceSnapshot([]).cardCount, 0);
});

// ---------------------------------------------------------------------------
// 9-13. Production render: World Championship Decks reports whole-set
//       numbers, the interactive surfaces stay bounded.
// ---------------------------------------------------------------------------

test("9. WCD fact strip 'cards tracked' reflects the full set, not the 600-card browse cap", () => {
  assert.equal(wcdRes.status, 200, `${WCD} did not return 200`);
  const m = wcdText.match(/([\d,]+)\s+cards tracked/i);
  assert.ok(m, "no 'N cards tracked' on the WCD page");
  const tracked = Number(m[1].replace(/,/g, ""));
  assert.ok(tracked > MAX_BROWSE, `cards tracked (${tracked}) should exceed the browse cap ${MAX_BROWSE}`);
});

test("10. WCD price summary is populated from real references (no false 'no data')", () => {
  assert.match(wcdText, /card prices at a glance/i);
  assert.ok(
    /priced cards? from World Championship Decks/i.test(wcdText),
    "WCD price summary is not reporting a priced-card population"
  );
  assert.ok(
    !/don.?t have a trustworthy (recent-sold )?(market )?reference for any World Championship Decks card/i.test(wcdText),
    "WCD price summary wrongly claims no data"
  );
});

test("11. WCD 'Pokemon in {set}' reflects the full set (well past the ~233 the 600-card browse slice produced)", () => {
  assert.match(wcdText, /Pokemon in World Championship Decks/i);
  // SetPokemonList's own control: `Show all ${species.length} Pokemon`
  // (one JSX expression -> a single clean text node). The CatalogueBrowser
  // control is `Show all <!-- -->600</button>` and never matches this.
  const showAll = wcdBody.match(/Show all ([\d,]+) Pokemon<\/button>/);
  assert.ok(showAll, "no 'Show all N Pokemon' control from SetPokemonList on the WCD page");
  const n = Number(showAll[1].replace(/,/g, ""));
  const distinctSlugs = new Set(
    [...wcdBody.matchAll(/href="\/pokemon\/([a-z0-9-]+)"/g)].map((m) => m[1])
  ).size;
  assert.ok(
    n >= 250,
    `WCD SetPokemonList species count (${n}) should be a full-set figure, not the browse-capped ~233`
  );
  assert.ok(distinctSlugs >= 250, `only ${distinctSlugs} distinct /pokemon/ links rendered on the WCD page`);
});

test("12. WCD interactive surfaces stay bounded - ItemList <= 100 items, HTML not exploded to ~1,900 tiles", () => {
  const lists = jsonLdBlocks(wcdBody).filter((b) => b && b["@type"] === "ItemList");
  assert.ok(lists.length >= 1, "no ItemList JSON-LD on the WCD page");
  for (const l of lists) {
    assert.ok(
      Array.isArray(l.itemListElement) && l.itemListElement.length <= 100,
      `ItemList has ${l.itemListElement?.length} elements (must stay <= 100)`
    );
  }
  // the checklist grid is still capped near SET_CATALOG_MAX_BROWSE, so the
  // document stays well under what ~1,900 card tiles would produce.
  assert.ok(wcdBody.length < 6_000_000, `WCD HTML is ${wcdBody.length} bytes - browse cap may have been removed`);
  assert.match(wcdText, /card checklist \(\d[\d,]* of \d[\d,]*\)/i);
});

test("13. a normal (< 600-card) set is unaffected - one coherent set of numbers", () => {
  assert.equal(normalRes.status, 200);
  const t = plain(normalRes.body);
  const tracked = Number((t.match(/([\d,]+)\s+cards tracked/i) || [])[1]?.replace(/,/g, "") || "0");
  assert.ok(tracked > 0 && tracked < MAX_BROWSE, `Celebrations tracked count ${tracked} looks wrong`);
  // checklist heading with no "X of Y" truncation for a sub-cap set
  assert.match(t, /Celebrations card checklist \(\d+\)/i);
  assert.match(t, /card prices at a glance/i);
});

// ---------------------------------------------------------------------------
// 14-16. Guardrails: thresholds, deal logic and spelling all untouched.
// ---------------------------------------------------------------------------

test("14. SET_CATALOG_MIN_CARDS is still 10", () => {
  assert.equal(SET_CATALOG_MIN_CARDS, 10);
  const src = readFileSync(join(REPO, "lib", "setHub.js"), "utf8");
  assert.match(src, /SET_CATALOG_MIN_CARDS\s*=\s*10\b/);
});

test("15. SET_MIN_LISTINGS is still 3 (deal path untouched) and no deal/authenticity/freshness logic changed", () => {
  assert.equal(SET_MIN_LISTINGS, 3);
  const idx = readFileSync(join(REPO, "lib", "indexability.js"), "utf8");
  assert.match(idx, /SET_MIN_LISTINGS\s*=\s*3\b/);

  // the two files this phase edits must not reference deal-matching /
  // screening internals
  for (const f of ["lib/deals.js", "app/sets/[slug]/page.js"]) {
    const src = readFileSync(join(REPO, f), "utf8");
    for (const fn of ["listingMatchesCard", "isVisualScreeningCandidate", "GRADED_CARD_PATTERN"]) {
      assert.ok(!src.includes(fn), `${f} references ${fn}`);
    }
  }
  // invariant markers still present in the deal-quality / matcher / authenticity modules
  assert.match(readFileSync(join(REPO, "lib", "dealMatching.js"), "utf8"), /function listingMatchesCard\(/);
  assert.match(readFileSync(join(REPO, "lib", "dealQuality.js"), "utf8"), /isDisplayableDeal/);
  assert.match(readFileSync(join(REPO, "lib", "visualAuthenticity.js"), "utf8"), /\w+/);
});

test("16. no accented \"Pokemon\" in the closeout-touched files or the rendered WCD page", () => {
  // build the accented form from a code point so this file has no literal
  const ACCENTED = `Pok${String.fromCharCode(233)}mon`;
  for (const f of [
    "lib/deals.js",
    "app/sets/[slug]/page.js",
    "lib/setSummary.js",
    "docs/seo-set-catalogue-expansion.md",
  ]) {
    const src = readFileSync(join(REPO, f), "utf8");
    assert.ok(!src.includes(ACCENTED), `${f} contains an accented "Pokemon"`);
  }
  assert.ok(!wcdBody.includes(ACCENTED), "rendered WCD set page contains an accented \"Pokemon\"");
});
