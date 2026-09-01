// SEO Phase 4B - /cards card database directory + durable card-to-card
// internal linking. ONE indexable /cards directory that routes exact
// intent to the permanent /cards/[slug] pages and strengthens the
// Pokemon <-> set <-> card link graph. No new card-value URL universe,
// no 23k-card render, no card-detail sitemap change, no deal/matcher/
// authenticity/freshness change.

import { test, before } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { get, parseHtml, sitemapUrls, sample, pathOf } from "./lib.mjs";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const ORIGIN = "https://pokemondealfinder.com";
const ACCENTED = `Pok${String.fromCharCode(233)}mon`;

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

let dir, dirParsed, dealCardPath, dealCardParsed, catCardPath, catCardParsed;
let cardsSitemap, pagesSitemap;

before(async () => {
  dir = await get("/cards");
  dirParsed = dir.status === 200 ? parseHtml(dir.body) : null;

  const sm = await sitemapUrls();
  const cardUrls = (sm.byType.get("cards") ?? []).map(pathOf).filter((p) => p !== "/cards");
  // a deal-backed card page shows a live "active listings" module; a
  // catalogue-only one says "No live eBay deals right now".
  for (const p of sample(cardUrls, 14)) {
    const r = await get(p);
    if (r.status !== 200) continue;
    const t = text(r.body);
    if (!catCardPath && /No live eBay deals right now/i.test(t)) {
      catCardPath = p;
      catCardParsed = parseHtml(r.body);
    } else if (!dealCardPath && /active listing/i.test(t) && !/No live eBay deals right now/i.test(t)) {
      dealCardPath = p;
      dealCardParsed = parseHtml(r.body);
    }
    if (dealCardPath && catCardPath) break;
  }

  cardsSitemap = (await get("/sitemaps/cards.xml")).body || "";
  pagesSitemap = (await get("/sitemaps/pages.xml")).body || "";
});

// ---------------------------------------------------------------------------
// 1-5: the /cards directory route itself
// ---------------------------------------------------------------------------

test("1. /cards exists and is indexable", () => {
  assert.equal(dir.status, 200, `/cards returned ${dir.status}`);
  assert.ok(!dirParsed.robots || !dirParsed.robots.includes("noindex"), `/cards robots: ${dirParsed.robots}`);
  assert.equal(dirParsed.h1s.length, 1, `expected 1 <h1>, got ${dirParsed.h1s.length}`);
});

test("2. /cards is self-canonical", () => {
  assert.equal(dirParsed.canonicals.length, 1);
  assert.equal(pathOf(dirParsed.canonicals[0]), "/cards");
  assert.match(dirParsed.canonicals[0], /^https:\/\/pokemondealfinder\.com\/cards$/);
});

