// Deal freshness lifecycle (lib/dealQuality) + the local stale sweep and
// bounded re-verification cron. A deal we can no longer confidently
// confirm is live must stop being promoted - value/discount-tiered TTL,
// zero API cost at display time - while the DB row is kept for history
// and can be promoted again once a scan re-sees the listing.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  isDisplayableDeal,
  disqualificationReason,
  dealFreshness,
  isStale,
  freshnessTierTtl,
  FRESHNESS_TTL_HOURS,
} from "../../lib/dealQuality.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const HOUR = 3_600_000;
const ago = (h) => new Date(Date.now() - h * HOUR).toISOString();
const ahead = (h) => new Date(Date.now() + h * HOUR).toISOString();

// A fully-populated, otherwise-clean displayable deal row.
const deal = (over = {}) => ({
  id: 1,
  is_active: true,
  is_graded: false,
  title: "Charizard GX 9/68 SM Hidden Fates Holo Rare",
  condition: "Near Mint",
  card_language: "english",
  card_name: "Charizard GX",
  card_set: "SM - Hidden Fates",
  market_price: 40,
  discount_pct: 0.3,
  listing_type: "FIXED_PRICE",
  auction_end_at: null,
  last_seen_at: ago(1),
  listing_id: "v1|123456789012|0",
  listing_url: "https://www.ebay.com/itm/123456789012?x=1",
  affiliate_url: "https://www.ebay.com/itm/123456789012?x=1&campid=5",
  disqualified_reason: null,
  visual_authenticity_status: null,
  ...over,
});

// --- 1-3: auctions + fresh BIN -----------------------------------------

test("1. an auction past its end time is not displayable (zero API cost)", () => {
  const r = deal({ listing_type: "AUCTION", auction_end_at: ago(0.5), last_seen_at: ago(0.2) });
  assert.equal(dealFreshness(r), "ENDED");
  assert.equal(isDisplayableDeal(r), false);
  assert.equal(disqualificationReason(r), "auction_ended");
});

test("2. a future-dated auction stays eligible", () => {
  const r = deal({ listing_type: "AUCTION", auction_end_at: ahead(6), last_seen_at: ago(2) });
  assert.notEqual(dealFreshness(r), "ENDED");
  assert.equal(isDisplayableDeal(r), true);
});

test("3. a recently-seen fixed-price deal stays eligible", () => {
  assert.equal(dealFreshness(deal({ last_seen_at: ago(2) })), "FRESH");
  assert.equal(isDisplayableDeal(deal({ last_seen_at: ago(2) })), true);
});

// --- 4: tiered stale TTL --------------------------------------------

test("4. a stale fixed-price deal drops from promotion per the value/discount tier", () => {
  // low tier: > 168h
  assert.equal(isStale(deal({ market_price: 20, discount_pct: 0.3, last_seen_at: ago(150) })), false);
  assert.equal(isStale(deal({ market_price: 20, discount_pct: 0.3, last_seen_at: ago(170) })), true);
  assert.equal(isDisplayableDeal(deal({ market_price: 20, discount_pct: 0.3, last_seen_at: ago(170) })), false);

  // mid tier: market >= 100  -> 120h
  assert.equal(isStale(deal({ market_price: 150, last_seen_at: ago(100) })), false);
  assert.equal(isStale(deal({ market_price: 150, last_seen_at: ago(130) })), true);

  // high tier: market >= 300 OR discount >= 70%  -> 72h
  assert.equal(isStale(deal({ market_price: 500, last_seen_at: ago(60) })), false);
  assert.equal(isStale(deal({ market_price: 500, last_seen_at: ago(80) })), true);
  assert.equal(isStale(deal({ market_price: 40, discount_pct: 0.75, last_seen_at: ago(80) })), true);

  assert.equal(disqualificationReason(deal({ market_price: 500, last_seen_at: ago(80) })), "freshness:stale");
  // tiers are ordered tight -> loose
  assert.ok(FRESHNESS_TTL_HOURS.high < FRESHNESS_TTL_HOURS.mid);
  assert.ok(FRESHNESS_TTL_HOURS.mid < FRESHNESS_TTL_HOURS.low);
  assert.equal(freshnessTierTtl(deal({ market_price: 500 })), FRESHNESS_TTL_HOURS.high);
  assert.equal(freshnessTierTtl(deal({ market_price: 150 })), FRESHNESS_TTL_HOURS.mid);
  assert.equal(freshnessTierTtl(deal({ market_price: 20, discount_pct: 0.3 })), FRESHNESS_TTL_HOURS.low);
});

// --- 5-6: history preserved, re-verification promotes again ----------

test("5. a stale row is only suppressed - the row object itself is untouched (history preserved)", () => {
  const r = deal({ market_price: 500, last_seen_at: ago(200), first_seen_at: ago(220) });
  const snapshot = JSON.stringify(r);
  assert.equal(isDisplayableDeal(r), false); // suppressed from promotion
  assert.equal(JSON.stringify(r), snapshot); // not mutated / not deleted
  // the stale sweep sets is_active=false; nothing here deletes a row.
});

