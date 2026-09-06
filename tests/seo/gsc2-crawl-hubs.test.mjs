// SEO-GSC-2 — crawl discovery + catalogue hub strengthening.
//
// GSC (2026-09-06, docs/gsc-indexation-audit.md) showed the /pokemon and
// /cards index pages had never been crawled and the deep catalogue was
// reachable mostly via the sitemap + expiring deal URLs. This phase adds:
//   - a stable, always-visible, server-rendered footer "Browse" row
//     linking /deals /cards /pokemon /sets /guides on EVERY page
//   - a complete A-Z /sets/[slug] index on /cards (SetLinkIndex)
//   - the full (uncapped) plain-text card index on /sets/[slug]
//     (CatalogueLinkIndex) so the ~1,900 indexable cards past the
//     600-tile image-grid cap in the 4 grab-bag "sets" stay crawlable
// It changes NO robots / canonical / sitemap-lastmod / indexability rule.

import { test, before } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { get, parseHtml, sitemapUrls, sample, pathOf } from "./lib.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const read = (p) => readFileSync(join(HERE, "..", "..", p), "utf8");

// ---------------------------------------------------------------------------
// source-level: the footer Browse row
// ---------------------------------------------------------------------------

test("1. SiteFooter renders a server-rendered, always-visible Browse row for every catalogue hub", () => {
  const src = read("components/SiteFooter.js");
  assert.doesNotMatch(src, /"use client"/, "SiteFooter must stay a server component");
  const block = src.slice(src.indexOf("BROWSE_LINKS"), src.indexOf("const LINKS"));
  for (const h of ["/deals", "/cards", "/pokemon", "/sets", "/guides"]) {
    assert.ok(block.includes(`"${h}"`), `footer Browse row missing ${h}`);
  }
  // no display:none / client gating on the row
  const nav = src.slice(src.indexOf('aria-label="Browse the catalogue"'), src.indexOf("</nav>", src.indexOf('aria-label="Browse the catalogue"')));
  assert.doesNotMatch(nav, /hidden|display:\s*none|useState|onClick/, "footer Browse row is hidden or client-gated");
});

// ---------------------------------------------------------------------------
// source-level: /cards full set index + lib/deals uncap
// ---------------------------------------------------------------------------

