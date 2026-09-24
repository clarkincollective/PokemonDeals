// AUDIT 2026-09-23, FINDING 5 — bounded, useful affiliate source
// attribution in place of a catch-all "other".
//
// Everything here is a pure string transform or a source-shape assertion.
// No network call is made, no affiliate URL is requested, no analytics
// event is sent: the click handlers are exercised against a stubbed
// capture(), and the URL builders are pure. Nothing in this file can
// generate an affiliate click, impression or conversion.
process.env.EBAY_CAMPAIGN_ID = "5339197414";
process.env.TCGPLAYER_AFFILIATE_LINK = "https://partner.tcgplayer.com/c/1234567/890123/45678";

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const require = createRequire(import.meta.url);
const read = (p) => readFileSync(join(ROOT, p), "utf8");
// Source with //-comments stripped, so an assertion about CODE is never
// satisfied or broken by prose that merely mentions the same word. Split
// on /\r?\n/, never "\n": this repo checks out CRLF on Windows, and a
// trailing \r stops /\/\/.*$/ matching at all - the exact bug that got a
// test in the affiliate suite quarantined on 2026-09-16.
const code = (p) =>
  read(p)
    .split(/\r?\n/)
    .map((line) => line.replace(/\/\/.*$/, ""))
    .join("\n");

const A = require(join(ROOT, "lib", "affiliateAttribution.js"));
const { wrapEbayAffiliateUrl, buildEbaySearchLink } = require(join(ROOT, "lib", "ebayLinks.js"));
const { buildTcgplayerLink } = require(join(ROOT, "lib", "tcgplayer.js"));

const ITEM_URL = "https://www.ebay.com/itm/123456789012";

// === 1. one shared, deterministic mapping ==============================

