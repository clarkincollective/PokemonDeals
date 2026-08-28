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
