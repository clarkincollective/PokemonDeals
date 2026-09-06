// P0 AUCTION PRICE INTEGRITY.
//
// Failure shape (from the deal that triggered this - id NOT hard-coded):
// a GB-marketplace auction, US-located seller, current bid GBP 5.92 +
// shipping GBP 12.42 = GBP 18.34 landed = ~USD 24.81 = ~A$34.45 for an
// AU viewer - and the site rendered that A$34.45 landed total under the
// words "Current bid". The bid is A$8-ish; the landed total is not the
// bid. Nothing was double-converted; the defect was the LABEL, plus the
// fact that a stale opening-bid discount is never re-priced as bids come
// in.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { auctionDisplayParts, currencyForDeal } from "../../lib/money.js";
import { repricedAuctionPatch } from "../../lib/auctionPricing.js";
import { isDisplayableDeal, DEAL_DISCOUNT_THRESHOLD } from "../../lib/dealQuality.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const RATES = { USD: 1, GBP: 0.74, AUD: 1.39, EUR: 0.86, CAD: 1.38 };

// the failure-shape row: GB auction, GBP-priced, bid << landed total.
const failShape = (over = {}) => ({
  id: 999,
  is_active: true,
  is_graded: false,
  title: "Pikachu Base Set Shadowless 58/102",
  condition: "Near Mint",
  card_language: "english",
  listing_type: "AUCTION",
  marketplace: "EBAY_GB",
  currency: "GBP",
  price: 5.92, // current bid, native
  shipping: 12.42, // native
  total_price: 18.34, // bid + shipping, native
  total_price_usd: 24.81, // landed, USD
  market_price: 47.73, // USD reference
  discount_pct: 0.48,
  bid_count: 0,
  auction_end_at: new Date(Date.now() + 5 * 864e5).toISOString(),
  listing_id: "v1|168665728968|0",
  listing_url: "https://www.ebay.co.uk/itm/168665728968?hash=x",
  affiliate_url: "https://www.ebay.co.uk/itm/168665728968?hash=x&mkevt=1&mkcid=1&campid=5339197414",
  ...over,
});

// --- 1. auctionDisplayParts: the bid / shipping / est-total split -------

test("1a. splits an auction into current bid, shipping and landed total - bid is NOT the landed total", () => {
  const p = auctionDisplayParts(failShape());
  assert.equal(p.currency, "GBP");
  assert.equal(p.bid.native, 5.92);
  assert.equal(p.shipping.native, 12.42);
  assert.equal(p.total.native, 18.34);
  assert.ok(p.bid.native < p.total.native, "the bid must be strictly below the landed total here");
});

test("1b. one FX conversion only, at the scan-time implied rate (no double conversion, no inversion)", () => {
  const p = auctionDisplayParts(failShape());
  // scan-time rate = total_price / total_price_usd = 18.34 / 24.81 ~= 0.7392
  assert.ok(Math.abs(p.bid.usd - 5.92 / (18.34 / 24.81)) < 1e-6);
  assert.ok(Math.abs(p.shipping.usd - 12.42 / (18.34 / 24.81)) < 1e-6);
  // bid.usd + shipping.usd must reconstruct total.usd (shipping counted once)
  assert.ok(Math.abs(p.bid.usd + p.shipping.usd - p.total.usd) < 0.02);
  // and the USD bid is single-digit, nowhere near the ~24.81 landed total
  assert.ok(p.bid.usd > 7 && p.bid.usd < 9, `bid.usd ~= 8, got ${p.bid.usd}`);
});

test("1c. USD-native auction passes through with rate 1", () => {
  const p = auctionDisplayParts(
    failShape({ marketplace: "EBAY_US", currency: "USD", price: 8, shipping: 4, total_price: 12, total_price_usd: 12 })
  );
  assert.equal(p.bid.usd, 8);
  assert.equal(p.shipping.usd, 4);
  assert.equal(p.total.usd, 12);
});

test("1d. returns null when the stored totals can't recover the rate (caller keeps single-figure)", () => {
  assert.equal(auctionDisplayParts(failShape({ total_price_usd: 0 })), null);
  assert.equal(auctionDisplayParts(failShape({ total_price: 0 })), null);
  assert.equal(auctionDisplayParts(failShape({ price: 0 })), null);
  assert.equal(auctionDisplayParts({}), null);
});

test("1e. zero / missing shipping -> shipping part is 0, not NaN", () => {
  const p = auctionDisplayParts(failShape({ shipping: 0, total_price: 5.92, total_price_usd: 8.01 }));
  assert.equal(p.shipping.native, 0);
  assert.equal(p.shipping.usd, 0);
});

// --- 2. the display CONTRACT in the rendering surfaces -----------------

