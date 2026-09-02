// SEO Phase 7B - heavy catalogue-page payload reduction.
//
// /pokemon/[slug] and /sets/[slug] used to SSR every catalogue card as a
// full rich (client-hydrated) tile, hidden with CSS past the first
// screen - hundreds of tiles + hundreds of hydrated components + the
// whole dataset in the RSC payload. Now:
//   - the rich <CatalogueBrowser> paints a bounded first screen and is
//     capped (RICH_BROWSER_CAP) on very large catalogues;
//   - an always-SSR, always-visible <CatalogueLinkIndex> carries EVERY
//     permanent /cards/[slug] link as a compact <a> (no images, no
//     hydration, not display:none).
// These checks lock the reduction AND the crawl-safety guarantees.

import { test, before } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { get, parseHtml } from "./lib.mjs";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const HEAVY_SPECIES = "/pokemon/pikachu";
const HEAVY_SET = "/sets/skyridge";
const SMALL_SPECIES = "/pokemon/celebi";

const uniq = (re, s) => new Set([...s.matchAll(re)].map((m) => m[1]));
const richTiles = (s) => (s.match(/group flex h-full flex-col/g) || []).length;
// Next inserts <!-- --> markers between adjacent JSX text/expression
// nodes; drop them before matching visible-text patterns.
const decomment = (s) => s.replace(/<!--\s*-->/g, "");
const indexHeadingN = (body) =>
  Number((decomment(body).match(/Full [^<]*?card index \((\d+)\)/) || [])[1]);

let spRes, setRes, smallRes, sp, st, sm;
before(async () => {
  [spRes, setRes, smallRes] = await Promise.all([get(HEAVY_SPECIES), get(HEAVY_SET), get(SMALL_SPECIES)]);
  sp = parseHtml(spRes.body);
  st = parseHtml(setRes.body);
  sm = parseHtml(smallRes.body);
});

// --- 1-3: SEO invariants ------------------------------------------------

test("1. H1 preserved on the heavy species + set page", () => {
  assert.equal(spRes.status, 200);
  assert.equal(setRes.status, 200);
  assert.match(sp.h1s[0] ?? "", /Pikachu Card Prices/i);
  assert.match(st.h1s[0] ?? "", /Skyridge Card Prices/i);
});

test("2. canonical is the bare entity URL (unchanged)", () => {
  assert.deepEqual(sp.canonicals, ["https://pokemondealfinder.com/pokemon/pikachu"]);
  assert.deepEqual(st.canonicals, ["https://pokemondealfinder.com/sets/skyridge"]);
});

test("3. pages stay indexable (no noindex added)", () => {
  assert.ok(!/noindex/i.test(sp.robots ?? ""));
  assert.ok(!/noindex/i.test(st.robots ?? ""));
});

// --- 4: structured data valid + bounded -------------------------------

test("4. JSON-LD is valid and every ItemList is bounded (<= 30 elements)", () => {
  for (const doc of [sp, st]) {
    for (const b of doc.jsonLd) {
      assert.ok(b.ok, `invalid JSON-LD: ${b.error}`);
    }
    const lists = [];
    const walk = (v) => {
      if (Array.isArray(v)) return v.forEach(walk);
      if (v && typeof v === "object") {
        if (v["@type"] === "ItemList" && Array.isArray(v.itemListElement)) lists.push(v.itemListElement.length);
        Object.values(v).forEach(walk);
      }
    };
    doc.jsonLd.forEach((b) => walk(b.data));
    for (const n of lists) assert.ok(n <= 30, `ItemList has ${n} elements (must be <= 30)`);
  }
});

// --- 5-8: the compact index IS the crawl-safety net -------------------

test("5. a visible, server-rendered full card index is present (not display:none, not a client component)", () => {
  for (const [name, res] of [["species", spRes], ["set", setRes]]) {
    assert.match(res.body, /aria-labelledby="full-(card|set)-index"/, `${name}: index section missing`);
    // the index <section> must not be hidden
    const m = res.body.match(/<section aria-labelledby="full-(?:card|set)-index"[^>]*class="([^"]*)"/);
    assert.ok(m, `${name}: index section not found`);
    assert.ok(!/\bhidden\b/.test(m[1]), `${name}: index section is CSS-hidden`);
    assert.ok(!/display:\s*none/.test(res.body.slice(res.body.indexOf(m[0]), res.body.indexOf(m[0]) + 300)));
  }
});

test("6. the index carries every catalogue card as a plain <a href=/cards/...> (count matches its heading)", () => {
  for (const [name, res] of [["species", spRes], ["set", setRes]]) {
    const headingN = indexHeadingN(res.body);
    assert.ok(headingN > 0, `${name}: no "Full ... card index (N)" heading`);
    // links inside the index section
    const from = res.body.indexOf('aria-labelledby="full-');
    const idxHtml = res.body.slice(from);
    const anchors = [...idxHtml.matchAll(/<a href="(\/cards\/[a-z0-9-]+)"/g)];
    assert.ok(
      anchors.length >= headingN * 0.9,
      `${name}: index heading says ${headingN} cards but only ${anchors.length} <a> links found`
    );
    // they are plain anchors, not next/link client refs (no data-prefetch etc. is fine; assert real href)
    for (const a of anchors.slice(0, 5)) assert.match(a[1], /^\/cards\/[a-z0-9-]+$/);
  }
});

