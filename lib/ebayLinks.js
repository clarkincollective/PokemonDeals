// BROWSER-SAFE eBay helpers: marketplace constants, affiliate-link
// wrapping, tracked search links and listing-image URL helpers.
//
// EBAY-14R BOUNDARY FIX (2026-09-11). lib/ebay.js is the SERVER module:
// it holds the OAuth client-credential flow, every Browse API call, and
// (since Phase 14R) the per-invocation call telemetry, which imports
// `node:async_hooks`. Several components that render inside "use client"
// boundaries (DealCard under /search's SearchClient and <DealGrid>,
// CardDealFilters, the species/set tiles, ...) only ever needed the pure
// helpers below - but by importing them from lib/ebay.js they pulled the
// whole server module, and with it `node:async_hooks`, into the browser
// bundle, and /search crashed on load ("Cannot find module
// 'node:async_hooks'").
//
// Rule, enforced by tests/scanner/ebay-client-boundary.test.mjs:
//   * anything reachable from a "use client" module imports from THIS
//     file, never from lib/ebay.js;
//   * this file requires no Node built-in, no provider client, no
//     telemetry, and makes no network call;
//   * lib/ebay.js re-exports everything here, so server callers that
//     already import from lib/ebay.js keep working unchanged.
//
// The code below moved verbatim from lib/ebay.js (behaviour unchanged).

const { affiliateSurface } = require("./affiliateSurfaces");

// eBay's "Pokemon Individual Cards" category - keeps results to single
// cards instead of booster boxes, sealed product, lots, etc. Confirmed the
// same ID applies across the country sites below.
const POKEMON_SINGLES_CATEGORY_ID = "183454";

// The countries this site scans. Keep this list in sync with: the region
// picker (components/RegionControl.js REGIONS), the geo-IP default map
// (lib/geo.js COUNTRY_TO_MARKETPLACE), the currency map (lib/money.js
// MARKETPLACE_CURRENCY), and the marketplace-list copy on the homepage /
// how-it-works / methodology / about pages. FilterBar and SearchClient
// iterate this object directly, so they pick up a new entry automatically.
// currency is required by eBay whenever a price filter is used - see
// searchListings() in lib/ebay.js.
//
// EBAY_IT added 2026-08-31 (6th marketplace): real domestic seller depth
// (~19,400 domestic Charizard listings, > EBAY_CA, ~4x EBAY_DE), EUR
// already wired, and it fits the ~5,000/day Browse budget the same way
// the sealed-scan expansion did (~575 calls/day added). See
// docs/scanning-architecture.md and IMPLEMENTATION_STATUS.md. FR/ES/NL
// were held for the pending rate-limit increase; IE/AT/CH ruled out as
// too thin - see the marketplace research write-up.
const MARKETPLACES = {
  EBAY_US: { label: "United States", flag: "🇺🇸", currency: "USD" },
  EBAY_GB: { label: "United Kingdom", flag: "🇬🇧", currency: "GBP" },
  EBAY_AU: { label: "Australia", flag: "🇦🇺", currency: "AUD" },
  EBAY_CA: { label: "Canada", flag: "🇨🇦", currency: "CAD" },
  EBAY_DE: { label: "Germany", flag: "🇩🇪", currency: "EUR" },
  EBAY_IT: { label: "Italy", flag: "🇮🇹", currency: "EUR" },
};

// eBay's item_summary returns the small "s-l225" thumbnail (the size
// suffix) by default, which looks soft/blurry once displayed at real card-
// grid sizes. eBay's image CDN serves the exact same already-uploaded
// photo at several larger sizes from the identical URL (just swap the
// size suffix) - verified directly (200 OK, genuinely larger files) at
// s-l400/500/960/1600. Free - no extra API call, since this is a CDN URL
// rewrite, not a request to eBay's rate-limited API.
function upscaleEbayImage(url) {
  if (!url) return url;
  return url.replace(/\/s-l\d+\.jpg$/, "/s-l1600.jpg");
}

// The primary listing photo from an item_summary/search OR
// get_item_by_legacy_id result. `item.image` is the usual field, but a
// subset of listings (seen on graded slabs and some non-US marketplaces)
// come back from the SEARCH endpoint with `image` absent and only
// `thumbnailImages` / `additionalImages` populated - so those must be the
// fallback, else the deal is stored with image_url = null and renders a
// bare placeholder. Upscaled to s-l1600 (a CDN rewrite, no extra call).
function primaryListingImage(item) {
  const raw =
    item?.image?.imageUrl ||
    item?.thumbnailImages?.[0]?.imageUrl ||
    item?.additionalImages?.[0]?.imageUrl ||
    null;
  return upscaleEbayImage(raw) ?? null;
}

