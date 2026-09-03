// Phase 12A - currency & financial-display integrity.
//
// A user (or a crawler, or a social preview) must never see a listing
// price in one currency compared, visually or in text, against a
// reference / savings / market price in another currency without explicit
// conversion. The Phase 6A architecture handles the hydrating UI
// (refInListingCurrency + <Price>); the confirmed defect was in
// region-agnostic STRINGS (meta description, OG/Twitter, Web-Share text,
// alert email) that prefixed the native `total_price` with a literal "$"
// next to the USD `market_price`.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import money from "../../lib/money.js";

const {
  dealTotalUsd,
  refInListingCurrency,
  viewerPricing,
  toViewerCurrency,
  formatMoney,
  symbolFor,
  currencyForDeal,
} = money;

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => readFileSync(join(ROOT, p), "utf8");

const RATES = { USD: 1, GBP: 0.79, EUR: 0.92, AUD: 1.52, CAD: 1.36 };

// a deal row like the DB stores: total_price NATIVE, total_price_usd USD,
// market_price USD.
const deal = (over = {}) => ({
  marketplace: "EBAY_AU",
  currency: "AUD",
  total_price: 121.6, // A$121.60
  total_price_usd: 80, // $80.00
  market_price: 100, // $100.00 (USD reference)
  discount_pct: 0.2,
  ...over,
});

// === dealTotalUsd: the canonical-USD asking price ================

test("dealTotalUsd returns the stored USD total for a non-USD listing", () => {
  assert.equal(dealTotalUsd(deal()), 80);
  assert.equal(dealTotalUsd(deal({ marketplace: "EBAY_CA", currency: "CAD", total_price: 685, total_price_usd: 493.23 })), 493.23);
});

test("dealTotalUsd returns total_price for a USD listing", () => {
  assert.equal(dealTotalUsd(deal({ marketplace: "EBAY_US", currency: "USD", total_price: 74.99, total_price_usd: 74.99 })), 74.99);
  // legacy USD row with no stored usd total
  assert.equal(dealTotalUsd({ marketplace: "EBAY_US", currency: "USD", total_price: 50 }), 50);
});

test("dealTotalUsd returns null for a non-USD listing with no trustworthy USD total", () => {
  assert.equal(dealTotalUsd({ marketplace: "EBAY_GB", currency: "GBP", total_price: 40 }), null);
  assert.equal(dealTotalUsd({ marketplace: "EBAY_AU", currency: "AUD", total_price: 100, total_price_usd: 0 }), null);
  assert.equal(dealTotalUsd(null), null);
});

// === the region-agnostic string builders are single-currency =====

