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
import { spawnSync } from "node:child_process";

import {
  allocateVerifyBatch,
  gradedRetentionCandidate,
  gradedRetentionSlots,
  retentionAttemptKey,
  normalizeRetentionAttempts,
  withRetentionAttempts,
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
    // not canonical art, so the BIN reserve (which fills first) leaves slabs to the lane
    card_tcgplayer_id: "syn-slab", listing_id: `v1|${legacy}|0`, marketplace: "EBAY_US",
    listing_url: `https://www.ebay.com/itm/${legacy}?x=1`,
    affiliate_url: `https://www.ebay.com/itm/${legacy}?x=1&campid=5`,
    disqualified_reason: null, visual_authenticity_status: null, visual_authenticity_reason: null,
    seller_feedback_score: 5000,
    first_seen_at: iso(-40), last_seen_at: iso(-18), exact_verified_at: null, ...over,
  };
};
const raw = (over = {}) => slab({ card_tcgplayer_id: "42360", is_graded: false, grader: null, grade: null, condition: "Near Mint", title: "Charizard GX 9/68 SM Hidden Fates Holo Rare", last_seen_at: iso(-1), ...over });
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
  const { batch, allocation, gradedRetention } = allocateVerifyBatch({ pool: [far, nearer, nearest, ...auctions], batch: 20, now: NOW, ...healthy });
  assert.equal(batch.length, 20, "total never exceeds the batch");
  assert.equal(allocation.graded_retention_slots, GRADED_RETENTION_SLOTS);
  assert.equal(allocation.graded_retention_used, 2);
  assert.deepEqual(gradedRetention.map((r) => r.id), [nearest.id, nearer.id]);
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

// ---- attempt record (UNKNOWN cooldown) ----

test("GR-8 attempt record: keyed by exact eBay item; cooldown two hours; survives a stored round trip; marketplace copies cannot evade it", () => {
  const item = { listing_id: "v1|399999999001|0", listing_url: "https://www.ebay.com/itm/399999999001?x=1", affiliate_url: "https://www.ebay.com/itm/399999999001?x=1&campid=5" };
  const us = slab({ id: 9001, ...item, marketplace: "EBAY_US", last_seen_at: iso(-23) });
  const gb = slab({ id: 9002, ...item, marketplace: "EBAY_GB", last_seen_at: iso(-14) }); // still AGING two hours later
  const other = slab({ id: 9003, last_seen_at: iso(-20) });
  assert.equal(retentionAttemptKey(us), "399999999001");
  assert.equal(retentionAttemptKey(gb), retentionAttemptKey(us));
  // one run: two copies of one item never take both slots
  const first = allocateVerifyBatch({ pool: [us, gb, other], batch: 20, now: NOW, ...healthy, retentionAttempts: { attempts: {} } });
  assert.deepEqual(first.gradedRetention.map((r) => r.id), [us.id, other.id]);
  // persisted as JSON (catalog_snapshot.data) and read back by a later run
  const stored = JSON.parse(JSON.stringify(withRetentionAttempts({ attempts: {} }, [us], { now: NOW })));
  const later = normalizeRetentionAttempts(stored);
  assert.equal(gradedRetentionCandidate(us, NOW + 0.5 * 3.6e6, { attempts: later }), false, "same row in cooldown");
  assert.equal(gradedRetentionCandidate(gb, NOW + 0.5 * 3.6e6, { attempts: later }), false, "other marketplace copy in cooldown");
  assert.equal(gradedRetentionCandidate(other, NOW + 0.5 * 3.6e6, { attempts: later }), true, "other listings can use the slot");
  assert.equal(gradedRetentionCandidate(gb, NOW + 2.05 * 3.6e6, { attempts: later }), true, "cooldown is bounded");
  assert.deepEqual(normalizeRetentionAttempts({ attempts: { x: { at: "nope" } } }), { attempts: {} }, "garbage never blocks");
});

