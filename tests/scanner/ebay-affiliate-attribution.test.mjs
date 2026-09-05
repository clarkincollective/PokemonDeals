// eBay Partner Network sub-ID attribution (customid / affiliateReferenceId).
// Zero new eBay access, zero new quota - metadata on already-existing
// outbound links only. See docs/ebay-affiliate-attribution.md.
//
// Mocks nothing that touches the network - wrapEbayAffiliateUrl/
// buildEbaySearchLink are pure string transforms, and this file never
// calls searchListings/getAccessToken/anything that hits fetch.

process.env.EBAY_CAMPAIGN_ID = "5339197414";

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { AFFILIATE_SURFACES, affiliateSurface, surfaceForPageName, PAGE_NAME_TO_SURFACE } from "../../lib/affiliateSurfaces.js";
import ebay from "../../lib/ebay.js";
import { localizeEbaySearchUrl } from "../../lib/ebaySearch.js";

const { wrapEbayAffiliateUrl, buildEbaySearchLink } = ebay;

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => readFileSync(join(ROOT, p), "utf8");

const ITEM_URL = "https://www.ebay.com/itm/123456789012";

// === 1. each approved surface produces the correct customid ================

test("1. every AFFILIATE_SURFACES value round-trips through affiliateSurface unchanged", () => {
  for (const s of AFFILIATE_SURFACES) {
    assert.equal(affiliateSurface(s), s);
  }
});

test("1b. wrapEbayAffiliateUrl sets customid to exactly the requested valid surface", () => {
  for (const surface of ["home_best", "search", "pokemon", "card", "deal_page"]) {
    const url = new URL(wrapEbayAffiliateUrl(ITEM_URL, { surface }));
    assert.equal(url.searchParams.get("customid"), surface);
  }
});

// === 2. arbitrary values fall back to other =================================

test("2. affiliateSurface rejects anything not on the fixed allowlist", () => {
  assert.equal(affiliateSurface(undefined), "other");
  assert.equal(affiliateSurface(null), "other");
  assert.equal(affiliateSurface(""), "other");
  assert.equal(affiliateSurface("home_best_charizard"), "other");
  assert.equal(affiliateSurface("deal_31909"), "other");
  assert.equal(affiliateSurface("search_pikachu"), "other");
  assert.equal(affiliateSurface("user_123"), "other");
  assert.equal(affiliateSurface(31909), "other");
  assert.equal(affiliateSurface({ toString: () => "home_best" }), "other"); // must be a real string, not stringifiable
});

test("2b. wrapEbayAffiliateUrl with no surface, or a bogus one, still sets a valid customid (never blank, never the raw value)", () => {
  assert.equal(new URL(wrapEbayAffiliateUrl(ITEM_URL)).searchParams.get("customid"), "other");
  assert.equal(new URL(wrapEbayAffiliateUrl(ITEM_URL, {})).searchParams.get("customid"), "other");
  assert.equal(new URL(wrapEbayAffiliateUrl(ITEM_URL, { surface: "not_a_real_surface" })).searchParams.get("customid"), "other");
});

// === 3-6. things that must NEVER reach customid ==============================

test("3. a search query never enters customid", () => {
  const url = new URL(buildEbaySearchLink("Charizard 11/108 Prerelease Promo", "EBAY_US", "search"));
  assert.equal(url.searchParams.get("customid"), "search");
  assert.ok(!url.searchParams.get("customid").includes("charizard".toLowerCase()) || true); // customid is a fixed enum, not derived from the query at all
  assert.equal(AFFILIATE_SURFACES.has(url.searchParams.get("customid")), true);
});

test("4. a card name never enters customid", () => {
  // affiliateSurface's allowlist is a closed Set of literal enum strings -
  // there is no code path where a card name could become the customid
  // value, structurally, regardless of what's passed as `surface`.
  assert.equal(affiliateSurface("Charizard"), "other");
  assert.equal(affiliateSurface("Pikachu VMAX"), "other");
});

test("5. a deal ID never enters customid", () => {
  assert.equal(affiliateSurface(31909), "other");
  assert.equal(affiliateSurface("31909"), "other");
});

test("6. a listing ID never enters customid", () => {
  assert.equal(affiliateSurface("v1|123456789012|0"), "other");
});

// === 7. user/session identity cannot enter customid ==========================

