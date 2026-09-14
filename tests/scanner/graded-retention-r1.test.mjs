// graded-retention-r1 - up to two of verify-deals' existing 20 slots for
// active, display-eligible graded FIXED-PRICE rows approaching their real
// freshness cutoff. Pure allocator tests + structural checks on the route.
// No network; reservations run against the in-memory harness DB. NOW is the
// real clock because isDisplayableDeal reads it.

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
  GRADED_RETENTION_SLOTS,
} from "../../lib/verifyAllocator.mjs";
import {
  RETENTION_ATTEMPT_KIND_PREFIX,
  RETENTION_ATTEMPT_KEEP_HOURS,
  retentionAttemptKind,
  readRetentionCooldowns,
  reserveRetentionAttempt,
  recordRetentionResult,
  pruneRetentionAttempts,
} from "../../lib/gradedRetentionAttempts.mjs";
import { createMemoryDb } from "../harness/ingestion/memoryDb.mjs";

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
  assert.match(src, /batch: runBatch - recoveryRows\.length - sealed\.used,/, "card lanes still share one run batch (BATCH outside enforce mode)");
  assert.match(src, /retireForAvailability\(db, \{ key: \{ id: r\.id \}, reason, patch \}\)/, "SOLD / ENDED keep the quarantine-preserving write");
  assert.match(src, /"grader, grade"/);
  const cron = JSON.parse(read("vercel.json")).crons.find((c) => c.path === "/api/verify-deals");
  assert.equal(cron.schedule, "*/30 * * * *");
});

// ---- attempt reservations (UNKNOWN cooldown) ----

test("GR-8 reservations: atomic per exact eBay item; expired takeover only; result writes never overwrite a newer reservation or another row; pruning keeps live cooldowns", async () => {
  const db = createMemoryDb({ catalog_snapshot: [{ kind: "digest_state", data: { keep: 1 }, updated_at: iso(-100) }] }, { unique: { catalog_snapshot: ["kind"] } });
  const item = { listing_id: "v1|399999999001|0", listing_url: "https://www.ebay.com/itm/399999999001?x=1", affiliate_url: "https://www.ebay.com/itm/399999999001?x=1&campid=5" };
  const us = slab({ ...item, last_seen_at: iso(-22) });
  const gb = slab({ ...item, marketplace: "EBAY_GB", last_seen_at: iso(-21) });
  const key = retentionAttemptKey(us);
  assert.equal(retentionAttemptKey(gb), key, "marketplace copies share one item key");
  // two overlapping runs reserve the same item: exactly one wins
  const [a, b] = await Promise.all([
    reserveRetentionAttempt(db, key, { now: NOW, run: "run-a" }),
    reserveRetentionAttempt(db, key, { now: NOW, run: "run-b" }),
  ]);
  assert.equal([a, b].filter((r) => r.reserved).length, 1);
  assert.equal([a, b].find((r) => !r.reserved).reason, "cooldown");
  assert.deepEqual(await readRetentionCooldowns(db, { now: NOW + 0.5 * 3.6e6 }), new Set([key]));
  // inside the cooldown nobody can take it over
  assert.equal((await reserveRetentionAttempt(db, key, { now: NOW + 1.9 * 3.6e6, run: "run-c" })).reason, "cooldown");
  // after it, one takeover
  const later = await reserveRetentionAttempt(db, key, { now: NOW + 2.1 * 3.6e6, run: "run-d" });
  assert.equal(later.reserved, true);
  // the first run's late result must not overwrite the newer reservation
  const first = a.reserved ? a : b;
  assert.equal(await recordRetentionResult(db, key, { at: first.at, run: "old", status: "UNKNOWN" }), false);
  const rowNow = db.tables.catalog_snapshot.find((r) => r.kind === retentionAttemptKind(key));
  assert.equal(rowNow.data.run, "run-d");
  assert.equal(rowNow.data.status, null);
  assert.equal(await recordRetentionResult(db, key, { at: later.at, run: "run-d", status: "ACTIVE" }), true);
  assert.deepEqual(db.tables.catalog_snapshot.find((r) => r.kind === "digest_state").data, { keep: 1 }, "unrelated row untouched");
  // pruning: only rows older than the keep horizon go
  await reserveRetentionAttempt(db, "old-item", { now: NOW - (RETENTION_ATTEMPT_KEEP_HOURS + 1) * 3.6e6 });
  await pruneRetentionAttempts(db, { now: NOW + 2.2 * 3.6e6 });
  const kinds = db.tables.catalog_snapshot.map((r) => r.kind).sort();
  assert.deepEqual(kinds, ["digest_state", retentionAttemptKind(key)].sort());
  // the allocator honours blocked / allowed item keys
  const other = slab({ last_seen_at: iso(-20) });
  const blocked = allocateVerifyBatch({ pool: [us, gb, other], batch: 20, now: NOW, ...healthy, retentionBlocked: new Set([key]) });
  assert.deepEqual(blocked.gradedRetention.map((r) => r.id), [other.id], "both copies blocked; another listing uses the slot");
  const allowed = allocateVerifyBatch({ pool: [us, gb, other], batch: 20, now: NOW, ...healthy, retentionBlocked: new Set(), retentionAllowed: new Set([key]) });
  assert.deepEqual(allowed.gradedRetention.map((r) => r.id), [us.id], "only reserved items use the lane, one copy per item");
});

