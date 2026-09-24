// AUDIT 2026-09-23, FINDING 6 — duplicate marketplace rows inflating the
// number of buying options.
//
// Pure functions and source-shape assertions only. No network call, no
// database read, no affiliate URL requested, no scan.
//
// THE POPULATION, measured read-only on live records 2026-09-24 through
// the existing display gate (active, source = ebay):
//   1,103 stored rows          998 distinct eBay listings
//   88 listings stored for 2+ marketplaces, 105 surplus rows
//   75 of 637 card hubs overstating their option count
//   0 listings with several variation ids, 0 displayable rows without one
// and in rendered production the Magneton hub said "12 active listings"
// and "View 12 offers" over 6 real listings, one of them stored four times.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const require = createRequire(import.meta.url);
const read = (p) => readFileSync(join(ROOT, p), "utf8");
const L = require(join(ROOT, "lib", "listingIdentity.js"));

// A row shaped like the real ones, with only the fields the rule reads.
const row = (over = {}) => ({
  id: 1,
  listing_id: "v1|397683212966|0",
  marketplace: "EBAY_US",
  item_location_country: "US",
  currency: "USD",
  total_price: 30,
  total_price_usd: 30,
  shipping: 0,
  ...over,
});

// === 1. the same item across multiple regional records =================

test("DL-1. one eBay listing stored for four marketplaces is ONE buying option", () => {
  // The real Magneton group, 2026-09-24.
  const copies = [
    row({ id: 101, marketplace: "EBAY_AU", currency: "AUD", total_price: 72.24, total_price_usd: 51.0, shipping: 14 }),
    row({ id: 102, marketplace: "EBAY_US", currency: "USD", total_price: 30, total_price_usd: 30, shipping: 0 }),
    row({ id: 103, marketplace: "EBAY_CA", currency: "CAD", total_price: 42.31, total_price_usd: 30.02, shipping: 0 }),
    row({ id: 104, marketplace: "EBAY_GB", currency: "GBP", total_price: 39.87, total_price_usd: 52.9, shipping: 9 }),
  ];
  assert.equal(L.countDistinctListings(copies), 1);
  const out = L.dedupeListings(copies);
  assert.equal(out.length, 1, "four regional rows are one buying option");
  assert.equal(new Set(copies.map(L.listingIdentityKey)).size, 1);
});

test("DL-2. the marketplace is not part of the identity; the variation is", () => {
  assert.equal(
    L.listingIdentityKey(row({ marketplace: "EBAY_US" })),
    L.listingIdentityKey(row({ marketplace: "EBAY_IT" }))
  );
  // two cards sold as variations of one listing are two real offers
  assert.notEqual(
    L.listingIdentityKey(row({ listing_id: "v1|123|0" })),
    L.listingIdentityKey(row({ listing_id: "v1|123|1" }))
  );
  assert.equal(L.countDistinctListings([row({ id: 1, listing_id: "v1|123|0" }), row({ id: 2, listing_id: "v1|123|1" })]), 2);
});

// === 2. distinct items for the same card must NOT collapse =============

test("DL-3. two different listings of the same card stay two options", () => {
  const a = row({ id: 1, listing_id: "v1|111|0" });
  const b = row({ id: 2, listing_id: "v1|222|0" });
  assert.equal(L.countDistinctListings([a, b]), 2);
  assert.equal(L.dedupeListings([a, b]).length, 2);
});

test("DL-4. grouping is never by card, title, seller or image", () => {
  const src = read("lib/listingIdentity.js");
  // the key function reads listing_id and the row id, and nothing else
  const fn = src.slice(src.indexOf("function listingIdentityKey"), src.indexOf("const hasKnownListingIdentity"));
  assert.doesNotMatch(fn, /card_|title|seller|image|watchlist|price/);
  // two rows that agree on card, title, seller and image but are different
  // listings remain different options
  const same = { card_tcgplayer_id: "107003", title: "Magneton Base Set", seller: "x", image_url: "i.jpg" };
  assert.equal(L.countDistinctListings([row({ id: 1, listing_id: "v1|1|0", ...same }), row({ id: 2, listing_id: "v1|2|0", ...same })]), 2);
});

