// Phase 12A closeout - price-alert target currency integrity.
//
// One explicit contract: the threshold is USD (price_alerts.target_price_usd)
// and is compared against the listing's USD total incl. shipping
// (deals.total_price_usd). Never against a native total_price, never
// unit-less. Legacy `target_price` rows (unprovable unit) are dormant.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import am from "../../lib/alertMatch.js";

const { evaluateAlert, listingTotalUsd, ALERT_DISCOUNT_FLOOR } = am;

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => readFileSync(join(ROOT, p), "utf8");

// a listing whose USD total (item + shipping) is `usd`, priced natively
// on marketplace `mp` at scan-rate `rate` (1 USD = rate native).
const listing = (mp, ccy, usd, rate, discountPct = 0.5) => ({
  marketplace: mp,
  currency: ccy,
  total_price: +(usd * rate).toFixed(2), // native total incl. shipping
  total_price_usd: usd,
  discount_pct: discountPct,
});

const RATE = { USD: 1, GBP: 0.79, EUR: 0.92, AUD: 1.52, CAD: 1.36 };
const MP = { USD: "EBAY_US", GBP: "EBAY_GB", AUD: "EBAY_AU", CAD: "EBAY_CA", DE: "EBAY_DE", IT: "EBAY_IT" };

// === same-unit comparison per marketplace ========================

for (const [ccy, mp] of [["USD", "EBAY_US"], ["GBP", "EBAY_GB"], ["AUD", "EBAY_AU"], ["CAD", "EBAY_CA"], ["EUR", "EBAY_DE"], ["EUR", "EBAY_IT"]]) {
  const rate = RATE[ccy];
  test(`${mp} (${ccy}): target compared in USD, native total_price is irrelevant`, () => {
    const l = listing(mp, ccy, 47.31, rate); // USD total $47.31
    // target ABOVE the USD total -> triggers
    assert.equal(evaluateAlert({ target_price_usd: 52 }, l).matched, true);
    // target BELOW the USD total -> does not trigger
    assert.equal(evaluateAlert({ target_price_usd: 40 }, l).matched, false);
    // the decision must NOT depend on the (different) native number
    assert.notEqual(l.total_price, l.total_price_usd === l.total_price ? null : l.total_price_usd, `${ccy} native differs from USD`);
    const r = evaluateAlert({ target_price_usd: 52 }, l);
    assert.equal(r.comparison.unit, "USD");
    assert.equal(r.comparison.listing, 47.31);
    assert.equal(r.comparison.target, 52);
  });
}

// === exact-boundary behaviour ===================================

test("exact threshold: listing USD == target USD -> triggers (<=)", () => {
  const l = listing("EBAY_AU", "AUD", 50, RATE.AUD);
  assert.equal(evaluateAlert({ target_price_usd: 50 }, l).matched, true);
  assert.equal(evaluateAlert({ target_price_usd: 49.99 }, l).matched, false);
  assert.equal(evaluateAlert({ target_price_usd: 50.01 }, l).matched, true);
});

// === same economic threshold -> identical decision across markets =

test("the SAME USD listing, expressed on any marketplace, triggers identically against one USD target", () => {
  const usd = 50;
  const target = 55;
  const decisions = Object.entries(MP).map(([k, mp]) => {
    const ccy = k === "DE" || k === "IT" ? "EUR" : k;
    return evaluateAlert({ target_price_usd: target }, listing(mp, ccy, usd, RATE[ccy])).matched;
  });
  assert.deepEqual(decisions, decisions.map(() => true), "all six markets trigger");

  const usd2 = 60; // now above the target
  const decisions2 = Object.entries(MP).map(([k, mp]) => {
    const ccy = k === "DE" || k === "IT" ? "EUR" : k;
    return evaluateAlert({ target_price_usd: target }, listing(mp, ccy, usd2, RATE[ccy])).matched;
  });
  assert.deepEqual(decisions2, decisions2.map(() => false), "all six markets do NOT trigger");
});

test("worked example: $50 USD listing == A$76 == C$68 -> same decision vs a $55 USD target", () => {
  const us = listing("EBAY_US", "USD", 50, 1);
  const au = listing("EBAY_AU", "AUD", 50, 1.52); // total_price ~ A$76
  const ca = listing("EBAY_CA", "CAD", 50, 1.36); // total_price ~ C$68
  assert.ok(Math.abs(au.total_price - 76) < 0.5 && Math.abs(ca.total_price - 68) < 0.5);
  for (const l of [us, au, ca]) assert.equal(evaluateAlert({ target_price_usd: 55 }, l).matched, true);
  for (const l of [us, au, ca]) assert.equal(evaluateAlert({ target_price_usd: 45 }, l).matched, false);
});

// === shipping is included =======================================

test("comparison uses the USD TOTAL (item + shipping), not item-only", () => {
  // total_price_usd already folds in shipping - a listing whose item is
  // $40 and shipping $12 has total_price_usd 52.
  const l = { marketplace: "EBAY_GB", currency: "GBP", total_price: 41.08, total_price_usd: 52, discount_pct: 0.4 };
  assert.equal(evaluateAlert({ target_price_usd: 55 }, l).matched, true); // 52 <= 55
  assert.equal(evaluateAlert({ target_price_usd: 45 }, l).matched, false); // 52 > 45 (item-only $40 would wrongly pass)
  assert.equal(listingTotalUsd(l), 52);
});

// === legacy alert handling (fail closed) ========================