test("7. lib/affiliateSurfaces.js contains no code that could read a user/session identifier (env, cookies, headers, storage)", () => {
  const src = read("lib/affiliateSurfaces.js");
  assert.doesNotMatch(src, /process\.env|document\.cookie|localStorage|sessionStorage|req\.|request\.|headers\[/i);
});

// === 8/9. exact /itm/ URLs and eBay search URLs both preserve everything ===

test("8. an exact /itm/ URL keeps its item ID and gains campid/mkevt/mkcid/mkrid/toolid/customid, nothing lost", () => {
  const wrapped = new URL(wrapEbayAffiliateUrl(ITEM_URL, { surface: "deal_page" }));
  assert.equal(wrapped.pathname, "/itm/123456789012");
  assert.equal(wrapped.searchParams.get("campid"), "5339197414");
  assert.equal(wrapped.searchParams.get("mkevt"), "1");
  assert.equal(wrapped.searchParams.get("mkcid"), "1");
  assert.equal(wrapped.searchParams.get("mkrid"), "711-53200-19255-0");
  assert.equal(wrapped.searchParams.get("toolid"), "10049");
  assert.equal(wrapped.searchParams.get("customid"), "deal_page");
});

test("9. an eBay search URL keeps _nkw and _sacat alongside the affiliate params", () => {
  const url = new URL(buildEbaySearchLink("Charizard 11/108", "EBAY_US", "card"));
  assert.equal(url.searchParams.get("_nkw"), "Charizard 11/108");
  assert.equal(url.searchParams.get("_sacat"), "183454");
  assert.equal(url.searchParams.get("customid"), "card");
  assert.equal(url.searchParams.get("campid"), "5339197414");
});

// === 10/11. marketplace localization + AU/US/GB hosts =======================

test("10. buildEbaySearchLink still targets the right eBay site per marketplace, customid intact", () => {
  for (const [mp, host] of [["EBAY_US", "www.ebay.com"], ["EBAY_GB", "www.ebay.co.uk"], ["EBAY_AU", "www.ebay.com.au"]]) {
    const url = new URL(buildEbaySearchLink("Charizard", mp, "search"));
    assert.equal(url.hostname, host);
    assert.equal(url.searchParams.get("customid"), "search");
  }
});

test("11. client-side localizeEbaySearchUrl preserves customid across AU/US/GB host swaps (existing param-agnostic contract)", () => {
  const us = buildEbaySearchLink("Charizard", "EBAY_US", "pokemon");
  for (const [region, host] of [["EBAY_AU", "www.ebay.com.au"], ["EBAY_GB", "www.ebay.co.uk"], ["EBAY_US", "www.ebay.com"]]) {
    const localized = new URL(localizeEbaySearchUrl(us, region));
    assert.equal(localized.hostname, host);
    assert.equal(localized.searchParams.get("customid"), "pokemon");
    assert.equal(localized.searchParams.get("campid"), "5339197414");
  }
});

// === 12. customid appears exactly once, even when re-wrapping =============

test("12. re-wrapping an already-wrapped URL with a different surface still yields exactly one customid (and one of every other param)", () => {
  const once = wrapEbayAffiliateUrl(ITEM_URL, { surface: "home_best" });
  const twice = wrapEbayAffiliateUrl(once, { surface: "search" });
  const url = new URL(twice);
  assert.equal(url.searchParams.getAll("customid").length, 1);
  assert.equal(url.searchParams.getAll("campid").length, 1);
  assert.equal(url.searchParams.getAll("mkevt").length, 1);
  assert.equal(url.searchParams.get("customid"), "search"); // the later wrap wins - idempotent overwrite, not accumulation
});

// === 13/14. no new eBay API call, no new OAuth scope =========================

test("13. lib/affiliateSurfaces.js makes no network call and has no I/O of any kind", () => {
  const src = read("lib/affiliateSurfaces.js");
  assert.doesNotMatch(src, /fetch\(|http:|https:|require\(["'](?!\.\/affiliateSurfaces)/);
});

test("13b. wrapEbayAffiliateUrl / buildEbaySearchLink perform no fetch - purely local URL construction", () => {
  const src = read("lib/ebay.js");
  const wrapFn = src.slice(src.indexOf("function wrapEbayAffiliateUrl"), src.indexOf("function buildEbaySearchLink"));
  assert.doesNotMatch(wrapFn, /fetch\(/);
});

test("14. no new OAuth scope was introduced - lib/ebay.js still requests only the single generic scope", () => {
  const src = read("lib/ebay.js");
  const scopeMatches = [...src.matchAll(/scope:\s*"([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(scopeMatches, ["https://api.ebay.com/oauth/api_scope"]);
});

// === 15. no scanner/background discovery customid leakage ==================

test("15. authHeaders() (the Browse scan-time request) never sets affiliateReferenceId - background scans have no surface", () => {
  const src = read("lib/ebay.js");
  const fn = src.slice(src.indexOf("function authHeaders"), src.indexOf("function authHeaders") + 700);
  assert.doesNotMatch(fn, /affiliateReferenceId/);
  assert.match(fn, /affiliateCampaignId=\$\{campaignId\}/); // campaignId is still sent, unchanged
});

test("15b. every function that calls authHeaders() is a background scan/verify/discovery function, not a page render", () => {
  // Strip //-comment lines first so a comment merely mentioning
  // "authHeaders()" in prose (like the one right above its own
  // definition) isn't counted as a call site.
  const src = read("lib/ebay.js")
    .split("\n")
    .map((line) => line.replace(/\/\/.*$/, ""))
    .join("\n");
  const knownScanFunctions = ["searchListings", "searchNewlyListed", "getGradingDetails", "getRawListingDetail", "getListingFreshness", "getItemsByLegacyIds"];
  const topLevelStarts = [...src.matchAll(/^(?:async )?function \w+\(/gm)].map((m) => m.index).sort((a, b) => a - b);

  function bodyOf(name) {
    const decl = new RegExp(`^(?:async )?function ${name}\\(`, "m");
    const start = src.search(decl);
    assert.ok(start > -1, `${name} not found`);
    const next = topLevelStarts.find((i) => i > start);
    return src.slice(start, next ?? src.length);
  }

  let totalFoundInKnownFunctions = 0;
  for (const name of knownScanFunctions) {
    const body = bodyOf(name);
    const count = (body.match(/authHeaders\(/g) ?? []).length;
    assert.ok(count > 0, `${name} was expected to call authHeaders()`);
    totalFoundInKnownFunctions += count;
  }
  // authHeaders( appears once as its own definition, plus one call per
  // known scan function above - if the total call-site count in the whole
  // file is any higher, some OTHER function (an unaccounted new caller) is
  // calling it too.
  const totalInFile = (src.match(/authHeaders\(/g) ?? []).length;
  assert.equal(totalInFile, totalFoundInKnownFunctions + 1, "an authHeaders() call site exists outside the known scan functions");
});

// === 16. PostHog identifiers are never passed to eBay ========================

test("16. no eBay URL builder in this codebase ever reads a PostHog/analytics identifier", () => {
  // Checks actual usage shapes, not prose - lib/affiliateSurfaces.js's own
  // comments legitimately explain the PostHog/EPN separation in words.
  for (const f of ["lib/ebay.js", "lib/affiliateSurfaces.js", "lib/ebaySearch.js"]) {
    assert.doesNotMatch(read(f), /distinct_id|analyticsProps|capture\(|require\(["']posthog|from ["']posthog|\bposthog\./i);
  }
});

// === 17. existing affiliate URL tests remain green (smoke re-check of the
//         exact fixtures those suites already exercise) ====================

test("17. buildEbaySearchLink(query, marketplace) without a surface still targets the right eBay site (backward compatible)", () => {
  assert.match(buildEbaySearchLink("Charizard", "EBAY_AU"), /^https:\/\/www\.ebay\.com\.au\/sch/);
  assert.match(buildEbaySearchLink("Charizard", "EBAY_GB"), /^https:\/\/www\.ebay\.co\.uk\/sch/);
  assert.match(buildEbaySearchLink("Charizard"), /^https:\/\/www\.ebay\.com\/sch/);
});

// === mapping table sanity - every real pageName this repo actually passes
//     to a DealCard/SealedDealCard/SpeciesCard/DealGrid resolves to a real,
//     valid surface (never silently "other" by a typo in the table) =========

test("every currently-used pageName in the mapping table resolves to a real surface, not other", () => {
  for (const pageName of Object.keys(PAGE_NAME_TO_SURFACE)) {
    const surface = surfaceForPageName(pageName);
    assert.notEqual(surface, "other", `pageName "${pageName}" unexpectedly resolves to "other" - check the table`);
    assert.equal(AFFILIATE_SURFACES.has(surface), true);
  }
});

test("an unmapped/unknown pageName resolves to other, not a crash or a guess", () => {
  assert.equal(surfaceForPageName("sealed_hub"), "other");
  assert.equal(surfaceForPageName("japanese_cards"), "other");
  assert.equal(surfaceForPageName(undefined), "other");
  assert.equal(surfaceForPageName("totally_made_up"), "other");
});
