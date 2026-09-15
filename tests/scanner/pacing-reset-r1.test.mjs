// pacing-reset-r1 - reset confirmation and observe accounting for the shared
// Browse budget ledger, replaying the ACTUAL 2026-09-15 provider sequence
// through the real lease grant (acquireBrowseLease / settleBrowseLease), the
// real per-attempt guard (lib/ebay.fetchWithRetry -> consumeBrowseAttempt) and
// the real invocation finish (finishJobRun). Offline: no eBay, no database.
//
// Real sequence (production ledger + ebay_job_runs):
//   06:30:04  remaining 230, reset 2026-09-15T07:00Z (previous window's last reading)
//   07:00:00  remaining 230, reset 2026-09-16T07:00Z  <- new reset, old balance
//   07:00:04  verify reserves 20 on that reading, skips at its floor (0 attempts)
//   07:15:00  remaining 5000                            <- the reset, confirmed
//   07:15     sweep 16 attempts, images 4 attempts
//   07:30:02  getRateLimits failed (no reading): sweep ran unleased, 17 attempts
//   07:45:01  remaining 4990 (eBay had counted 10 of 37 attempts: provider lag)
import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";
import {
  acquireBrowseLease,
  settleBrowseLease,
  evaluateGrant,
  reconcile,
  emptyLedger,
  unconfirmedResetAtBirth,
  recordUnleasedAttempts,
  BROWSE_RESERVE,
  CONSUMER_CAPS,
} from "../../lib/browseBudget.js";
import { createMemoryDb } from "../harness/ingestion/memoryDb.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const require = createRequire(import.meta.url);
const telemetry = require(join(ROOT, "lib/ebayTelemetry.js"));
const ebay = require(join(ROOT, "lib/ebay.js"));

const END = Date.parse("2026-09-16T07:00:00.000Z");
const START = Date.parse("2026-09-15T07:00:00.000Z");
const PREV_END = START;
const t = (hhmmss) => Date.parse(`2026-09-15T${hhmmss}Z`);
const reading = (remaining, hhmmss, reset = END) => ({ limit: 5000, remaining, reset: new Date(reset).toISOString(), timeWindow: 86400, readAt: new Date(t(hhmmss)).toISOString() });
const kindOf = (mode, end = END) => `${mode === "enforce" ? "browse_budget:" : "browse_budget_observe:"}${new Date(end).toISOString()}`;
const TTL = 860_000;

// the previous window's rows as production left them: last reading 230 at 06:30:04;
// enforce configured long before that window ended (so only the balance decides activation)
function seededDb() {
  const db = createMemoryDb({ catalog_snapshot: [], ebay_job_runs: [] }, { unique: { catalog_snapshot: ["kind"] } });
  const prevWin = { id: new Date(PREV_END).toISOString(), windowEnd: PREV_END, windowStart: PREV_END - 24 * 3.6e6 };
  for (const mode of ["observe", "enforce"]) {
    db.tables.catalog_snapshot.push({
      kind: kindOf(mode, PREV_END),
      data: {
        ...emptyLedger(prevWin),
        state: mode === "enforce" ? "active" : null,
        enforceSeenAt: mode === "enforce" ? "2026-09-14T08:00:00.000Z" : null,
        used: { verify: 40 },
        lastObservation: { remaining: 230, limit: 5000, at: "2026-09-15T06:30:04.776Z" },
      },
      updated_at: "2026-09-15T06:30:05.290Z",
    });
  }
  return db;
}
const row = (db, mode) => db.tables.catalog_snapshot.find((r) => r.kind === kindOf(mode)).data;