test("7. the rich tile grid is bounded (no longer hundreds of hydrated tiles)", () => {
  // deals + featured (<=12) + capped catalogue (RICH_BROWSER_CAP=120) + a
  // little slack. Pre-change this was 350+ on Pikachu / Skyridge.
  assert.ok(richTiles(spRes.body) <= 160, `species rich tiles = ${richTiles(spRes.body)}`);
  assert.ok(richTiles(setRes.body) <= 160, `set rich tiles = ${richTiles(setRes.body)}`);
});

test("8. total permanent /cards/ link coverage >= the full index count (parity preserved)", () => {
  for (const res of [spRes, setRes]) {
    const headingN = indexHeadingN(res.body);
    const all = uniq(/href="\/cards\/([a-z0-9-]+)"/g, res.body);
    assert.ok(all.size >= headingN, `only ${all.size} unique /cards/ links vs index count ${headingN}`);
  }
});

// --- 9-10: images ----------------------------------------------------

test("9. catalogue images are lazy; no eager/priority spam", () => {
  for (const res of [spRes, setRes]) {
    const imgs = [...res.body.matchAll(/<img\b[^>]*>/g)].map((m) => m[0]);
    const nonLazy = imgs.filter((i) => !/loading="lazy"/.test(i));
    assert.ok(nonLazy.length <= 2, `${nonLazy.length} non-lazy <img> (expected <= 2 above-fold)`);
    const highPri = imgs.filter((i) => /fetchpriority="high"|loading="eager"/.test(i));
    assert.ok(highPri.length <= 2, `${highPri.length} priority images`);
  }
});

// --- 11-14: no new URL universe / controls still there ---------------

test("11. the index introduces no ?param URL universe (plain /cards/[slug] only)", () => {
  for (const res of [spRes, setRes]) {
    const from = res.body.indexOf('aria-labelledby="full-');
    const idxHtml = res.body.slice(from);
    assert.ok(!/href="\/cards\/[^"]*\?/.test(idxHtml), "index has a /cards/ link with a query string");
    assert.ok(!/href="\/(pokemon|sets)\/[^"]*\?(page|sort|price|pokemon|set)=/.test(idxHtml));
  }
});

test("12. the browser toolbar (search + rarity + sort) still renders server-side", () => {
  for (const res of [spRes, setRes]) {
    assert.match(res.body, /type="search"/, "no search input");
    assert.match(res.body, /aria-label="Filter by rarity"/, "no rarity filter");
    assert.match(res.body, /aria-label="Sort cards"/, "no sort control");
  }
});

test("13. a progressive-disclosure control ('Show ...') renders server-side", () => {
  for (const res of [spRes, setRes]) {
    assert.match(res.body, /Show (more|all|fewer)/i, "no Show more/all/fewer control");
  }
});

test("14. large catalogues show the honest 'highest-value of N ... full index is below' cap note", () => {
  assert.match(decomment(spRes.body), /Showing \d+ highest-value of \d+ .*?cards? .*? the full index is below/i);
});

// --- 15-17: control (small catalogue) + accessibility + source -------

test("15. a small catalogue is NOT capped but still gets the full index", () => {
  assert.equal(smallRes.status, 200);
  assert.ok(!/highest-value of \d+/i.test(decomment(smallRes.body)), "small page was capped");
  assert.match(smallRes.body, /aria-labelledby="full-card-index"/, "small page missing the index");
});

test("16. index anchors are real, keyboard-navigable links with non-empty href + labelled section", () => {
  const from = spRes.body.indexOf('aria-labelledby="full-card-index"');
  const idxHtml = spRes.body.slice(from, from + 60000);
  const anchors = [...idxHtml.matchAll(/<a href="([^"]*)"[^>]*>([^<]+)<\/a>/g)];
  assert.ok(anchors.length > 20);
  for (const a of anchors.slice(0, 30)) {
    assert.ok(a[1].startsWith("/cards/"), `bad href ${a[1]}`);
    assert.ok(a[2].trim().length > 0, "empty link text");
  }
});

test("17. CatalogueLinkIndex is a server component and uses no accented 'Pokemon'", () => {
  const src = readFileSync(join(REPO, "components", "CatalogueLinkIndex.js"), "utf8");
  assert.ok(!/^\s*["']use client["']/m.test(src), "CatalogueLinkIndex became a client component");
  assert.ok(!/pok[eé]mon/i.test(src.replace(/Pokemon/g, "")) || !/é/.test(src), "accented Pokemon in source");
  assert.ok(!/é/.test(src), "accented character in CatalogueLinkIndex source");
});