// === 3. currencies and shipping bases ==================================

test("DL-5. the chosen copy is never 'the cheapest number' — it is one whole copy", () => {
  // The real Pikachu ex group, 2026-09-24: the US copy is the home market
  // at USD 99 with free shipping; the CA copy converts to USD 98.82, 18
  // cents lower, on a Canadian delivery basis. Picking on the number alone
  // would quote the wrong basis for an 0.2% difference.
  const copies = [
    row({ id: 43597, marketplace: "EBAY_US", currency: "USD", total_price: 99, total_price_usd: 99, shipping: 0, item_location_country: "US" }),
    row({ id: 43586, marketplace: "EBAY_CA", currency: "CAD", total_price: 139.23, total_price_usd: 98.82, shipping: 0, item_location_country: "US" }),
    row({ id: 43587, marketplace: "EBAY_AU", currency: "AUD", total_price: 179.61, total_price_usd: 126.93, shipping: 24.9, item_location_country: "US" }),
  ];
  const chosen = L.chooseListingCopy(copies);
  assert.equal(chosen.marketplace, "EBAY_US", "the listing's home market, not the lowest converted total");
  assert.notEqual(chosen.total_price_usd, Math.min(...copies.map((c) => c.total_price_usd)));
});

test("DL-6. price, currency and shipping all come from the SAME chosen row", () => {
  const copies = [
    row({ id: 1, marketplace: "EBAY_CA", currency: "CAD", total_price: 317.3, total_price_usd: 225.21, shipping: 0, item_location_country: "AU" }),
    row({ id: 2, marketplace: "EBAY_AU", currency: "AUD", total_price: 391.32, total_price_usd: 276.55, shipping: 39.71, item_location_country: "AU" }),
  ];
  const [out] = L.dedupeListings(copies);
  const source = copies.find((c) => c.id === out.id);
  for (const field of ["marketplace", "currency", "total_price", "total_price_usd", "shipping", "item_location_country"]) {
    assert.equal(out[field], source[field], `${field} must come from the chosen copy`);
  }
  // no field is mixed in from the other copy
  assert.notEqual(out.total_price, copies.find((c) => c.id !== out.id).total_price);
});

test("DL-7. regional availability survives the collapse", () => {
  const copies = [
    row({ id: 1, marketplace: "EBAY_US", item_location_country: "US" }),
    row({ id: 2, marketplace: "EBAY_CA", item_location_country: "US" }),
    row({ id: 3, marketplace: "EBAY_AU", item_location_country: "US" }),
  ];
  const [out] = L.dedupeListings(copies);
  assert.equal(out.marketplace, "EBAY_US");
  assert.deepEqual(out.regional_alternatives, ["EBAY_CA", "EBAY_AU"]);
  // a single-marketplace listing carries no such note at all
  assert.equal(L.dedupeListings([row({ id: 9 })])[0].regional_alternatives, undefined);
});

// === 4. the site's existing marketplace preference =====================

test("DL-8. the reader's own marketplace scope wins when they have chosen one", () => {
  const copies = [
    row({ id: 1, marketplace: "EBAY_US", item_location_country: "US" }),
    row({ id: 2, marketplace: "EBAY_GB", item_location_country: "US" }),
  ];
  assert.equal(L.chooseListingCopy(copies).marketplace, "EBAY_US", "home market by default");
  assert.equal(L.chooseListingCopy(copies, { prefer: "EBAY_GB" }).marketplace, "EBAY_GB", "reader's scope wins");
  // a preference with no copy is ignored rather than dropping the listing
  assert.equal(L.chooseListingCopy(copies, { prefer: "EBAY_IT" }).marketplace, "EBAY_US");
});