test("a legacy row (bare target_price, no target_price_usd) is DORMANT - never matches, never falls through", () => {
  const l = listing("EBAY_US", "USD", 5, 1, 0.9); // super cheap, 90% below market
  const r = evaluateAlert({ target_price: 12, target_price_usd: null }, l);
  assert.equal(r.legacyDormant, true);
  assert.equal(r.matched, false);
  assert.equal(r.reason, "legacy-target-needs-reset");
  // column absent entirely (pre-migration select("*")) -> undefined -> same
  assert.equal(evaluateAlert({ target_price: 12 }, l).legacyDormant, true);
});

test("re-setting a legacy alert (target_price_usd now present) makes it live again", () => {
  const l = listing("EBAY_US", "USD", 10, 1);
  assert.equal(evaluateAlert({ target_price: 12, target_price_usd: 15 }, l).matched, true);
  assert.equal(evaluateAlert({ target_price: null, target_price_usd: 15 }, l).matched, true);
});

// === no target -> currency-free % ===============================

test("no target -> matches on discount_pct >= floor, independent of marketplace/currency", () => {
  assert.equal(ALERT_DISCOUNT_FLOOR, 0.1);
  for (const ccy of ["USD", "GBP", "AUD", "CAD", "EUR"]) {
    const mp = ccy === "EUR" ? "EBAY_DE" : `EBAY_${ccy === "USD" ? "US" : ccy === "GBP" ? "GB" : ccy === "AUD" ? "AU" : "CA"}`;
    assert.equal(evaluateAlert({ target_price_usd: null }, listing(mp, ccy, 80, RATE[ccy], 0.25)).matched, true);
    assert.equal(evaluateAlert({ target_price_usd: null }, listing(mp, ccy, 80, RATE[ccy], 0.05)).matched, false);
  }
});

// === FX failure ================================================

test("FX failure at entry cannot happen - the form/API store the entered number AS USD (no conversion)", () => {
  const alertsSrc = read("app/api/alerts/route.js");
  // the stored value is the raw entered number, named *_usd, no rate math
  assert.match(alertsSrc, /const targetPriceUsd =/);
  assert.match(alertsSrc, /target_price_usd: targetPriceUsd/);
  assert.doesNotMatch(alertsSrc, /getUsdRates|toUsd\(|rates\[|frankfurter/i);
  // the form asks in USD explicitly
  const formSrc = read("components/PriceAlertForm.js");
  assert.match(formSrc, /USD/);
  assert.match(formSrc, /aria-label="Target price in US dollars"/);
});

test("no trustworthy USD total on the listing -> fail closed (no match) for a targeted alert", () => {
  const noUsd = { marketplace: "EBAY_AU", currency: "AUD", total_price: 60, discount_pct: 0.8 }; // no total_price_usd
  const r = evaluateAlert({ target_price_usd: 50 }, noUsd);
  assert.equal(r.matched, false);
  assert.equal(r.reason, "no-trustworthy-usd-total");
  // a USD listing without total_price_usd is still fine (native IS usd)
  assert.equal(evaluateAlert({ target_price_usd: 65 }, { marketplace: "EBAY_US", currency: "USD", total_price: 60, discount_pct: 0.5 }).matched, true);
});

// === email consistency ========================================

test("alert email keeps the comparison single-currency (USD/USD when targeted)", () => {
  const src = read("app/api/check-alerts/route.js");
  // targeted -> "Current price: $X USD · Your target: $Y USD"
  assert.match(src, /Current price: \$\{usdLine\} . Your target: \$\$\{targetUsd\.toFixed\(2\)\} USD/);
  // untargeted -> native symbol + % (matches the weekly digest)
  assert.match(src, /has a listing at \$\{nativeMoney\} \(\$\{discPct\}% below market\)/);
  // it must NOT compare a native total_price against target_price
  assert.doesNotMatch(src, /price <= Number\(a\.target_price\)/);
  assert.match(src, /evaluateAlert\(a, cheapest/);
});

// === duplicate-notification safety ============================

test("dedup guards are unchanged and independent of the currency change", () => {
  const src = read("app/api/check-alerts/route.js");
  assert.match(src, /a\.last_notified_deal_id === cheapest\.id/);
  assert.match(src, /now - new Date\(a\.last_notified_at\)\.getTime\(\) < RENOTIFY_COOLDOWN_MS/);
  // the migration doesn't touch notification state
  assert.doesNotMatch(read("supabase/price_alerts_usd_migration.sql"), /last_notified|update .* set/i);
});

// === affiliate URL unchanged =================================

test("check-alerts builds no affiliate/eBay URL - only the internal card + unsubscribe links", () => {
  const src = read("app/api/check-alerts/route.js");
  assert.doesNotMatch(src, /ebay\.|affiliate_url|campid|mkcid|rover/i);
  assert.match(src, /\$\{SITE_URL\}\/cards\/\$\{slug\}/);
  assert.match(src, /action=unsubscribe/);
});

// === schema / storage-vs-display currency ====================

test("target storage currency = USD; display currency = USD; one column", () => {
  const mig = read("supabase/price_alerts_usd_migration.sql");
  assert.match(mig, /add column if not exists target_price_usd numeric/);
  assert.match(mig, /Alert threshold in USD/);
  assert.doesNotMatch(mig, /drop column|drop table|delete from|update price_alerts set/i); // non-destructive
});

// === no route explosion / SEO impact ========================

test("Phase 12A closeout adds no route/sitemap change", () => {
  assert.doesNotMatch(read("lib/sitemap.js"), /alert/i);
});
