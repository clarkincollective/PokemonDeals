// CONTENT ORGANISATION: Guides / News / Market Data.
//
// The three sections have distinct jobs:
//   Guides      - help a reader understand, identify, choose, collect or buy.
//   News        - report something that happened, was announced or is developing.
//   Market Data - numerical rankings, market observations and dated research.
//
// What these tests protect is the INVARIANT that made the reorganisation
// worth doing, not the particular category names:
//
//   1. every registered guide is grouped exactly once, so none can be
//      dropped from or duplicated on its primary index;
//   2. every market-data page reachable as a route is linked from the
//      market-data index (the value-distribution page was previously
//      linked only from inside a conditional block, so it disappeared
//      whenever that query returned nothing);
//   3. the guide cross-links on /news are visibly distinguishable from
//      the dated stories, and carry no invented dates;
//   4. one destination has one navigation label.
//
// No URL, canonical, article body or publication date is asserted here
// because none changed - this was index grouping and wording only.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { GUIDES } from "../../lib/guides.js";
import { NEWS } from "../../lib/news.js";
import { NAV_PRIMARY, NAV_RAIL } from "../../lib/navLinks.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => readFileSync(join(ROOT, p), "utf8");

const guidesIndex = read("app/guides/page.js");
const groupBlock = guidesIndex.slice(
  guidesIndex.indexOf("const GUIDE_GROUPS = ["),
  guidesIndex.indexOf("const EDITORIAL_PICKS")
);

// ---- 1. every guide grouped exactly once ----------------------------

test("every registered guide is placed in exactly one group on the guides index", () => {
  const placed = [...groupBlock.matchAll(/"([a-z0-9-]+)",/g)]
    .map((m) => m[1])
    .filter((s) => GUIDES.some((g) => g.slug === s));
  const registry = GUIDES.map((g) => g.slug);

  const missing = registry.filter((s) => !placed.includes(s));
  assert.deepEqual(missing, [], "a registered guide is missing from the index - it would be unreachable from its primary home");

  const counts = {};
  for (const s of placed) counts[s] = (counts[s] ?? 0) + 1;
  const duplicated = Object.entries(counts).filter(([, n]) => n > 1);
  assert.deepEqual(duplicated, [], "a guide appears in two groups - one primary home only");

  assert.equal(placed.length, registry.length);
});

test("no group is empty, and the set of groups is small enough to scan", () => {
  const titles = [...groupBlock.matchAll(/title: "([^"]+)"/g)].map((m) => m[1]);
  assert.ok(titles.length >= 3 && titles.length <= 7, `expected a handful of groups, got ${titles.length}`);
  for (const t of titles) {
    const from = groupBlock.indexOf(`title: "${t}"`);
    const next = titles
      .map((o) => groupBlock.indexOf(`title: "${o}"`))
      .filter((i) => i > from)
      .sort((a, b) => a - b)[0] ?? groupBlock.length;
    const slugs = [...groupBlock.slice(from, next).matchAll(/"([a-z0-9-]+)",/g)]
      .map((m) => m[1])
      .filter((s) => GUIDES.some((g) => g.slug === s));
    assert.ok(slugs.length > 0, `group "${t}" is empty`);
  }
});

test("research is a cross-link on /guides, not a guides category", () => {
  // A dated study listed as a peer of the reader-task groups read as a
  // guide, and a fixed study in an evergreen index reads as current.
  assert.doesNotMatch(groupBlock, /market-data/, "no market-data page is grouped as a guide");
  assert.match(guidesIndex, /Market Data &amp; Research/, "the index cross-links to market data");
  assert.match(guidesIndex, /Buying &amp; Collecting Guides/, "the visible heading");
});

