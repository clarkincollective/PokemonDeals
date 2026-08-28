import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { get, sitemapUrls, sample, pathOf } from "./lib.mjs";

describe("robots.txt", () => {
  test("returns 200 and declares the sitemap", async () => {
    const res = await get("/robots.txt");
    assert.equal(res.status, 200, `robots.txt returned ${res.status}`);
    assert.match(res.body, /Sitemap:\s*https:\/\/[^\s]+\/sitemap\.xml/i, "no Sitemap: line");
    assert.match(res.body, /Disallow:\s*\/api\//i, "/api/ is not disallowed");
  });
});

describe("sitemap.xml", () => {
  test("is a well-formed index or urlset served as XML", async () => {
    const res = await get("/sitemap.xml");
    assert.equal(res.status, 200);
    assert.match(res.contentType, /xml/i, `unexpected content-type ${res.contentType}`);
    assert.match(res.body, /<(urlset|sitemapindex)[\s>]/, "not a <urlset> or <sitemapindex>");
  });

  test("child sitemaps (if a sitemap index) each resolve to a urlset", async () => {
    const { isIndex, childSitemaps } = await sitemapUrls();
    if (!isIndex) return;
    assert.ok(childSitemaps.length >= 2, `sitemap index only lists ${childSitemaps.length} child(ren)`);
    // sitemapUrls() already fetched each child and asserted it is a urlset;
    // getting here means they all did.
  });

  test("every <loc> is an absolute URL on one host", async () => {
    const { locs } = await sitemapUrls();
    assert.ok(locs.length > 0, "sitemap has no <loc> entries");

    const hosts = new Set();
    for (const loc of locs) {
      assert.match(loc, /^https:\/\//, `non-absolute <loc>: ${loc}`);
      hosts.add(new URL(loc).host);
    }
    assert.equal(hosts.size, 1, `<loc> entries span multiple hosts: ${[...hosts].join(", ")}`);
  });

  test("has no duplicate <loc> entries", async () => {
    const { locs } = await sitemapUrls();
    const seen = new Set();
    const dups = [];
    for (const loc of locs) {
      if (seen.has(loc)) dups.push(loc);
      seen.add(loc);
    }
    assert.deepEqual(dups, [], `duplicate sitemap entries: ${dups.slice(0, 5).join(", ")}`);
  });

  test("sampled URLs return 200, are not redirects, and are not noindexed", async () => {
    const { byType } = await sitemapUrls();
    const checks = [];
    for (const [type, urls] of byType) {
      for (const url of sample(urls, 2)) checks.push({ type, url });
    }
    assert.ok(checks.length > 0);

    for (const { type, url } of checks) {
      const res = await get(pathOf(url));
      assert.ok(!res.isRedirect, `${type} ${url} redirects (${res.status} -> ${res.location})`);
      assert.equal(res.status, 200, `${type} ${url} returned HTTP ${res.status}`);
      assert.ok(
        !/<meta[^>]+name=["']robots["'][^>]+content=["'][^"']*noindex/i.test(res.body),
        `${type} ${url} is in the sitemap but noindexed`
      );
    }
  });
});
