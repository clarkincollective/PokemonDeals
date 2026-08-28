// Protects the contract the "don't wipe the fallback pool on a degraded
// eBay response" fix depends on:
//   - searchListings returns { listings, total }
//   - total is eBay's count when present, null when the field is absent
//   - the scanners' reconcile guard skips expiry only on (empty && null total)
//
// Mocks global.fetch so no eBay traffic is generated.

process.env.EBAY_CLIENT_ID = "test-id";
process.env.EBAY_CLIENT_SECRET = "test-secret";

import { test } from "node:test";
import assert from "node:assert/strict";
import { searchListings } from "../../lib/ebay.js";

function mockFetch(searchBody) {
  return async (url) => {
    const u = String(url);
    if (u.includes("/identity/v1/oauth2/token")) {
      return new Response(JSON.stringify({ access_token: "tok", expires_in: 7200 }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    if (u.includes("/buy/browse/v1/item_summary/search")) {
      return new Response(JSON.stringify(searchBody), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    throw new Error(`unexpected fetch in test: ${u}`);
  };
}

test("normal response -> { listings, total }", async () => {
  global.fetch = mockFetch({
    total: 42,
    itemSummaries: [
      {
        itemId: "v1|1|0",
        title: "Charizard",
        price: { value: "10.00" },
        image: { imageUrl: "http://x/s-l225.jpg" },
        itemWebUrl: "http://ebay/1",
        buyingOptions: ["FIXED_PRICE"],
        condition: "Ungraded",
      },
      {
        itemId: "v1|2|0",
        title: "Pikachu",
        price: { value: "5.00" },
        itemWebUrl: "http://ebay/2",
        buyingOptions: ["FIXED_PRICE"],
        condition: "Ungraded",
      },
    ],
  });
  const res = await searchListings("charizard", "EBAY_US", {});
  assert.equal(res.total, 42);
  assert.equal(res.listings.length, 2);
  assert.equal(res.listings[0].listingId, "v1|1|0");
});

test("genuine empty result -> total 0, listings []", async () => {
  global.fetch = mockFetch({ total: 0, itemSummaries: [] });
  const res = await searchListings("nothing", "EBAY_US", {});
  assert.equal(res.total, 0);
  assert.deepEqual(res.listings, []);
});

test("degraded/malformed body (no total) -> total null", async () => {
  global.fetch = mockFetch({});
  const res = await searchListings("degraded", "EBAY_US", {});
  assert.equal(res.total, null);
  assert.deepEqual(res.listings, []);
});

test("total present but itemSummaries missing -> listings [], total kept", async () => {
  global.fetch = mockFetch({ total: 7 });
  const res = await searchListings("weird", "EBAY_US", {});
  assert.equal(res.total, 7);
  assert.deepEqual(res.listings, []);
});

// The exact condition used in scanCardInMarketplace / scanProductInMarketplace.
// Expiry (marking a card's deals is_active=false) must run for every real
// result set and be SKIPPED only when the response is empty AND carried no
// total - i.e. a degraded eBay reply, which must not wipe cached inventory.
test("reconcile guard: expire on real results, skip only on empty+null", () => {
  const canReconcile = (listings, total) => listings.length > 0 || total !== null;
  assert.equal(canReconcile([{}], null), true); // matched a listing this scan
  assert.equal(canReconcile([], 0), true); // eBay confirmed "nothing for sale"
  assert.equal(canReconcile([], 500), true); // real result set, none qualified
  assert.equal(canReconcile([], null), false); // degraded reply -> do NOT wipe
});
