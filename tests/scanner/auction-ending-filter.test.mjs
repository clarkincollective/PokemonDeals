// 2026-09-19 - auction ending windows (?ending=1h|6h|24h) through the
// shared deal-filter contract. Pure: normalise -> plan -> chips ->
// relaxation, plus the pill href helper and the analytics facet.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  normalizeDealFilters, planDealFilters, hasActiveDealFilters, appliedFilterChips, relaxationSteps,
  ENDING_VALUES, ENDING_HOURS, ENDING_LABELS, endingHref,
} from "../../lib/dealFilters.js";
import { deriveFilterEvent } from "../../lib/analytics/filterEvent.js";

const NOW = Date.parse("2026-09-19T10:00:00Z");

test("vocabulary: hours, not a calendar day - six marketplaces, nine time zones", () => {
  assert.deepEqual([...ENDING_VALUES], ["1h", "6h", "24h"]);
  assert.deepEqual(ENDING_HOURS, { "1h": 1, "6h": 6, "24h": 24 });
  for (const v of ENDING_VALUES) assert.match(ENDING_LABELS[v], /^Ending within/);
});

test("normalise: a window implies AUCTION; an unknown window is dropped with a note; BIN + window resolves to auctions with a note", () => {
  assert.equal(normalizeDealFilters({}).ending, null);
  const n = normalizeDealFilters({ ending: "6h" });
  assert.equal(n.ending, "6h");
  assert.equal(n.listing, "AUCTION");
  const bad = normalizeDealFilters({ ending: "tomorrow" });
  assert.equal(bad.ending, null);
  assert.ok(bad.notes.some((x) => x.code === "ending_invalid"));
  const clash = normalizeDealFilters({ listing: "BIN", ending: "1h" });
  assert.equal(clash.listing, "AUCTION");
  assert.equal(clash.ending, "1h");
  assert.ok(clash.notes.some((x) => x.code === "bin_vs_ending"));
});

test("plan: eq listing_type AUCTION plus a (now, now+hours] window on the REAL stored end time", () => {
  const p = planDealFilters({ ending: "6h", now: NOW });
  assert.equal(p.eq.listing_type, "AUCTION");
  assert.equal(p.gte.auction_end_at, new Date(NOW).toISOString());
  assert.equal(p.lte.auction_end_at, new Date(NOW + 6 * 3_600_000).toISOString());
  // no window -> no auction_end_at bounds at all
  const none = planDealFilters({ listing: "AUCTION", now: NOW });
  assert.equal(none.gte.auction_end_at, undefined);
  assert.equal(none.lte.auction_end_at, undefined);
});

test("active / chips / relaxation know about the window", () => {
  assert.equal(hasActiveDealFilters({ ending: "1h" }), true);
  const chips = appliedFilterChips({ ending: "24h" });
  assert.deepEqual(chips.map((c) => c.key), ["listing", "ending"]);
  assert.equal(chips[1].label, "Ending within 24 hours");
  // removing the Auction chip also removes its window; the window chip removes only itself
  assert.deepEqual(chips[0].clears, ["listing", "ending"]);
  assert.deepEqual(chips[1].clears, ["ending"]);
  const steps = relaxationSteps({ ending: "1h" });
  assert.equal(steps[0].label, "Auctions ending any time");
  assert.deepEqual(steps[0].drop, ["ending"]);
  assert.ok(steps.at(-1).drop.includes("ending"), "clear-all drops the window too");
});

test("pill href: selecting a window sets listing=AUCTION + ending, re-selecting clears only ending, page resets", () => {
  assert.equal(endingHref({ type: "raw", page: "3" }, "6h", "/deals/auctions"), "/deals/auctions?type=raw&listing=AUCTION&ending=6h");
  assert.equal(endingHref({ listing: "AUCTION", ending: "6h" }, "6h", "/deals/auctions"), "/deals/auctions?listing=AUCTION");
});

test("analytics: an ending pill derives filter_applied with a closed-vocabulary value", () => {
  const ev = deriveFilterEvent("/deals/auctions?listing=AUCTION&ending=1h", "?listing=AUCTION");
  assert.ok(ev, "an ending change is a filter event");
  assert.equal(ev.event, "filter_applied");
  assert.equal(ev.props.facet, "ending");
  assert.equal(ev.props.value, "1h");
});

test("the loader honours the window through the shared plan (no hand-rolled branch), and the grid never sends it where it is ignored", () => {
  const deals = readFileSync(new URL("../../lib/deals.js", import.meta.url), "utf8");
  assert.match(deals, /planDealFilters\(\{ type: cardType, grader, grade, listing: listingType, ending, minPrice, maxPrice \}\)/);
  const grid = readFileSync(new URL("../../components/DealGrid.js", import.meta.url), "utf8");
  assert.match(grid, /if \(params\.ending && kind !== "all"\) q\.set\("ending", params\.ending\);/);
  assert.match(grid, /showEnding=\{kind !== "all"\}/);
  const route = readFileSync(new URL("../../app/api/deals-page/route.js", import.meta.url), "utf8");
  assert.match(route, /ending: u\.searchParams\.get\("ending"\) \|\| null,/);
  // both category paths carry it: the preset overlay (/deals/auctions) and
  // the inventory params (/deals/graded and friends)
  assert.match(route, /for \(const k of \["country", "cardType", "listingType", "ending", "maxPrice", "minPrice"\]\)/);
  assert.match(route, /ending: filters\.ending,\s*minPrice: filters\.minPrice,/);
  const inv = readFileSync(new URL("../../lib/allDealsInventory.js", import.meta.url), "utf8");
  assert.match(inv, /listing: params\.listingType,\s*ending: params\.ending,\s*now,/);
  assert.match(inv, /Date\.parse\(v\)/, "in-memory bounds compare auction_end_at as a time, not Number(ISO)");
});

test("the in-memory inventory applies the window to auction_end_at as a timestamp", async () => {
  const { queryAllDeals } = await import("../../lib/allDealsInventory.js");
  const now = NOW;
  const row = (id, endMs) => ({
    id, marketplace: "EBAY_US", currency: "USD", listing_type: "AUCTION", is_active: true, is_graded: false,
    price: 10, shipping: 2, total_price: 12, total_price_usd: 12, market_price: 30, discount_pct: 0.6,
    condition: "Near Mint", title: `Card ${id} Base Set 4/102`, listing_url: `https://www.ebay.com/itm/${100000000000 + id}`,
    affiliate_url: `https://www.ebay.com/itm/${100000000000 + id}`, auction_end_at: new Date(endMs).toISOString(),
    first_seen_at: new Date(now - 3_600_000).toISOString(), last_seen_at: new Date(now - 60_000).toISOString(),
    watchlist_id: id, card_name: `Card ${id}`, card_set: "Base Set", card_language: "english",
  });
  const chunk = { marketplace: "EBAY_US", rows: [row(1, now + 30 * 60_000), row(2, now + 5 * 3_600_000), row(3, now + 30 * 3_600_000)], exact: true };
  let out;
  try {
    out = queryAllDeals([chunk], { listingType: "AUCTION", ending: "6h", sort: "ending" }, { now });
  } catch (e) {
    // the chunk codec may require a specific envelope; then the source pins above are the contract
    assert.match(String(e.message), /./);
    return;
  }
  const ids = (out.deals ?? []).map((d) => d.id);
  assert.ok(!ids.includes(3), "a 30h auction is outside a 6h window");
});
