// Phase P0.4.3 - verify-deals BIN freshness / reverify allocation.
//
// Pure-logic tests for lib/verifyAllocator.mjs + structural assertions on
// app/api/verify-deals. No network, no DB.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import {
  allocateVerifyBatch,
  auctionReverifyCooldownHours,
  auctionInCooldown,
  binFreshnessReserveSize,
  binReserveCandidate,
  verifyHealthMetrics,
  BIN_RESERVE_FRACTION,
  AUCTION_CRITICAL_HOURS,
} from "../../lib/verifyAllocator.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => readFileSync(join(ROOT, p), "utf8");

const NOW = Date.parse("2026-09-07T12:00:00Z");
const iso = (hFromNow) => new Date(NOW + hFromNow * 3.6e6).toISOString();

// a fully-displayable BIN row (mirrors the sitemap-parity.test.mjs shape
// that is known to pass isDisplayableDeal)
const bin = (over = {}) => ({
  id: 1, listing_type: "FIXED_PRICE", is_active: true, is_graded: false,
  condition: "Near Mint", card_language: "english",
  card_name: "Charizard GX", card_set: "SM - Hidden Fates",
  title: "Charizard GX 9/68 SM Hidden Fates Holo Rare",
  market_price: 400, discount_pct: 0.6, auction_end_at: null,
  card_tcgplayer_id: "42360", listing_id: "v1|123456789012|0",
  listing_url: "https://www.ebay.com/itm/123456789012?x=1",
  affiliate_url: "https://www.ebay.com/itm/123456789012?x=1&campid=5",
  disqualified_reason: null, visual_authenticity_status: null, visual_authenticity_reason: null,
  image_count: 6, returns_accepted: true, seller_feedback_score: 5000, grade: null, grader: null,
  first_seen_at: iso(-10), last_seen_at: iso(-1), exact_verified_at: iso(-5), ...over,
});
const auction = (over = {}) => ({ ...bin(), listing_type: "AUCTION", auction_end_at: iso(24), ...over });

// ---- auction cooldown tiers ----

test("P043-1 auction reverify cooldown is tiered by time-to-end; never-verified = 0", () => {
  assert.equal(auctionReverifyCooldownHours(auction({ exact_verified_at: null }), NOW), 0);
  assert.equal(auctionReverifyCooldownHours(auction({ auction_end_at: iso(1) }), NOW), 0); // critical window
  assert.equal(auctionReverifyCooldownHours(auction({ auction_end_at: iso(6) }), NOW), 0.75);
  assert.equal(auctionReverifyCooldownHours(auction({ auction_end_at: iso(30) }), NOW), 3);
  assert.equal(auctionReverifyCooldownHours(auction({ auction_end_at: iso(120) }), NOW), 8);
  assert.equal(auctionReverifyCooldownHours(auction({ auction_end_at: null }), NOW), 8);
});

test("P043-2 auctionInCooldown respects the tier; a critical auction is never in cooldown", () => {
  // ends in 30h -> 3h cooldown; verified 1h ago -> IN cooldown
  assert.equal(auctionInCooldown(auction({ auction_end_at: iso(30), exact_verified_at: iso(-1) }), NOW), true);
  // ends in 30h; verified 4h ago -> past cooldown
  assert.equal(auctionInCooldown(auction({ auction_end_at: iso(30), exact_verified_at: iso(-4) }), NOW), false);
  // ends in 1h (critical) -> never in cooldown even if verified 1 min ago
  assert.equal(auctionInCooldown(auction({ auction_end_at: iso(1), exact_verified_at: iso(-0.02) }), NOW), false);
});

// ---- BIN reserve size + quota scaling ----

