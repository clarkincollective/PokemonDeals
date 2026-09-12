// Phase 17C.9 - the SEALED verification lane as app/api/verify-deals runs
// it, with the provider and the database injected. The route itself cannot
// be imported under node:test (it uses "@/" path aliases and next/cache),
// so the lane it delegates to is driven directly here, and the route's
// wiring of that lane is pinned by source assertions - the same technique
// the repo already uses for this file.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

import { runSealedVerifyLane, sealedVerifyPool, legacyOf } from "../../lib/sealedVerifyLane.mjs";
import { sealedVerifySlots, cardSlotsAfterSealed, SEALED_MAX_PER_RUN } from "../../lib/verifyAllocator.mjs";

const require = createRequire(import.meta.url);
const { isPositiveActiveConfirmation, SEEN_AGAIN, AVAILABILITY_RETIREMENT } = require("../../lib/listingAvailability.js");
const HERE = dirname(fileURLToPath(import.meta.url));
const ROUTE = readFileSync(join(HERE, "..", "..", "app", "api", "verify-deals", "route.js"), "utf8");

const BATCH = 20;
const RESERVE = 800;
const HEALTHY = 2000;
const NOW = Date.parse("2026-09-12T12:00:00Z");

// a stored sealed row that IS a verification candidate
const sealedRow = (over = {}) => ({
  id: 1,
  sealed_watchlist_id: 76,
  listing_id: "v1|1234567890|0",
  marketplace: "EBAY_US",
  title: "Pokemon Celebrations 25th Anniversary Elite Trainer Box Factory Sealed",
  market_price: 361.84,
  discount_pct: 0.3,
  price: 150,
  shipping: 0,
  currency: "USD",
  first_seen_at: "2026-09-01T00:00:00Z",
  last_seen_at: "2026-09-11T08:00:00Z",
  exact_verified_at: null,
  disqualified_reason: null,
  is_active: true,
  listing_type: "FIXED_PRICE",
  auction_end_at: null,
  listing_url: "https://www.ebay.com/itm/1234567890",
  affiliate_url: "https://www.ebay.com/itm/1234567890",
  sealed_watchlist: { name: "Celebrations Elite Trainer Box", set: "Celebrations", tcgplayer_id: "242811" },
  ...over,
});

// --- a fake PostgREST builder ---------------------------------------
function fakeDb(rows) {
  const store = rows.map((r) => ({ ...r }));
  const updates = [];
  return {
    rows: store,
    updates,
    from() {
      const q = { _f: [], _mode: "select", _patch: null, _limit: Infinity };
      const pass = (r) =>
        q._f.every(([op, col, val]) =>
          op === "eq" ? r[col] === val : op === "in" ? val.includes(r[col]) : op === "lte" ? String(r[col] ?? "") <= val : op === "gte" ? String(r[col] ?? "") >= val : true
        );
      q.select = () => q;
      q.eq = (c, v) => { q._f.push(["eq", c, v]); return q; };
      q.in = (c, v) => { q._f.push(["in", c, v]); return q; };
      q.lte = (c, v) => { q._f.push(["lte", c, v]); return q; };
      q.gte = (c, v) => { q._f.push(["gte", c, v]); return q; };
      q.order = () => q;
      q.limit = (n) => { q._limit = n; return q; };
      q.update = (patch) => { q._mode = "update"; q._patch = patch; return q; };
      q.then = (res, rej) =>
        (async () => {
          const hits = store.filter(pass).slice(0, q._limit);
          if (q._mode === "update") {
            for (const h of hits) {
              Object.assign(h, q._patch);
              updates.push({ id: h.id, patch: { ...q._patch } });
            }
            return { data: hits.map((h) => ({ id: h.id })), error: null };
          }
          return { data: hits.map((h) => ({ ...h })), error: null };
        })().then(res, rej);
      return q;
    },
  };
}
const snapshotter = (byId) => {
  const calls = [];
  const fn = async (legacy, marketplace) => {
    calls.push({ legacy, marketplace });
    return { calls: 1, ...(byId[legacy] ?? { status: "UNKNOWN", evidence: "rate_limited" }) };
  };
  fn.calls = calls;
  return fn;
};

