// SEO Phase 7B - heavy catalogue-page payload reduction.
//
// /pokemon/[slug] and /sets/[slug] used to SSR every catalogue card as a
// full rich (client-hydrated) tile, hidden with CSS past the first
// screen - hundreds of tiles + hundreds of hydrated components + the
// whole dataset in the RSC payload. Now:
//   - the rich <CatalogueBrowser> paints a bounded first screen and is
//     capped (RICH_BROWSER_CAP) on very large catalogues;
//   - an always-SSR <CatalogueLinkIndex> carries EVERY permanent
//     /cards/[slug] link as a compact <a> (no images, no hydration).
// These checks lock the reduction AND the crawl-safety guarantees.
//
// Mobile UX refinement (2026-09-14) - deliberate contract change: on pages
// whose list is this plain index, the visual gallery is now the default
// view, the index sits behind the "Card list"/"List" toggle, and its links
// are grouped into collapsed <details> sections. Every link is still in
// the initial server HTML as a plain <a>; it is no longer visible on first
// paint. Test 5 therefore asserts presence in the HTML, not visibility.

import { test, before } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { get, parseHtml } from "./lib.mjs";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

// SEO-2.3 splits the species list view by cohort (docs/seo-species-threshold-
// experiment.md, "Experiment 2"):
//   TREATED   -> <SpeciesChecklist>: era/set groups, heading
//                "<Species> checklist by era and set (N cards)", set headings
//                are real /sets/<slug> links, no <details> wrapper.
//   otherwise -> <CatalogueLinkIndex>: heading "Full <Species> card index (N)",
//                one outer <details> with nested per-set <details>, /cards/
//                links only.
// Both live in <section aria-labelledby="full-card-index"> and both carry
// EVERY eligible card as a plain server-rendered <a>. Set pages are never
// treated, so /sets/[slug] always renders the link index.
const HEAVY_SPECIES = "/pokemon/pikachu"; // treated, 359 cards (over the cap)
const CONTROL_SPECIES = "/pokemon/eevee"; // pre-registered control, 123 cards (over the cap)
const HEAVY_SET = "/sets/skyridge";
const SMALL_SPECIES = "/pokemon/celebi"; // untreated, under the cap

const uniq = (re, s) => new Set([...s.matchAll(re)].map((m) => m[1]));
const richTiles = (s) => (s.match(/group flex h-full flex-col/g) || []).length;
// Next inserts <!-- --> markers between adjacent JSX text/expression
// nodes; drop them before matching visible-text patterns.
const decomment = (s) => s.replace(/<!--\s*-->/g, "");
// The index heading count, whichever cohort's index is rendered.
const indexHeadingN = (body) => {
  const b = decomment(body);
  const plain = b.match(/Full [^<]*?card index \((\d+)\)/);
  if (plain) return Number(plain[1]);
  const checklist = b.match(/checklist by era and set \((\d+) cards?\)/);
  return checklist ? Number(checklist[1]) : NaN;
};
// The anchors inside the index section only (not the rest of the page).
const indexSection = (body) => {
  // species pages label the section "full-card-index", set pages "full-set-index"
  let from = body.indexOf('aria-labelledby="full-card-index"');
  if (from === -1) from = body.indexOf('aria-labelledby="full-set-index"');
  if (from === -1) return "";
  const end = body.indexOf("</section>", from);
  return body.slice(from, end === -1 ? undefined : end);
};
const indexAnchors = (body) =>
  [...indexSection(body).matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g)].map((m) => ({
    href: (m[1].match(/href="([^"]*)"/) || [])[1] ?? null,
    text: m[2].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(),
  }));

let spRes, ctrlRes, setRes, smallRes, sp, st, sm;
before(async () => {
  [spRes, ctrlRes, setRes, smallRes] = await Promise.all([get(HEAVY_SPECIES), get(CONTROL_SPECIES), get(HEAVY_SET), get(SMALL_SPECIES)]);
  sp = parseHtml(spRes.body);
  st = parseHtml(setRes.body);
  sm = parseHtml(smallRes.body);
});

// --- 1-3: SEO invariants ------------------------------------------------