test("3. /cards metadata is stable - no live count / price / catalogue total", () => {
  const src = readFileSync(join(REPO, "app", "cards", "page.js"), "utf8");
  // the exported metadata object must not interpolate a fetched number
  const metaBlock = src.slice(src.indexOf("export const metadata"), src.indexOf("};", src.indexOf("export const metadata")));
  assert.ok(!/\$\{/.test(metaBlock.replace(/\$\{SITE_URL\}/g, "")), "metadata interpolates a value");
  assert.ok(!/\d{2,}/.test(dirParsed.title), `title has digits: ${dirParsed.title}`);
  assert.ok(!/\$\d|\d[\d,]{2,}\s*(cards|deals|sets)/i.test(dirParsed.metaDescription), `volatile meta description: ${dirParsed.metaDescription}`);
  assert.ok(dirParsed.metaDescription.length >= 20 && dirParsed.metaDescription.length <= 320);
});

test("4. bare /cards is in the pages/static sitemap segment", () => {
  assert.match(pagesSitemap, /<loc>https:\/\/pokemondealfinder\.com\/cards<\/loc>/);
});

test("5. /cards is NOT duplicated into the card-detail sitemap segment", () => {
  assert.ok(
    !/<loc>https:\/\/pokemondealfinder\.com\/cards<\/loc>/.test(cardsSitemap),
    "bare /cards leaked into /sitemaps/cards.xml (the card-entity segment)"
  );
  // the card-detail segment still lists real /cards/<slug> entities
  const detail = (cardsSitemap.match(/<loc>https:\/\/pokemondealfinder\.com\/cards\/[^<]+<\/loc>/g) ?? []).length;
  assert.ok(detail > 10000, `card-detail sitemap only has ${detail} entries`);
});

// ---------------------------------------------------------------------------
// 6-9: /cards links out into the entity graph
// ---------------------------------------------------------------------------

test("6. /cards links the price checker (/search)", () => {
  assert.ok(dirParsed.internalLinks.includes("/search"), "/cards has no /search link");
  // and it submits its own search box to /search (no second backend)
  assert.match(dir.body, /<form[^>]+action=["']\/search["']/i);
});

test("7. /cards links individual /pokemon/[slug] hubs and the /pokemon index", () => {
  assert.ok(dirParsed.internalLinks.includes("/pokemon"), "no /pokemon index link");
  const n = dirParsed.internalLinks.filter((l) => /^\/pokemon\/[a-z0-9-]+$/.test(l)).length;
  assert.ok(n >= 10, `only ${n} /pokemon/[slug] links on /cards`);
});

test("8. /cards links individual /sets/[slug] hubs and the /sets index", () => {
  assert.ok(dirParsed.internalLinks.includes("/sets"), "no /sets index link");
  const n = dirParsed.internalLinks.filter((l) => /^\/sets\/[a-z0-9-]+$/.test(l)).length;
  assert.ok(n >= 10, `only ${n} /sets/[slug] links on /cards`);
});

test("9. /cards featured cards link permanent /cards/[slug] pages", () => {
  const n = dirParsed.internalLinks.filter((l) => /^\/cards\/[a-z0-9-]+$/.test(l)).length;
  assert.ok(n >= 12, `only ${n} /cards/[slug] links on /cards`);
});

// ---------------------------------------------------------------------------
// 10-11: no giant render, no indexable query universe
// ---------------------------------------------------------------------------

test("10. /cards is not a 23k-card render", () => {
  const cardLinks = dirParsed.internalLinks.filter((l) => /^\/cards\/[a-z0-9-]+$/.test(l)).length;
  assert.ok(cardLinks < 200, `/cards renders ${cardLinks} card links - too many for a directory`);
  assert.ok(dir.body.length < 400_000, `/cards HTML is ${dir.body.length} bytes`);
});

test("11. /cards filter/query states do not create an indexable URL universe", async () => {
  // a ?q= state canonicalises back to the bare /cards (or 200s the same
  // page); it must never be its own indexable URL, and must never appear
  // in a sitemap.
  const q = await get("/cards?q=charizard&sort=value&page=3");
  if (q.status === 200) {
    const p = parseHtml(q.body);
    if (p.canonicals.length) assert.equal(pathOf(p.canonicals[0]), "/cards", "filtered /cards canonical is not bare /cards");
  }
  assert.ok(!/<loc>[^<]*\/cards\?[^<]*<\/loc>/.test(cardsSitemap + pagesSitemap), "a filtered /cards URL is in a sitemap");
  const src = readFileSync(join(REPO, "app", "cards", "page.js"), "utf8");
  assert.ok(!/searchParams/.test(src), "/cards route reads searchParams (server-visible filter state)");
});

// ---------------------------------------------------------------------------
// 12-15: card -> Pokemon / card -> set linking on /cards/[slug]
// ---------------------------------------------------------------------------

test("12. a species-bearing deal-backed card links its Pokemon hub", () => {
  assert.ok(dealCardParsed, "no deal-backed card page sampled");
  const links = dealCardParsed.internalLinks.filter((l) => /^\/pokemon\/[a-z0-9-]+$/.test(l));
  // sampled card may be a Trainer/Energy; only assert when its H1 looks like a species card
  const h1 = (dealCardParsed.h1s[0] || "").toLowerCase();
  if (!/\benergy\b|\btrainer\b|\bstadium\b/.test(h1)) {
    assert.ok(links.length >= 1, `deal-backed card ${dealCardPath} has no /pokemon link (h1: ${dealCardParsed.h1s[0]})`);
  }
});

test("13. a species-bearing catalogue-only card links its Pokemon hub", async () => {
  // deterministic species card that has no live deal cheaply enough to
  // be catalogue-only most of the time
  const r = await get("/cards/caterpie-base-set");
  if (r.status === 200) {
    const p = parseHtml(r.body);
    const links = p.internalLinks.filter((l) => /^\/pokemon\/[a-z0-9-]+$/.test(l));
    assert.ok(links.includes("/pokemon/caterpie"), `caterpie-base-set links: ${links.join(", ")}`);
  } else if (catCardParsed) {
    const h1 = (catCardParsed.h1s[0] || "").toLowerCase();
    if (!/\benergy\b|\btrainer\b|\bstadium\b/.test(h1)) {
      const links = catCardParsed.internalLinks.filter((l) => /^\/pokemon\/[a-z0-9-]+$/.test(l));
      assert.ok(links.length >= 1, `catalogue card ${catCardPath} has no /pokemon link`);
    }
  }
});

test("14. a Trainer / Energy card does not get a bogus Pokemon link", async () => {
  // shared rule (lib/cardLinks.cardSpeciesLink) rejects a mid-title
  // species mention on both render paths
  const src = readFileSync(join(REPO, "lib", "cardLinks.js"), "utf8");
  assert.match(src, /isEligibleSpeciesCard/);
  assert.match(src, /speciesLeadsCardName/);
  // both render paths use the same helper, not raw extractSpecies + link
  const hub = readFileSync(join(REPO, "app", "cards", "[slug]", "page.js"), "utf8");
  const cat = readFileSync(join(REPO, "components", "CatalogCardView.js"), "utf8");
  assert.match(hub, /cardSpeciesLink\(/);
  assert.match(cat, /cardSpeciesLink\(/);
  assert.ok(!/resolveSpeciesByName/.test(hub), "deal-backed card page still uses the deal-only species resolver");
});

test("15. a card links its set hub only when a qualifying set page exists", () => {
  for (const [path, parsed] of [
    [dealCardPath, dealCardParsed],
    [catCardPath, catCardParsed],
  ]) {
    if (!parsed) continue;
    const setLinks = parsed.internalLinks.filter((l) => /^\/sets\/[a-z0-9-]+$/.test(l));
    // every /sets link on a card page must be a real sitemap set hub
    // (checked loosely: it resolves 200 - done in the sitemap suite; here
    // just assert we didn't emit an obviously broken empty slug)
    for (const l of setLinks) assert.ok(l.length > "/sets/".length, `${path}: empty set slug`);
  }
  // source: the set link is gated on validSetSlugs / setHasPage
  const hub = readFileSync(join(REPO, "app", "cards", "[slug]", "page.js"), "utf8");
  assert.match(hub, /setHasPage/);
});

// ---------------------------------------------------------------------------
// 16-18: related-card component
// ---------------------------------------------------------------------------

test("16. related-card links exclude the current card", () => {
  for (const [path, parsed] of [
    [dealCardPath, dealCardParsed],
    [catCardPath, catCardParsed],
  ]) {
    if (!parsed || !path) continue;
    const self = pathOf(parsed.canonicals[0] || path);
    const dupes = parsed.internalLinks.filter((l) => l === self).length;
    assert.equal(dupes, 0, `${path} links to itself in a related list`);
  }
});

test("17. related-card links resolve to real /cards/[slug] pages", async () => {
  const parsed = catCardParsed || dealCardParsed;
  const path = catCardPath || dealCardPath;
  assert.ok(parsed, "no card page sampled");
  const related = parsed.internalLinks.filter((l) => /^\/cards\/[a-z0-9-]+$/.test(l) && l !== pathOf(parsed.canonicals[0] || path));
  if (related.length === 0) return; // a card with no catalogue siblings is legitimate
  const r = await get(related[0]);
  assert.equal(r.status, 200, `related card ${related[0]} returned ${r.status}`);
});

test("18. related / featured ranking keeps standard cards ahead of specialty", () => {
  const rel = readFileSync(join(REPO, "lib", "deals.js"), "utf8");
  // fetchCardRelations + fetchTopCatalogCards both sort by cardTier first
  assert.ok(
    (rel.match(/cardTier\(a\)\s*-\s*cardTier\(b\)/g) ?? []).length >= 2,
    "cardTier (standard-before-specialty) ordering missing from the Phase 4B fetchers"
  );
});

// ---------------------------------------------------------------------------
// 19-22: schema & sitemap invariants unchanged
// ---------------------------------------------------------------------------

test("19. a catalogue-only card still carries NO Offer schema", async () => {
  const parsed = catCardParsed;
  if (!parsed) return;
  const types = ldTypes(parsed);
  assert.ok(!types.has("Offer"), `catalogue-only card ${catCardPath} has Offer schema`);
  assert.ok(!types.has("Product"), `catalogue-only card ${catCardPath} has Product schema`);
  assert.ok(types.has("BreadcrumbList"), "no BreadcrumbList on the catalogue card");
});

test("20. a deal-backed card keeps its real Product + Offer schema", () => {
  if (!dealCardParsed) return;
  const types = ldTypes(dealCardParsed);
  assert.ok(types.has("Product"), `deal-backed card ${dealCardPath} lost Product schema`);
  assert.ok(types.has("Offer"), `deal-backed card ${dealCardPath} lost Offer schema`);
});

test("21. no new card-value URL universe was created", async () => {
  for (const bad of [
    "/card-value/charizard-base-set",
    "/price/charizard-base-set",
    "/cards/charizard-base-set/value",
    "/cards/charizard-base-set/prices",
    "/cards/charizard-base-set/psa-10",
  ]) {
    const r = await get(bad);
    assert.ok(r.status === 404 || r.isRedirect, `${bad} returned ${r.status} (should 404)`);
  }
});

test("22. card-detail sitemap parity is unchanged (bare /cards not counted as a card entity)", () => {
  const detail = (cardsSitemap.match(/<loc>[^<]*\/cards\/[^<]+<\/loc>/g) ?? []).length;
  // the segment is still ~23k real card slugs; adding the directory did
  // not inflate or deflate it
  assert.ok(detail >= 20000 && detail <= 30000, `card-detail sitemap count ${detail} outside expected band`);
  const src = readFileSync(join(REPO, "lib", "sitemap.js"), "utf8");
  const cardsCase = src.slice(src.indexOf('case "cards"'), src.indexOf('case "deals"'));
  assert.ok(!/\/cards["'`]\s*,/.test(cardsCase.replace(/\/cards\/\$\{/g, "")), "bare /cards added to the cards sitemap case");
});

// ---------------------------------------------------------------------------
// 23-24: spelling + no deal-logic drift
// ---------------------------------------------------------------------------

test("23. public spelling is \"Pokemon\" (no accent) on /cards and the new modules", () => {
  assert.ok(!dir.body.includes(ACCENTED), "/cards rendered an accented \"Pokemon\"");
  for (const f of [
    "app/cards/page.js",
    "lib/cardLinks.js",
    "components/RelatedCards.js",
  ]) {
    assert.ok(!readFileSync(join(REPO, f), "utf8").includes(ACCENTED), `${f} has an accented "Pokemon"`);
  }
});

test("24. no deal / matcher / authenticity / freshness logic changed", () => {
  for (const f of ["app/cards/page.js", "lib/cardLinks.js", "components/RelatedCards.js", "components/CatalogCardView.js"]) {
    const src = readFileSync(join(REPO, f), "utf8");
    for (const fn of ["isDisplayableDeal", "isPremiumDealEligible", "listingMatchesCard", "GRADED_CARD_PATTERN", "isVisualScreeningCandidate", "dealFreshness"]) {
      assert.ok(!src.includes(fn), `${f} references ${fn}`);
    }
  }
  assert.match(readFileSync(join(REPO, "lib", "dealMatching.js"), "utf8"), /function listingMatchesCard\(/);
  assert.match(readFileSync(join(REPO, "lib", "dealQuality.js"), "utf8"), /isDisplayableDeal/);
});