test("DL-9. selection is deterministic and total", () => {
  const copies = [
    row({ id: 5, marketplace: "EBAY_DE", item_location_country: null }),
    row({ id: 3, marketplace: "EBAY_IT", item_location_country: null }),
  ];
  // no home market -> the fixed preference order, then the lowest row id
  for (let i = 0; i < 5; i++) assert.equal(L.chooseListingCopy(copies).marketplace, "EBAY_DE");
  const unknown = [row({ id: 7, marketplace: "EBAY_ZZ", item_location_country: null }), row({ id: 4, marketplace: "EBAY_ZZ", item_location_country: null })];
  assert.equal(L.chooseListingCopy(unknown).id, 4, "unknown marketplaces fall back to the lowest row id");
});

// === 5. missing or ambiguous identity ==================================

test("DL-10. a row with no listing_id never merges with anything", () => {
  const a = row({ id: 1, listing_id: null });
  const b = row({ id: 2, listing_id: null });
  const c = row({ id: 3, listing_id: undefined });
  const d = row({ id: 4, listing_id: "   " });
  assert.equal(L.countDistinctListings([a, b, c, d]), 4, "unknown identity is not a shared identity");
  assert.equal(L.dedupeListings([a, b, c, d]).length, 4);
  assert.equal(L.hasKnownListingIdentity(a), false);
  assert.equal(L.hasKnownListingIdentity(row()), true);
  assert.equal(L.listingIdentityKey(null), null);
});

// === 6. counts match the options actually displayed ====================

test("DL-11. the hub grid and its count come from the same deduplicated array", () => {
  const src = read("lib/deals.js");
  const fn = src.slice(src.indexOf("async function fetchCardOffersUncached"), src.indexOf("// Sold-item freshness"));
  assert.match(fn, /dedupeListings\(displayable\(data\)\)/);
  // the old shape - sort first, then keep the first row per key - is gone
  assert.doesNotMatch(fn, /const seen = new Set\(\)/);
  // and every number the card page prints reads that same array
  const page = read("app/cards/[slug]/page.js");
  assert.match(page, /const allOffers = offers;/);
  assert.match(page, /\{offers\.length\} active \{offers\.length === 1 \? "listing" : "listings"\}/);
  assert.match(page, /View \{allOffers\.length\} \{allOffers\.length === 1 \? "offer" : "offers"\}/);
});

test("DL-12. the filtered card grid uses the same rule and honours the country scope", () => {
  const src = read("lib/deals.js");
  const fn = src.slice(src.indexOf("async function fetchCardDealsPageUncached"), src.indexOf("// Same per-card tags as fetchCardOffers"));
  assert.match(fn, /dedupeListings\(eligible, \{ prefer: country \|\| null \}\)/);
  assert.doesNotMatch(fn, /const seen = new Set\(\)/);
});

test("DL-13. the compare chip counts buying options, not stored rows", () => {
  assert.match(read("lib/deals.js"), /out\[h\.id\] = \{ count: h\.listingCount \?\? h\.count, slug: h\.slug \}/);
});

test("DL-14. the set and species tiles show buying options", () => {
  assert.match(read("components/SetsFilterList.js"), /s\.listingCount \?\? s\.count/);
  assert.match(read("app/pokemon/page.js"), /deal\?\.listingCount \?\? deal\?\.count \?\? 0/);
});

// === 7. one shared rule, and the scope it was kept inside ==============

test("DL-15. there is ONE grouping rule; the old marketplace-keyed one is gone", () => {
  assert.doesNotMatch(read("lib/speciesDealScope.js"), /\$\{deal\.marketplace \?\? "\?"\}:/);
  assert.match(read("lib/speciesDealScope.js"), /listingIdentityKey\(deal\)/);
  // /deals keeps its behaviour by importing the same functions it used to define
  const inv = read("lib/allDealsInventory.js");
  assert.match(inv, /from "\.\/listingIdentity\.js"/);
  assert.match(inv, /export const chooseListingCopy = listingIdentity\.chooseListingCopy/);
  assert.match(inv, /const listingKey = listingIdentity\.listingIdentityKey/);
});

