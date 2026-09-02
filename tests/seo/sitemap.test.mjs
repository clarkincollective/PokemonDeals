import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { get, sitemapUrls, sample, pathOf, parseHtml } from "./lib.mjs";

// Every @type string anywhere in a page's JSON-LD (walks @graph + arrays).
function ldTypes(html) {
  const out = new Set();
  const walk = (node) => {
    if (Array.isArray(node)) return node.forEach(walk);
    if (!node || typeof node !== "object") return;
    const t = node["@type"];
    if (typeof t === "string") out.add(t);
    else if (Array.isArray(t)) t.forEach((x) => typeof x === "string" && out.add(x));
    for (const v of Object.values(node)) if (v && typeof v === "object") walk(v);
  };
  for (const b of parseHtml(html).jsonLd) if (b.ok) walk(b.data);
  return out;
}
const isNoindex = (html) => /noindex/.test(parseHtml(html).robots ?? "");

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

// Phase 8B closeout - the deals sitemap segment must be a strict subset of
// what /deals/[id] renders as an INDEXABLE page. lib/sitemap.js and the
// page evaluate the same isDisplayableDeal gate; this cross-checks that
// end to end against production data, deeper than the 2-per-type sample
// above (the regression it guards - a missing visual-authenticity column
// in the sitemap query - only affected ~24 of ~3900 deal URLs, which a
// 2-URL sample would almost never hit).
describe("deals sitemap <-> /deals/[id] robots parity", () => {
  test("a deep sample of deal-sitemap URLs are all 200 + indexable, and each carries Product+Offer", async () => {
    const { byType } = await sitemapUrls();
    // The "deals" bucket also holds /deals and the /deals/<slug> category
    // pages - the individually-indexable listing URLs are /deals/<id>.
    const dealUrls = (byType.get("deals") ?? []).filter((u) => /\/deals\/\d+$/.test(pathOf(u)));
    if (dealUrls.length === 0) return; // no live individually-indexable deals right now
    const picks = sample(dealUrls, 40);
    const bad = [];
    let withSchema = 0;
    for (const url of picks) {
      const res = await get(pathOf(url));
      if (res.isRedirect || res.status !== 200) {
        bad.push(`${url} -> HTTP ${res.status}${res.isRedirect ? ` (redirect ${res.location})` : ""}`);
        continue;
      }
      if (isNoindex(res.body)) {
        bad.push(`${url} -> in deals sitemap but page is noindex`);
        continue;
      }
      const types = ldTypes(res.body);
      // An indexable deal page is a genuine single-item page: Product + Offer.
      if (types.has("Product") && types.has("Offer")) withSchema++;
      else bad.push(`${url} -> indexable deal page missing Product/Offer schema`);
    }
    assert.deepEqual(bad, [], `deals sitemap / page parity failures:\n  ${bad.join("\n  ")}`);
    assert.ok(withSchema > 0, "no sampled deal page carried Product+Offer schema");
  });

  test("control: deal 24195 is 200 + noindex,follow + no Product/Offer + absent from the deals sitemap", async () => {
    const res = await get("/deals/24195");
    // 200 (the row still exists) or 404 (row later hard-deleted) - never a
    // live indexable page. Both render noindex.
    assert.ok(res.status === 200 || res.status === 404, `/deals/24195 -> HTTP ${res.status}`);
    assert.ok(isNoindex(res.body), "/deals/24195 is not noindex");
    const types = ldTypes(res.body);
    assert.ok(!types.has("Product"), "/deals/24195 (noindex) still emits Product schema");
    assert.ok(!types.has("Offer"), "/deals/24195 (noindex) still emits Offer schema");

    const { locs } = await sitemapUrls();
    const present = locs.filter((l) => pathOf(l) === "/deals/24195");
    assert.deepEqual(present, [], "noindex deal 24195 is listed in the sitemap");
  });
});