test("2. /cards renders the complete SetLinkIndex (all set hubs), not a 24-set slice", () => {
  const page = read("app/cards/page.js");
  assert.match(page, /import SetLinkIndex/, "/cards does not import SetLinkIndex");
  assert.match(page, /<SetLinkIndex sets=\{allSets\}/, "/cards does not render <SetLinkIndex sets={allSets}>");
  assert.match(page, /const allSets = \[\.\.\.setBySlug\.values\(\)\]/, "/cards no longer builds the full allSets list");
  const idx = read("components/SetLinkIndex.js");
  assert.doesNotMatch(idx, /"use client"/, "SetLinkIndex must be a server component");
  assert.doesNotMatch(idx, /^\s*import .*from ["']next\/link["']/m, "SetLinkIndex must use plain <a>, not next/link");
  assert.match(idx, /href=\{`\/sets\/\$\{s\.slug\}`\}/, "SetLinkIndex must link /sets/[slug]");
});

test("3. the /sets/[slug] crawl index (CatalogueLinkIndex) gets the FULL set, not the 600-tile cap", () => {
  const lib = read("lib/deals.js");
  assert.match(lib, /export const SET_LINK_INDEX_MAX = \d+/, "SET_LINK_INDEX_MAX not defined");
  const max = Number(lib.match(/SET_LINK_INDEX_MAX = (\d+)/)[1]);
  assert.ok(max >= 1800, `SET_LINK_INDEX_MAX ${max} is below the largest real grab-bag set`);
  assert.match(lib, /const indexCards = \[\.\.\.dealCards, \.\.\.indexBrowse\]\.slice\(0, SET_LINK_INDEX_MAX\)/);
  // the text crawl index is INDEXABLE cards only - no noindex/thin pages
  assert.match(lib, /c\.hubSlug != null \|\| \(c\.catalogSlug != null && catalogPriceOk\(c\.refPrice\)\)/);
  assert.match(lib, /indexCards, \/\/ full list/);
  // the image grid keeps its 600 cap
  assert.match(lib, /const trimmed = \[\.\.\.dealCards, \.\.\.browseCards\.slice\(0, SET_CATALOG_MAX_BROWSE\)\]/);
  const setpage = read("app/sets/[slug]/page.js");
  assert.match(setpage, /indexCards: catalogIndexCards/);
  assert.match(setpage, /catalogueIndexItems = buildCatalogueItems\(\s*catalogIndexCards/s);
  assert.match(setpage, /<CatalogueLinkIndex label=\{resolved\.set\} cards=\{catalogueIndexItems\}/);
});

// ---------------------------------------------------------------------------
// source-level: nothing regressed
// ---------------------------------------------------------------------------

test("4. no robots / canonical / sitemap-lastmod / indexability change", () => {
  const sitemap = read("lib/sitemap.js");
  // still no <lastmod> on stable segments, still omitted from the index
  assert.match(sitemap, /The sitemap index deliberately carries no last-modified/);
  assert.doesNotMatch(sitemap, /new Date\(\)\.toISOString\(\)|Date\.now\(\)/, "sitemap emits a build-time timestamp");
  const robots = read("app/robots.js");
  assert.match(robots, /\/api\//, "robots no longer disallows /api/");
  // hub pages keep their self-canonical + no forced noindex
  for (const f of ["app/pokemon/page.js", "app/cards/page.js", "app/sets/page.js"]) {
    const src = read(f);
    assert.match(src, /alternates: \{ canonical:/, `${f} lost its canonical`);
    assert.doesNotMatch(src, /robots:\s*\{[^}]*noindex/, `${f} gained a noindex`);
  }
});

test("5. P0.4.1 homepage variety is preserved (selectDiverseLane / rotationBucket still wired)", () => {
  const home = read("app/page.js");
  assert.match(home, /buildHomepageLanes|selectDiverseLane/, "homepage variety selector removed");
  assert.match(home, /HomeBrowseLinks/, "homepage static browse links removed");
  assert.doesNotMatch(home, /Math\.random\(\)/, "homepage re-introduced per-request randomisation");
});

// ---------------------------------------------------------------------------
// live server: raw HTML crawl paths
// ---------------------------------------------------------------------------

let homeHtml, pokemonHtml, cardsHtml, setsHtml, guidesHtml;
before(async () => {
  [homeHtml, pokemonHtml, cardsHtml, setsHtml, guidesHtml] = await Promise.all(
    ["/", "/pokemon", "/cards", "/sets", "/guides"].map((p) => get(p))
  );
});

test("6. the four catalogue hubs + /deals are 200, indexable, self-canonical", async () => {
  for (const [p, r] of [["/", homeHtml], ["/pokemon", pokemonHtml], ["/cards", cardsHtml], ["/sets", setsHtml], ["/guides", guidesHtml]]) {
    assert.equal(r.status, 200, `${p} -> ${r.status}`);
    const h = parseHtml(r.body);
    assert.doesNotMatch(h.robots ?? "", /noindex/, `${p} is noindex`);
    assert.ok((h.canonicals ?? []).some((c) => pathOf(c) === (p === "/" ? "/" : p)), `${p} not self-canonical`);
  }
});

test("7. every page carries the footer Browse row - hubs reachable from ANY page", () => {
  for (const [name, html] of [["home", homeHtml], ["/pokemon", pokemonHtml], ["/cards", cardsHtml], ["/guides", guidesHtml]]) {
    const links = new Set([...html.body.matchAll(/href="(\/[a-z0-9-]*)"/g)].map((m) => m[1]));
    for (const h of ["/deals", "/cards", "/pokemon", "/sets", "/guides"]) {
      assert.ok(links.has(h), `${name} raw HTML is missing a stable ${h} link`);
    }
  }
});

test("8. /pokemon raw HTML links every indexable species hub (no client-only crawl tree)", () => {
  const species = new Set([...pokemonHtml.body.matchAll(/href="(\/pokemon\/[a-z0-9-]+)"/g)].map((m) => m[1]));
  assert.ok(species.size >= 800, `only ${species.size} /pokemon/[slug] links in raw /pokemon HTML`);
  assert.match(pokemonHtml.body, /<h1[^>]*>[^<]*Browse Pokemon/i, "no clear H1 on /pokemon");
});

test("9. /cards raw HTML now fans out to the full set universe (SetLinkIndex)", () => {
  const sets = new Set([...cardsHtml.body.matchAll(/href="(\/sets\/[a-z0-9-]+)"/g)].map((m) => m[1]));
  assert.ok(sets.size >= 150, `only ${sets.size} /sets/[slug] links in raw /cards HTML (expected the full ~200 index)`);
  assert.match(cardsHtml.body, /Every set we track/, "SetLinkIndex heading missing from /cards");
  // still not a 23k-card render
  const cards = [...cardsHtml.body.matchAll(/href="\/cards\/[a-z0-9-]+"/g)].length;
  assert.ok(cards < 200, `/cards renders ${cards} card links`);
});

test("10. an oversized grab-bag set exposes >600 crawlable card links (full CatalogueLinkIndex)", async () => {
  const r = await get("/sets/world-championship-decks");
  if (r.status !== 200) return; // set not indexable in this data snapshot
  const cards = new Set([...r.body.matchAll(/href="(\/cards\/[a-z0-9-]+)"/g)].map((m) => m[1]));
  assert.ok(cards.size > 600, `/sets/world-championship-decks exposes only ${cards.size} card links (600-tile cap not lifted for the text index)`);
  assert.match(r.body, /Full .* card index \(\d+\)/, "no full-set card index heading");
});

test("11. no indexable-orphan regression: sampled species / set / card sitemap URLs are 200 + indexable", async () => {
  const sm = await sitemapUrls();
  for (const seg of ["pokemon", "sets", "cards"]) {
    const urls = (sm.byType.get(seg) ?? []).map(pathOf).filter((p) => /\/[a-z0-9-]+$/.test(p) && p !== `/${seg}`);
    for (const p of sample(urls, 6)) {
      const r = await get(p);
      assert.equal(r.status, 200, `${p} -> ${r.status}`);
      assert.doesNotMatch(parseHtml(r.body).robots ?? "", /noindex/, `${p} is in the ${seg} sitemap but noindex`);
    }
  }
});

test("12. a sampled /sets/[slug] page links its cards in raw HTML AND back to catalogue nav", async () => {
  const sm = await sitemapUrls();
  const setUrls = (sm.byType.get("sets") ?? []).map(pathOf).filter((p) => p !== "/sets");
  let checked = 0;
  for (const p of sample(setUrls, 8)) {
    const r = await get(p);
    if (r.status !== 200) continue;
    const cardLinks = [...r.body.matchAll(/href="\/cards\/[a-z0-9-]+"/g)].length;
    if (cardLinks === 0) continue; // catalogue-thin set - fine
    checked++;
    const nav = new Set([...r.body.matchAll(/href="(\/[a-z0-9-]*)"/g)].map((m) => m[1]));
    assert.ok(nav.has("/pokemon") && nav.has("/sets") && nav.has("/cards"), `${p} missing footer hub links`);
  }
  assert.ok(checked >= 1, "no /sets/[slug] page with crawlable card links was sampled");
});
