import { test } from "node:test";
import assert from "node:assert/strict";
import { get, parseHtml, normPath } from "./lib.mjs";

// Pages whose internal links we crawl one hop deep. Between them these
// touch the header nav, the site-wide footer, the set/pokemon filter
// lists, the homepage card-hub strip, and the trust pages - i.e. every
// place a broken internal link is likely to hide.
const SEED_PATHS = ["/", "/sets", "/pokemon", "/market-data", "/methodology", "/about"];

// Cap the crawl so a run stays fast even though /sets and /pokemon each
// link to a couple hundred pages.
const MAX_LINKS = 120;

test("no broken internal links from the main pages", async () => {
  const found = new Map(); // path -> where it was first seen

  for (const seed of SEED_PATHS) {
    const res = await get(seed);
    assert.equal(res.status, 200, `seed ${seed} returned HTTP ${res.status}`);
    for (const link of parseHtml(res.body).internalLinks) {
      const p = normPath(link);
      if (p.startsWith("/api/")) continue;
      if (!found.has(p)) found.set(p, seed);
    }
  }

  const targets = [...found.keys()].slice(0, MAX_LINKS);
  assert.ok(targets.length > 0, "no internal links discovered");

  const broken = [];
  const CONCURRENCY = 12;
  for (let i = 0; i < targets.length; i += CONCURRENCY) {
    const batch = targets.slice(i, i + CONCURRENCY);
    const results = await Promise.all(
      batch.map(async (p) => {
        const res = await get(p);
        return { p, status: res.status, isRedirect: res.isRedirect, location: res.location };
      })
    );
    for (const r of results) {
      if (r.status >= 400) broken.push(`${r.p} -> ${r.status} (linked from ${found.get(r.p)})`);
      else if (r.isRedirect) broken.push(`${r.p} -> ${r.status} redirect to ${r.location} (linked from ${found.get(r.p)})`);
    }
  }

  assert.deepEqual(broken, [], `broken/redirecting internal links:\n  ${broken.join("\n  ")}`);
});

// --- SEO Phase 8B: homepage internal-link equity into the entity hubs ---

test("8B: the homepage links the three catalogue directories", async () => {
  const { internalLinks } = parseHtml((await get("/")).body);
  for (const d of ["/cards", "/pokemon", "/sets", "/search"]) {
    assert.ok(internalLinks.some((l) => normPath(l) === d), `homepage does not link ${d}`);
  }
});

test("8B: the homepage carries a bounded, static, server-rendered row of Pokemon + Set hub links", async () => {
  const html = (await get("/")).body;
  const start = html.indexOf("Popular Pokemon");
  assert.ok(start >= 0, "no 'Popular Pokemon' browse module on the homepage");
  const end = html.indexOf("All sets", start);
  const mod = html.slice(start, end > start ? end + 120 : start + 8000); // the whole two-row module
  const pk = [...new Set([...mod.matchAll(/href="(\/pokemon\/[a-z0-9-]+)"/g)].map((m) => m[1]))];
  const st = [...new Set([...mod.matchAll(/href="(\/sets\/[a-z0-9-]+)"/g)].map((m) => m[1]))];
  // bounded (not a link farm), but a real curated set
  assert.ok(pk.length >= 8 && pk.length <= 16, `module /pokemon/[slug] links = ${pk.length} (want 8-16)`);
  assert.ok(st.length >= 8 && st.length <= 12, `module /sets/[slug] links = ${st.length} (want 8-12)`);
  // descriptive anchors, no keyword stuffing, no dynamic counts
  const flat = mod.replace(/<!--\s*-->/g, "");
  assert.match(flat, />Charizard cards</);
  assert.match(flat, />Base Set card list</);
  assert.ok(!/\bcheap\b|\bebay\b|prices values deals/i.test(mod), "keyword-stuffed anchor in the browse module");
  assert.ok(!/cards \(\d+\)|\d+ cards</.test(mod), "dynamic count in a browse-module anchor");
});

test("8B: every curated homepage hub link resolves to an indexable 200", async () => {
  const { internalLinks } = parseHtml((await get("/")).body);
  const hubs = [...new Set(internalLinks.map(normPath).filter((l) => /^\/(pokemon|sets)\/[a-z0-9-]+$/.test(l)))];
  for (const p of hubs.slice(0, 30)) {
    const res = await get(p);
    assert.equal(res.status, 200, `${p} -> ${res.status}`);
    assert.ok(!/noindex/.test(parseHtml(res.body).robots ?? ""), `${p} is linked from the homepage but noindex`);
  }
});
