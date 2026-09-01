// SEO Phase 6A closeout - global currency consistency + savings-math
// integrity. Pure unit tests for lib/money's conversion helpers: a
// comparison block ("A$120 · typical A$180 · 33% below") must be one
// currency, and currency conversion must never change the percentage.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  refInListingCurrency,
  toViewerCurrency,
  formatMoney,
  MARKETPLACE_CURRENCY,
  currencyForDeal,
} from "../../lib/money.js";

const RATES = { USD: 1, GBP: 0.79, EUR: 0.92, AUD: 1.52, CAD: 1.36 };

// A realistic GBP deal row (matches production: total_price GBP,
// total_price_usd the scan-time conversion, market_price USD).
const gbpDeal = {
  currency: "GBP",
  marketplace: "EBAY_GB",
  total_price: 65.82,
  total_price_usd: 89.40019558839509,
  market_price: 145.26,
  discount_pct: 0.3845504916123152,
  listing_type: "FIXED_PRICE",
};
const usdDeal = {
  currency: "USD",
  marketplace: "EBAY_US",
  total_price: 40,
  total_price_usd: 40,
  market_price: 60,
  discount_pct: 1 / 3,
  listing_type: "FIXED_PRICE",
};

test("refInListingCurrency: USD listing -> the USD reference unchanged", () => {
  assert.equal(refInListingCurrency(60, 40, 40, "USD"), 60);
  assert.equal(refInListingCurrency(150.5, 100, 100, "USD"), 150.5);
});

test("refInListingCurrency: non-USD listing -> reference in the listing's currency via the scan-time rate", () => {
  const ref = refInListingCurrency(
    gbpDeal.market_price,
    gbpDeal.total_price,
    gbpDeal.total_price_usd,
    "GBP"
  );
  // 145.26 * (65.82 / 89.400...) = 106.945...
  assert.ok(Math.abs(ref - 145.26 * (65.82 / 89.40019558839509)) < 1e-9);
  // and it's below the listing? no - it's the reference, ABOVE the listing
  assert.ok(ref > gbpDeal.total_price, "reference should sit above the listing price for a real deal");
});

test("refInListingCurrency: returns null (never a mislabelled number) when the scan-time rate can't be recovered", () => {
  assert.equal(refInListingCurrency(145.26, 65.82, 65.82, "GBP"), null); // native == usd -> rate 1, impossible for GBP
  assert.equal(refInListingCurrency(145.26, 0, 89.4, "GBP"), null);
  assert.equal(refInListingCurrency(145.26, 65.82, 0, "GBP"), null);
  assert.equal(refInListingCurrency(0, 65.82, 89.4, "GBP"), null);
  assert.equal(refInListingCurrency(null, 65.82, 89.4, "GBP"), null);
});

test("§4 the savings percentage is INVARIANT under currency conversion (native scan-time rate)", () => {
  for (const d of [gbpDeal, usdDeal]) {
    const native = currencyForDeal(d);
    const marketNative = refInListingCurrency(d.market_price, d.total_price, d.total_price_usd, native);
    // USD side
    const pctUsd = (d.market_price - d.total_price_usd) / d.market_price;
    // native side (listing price is total_price, ref is marketNative)
    const pctNative = (marketNative - d.total_price) / marketNative;
    assert.ok(Math.abs(pctUsd - pctNative) < 1e-9, `${native}: ${pctUsd} vs ${pctNative}`);
    // and both equal the stored discount_pct
    assert.ok(Math.abs(pctUsd - d.discount_pct) < 1e-6);
  }
});

test("§4 invariance also holds under a LIVE viewer conversion (same FX rate both sides)", () => {
  // USD listing 100, USD ref 150 -> 33.33%. Convert BOTH to AUD with one rate.
  const listingUsd = 100;
  const refUsd = 150;
  for (const ccy of ["GBP", "EUR", "AUD", "CAD"]) {
    const listing = toViewerCurrency(listingUsd, ccy, RATES);
    const ref = toViewerCurrency(refUsd, ccy, RATES);
    const pct = (ref - listing) / ref;
    assert.ok(Math.abs(pct - (refUsd - listingUsd) / refUsd) < 1e-9, `${ccy}`);
    assert.ok(Math.abs(pct - 1 / 3) < 1e-9);
  }
});

test("§21 percentage is computed from numbers, not formatted strings (formatMoney is display-only)", () => {
  // formatMoney rounds to 2dp and adds a symbol - never feed it back into math
  assert.equal(formatMoney(106.945123, "GBP"), "£106.95");
  assert.equal(formatMoney(1851.839, "AUD"), "A$1,851.84");
  assert.equal(formatMoney(60, "USD"), "$60.00");
  // the % the components display comes from deal.discount_pct (a raw
  // number) - proven above - not from parsing "£106.95"
});

test("§16 rounding: 2 decimal places, thousands separators, correct dollar prefix per currency", () => {
  assert.equal(formatMoney(1234.5, "USD"), "$1,234.50");
  assert.equal(formatMoney(1234.5, "AUD"), "A$1,234.50");
  assert.equal(formatMoney(1234.5, "CAD"), "C$1,234.50");
  assert.equal(formatMoney(1234.5, "GBP"), "£1,234.50");
  assert.equal(formatMoney(1234.5, "EUR"), "€1,234.50");
});

test("§8 marketplace -> currency mapping for all six supported markets", () => {
  assert.deepEqual(MARKETPLACE_CURRENCY, {
    EBAY_US: "USD",
    EBAY_GB: "GBP",
    EBAY_AU: "AUD",
    EBAY_CA: "CAD",
    EBAY_DE: "EUR",
    EBAY_IT: "EUR",
  });
  assert.equal(currencyForDeal({ marketplace: "EBAY_AU" }), "AUD");
  assert.equal(currencyForDeal({ marketplace: "EBAY_IT" }), "EUR");
  assert.equal(currencyForDeal({ currency: "GBP", marketplace: "EBAY_US" }), "GBP"); // explicit currency wins
  assert.equal(currencyForDeal({}), "USD"); // fallback
});

test("§20 the reported production regression: an AUD deal's ref is expressed in AUD, not left as USD", () => {
  // reconstruct the A$186.68 sealed auction shape (scan rate ~1.52)
  const total = 186.68;
  const marketUsd = 237.87;
  const totalUsd = total / 1.52; // ~122.8
  const refAud = refInListingCurrency(marketUsd, total, totalUsd, "AUD");
  assert.ok(refAud != null && refAud > total, "ref must resolve to an AUD number above the bid");
  // both figures now format in the SAME currency
  const listingStr = formatMoney(total, "AUD");
  const refStr = formatMoney(refAud, "AUD");
  assert.ok(listingStr.startsWith("A$") && refStr.startsWith("A$"), `${listingStr} / ${refStr}`);
  assert.ok(!refStr.startsWith("$") || refStr.startsWith("A$"), "ref must not be a bare USD $");
});

test("§15 FX-failure: with no rates, toViewerCurrency returns the USD amount unchanged (fail closed to one currency)", () => {
  assert.equal(toViewerCurrency(100, "AUD", null), 100);
  assert.equal(toViewerCurrency(100, "AUD", {}), 100);
  assert.equal(toViewerCurrency(100, "AUD", { AUD: 0 }), 100);
  assert.equal(toViewerCurrency(100, "USD", RATES), 100);
});
