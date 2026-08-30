import { test, describe, before } from "node:test";
import assert from "node:assert/strict";
import { BASE, get, parseHtml, pathOf, normPath, titleCore, sitemapUrls, sample, SAMPLE_PER_TYPE } from "./lib.mjs";

// Static routes that must always exist, one of every hand-built page type.
const STATIC_PATHS = [
  "/",
  "/best-finds",
  "/deals",
  "/deals/under-50",
  "/deals/graded",
  "/deals/auctions",
  "/deals/vintage",
  "/deals/modern",
  "/sets",
  "/pokemon",
  "/japanese-cards",
  "/sealed-deals",
  "/market-data",
  "/market-data/most-listed-cards",
  "/market-data/most-expensive-cards",
  "/search",
  "/about",
  "/how-it-works",
  "/methodology",
  "/affiliate-disclosure",
  "/contact",
  "/guides",
  "/guides/card-condition-grading",
  "/guides/raw-vs-graded-pokemon-cards",
  "/guides/vintage-vs-modern-pokemon-cards",
  "/guides/how-pokemon-card-prices-work",
];

// Dynamic types to sample from the sitemap.
const DYNAMIC_TYPES = ["sets", "cards", "pokemon", "deals", "sealed-deals"];

let pages = [];

before(async () => {
  const targets = [...STATIC_PATHS];
  try {
    const { byType } = await sitemapUrls();
    for (const type of DYNAMIC_TYPES) {
      const urls = byType.get(type) || [];
      for (const u of sample(urls, SAMPLE_PER_TYPE)) targets.push(pathOf(u));
    }
  } catch (err) {
    // If the sitemap can't be read the sitemap.test.mjs suite will fail
    // loudly; here we just fall back to the static set.
    console.error(`  (could not sample dynamic pages from sitemap: ${err.message})`);
  }

  pages = await Promise.all(
    [...new Set(targets)].map(async (path) => {
      const res = await get(path);
      const parsed = res.status === 200 ? parseHtml(res.body) : null;
      return { path, res, parsed };
    })
  );
});

describe("per-page SEO invariants", () => {
  for (const path of STATIC_PATHS) {
    test(path, () => {
      const page = pages.find((p) => p.path === normPath(path));
      assert.ok(page, `no result collected for ${path}`);
      assert.equal(page.res.status, 200, `${path} returned HTTP ${page.res.status}`);
      assertPage(page);
    });
  }

  test("sampled dynamic pages", () => {
    const staticSet = new Set(STATIC_PATHS.map(normPath));
    const dynamic = pages.filter((p) => !staticSet.has(p.path));
    assert.ok(dynamic.length > 0, "no dynamic pages were sampled from the sitemap");
    const failures = [];
    for (const page of dynamic) {
      try {
        assert.equal(page.res.status, 200, `${page.path} returned HTTP ${page.res.status}`);
        assertPage(page);
      } catch (err) {
        failures.push(err.message);
      }
    }
    assert.deepEqual(failures, [], `\n  ${failures.join("\n  ")}`);
  });
});

describe("cross-page uniqueness", () => {
  test("every indexable page has a unique <title>", () => {
    const seen = new Map();
    for (const p of pages) {
      if (!p.parsed) continue;
      const t = p.parsed.title;
      if (seen.has(t)) {
        assert.fail(`duplicate <title> ${JSON.stringify(t)} on ${seen.get(t)} and ${p.path}`);
      }
      seen.set(t, p.path);
    }
  });

  test("all canonicals use one consistent host", () => {
    const hosts = new Set();
    for (const p of pages) {
      if (p.parsed?.canonicals[0]) hosts.add(new URL(p.parsed.canonicals[0]).host);
    }
    assert.equal(hosts.size, 1, `canonicals span multiple hosts: ${[...hosts].join(", ")}`);
  });

  test("every indexable page has a unique, self-referencing canonical", () => {
    const seen = new Map();
    for (const p of pages) {
      if (!p.parsed) continue;
      const canonical = p.parsed.canonicals[0];
      const canonicalPath = pathOf(canonical);
      // self-referencing: canonical path === the page's own path
      assert.equal(
        canonicalPath,
        p.path,
        `${p.path} canonical points at ${canonicalPath} (${canonical})`
      );
      if (seen.has(canonicalPath)) {
        assert.fail(`duplicate canonical ${canonicalPath} on ${seen.get(canonicalPath)} and ${p.path}`);
      }
      seen.set(canonicalPath, p.path);
    }
  });
});