// --- selection -------------------------------------------------------
test("VL-1. an eligible sealed row is selected and a positive confirmation PERSISTS", async () => {
  const db = fakeDb([sealedRow()]);
  const snap = snapshotter({ "1234567890": { status: "ACTIVE" } });
  const out = await runSealedVerifyLane({ db, getSnapshot: snap, maxSlots: 3, now: NOW });

  assert.equal(out.used, 1);
  assert.equal(out.calls, 1);
  assert.equal(out.results.ACTIVE, 1);
  const row = db.rows[0];
  assert.equal(row.exact_verified_at, row.last_seen_at, "both stamps are ONE instant");
  assert.equal(isPositiveActiveConfirmation(row), true, "this is the write that makes an early sealed row displayable");
});

test("VL-2. rows that are not verification candidates are never selected", () => {
  const now = NOW;
  // no legacy id in the listing_id -> not addressable by an exact lookup
  assert.equal(sealedVerifyPool([sealedRow({ listing_id: "nolegacy" })], now).length, 0);
  // already retired for availability -> not a candidate
  assert.equal(sealedVerifyPool([sealedRow({ disqualified_reason: AVAILABILITY_RETIREMENT.SOLD })], now).length, 0);
  // inactive
  assert.equal(sealedVerifyPool([sealedRow({ is_active: false })], now).length, 0);
  // wrong product identity (a 30th listing sitting on the 2021 product)
  assert.equal(
    sealedVerifyPool([sealedRow({ title: "Pokemon 30th Anniversary Celebrations Elite Trainer Box" })], now).length,
    0,
    "the identity gate keeps mis-bound rows out of the verifier too"
  );
  // a genuine one still is
  assert.equal(sealedVerifyPool([sealedRow()], now).length, 1);
  // never-verified sorts ahead of previously-verified
  const pool = sealedVerifyPool(
    [sealedRow({ id: 2, exact_verified_at: "2026-09-10T00:00:00Z" }), sealedRow({ id: 3, exact_verified_at: null })],
    now
  );
  assert.equal(pool[0].id, 3, "never-verified first");
});

// --- budget ----------------------------------------------------------
test("VL-3. card + sealed calls together never exceed the per-run budget", async () => {
  for (const [due, recovery] of [[0, 0], [1, 0], [5, 0], [5, 1], [50, 1]]) {
    const rows = Array.from({ length: due }, (_, i) => sealedRow({ id: i + 1, listing_id: `v1|90000${i}|0` }));
    const db = fakeDb(rows);
    const snap = snapshotter(Object.fromEntries(rows.map((_, i) => [`90000${i}`, { status: "ACTIVE" }])));
    const slots = sealedVerifySlots({ batch: BATCH - recovery, sealedDue: SEALED_MAX_PER_RUN, quotaRemaining: HEALTHY, reserve: RESERVE });
    const out = await runSealedVerifyLane({ db, getSnapshot: snap, maxSlots: slots, now: NOW });

    assert.ok(out.used <= SEALED_MAX_PER_RUN, `sealed slots capped (due ${due} -> ${out.used})`);
    assert.ok(out.used <= Math.min(due, SEALED_MAX_PER_RUN));
    // the route's arithmetic, verbatim
    const cardBatch = BATCH - recovery - out.used;
    assert.equal(cardBatch + out.used + recovery, BATCH, "one 20-call ceiling, split three ways");
    assert.ok(out.calls <= out.used, "one provider call per slot at most");
    assert.ok(out.calls + cardBatch + recovery <= BATCH, "combined budget never exceeded");
  }
});

