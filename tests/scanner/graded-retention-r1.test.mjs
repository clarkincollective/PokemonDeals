// graded-retention-r1 - up to two of verify-deals' existing 20 slots for
// active, display-eligible graded FIXED-PRICE rows approaching their real
// freshness cutoff. Pure allocator tests + structural checks on the route.
// No network, no DB. NOW is the real clock because isDisplayableDeal reads it.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";

import {
  allocateVerifyBatch,
  gradedRetentionCandidate,
  gradedRetentionSlots,
  GRADED_RETENTION_SLOTS,
} from "../../lib/verifyAllocator.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => readFileSync(join(ROOT, p), "utf8");
const dq = createRequire(import.meta.url)(join(ROOT, "lib/dealQuality.js"));

const NOW = Date.now();
const iso = (h) => new Date(NOW + h * 3.6e6).toISOString();
let seq = 0;
const nextId = () => ++seq;

// market 400 -> 24h freshness tier; AGING once last seen >= 12h ago
const slab = (over = {}) => {
  const id = over.id ?? nextId();
  const legacy = String(200000000000 + id);
  return {
    id, listing_type: "FIXED_PRICE", is_active: true, is_graded: true, grader: "PSA", grade: "10",
    condition: "Graded", card_language: "english",
    card_name: "Charizard GX", card_set: "SM - Hidden Fates",
    title: "Charizard GX 9/68 SM Hidden Fates Holo Rare PSA 10",
    market_price: 400, discount_pct: 0.3, auction_end_at: null,
    card_tcgplayer_id: "42360", listing_id: `v1|${legacy}|0`, marketplace: "EBAY_US",
    listing_url: `https://www.ebay.com/itm/${legacy}?x=1`,
    affiliate_url: `https://www.ebay.com/itm/${legacy}?x=1&campid=5`,
    disqualified_reason: null, visual_authenticity_status: null, visual_authenticity_reason: null,
    seller_feedback_score: 5000,
    first_seen_at: iso(-40), last_seen_at: iso(-18), exact_verified_at: null, ...over,
  };
};
const raw = (over = {}) => slab({ is_graded: false, grader: null, grade: null, condition: "Near Mint", title: "Charizard GX 9/68 SM Hidden Fates Holo Rare", last_seen_at: iso(-1), ...over });
const auction = (over = {}) => raw({ listing_type: "AUCTION", auction_end_at: iso(30), exact_verified_at: iso(-10), ...over });
const healthy = { quotaRemaining: 3000, reserve: 800 };

test("GR-1 fixture sanity: an aging slab is display-eligible and inside its freshness window", () => {
  const r = slab();
  assert.equal(dq.isDisplayableDeal(r), true);
  assert.equal(dq.dealFreshness(r, NOW), "AGING");
  assert.equal(gradedRetentionCandidate(r, NOW), true);
});

test("GR-2 candidates: only active, display-eligible graded fixed-price rows approaching the cutoff; nothing held, conflicting, fresh, expired or just checked", () => {
  const ok = (r, opts) => gradedRetentionCandidate(r, NOW, opts);
  assert.equal(ok(raw({ last_seen_at: iso(-18) })), false, "raw rows");
  assert.equal(ok(slab({ listing_type: "AUCTION", auction_end_at: iso(30) })), false, "auctions");
  assert.equal(ok(slab({ is_active: false })), false, "inactive rows are never reactivated");
  for (const reason of ["identity:card_mismatch", "language:japanese_vs_english", "review:language_unverified", "availability:sold"]) {
    assert.equal(ok(slab({ disqualified_reason: reason })), false, reason);
  }
  assert.equal(ok(slab({ last_seen_at: iso(-2) })), false, "FRESH - not yet approaching");
  assert.equal(ok(slab({ last_seen_at: iso(-30) })), false, "already past the 24h cutoff");
  assert.equal(ok(slab({ exact_verified_at: iso(-1) })), false, "checked within the recheck window");
  assert.equal(ok(slab({ exact_verified_at: iso(-3) })), true, "checked long enough ago");
  const conflicted = slab();
  assert.equal(ok(conflicted, { conflicts: new Set([conflicted.listing_id]) }), false, "identity-conflicting copies");
  const proxy = slab({ title: "Charizard GX 9/68 SM Hidden Fates PSA 10 Proxy Custom Card" });
  assert.equal(dq.isDisplayableDeal(proxy), false);
  assert.equal(ok(proxy), false, "fails the display gate");
});