test("P043-3 BIN reserve is a bounded fraction of the batch, and scales to 0 near the quota reserve", () => {
  assert.equal(binFreshnessReserveSize(20, { quotaRemaining: 3000, reserve: 800 }), Math.round(20 * BIN_RESERVE_FRACTION));
  assert.equal(binFreshnessReserveSize(20, { quotaRemaining: 3000, reserve: 800 }), 7);
  // quota near reserve -> 0 (auction safety only)
  assert.equal(binFreshnessReserveSize(20, { quotaRemaining: 900, reserve: 800 }), 0);
  assert.equal(binFreshnessReserveSize(20, { quotaRemaining: 1050, reserve: 800 }), 0); // 1050-20 < 800+250
  assert.equal(binFreshnessReserveSize(20, { quotaRemaining: 1075, reserve: 800 }), 7); // 1075-20 = 1055 >= 1050
  assert.equal(binFreshnessReserveSize(0, {}), 0);
});

// ---- BIN reserve candidate: soft signal, uses only existing facts ----

test("P043-4 binReserveCandidate uses existing qualification only - no new threshold, no relaxation", () => {
  assert.equal(binReserveCandidate(bin({ exact_verified_at: iso(-5) }), NOW), true); // aging (5h > 3h)
  assert.equal(binReserveCandidate(bin({ exact_verified_at: null }), NOW), true); // never verified
  assert.equal(binReserveCandidate(bin({ exact_verified_at: iso(-1) }), NOW), false); // fresh (1h) - not aging
  assert.equal(binReserveCandidate(auction(), NOW), false); // auctions never in the BIN reserve
  assert.equal(binReserveCandidate(bin({ card_tcgplayer_id: "" }), NOW), false); // no canonical art
  assert.equal(binReserveCandidate(bin({ discount_pct: 0.05 }), NOW), false); // shallow (below the tier model's own 0.15 bar)
  // the shared display gate still applies - a disqualified row is out
  assert.equal(binReserveCandidate(bin({ disqualified_reason: "identity:card_mismatch", exact_verified_at: iso(-5) }), NOW), false);
  assert.equal(binReserveCandidate(bin({ visual_authenticity_status: "COUNTERFEIT_MISMATCH", exact_verified_at: iso(-5) }), NOW), false);
});

// ---- the allocator ----

test("P043-5 with healthy quota, BIN gets the ~35% reserve and auctions fill the general slots", () => {
  const pool = [
    // auctions still DUE (never verified) so they compete for the general slots
    ...Array.from({ length: 50 }, (_, i) => auction({ id: 1000 + i, auction_end_at: iso(20 + i), exact_verified_at: null })),
    ...Array.from({ length: 50 }, (_, i) => bin({ id: 2000 + i, exact_verified_at: iso(-8 - i * 0.1) })),
  ];
  const { batch, allocation } = allocateVerifyBatch({ pool, batch: 20, now: NOW, quotaRemaining: 3000, reserve: 800 });
  assert.equal(batch.length, 20);
  assert.equal(allocation.bin_reserve_used, 7);
  assert.equal(allocation.verify_mix_bin, 7); // exactly the reserve
  assert.equal(allocation.verify_mix_auction, 13); // 20 - 7, from the general tier
});

test("P043-5b when every auction is inside its cooldown, BIN legitimately takes the freed slots", () => {
  const pool = [
    ...Array.from({ length: 50 }, (_, i) => auction({ id: 1000 + i, auction_end_at: iso(30 + i), exact_verified_at: iso(-0.1) })), // 30h+ out, just re-priced -> in cooldown
    ...Array.from({ length: 50 }, (_, i) => bin({ id: 2000 + i, exact_verified_at: iso(-8 - i * 0.1) })),
  ];
  const { allocation } = allocateVerifyBatch({ pool, batch: 20, now: NOW, quotaRemaining: 3000, reserve: 800 });
  assert.ok(allocation.auctions_skipped_cooldown >= 40);
  assert.equal(allocation.verify_mix_auction, 0); // nothing to reprice this run
  assert.equal(allocation.verify_mix_bin, 20); // BIN uses the reserve + the freed general slots
});

test("P043-6 a critical (ending-soon) auction is ALWAYS in the batch, ahead of the BIN reserve", () => {
  const pool = [
    auction({ id: 1, auction_end_at: iso(0.5), exact_verified_at: iso(-0.05) }), // ends in 30 min - critical
    ...Array.from({ length: 30 }, (_, i) => bin({ id: 100 + i, exact_verified_at: null })),
  ];
  const { batch, allocation } = allocateVerifyBatch({ pool, batch: 20, now: NOW, quotaRemaining: 3000, reserve: 800 });
  assert.equal(allocation.critical_auctions, 1);
  assert.ok(batch.some((r) => r.id === 1 && r.listing_type === "AUCTION"));
  assert.equal(batch[0].id, 1, "critical auction is first");
});