test("VL-4. unused sealed slots are returned to the card lanes", async () => {
  // only ONE row due, but three slots were available
  const db = fakeDb([sealedRow()]);
  const snap = snapshotter({ "1234567890": { status: "ACTIVE" } });
  const slots = sealedVerifySlots({ batch: BATCH, sealedDue: SEALED_MAX_PER_RUN, quotaRemaining: HEALTHY, reserve: RESERVE });
  assert.equal(slots, 3);
  const out = await runSealedVerifyLane({ db, getSnapshot: snap, maxSlots: slots, now: NOW });
  assert.equal(out.used, 1, "only what was actually due");
  assert.equal(BATCH - out.used, 19, "the other two slots go back to cards, not wasted");
  assert.equal(cardSlotsAfterSealed(BATCH, out.used), 19);
});

test("VL-5. quota near the reserve floor gives sealed nothing, and the migration probe gates the lane", async () => {
  assert.equal(sealedVerifySlots({ batch: BATCH, sealedDue: SEALED_MAX_PER_RUN, quotaRemaining: RESERVE + BATCH, reserve: RESERVE }), 0);
  // and with the columns absent the lane is a no-op that consumes nothing
  const db = fakeDb([sealedRow()]);
  const snap = snapshotter({ "1234567890": { status: "ACTIVE" } });
  const out = await runSealedVerifyLane({ db, getSnapshot: snap, maxSlots: 3, now: NOW, columnsReady: false });
  assert.equal(out.used, 0);
  assert.equal(out.calls, 0);
  assert.equal(snap.calls.length, 0, "no provider call when there is nowhere to write the evidence");
});

// --- outcomes --------------------------------------------------------
test("VL-6. SOLD and ENDED retire the row with the reason that protects it from discovery", async () => {
  for (const [status, reason] of [
    ["SOLD", AVAILABILITY_RETIREMENT.SOLD],
    ["ENDED", AVAILABILITY_RETIREMENT.NOT_FOUND_IN_MARKETPLACE],
  ]) {
    const db = fakeDb([sealedRow()]);
    const out = await runSealedVerifyLane({ db, getSnapshot: snapshotter({ "1234567890": { status } }), maxSlots: 3, now: NOW });
    assert.equal(out.results[status], 1);
    const row = db.rows[0];
    assert.equal(row.is_active, false);
    assert.equal(row.disqualified_reason, reason, "the reason the guarded sighting checks");
    assert.ok(row.exact_verified_at, "the check time is stamped");
    // and that reason is exactly what makes a later sighting non-reviving
    assert.equal(isPositiveActiveConfirmation(row), false);
  }
});

test("VL-7. UNKNOWN changes no availability state and advances no confirmation timestamp", async () => {
  for (const evidence of ["rate_limited", "auth_error", "server_error", "network_error", "unparseable", "no_availability_data", "mixed_availability"]) {
    const db = fakeDb([sealedRow({ exact_verified_at: "2026-09-10T10:00:00Z", last_seen_at: "2026-09-11T08:00:00Z" })]);
    const before = { ...db.rows[0] };
    const out = await runSealedVerifyLane({ db, getSnapshot: snapshotter({ "1234567890": { status: "UNKNOWN", evidence } }), maxSlots: 3, now: NOW });
    assert.equal(out.results.UNKNOWN, 1);
    assert.equal(db.updates.length, 0, `no write at all on UNKNOWN (${evidence})`);
    assert.deepEqual(db.rows[0], before, "the row is byte-for-byte untouched");
    assert.equal(out.calls, 1, "the slot was still spent - it is retried on a later run");
  }
});