test("1. H1 preserved on the heavy species + set page", () => {
  assert.equal(spRes.status, 200);
  assert.equal(setRes.status, 200);
  assert.match(sp.h1s[0] ?? "", /^Pikachu Cards – Full List, Prices & Values$/i);
  assert.match(st.h1s[0] ?? "", /^Skyridge Card List, Prices & Values$/i);
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

test("5. a server-rendered full card index is present in the initial HTML (both cohorts, not a client component)", () => {
  // every catalogue page, treated or not, ships the whole link set server-side
  for (const [name, res] of [["treated species", spRes], ["control species", ctrlRes], ["untreated species", smallRes], ["set", setRes]]) {
    assert.match(res.body, /aria-labelledby="full-(card|set)-index"/, `${name}: index section missing`);
    const m = res.body.match(/<section aria-labelledby="full-(?:card|set)-index"[^>]*>/);
    assert.ok(m, `${name}: index section not found`);
    const idxHtml = res.body.slice(res.body.indexOf(m[0]));
    assert.match(idxHtml, /<a href="\/cards\/[a-z0-9-]+"/, `${name}: no card links in the server HTML`);
  }
  // the UNTREATED index keeps its collapsed <details> grouping
  for (const [name, res] of [["control species", ctrlRes], ["untreated species", smallRes], ["set", setRes]]) {
    assert.match(indexSection(res.body), /<details/, `${name}: link-index <details> grouping missing`);
  }
  // the TREATED page renders the era checklist instead: grouped by era and
  // set, with the set headings as real links, and no <details> wrapper
  const treated = indexSection(spRes.body);
  assert.match(decomment(spRes.body), /checklist by era and set \(\d+ cards?\)/, "treated species: era checklist heading missing");
  assert.match(treated, /<a href="\/sets\/[a-z0-9-]+"/, "treated species: era checklist has no set headings");
  assert.ok(!/<details/.test(treated), "treated species: the era checklist should not be collapsed into <details>");
});

test("6. the index carries every catalogue card as a plain <a href=/cards/...> (count matches its heading, both cohorts)", () => {
  for (const [name, res] of [["treated species", spRes], ["control species", ctrlRes], ["untreated species", smallRes], ["set", setRes]]) {
    const headingN = indexHeadingN(res.body);
    assert.ok(headingN > 0, `${name}: no card-index heading with a count`);
    const from = res.body.indexOf('aria-labelledby="full-');
    const idxHtml = res.body.slice(from);
    const anchors = [...idxHtml.matchAll(/<a href="(\/cards\/[a-z0-9-]+)"/g)];
    assert.ok(
      anchors.length >= headingN * 0.9,
      `${name}: index heading says ${headingN} cards but only ${anchors.length} <a> links found`
    );
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
  for (const res of [spRes, ctrlRes, smallRes, setRes]) {
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

test("14. large catalogues show the honest 'N highest-value of M cards' gallery cap note", () => {
  // wording changed with the gallery-first list toggle; the honesty
  // requirement is unchanged - the capped gallery must say what it shows
  // and out of how many. Applies to every capped catalogue, not one cohort.
  for (const [name, res] of [["treated species", spRes], ["control species", ctrlRes], ["set", setRes]]) {
    const m = decomment(res.body).match(/Gallery shows the (\d+) highest-value of (\d+) cards/i);
    assert.ok(m, `${name}: no gallery cap note`);
    assert.ok(Number(m[1]) < Number(m[2]), `${name}: cap note claims ${m[1]} of ${m[2]}`);
  }
});

// --- 15-17: control (small catalogue) + accessibility + source -------

test("15. a small catalogue is NOT capped but still gets the full index", () => {
  assert.equal(smallRes.status, 200);
  assert.ok(!/highest-value of \d+/i.test(decomment(smallRes.body)), "small page was capped");
  assert.match(smallRes.body, /aria-labelledby="full-card-index"/, "small page missing the index");
});

test("16. index anchors are real, keyboard-navigable links with non-empty href + labelled section", () => {
  // The treated era checklist links its SET headings as well as its cards;
  // both are real permanent internal destinations. Nothing else may appear.
  for (const [name, res, allowSets] of [
    ["treated species", spRes, true],
    ["control species", ctrlRes, false],
    ["untreated species", smallRes, false],
    ["set", setRes, false],
  ]) {
    const anchors = indexAnchors(res.body);
    assert.ok(anchors.length > 20, `${name}: only ${anchors.length} index anchors`);
    for (const a of anchors) {
      assert.ok(a.href, `${name}: anchor with no href`);
      const ok = /^\/cards\/[a-z0-9-]+$/.test(a.href) || (allowSets && /^\/sets\/[a-z0-9-]+$/.test(a.href));
      assert.ok(ok, `${name}: bad href ${a.href}`);
      assert.ok(a.text.length > 0, `${name}: empty link text on ${a.href}`);
    }
    if (allowSets) assert.ok(anchors.some((a) => a.href.startsWith("/sets/")), `${name}: expected set headings`);
    else assert.ok(!anchors.some((a) => a.href.startsWith("/sets/")), `${name}: unexpected set link in the plain index`);
  }
});

test("17. CatalogueLinkIndex is a server component and uses no accented 'Pokemon'", () => {
  const src = readFileSync(join(REPO, "components", "CatalogueLinkIndex.js"), "utf8");
  assert.ok(!/^\s*["']use client["']/m.test(src), "CatalogueLinkIndex became a client component");
  assert.ok(!/pok[eé]mon/i.test(src.replace(/Pokemon/g, "")) || !/é/.test(src), "accented Pokemon in source");
  assert.ok(!/é/.test(src), "accented character in CatalogueLinkIndex source");
});
