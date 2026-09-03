// Phase 13A - the small structural enums used across the event taxonomy.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  priceBandUsd,
  discountBand,
  listingTypeProp,
  rawVsGraded,
  viewerCountryFromMarketplace,
  deviceClassFromWidth,
  resultCountBand,
  latencyBand,
  classifyTrafficSource,
  sanitizeUtmValue,
} from "../../lib/analytics/props.js";

test("priceBandUsd boundaries", () => {
  assert.equal(priceBandUsd(0), "under_25");
  assert.equal(priceBandUsd(24.99), "under_25");
  assert.equal(priceBandUsd(25), "25_50");
  assert.equal(priceBandUsd(99.99), "50_100");
  assert.equal(priceBandUsd(100), "100_500");
  assert.equal(priceBandUsd(499.99), "100_500");
  assert.equal(priceBandUsd(500), "500_plus");
  assert.equal(priceBandUsd(-1), "unknown");
  assert.equal(priceBandUsd("abc"), "unknown");
});

test("discountBand accepts fraction or percentage", () => {
  assert.equal(discountBand(0.1), "under_15");
  assert.equal(discountBand(10), "under_15");
  assert.equal(discountBand(0.2), "15_30");
  assert.equal(discountBand(29), "15_30");
  assert.equal(discountBand(30), "30_50");
  assert.equal(discountBand(0.65), "50_70");
  assert.equal(discountBand(70), "70_plus");
  assert.equal(discountBand(0.72), "70_plus");
  assert.equal(discountBand(NaN), "unknown");
});

test("listing type normalisation", () => {
  assert.equal(listingTypeProp("AUCTION"), "AUCTION");
  assert.equal(listingTypeProp("FIXED_PRICE"), "BIN");
  assert.equal(listingTypeProp("bin"), "BIN");
  assert.equal(listingTypeProp(null), "unknown");
});

test("raw vs graded", () => {
  assert.equal(rawVsGraded(true), "graded");
  assert.equal(rawVsGraded(false), "raw");
  assert.equal(rawVsGraded(undefined), "unknown");
});

test("viewer country from marketplace", () => {
  assert.equal(viewerCountryFromMarketplace("EBAY_GB"), "GB");
  assert.equal(viewerCountryFromMarketplace("EBAY_US"), "US");
  assert.equal(viewerCountryFromMarketplace(""), "other");
  assert.equal(viewerCountryFromMarketplace("EBAY_FR"), "other");
});

test("device class from width", () => {
  assert.equal(deviceClassFromWidth(375), "mobile");
  assert.equal(deviceClassFromWidth(767), "mobile");
  assert.equal(deviceClassFromWidth(768), "tablet");
  assert.equal(deviceClassFromWidth(1023), "tablet");
  assert.equal(deviceClassFromWidth(1440), "desktop");
  assert.equal(deviceClassFromWidth(0), "unknown");
});

test("result-count band", () => {
  assert.equal(resultCountBand(0), "0");
  assert.equal(resultCountBand(3), "1_5");
  assert.equal(resultCountBand(20), "6_20");
  assert.equal(resultCountBand(100), "21_100");
  assert.equal(resultCountBand(6015), "100_plus");
});

test("latency band", () => {
  assert.equal(latencyBand(120), "under_300");
  assert.equal(latencyBand(500), "300_800");
  assert.equal(latencyBand(1500), "800_2000");
  assert.equal(latencyBand(3000), "2000_5000");
  assert.equal(latencyBand(9000), "5000_plus");
});

test("traffic source: utm wins, then referrer host", () => {
  assert.equal(classifyTrafficSource({ utmSource: "tiktok" }), "tiktok");
  assert.equal(classifyTrafficSource({ utmSource: "newsletter", utmMedium: "email" }), "referral");
  assert.equal(classifyTrafficSource({ utmSource: "google", utmMedium: "cpc" }), "paid_search");
  assert.equal(classifyTrafficSource({ referrer: "" }), "direct");
  assert.equal(classifyTrafficSource({ referrer: "https://www.google.com/search?q=x" }), "organic_search");
  assert.equal(classifyTrafficSource({ referrer: "https://l.facebook.com/" }), "facebook");
  assert.equal(classifyTrafficSource({ referrer: "https://www.reddit.com/r/pkmntcg" }), "reddit");
  assert.equal(classifyTrafficSource({ referrer: "https://t.co/abc" }), "other_social");
  assert.equal(classifyTrafficSource({ referrer: "https://someblog.example/post" }), "referral");
  assert.equal(
    classifyTrafficSource({ referrer: "https://pokemondealfinder.com/cards", currentHost: "pokemondealfinder.com" }),
    "internal"
  );
  assert.equal(classifyTrafficSource({ referrer: "not a url" }), "unknown");
});

test("sanitizeUtmValue accepts clean campaign codes", () => {
  assert.equal(sanitizeUtmValue("SOC_00428"), "SOC_00428");
  assert.equal(sanitizeUtmValue("tiktok"), "tiktok");
  assert.equal(sanitizeUtmValue("cpc"), "cpc");
  assert.equal(sanitizeUtmValue("summer-sale-2026"), "summer-sale-2026");
  assert.equal(sanitizeUtmValue("spring sale"), "spring sale"); // 1 internal space ok
  assert.equal(sanitizeUtmValue("  tiktok  "), "tiktok"); // outer padding is trimmed
});

test("sanitizeUtmValue rejects malicious / accidental input", () => {
  for (const bad of [
    "bob@example.com",
    "https://evil.example/x",
    "//evil.example",
    "www.evil.example",
    "evil.example/path",
    "%3Cscript%3E",
    "<script>alert(1)</script>",
    "check this out i found a great deal here", // free-form sentence (multi-space)
    "x".repeat(200),
    "a\nb",
    'q"or"1',
    "path/to/thing",
    "",
    null,
    undefined,
    42,
  ]) {
    assert.equal(sanitizeUtmValue(bad), undefined, `should reject: ${JSON.stringify(bad)}`);
  }
});