test("PR-1 new reset with the old balance: unconfirmed, retained as evidence, nothing charged, no fresh balance assumed", async () => {
  for (const mode of ["observe", "enforce"]) {
    const db = seededDb();
    const v = await acquireBrowseLease(db, { key: "verify", requested: 20, observation: reading(230, "07:00:04"), now: t("07:00:04"), ttlMs: TTL, mode });
    const l = row(db, mode);
    assert.equal(l.reset.state, "unconfirmed", mode);
    assert.equal(l.reset.anomaly.remaining, 230);
    assert.equal(l.reset.anomaly.readAt, "2026-09-15T07:00:04.000Z");
    assert.equal(l.reset.previousClose.remaining, 230, "matches the previous window's close: the stale-counter signature");
    assert.equal(l.reserveAbsorbed, 0, "the 4,770 is not charged to the new window");
    assert.equal(l.lastObservation, null, "the unconfirmed balance is not applied");
    assert.equal(v.decision.granted, 0, "grants still see only the anomalous 230 - no fresh 5,000");
    assert.equal(v.decision.denied, "provider");
    assert.equal(v.effective, "observe", "observe never blocks; an unconfirmed enforce window keeps today's protections");
    assert.equal(v.granted, 20);
    if (mode === "enforce") {
      assert.equal(l.state, "unconfirmed");
      assert.equal(l.stateReason, "reset_unconfirmed");
    }
  }
});

test("PR-2 replay 230 -> 5000 -> lagging 4990 with overlapping invocations: confirmed once, activation not blocked, attempts and open reservations kept, no duplicate capacity", async () => {
  const db = seededDb();
  const mode = "enforce";
  // 07:00:04 verify reserves on the anomalous reading and stays open across the confirmation (attempts 0: it skipped at its floor)
  // (a 20-minute lease, so it is genuinely still open across the confirmation;
  // an 860 s lease would already have expired and been charged in full)
  const verify = await acquireBrowseLease(db, { key: "verify", requested: 20, observation: reading(230, "07:00:04"), now: t("07:00:04"), ttlMs: 20 * 60_000, mode });
  assert.equal(verify.lease.mode, "observe");

  // 07:15:00 sweep reads 5,000 -> the reset is confirmed as a stale counter, the window activates
  const sweep = await acquireBrowseLease(db, { key: "sweep:EBAY_US", requested: 25, minGrant: 6, observation: reading(5000, "07:15:00"), now: t("07:15:01"), ttlMs: TTL, mode });
  let l = row(db, mode);
  assert.equal(l.reset.state, "confirmed");
  assert.equal(l.reset.outcome, "stale_counter");
  assert.equal(l.reset.confirmedBy.remaining, 5000);
  assert.equal(l.reset.anomaly.remaining, 230, "the anomalous reading is still retained as evidence");
  assert.equal(l.state, "active", "activation is no longer blocked by the stale 230");
  assert.equal(l.stateReason, "confirmed_after_stale_reset_reading");
  assert.equal(l.reserveAbsorbed, 0);
  assert.equal(l.used.unattributed_at_birth ?? 0, 0);
  assert.equal(sweep.effective, "enforce");
  assert.equal(sweep.lease.mode, "enforce");
  assert.ok(l.open[verify.lease.id], "the reservation made during the transition is preserved");
  assert.equal(l.open[verify.lease.id].granted, 20);

  // overlapping invocation 1: it read the stale 230 at 07:14:30 and reaches the ledger after the confirmation
  const stale = await acquireBrowseLease(db, { key: "ingest", requested: 40, observation: reading(230, "07:14:30"), now: t("07:15:02"), ttlMs: TTL, mode });
  l = row(db, mode);
  assert.equal(stale.granted, 0, "an older reading cannot be used for new capacity");
  assert.equal(l.reserveAbsorbed, 0, "nor does it re-charge the stale balance as drift");
  assert.equal(l.lastObservation.at, "2026-09-15T07:15:00.000Z");
  assert.equal(l.state, "active");

  // overlapping invocation 2: fresh 5,000 while sweep (25) and verify (20) leases are open - both still count
  const images = await acquireBrowseLease(db, { key: "images", requested: 4, observation: reading(5000, "07:15:49"), now: t("07:15:49"), ttlMs: TTL, mode });
  assert.equal(images.granted, 4);
  l = row(db, mode);
  const ledgerBalance = 5000 - 0 - (25 + 20 + 4);
  assert.equal(Object.values(l.open).reduce((a, o) => a + o.granted, 0), 49, "every open reservation is still held");
  // a direct decision after the confirmation never exceeds what the ledger itself can account for
  const probe = evaluateGrant(structuredClone(l), { key: "allocated:EBAY_US", requested: 5000, observation: reading(5000, "07:15:50"), now: t("07:15:50") });
  // (the verifier's protected commitment is its cap minus its own open 20, which the ledger balance already counts)
  assert.equal(probe.providerLeft, ledgerBalance - BROWSE_RESERVE - (CONSUMER_CAPS.verify - 20));

  // settle what really happened: verify 0 attempts (floor skip), sweep 16, images 4
  verify.lease.attempts = 0;
  sweep.lease.attempts = 16;
  images.lease.attempts = 4;
  await settleBrowseLease(db, verify.lease, { now: t("07:15:30") });
  await settleBrowseLease(db, sweep.lease, { now: t("07:15:28") });
  await settleBrowseLease(db, images.lease, { now: t("07:15:56") });
  l = row(db, mode);
  assert.deepEqual({ verify: l.used.verify, sweep: l.used["sweep:EBAY_US"], images: l.used.images }, { verify: 0, sweep: 16, images: 4 }, "actual attempts, not grants, and nothing refunded");
  assert.deepEqual(l.open, {});

  // a later reading that repeats the stale counter is evidence, not consumption
  const repeat = await acquireBrowseLease(db, { key: "images", requested: 1, observation: reading(230, "07:20:00"), now: t("07:20:00"), ttlMs: TTL, mode });
  l = row(db, mode);
  assert.equal(repeat.granted, 0, "and it grants nothing");
  assert.equal(l.reset.staleRepeats, 1);
  assert.equal(l.reserveAbsorbed, 0);

  // 07:45:01 eBay shows 10 consumed while the ledger holds 20: provider lag, not unexplained consumption
  const lag = await acquireBrowseLease(db, { key: "sweep:EBAY_US", requested: 25, minGrant: 6, observation: reading(4990, "07:45:01"), now: t("07:45:01"), ttlMs: TTL, mode });
  l = row(db, mode);
  assert.deepEqual(l.lastDrift, { drift: -10, kind: "provider_lag", at: "2026-09-15T07:45:01.000Z" });
  assert.equal(l.reserveAbsorbed, 0);
  // the lagging counter cannot hand back the 20 calls the ledger knows were spent
  assert.equal(lag.decision.providerLeft, Math.min(4990 - 0, 5000 - 20) - BROWSE_RESERVE - CONSUMER_CAPS.verify);
  lag.lease.attempts = 8;
  await settleBrowseLease(db, lag.lease, { now: t("07:45:20") });
  // once eBay catches up and shows MORE than the ledger records, that is unexplained and charged (never given back)
  await acquireBrowseLease(db, { key: "images", requested: 1, observation: reading(4960, "08:00:00"), now: t("08:00:00"), ttlMs: TTL, mode });
  l = row(db, mode);
  assert.equal(l.lastDrift.kind, "unexplained");
  assert.equal(l.reserveAbsorbed, 40 - 28);
  await acquireBrowseLease(db, { key: "images", requested: 1, observation: reading(4990, "08:05:00"), now: t("08:05:00"), ttlMs: TTL, mode });
  assert.equal(row(db, mode).reserveAbsorbed, 12, "a later higher counter refunds nothing");
});