test("GR-9 real verify-deals route: UNKNOWN cooldown across invocations, expired takeover, fallback, unchanged ACTIVE write, persistence faults release the lane, overlapping runs never share an item", () => {
  const r = spawnSync(process.execPath, ["--no-warnings", "--import", "./tests/harness/ingestion/register.mjs", "tests/harness/ingestion/verifyRetention.mjs"], { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  assert.equal(r.status, 0, r.stderr);
  const { seed, sequence, faults, concurrent } = JSON.parse(r.stdout);
  const lane = (run) => run.checked.filter(([id]) => id < 100);
  const attemptKinds = (run) => Object.keys(run.record).filter((k) => k.startsWith(RETENTION_ATTEMPT_KIND_PREFIX));
  for (const run of [...sequence, ...faults, ...concurrent.runs]) {
    assert.equal(run.verified, 20, `${run.label}: total batch stays 20`);
    assert.equal(run.calls, 20, `${run.label}: one provider call per slot`);
    assert.ok(run.allocation.graded_retention_used <= 2);
  }
  for (const run of sequence) {
    assert.deepEqual(run.rows[5], seed[5], `${run.label}: review-held row never selected or changed`);
    assert.deepEqual(run.record.digest_state.data, { unrelated: true }, `${run.label}: unrelated catalog_snapshot row untouched`);
  }
  const [run1, run2, run3, run4] = sequence;
  // run 1: item A (US copy, nearest cutoff) and B reserved, then both UNKNOWN; A's GB copy is the same item
  assert.deepEqual(lane(run1), [[1, "UNKNOWN"], [3, "UNKNOWN"]]);
  for (const id of [1, 2, 3]) assert.deepEqual(run1.rows[id], seed[id], "UNKNOWN refreshes nothing");
  assert.deepEqual(attemptKinds(run1).sort(), [`${RETENTION_ATTEMPT_KIND_PREFIX}300000000001`, `${RETENTION_ATTEMPT_KIND_PREFIX}300000000003`]);
  assert.equal(run1.record[`${RETENTION_ATTEMPT_KIND_PREFIX}300000000003`].data.status, "UNKNOWN");
  // run 2 (+30 min): A and B in cooldown; C takes a slot and the other slot returns to general
  assert.deepEqual(lane(run2), [[4, "ACTIVE"]]);
  assert.equal(run2.rows[4].last_seen_at, run2.rows[4].exact_verified_at, "ACTIVE: the existing freshness write");
  assert.notEqual(run2.rows[4].last_seen_at, seed[4].last_seen_at);
  assert.equal(run2.rows[4].first_seen_at, seed[4].first_seen_at);
  // run 3 (+1 h): nothing reservable -> no lane slots
  assert.deepEqual(lane(run3), []);
  assert.equal(run3.allocation.graded_retention_slots, 0);
  // run 4 (+2 h 05): B's expired reservation is taken over; A has passed its cutoff and is not reactivated
  assert.deepEqual(lane(run4), [[3, "UNKNOWN"]]);
  assert.notEqual(run4.record[`${RETENTION_ATTEMPT_KIND_PREFIX}300000000003`].updated_at, run1.record[`${RETENTION_ATTEMPT_KIND_PREFIX}300000000003`].updated_at);
  assert.deepEqual(run4.rows[1], seed[1]);
  // persistence faults with eligible slabs: no reservation -> no lane lookup, no deals write, slots stay with the existing lanes
  for (const f of faults) {
    assert.deepEqual(lane(f), [], f.label);
    assert.equal(f.allocation.graded_retention_slots, 0, f.label);
    assert.equal(f.dealsWrites, 0, f.label);
    assert.equal(attemptKinds(f).length, 0, f.label);
  }
  // overlapping invocations: disjoint lane items, one reservation row per item, each owned by the run that checked it
  const [oa, ob] = concurrent.runs;
  const itemsA = lane(oa).map(([id]) => id);
  const itemsB = lane(ob).map(([id]) => id);
  assert.equal(itemsA.length + itemsB.length, 4);
  assert.equal(itemsA.filter((id) => itemsB.includes(id)).length, 0, "no item checked by both runs");
  const runs = new Set(Object.entries(concurrent.record).filter(([k]) => k.startsWith(RETENTION_ATTEMPT_KIND_PREFIX)).map(([, v]) => v.data.run));
  assert.equal(runs.size, 2);
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