test("6. a re-verified stale deal becomes promotable again once last_seen_at is refreshed", () => {
  const staleRow = deal({ market_price: 500, last_seen_at: ago(200) });
  assert.equal(isDisplayableDeal(staleRow), false);
  const reverified = { ...staleRow, is_active: true, last_seen_at: ago(0.1) };
  assert.equal(dealFreshness(reverified), "FRESH");
  assert.equal(isDisplayableDeal(reverified), true);
});

// --- 7: freshness never resurrects a disqualified row ---------------

test("7. a fresh last_seen_at does NOT un-hide an identity / authenticity / disqualified row", () => {
  const idm = deal({ last_seen_at: ago(0.1), visual_authenticity_status: "IDENTITY_MISMATCH", visual_authenticity_reason: "vision:wrong print" });
  assert.equal(isDisplayableDeal(idm), false);
  assert.equal(disqualificationReason(idm), "identity:visual_mismatch");

  const counterfeit = deal({ last_seen_at: ago(0.1), visual_authenticity_status: "COUNTERFEIT_MISMATCH", visual_authenticity_reason: "vision:metal plate" });
  assert.equal(isDisplayableDeal(counterfeit), false);

  // a stored disqualified_reason hides the row regardless of freshness
  const flagged = deal({ last_seen_at: ago(0.1), disqualified_reason: "identity:card_mismatch" });
  assert.equal(isDisplayableDeal(flagged), false);

  // freshness:stale is only reported AFTER the identity/authenticity
  // checks in disqualificationReason - a re-derivably-bad row never comes
  // back as merely "stale"
  const mismatchFresh = deal({ last_seen_at: ago(0.1), visual_authenticity_status: "IDENTITY_MISMATCH", visual_authenticity_reason: "vision:wrong print" });
  assert.equal(disqualificationReason(mismatchFresh), "identity:visual_mismatch");
  const mismatchStale = deal({ last_seen_at: ago(400), market_price: 500, visual_authenticity_status: "IDENTITY_MISMATCH", visual_authenticity_reason: "vision:wrong print" });
  assert.equal(disqualificationReason(mismatchStale), "identity:visual_mismatch");
});

// --- 8-9: no regression to marketplace / exact-URL gating ----------

test("8. the freshness tier is marketplace-agnostic; a stale GB deal is still stale", () => {
  const gb = deal({ marketplace: "EBAY_GB", market_price: 500, last_seen_at: ago(80) });
  assert.equal(isStale(gb), true);
  const gbFresh = deal({ marketplace: "EBAY_GB", market_price: 500, last_seen_at: ago(2) });
  assert.equal(isDisplayableDeal(gbFresh), true);
});

test("9. exact /itm/ gating still runs before freshness - a wrong-destination row fails for that reason", () => {
  const wrongDest = deal({ listing_url: "https://www.ebay.com/p/24043367539", affiliate_url: "https://www.ebay.com/p/24043367539", last_seen_at: ago(2) });
  assert.equal(isDisplayableDeal(wrongDest), false);
  assert.equal(disqualificationReason(wrongDest), "destination:non_exact");
});

// --- 10-11: the cron routes stay bounded + reserve-guarded --------

test("10. /api/verify-deals is hard-capped at a small batch", () => {
  const src = readFileSync(join(HERE, "..", "..", "app", "api", "verify-deals", "route.js"), "utf8");
  const batch = Number(src.match(/const BATCH\s*=\s*(\d+)/)?.[1]);
  assert.ok(batch >= 1 && batch <= 25, `BATCH is ${batch}`);
  assert.match(src, /pool\.slice\(0,\s*BATCH\)/);
});

test("11. /api/verify-deals refuses to run below the protected Browse reserve", () => {
  const src = readFileSync(join(HERE, "..", "..", "app", "api", "verify-deals", "route.js"), "utf8");
  assert.match(src, /const RESERVE\s*=\s*800/);
  assert.match(src, /rl\.remaining\s*-\s*BATCH\s*<\s*RESERVE/);
  // and it must never retire a row on an inconclusive answer
  assert.match(src, /status === "ENDED" \|\| status === "SOLD"/);
  assert.doesNotMatch(src, /status === "UNKNOWN"[^\n]*is_active/);
});

test("sweep: /api/sweep-stale-deals makes no eBay calls and only flips is_active", () => {
  const src = readFileSync(join(HERE, "..", "..", "app", "api", "sweep-stale-deals", "route.js"), "utf8");
  assert.doesNotMatch(src, /lib\/ebay|getBrowseRateLimit|getItemsByLegacyIds|searchListings/);
  assert.match(src, /update\(\{ is_active: false \}\)/);
  assert.match(src, /auction_end_at/); // ends the known-ended auctions
});