test("AA-1. the identifier is <page>-<placement>, both halves from closed vocabularies", () => {
  assert.equal(A.attributionId("sealed", "selected"), "sealed-selected");
  assert.equal(A.attributionId("card", "offer"), "card-offer");
  assert.equal(A.attributionId("deal", "sticky"), "deal-sticky");
  // deterministic: same input, same output, no randomness or clock
  for (let i = 0; i < 5; i++) assert.equal(A.attributionId("guide", "offer"), "guide-offer");
  // and it is a pure module — no env, no storage, no request, no I/O
  const src = read("lib/affiliateAttribution.js");
  assert.doesNotMatch(src, /process\.env|document\.cookie|localStorage|sessionStorage|fetch\(|require\(["'](?!\.\/)/);
});

test("AA-2. every page and placement token round-trips unchanged", () => {
  for (const p of A.AFFILIATE_PAGES) assert.equal(A.affiliatePage(p), p);
  for (const p of A.AFFILIATE_PLACEMENTS) assert.equal(A.affiliatePlacement(p), p);
});

// === 2. the explicit fallback, and what can never reach the network ====

test("AA-3. an unknown surface degrades to the explicit fallback, never to a guess", () => {
  assert.equal(A.attributionId(undefined, undefined), "other-other");
  assert.equal(A.attributionId("made_up_page", "made_up_placement"), "other-other");
  // one known half survives; only the unknown half falls back
  assert.equal(A.attributionId("sealed", "made_up"), "sealed-other");
  assert.equal(A.attributionId("made_up", "grid"), "other-grid");
});

test("AA-4. no identity, query, price or country can reach the identifier", () => {
  for (const hostile of [
    "Charizard",
    "Charizard 11/108 Prerelease",
    "31909",
    "v1|123456789012|0",
    "503313",
    "user_abc123",
    "EBAY_AU",
    "$481.08",
    "utm_source=guide",
    "sealed-selected&customid=evil",
  ]) {
    assert.equal(A.attributionId(hostile, hostile), "other-other", hostile);
    assert.equal(A.attributionId("sealed", hostile), "sealed-other", hostile);
  }
  assert.equal(A.attributionId(503313, 503313), "other-other"); // not a string
  assert.equal(A.attributionId({ toString: () => "sealed" }, "grid"), "other-grid");
});

test("AA-5. the click's own page is never described as its acquisition source", () => {
  // No landing/referrer/campaign input exists in this module at all, so a
  // guide that referred the visitor cannot become the page token.
  assert.doesNotMatch(code("lib/affiliateAttribution.js"), /document\.referrer|utmSource|readLandingAttribution|traffic_source/);
  // and the acquisition source stays in the analytics landing context
  const bootstrap = read("components/analytics/AnalyticsBootstrap.js");
  assert.match(bootstrap, /readLandingAttribution/);
});

// === 3. format safety and the parameter limit ==========================

test("AA-6. every producible identifier is short, safe to put in a URL, and needs no escaping", () => {
  let widest = "";
  for (const page of A.AFFILIATE_PAGES) {
    for (const placement of A.AFFILIATE_PLACEMENTS) {
      const id = A.attributionId(page, placement);
      assert.match(id, A.VALID_ATTRIBUTION, id);
      assert.ok(id.length <= A.MAX_ATTRIBUTION_LEN, `${id} exceeds ${A.MAX_ATTRIBUTION_LEN}`);
      // encodeURIComponent must be a no-op: the value cannot alter its URL
      assert.equal(encodeURIComponent(id), id, id);
      if (id.length > widest.length) widest = id;
    }
  }
  // the whole vocabulary is far inside EPN's documented 256-char customid
  assert.ok(widest.length < 32, `widest identifier is ${widest} (${widest.length})`);
});

// === 4. the surfaces that were "other" — the point of the finding ======

test("AA-7. every pageName this repo actually passes resolves to a real page, not the fallback", () => {
  // The list is read from the source, not hand-maintained here, so a new
  // pageName added to a component with no mapping fails this test rather
  // than silently shipping as "other-other".
  const used = new Set();
  for (const f of [
    "components/DealCard.js",
    "components/SealedDealCard.js",
    "components/SpeciesCard.js",
    "components/SpeciesCatalog.js",
    "components/SealedProductBrowser.js",
    "components/HomeFeed.js",
    "components/RelatedDeals.js",
    "components/guides/GuideLiveOffers.js",
    "app/best-finds/page.js",
    "app/japanese-cards/page.js",
    "app/latest-releases/page.js",
    "app/search/SearchClient.js",
    "app/sets/[slug]/page.js",
    "components/CardDealFilters.js",
  ]) {
    for (const m of read(f).matchAll(/pageName=["']([a-z_]+)["']/g)) used.add(m[1]);
  }
  assert.ok(used.size >= 12, `expected to find the pageName vocabulary, found ${used.size}`);
  for (const pageName of used) {
    const id = A.attributionForPageName(pageName);
    assert.notEqual(id, "other-other", `pageName "${pageName}" is not in PAGE_NAME_TO_ATTRIBUTION`);
  }
});

test("AA-8. the five surfaces the census found stranded on other now have their own identity", () => {
  // Measured on production HTML, 2026-09-25, before the change.
  assert.equal(A.attributionForPageName("sealed"), "sealed-feature"); // 178 hrefs/page
  assert.equal(A.attributionForPageName("sealed_hub"), "sealed-grid");
  assert.equal(A.attributionForPageName("sealed_product"), "sealed-selected");
  assert.equal(A.attributionForPageName("guide_offers"), "guide-offer");
  assert.equal(A.attributionForPageName("japanese_cards"), "japanese-grid");
  assert.equal(A.attributionForPageName("latest_releases"), "latest-grid");
  // and they are all distinct — the whole point was that they collapsed
  // NB: an arrow, not a bare reference - Array#map passes the index as the
  // second argument, which attributionForPageName would read as a
  // placement override.
  const ids = ["sealed", "sealed_hub", "sealed_product", "guide_offers", "japanese_cards", "latest_releases"].map((n) =>
    A.attributionForPageName(n)
  );
  assert.equal(new Set(ids).size, ids.length);
});

test("AA-9. finding 4's selected-product panel reports as itself, not as the browse grid", () => {
  const src = read("components/SealedProductBrowser.js");
  // the panel's tile
  assert.match(src, /<SpeciesCard card=\{product\} pageName="sealed_product" \/>/);
  // the browse grid's tiles
  assert.match(src, /pageName="sealed_hub"/);
  assert.notEqual(A.attributionForPageName("sealed_product"), A.attributionForPageName("sealed_hub"));
});

// === 5. campaign, destination and other params are untouched ===========

test("AA-10. an /itm/ URL keeps its destination and every EPN parameter", () => {
  const u = new URL(wrapEbayAffiliateUrl(ITEM_URL, { page: "sealed", placement: "selected" }));
  assert.equal(u.hostname, "www.ebay.com");
  assert.equal(u.pathname, "/itm/123456789012"); // destination item unchanged
  assert.equal(u.searchParams.get("campid"), "5339197414");
  assert.equal(u.searchParams.get("mkevt"), "1");
  assert.equal(u.searchParams.get("mkcid"), "1");
  assert.equal(u.searchParams.get("mkrid"), "711-53200-19255-0");
  assert.equal(u.searchParams.get("toolid"), "10049");
  assert.equal(u.searchParams.get("customid"), "sealed-selected");
});

test("AA-11. a search URL keeps its query and category, and the marketplace still routes", () => {
  for (const [mp, host] of [
    ["EBAY_US", "www.ebay.com"],
    ["EBAY_GB", "www.ebay.co.uk"],
    ["EBAY_AU", "www.ebay.com.au"],
    ["EBAY_DE", "www.ebay.de"],
  ]) {
    const u = new URL(buildEbaySearchLink("Charizard 11/108", mp, { page: "card", placement: "search" }));
    assert.equal(u.hostname, host);
    assert.equal(u.searchParams.get("_nkw"), "Charizard 11/108");
    assert.equal(u.searchParams.get("_sacat"), "183454");
    assert.equal(u.searchParams.get("customid"), "card-search");
    assert.equal(u.searchParams.get("campid"), "5339197414");
  }
});

test("AA-12. re-wrapping stays idempotent — exactly one of every parameter", () => {
  const once = wrapEbayAffiliateUrl(ITEM_URL, { page: "home", placement: "best" });
  const twice = wrapEbayAffiliateUrl(once, { page: "sealed", placement: "grid" });
  const u = new URL(twice);
  for (const p of ["customid", "campid", "mkevt", "mkcid", "mkrid", "toolid"]) {
    assert.equal(u.searchParams.getAll(p).length, 1, p);
  }
  assert.equal(u.searchParams.get("customid"), "sealed-grid"); // the later wrap wins
});

test("AA-13. customid is still set when the campaign id is unreadable (client-side render)", () => {
  const original = process.env.EBAY_CAMPAIGN_ID;
  try {
    delete process.env.EBAY_CAMPAIGN_ID;
    const alreadyWrapped = `${ITEM_URL}?mkevt=1&campid=5339197414&customid=&toolid=10049`;
    const u = new URL(wrapEbayAffiliateUrl(alreadyWrapped, { page: "search", placement: "grid" }));
    assert.equal(u.searchParams.get("customid"), "search-grid");
    assert.equal(u.searchParams.get("campid"), "5339197414"); // never blanked
  } finally {
    process.env.EBAY_CAMPAIGN_ID = original;
  }
});

// === 6. the documented migration ======================================

test("AA-14. the legacy single-token surface still resolves, so no call site silently degrades", () => {
  assert.equal(new URL(wrapEbayAffiliateUrl(ITEM_URL, { surface: "deal_page" })).searchParams.get("customid"), "deal-offer");
  assert.equal(new URL(wrapEbayAffiliateUrl(ITEM_URL, { surface: "card" })).searchParams.get("customid"), "card-offer");
  assert.equal(new URL(buildEbaySearchLink("x", "EBAY_US", "search")).searchParams.get("customid"), "search-grid");
  // every historical surface has a translation
  const historical = require(join(ROOT, "lib", "affiliateSurfaces.js")).AFFILIATE_SURFACES;
  for (const s of historical) {
    assert.ok(A.LEGACY_SURFACE_TO_ATTRIBUTION[s], `no migration entry for historical surface "${s}"`);
  }
});

test("AA-15. there is ONE live mapping — the superseded module is not wired to anything", () => {
  // A second live table is how the two drift apart. lib/affiliateSurfaces.js
  // is kept only as the historical record of what EPN already recorded.
  for (const dir of ["app", "components"]) {
    const files = listJs(join(ROOT, dir));
    for (const f of files) {
      const src = readFileSync(f, "utf8");
      assert.doesNotMatch(
        src,
        /from ["']@\/lib\/affiliateSurfaces["']|require\(["'].*affiliateSurfaces["']\)/,
        `${f} still imports the superseded lib/affiliateSurfaces.js`
      );
    }
  }
  assert.match(read("lib/affiliateSurfaces.js"), /SUPERSEDED 2026-09-25/);
});

// === 7. eBay and Impact are kept separate =============================

test("AA-16. TCGPlayer/Impact uses its own parameter, and the destination is byte-identical", () => {
  const withAttr = buildTcgplayerLink("Charizard", "503313", { page: "sealed", placement: "selected" });
  const u = new URL(withAttr);
  assert.equal(u.hostname, "partner.tcgplayer.com");
  assert.equal(u.pathname, "/c/1234567/890123/45678"); // tracking base unchanged
  assert.equal(u.searchParams.get("u"), "https://www.tcgplayer.com/product/503313"); // destination unchanged
  assert.equal(u.searchParams.get("subId1"), "sealed-selected");
  // eBay's parameter name must NOT appear on an Impact link, and vice versa
  assert.equal(u.searchParams.get("customid"), null);
  assert.equal(new URL(wrapEbayAffiliateUrl(ITEM_URL, { page: "card", placement: "offer" })).searchParams.get("subId1"), null);
});

test("AA-17. with no Impact link configured the plain destination is returned, unchanged and untagged", () => {
  const original = process.env.TCGPLAYER_AFFILIATE_LINK;
  try {
    delete process.env.TCGPLAYER_AFFILIATE_LINK;
    assert.equal(
      buildTcgplayerLink("Charizard", "503313", { page: "card", placement: "reference" }),
      "https://www.tcgplayer.com/product/503313"
    );
  } finally {
    process.env.TCGPLAYER_AFFILIATE_LINK = original;
  }
});

test("AA-18. the two networks share the identifier VALUE but never the parameter name", () => {
  assert.match(code("lib/tcgplayer.js"), /IMPACT_SUBID_PARAM/);
  assert.doesNotMatch(code("lib/tcgplayer.js"), /customid/);
  assert.doesNotMatch(code("lib/ebayLinks.js"), /subId1|IMPACT_SUBID_PARAM/);
});

// === 8. the click event carries the same classification ================

test("AA-19. the event reports the identifier read off the href the network will receive", () => {
  // eBay
  const ebayHref = wrapEbayAffiliateUrl(ITEM_URL, { page: "guide", placement: "offer" });
  assert.deepEqual(A.attributionFromHref(ebayHref), { id: "guide-offer", page: "guide", placement: "offer" });
  // Impact
  const tcgHref = buildTcgplayerLink("Charizard", "503313", { page: "sealed_item", placement: "reference" });
  assert.deepEqual(A.attributionFromHref(tcgHref), {
    id: "sealed_item-reference",
    page: "sealed_item",
    placement: "reference",
  });
  // a legacy single-token value reads as null rather than being split into
  // two halves it never meant
  assert.equal(A.attributionFromHref(`${ITEM_URL}?customid=home_best`), null);
  assert.equal(A.attributionFromHref("not a url"), null);
  assert.equal(A.attributionFromHref(ITEM_URL), null);
});

test("AA-20. both click components attach the classification, and read it off the href", () => {
  for (const f of ["components/AffiliateLink.js", "components/EbaySearchLink.js"]) {
    const src = read(f);
    assert.match(src, /attributionFromHref/, f);
    assert.match(src, /epn_customid/, f);
    assert.match(src, /affiliate_page/, f);
    assert.match(src, /affiliate_placement/, f);
  }
  // EbaySearchLink must read the LOCALIZED href - the one actually followed
  assert.match(read("components/EbaySearchLink.js"), /attributionFromHref\(finalHref\)/);
});

test("AA-21. existing event names and their existing properties are preserved", () => {
  const affiliate = read("components/AffiliateLink.js");
  const search = read("components/EbaySearchLink.js");
  // the Vercel event names are still the caller's, untouched
  assert.match(affiliate, /track\(eventName, eventData\)/);
  assert.match(search, /track\("eBay Click"/);
  // the PostHog event is still AFFILIATE_CLICK with its existing dimensions
  for (const [f, src] of [["AffiliateLink", affiliate], ["EbaySearchLink", search]]) {
    assert.match(src, /EVENTS\.AFFILIATE_CLICK/, f);
    for (const prop of ["origin_section", "placement", "page_type", "network"]) {
      assert.match(src, new RegExp(prop), `${f} dropped ${prop}`);
    }
  }
});

// === 9. one event per action ===========================================

test("AA-22. an affiliate anchor is marked, and the only overlapping ancestor stands down", () => {
  for (const f of ["components/AffiliateLink.js", "components/EbaySearchLink.js"]) {
    assert.match(read(f), /data-affiliate-link=""/, f);
  }
  // /search wrapped every result card in its own click handler, so one
  // click on the card's affiliate CTA emitted BOTH that wrapper's events
  // and the CTA's own. The wrapper now ignores clicks that originated
  // inside an affiliate control.
  const search = read("app/search/SearchClient.js");
  assert.match(search, /closest\?\.\("\[data-affiliate-link\]"\)\) return;/);
});

test("AA-23. every affiliate click flows through one of the two emitting components", () => {
  // A bare <a> with its own track() call emitted the Vercel event but no
  // affiliate_click - the catalogue tile's "Find on eBay" did exactly that
  // and was invisible to the growth report. Nothing may reintroduce one.
  const offenders = [];
  for (const dir of ["app", "components"]) {
    for (const f of listJs(join(ROOT, dir))) {
      const src = readFileSync(f, "utf8");
      if (/rel="sponsored/.test(src) && !/AffiliateLink|EbaySearchLink/.test(src)) offenders.push(f);
    }
  }
  assert.deepEqual(offenders, [], "a sponsored anchor exists outside the two emitting components");
  assert.doesNotMatch(read("components/CatalogueBrowser.js"), /rel="sponsored noopener noreferrer"/);
  assert.match(read("components/CatalogueBrowser.js"), /<EbaySearchLink/);
});

// === 10. sponsored/nofollow qualification is intact ====================

test("AA-24. every outbound affiliate anchor is still sponsored, noopener, noreferrer, new tab", () => {
  for (const f of ["components/AffiliateLink.js", "components/EbaySearchLink.js"]) {
    const src = read(f);
    assert.match(src, /rel="sponsored noopener noreferrer"/, f);
    assert.match(src, /target="_blank"/, f);
  }
});

// --------------------------------------------------------------- helper

function listJs(dir) {
  const { readdirSync, statSync } = require("node:fs");
  const out = [];
  const walk = (d) => {
    for (const name of readdirSync(d)) {
      const p = join(d, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (name.endsWith(".js") || name.endsWith(".jsx")) out.push(p);
    }
  };
  walk(dir);
  return out;
}

// === 11. the handlers, actually invoked ===============================
//
// The two emitting components are compiled and their rendered <a>'s
// onClick is called directly, with the analytics modules stubbed. No
// navigation happens (nothing calls window.open or sets location), no
// request is made, and no event leaves the process.

async function loadClickComponent(file, props, { pathname = "/sealed-deals", region = "EBAY_AU" } = {}) {
  const swc = (await import("next/dist/build/swc/index.js")).default;
  const tracked = [];
  const captured = [];
  globalThis.window = { location: { pathname } };
  const { code: compiled } = swc.transformSync(read(file), {
    filename: file,
    jsc: { parser: { syntax: "ecmascript", jsx: true }, target: "es2022", transform: { react: { runtime: "automatic" } } },
    module: { type: "commonjs" },
  });
  const dependency = (name) => {
    if (name === "react/jsx-runtime") return require(name);
    if (name === "@vercel/analytics") return { track: (n, d) => tracked.push([n, d]) };
    if (name === "@/lib/analytics/client") return { capture: (n, p) => captured.push([n, p]) };
    if (name === "@/lib/analytics/events") return require(join(ROOT, "lib/analytics/events.js"));
    if (name === "@/lib/analytics/pageType") return require(join(ROOT, "lib/analytics/pageType.js"));
    if (name === "@/lib/analytics/props") return require(join(ROOT, "lib/analytics/props.js"));
    if (name === "@/lib/affiliateAttribution") return A;
    if (name === "@/lib/useRegion") return { useRegion: () => region, localizeEbaySearchUrl: (h) => h };
    throw new Error("unexpected dependency " + name);
  };
  const mod = { exports: {} };
  new Function("require", "module", "exports", compiled)(dependency, mod, mod.exports);
  return { el: mod.exports.default(props), tracked, captured };
}

test("AA-25. a sealed selected-product click reports the identifier the network receives - once", async () => {
  const href = wrapEbayAffiliateUrl(ITEM_URL, { page: "sealed", placement: "selected" });
  const { el, tracked, captured } = await loadClickComponent("components/AffiliateLink.js", {
    href,
    eventName: "View Deal on eBay",
    eventData: { page: "sealed_product", marketplace: "EBAY_AU" },
    children: "View on eBay",
  });
  assert.equal(el.props.href, href, "the href reaches the anchor byte-identical");
  assert.equal(el.props.rel, "sponsored noopener noreferrer");
  assert.equal(el.props.target, "_blank");
  assert.equal(el.props["data-affiliate-link"], "");

  el.props.onClick();
  assert.equal(tracked.length, 1, "one Vercel event");
  assert.equal(tracked[0][0], "View Deal on eBay", "the existing event name is unchanged");
  assert.equal(captured.length, 1, "one PostHog event");
  const [name, props] = captured[0];
  assert.equal(name, "affiliate_click");
  assert.equal(props.epn_customid, "sealed-selected");
  assert.equal(props.affiliate_page, "sealed");
  assert.equal(props.affiliate_placement, "selected");
  assert.equal(props.network, "ebay");
  // the pre-existing dimensions still land
  assert.equal(props.origin_section, "sealed_product");
  assert.equal(props.country, "AU");

  // a second click is a second event, never a double fire of one
  el.props.onClick();
  assert.equal(tracked.length, 2);
  assert.equal(captured.length, 2);
});

test("AA-26. a TCGPlayer click reports the Impact sub-ID and is never summed with eBay", async () => {
  const href = buildTcgplayerLink("Prismatic Evolutions Elite Trainer Box", "593355", {
    page: "sealed",
    placement: "grid",
  });
  const { captured } = await loadClickComponent("components/AffiliateLink.js", {
    href,
    eventName: "TCGPlayer Click",
    eventData: { page: "sealed_hub" },
    children: "Check on TCGPlayer",
  }).then(async (r) => {
    r.el.props.onClick();
    return r;
  });
  const props = captured[0][1];
  assert.equal(props.network, "tcgplayer");
  assert.equal(props.epn_customid, "sealed-grid");
  assert.equal(props.affiliate_page, "sealed");
  assert.equal(props.affiliate_placement, "grid");
});

test("AA-27. an unattributed href still records the click, just without the classification", async () => {
  const { captured } = await loadClickComponent("components/AffiliateLink.js", {
    href: "https://www.ebay.com/itm/999",
    eventName: "eBay Click",
    eventData: { page: "sealed_hub" },
    children: "x",
  }).then(async (r) => {
    r.el.props.onClick();
    return r;
  });
  assert.equal(captured.length, 1, "attribution being unavailable never removes the event");
  assert.equal(captured[0][1].epn_customid, undefined);
  assert.equal(captured[0][1].origin_section, "sealed_hub");
});

test("AA-28. analytics failing cannot stop the outbound click", async () => {
  const swc = (await import("next/dist/build/swc/index.js")).default;
  globalThis.window = { location: { pathname: "/sealed-deals" } };
  const { code: compiled } = swc.transformSync(read("components/AffiliateLink.js"), {
    filename: "AffiliateLink.js",
    jsc: { parser: { syntax: "ecmascript", jsx: true }, target: "es2022", transform: { react: { runtime: "automatic" } } },
    module: { type: "commonjs" },
  });
  const mod = { exports: {} };
  new Function("require", "module", "exports", compiled)((name) => {
    if (name === "react/jsx-runtime") return require(name);
    if (name === "@vercel/analytics") return { track: () => { throw new Error("vercel down"); } };
    if (name === "@/lib/analytics/client") return { capture: () => { throw new Error("posthog down"); } };
    if (name === "@/lib/analytics/events") return require(join(ROOT, "lib/analytics/events.js"));
    if (name === "@/lib/analytics/pageType") return require(join(ROOT, "lib/analytics/pageType.js"));
    if (name === "@/lib/analytics/props") return require(join(ROOT, "lib/analytics/props.js"));
    if (name === "@/lib/affiliateAttribution") return A;
    throw new Error("unexpected dependency " + name);
  }, mod, mod.exports);
  const el = mod.exports.default({ href: ITEM_URL, eventName: "eBay Click", eventData: {}, children: "x" });
  assert.doesNotThrow(() => el.props.onClick());
});

// === 12. the campaign id must survive the client-render boundary =======

test("AA-29. a product delivered by the API carries a campaign-wrapped href; the page props still do not", async () => {
  const deals = read("lib/deals.js");
  // the slimmer no longer claims something nothing checks
  assert.doesNotMatch(deals, /rebuilt by\s*\n?\/\/ SpeciesCard from `searchQuery` with the same builder \(campaign id and/);
  assert.match(deals, /export function slimSealedProduct\(p, \{ withEbayHref = false \} = \{\}\)/);
  assert.match(deals, /withEbayHref \? \{ ebayHref:/);

  // the API opts in (browser render, no server env there)...
  const route = read("app/api/sealed-catalog/route.js");
  assert.match(route, /const WITH_HREF = \{ withEbayHref: true \}/);
  assert.equal((route.match(/slimSealedProduct\(p, WITH_HREF\)/g) ?? []).length, 3, "every API path must ship the href");
  // ...and the page props deliberately do not, so the page weight the
  // prerendered sets were slimmed for is unchanged.
  assert.match(read("app/sealed-deals/page.js"), /g\.products\.map\(slimSealedProduct\)/);
});

test("AA-30. a server-built href keeps its campaign id when the client re-applies the placement", () => {
  // Exactly what SpeciesCard does to an API-delivered product: the href
  // arrives campaign-wrapped from the server, and the browser - where
  // EBAY_CAMPAIGN_ID is undefined - rewrites only customid.
  const serverBuilt = buildEbaySearchLink("151 Elite Trainer Box", undefined, { page: "sealed", placement: "grid" });
  assert.equal(new URL(serverBuilt).searchParams.get("campid"), "5339197414");

  const original = process.env.EBAY_CAMPAIGN_ID;
  try {
    delete process.env.EBAY_CAMPAIGN_ID; // the browser
    const clientFinal = new URL(wrapEbayAffiliateUrl(serverBuilt, { page: "sealed", placement: "selected" }));
    assert.equal(clientFinal.searchParams.get("campid"), "5339197414", "the campaign id must survive");
    assert.equal(clientFinal.searchParams.get("customid"), "sealed-selected");
    assert.equal(clientFinal.searchParams.get("_nkw"), "151 Elite Trainer Box");

    // and the failure this replaced: building from scratch in the browser
    // produces a link with NO campaign id at all
    const builtInBrowser = new URL(buildEbaySearchLink("151 Elite Trainer Box", undefined, { page: "sealed", placement: "selected" }));
    assert.equal(builtInBrowser.searchParams.get("campid"), null, "this is why the API must send the href");
  } finally {
    process.env.EBAY_CAMPAIGN_ID = original;
  }
});