describe("priority pages are linked, not orphaned", () => {
  test("/pokemon links to individual species pages", async () => {
    const { parsed } = await fetchParsed("/pokemon");
    const n = parsed.internalLinks.filter((l) => l.startsWith("/pokemon/")).length;
    assert.ok(n >= 10, `/pokemon only links to ${n} species pages`);
  });
  test("/sets links to individual set pages", async () => {
    const { parsed } = await fetchParsed("/sets");
    const n = parsed.internalLinks.filter((l) => l.startsWith("/sets/")).length;
    assert.ok(n >= 10, `/sets only links to ${n} set pages`);
  });
  test("homepage links into at least one card hub", async () => {
    const { parsed } = await fetchParsed("/");
    const n = parsed.internalLinks.filter((l) => l.startsWith("/cards/")).length;
    assert.ok(n >= 1, "homepage has no /cards/ links");
  });
});

async function fetchParsed(path) {
  const res = await get(path);
  assert.equal(res.status, 200, `${path} returned HTTP ${res.status}`);
  return { res, parsed: parseHtml(res.body) };
}

function assertPage({ path, parsed }) {
  assert.ok(parsed, `${path}: no HTML parsed`);

  // --- canonical: exactly one, absolute https ---
  assert.equal(parsed.canonicals.length, 1, `${path}: expected 1 canonical, found ${parsed.canonicals.length}`);
  const canonical = parsed.canonicals[0];
  assert.match(canonical, /^https:\/\/[^/\s]+(\/|$)/, `${path}: canonical is not an absolute https URL (${canonical})`);

  // --- title: one, non-empty, sensible length ---
  // Hard cap 100 catches a genuinely runaway/duplicated title; the
  // distinctive part (before the " | site name" template) should stay
  // near Google's ~60-char display limit.
  assert.ok(parsed.title && parsed.title.length > 0, `${path}: empty <title>`);
  assert.ok(parsed.title.length <= 100, `${path}: <title> is ${parsed.title.length} chars (>100): ${parsed.title}`);
  const core = titleCore(parsed.title);
  assert.ok(core.length <= 65, `${path}: distinctive title part is ${core.length} chars (>65): ${core}`);

  // --- meta description: present, non-trivial ---
  assert.ok(parsed.metaDescription && parsed.metaDescription.length >= 20, `${path}: missing/short meta description`);
  assert.ok(parsed.metaDescription.length <= 320, `${path}: meta description is ${parsed.metaDescription.length} chars`);

  // --- exactly one non-empty H1 ---
  assert.equal(parsed.h1s.length, 1, `${path}: expected 1 <h1>, found ${parsed.h1s.length}`);
  assert.ok(parsed.h1s[0].length > 0, `${path}: empty <h1>`);

  // --- not accidentally noindexed ---
  assert.ok(!parsed.robots || !parsed.robots.includes("noindex"), `${path}: has robots "${parsed.robots}"`);

  // --- structured data present, valid, and typed ---
  assert.ok(parsed.jsonLd.length >= 1, `${path}: no JSON-LD block on the page`);
  const types = new Set();
  for (const block of parsed.jsonLd) {
    assert.ok(block.ok, `${path}: invalid JSON-LD (${block.ok ? "" : block.error})`);
    const nodes = Array.isArray(block.data) ? block.data : [block.data];
    for (const node of nodes) {
      assert.ok(node["@context"], `${path}: JSON-LD node missing @context`);
      assert.ok(node["@type"], `${path}: JSON-LD node missing @type`);
      types.add(node["@type"]);
    }
  }
  // Every page below the home level sits somewhere in a hierarchy and
  // must say so - a flat or missing breadcrumb was a real gap the audit
  // found (market-data / best-finds / japanese-cards / the index pages
  // had no structured data at all).
  if (path !== "/") {
    assert.ok(types.has("BreadcrumbList"), `${path}: no BreadcrumbList JSON-LD (types: ${[...types].join(", ") || "none"})`);
  }
}
