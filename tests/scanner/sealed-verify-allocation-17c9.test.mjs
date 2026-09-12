// Phase 17C.9 - the bounded SEALED verification slice.
// The whole point is that total verification stays capped at BATCH and the
// Browse reserve is untouched: sealed slots are carved OUT of the existing
// 20, never added to them.
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  SEALED_MAX_PER_RUN,
  sealedVerifySlots,
  cardSlotsAfterSealed,
  allocateVerifyBatch,
  QUOTA_HEADROOM_FOR_BIN_RESERVE,
} from "../../lib/verifyAllocator.mjs";

const BATCH = 20;
const RESERVE = 800;
const HEALTHY = RESERVE + BATCH + QUOTA_HEADROOM_FOR_BIN_RESERVE + 50;

test("SV-1. nothing due -> no sealed slots, and the card lanes keep the whole batch", () => {
  const slots = sealedVerifySlots({ batch: BATCH, sealedDue: 0, quotaRemaining: HEALTHY, reserve: RESERVE });
  assert.equal(slots, 0, "today's real demand is zero - the lane costs nothing until rows re-home");
  assert.equal(cardSlotsAfterSealed(BATCH, slots), 20);
});

test("SV-2. with demand, the slice is bounded and total stays capped at BATCH", () => {
  for (const due of [1, 2, 3, 50, 138, 557]) {
    const slots = sealedVerifySlots({ batch: BATCH, sealedDue: due, quotaRemaining: HEALTHY, reserve: RESERVE });
    assert.ok(slots <= SEALED_MAX_PER_RUN, `never more than ${SEALED_MAX_PER_RUN} (due ${due} -> ${slots})`);
    assert.equal(slots, Math.min(due, SEALED_MAX_PER_RUN));
    assert.equal(slots + cardSlotsAfterSealed(BATCH, slots), BATCH, "a split, never an increase");
  }
});

test("SV-3. the slice scales to zero as Browse quota approaches the reserve floor", () => {
  const tight = RESERVE + BATCH; // no headroom beyond the batch itself
  assert.equal(sealedVerifySlots({ batch: BATCH, sealedDue: 138, quotaRemaining: tight, reserve: RESERVE }), 0);
  // and the card allocator is unaffected by the sealed carve-out existing
  assert.equal(cardSlotsAfterSealed(BATCH, 0), BATCH);
});

test("SV-4. 3 slots/run covers the post-re-home demand, and the displaced card capacity is explicit", () => {
  const RUNS_PER_DAY = 48; // vercel.json cron */30
  const dailySealed = SEALED_MAX_PER_RUN * RUNS_PER_DAY;
  const dailyTotal = BATCH * RUNS_PER_DAY;
  assert.equal(dailySealed, 144);
  assert.equal(dailyTotal, 960);
  assert.ok(dailySealed >= 138, "covers all 138 rows that become early once re-homed");
  assert.ok(dailySealed / dailyTotal <= 0.15 + 1e-9, "displaces at most 15% of card verification");
});

test("SV-5. the card allocator itself is unchanged when it is handed the reduced batch", () => {
  const now = Date.parse("2026-09-12T12:00:00Z");
  const pool = Array.from({ length: 40 }, (_, i) => ({
    id: i + 1,
    listing_type: "FIXED_PRICE",
    market_price: 120,
    discount_pct: 0.4,
    first_seen_at: "2026-09-01T00:00:00Z",
    last_seen_at: "2026-09-12T06:00:00Z",
    exact_verified_at: null,
    listing_url: "https://www.ebay.com/itm/1",
    affiliate_url: "https://www.ebay.com/itm/1",
    listing_id: "v1|1|0",
    is_active: true,
  }));
  const sealed = sealedVerifySlots({ batch: BATCH, sealedDue: 138, quotaRemaining: HEALTHY, reserve: RESERVE });
  const { batch } = allocateVerifyBatch({
    pool,
    batch: cardSlotsAfterSealed(BATCH, sealed),
    now,
    quotaRemaining: HEALTHY,
    reserve: RESERVE,
  });
  assert.equal(sealed, 3);
  assert.equal(batch.length, 17, "the card lanes get exactly the remainder");
  assert.equal(batch.length + sealed, BATCH, "one 20-call ceiling, split");
});