test("PR-3 genuine consumption: no jump by 30 minutes confirms the balance as real; drift is charged, enforce goes pending, and a later higher counter refunds nothing", async () => {
  const db = seededDb();
  const mode = "enforce";
  const v = await acquireBrowseLease(db, { key: "verify", requested: 20, observation: reading(230, "07:00:04"), now: t("07:00:04"), ttlMs: TTL, mode });
  v.lease.attempts = 0;
  await settleBrowseLease(db, v.lease, { now: t("07:00:10") });
  // 07:20: barely higher, too early to decide - still unconfirmed, nothing charged
  await acquireBrowseLease(db, { key: "verify", requested: 20, observation: reading(240, "07:20:00"), now: t("07:20:00"), ttlMs: TTL, mode });
  let l = row(db, mode);
  assert.equal(l.reset.state, "unconfirmed");
  assert.equal(l.reserveAbsorbed, 0);
  assert.ok(l.reset.pendingReadings >= 2);
  // 07:31: still no jump, 31 minutes after the anomalous reading - the consumption was real
  await acquireBrowseLease(db, { key: "verify", requested: 20, observation: reading(225, "07:31:00"), now: t("07:31:00"), ttlMs: TTL, mode });
  l = row(db, mode);
  assert.equal(l.reset.outcome, "consumption");
  assert.equal(l.state, "pending");
  assert.equal(l.stateReason, "prior_consumption_unaccounted");
  const charged = l.reserveAbsorbed;
  assert.ok(charged >= 4700, `charged ${charged}`);
  // later readings that are higher do not refund it, and the state never changes again
  await acquireBrowseLease(db, { key: "verify", requested: 20, observation: reading(5000, "08:00:00"), now: t("08:00:00"), ttlMs: TTL, mode });
  l = row(db, mode);
  assert.equal(l.reserveAbsorbed, charged);
  assert.equal(l.state, "pending");
  assert.equal(l.reset.outcome, "consumption");
});