test("2a. deal detail + DealCard render an auction through AuctionPrice, not the landed total under a bid label", () => {
  for (const f of ["app/deals/[id]/page.js", "components/DealCard.js"]) {
    const src = readFileSync(join(HERE, "..", "..", f), "utf8");
    assert.match(src, /AuctionPrice/, `${f} must use the AuctionPrice component for auctions`);
    // the old "Current bid · N% under market ref · can rise" caption sitting
    // under the landed-total <Price> must be gone from these files.
    assert.doesNotMatch(
      src,
      /Current bid · \{discountPct\}% under market ref · can rise/,
      `${f} still labels the landed total as "Current bid"`
    );
  }
});

test("2b. AuctionPrice headlines the BID and labels the landed figure as an estimate", () => {
  const src = readFileSync(join(HERE, "..", "..", "components", "AuctionPrice.js"), "utf8");
  assert.match(src, /auctionDisplayParts/);
  assert.match(src, /Current bid/);
  assert.match(src, /Est\. total/);
  // the MAIN (non-fallback) branch starts once parts is destructured.
  const main = src.slice(src.indexOf("const { currency, bid, shipping, total } = parts;"));
  // headline <Price> = the bid; the est-total line = total; shipping line = shipping
  assert.match(main, /usd=\{bid\.usd\}/);
  assert.match(main, /amount: bid\.native/);
  assert.match(main, /usd=\{total\.usd\}/);
  assert.match(main, /usd=\{shipping\.usd\}/);
  // the "Current bid" label must sit before the bid <Price>, and before
  // the est-total <Price>, in the main branch.
  assert.ok(main.indexOf("Current bid") < main.indexOf("usd={bid.usd}"));
  assert.ok(main.indexOf("usd={bid.usd}") < main.indexOf("usd={total.usd}"));
});

test("2c. fixed-price (BIN) rendering is unchanged - still landed total, struck-through typical, You save", () => {
  const src = readFileSync(join(HERE, "..", "..", "components", "DealCard.js"), "utf8");
  const binBranch = src.slice(src.indexOf("isAuction ? ("), src.length);
  assert.match(binBranch, /line-through/);
  assert.match(binBranch, /typical/);
  assert.match(src, /Save\{" "\}/);
});

// --- 3. isDisplayableDeal: auction discount safety net ----------------

test("3a. an auction whose stored discount fell below the publish floor is not displayable", () => {
  assert.equal(isDisplayableDeal(failShape({ discount_pct: 0.04 })), false);
  assert.equal(isDisplayableDeal(failShape({ discount_pct: -0.2 })), false);
});

test("3b. a healthy auction still passes; the gate only bites sub-threshold", () => {
  assert.equal(isDisplayableDeal(failShape({ discount_pct: 0.48 })), true);
  assert.equal(isDisplayableDeal(failShape({ discount_pct: DEAL_DISCOUNT_THRESHOLD })), true);
});

test("3c. the new gate is AUCTION-only - a fixed-price row's low discount is governed by the other rules, not this one", () => {
  // a BIN row at 4% under: isDisplayableDeal doesn't add a discount floor
  // for BIN (never has), so this stays true on the discount axis.
  const bin = failShape({ listing_type: "FIXED_PRICE", auction_end_at: null, discount_pct: 0.04, marketplace: "EBAY_US", currency: "USD" });
  assert.equal(isDisplayableDeal(bin), true);
});

// --- 4. re-pricing decision (lib/auctionPricing) ---------------------

const snap = (over = {}) => ({
  status: "ACTIVE",
  calls: 1,
  listingType: "AUCTION",
  price: 5.92,
  shipping: 12.42,
  currency: "GBP",
  bidCount: 0,
  auctionEndAt: null,
  ...over,
});

test("4a. bid rises but still a deal -> reprice: bid/shipping/total/discount/bid_count refreshed, stays active", () => {
  const d = repricedAuctionPatch({ row: failShape(), snapshot: snap({ price: 15, bidCount: 6 }), rates: RATES });
  assert.equal(d.action, "reprice");
  assert.equal(d.patch.price, 15);
  assert.equal(d.patch.bid_count, 6);
  assert.equal(d.patch.total_price, 15 + 12.42);
  assert.ok(Math.abs(d.patch.total_price_usd - (15 + 12.42) / 0.74) < 0.01);
  // 27.42 GBP -> ~37.05 USD vs 47.73 -> ~0.224 discount, still a deal
  assert.ok(d.patch.discount_pct > DEAL_DISCOUNT_THRESHOLD);
  assert.ok(!("is_active" in d.patch));
});

test("4b. bid rises past the floor -> retire (never grandfathered), with truthful numbers on the dead row", () => {
  // bid 45 + ship 12.42 = 57.42 GBP -> ~77.6 USD vs 47.73 market -> negative discount
  const d = repricedAuctionPatch({ row: failShape(), snapshot: snap({ price: 45 }), rates: RATES });
  assert.equal(d.action, "retire");
  assert.equal(d.reason, "below_threshold");
  assert.equal(d.patch.is_active, false);
  assert.ok(d.patch.discount_pct < DEAL_DISCOUNT_THRESHOLD);
  assert.equal(d.patch.price, 45); // real number written, not left stale
});

