// SEO Phase 5 - crawl / sitemap / robots / parameter hygiene.
// Durable invariants + regressions for the two Phase 5 fixes:
//   (a) the sitemap INDEX no longer emits a fake `new Date()` <lastmod>
//   (b) DealCard's `?from=` deal links carry rel="nofollow" (the same
//       rule the header / filter bars already apply to internal
//       query-param links)
// Everything else in this file is a standing guardrail - it asserts the
// crawl surface that the audit found already-clean stays that way.

import { test, before } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { get, parseHtml, sitemapUrls, sample, pathOf, normPath } from "./lib.mjs";

import { CARD_HUB_MIN_LISTINGS, SET_MIN_LISTINGS, SPECIES_MIN_LISTINGS } from "../../lib/indexability.js";
import { SET_CATALOG_MIN_CARDS } from "../../lib/setHub.js";
import { SPECIES_CATALOG_MIN_CARDS } from "../../lib/speciesHub.js";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const ACCENTED = `Pok${String.fromCharCode(233)}mon`;

function canonicalOf(html) {
  const p = parseHtml(html);
  return p.canonicals[0] ?? null;
}

let idxRes, idxBody, byType, allChildBodies;

before(async () => {
  idxRes = await get("/sitemap.xml");
  idxBody = idxRes.body;
  const sm = await sitemapUrls();
  byType = sm.byType;
  allChildBodies = [];
  for (const child of sm.childSitemaps) {
    const r = await get(pathOf(child));
    allChildBodies.push({ seg: pathOf(child).split("/").pop().replace(".xml", ""), body: r.body });
  }
});

// ---------------------------------------------------------------------------
// 1-2: sitemap index — valid, and NO fabricated lastmod (Phase 5 fix)
// ---------------------------------------------------------------------------

test("1. sitemap index is a valid <sitemapindex> with the expected child segments", () => {
  assert.equal(idxRes.status, 200);
  assert.match(idxRes.contentType, /xml/i);
  assert.match(idxBody, /<sitemapindex[\s>]/);
  for (const seg of ["pages", "sets", "pokemon", "cards", "deals", "sealed-deals"]) {
    assert.match(idxBody, new RegExp(`<loc>https://pokemondealfinder\\.com/sitemaps/${seg}\\.xml</loc>`), `index missing ${seg}`);
  }
});

