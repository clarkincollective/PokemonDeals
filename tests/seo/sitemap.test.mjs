import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { get, sitemapUrls, sample, pathOf, parseHtml, isNoindexHtml, membershipSnapshot, classifyDealObservation, checkRetiredDealRedirect, CLASSIFICATION, reportObservations } from "./lib.mjs";

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
    const dealMembership = await membershipSnapshot("deals");
    const checks = [];
    for (const [type, urls] of byType) {
      for (const url of sample(urls, 2)) checks.push({ type, url });
    }
    assert.ok(checks.length > 0);

    const observations = [];
    const pending = [];
    for (const { type, url } of checks) {
      const observedAt = Date.now();
      const res = await get(pathOf(url));
      if (/\/deals\/\d+$/.test(pathOf(url))) {
        // A deal can legitimately sell, be held, be quarantined or age out
        // after the snapshot. Only a membership generated AFTER this
        // observation can say whether the query is at fault; the redirect
        // destination is validated unconditionally either way.
        const dest = res.isRedirect ? await checkRetiredDealRedirect(res.location) : null;
        pending.push({
          url,
          page: { status: res.status, isRedirect: res.isRedirect, noindex: isNoindexHtml(res.body), destinationOk: dest ? dest.ok : null, destinationReason: dest?.reason ?? null, observedAt },
        });
        continue;
      }
      assert.ok(!res.isRedirect, `${type} ${url} redirects (${res.status} -> ${res.location})`);
      assert.equal(res.status, 200, `${type} ${url} returned HTTP ${res.status}`);
      assert.ok(!isNoindexHtml(res.body), `${type} ${url} is in the sitemap but noindexed`);
    }

    // ONE later membership read - not a resampling loop
    const recheck = pending.length ? await membershipSnapshot("deals") : null;
    for (const { url, page } of pending) {
      observations.push(
        classifyDealObservation({
          url,
          page,
          snapshot: dealMembership,
          recheck: recheck ? { generatedAt: recheck.generatedAt, advertised: recheck.advertised.has(pathOf(url)) } : null,
        })
      );
    }
    const defects = observations.filter((o) => o.kind === CLASSIFICATION.DEFECT);
    assert.deepEqual(defects.map((d) => d.reason), [], `deal lifecycle contract defects:\n  ${defects.map((d) => d.reason).join("\n  ")}`);
    reportObservations("sampled deal URLs", observations);
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
    const dealMembership = await membershipSnapshot("deals");
    // The "deals" bucket also holds /deals and the /deals/<slug> category
    // pages - the individually-indexable listing URLs are /deals/<id>.
    const dealUrls = (byType.get("deals") ?? []).filter((u) => /\/deals\/\d+$/.test(pathOf(u)));
    if (dealUrls.length === 0) return; // no live individually-indexable deals right now
    const picks = sample(dealUrls, 40);
    const bad = [];
    let withSchema = 0;
    const pending = [];
    const eligible = [];
    for (const url of picks) {
      const observedAt = Date.now();
      const res = await get(pathOf(url));
      const indexable = !res.isRedirect && res.status === 200 && !isNoindexHtml(res.body);
      if (!indexable) {
        const dest = res.isRedirect ? await checkRetiredDealRedirect(res.location) : null;
        pending.push({
          url,
          page: { status: res.status, isRedirect: res.isRedirect, noindex: isNoindexHtml(res.body), destinationOk: dest ? dest.ok : null, destinationReason: dest?.reason ?? null, observedAt },
        });
        continue;
      }
      eligible.push({ url, res });
    }
    const recheck = pending.length ? await membershipSnapshot("deals") : null;
    const observations = pending.map(({ url, page }) =>
      classifyDealObservation({
        url,
        page,
        snapshot: dealMembership,
        recheck: recheck ? { generatedAt: recheck.generatedAt, advertised: recheck.advertised.has(pathOf(url)) } : null,
      })
    );
    for (const o of observations.filter((x) => x.kind === CLASSIFICATION.DEFECT)) bad.push(o.reason);
    const { inconclusive } = reportObservations("deep deal sample", observations);
    for (const { url, res } of eligible) {
      const types = ldTypes(res.body);
      // An indexable deal page is a genuine single-item page: Product + Offer.
      if (types.has("Product") && types.has("Offer")) withSchema++;
      else bad.push(`${url} -> indexable deal page missing Product/Offer schema`);
    }
    assert.deepEqual(bad, [], `deals sitemap / page parity failures:\n  ${bad.join("\n  ")}`);
    // Every sample being unverifiable is itself worth surfacing, but it is
    // not evidence of a defect, so it is reported rather than asserted.
    if (eligible.length === 0) {
      console.error(`  deep deal sample: no sampled URL was indexable at fetch time (${inconclusive.length} inconclusive of ${picks.length}) - schema coverage not exercised this run`);
    } else {
      assert.ok(withSchema > 0, "no indexable sampled deal page carried Product+Offer schema");
    }
  });

  test("control: deal 24195 is 200 + noindex,follow + no Product/Offer + absent from the deals sitemap", async () => {
    const res = await get("/deals/24195");
    // Never a live indexable page. While the row is still is_active but
    // display-gated it renders 200 + noindex (no Product/Offer); once it
    // is genuinely inactive the SEO-2 lifecycle applies: 308 to the same
    // card's permanent /cards page, or 404 when no such page exists.
    if (res.status === 308) {
      const loc = String(res.location ?? "").split(",")[0].trim();
      assert.match(pathOf(loc), /^\/cards\//, `/deals/24195 redirected somewhere other than a card page: ${loc}`);
    } else {
      assert.ok(res.status === 200 || res.status === 404, `/deals/24195 -> HTTP ${res.status}`);
      if (res.status === 200) {
        assert.ok(isNoindex(res.body), "/deals/24195 is not noindex");
        const types = ldTypes(res.body);
        assert.ok(!types.has("Product"), "/deals/24195 (noindex) still emits Product schema");
        assert.ok(!types.has("Offer"), "/deals/24195 (noindex) still emits Offer schema");
      }
    }

    const { locs } = await sitemapUrls();
    const present = locs.filter((l) => pathOf(l) === "/deals/24195");
    assert.deepEqual(present, [], "noindex deal 24195 is listed in the sitemap");
  });
});