test("4c. ENDED / SOLD -> retire", () => {
  assert.equal(repricedAuctionPatch({ row: failShape(), snapshot: snap({ status: "ENDED" }), rates: RATES }).action, "retire");
  assert.equal(repricedAuctionPatch({ row: failShape(), snapshot: snap({ status: "SOLD" }), rates: RATES }).action, "retire");
});

test("4d. inconclusive read (UNKNOWN) -> none: the row is left exactly as-is", () => {
  const d = repricedAuctionPatch({ row: failShape(), snapshot: { status: "UNKNOWN", calls: 1 }, rates: RATES });
  assert.equal(d.action, "none");
});

test("4e. a bid that reads LOWER than stored is a bad response, not a price drop -> none (bids are monotonic)", () => {
  const d = repricedAuctionPatch({ row: failShape({ price: 20, total_price: 32.42, total_price_usd: 43.8 }), snapshot: snap({ price: 5.92 }), rates: RATES });
  assert.equal(d.action, "none");
  assert.equal(d.reason, "bid_regression");
});

test("4f. deterministic - same inputs, same patch", () => {
  const a = repricedAuctionPatch({ row: failShape(), snapshot: snap({ price: 15 }), rates: RATES, nowIso: "2026-09-06T00:00:00.000Z" });
  const b = repricedAuctionPatch({ row: failShape(), snapshot: snap({ price: 15 }), rates: RATES, nowIso: "2026-09-06T00:00:00.000Z" });
  assert.deepEqual(a, b);
});

// --- 5. verify-deals wiring ----------------------------------------

test("5a. verify-deals re-prices auctions via getListingSnapshot and keeps BIN on getListingFreshness", () => {
  const src = readFileSync(join(HERE, "..", "..", "app", "api", "verify-deals", "route.js"), "utf8");
  assert.match(src, /getListingSnapshot/);
  assert.match(src, /repricedAuctionPatch/);
  assert.match(src, /isAuctionRow\(r\)/);
  // BIN path still uses the freshness-only call
  assert.match(src, /getListingFreshness\(legacyOf\(r\.listing_id\), r\.marketplace\)/);
  // still exactly two db update sites in the loop (SOLD/ENDED/RETIRED, ACTIVE)
  const loopStart = src.indexOf("for (const r of batch)");
  const loopBody = src.slice(loopStart, src.indexOf("\n  }\n", loopStart));
  assert.equal((loopBody.match(/db\.from\("deals"\)\.update/g) ?? []).length, 2);
});

test("5b. active auctions are re-priced ahead of the fixed-price freshness tiers", () => {
  const src = readFileSync(join(HERE, "..", "..", "app", "api", "verify-deals", "route.js"), "utf8");
  const rankFn = src.slice(src.indexOf("const rank = (r)"), src.indexOf("pool.sort("));
  assert.match(rankFn, /if \(isAuctionRow\(r\)\) return 0;/);
  // justAdded still a distinct tier below auctions, still != highValue
  const ja = Number(rankFn.match(/if \(justAddedCandidate\(r\)\) return (\d+);/)?.[1]);
  const hv = Number(rankFn.match(/if \(highValue\(r\)\) return (\d+);/)?.[1]);
  assert.ok(Number.isFinite(ja) && Number.isFinite(hv) && ja !== hv);
});

test("5c. the retire branch still carries a literal is_active: false", () => {
  const src = readFileSync(join(HERE, "..", "..", "app", "api", "verify-deals", "route.js"), "utf8");
  const branch = src.slice(src.indexOf('status === "ENDED" || status === "SOLD"'));
  const patchLine = branch.slice(0, branch.indexOf("} else if"));
  assert.match(patchLine, /is_active:\s*false/);
});

// --- 6. threshold parity with the scanner -------------------------

test("6. the display/reprice floor equals the scanner's publish floor (DISCOUNT_THRESHOLD)", () => {
  const scanner = readFileSync(join(HERE, "..", "..", "app", "api", "refresh-deals", "route.js"), "utf8");
  const lit = Number(scanner.match(/const DISCOUNT_THRESHOLD = ([\d.]+);/)?.[1]);
  assert.equal(lit, DEAL_DISCOUNT_THRESHOLD);
});

// --- 7. JSON-LD offer truthfulness ------------------------------

test("7. deal detail Product JSON-LD prices an auction at the current bid, in the listing's own currency", () => {
  const src = readFileSync(join(HERE, "..", "..", "app", "deals", "[id]", "page.js"), "utf8");
  const offer = src.slice(src.indexOf("offers: {"), src.indexOf("shippingDestination"));
  assert.match(offer, /priceCurrency: nativeCurrency/);
  assert.match(offer, /auctionParts \? auctionParts\.bid\.native : deal\.total_price/);
});