test("GR-9 real verify-deals route over separate invocations: UNKNOWN cooldown, fallback, unchanged ACTIVE freshness write, holds untouched, unreadable record -> lane off", () => {
  const r = spawnSync(process.execPath, ["--no-warnings", "--import", "./tests/harness/ingestion/register.mjs", "tests/harness/ingestion/verifyRetention.mjs"], { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  assert.equal(r.status, 0, r.stderr);
  const { seed, runs } = JSON.parse(r.stdout);
  const lane = (run) => run.checked.filter(([id]) => id < 100);
  for (const run of runs) {
    assert.equal(run.verified, 20, `${run.label}: total batch stays 20`);
    assert.equal(run.calls, 20, `${run.label}: one provider call per slot, no extra calls`);
    assert.ok(run.allocation.graded_retention_used <= 2);
    assert.deepEqual(run.rows[5], seed[5], `${run.label}: review-held row never selected or changed`);
  }
  const [run1, run2, run3, run4, run5] = runs;
  // run 1: item A (US copy, nearest cutoff) + B; A's GB copy is the same item and is skipped. Both UNKNOWN.
  assert.deepEqual(lane(run1), [[1, "UNKNOWN"], [3, "UNKNOWN"]]);
  for (const id of [1, 2, 3]) assert.deepEqual(run1.rows[id], seed[id], "UNKNOWN refreshes nothing");
  assert.deepEqual(Object.keys(run1.record.attempts).sort(), ["300000000001", "300000000003"]);
  // run 2 (+30 min, separate invocation): A and B in cooldown; C takes a slot; the other returns to general
  assert.deepEqual(lane(run2), [[4, "ACTIVE"]]);
  assert.equal(run2.allocation.graded_retention_used, 1);
  assert.equal(run2.rows[4].last_seen_at, run2.rows[4].exact_verified_at, "ACTIVE: the existing freshness write");
  assert.notEqual(run2.rows[4].last_seen_at, seed[4].last_seen_at);
  assert.equal(run2.rows[4].first_seen_at, seed[4].first_seen_at);
  // run 3 (+1 h): nothing eligible -> every slot to the existing lanes
  assert.deepEqual(lane(run3), []);
  assert.equal(run3.allocation.graded_retention_used, 0);
  // run 4 (+2 h 05): cooldown over - B again; A has passed its cutoff and is neither selected nor reactivated
  assert.deepEqual(lane(run4), [[3, "UNKNOWN"]]);
  assert.deepEqual(run4.rows[1], seed[1]);
  // run 5: record unreadable -> lane takes 0 slots
  assert.equal(run5.allocation.graded_retention_slots, 0);
  assert.deepEqual(lane(run5), []);
});

// ---- protected lanes on a near-full batch ----

const critical = (over = {}) => auction({ auction_end_at: iso(1), exact_verified_at: iso(-0.2), ...over });
const binReserveRaw = (over = {}) => raw({ exact_verified_at: null, discount_pct: 0.4, ...over });
// graded rows without canonical art, so only the graded lane can take them
const laneSlab = (over = {}) => slab({ card_tcgplayer_id: "syn-slab", ...over });

test("GR-10 near-full batches: critical auctions and the BIN reserve are identical with the lane on or off; the lane only takes general slots", () => {
  const graded = [laneSlab({ last_seen_at: iso(-23) }), laneSlab({ last_seen_at: iso(-20) }), laneSlab({ last_seen_at: iso(-15) })];
  const bins = Array.from({ length: 15 }, () => binReserveRaw());
  const generalFodder = Array.from({ length: 10 }, () => auction({ exact_verified_at: null }));
  for (const nCritical of [0, 11, 12, 13, 18, 19, 20, 25]) {
    const pool = [...Array.from({ length: nCritical }, () => critical()), ...graded, ...bins, ...generalFodder];
    const on = allocateVerifyBatch({ pool, batch: 20, now: NOW, ...healthy });
    const off = allocateVerifyBatch({ pool, batch: 20, now: NOW, ...healthy, gradedSlots: 0 });
    const label = `critical=${nCritical}`;
    assert.equal(on.batch.length, off.batch.length, label);
    assert.ok(on.batch.length <= 20, label);
    assert.equal(on.allocation.critical_auctions, off.allocation.critical_auctions, `${label}: critical auctions unchanged`);
    assert.equal(on.allocation.bin_reserve_used, off.allocation.bin_reserve_used, `${label}: BIN reserve unchanged`);
    const protectedCount = off.allocation.critical_auctions + off.allocation.bin_reserve_used;
    assert.deepEqual(on.batch.slice(0, protectedCount).map((r) => r.id), off.batch.slice(0, protectedCount).map((r) => r.id), `${label}: protected rows identical`);
    const free = 20 - protectedCount;
    assert.equal(on.allocation.graded_retention_used, Math.min(2, Math.max(0, free)), `${label}: lane uses only what is left`);
    assert.equal(on.allocation.general_slots, off.allocation.general_slots - on.allocation.graded_retention_used, `${label}: displaces general slots only`);
  }
});

test("GR-11 GRADED_RETENTION_SLOTS = 0 leaves no graded step; with the lane on, a slab the BIN reserve already took is not picked twice", () => {
  const pool = [
    ...Array.from({ length: 5 }, () => critical()),
    laneSlab({ last_seen_at: iso(-22) }),
    slab({ card_tcgplayer_id: "42360", discount_pct: 0.5, last_seen_at: iso(-21) }), // canonical art, strongest discount: the BIN reserve takes it first
    ...Array.from({ length: 12 }, () => binReserveRaw()),
    ...Array.from({ length: 12 }, () => auction({ exact_verified_at: null })),
  ];
  const off = allocateVerifyBatch({ pool, batch: 20, now: NOW, ...healthy, gradedSlots: 0 });
  assert.equal(off.gradedRetention.length, 0);
  assert.equal(off.allocation.graded_retention_slots, 0);
  assert.equal(off.allocation.critical_auctions + off.allocation.bin_reserve_used + off.allocation.general_slots, off.batch.length);
  const on = allocateVerifyBatch({ pool, batch: 20, now: NOW, ...healthy });
  assert.equal(new Set(on.batch.map((r) => r.id)).size, on.batch.length, "deduplicated across lanes");
  assert.ok(on.gradedRetention.every((r) => r.card_tcgplayer_id === "syn-slab"), "the canonical-art slab stayed with the BIN reserve");
});