test("2. sitemap index emits NO <lastmod> (no fabricated always-current timestamp)", () => {
  assert.ok(!/<lastmod>/.test(idxBody), `sitemap index still emits <lastmod>: ${(idxBody.match(/<lastmod>[^<]*<\/lastmod>/) || [])[0]}`);
  // source: indexXml() builds child rows with no lastmod (comments stripped
  // so a comment mentioning the old behaviour doesn't trip this)
  const src = readFileSync(join(REPO, "lib", "sitemap.js"), "utf8").replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
  const indexFn = src.slice(src.indexOf("function indexXml"), src.indexOf("function indexXml") + 600);
  assert.ok(!/new Date\(/.test(indexFn), "indexXml() still calls new Date()");
  assert.ok(!/<lastmod>/.test(indexFn), "indexXml() still writes <lastmod>");
});

test("3. per-URL <lastmod> only appears in the deal / sealed segments and is a real timestamp", () => {
  for (const { seg, body } of allChildBodies) {
    const lm = [...body.matchAll(/<lastmod>([^<]+)<\/lastmod>/g)].map((m) => m[1]);
    if (seg === "deals" || seg === "sealed-deals") {
      assert.ok(lm.length > 0, `${seg} has no <lastmod>`);
      for (const v of lm.slice(0, 5)) assert.ok(!Number.isNaN(Date.parse(v)), `${seg} bad lastmod ${v}`);
      // real data, not "right now": at least one entry older than an hour
      const anyOld = lm.some((v) => Date.now() - Date.parse(v) > 3600_000);
      assert.ok(anyOld, `${seg} lastmods all look freshly stamped`);
    } else {
      assert.equal(lm.length, 0, `${seg} emits <lastmod> but has no trustworthy source (should omit)`);
    }
  }
});

// ---------------------------------------------------------------------------
// 4-7: sitemap <-> indexability parity
// ---------------------------------------------------------------------------

test("4. every URL belongs to exactly one sitemap segment (no cross-segment duplication)", () => {
  const owner = new Map();
  const dupes = [];
  for (const { seg, body } of allChildBodies) {
    for (const m of body.matchAll(/<loc>([^<]+)<\/loc>/g)) {
      const u = m[1].replace(/&amp;/g, "&");
      if (owner.has(u)) dupes.push(`${u} in ${owner.get(u)} + ${seg}`);
      else owner.set(u, seg);
    }
  }
  assert.deepEqual(dupes, [], `cross-segment duplicate URLs: ${dupes.slice(0, 10).join("; ")}`);
});

test("5. sampled sitemap URLs are 200, self-canonical, indexable, not redirected", async () => {
  // STABLE segments (pages/sets/pokemon/cards) must be exact: 0 stale.
  // EPHEMERAL segments (deals/sealed-deals) are cached aggregates of
  // listings that expire continuously - a just-expired listing is
  // noindex on its page immediately but can linger one revalidate
  // window (~5 min) in the sitemap. Tolerate a small fraction there;
  // fail only if a large share is stale (a genuinely broken cache).
  const EPHEMERAL = new Set(["deals", "sealed-deals"]);
  for (const [type, urls] of byType) {
    const picks = sample(urls, type === "pages" ? 6 : type === "cards" ? 6 : EPHEMERAL.has(type) ? 12 : 5);
    let stale = 0;
    const detail = [];
    for (const u of picks) {
      const r = await get(pathOf(u));
      const problem =
        r.isRedirect ? `redirects -> ${r.location}` :
        r.status !== 200 ? `HTTP ${r.status}` :
        /<meta[^>]+name=["']robots["'][^>]+content=["'][^"']*noindex/i.test(r.body) ? "noindex" :
        !canonicalOf(r.body) ? "no canonical" :
        normPath(canonicalOf(r.body)) !== normPath(pathOf(u)) ? `canonical -> ${canonicalOf(r.body)}` : null;
      if (problem) { stale++; detail.push(`${pathOf(u)} :: ${problem}`); }
    }
    if (EPHEMERAL.has(type)) {
      assert.ok(stale / picks.length <= 0.34, `${type}: ${stale}/${picks.length} sampled URLs stale (cache likely broken) - ${detail.join("; ")}`);
    } else {
      assert.equal(stale, 0, `${type}: ${detail.join("; ")}`);
    }
  }
});

test("6. no /price-checker (redirect-only) URL in any sitemap segment", () => {
  for (const { seg, body } of allChildBodies) {
    assert.ok(!/\/price-checker/.test(body), `${seg} contains a /price-checker URL`);
  }
});

test("7. /price-checker permanently redirects to /search and is not linked as a primary target", async () => {
  const r = await get("/price-checker");
  assert.ok(r.status === 308 || r.status === 301, `/price-checker -> HTTP ${r.status}`);
  assert.equal(pathOf(r.location), "/search");
  // nav points at the final destination
  const nav = readFileSync(join(REPO, "lib", "navLinks.js"), "utf8");
  assert.ok(!/\/price-checker/.test(nav), "navLinks references /price-checker instead of /search");
});

// ---------------------------------------------------------------------------
// 8-10: query-parameter crawl surface
// ---------------------------------------------------------------------------

test("8. /search is indexable + self-canonical; /search?q= is noindex + canonical to bare /search", async () => {
  const bare = await get("/search");
  assert.equal(bare.status, 200);
  assert.equal(normPath(canonicalOf(bare.body)), "/search");
  assert.ok(!/content=["'][^"']*noindex/i.test(bare.body), "bare /search is noindex");

  const q = await get("/search?q=charizard");
  assert.equal(q.status, 200);
  assert.match(q.body, /<meta[^>]+name=["']robots["'][^>]+content=["'][^"']*noindex/i, "/search?q= is not noindex");
  assert.equal(normPath(canonicalOf(q.body)), "/search", "/search?q= canonical is not bare /search");
});

test("9. parameter variants of entity + directory pages canonicalise to the bare URL", async () => {
  const targets = [];
  for (const seg of ["pokemon", "sets", "cards"]) {
    const urls = byType.get(seg) ?? [];
    if (urls.length) targets.push(pathOf(urls[Math.floor(urls.length / 2)]));
  }
  targets.push("/cards", "/pokemon", "/sets", "/best-finds");
  const params = ["?country=EBAY_GB", "?from=/pokemon/pikachu", "?sort=value", "?rarity=Rare", "?page=2", "?utm_source=x"];
  for (const t of targets) {
    for (const p of params) {
      const r = await get(t + p);
      if (r.status !== 200) continue;
      assert.equal(normPath(canonicalOf(r.body)), normPath(t), `${t}${p} canonical -> ${canonicalOf(r.body)}`);
    }
  }
});

test("10. no sitemap URL carries a query string", () => {
  for (const { seg, body } of allChildBodies) {
    const withQ = [...body.matchAll(/<loc>([^<]*\?[^<]*)<\/loc>/g)].map((m) => m[1]);
    assert.deepEqual(withQ, [], `${seg} has query-string URLs: ${withQ.slice(0, 5).join(", ")}`);
  }
});

// ---------------------------------------------------------------------------
// 11-13: robots.txt + API + crawlable content
// ---------------------------------------------------------------------------

test("11. robots.txt allows crawling, disallows /api/, declares the sitemap", async () => {
  const r = await get("/robots.txt");
  assert.equal(r.status, 200);
  assert.match(r.body, /User-Agent:\s*\*/i);
  assert.match(r.body, /Allow:\s*\//i);
  assert.match(r.body, /Disallow:\s*\/api\//i);
  assert.match(r.body, /Sitemap:\s*https:\/\/pokemondealfinder\.com\/sitemap\.xml/i);
  // no accidental blanket block
  assert.ok(!/Disallow:\s*\/\s*$/m.test(r.body), "robots.txt has a blanket Disallow: /");
});

test("12. important public routes are crawler-accessible (200 + real content in server HTML)", async () => {
  for (const path of ["/", "/cards", "/pokemon", "/sets", "/search", "/methodology", "/how-it-works", "/about"]) {
    const r = await get(path);
    assert.equal(r.status, 200, `${path} -> HTTP ${r.status}`);
    const p = parseHtml(r.body);
    assert.equal(p.h1s.length, 1, `${path} has ${p.h1s.length} <h1>`);
    assert.ok(p.h1s[0].length > 2, `${path} empty H1`);
    assert.ok(p.jsonLd.length >= 1, `${path} has no JSON-LD`);
    const textLen = r.body.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().length;
    assert.ok(textLen > 600, `${path} server HTML has only ${textLen} chars of text`);
  }
});

// ---------------------------------------------------------------------------
// 14-15: nofollow policy
// ---------------------------------------------------------------------------

test("14. DealCard `?from=` deal links carry rel=nofollow (bare /deals/[id] links stay followed)", async () => {
  const src = readFileSync(join(REPO, "components", "DealCard.js"), "utf8");
  assert.match(src, /dealRel\s*=\s*dealHref\.includes\("\?"\)\s*\?\s*"nofollow"/);
  assert.equal((src.match(/rel=\{dealRel\}/g) ?? []).length, 2, "both DealCard deal links must set rel={dealRel}");

  // rendered: a page that lists deals emits rel="nofollow" on the ?from= links
  const r = await get("/best-finds");
  if (r.status === 200 && /href="\/deals\/\d+\?from=/.test(r.body)) {
    const links = [...r.body.matchAll(/<a[^>]+href="\/deals\/\d+\?from=[^"]*"[^>]*>/g)].map((m) => m[0]);
    assert.ok(links.length > 0, "no ?from= deal links found on /best-finds");
    for (const l of links) assert.match(l, /rel="nofollow"/, `?from= deal link without rel=nofollow: ${l.slice(0, 120)}`);
  }
});

test("15. internal canonical entity navigation is NOT nofollowed; affiliate links keep sponsored", async () => {
  // a card page's breadcrumb + entity links (to /pokemon, /sets, /cards) are plain follow links
  const urls = byType.get("cards") ?? [];
  const r = await get(pathOf(urls[Math.floor(urls.length / 2)]));
  if (r.status === 200) {
    for (const m of r.body.matchAll(/<a[^>]+href="\/(pokemon|sets|cards)\/[a-z0-9-]+"[^>]*>/g)) {
      assert.ok(!/rel="[^"]*nofollow/.test(m[0]), `internal entity link is nofollowed: ${m[0].slice(0, 140)}`);
    }
  }
  // affiliate components keep the sponsored rel
  for (const f of ["components/AffiliateLink.js", "components/EbaySearchLink.js"]) {
    assert.match(readFileSync(join(REPO, f), "utf8"), /rel="sponsored/, `${f} lost rel="sponsored"`);
  }
});

// ---------------------------------------------------------------------------
// 16-18: guardrails
// ---------------------------------------------------------------------------

test("16. no accented \"Pokemon\" in robots / sitemap sources or output", () => {
  assert.ok(!readFileSync(join(REPO, "lib", "sitemap.js"), "utf8").includes(ACCENTED));
  assert.ok(!readFileSync(join(REPO, "app", "robots.js"), "utf8").includes(ACCENTED));
  assert.ok(!idxBody.includes(ACCENTED));
});

test("17. indexability thresholds are unchanged", () => {
  assert.equal(CARD_HUB_MIN_LISTINGS, 2);
  assert.equal(SET_MIN_LISTINGS, 3);
  assert.equal(SPECIES_MIN_LISTINGS, 5);
  assert.equal(SET_CATALOG_MIN_CARDS, 10);
  assert.equal(SPECIES_CATALOG_MIN_CARDS, 6);
});

test("18. no deal-matching / authenticity / freshness logic touched by Phase 5", () => {
  // the two files this phase edits carry no such logic
  for (const f of ["lib/sitemap.js", "components/DealCard.js"]) {
    const src = readFileSync(join(REPO, f), "utf8");
    for (const fn of ["listingMatchesCard", "GRADED_CARD_PATTERN", "isVisualScreeningCandidate"]) {
      assert.ok(!src.includes(fn), `${f} references ${fn}`);
    }
  }
  assert.match(readFileSync(join(REPO, "lib", "dealMatching.js"), "utf8"), /function listingMatchesCard\(/);
  assert.match(readFileSync(join(REPO, "lib", "dealQuality.js"), "utf8"), /isDisplayableDeal/);
});