test("deals/[id] meta description: both money figures are USD, native total_price is NOT interpolated with $", () => {
  const src = read("app/deals/[id]/page.js");
  const gen = src.slice(src.indexOf("export async function generateMetadata"), src.indexOf("export default"));
  // the description line must use dealTotalUsd + the USD market_price
  assert.match(gen, /const listingUsd = dealTotalUsd\(deal\)/);
  assert.match(gen, /\$\$\{marketUsd\.toFixed\(2\)\} real market price/);
  // and must NOT put "$" in front of the native total_price
  assert.doesNotMatch(gen, /\$\$\{Number\(deal\.total_price\)\.toFixed/);
  assert.doesNotMatch(gen, /for \$\$\{Number\(deal\.total_price\)/);
});

test("sealed-deals/[id] meta description: same USD-only rule", () => {
  const src = read("app/sealed-deals/[id]/page.js");
  const gen = src.slice(src.indexOf("export async function generateMetadata"), src.indexOf("export default"));
  assert.match(gen, /dealTotalUsd\(deal\)/);
  assert.match(gen, /\$\$\{marketUsd\.toFixed\(2\)\} real market price/);
  assert.doesNotMatch(gen, /for \$\$\{Number\(\s*deal\.total_price\s*\)/);
});

test("Web-Share text (card + sealed deal pages, sealed card) never labels native total_price with $", () => {
  for (const p of ["app/deals/[id]/page.js", "app/sealed-deals/[id]/page.js", "components/SealedDealCard.js"]) {
    const src = read(p);
    assert.doesNotMatch(src, /text=\{`[^`]*\$\$\{Number\(deal\.total_price\)\.toFixed\(2\)\}[^`]*`\}/, p);
    assert.match(src, /dealTotalUsd\(deal\)/, `${p} should use dealTotalUsd in share text`);
  }
});

test("alert email: no bare $ on a native amount; comparison is single-currency", () => {
  const src = read("app/api/check-alerts/route.js");
  // untargeted line uses the listing's OWN symbol
  assert.match(src, /symbolFor\(currencyForDeal\(cheapest\)\)/);
  assert.match(src, /const nativeMoney = /);
  // targeted line is USD on BOTH sides (see alert-currency.test.mjs for full coverage)
  assert.match(src, /Current price: \$\{usdLine\} . Your target: \$\$\{targetUsd\.toFixed\(2\)\} USD/);
  // the old bug shapes are gone
  assert.doesNotMatch(src, /\$\$\{price\.toFixed\(2\)\}/);
  assert.doesNotMatch(src, /price <= Number\(a\.target_price\)/);
});

// === the hydrating UI comparison block is single-currency ========

for (const [ccy, sym, rate] of [["AUD", "A$", 1.52], ["CAD", "C$", 1.36], ["GBP", "£", 0.79], ["EUR", "€", 0.92], ["USD", "$", 1]]) {
  test(`${ccy}: listing / market ref / savings all render in ${ccy} on the SSR/first-paint block`, () => {
    const listingUsd = 80;
    const listingNative = +(listingUsd * rate).toFixed(2);
    const marketUsd = 100;
    const d = deal({ currency: ccy, marketplace: `EBAY_${ccy === "EUR" ? "DE" : ccy === "USD" ? "US" : ccy === "GBP" ? "GB" : ccy === "AUD" ? "AU" : "CA"}`, total_price: listingNative, total_price_usd: listingUsd, market_price: marketUsd });
    const native = currencyForDeal(d);
    assert.equal(native, ccy);
    const marketNative = refInListingCurrency(marketUsd, listingNative, listingUsd, native);
    // USD listing -> ref stays the USD number (symbol is "$"); others -> scaled into native
    if (ccy === "USD") {
      assert.equal(marketNative, marketUsd);
    } else {
      assert.ok(Math.abs(marketNative - marketUsd * rate) < 0.5, `${ccy} market ref ~= ${marketUsd * rate}`);
    }
    const savedNative = marketNative - listingNative;
    // every figure in the block formats with the SAME symbol
    const s = symbolFor(native);
    assert.equal(s, sym);
    for (const fig of [listingNative, marketNative, savedNative]) {
      assert.ok(formatMoney(fig, native).startsWith(sym), `${formatMoney(fig, native)} starts with ${sym}`);
    }
  });
}

test("refInListingCurrency returns null (never a mislabeled USD number) when the scan rate is unrecoverable", () => {
  assert.equal(refInListingCurrency(100, 80, 80, "AUD"), null); // native === usd
  assert.equal(refInListingCurrency(100, 0, 80, "AUD"), null);
  assert.equal(refInListingCurrency(100, 80, 0, "CAD"), null);
  assert.equal(refInListingCurrency(0, 80, 60, "GBP"), null); // no market ref
  assert.equal(refInListingCurrency(100, 80, 60, "USD"), 100); // USD -> unchanged
});

// === discount % is currency-invariant ===========================

test("discount % is identical whether computed in native or USD", () => {
  const listingUsd = 80;
  const marketUsd = 100;
  for (const rate of [1, 0.79, 1.36, 1.52, 0.92]) {
    const listingNative = listingUsd * rate;
    const marketNative = marketUsd * rate;
    const pctUsd = (marketUsd - listingUsd) / marketUsd;
    const pctNative = (marketNative - listingNative) / marketNative;
    assert.ok(Math.abs(pctUsd - pctNative) < 1e-9, `rate ${rate}: ${pctUsd} vs ${pctNative}`);
  }
});

// === no double conversion / no wrong-symbol fallback ============

test("toViewerCurrency converts a USD amount exactly once", () => {
  assert.equal(toViewerCurrency(100, "AUD", RATES), 152);
  assert.equal(toViewerCurrency(100, "USD", RATES), 100); // no-op for USD
  // feeding an already-converted amount back in would double it - callers
  // must always pass the USD value; verify the function itself is a single
  // multiply, not idempotent-guarded
  assert.equal(toViewerCurrency(toViewerCurrency(100, "AUD", RATES), "AUD", RATES), 152 * 1.52);
});

test("FX failure: missing/zero rate -> amount unchanged (USD), never a converted value under a foreign symbol", () => {
  assert.equal(toViewerCurrency(100, "AUD", {}), 100);
  assert.equal(toViewerCurrency(100, "AUD", { AUD: 0 }), 100);
  assert.equal(toViewerCurrency(100, "AUD", null), 100);
  // viewerPricing with no rates -> stays in the deal's native currency,
  // and only gives absolute market/saved for a USD-native deal
  const noConv = viewerPricing(deal({ currency: "AUD", marketplace: "EBAY_AU" }), "AUD", null);
  assert.equal(noConv.currency, "AUD");
  assert.equal(noConv.approx, false);
  assert.equal(noConv.market, null); // no USD ref shown under A$ without conversion
  const usdDeal = viewerPricing(deal({ currency: "USD", marketplace: "EBAY_US", total_price: 80, total_price_usd: 80 }), "USD", null);
  assert.equal(usdDeal.currency, "USD");
  assert.equal(usdDeal.market, 100);
});

test("<Price> convert guard: no conversion (and no foreign symbol) unless viewer, rates and a positive rate all exist", () => {
  const src = read("components/Price.js");
  // the guard must require every one of: viewer, rates, viewer !== native, finite usd, rates[viewer] > 0
  assert.match(src, /viewer &&\s*rates &&\s*viewer !== native\.currency &&\s*usd != null &&\s*Number\.isFinite\(Number\(usd\)\) &&\s*rates\[viewer\] > 0/);
  // when !convert it renders native, not a converted number
  assert.match(src, /if \(!convert\) \{\s*return <span className=\{className\}>\{formatMoney\(native\.amount, native\.currency\)\}<\/span>/);
});

// === formatMoney symbol table ==================================

test("formatMoney uses the right symbol per currency and $ for unknown", () => {
  assert.equal(formatMoney(1249.99, "AUD"), "A$1,249.99");
  assert.equal(formatMoney(12345.67, "CAD"), "C$12,345.67");
  assert.equal(formatMoney(50, "GBP"), "£50.00");
  assert.equal(formatMoney(50, "EUR"), "€50.00");
  assert.equal(formatMoney(50, "USD"), "$50.00");
  assert.equal(formatMoney(50, "ZZZ"), "$50.00"); // unknown -> $, never crashes
});

// === send-digest email is already correct (regression guard) ===

test("send-digest email shows native amount with native symbol + rate-invariant % (no mixed block)", () => {
  const src = read("app/api/send-digest/route.js");
  assert.match(src, /formatMoney\(d\.total_price, currencyForDeal\(d\)\)/);
  assert.doesNotMatch(src, /\$\$\{Number\(d\.total_price\)/);
});

// === no new routes / sitemap / canonical churn =================

test("Phase 12A adds no route family and no sitemap/canonical change", () => {
  assert.doesNotMatch(read("lib/sitemap.js"), /country=|\/au\/|\/ca\/|\/gb\/|region/i);
  // deal + sealed pages keep the bare self-canonical
  assert.match(read("app/deals/[id]/page.js"), /alternates: \{ canonical: `\/deals\/\$\{id\}` \}/);
});