test("VL-8. recovery on UNKNOWN consumes ONLY the marker, and the row stays retryable", async () => {
  const retired = sealedRow({
    is_active: false,
    disqualified_reason: SEEN_AGAIN.SOLD,
    exact_verified_at: "2026-09-09T09:00:00Z",
    last_seen_at: "2026-09-09T09:00:00Z",
  });
  const db = fakeDb([retired]);
  const out = await runSealedVerifyLane({ db, getSnapshot: snapshotter({ "1234567890": { status: "UNKNOWN" } }), maxSlots: 3, now: NOW });

  assert.equal(out.recovery.checked, 1);
  assert.equal(out.recovery.retain, 1);
  const row = db.rows[0];
  // the ONLY change is the marker returning to its base family
  assert.equal(row.disqualified_reason, AVAILABILITY_RETIREMENT.SOLD, "marker consumed");
  assert.equal(row.is_active, false, "availability state unchanged");
  assert.equal(row.exact_verified_at, "2026-09-09T09:00:00Z", "confirmation time NOT advanced");
  assert.equal(row.last_seen_at, "2026-09-09T09:00:00Z", "last_seen_at NOT advanced");
  assert.equal(db.updates.length, 1);
  assert.deepEqual(Object.keys(db.updates[0].patch), ["disqualified_reason"], "one column, nothing else");

  // BOUNDED RETRY: consuming the marker is what stops a hot loop - the row
  // is not re-checked next run, it becomes eligible again only after
  // another sighting re-marks it.
  const second = await runSealedVerifyLane({ db, getSnapshot: snapshotter({ "1234567890": { status: "ACTIVE" } }), maxSlots: 3, now: NOW });
  assert.equal(second.recovery.checked, 0, "not re-checked in a loop");
  assert.equal(second.used, 0, "and it consumes no slot");
  // a later sighting re-marks it (lib/listingAvailability), making it due again
  db.rows[0].disqualified_reason = SEEN_AGAIN.SOLD;
  const live = { status: "ACTIVE", listingType: "FIXED_PRICE", price: 150, shipping: 0, currency: "USD" };
  const third = await runSealedVerifyLane({ db, getSnapshot: snapshotter({ "1234567890": live }), maxSlots: 3, now: NOW });
  assert.equal(third.recovery.checked, 1, "retryable once re-marked");
  assert.equal(third.recovery.reactivate, 1, "a positive answer AT THE STORED PRICE lifts the retirement");
  assert.equal(db.rows[0].is_active, true);
  assert.equal(db.rows[0].disqualified_reason, null);
});

test("VL-8b. an ACTIVE answer whose PRICE has moved releases the retirement but does not republish", async () => {
  const db = fakeDb([
    sealedRow({
      is_active: false,
      disqualified_reason: SEEN_AGAIN.SOLD,
      exact_verified_at: "2026-09-09T09:00:00Z",
      last_seen_at: "2026-09-09T09:00:00Z",
    }),
  ]);
  // live again, but at a different price than the stored deal
  const moved = { status: "ACTIVE", listingType: "FIXED_PRICE", price: 260, shipping: 0, currency: "USD" };
  const out = await runSealedVerifyLane({ db, getSnapshot: snapshotter({ "1234567890": moved }), maxSlots: 3, now: NOW });
  assert.equal(out.recovery.release, 1, "retirement lifted, but the stale price is not republished");
  assert.equal(db.rows[0].is_active, false, "the row stays inactive until a sighting re-qualifies it live");
  assert.equal(db.rows[0].disqualified_reason, null);
});

// --- the route's wiring ---------------------------------------------
test("VL-9. the route wires the lane into the SAME 20-call ceiling", () => {
  assert.match(ROUTE, /const BATCH = 20;/);
  assert.match(ROUTE, /const RESERVE = 800;/);
  assert.match(ROUTE, /rl\.remaining - BATCH < RESERVE/, "the existing quota guard is untouched");
  assert.match(ROUTE, /runSealedVerifyLane\(\{/, "the lane is actually called");
  assert.match(ROUTE, /maxSlots: sealedSlots/);
  assert.match(ROUTE, /sealedVerifySlots\(\{/);
  // slots come OUT of BATCH, and only what the lane USED is subtracted
  assert.match(ROUTE, /batch: BATCH - recoveryRows\.length - sealed\.used/);
  assert.match(ROUTE, /let calls = sealed\.calls/, "sealed calls count against the same ceiling");
  // the lane runs before the card allocator, so unused slots go back
  assert.ok(ROUTE.indexOf("runSealedVerifyLane({") < ROUTE.indexOf("allocateVerifyBatch({"), "lane runs first");
  // and no sealed provider call or sealed write was inlined into the route
  assert.doesNotMatch(ROUTE, /db\.from\("sealed_deals"\)/, "every sealed write lives in the lane module");
});