test("PR-4 birth classification stays narrow: mid-window births, genuinely new counters and small consumption are confirmed at birth as before", () => {
  const win = { windowStart: START, windowEnd: END };
  assert.ok(unconfirmedResetAtBirth(win, reading(230, "07:00:00"), { remaining: 230 }, t("07:00:00")));
  assert.ok(unconfirmedResetAtBirth(win, reading(230, "07:00:00"), null, t("07:00:00")), "no previous evidence early in the window: unconfirmed");
  assert.equal(unconfirmedResetAtBirth(win, reading(4960, "07:05:00"), { remaining: 230 }, t("07:05:00")), null, "40 consumed: normal birth");
  assert.equal(unconfirmedResetAtBirth(win, reading(4600, "07:05:00"), { remaining: 900 }, t("07:05:00")), null, "higher than the old close: a new counter with real consumption");
  assert.equal(unconfirmedResetAtBirth(win, reading(2400, "08:30:00"), { remaining: 2600 }, t("08:30:00")), null, "not early in the window");
  // rows written before this change have no reset state and reconcile as before
  const legacy = { ...emptyLedger({ windowStart: START, windowEnd: END }), reset: undefined, used: { verify: 100 } };
  reconcile(legacy, { limit: 5000, remaining: 4700, readAt: new Date(t("09:00:00")).toISOString() });
  assert.equal(legacy.reserveAbsorbed, 200);
});