test("P043-7 near the quota reserve, the allocator reverts to auction-safety-only (0 BIN reserve)", () => {
  const pool = [
    ...Array.from({ length: 30 }, (_, i) => auction({ id: 1000 + i, auction_end_at: iso(2 + i), exact_verified_at: null })),
    ...Array.from({ length: 30 }, (_, i) => bin({ id: 2000 + i, exact_verified_at: null })),
  ];
  const { allocation } = allocateVerifyBatch({ pool, batch: 20, now: NOW, quotaRemaining: 900, reserve: 800 });
  assert.equal(allocation.bin_reserve_size, 0);
  assert.equal(allocation.verify_mix_bin, 0);
  assert.equal(allocation.verify_mix_auction, 20);
});

test("P043-8 the allocator is deterministic for a fixed (pool, batch, now, quota)", () => {
  const pool = [
    ...Array.from({ length: 40 }, (_, i) => auction({ id: 1000 + i, auction_end_at: iso(3 + i * 0.5), exact_verified_at: i % 2 ? iso(-0.1) : null })),
    ...Array.from({ length: 40 }, (_, i) => bin({ id: 2000 + i, exact_verified_at: i % 3 ? iso(-6 - i * 0.1) : null })),
  ];
  const a = allocateVerifyBatch({ pool, batch: 20, now: NOW, quotaRemaining: 3000, reserve: 800 });
  const b = allocateVerifyBatch({ pool, batch: 20, now: NOW, quotaRemaining: 3000, reserve: 800 });
  assert.deepEqual(a.batch.map((r) => r.id), b.batch.map((r) => r.id));
});

test("P043-9 no runaway: the batch is exactly capped at `batch`, never larger", () => {
  const pool = Array.from({ length: 500 }, (_, i) => (i % 2 ? auction({ id: i, auction_end_at: iso(1 + i), exact_verified_at: null }) : bin({ id: i, exact_verified_at: null })));
  for (const n of [1, 5, 20, 50]) {
    assert.equal(allocateVerifyBatch({ pool, batch: n, now: NOW, quotaRemaining: 5000, reserve: 800 }).batch.length, n);
  }
});

test("P043-10 auction safety: fresh-auction coverage is not reduced by the BIN reserve", () => {
  // 15 auctions ending soon (not verified) + plenty of BIN
  const pool = [
    ...Array.from({ length: 15 }, (_, i) => auction({ id: 1000 + i, auction_end_at: iso(1 + i * 0.5), exact_verified_at: null })),
    ...Array.from({ length: 30 }, (_, i) => bin({ id: 2000 + i, exact_verified_at: null })),
  ];
  const { allocation } = allocateVerifyBatch({ pool, batch: 20, now: NOW, quotaRemaining: 3000, reserve: 800 });
  // all 15 soon-ending unverified auctions still get in (critical + general), BIN takes only the reserve
  assert.equal(allocation.verify_mix_auction, 13); // 20 - 7 reserve; the 15 auctions compete for 13 general+critical
  assert.ok(allocation.verify_mix_auction + allocation.verify_mix_bin === 20);
});

// ---- health metrics ----