test("editorial selections are labelled as opinion", () => {
  assert.match(guidesIndex, /const EDITORIAL_PICKS = new Set\(/);
  assert.match(guidesIndex, /Editorial pick/);
  // both "best ..." selections are in that set
  for (const slug of ["best-pokemon-30th-celebration-cards", "best-pokemon-30th-celebration-pikachu-cards"]) {
    assert.ok(guidesIndex.includes(`"${slug}"`), slug);
  }
});

// ---- 2. market data: everything reachable is linked -----------------

test("every market-data route is linked from the market-data index", () => {
  const dir = join(ROOT, "app/market-data");
  const routes = readdirSync(dir).filter((n) => {
    try {
      // ".csv" is a data-export route, not an article - the study page it
      // belongs to links it, and it is deliberately not an index entry.
      if (n.endsWith(".csv")) return false;
      return statSync(join(dir, n)).isDirectory();
    } catch {
      return false;
    }
  });
  const index = read("app/market-data/page.js");
  for (const r of routes) {
    assert.match(index, new RegExp(`/market-data/${r}"`), `/market-data/${r} is not linked from its own index`);
  }
});

test("market data separates live rankings from dated studies, and labels tools as tools", () => {
  const index = read("app/market-data/page.js");
  assert.match(index, /title: "Market rankings & snapshots"/);
  assert.match(index, /title: "Research & historical studies"/);
  assert.match(index, /title: "Related tools & browsing"/);
  assert.match(index, /Market Data &amp; Research/, "the visible heading");
  // the dated study states its period where it is listed, so it cannot
  // read as today's market
  assert.match(index, /Study period 12 August - 11 September 2026/);
  // Best Finds is a Deals destination linked onward from here, not research
  const tools = index.slice(index.indexOf('title: "Related tools & browsing"'));
  assert.match(tools, /\/best-finds/);
  assert.match(tools, /Lives in Deals/);
});

// ---- 3. news: stories vs guide cross-links --------------------------

test("/news lists real stories by their own publication dates, newest first", () => {
  const news = read("app/news/page.js");
  assert.match(news, /Latest news/);
  // every registered news item has a real published date
  for (const n of NEWS) assert.match(n.published, /^\d{4}-\d{2}-\d{2}$/, `${n.slug} published date`);
  // the list renders each item's own date
  assert.match(news, /<time dateTime=\{n\.published\}/);
  assert.match(news, /formatNewsDate\(n\.published\)/);
});

test("the 30th Celebration cluster on /news reads as guides, not as extra stories", () => {
  const news = read("app/news/page.js");
  const section = news.slice(news.indexOf('id="c30-heading"'));
  assert.match(section, /Explore 30th Celebration guides/);
  assert.match(section, /not news/i, "the section says what it is");
  assert.match(section, />\s*Guide\s*</, "each cross-link carries a Guide tag");
  assert.match(section, /All buying &amp; collecting guides/, "a route to the full guides index");
  // no invented dates on the cross-links: the story list uses <time>, the
  // guide list must not
  assert.doesNotMatch(section, /<time/, "guide cross-links carry no publication dates");
  // and every cross-linked item really is a guide, by URL. The hrefs live
  // in the C30_COVERAGE constant above the section, so this reads that.
  const coverage = news.slice(news.indexOf("const C30_COVERAGE"), news.indexOf("id=\"c30-heading\""));
  const hrefs = [...coverage.matchAll(/href: "([^"]+)"/g)].map((m) => m[1]);
  assert.ok(hrefs.length >= 5, `expected the cluster, got ${hrefs.length}`);
  for (const h of hrefs) assert.match(h, /^\/guides\//, `${h} is cross-linked as a guide`);
  // and each one is a real registered guide, not an invented link
  for (const h of hrefs) {
    const slug = h.replace("/guides/", "");
    assert.ok(GUIDES.some((g) => g.slug === slug), `${slug} is a registered guide`);
  }
});

// ---- 4. one destination, one label ----------------------------------

test("/market-data has one navigation label everywhere", () => {
  const primary = NAV_PRIMARY.find((l) => l.href === "/market-data");
  const rail = NAV_RAIL.find((l) => l.href === "/market-data");
  assert.ok(primary && rail);
  assert.equal(rail.label, primary.label, "the rail and the submenu must not name the same page differently");
  assert.equal(rail.label, "Market Data");
  assert.ok(!NAV_RAIL.some((l) => l.label === "Research"), 'no rail entry still says "Research"');
});

test("News and Guides are both reachable from the desktop rail", () => {
  const labels = NAV_RAIL.map((l) => l.label);
  assert.ok(labels.includes("Guides"), "Guides in the rail");
  assert.ok(labels.includes("News"), "News in the rail");
  assert.ok(labels.indexOf("News") > labels.indexOf("Guides"), "News sits after Guides");
});