test("PR-5 the 07:30 metadata failure: enforce sends nothing without a lease; observe keeps running and its unleased attempts are charged once to the covering window", async (tt) => {
  const prevMode = process.env.BROWSE_BUDGET_MODE;
  const prevFetch = globalThis.fetch;
  tt.after(() => {
    process.env.BROWSE_BUDGET_MODE = prevMode;
    globalThis.fetch = prevFetch;
  });
  let sent = 0;
  globalThis.fetch = async () => {
    sent++;
    return new Response("{}", { status: 200 });
  };
  const inJob = (fn) => new Promise((resolve, reject) => setImmediate(() => { const ctx = telemetry.beginJobRun({ job: "refresh-deals:sweep", mode: "sweep", country: "EBAY_US" }); fn(ctx).then(resolve, reject); }));

  // enforce: the real acquire with no reading grants nothing, and every attempt without a lease is refused before it is sent
  {
    process.env.BROWSE_BUDGET_MODE = "enforce";
    const db = seededDb();
    const denied = await acquireBrowseLease(db, { key: "sweep:EBAY_US", requested: 25, minGrant: 6, observation: null, now: t("07:30:02"), ttlMs: TTL, mode: "enforce" });
    assert.equal(denied.granted, 0);
    assert.equal(denied.decision.denied, "window_unknown");
    await inJob(async (ctx) => {
      telemetry.attachBrowseLease(denied.lease);
      for (let i = 0; i < 17; i++) {
        await assert.rejects(() => ebay.fetchWithRetry("https://api.ebay.com/buy/browse/v1/item_summary/search?q=x", {}, { delayMs: 1 }), (e) => e.name === "BrowseBudgetExhaustedError");
      }
      assert.equal(ctx.unleasedBrowseAttempts ?? 0, 0, "nothing is sent, so nothing is accounted");
    });
    assert.equal(sent, 0, "enforce already blocks every Browse attempt without a valid lease");
  }

  // observe: same failure, never blocked; 17 attempts reach eBay and are charged to the 07:00 window's observe row, once
  {
    process.env.BROWSE_BUDGET_MODE = "observe";
    const db = seededDb();
    const first = await acquireBrowseLease(db, { key: "sweep:EBAY_US", requested: 25, minGrant: 6, observation: reading(5000, "07:15:00"), now: t("07:15:01"), ttlMs: TTL, mode: "observe" });
    first.lease.attempts = 16;
    await settleBrowseLease(db, first.lease, { now: t("07:15:28") });
    const unleased = await acquireBrowseLease(db, { key: "sweep:EBAY_US", requested: 25, minGrant: 6, observation: null, now: t("07:30:02"), ttlMs: TTL, mode: "observe" });
    assert.equal(unleased.granted, 25, "observe never blocks");
    assert.equal(unleased.lease, null);
    sent = 0;
    let ctxRef;
    await inJob(async (ctx) => {
      ctxRef = ctx;
      ctx.startedAt = new Date(t("07:30:02")).toISOString();
      telemetry.attachBrowseLease(unleased.lease);
      for (let i = 0; i < 17; i++) await ebay.fetchWithRetry("https://api.ebay.com/buy/browse/v1/item_summary/search?q=x", {}, { delayMs: 1 });
      assert.equal(ctx.unleasedBrowseAttempts, 17);
      await telemetry.finishJobRun(db, ctx);
    });
    assert.equal(sent, 17);
    let l = row(db, "observe");
    assert.equal(l.used["unleased:refresh-deals:sweep"], 17);
    assert.equal(l.used["sweep:EBAY_US"], 16, "leased attempts stay separate");
    assert.equal(l.counters.unleasedRuns, 1);
    assert.equal(db.tables.ebay_job_runs.at(-1).browse_calls, 17, "the job record still reports the same 17 responses");
    // no double counting: finishing again, or reconciling later, adds nothing
    await telemetry.finishJobRun(db, ctxRef);
    l = row(db, "observe");
    assert.equal(l.used["unleased:refresh-deals:sweep"], 17);
    // and the 07:45 lag reading now sees the unleased attempts too
    await acquireBrowseLease(db, { key: "sweep:EBAY_US", requested: 25, minGrant: 6, observation: reading(4990, "07:45:01"), now: t("07:45:01"), ttlMs: TTL, mode: "observe" });
    l = row(db, "observe");
    assert.deepEqual(l.lastDrift, { drift: 10 - 33, kind: "provider_lag", at: "2026-09-15T07:45:01.000Z" });
  }

  // no row covering the invocation's start (first invocation of a window, metadata down): reported, not guessed
  const empty = createMemoryDb({ catalog_snapshot: [] }, { unique: { catalog_snapshot: ["kind"] } });
  assert.deepEqual(await recordUnleasedAttempts(empty, { attempts: 17, job: "refresh-deals:sweep", startedAt: new Date(t("07:30:02")).toISOString() }), { recorded: false, reason: "no_ledger_row_for_time" });
});

