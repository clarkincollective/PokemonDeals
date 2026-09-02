import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { get, parseHtml, pathOf, sitemapUrls } from "./lib.mjs";

// The Privacy Policy exists to satisfy Google's OAuth branding/privacy
// requirement for the private read-only Search Console integration:
// a real, public, homepage-linked page that discloses the Google API
// data use and claims no more than the webmasters.readonly scope.

describe("/privacy", () => {
  test("returns 200, is indexable, self-canonical, single H1", async () => {
    const res = await get("/privacy");
    assert.equal(res.status, 200, `/privacy -> HTTP ${res.status}`);
    const parsed = parseHtml(res.body);
    assert.ok(!/noindex/.test(parsed.robots ?? ""), "/privacy is noindex");
    assert.equal(pathOf(parsed.canonicals[0]), "/privacy", `canonical is ${parsed.canonicals[0]}`);
    assert.equal(parsed.h1s.length, 1);
    assert.equal(parsed.h1s[0], "Privacy Policy");
    assert.match(parsed.title, /^Privacy Policy \| Pokemon Deal Finder$/);
  });

  test("is in the pages sitemap exactly once; /privacy-policy does NOT exist", async () => {
    const { locs } = await sitemapUrls();
    const mine = locs.map(pathOf).filter((l) => l === "/privacy");
    assert.equal(mine.length, 1, `/privacy sitemap occurrences: ${mine.length}`);
    const dupe = await get("/privacy-policy");
    assert.ok(dupe.status === 404, `/privacy-policy should not exist (got ${dupe.status})`);
  });

  test("the persistent footer links /privacy, and it is reachable from the homepage", async () => {
    for (const path of ["/privacy", "/"]) {
      const { internalLinks } = parseHtml((await get(path)).body);
      assert.ok(
        internalLinks.some((l) => pathOf(l) === "/privacy"),
        `${path} has no link to /privacy`
      );
    }
  });

  test("discloses the Google API data use with the read-only Search Console scope", () => {
    // fetched once, reused
    return get("/privacy").then((res) => {
      const body = res.body;
      const text = body.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
      assert.match(text, /Google API data/i, "no 'Google API data' section");
      assert.match(body, /https:\/\/www\.googleapis\.com\/auth\/webmasters\.readonly/);
      assert.match(text, /Search Console/);
      assert.match(text, /read-only/i);
      // Limited Use alignment
      assert.match(text, /Google API Services User Data Policy/i);
      assert.match(text, /Limited Use/i);
      assert.match(text, /not (sold|transferred).*(advertis|third part)/i);
    });
  });

  test("claims no broader Google permission than webmasters.readonly", () => {
    return get("/privacy").then((res) => {
      const body = res.body;
      // the ONLY googleapis.com/auth scope named is the read-only one
      const scopes = [...body.matchAll(/https:\/\/www\.googleapis\.com\/auth\/[a-zA-Z0-9._-]+/g)].map((m) => m[0]);
      assert.deepEqual(
        [...new Set(scopes)],
        ["https://www.googleapis.com/auth/webmasters.readonly"],
        `unexpected Google scope(s) mentioned: ${scopes.join(", ")}`
      );
      const text = body.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
      // every mention of the "webmasters" scope word is the read-only one
      assert.ok(
        [...text.matchAll(/webmasters[.\w-]*/gi)].every((m) => /^webmasters\.readonly$/i.test(m[0])),
        "a non-readonly 'webmasters' scope is named"
      );
      // and the page positively states the integration cannot write
      assert.match(
        text,
        /read-only: it cannot change anything in Search Console|cannot .* submit URLs, or modify sitemaps/i
      );
    });
  });

  test("exposes no secret / token / client-secret value", () => {
    return get("/privacy").then((res) => {
      const body = res.body;
      assert.ok(!/client_secret|refresh_token|access_token|Bearer\s+[A-Za-z0-9._-]{10}/i.test(body));
      assert.ok(!/\.apps\.googleusercontent\.com/.test(body), "an OAuth client id string is present");
      assert.ok(!/AIza[0-9A-Za-z_-]{10}/.test(body), "a Google API key is present");
    });
  });

  test("conservative metadata: no FAQPage / Product schema, no marketing copy", () => {
    return get("/privacy").then((res) => {
      const parsed = parseHtml(res.body);
      const types = new Set();
      for (const b of parsed.jsonLd) if (b.ok) {
        const nodes = Array.isArray(b.data) ? b.data : [b.data];
        for (const n of nodes) if (n && n["@type"]) types.add(n["@type"]);
      }
      assert.ok(!types.has("FAQPage"), "FAQPage schema present");
      assert.ok(!types.has("Product"), "Product schema present");
      assert.ok(types.has("BreadcrumbList"), "no BreadcrumbList");
      assert.ok(!/Pokémon/.test(res.body), "accented Pokémon in the privacy page");
    });
  });
});