// EVERY photo eBay returned for the listing, primary first, de-duped and
// upscaled. P0 deal-image-integrity: the out-of-band screening worker
// needs the alternates so that when a seller's PRIMARY photo is a card
// back it can prefer another of the seller's photos that is a real card
// face, before falling back to the canonical catalogue art. Normalised on
// the CDN size-suffix so the same photo at s-l225 vs s-l1600 isn't kept
// twice.
function allListingImages(item) {
  const seen = new Set();
  const out = [];
  const push = (u) => {
    const up = upscaleEbayImage(u);
    if (!up || !/^https?:\/\//.test(up) || seen.has(up)) return;
    seen.add(up);
    out.push(up);
  };
  push(item?.image?.imageUrl);
  for (const a of item?.additionalImages ?? []) push(a?.imageUrl);
  for (const a of item?.thumbnailImages ?? []) push(a?.imageUrl);
  return out;
}

// eBay Partner Network's standard tracking query params - the same suffix
// eBay's own Browse API appends automatically to itemAffiliateWebUrl when
// affiliateCampaignId is set on a request (see authHeaders in lib/ebay.js). Not
// every outbound eBay link on the site comes from a fresh Browse API call
// though - "recent sold listings" come from PokemonPriceTracker's own
// data instead, and a plain eBay URL from there earns nothing on a click.
// This appends the identical tracking suffix manually so those links are
// covered too. PokemonPriceTracker's sold-comp URLs are consistently
// plain ebay.com (US) links regardless of which marketplace the matched
// deal itself is on, so the US rotation ID used here is correct even for
// a GB/AU/CA/DE deal's sold comps.
//
// `customid` carries the EPN sub-ID: a fixed, privacy-safe surface enum
// (see lib/affiliateSurfaces.js) - e.g. "home_best", "search", "card" -
// never a card/listing/deal/user identity or search query. This is
// deliberately a RENDER-TIME rewrite, not a scan-time one: the stored
// `deals.affiliate_url` is written once by the scanner (no user-facing
// surface exists yet at that point - see authHeaders' own note), and
// every page that shows that same stored deal calls this function again
// with its own `surface` right before rendering the CTA, so the SAME
// stored URL correctly carries a different customid on the homepage vs.
// /search vs. a card hub. `.searchParams.set()` (never `.append()`)
// guarantees exactly one `customid` and one `campid`, so re-wrapping an
// already-wrapped URL is always safe and idempotent.
//
// customid is set UNCONDITIONALLY, independent of EBAY_CAMPAIGN_ID being
// readable in this execution context - deliberately, because some
// callers of this function (e.g. DealCard, when it's rendered inside a
// "use client" page like /search's SearchClient) run in the BROWSER, not
// during SSR, where server-only env vars are never available. A client-
// side call still has a real, already-campid-bearing URL to work with
// (either eBay's own scan-time itemAffiliateWebUrl, or an earlier
// server-side wrap), so it can safely rewrite just customid without a
// fresh campaignId. The other EPN params below DO need a real
// campaignId to be meaningful (they'd otherwise either fabricate a
// tracking suffix from nothing, or blank out real ones already present)
// and are skipped - never blanked - when it isn't available.
function wrapEbayAffiliateUrl(url, { surface } = {}) {
  if (!url) return url;

  try {
    const wrapped = new URL(url);
    const campaignId = process.env.EBAY_CAMPAIGN_ID;
    if (campaignId) {
      wrapped.searchParams.set("mkevt", "1");
      wrapped.searchParams.set("mkcid", "1");
      wrapped.searchParams.set("mkrid", "711-53200-19255-0");
      wrapped.searchParams.set("campid", campaignId);
      wrapped.searchParams.set("toolid", "10049");
    }
    wrapped.searchParams.set("customid", affiliateSurface(surface));
    return wrapped.toString();
  } catch {
    return url;
  }
}

// The consumer-facing eBay domain per scanned marketplace. The singles
// category id (POKEMON_SINGLES_CATEGORY_ID) is the same across all of
// them (verified). "" / unknown -> ebay.com.
const EBAY_SEARCH_DOMAIN = {
  EBAY_US: "www.ebay.com",
  EBAY_GB: "www.ebay.co.uk",
  EBAY_AU: "www.ebay.com.au",
  EBAY_CA: "www.ebay.ca",
  EBAY_DE: "www.ebay.de",
  EBAY_IT: "www.ebay.it",
};

// A tracked eBay search link for "explore this specific card/variant"
// links (the catalogue "Find on eBay" CTA, a graded-tier tile, ...) -
// these invite a visitor to go look rather than point at one listing, so
// a category-scoped search is what makes sense. `marketplace` (e.g.
// "EBAY_AU") sends the visitor to the right eBay site - an AU-mode
// shopper should land on ebay.com.au, not a generic US search. Omitted /
// "" / unknown -> ebay.com (the safe default and the crawler-visible SSR
// value before the client knows the region).
function buildEbaySearchLink(query, marketplace, surface) {
  const domain = EBAY_SEARCH_DOMAIN[marketplace] ?? "www.ebay.com";
  const url = new URL(`https://${domain}/sch/i.html`);
  url.searchParams.set("_nkw", query);
  url.searchParams.set("_sacat", POKEMON_SINGLES_CATEGORY_ID);
  return wrapEbayAffiliateUrl(url.toString(), { surface });
}

module.exports = {
  POKEMON_SINGLES_CATEGORY_ID,
  MARKETPLACES,
  EBAY_SEARCH_DOMAIN,
  upscaleEbayImage,
  primaryListingImage,
  allListingImages,
  wrapEbayAffiliateUrl,
  buildEbaySearchLink,
};