test("PR-6 activation after a stale reset: a partly used open lease cannot hide unexplained provider spend, is never charged twice, and still counts in full against new grants", async () => {
  const seedUnconfirmed = async () => {
    const db = seededDb();
    await acquireBrowseLease(db, { key: "verify", requested: 20, observation: reading(230, "07:00:04"), now: t("07:00:04"), ttlMs: 60_000, mode: "enforce" });
    return db;
  };

  // A. 300-call allocated lease opened on the stale reading, 40 attempts made so far; eBay then shows 300 consumed
  //    = 40 from the lease + 260 unexplained. Subtracting the whole open grant would show 0 and activate.
  {
    const db = await seedUnconfirmed();
    const alloc = await acquireBrowseLease(db, { key: "allocated:EBAY_US", requested: 300, observation: reading(230, "07:00:30"), now: t("07:00:30"), ttlMs: 30 * 60_000, mode: "enforce" });
    alloc.lease.attempts = 40; // in-process; the ledger does not know this until settle
    await acquireBrowseLease(db, { key: "images", requested: 1, observation: reading(4700, "07:15:00"), now: t("07:15:00"), ttlMs: 60_000, mode: "enforce" });
    let l = row(db, "enforce");
    assert.equal(l.reset.outcome, "stale_counter", "the balance itself is confirmed");
    assert.equal(l.state, "unconfirmed", "but activation is not decided while an open grant could explain anything from 0 to 300");
    assert.equal(l.stateReason, "activation_awaiting_open_leases");
    assert.equal(l.used.unattributed_at_birth ?? 0, 0);
    // the unused part of the grant still protects capacity: counted in full for grants
    const g = evaluateGrant(structuredClone(l), { key: "sweep:EBAY_US", requested: 30, observation: reading(4700, "07:15:01"), now: t("07:15:01") });
    // ledger: verify's 60 s lease expired and was charged 20; open grants 300 (allocated) + 1 (images) count IN FULL
    assert.equal(g.providerLeft, 5000 - 20 - (300 + 1) - BROWSE_RESERVE - (CONSUMER_CAPS.verify - 20));
    // the lease settles with its real 40 attempts; the next reading shows 310 consumed (10 more lag)
    await settleBrowseLease(db, alloc.lease, { now: t("07:16:00") });
    await acquireBrowseLease(db, { key: "images", requested: 1, observation: reading(4690, "07:20:00"), now: t("07:20:00"), ttlMs: 60_000, mode: "enforce" });
    l = row(db, "enforce");
    assert.equal(l.state, "pending", "310 consumed - 40 settled = 270 unexplained: the spend is not hidden");
    assert.equal(l.stateReason, "prior_consumption_unaccounted");
    assert.equal(l.used["allocated:EBAY_US"], 40, "charged once, by its attempts");
  }

  // B. the same open lease really made 290 attempts (all eBay saw): after it settles the window activates, with no double charge
  {
    const db = await seedUnconfirmed();
    const alloc = await acquireBrowseLease(db, { key: "allocated:EBAY_US", requested: 300, observation: reading(230, "07:00:30"), now: t("07:00:30"), ttlMs: 30 * 60_000, mode: "enforce" });
    alloc.lease.attempts = 290;
    await acquireBrowseLease(db, { key: "images", requested: 1, observation: reading(4710, "07:15:00"), now: t("07:15:00"), ttlMs: 60_000, mode: "enforce" });
    assert.equal(row(db, "enforce").stateReason, "activation_awaiting_open_leases");
    await settleBrowseLease(db, alloc.lease, { now: t("07:16:00") });
    // eBay now shows 320 consumed; settled = verify 20 (expired lease, charged in full) + allocated 290 + images 1 (expired) = 311
    await acquireBrowseLease(db, { key: "images", requested: 1, observation: reading(4680, "07:20:00"), now: t("07:20:00"), ttlMs: 60_000, mode: "enforce" });
    const l = row(db, "enforce");
    assert.equal(l.state, "active");
    assert.equal(l.used["allocated:EBAY_US"], 290, "the lease is charged once, by its attempts");
    // upper = 320 - 311 = 9 <= 150; nothing open at the decision, so lower = 9 and only those 9 are charged - not 290 again
    assert.equal(l.used.unattributed_at_birth, 9);
  }

  // C. leases that never settle in time: fail closed
  {
    const db = await seedUnconfirmed();
    const alloc = await acquireBrowseLease(db, { key: "allocated:EBAY_US", requested: 300, observation: reading(230, "07:00:30"), now: t("07:00:30"), ttlMs: 90 * 60_000, mode: "enforce" });
    alloc.lease.attempts = 100;
    await acquireBrowseLease(db, { key: "images", requested: 1, observation: reading(4700, "07:15:00"), now: t("07:15:00"), ttlMs: 60_000, mode: "enforce" });
    await acquireBrowseLease(db, { key: "images", requested: 1, observation: reading(4690, "07:46:00"), now: t("07:46:00"), ttlMs: 60_000, mode: "enforce" });
    const l = row(db, "enforce");
    assert.equal(l.state, "pending");
    assert.equal(l.stateReason, "activation_unresolved_open_leases");
  }
});