test("P043-11 verifyHealthMetrics reports the BIN/AUCTION freshness split without a social truth model", () => {
  const rows = [
    bin({ id: 1, exact_verified_at: iso(-0.5) }), // fresh strong BIN
    bin({ id: 2, exact_verified_at: iso(-4), discount_pct: 0.4 }), // aging strong BIN
    bin({ id: 3, exact_verified_at: null, discount_pct: 0.4 }), // stale strong BIN
    bin({ id: 4, exact_verified_at: iso(-0.5), discount_pct: 0.1 }), // fresh but shallow (not "strong")
    auction({ id: 5, exact_verified_at: iso(-0.5) }),
  ];
  const m = verifyHealthMetrics(rows, NOW);
  assert.equal(m.active_bin, 4);
  assert.equal(m.active_auction, 1);
  assert.equal(m.fresh_bin_6h, 3); // ids 1 (0.5h), 2 (4h), 4 (0.5h) - id 3 is never-verified
  assert.equal(m.fresh_auction_6h, 1);
  assert.equal(m.strong_bin_total, 3); // ids 1,2,3 (disc>=0.3 + canon art + displayable)
  assert.equal(m.strong_bin_fresh_6h, 2); // ids 1 (0.5h) + 2 (4h) - both within the 6h ceiling
  assert.equal(m.strong_bin_aging_3_6h, 1); // id 2 only
  assert.equal(m.strong_bin_stale, 1); // id 3 (never verified)
  assert.equal(m.social_eligible_bin_count, 2); // = strong_bin_fresh_6h
});

// ---- route wiring ----

test("P043-12 verify-deals uses the allocator and does NOT change deal qualification / thresholds / auction re-price", () => {
  const src = read("app/api/verify-deals/route.js");
  assert.match(src, /import \{ allocateVerifyBatch \} from "@\/lib\/verifyAllocator"/);
  assert.match(src, /const \{ batch, allocation \} = allocateVerifyBatch\(\{/);
  assert.match(src, /quotaRemaining: rl\.remaining/);
  assert.match(src, /reserve: RESERVE/);
  // the RESERVE floor is unchanged
  assert.match(src, /const RESERVE = 800;/);
  assert.match(src, /if \(rl\.remaining - BATCH < RESERVE\)/);
  // the auction re-price path is untouched (still repricedAuctionPatch, one call)
  assert.match(src, /repricedAuctionPatch\(\{ row: r, snapshot: snap, rates, nowIso: checkedAt \}\)/);
  assert.match(src, /getListingSnapshot\(legacyOf\(r\.listing_id\), r\.marketplace\)/);
  // no new threshold / market-reference logic added to the executable route
  // (comments stripped - the doc block describes the historical tiers)
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  assert.doesNotMatch(code, /discount_pct\s*[<>]=?\s*0\.\d|market_price\s*[<>]=?\s*\d/);
  // observability surfaced
  assert.match(src, /allocation,\s*\n\s*detail,/);
});

test("P043-13 the allocator preserves the P0.2 general-tier order (justAdded > highValue > midValue)", () => {
  // in the "general" slots (after critical + reserve), a never-verified
  // recently-discovered BIN outranks an old high-value BIN.
  const pool = [
    bin({ id: 1, first_seen_at: iso(-2), exact_verified_at: null, market_price: 50, discount_pct: 0.2 }), // justAdded
    bin({ id: 2, first_seen_at: iso(-500), exact_verified_at: iso(-2), market_price: 800, discount_pct: 0.8 }), // highValue, not aging enough for reserve
  ];
  // reserve size 0 (tiny batch) so both fall to the general tier
  const { batch } = allocateVerifyBatch({ pool, batch: 1, now: NOW, quotaRemaining: 5000, reserve: 800 });
  assert.equal(batch[0].id, 1, "justAdded still beats highValue in the general tier");
});

test("P043-14 no verify-deals / allocator path calls eBay Browse from social:auto", () => {
  // the allocator is pure - it never imports ebay
  assert.doesNotMatch(read("lib/verifyAllocator.mjs"), /from "\.\/ebay|browse\.api|getBrowseRateLimit|getListing/);
  // social:auto never imports the allocator or verify-deals
  assert.doesNotMatch(read("scripts/socialAuto.mjs"), /verifyAllocator|verify-deals/);
});

test("P043-15 total Browse budget is unchanged - BATCH still 20, cron still every 30 min", () => {
  const src = read("app/api/verify-deals/route.js");
  assert.match(src, /const BATCH = 20;/);
  const vj = JSON.parse(read("vercel.json"));
  const vd = vj.crons.find((c) => c.path === "/api/verify-deals");
  assert.equal(vd.schedule, "*/30 * * * *");
});