test("DL-16. nothing was deleted, no ingestion changed, no scan forced", () => {
  const src = read("lib/listingIdentity.js");
  assert.doesNotMatch(src, /\.update\(|\.insert\(|\.upsert\(|\.delete\(|\.rpc\(|fetch\(|supabase/);
  // the correction is presentation/query layer only
  const audit = read("scripts/integrity/auditDuplicateListings.mjs");
  assert.doesNotMatch(audit, /\.update\(|\.insert\(|\.upsert\(|\.delete\(|\.rpc\(/);
});

test("DL-17. membership thresholds still read the ROW count, so no page appears or disappears", () => {
  const agg = read("lib/catalogAggregates.js");
  assert.match(agg, /if \(w\.count < CARD_HUB_MIN_LISTINGS\) continue;/);
  assert.match(agg, /\.filter\(\(\[, count\]\) => count >= SET_MIN_LISTINGS\)/);
  assert.match(agg, /if \(g\.count < SPECIES_MIN_LISTINGS\) continue;/);
  // and the reason is written down with its measurement
  assert.match(agg, /36 card hubs and 4 set pages/);
});

// === 8. attribution and price qualifiers survive row selection =========

test("DL-18. the chosen row keeps its own destination and affiliate attribution", () => {
  const copies = [
    row({ id: 1, marketplace: "EBAY_US", item_location_country: "US", affiliate_url: "https://www.ebay.com/itm/397683212966?campid=5339197414&customid=card-offer" }),
    row({ id: 2, marketplace: "EBAY_GB", item_location_country: "US", affiliate_url: "https://www.ebay.co.uk/itm/397683212966?campid=5339197414&customid=card-offer" }),
  ];
  const [out] = L.dedupeListings(copies);
  assert.equal(out.affiliate_url, copies[0].affiliate_url, "the destination belongs to the chosen copy");
  const u = new URL(out.affiliate_url);
  assert.equal(u.searchParams.get("campid"), "5339197414");
  assert.equal(u.searchParams.get("customid"), "card-offer");
  // dedupe touches no affiliate field
  assert.doesNotMatch(read("lib/listingIdentity.js"), /affiliate|customid|campid|subId1/);
});

test("DL-19. the savings qualifier travels with the row it was computed from", () => {
  // A copy that can evidence a saving and one that cannot must never be
  // mixed: whichever copy is chosen, its own discount/market fields are
  // what the presentation gates then read.
  const copies = [
    row({ id: 1, marketplace: "EBAY_US", item_location_country: "US", market_price: 72.99, discount_pct: 0.31, shipping: 0 }),
    row({ id: 2, marketplace: "EBAY_AU", item_location_country: "US", market_price: null, discount_pct: null, shipping: null }),
  ];
  const [out] = L.dedupeListings(copies);
  assert.equal(out.market_price, 72.99);
  assert.equal(out.discount_pct, 0.31);
  assert.equal(out.shipping, 0);
  // reversed home market -> the other copy, and its nulls come with it
  const flipped = copies.map((c) => ({ ...c, item_location_country: "AU" }));
  const [out2] = L.dedupeListings(flipped);
  assert.equal(out2.marketplace, "EBAY_AU");
  assert.equal(out2.market_price, null);
  assert.equal(out2.discount_pct, null);
});

test("DL-20. the collapsed regional options are stated, not silently dropped", () => {
  const card = read("components/DealCard.js");
  assert.match(card, /regional_alternatives/);
  assert.match(card, /Same listing, also on/);
  assert.match(card, /prices differ by site/);
});

// === 9. the fields the rule needs must actually be selected ============
//
// Found in production on 2026-09-24: the first cron run after the fix
// wrote listingCount = 1 for EVERY set, because the aggregate query
// selected neither `id` nor `listing_id`, so every row keyed identically.
// A grouping rule is only as good as the columns it is handed.

test("DL-21. every query feeding computeAggregates selects the identity columns", () => {
  const deals = read("lib/deals.js");
  for (const name of ["AGGREGATE_SELECT", "AGGREGATE_SELECT_LEGACY"]) {
    const i = deals.indexOf(`const ${name} =`);
    assert.ok(i > -1, `${name} not found`);
    const decl = deals.slice(i, deals.indexOf(";", i));
    assert.match(decl, /\bid\b/, `${name} must select id`);
    assert.match(decl, /\blisting_id\b/, `${name} must select listing_id`);
  }
  const route = read("app/api/refresh-catalog/route.js");
  for (const name of ["SELECT", "SELECT_LEGACY"]) {
    const i = route.indexOf(`const ${name} =`);
    assert.ok(i > -1, `${name} not found`);
    const decl = route.slice(i, route.indexOf(";", i));
    assert.match(decl, /"id, listing_id,/, `${name} must select id and listing_id first`);
  }
});

test("DL-22. rows with no identity at all still count as separate options", () => {
  // The exact shape the broken query produced: no listing_id, no id.
  const blind = [{ marketplace: "EBAY_US" }, { marketplace: "EBAY_GB" }, { marketplace: "EBAY_CA" }];
  assert.equal(L.countDistinctListings(blind), 3, "unknown identity must never collapse to one");
  assert.equal(L.dedupeListings(blind).length, 3);
  // and the key is stable for a given position, so the count is deterministic
  assert.equal(L.listingIdentityKey(blind[0], 0), L.listingIdentityKey(blind[0], 0));
  assert.notEqual(L.listingIdentityKey(blind[0], 0), L.listingIdentityKey(blind[1], 1));
});

test("DL-23. computeAggregates produces a listingCount that is never a silent 1", () => {
  const agg = read("lib/catalogAggregates.js");
  // it reads the shared rule, not a local one
  assert.match(agg, /import \{ listingIdentityKey, hasKnownListingIdentity \} from "@\/lib\/listingIdentity"/);
  assert.equal((agg.match(/listingIdentityKey\(row\)/g) ?? []).length, 5, "sets, card hubs (x2) and species (x2)");
  // and every aggregate emits it, through the fail-safe wrapper (DL-25)
  for (const call of ["setListings.get(set).size)", "listings.size)", "g.listings.size))"]) {
    assert.ok(agg.includes(call), `missing ${call}`);
  }
});

// === 10. the number must SURVIVE the trip to the tile ==================
//
// DL-14 checked that the tile reads `listingCount`, and DL-23 that the
// aggregate emits it - and the badge was still wrong, because the page in
// between rebuilt each row as {set, slug, count} and dropped the field.
// Checking the two ends of a pipe does not check the pipe.

test("DL-24. every page that reshapes an aggregate row carries listingCount through", () => {
  const sets = read("app/sets/page.js");
  assert.match(sets, /bySlug\.set\(s\.slug, \{ set: s\.set, slug: s\.slug, count: s\.count, listingCount: s\.listingCount \}\)/);
  assert.doesNotMatch(sets, /\{ set: s\.set, slug: s\.slug, count: s\.count \}/, "the field must not be dropped again");

  const pokemon = read("app/pokemon/page.js");
  assert.match(pokemon, /dealBySpecies\.set\(h\.name, \{ slug: h\.slug, count: h\.count, listingCount: h\.listingCount \}\)/);
  assert.doesNotMatch(pokemon, /\{ slug: h\.slug, count: h\.count \}/, "the field must not be dropped again");
});

test("DL-25. a count that could not be computed is omitted, never published as 1", () => {
  // The exact live situation on 2026-09-24: an older writer produced a
  // snapshot whose every listingCount was 1. A wrong number is worse than
  // a missing one - the tile treats 1 as real and shows it, while a
  // missing field falls back to `count`.
  const agg = read("lib/catalogAggregates.js");
  assert.match(agg, /const identityKnown = rows\.some\(\(r\) => hasKnownListingIdentity\(r\)\)/);
  assert.match(agg, /const withListingCount = \(obj, size\) => \(identityKnown \? \{ \.\.\.obj, listingCount: size \} : obj\)/);
  // every emission site goes through it - no raw `listingCount:` remains
  const body = agg.slice(agg.indexOf("export function computeAggregates"));
  assert.equal((body.match(/withListingCount\(/g) ?? []).length, 3, "sets, card hubs and species all go through it");
  assert.doesNotMatch(body, /listingCount: (setListings|listings|g\.listings)/, "no emission bypasses the fail-safe");
});