test("GR-3 soonest real cutoff first; at most two; slots come out of the batch, never on top", () => {
  const far = slab({ last_seen_at: iso(-13) });
  const nearer = slab({ last_seen_at: iso(-20) });
  const nearest = slab({ last_seen_at: iso(-23) });
  const auctions = Array.from({ length: 40 }, () => auction());
  const { batch, allocation } = allocateVerifyBatch({ pool: [far, nearer, nearest, ...auctions], batch: 20, now: NOW, ...healthy });
  assert.equal(batch.length, 20, "total never exceeds the batch");
  assert.equal(allocation.graded_retention_slots, GRADED_RETENTION_SLOTS);
  assert.equal(allocation.graded_retention_used, 2);
  assert.deepEqual(batch.slice(0, 2).map((r) => r.id), [nearest.id, nearer.id]);
  assert.equal(new Set(batch.map((r) => r.id)).size, batch.length, "no row selected twice");
});

test("GR-4 unused graded slots fall through to the existing selection; deduplicated across lanes", () => {
  const only = slab({ last_seen_at: iso(-20) });
  const raws = Array.from({ length: 30 }, (_, i) => raw({ last_seen_at: iso(-1 - i * 0.1) }));
  const withLane = allocateVerifyBatch({ pool: [only, ...raws], batch: 20, now: NOW, ...healthy });
  assert.equal(withLane.allocation.graded_retention_used, 1);
  assert.equal(withLane.batch.length, 20, "the unused slot was filled");
  assert.equal(withLane.batch.filter((r) => r.id === only.id).length, 1, "the slab appears once");
  // empty graded sub-pool -> identical to the lane being off
  const noSlabs = allocateVerifyBatch({ pool: raws, batch: 20, now: NOW, ...healthy });
  const off = allocateVerifyBatch({ pool: raws, batch: 20, now: NOW, ...healthy, gradedSlots: 0 });
  assert.deepEqual(noSlabs.batch.map((r) => r.id), off.batch.map((r) => r.id));
});

test("GR-5 disable with an allocation of zero; scales to zero near the quota floor", () => {
  const pool = [slab({ last_seen_at: iso(-20) }), ...Array.from({ length: 25 }, () => raw())];
  const off = allocateVerifyBatch({ pool, batch: 20, now: NOW, ...healthy, gradedSlots: 0 });
  assert.equal(off.allocation.graded_retention_slots, 0);
  assert.equal(off.allocation.graded_retention_used, 0);
  assert.equal(gradedRetentionSlots(20, { quotaRemaining: 900, reserve: 800 }), 0);
  assert.equal(gradedRetentionSlots(20, { slots: 0, ...healthy }), 0);
  assert.equal(gradedRetentionSlots(20, healthy), 2);
});

test("GR-6 a successful ACTIVE check refreshes the evidence the freshness policy reads; UNKNOWN does not; first_seen_at is kept", () => {
  const src = read("app/api/verify-deals/route.js");
  // the route's ACTIVE patch, verbatim
  assert.match(src, /\{ \.\.\.auctionActiveExtra, last_seen_at: checkedAt, exact_verified_at: checkedAt \}/);
  assert.doesNotMatch(src, /first_seen_at\s*:/, "the verifier never writes first_seen_at");
  const before = slab({ last_seen_at: iso(-23) });
  const checkedAt = new Date(NOW).toISOString();
  const after = { ...before, last_seen_at: checkedAt, exact_verified_at: checkedAt };
  assert.equal(dq.dealFreshness(after, NOW), "FRESH", "the row no longer times out");
  assert.equal(dq.isDisplayableDeal(after), true);
  assert.equal(after.first_seen_at, before.first_seen_at);
  assert.equal(gradedRetentionCandidate(after, NOW), false, "not re-picked after confirmation");
  // UNKNOWN writes nothing: the row keeps aging toward the same cutoff
  assert.equal(gradedRetentionCandidate(before, NOW), true);
  // /api/sweep-stale-deals retires on the same last_seen_at field
  assert.match(read("app/api/sweep-stale-deals/route.js"), /\.lt\("last_seen_at", cut\(FRESHNESS_TTL_HOURS\.high\)\)/);
});

test("GR-7 route: ceiling, reserve, schedule and guarded retirement unchanged; graded identity columns read", () => {
  const src = read("app/api/verify-deals/route.js");
  assert.match(src, /const BATCH = 20;/);
  assert.match(src, /const RESERVE = 800;/);
  assert.match(src, /batch: BATCH - recoveryRows\.length - sealed\.used,/, "card lanes still share one BATCH");
  assert.match(src, /retireForAvailability\(db, \{ key: \{ id: r\.id \}, reason, patch \}\)/, "SOLD / ENDED keep the quarantine-preserving write");
  assert.match(src, /"grader, grade"/);
  const cron = JSON.parse(read("vercel.json")).crons.find((c) => c.path === "/api/verify-deals");
  assert.equal(cron.schedule, "*/30 * * * *");
});
