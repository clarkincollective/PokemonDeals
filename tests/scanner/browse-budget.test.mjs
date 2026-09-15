// browse-budget-r1 - the shared Browse budget ledger: envelope, grant
// decisions, conservative reconciliation, reset boundary, and the per-attempt
// guard in lib/ebay.fetchWithRetry. Offline: no eBay, no production database.
// (Real-Postgres atomicity lives in browse-budget-postgres.test.mjs.)

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";

import {
  BROWSE_DAILY_LIMIT,
  BROWSE_RESERVE,
  CONSUMER_CAPS,
  CONSUMER_GROUP_CAPS,
  ALLOCATED_COUNTRY_CAPS,
  ALLOCATED_FIRST_PASS_SHARE,
  SWEEP_COUNTRY_CAPS,
  WINDOW_GUARD_MS,
  emptyLedger,
  evaluateGrant,
  expireLeases,
  reconcile,
  windowFromObservation,
  elapsedFraction,
  acquireBrowseLease,
  settleBrowseLease,
  unspentOpen,
  ensureManualBrowseAllowed,
  LEDGER_KIND_PREFIX,
} from "../../lib/browseBudget.js";
import { createMemoryDb } from "../harness/ingestion/memoryDb.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => readFileSync(join(ROOT, p), "utf8").replace(/\r\n/g, "\n");
const require = createRequire(import.meta.url);
const telemetry = require(join(ROOT, "lib/ebayTelemetry.js"));
const ebay = require(join(ROOT, "lib/ebay.js"));

const H = 3.6e6;
const END = Date.parse("2026-09-16T07:00:00.000Z");
const START = END - 24 * H;
const at = (hoursAfterReset) => START + hoursAfterReset * H;
const win = { id: new Date(END).toISOString(), windowEnd: END, windowStart: START };
const obs = (remaining) => ({ remaining, limit: 5000, reset: new Date(END).toISOString() });
const ledgerWith = (used = {}, open = {}) => ({ ...emptyLedger(win), used: { ...used }, open: { ...open } });
// An enforce ledger that is already ACTIVE for the window (as if born at a
// confirmed new window) - for tests of enforcement itself.
function activeDb(end = END) {
  const db = createMemoryDb({ catalog_snapshot: [] }, { unique: { catalog_snapshot: ["kind"] } });
  const w = { id: new Date(end).toISOString(), windowEnd: end, windowStart: end - 24 * H };
  db.tables.catalog_snapshot.push({
    kind: `browse_budget:${w.id}`,
    data: { ...emptyLedger(w), state: "active", stateReason: "test_seed", enforceSeenAt: new Date(w.windowStart).toISOString() },
    updated_at: new Date(w.windowStart).toISOString(),
  });
  return db;
}

test("BB-1 envelope: consumer caps + 420 reserve = 5,000; per-country caps sum to their group; sealed and manual unfunded", () => {
  const sum = (o) => Object.values(o).reduce((a, b) => a + b, 0);
  assert.equal(BROWSE_DAILY_LIMIT, 5000);
  assert.equal(BROWSE_RESERVE, 420);
  assert.deepEqual(
    { verify: 450, allocated: 2350, sweep: 1730, ingest: 40, images: 10, sealed: 0, manual: 0 },
    { ...CONSUMER_GROUP_CAPS }
  );
  assert.equal(sum(CONSUMER_CAPS), 4580);
  assert.equal(sum(ALLOCATED_COUNTRY_CAPS), 2350);
  assert.equal(sum(SWEEP_COUNTRY_CAPS), 1730);
  for (const c of ["EBAY_US", "EBAY_GB", "EBAY_CA", "EBAY_AU", "EBAY_DE", "EBAY_IT"]) {
    assert.ok(ALLOCATED_COUNTRY_CAPS[c] > 0 && SWEEP_COUNTRY_CAPS[c] > 0, `${c} has guaranteed allocated and sweep capacity`);
  }
  assert.equal(CONSUMER_CAPS.sealed, 0);
  assert.equal(evaluateGrant(ledgerWith(), { key: "sealed", requested: 50, observation: obs(5000), now: at(12) }).denied, "unfunded");
  assert.equal(evaluateGrant(ledgerWith(), { key: "manual", requested: 1, observation: obs(5000), now: at(12) }).denied, "unfunded");
});

test("BB-2 grants: cost is evaluated before granting; hard cap, pace (burst borrowed from the same cap) and provider balance all bind", () => {
  // pace: at reset only the 40-call burst; mid-window 225 + 40; never above the cap
  assert.equal(evaluateGrant(ledgerWith(), { key: "verify", requested: 100, observation: obs(5000), now: at(0) }).granted, 40);
  assert.equal(evaluateGrant(ledgerWith({ verify: 255 }), { key: "verify", requested: 20, observation: obs(5000), now: at(12) }).granted, 10);
  assert.equal(evaluateGrant(ledgerWith({ verify: 440 }), { key: "verify", requested: 20, observation: obs(5000), now: at(23.9) }).granted, 10, "cap binds");
  assert.equal(evaluateGrant(ledgerWith({ verify: 450 }), { key: "verify", requested: 20, observation: obs(5000), now: at(23.9) }).denied, "cap");
  // the request is evaluated whole: minGrant refuses a grant too small to be useful
  assert.equal(evaluateGrant(ledgerWith({ verify: 447 }), { key: "verify", requested: 20, minGrant: 5, observation: obs(5000), now: at(23.9) }).denied, "cap");
  // open (in-flight) leases count as fully spent
  const open = { a: { key: "verify", granted: 20, expiresAt: new Date(at(13)).toISOString() } };
  assert.equal(evaluateGrant(ledgerWith({ verify: 430 }, open), { key: "verify", requested: 20, observation: obs(5000), now: at(23.9) }).denied, "cap");
});

test("BB-3 reserve and verification protection: the 420 reserve is never granted; discovery cannot spend the verifier's unspent cap; verification and discovery are counted separately", () => {
  // provider balance 870 at hour 23, verifier has spent nothing: discovery sees 870 - 420 - 450 = 0
  const late = at(23);
  const d = evaluateGrant(ledgerWith({ "sweep:EBAY_US": 500 }), { key: "sweep:EBAY_US", requested: 25, observation: obs(870), now: late });
  assert.equal(d.denied, "provider");
  const v = evaluateGrant(ledgerWith({ "sweep:EBAY_US": 500 }), { key: "verify", requested: 20, observation: obs(870), now: late });
  assert.equal(v.granted, 20, "the verifier can still draw its own protected calls");
  // at exactly the reserve nobody gets anything
  assert.equal(evaluateGrant(ledgerWith({ verify: 450 }), { key: "verify", requested: 1, observation: obs(420), now: late }).denied, "cap");
  assert.equal(evaluateGrant(ledgerWith({ verify: 430 }), { key: "verify", requested: 1, observation: obs(420), now: late }).denied, "provider");
  assert.equal(evaluateGrant(ledgerWith({ verify: 450 }), { key: "ingest", requested: 1, observation: obs(420), now: late }).denied, "provider");
  // verifier spend never appears in a discovery consumer's pace or cap
  const heavyVerify = ledgerWith({ verify: 430 });
  assert.equal(evaluateGrant(heavyVerify, { key: "sweep:EBAY_GB", requested: 26, observation: obs(4000), now: at(12) }).granted, 26);
});

test("BB-4 allocated country progress: each market has its own durable cap; a first pass takes at most its share; an early market cannot consume a later one", () => {
  const firstHalf = at(1);
  // alloc-rev2: every first-pass share is 1 - the US first pass may take its whole 650 cap, never more
  assert.deepEqual({ ...ALLOCATED_FIRST_PASS_SHARE }, { EBAY_US: 1, EBAY_GB: 1, EBAY_CA: 1, EBAY_AU: 1, EBAY_DE: 1, EBAY_IT: 1 });
  assert.equal(evaluateGrant(ledgerWith(), { key: "allocated:EBAY_US", requested: 773, observation: obs(5000), now: firstHalf }).granted, 650);
  // US has spent its cap; IT (first pass at hour 10) still has its whole cap
  const afterUs = ledgerWith({ "allocated:EBAY_US": 650 });
  assert.equal(evaluateGrant(afterUs, { key: "allocated:EBAY_US", requested: 100, observation: obs(4300), now: at(2) }).denied, "cap");
  assert.equal(evaluateGrant(afterUs, { key: "allocated:EBAY_IT", requested: 400, observation: obs(4300), now: at(10) }).granted, 300);
  // second half: nothing beyond the cap for the US second pass
  assert.equal(evaluateGrant(afterUs, { key: "allocated:EBAY_US", requested: 700, observation: obs(3000), now: at(13) }).denied, "cap");
  // a first pass smaller than its cap leaves only the remainder for the second pass
  assert.equal(evaluateGrant(ledgerWith({ "allocated:EBAY_US": 609 }), { key: "allocated:EBAY_US", requested: 642, observation: obs(3000), now: at(13) }).granted, 41);
});

test("BB-5 conservative reconciliation: an expired lease is charged in full; more observed consumption ratchets the reserve absorption; less is never given back", () => {
  const l = ledgerWith({ verify: 100 }, { crashed: { key: "verify", granted: 20, expiresAt: new Date(at(5)).toISOString() } });
  expireLeases(l, at(6));
  assert.equal(l.used.verify, 120, "a crashed / timed-out lease is charged its whole grant");
  assert.deepEqual(l.open, {});
  reconcile(l, obs(5000 - 300), at(6)); // eBay saw 300; ledger accounts 120
  assert.equal(l.reserveAbsorbed, 180);
  reconcile(l, obs(5000 - 150), at(7)); // a lower reading never restores anything
  assert.equal(l.reserveAbsorbed, 180);
  assert.equal(l.used.verify, 120);
});

test("BB-6 reset boundary: the window comes from eBay's reported reset; no grant in the guard band; a stale or missing reset denies in enforce and never blocks in observe", async () => {
  assert.equal(windowFromObservation({ reset: "nonsense" }, at(1)), null);
  assert.equal(windowFromObservation({ reset: new Date(END).toISOString() }, END + 1000), null, "a reset in the past is not a window");
  const db = createMemoryDb({ catalog_snapshot: [] }, { unique: { catalog_snapshot: ["kind"] } });
  const near = END - WINDOW_GUARD_MS + 1000;
  const e = await acquireBrowseLease(db, { key: "verify", requested: 20, observation: obs(4000), now: near, ttlMs: 60_000, mode: "enforce" });
  assert.equal(e.granted, 0);
  assert.equal(e.decision.denied, "window_boundary");
  const unknown = await acquireBrowseLease(db, { key: "verify", requested: 20, observation: { remaining: 4000 }, now: at(3), ttlMs: 60_000, mode: "enforce" });
  assert.equal(unknown.decision.denied, "window_unknown");
  const observe = await acquireBrowseLease(db, { key: "verify", requested: 20, observation: { remaining: 4000 }, now: at(3), ttlMs: 60_000, mode: "observe" });
  assert.equal(observe.granted, 20, "observe never blocks");
  // a lease never outlives its window's guard instant
  const ok = await acquireBrowseLease(db, { key: "verify", requested: 20, observation: obs(4000), now: END - 10 * 60_000, ttlMs: 30 * 60_000, mode: "enforce" });
  assert.equal(ok.lease.expiresAt, END - WINDOW_GUARD_MS);
  assert.equal(ok.lease.guardAt, END - WINDOW_GUARD_MS);
  // the next window is a different row that starts empty
  const next = { remaining: 5000, limit: 5000, reset: new Date(END + 24 * H).toISOString() };
  const n = await acquireBrowseLease(db, { key: "verify", requested: 20, observation: next, now: END + 60_000, ttlMs: 60_000, mode: "enforce" });
  assert.notEqual(n.lease.kind, ok.lease.kind);
  assert.equal(n.granted, 20);
});

test("BB-7 settle charges started attempts and releases only unsent units; a late settle after expiry restores nothing; contention never double-grants (in-memory interleaving)", async () => {
  const db = activeDb();
  const now = at(23.5);
  const a = await acquireBrowseLease(db, { key: "verify", requested: 20, observation: obs(4000), now, ttlMs: 60_000, mode: "enforce" });
  a.lease.attempts = 7;
  const s = await settleBrowseLease(db, a.lease, { now: now + 1000 });
  assert.deepEqual(s, { settled: true, charged: 7, released: 13 });
  const b = await acquireBrowseLease(db, { key: "verify", requested: 20, observation: obs(4000), now: now + 2000, ttlMs: 60_000, mode: "enforce" });
  b.lease.attempts = 3;
  const late = await settleBrowseLease(db, b.lease, { now: now + 2000 + 120_000 });
  assert.equal(late.reason, "expired_charged_in_full");
  const row = db.tables.catalog_snapshot.find((r) => r.kind === a.lease.kind);
  assert.equal(row.data.used.verify, 27, "7 settled + 20 charged in full for the expired lease");
  // 60 interleaved acquisitions for one 990-call sweep cap
  const results = await Promise.all(
    Array.from({ length: 60 }, (_, i) => acquireBrowseLease(db, { key: "sweep:EBAY_US", requested: 25, minGrant: 6, observation: obs(4000), now: at(23.5) + 5000 + i, ttlMs: 600_000, mode: "enforce" }))
  );
  const granted = results.reduce((t, r) => t + r.granted, 0);
  const ledger = db.tables.catalog_snapshot.find((r) => r.kind === a.lease.kind).data;
  const openSweep = Object.values(ledger.open).filter((l) => l.key === "sweep:EBAY_US").reduce((t, l) => t + l.granted, 0);
  assert.ok(granted <= 990, `granted ${granted} <= cap`);
  assert.equal(openSweep, granted, "every granted unit is recorded exactly once");
});

test("BB-8 per-attempt guard: retries draw from the lease; nothing is sent beyond it, without it, or inside the reset guard band; off/observe unchanged", async (t) => {
  const prevMode = process.env.BROWSE_BUDGET_MODE;
  const prevFetch = globalThis.fetch;
  t.after(() => {
    process.env.BROWSE_BUDGET_MODE = prevMode;
    globalThis.fetch = prevFetch;
  });
  let sent = 0;
  let status = 503;
  globalThis.fetch = async () => {
    sent++;
    return new Response("x", { status });
  };
  const run = (fn) => new Promise((resolve, reject) => setImmediate(() => { telemetry.beginJobRun({ job: "test" }); fn().then(resolve, reject); }));
  const lease = (granted, guardAt = Date.now() + H) => ({ mode: "enforce", granted, attempts: 0, guardAt });

  process.env.BROWSE_BUDGET_MODE = "enforce";
  // a 5xx first attempt plus its retry = 2 units
  await run(async () => {
    const l = lease(2);
    telemetry.attachBrowseLease(l);
    const res = await ebay.fetchWithRetry("https://api.ebay.com/buy/browse/v1/x", {}, { delayMs: 1 });
    assert.equal(res.status, 503);
    assert.equal(l.attempts, 2);
    assert.equal(sent, 2);
  });
  // a lease of 1: the retry is refused and the response in hand is returned - no second request
  sent = 0;
  await run(async () => {
    const l = lease(1);
    telemetry.attachBrowseLease(l);
    const res = await ebay.fetchWithRetry("https://api.ebay.com/buy/browse/v1/x", {}, { delayMs: 1 });
    assert.equal(res.status, 503);
    assert.equal(sent, 1);
  });
  // exhausted lease, no lease, guard band: nothing is sent
  sent = 0;
  for (const l of [lease(0), null, lease(5, Date.now() - 1)]) {
    await run(async () => {
      telemetry.attachBrowseLease(l);
      await assert.rejects(() => ebay.fetchWithRetry("https://api.ebay.com/buy/browse/v1/x", {}, { delayMs: 1 }), (e) => e.name === "BrowseBudgetExhaustedError");
    });
  }
  assert.equal(sent, 0);
  // parallel attempts inside one invocation never exceed the grant
  status = 200;
  await run(async () => {
    const l = lease(7);
    telemetry.attachBrowseLease(l);
    const outcomes = await Promise.allSettled(Array.from({ length: 30 }, () => ebay.fetchWithRetry("https://api.ebay.com/buy/browse/v1/x", {}, { delayMs: 1 })));
    assert.equal(outcomes.filter((o) => o.status === "fulfilled").length, 7);
    assert.equal(sent, 7);
    assert.equal(telemetry.browseLeaseExhausted(), true);
  });
  // off and observe: never refused; observe counts attempts on the lease
  sent = 0;
  process.env.BROWSE_BUDGET_MODE = "observe";
  await run(async () => {
    const l = lease(1);
    telemetry.attachBrowseLease(l);
    await Promise.all([1, 2, 3].map(() => ebay.fetchWithRetry("https://api.ebay.com/buy/browse/v1/x", {}, { delayMs: 1 })));
    assert.equal(l.attempts, 3);
    assert.equal(telemetry.browseLeaseExhausted(), false);
  });
  process.env.BROWSE_BUDGET_MODE = "off";
  await run(async () => {
    await ebay.fetchWithRetry("https://api.ebay.com/buy/browse/v1/x", {}, { delayMs: 1 });
  });
  assert.equal(sent, 4);
});

test("BB-9 every scheduled Browse route reserves before calling eBay and settles in finally; allocated stops taking cards when its lease is spent; retained floors stay in the source", () => {
  const routes = {
    "app/api/verify-deals/route.js": ['key: "verify"'],
    "app/api/refresh-deals/route.js": ["key: `sweep:${marketplaceId}`", "key: `allocated:${allocatedCountry}`", 'key: "manual"'],
    "app/api/ingest-feed/route.js": ['key: "ingest"'],
    "app/api/screen-deal-images/route.js": ['key: "images"'],
    "app/api/refresh-sealed-deals/route.js": ['key: "sealed"'],
  };
  for (const [file, keys] of Object.entries(routes)) {
    const src = read(file);
    for (const k of keys) assert.ok(src.includes(k), `${file} reserves ${k}`);
    assert.match(src, /attachBrowseLease\(budgetLease\)/, `${file} attaches the lease`);
    assert.match(src, /\} finally \{\s*await finishJobRun\(db, ctx\);/, `${file} settles through finishJobRun in finally`);
  }
  const refresh = read("app/api/refresh-deals/route.js");
  assert.match(refresh, /if \(browseLeaseExhausted\(\)\) break;\s*\n\s*await scanOneCard\(row\);/);
  assert.match(refresh, /const RATE_LIMIT_FLOORS = \{ sweep: 250, priority: 600, extended: 1500, allocated: 1200, default: 250 \};/);
  assert.match(read("app/api/ingest-feed/route.js"), /const RATE_LIMIT_FLOOR = 800;/);
  const verify = read("app/api/verify-deals/route.js");
  assert.ok(/const enforcing = budget\.effective === "enforce";\s*\n\s*if \(!enforcing\) \{\s*\n(?:\s*\/\/.*\n)*\s*if \(rl\.remaining - BATCH < RESERVE\)/.test(verify), "the 800 floor applies unless the window is actively enforcing");
  assert.match(read("lib/ebay.js"), /if \(!consumeBrowseAttempt\(\)\) \{/);
  assert.match(read("lib/ebayTelemetry.js"), /if \(!db\) return;\s*\n(?:\s*\/\/.*\n)*\s*if \(ctx\.browseLease\?\.kind\) \{\s*\n\s*await require\("\.\/browseBudget"\)\.settleBrowseLease\(db, ctx\.browseLease\)\.catch\(\(\) => \{\}\);/, "finishJobRun settles the lease");
});

test("BB-10 real verify-deals route under enforce: calls never exceed the grant; critical auctions keep priority within the calls actually granted; optional lanes yield when the verifier cap runs low; a crashed lease is charged in full; observe never blocks", async () => {
  const { spawnSync } = await import("node:child_process");
  const r = spawnSync(process.execPath, ["--no-warnings", "--import", "./tests/harness/ingestion/register.mjs", "tests/harness/ingestion/verifyBudget.mjs"], { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  assert.equal(r.status, 0, r.stderr);
  const { runs, crashGranted } = JSON.parse(r.stdout);
  const [fresh, used700, used715, used718, afterCrash, observe] = runs;
  const critical = (run) => run.checkedIds.filter((id) => id <= 5).length;
  assert.equal(fresh.budget.granted, 20);
  assert.equal(fresh.calls, 19, "one unit held back for a retry");
  assert.ok(fresh.calls <= fresh.budget.granted);
  assert.equal(critical(fresh), 5);
  assert.ok(fresh.allocation.graded_retention_used <= 2);
  assert.equal(fresh.ledger.used.verify, 19, "settled attempts only; the unused unit is released");
  assert.equal(used700.calls, 19);
  assert.equal(used700.allocation.graded_retention_slots, 0, "optional lanes yield near the verifier cap");
  assert.equal(used700.allocation.bin_reserve_used, 0);
  assert.equal(critical(used700), 5);
  assert.equal(used715.budget.granted, 5);
  assert.equal(used715.calls, 5);
  assert.equal(critical(used715), 5, "the 5 granted calls go to critical auctions");
  assert.equal(used715.ledger.used.verify, 450);
  assert.equal(used718.skipped, "browse_budget");
  assert.equal(used718.calls, 0);
  assert.equal(crashGranted, 20);
  assert.equal(afterCrash.ledger.counters.expired, 1);
  assert.equal(afterCrash.ledger.used.verify, 100 + 20 + afterCrash.calls, "the crashed lease is charged its whole grant");
  assert.equal(observe.skipped, null);
  assert.equal(observe.calls, 20, "observe mode keeps today's batch");
  assert.equal(observe.ledger.used.verify, 20, "observe records real attempts in its own row");
});


test("BB-11 provider window input: the retained real reading maps to the ledger window; zone, elapsed and the reset-2-minute deadline are exact; malformed or stale metadata never creates a budget", async () => {
  // real reading via getBrowseRateLimit (.social-preview/operator-dashboard/dashboard.json)
  const readAt = Date.parse("2026-09-08T03:48:04.560Z");
  const real = { limit: 5000, remaining: 240, reset: "2026-09-08T07:00:00.000Z" };
  const w = windowFromObservation(real, readAt);
  assert.equal(w.id, "2026-09-08T07:00:00.000Z");
  assert.equal(new Date(w.windowStart).toISOString(), "2026-09-07T07:00:00.000Z");
  assert.equal(w.windowSource, "default_86400s");
  const l = emptyLedger(w);
  assert.equal(Math.round(elapsedFraction(l, readAt) * 10000) / 10000, 0.8667, "20.8 h into the 24 h window");
  // the same instant written with an offset names the same window
  assert.equal(windowFromObservation({ ...real, reset: "2026-09-08T09:00:00.000+02:00" }, readAt).id, w.id);
  // provider timeWindow (e.g. a 25 h window at the end of US daylight saving) is used, not assumed
  const dst = windowFromObservation({ reset: "2026-11-02T08:00:00.000Z", timeWindow: 90000 }, Date.parse("2026-11-01T12:00:00Z"));
  assert.equal(new Date(dst.windowStart).toISOString(), "2026-11-01T07:00:00.000Z");
  assert.equal(dst.windowSource, "provider_timeWindow");
  for (const bad of [
    { reset: Date.parse(real.reset) }, // epoch number
    { reset: "2026-09-08T07:00:00" }, // no zone: Date.parse would use local time
    { reset: "2026-09-08 07:00:00Z" },
    { reset: "" },
    { reset: null },
    {},
    { reset: "2026-09-07T07:00:00.000Z" }, // stale: already passed
    { reset: "2026-09-10T07:00:00.000Z" }, // not the current window
  ]) {
    assert.equal(windowFromObservation({ limit: 5000, remaining: 4000, ...bad }, readAt), null, JSON.stringify(bad));
    const db = createMemoryDb({ catalog_snapshot: [] }, { unique: { catalog_snapshot: ["kind"] } });
    const r = await acquireBrowseLease(db, { key: "verify", requested: 20, observation: { limit: 5000, remaining: 4000, ...bad }, now: readAt, ttlMs: 180_000, mode: "enforce" });
    assert.equal(r.granted, 0);
    assert.equal(r.decision.denied, "window_unknown");
    assert.equal(db.tables.catalog_snapshot.length, 0, "no ledger row is created");
  }
  // the lease deadline is reset - 2 min, for a lease taken 5 minutes before the reset
  const db = activeDb(Date.parse(real.reset));
  const late = await acquireBrowseLease(db, { key: "verify", requested: 20, observation: { ...real, remaining: 4000 }, now: Date.parse("2026-09-08T06:55:00.000Z"), ttlMs: 180_000, mode: "enforce" });
  assert.equal(new Date(late.lease.expiresAt).toISOString(), "2026-09-08T06:58:00.000Z");
  assert.equal(new Date(late.lease.guardAt).toISOString(), "2026-09-08T06:58:00.000Z");
});

test("BB-12 mode transitions: observe or enforce starting mid-window never lays a fresh allowance over earlier usage; enforce activates only at a confirmed new window; old and new invocations only touch their own rows", async () => {
  const db = createMemoryDb({ catalog_snapshot: [] }, { unique: { catalog_snapshot: ["kind"] } });
  const W = END; // window W ends at END
  const W1 = END + 24 * H; // the next window
  const obsW = (remaining, readAt) => ({ limit: 5000, remaining, reset: new Date(W).toISOString(), readAt: new Date(readAt).toISOString() });
  const obsW1 = (remaining, readAt) => ({ limit: 5000, remaining, reset: new Date(W1).toISOString(), readAt: new Date(readAt).toISOString() });

  // 1. observe deployed ~18 h into W, after 2,600 calls: records from here, never blocks
  const t1 = at(17.95);
  const o = await acquireBrowseLease(db, { key: "sweep:EBAY_US", requested: 25, observation: obsW(2400, t1), now: t1, ttlMs: 860_000, mode: "observe" });
  assert.equal(o.effective, "observe");
  assert.equal(o.granted, 25);
  const oRow = db.tables.catalog_snapshot.find((r) => r.kind === o.lease.kind);
  assert.equal(oRow.data.state, null, "observe rows have no enforce state");
  assert.equal(oRow.data.reserveAbsorbed, 2600, "prior usage is visible as unaccounted - in the observe row only");

  // 2. enforce switched on 3 minutes later, while that observe invocation is still running: the enforce row is born
  //    PENDING - today's protections, recorded, no refusals
  const t2 = at(18);
  const e = await acquireBrowseLease(db, { key: "sweep:EBAY_US", requested: 25, observation: obsW(2380, t2), now: t2, ttlMs: 860_000, mode: "enforce" });
  const eRow = db.tables.catalog_snapshot.find((r) => r.kind === `browse_budget:${new Date(W).toISOString()}`);
  assert.equal(eRow.data.state, "pending");
  assert.equal(eRow.data.stateReason, "enforce_not_configured_in_previous_window");
  assert.equal(e.effective, "observe");
  assert.equal(e.granted, 25, "no refusal in a pending window");
  assert.equal(e.lease.mode, "observe");
  assert.equal(eRow.data.hypothetical["sweep:EBAY_US"].requests, 1, "enforce's hypothetical decision is recorded");
  assert.deepEqual(eRow.data.used, {}, "no fresh allowance is initialised over the 2,620 calls already consumed");
  assert.notEqual(o.lease.kind, e.lease.kind, "the observe ledger is never promoted into the enforce ledger");

  // 3. old (observe) and new (enforce) invocations overlap: each settles only its own row
  o.lease.attempts = 11;
  e.lease.attempts = 9;
  await settleBrowseLease(db, o.lease, { now: t2 + 1000 });
  await settleBrowseLease(db, e.lease, { now: t2 + 2000 });
  assert.equal(db.tables.catalog_snapshot.find((r) => r.kind === o.lease.kind).data.used["sweep:EBAY_US"], 11);
  assert.equal(db.tables.catalog_snapshot.find((r) => r.kind === e.lease.kind).data.used["sweep:EBAY_US"], 9);

  // 4. a deployment restart kills an invocation mid-lease: charged in full when it expires, in ITS window only
  const killed = await acquireBrowseLease(db, { key: "verify", requested: 20, observation: obsW(850, at(20)), now: at(20), ttlMs: 180_000, mode: "enforce" });
  // 5. W+1 is born ACTIVE: enforce was configured 6 h before W ended; eBay shows 40 calls consumed at birth
  const t5 = W + 5 * 60_000;
  const a = await acquireBrowseLease(db, { key: "verify", requested: 20, observation: obsW1(4960, t5), now: t5, ttlMs: 180_000, mode: "enforce" });
  const aRow = db.tables.catalog_snapshot.find((r) => r.kind === `browse_budget:${new Date(W1).toISOString()}`);
  assert.equal(aRow.data.state, "active");
  assert.equal(aRow.data.stateReason, "confirmed_new_window");
  assert.equal(aRow.data.used.unattributed_at_birth, 40, "calls consumed before the first record are accounted, not reserve drift");
  assert.equal(aRow.data.reserveAbsorbed, 0);
  assert.equal(a.effective, "enforce");
  assert.equal(a.lease.mode, "enforce");
  // the killed W lease settles late: W's row only, charged in full, W+1 untouched
  killed.lease.attempts = 2;
  assert.equal((await settleBrowseLease(db, killed.lease, { now: t5 })).reason, "expired_charged_in_full");
  assert.equal(db.tables.catalog_snapshot.find((r) => r.kind === killed.lease.kind).data.used.verify, 20);
  assert.equal(db.tables.catalog_snapshot.find((r) => r.kind === aRow.kind).data.used.verify ?? 0, 0);

  // 6. not confirmed: enforce first seen 10 minutes before the reset, or too much consumed at birth -> the next window stays pending
  const db2 = createMemoryDb({ catalog_snapshot: [] }, { unique: { catalog_snapshot: ["kind"] } });
  await acquireBrowseLease(db2, { key: "verify", requested: 20, observation: obsW(700, W - 10 * 60_000), now: W - 10 * 60_000, ttlMs: 180_000, mode: "enforce" });
  const p1 = await acquireBrowseLease(db2, { key: "verify", requested: 20, observation: obsW1(4990, t5), now: t5, ttlMs: 180_000, mode: "enforce" });
  assert.equal(p1.effective, "observe");
  assert.equal(db2.tables.catalog_snapshot.find((r) => r.kind === p1.lease.kind).data.stateReason, "enforce_configured_too_close_to_reset");
  const db3 = createMemoryDb({ catalog_snapshot: [] }, { unique: { catalog_snapshot: ["kind"] } });
  await acquireBrowseLease(db3, { key: "verify", requested: 20, observation: obsW(900, at(18)), now: at(18), ttlMs: 180_000, mode: "enforce" });
  const p2 = await acquireBrowseLease(db3, { key: "verify", requested: 20, observation: obsW1(4600, t5), now: t5, ttlMs: 180_000, mode: "enforce" });
  assert.equal(p2.effective, "observe");
  assert.equal(db3.tables.catalog_snapshot.find((r) => r.kind === p2.lease.kind).data.stateReason, "prior_consumption_unaccounted");
});

test("BB-13 reconciliation with open leases: calls eBay has already counted are not subtracted twice; leases opened after the reading are counted in full; a stale reading cannot over-grant", () => {
  const readAt = at(10);
  const iso = (t) => new Date(t).toISOString();
  const openBefore = { a: { key: "allocated:EBAY_US", granted: 300, at: iso(readAt - 600_000), expiresAt: iso(readAt + 600_000) } };
  // 200 settled; eBay shows 380 consumed -> 180 of the open lease's 300 are already in eBay's count
  const l = ledgerWith({ "sweep:EBAY_US": 200 }, openBefore);
  const o = { limit: 5000, remaining: 4620, readAt: iso(readAt) };
  assert.equal(unspentOpen(l, o), 120);
  // the old formula subtracted all 300 again: 180 calls of useful work would have been refused
  const g = evaluateGrant(l, { key: "sweep:EBAY_GB", requested: 26, observation: o, now: readAt });
  assert.equal(g.providerLeft, 4620 - 120 - 420 - 450);
  // a lease opened after the reading is counted in full
  const l2 = ledgerWith({ "sweep:EBAY_US": 200 }, { ...openBefore, b: { key: "verify", granted: 20, at: iso(readAt + 1000), expiresAt: iso(readAt + 180_000) } });
  assert.equal(unspentOpen(l2, o), 120 + 20);
  // no read time -> nothing is assumed already counted
  assert.equal(unspentOpen(l, { limit: 5000, remaining: 4620 }), 300);
});

test("BB-14 manual scripts: without a job context no Browse request is sent unless a durable clearance exists; production enforce rows refuse even with no local mode flag; the two forensic scripts refuse before any Browse request when run outside Vercel", async (t) => {
  const prevMode = process.env.BROWSE_BUDGET_MODE;
  const prevFetch = globalThis.fetch;
  t.after(() => {
    process.env.BROWSE_BUDGET_MODE = prevMode;
    globalThis.fetch = prevFetch;
    telemetry.setManualBrowseClearance(null);
  });
  delete process.env.BROWSE_BUDGET_MODE; // a laptop without the production environment
  let sent = 0;
  globalThis.fetch = async () => { sent++; return new Response("{}", { status: 200 }); };
  const now = at(6);
  const rateLimit = async () => ({ limit: 5000, remaining: 4000, reset: new Date(END).toISOString(), timeWindow: 86400 });
  const outside = () => new Promise((resolve, reject) => setTimeout(() => ebay.fetchWithRetry("https://api.ebay.com/buy/browse/v1/item/x", {}, { retries: 0 }).then(resolve, reject), 0));

  telemetry.setManualBrowseClearance(null);
  // production enforce configured for the current or previous window
  for (const kind of [`browse_budget:${new Date(END).toISOString()}`, `browse_budget:${new Date(START).toISOString()}`]) {
    const db = createMemoryDb({ catalog_snapshot: [{ kind, data: {}, updated_at: new Date(START).toISOString() }] });
    await assert.rejects(() => ensureManualBrowseAllowed({ db, getRateLimit: rateLimit, now }), (e) => e.reason === "production_enforce_configured");
    await assert.rejects(outside, (e) => e.name === "BrowseBudgetExhaustedError");
  }
  // unknown window, unreadable ledger, or a local enforce flag all refuse
  await assert.rejects(() => ensureManualBrowseAllowed({ db: createMemoryDb({ catalog_snapshot: [] }), getRateLimit: async () => null, now }), (e) => e.reason === "window_unknown");
  await assert.rejects(() => ensureManualBrowseAllowed({ db: { from: () => { throw new Error("down"); } }, getRateLimit: rateLimit, now }), (e) => e.reason === "ledger_unavailable");
  await assert.rejects(() => ensureManualBrowseAllowed({ db: createMemoryDb({ catalog_snapshot: [] }), getRateLimit: rateLimit, now, env: { BROWSE_BUDGET_MODE: "enforce" } }), (e) => e.reason === "enforce_mode_manual_budget_is_zero");
  assert.equal(sent, 0, "no request left the process");
  // observe-only history: cleared, requests allowed until the window's guard instant
  const c = await ensureManualBrowseAllowed({ db: createMemoryDb({ catalog_snapshot: [{ kind: `${LEDGER_KIND_PREFIX.observe}${new Date(END).toISOString()}`, data: {} }] }), getRateLimit: rateLimit, now });
  assert.equal(c.guardAt, END - WINDOW_GUARD_MS);
  telemetry.setManualBrowseClearance({ guardAt: Date.now() + H });
  await outside();
  assert.equal(sent, 1);
  // a clearance past its window's guard instant, or a process-level enforce flag, refuses outside a job
  telemetry.setManualBrowseClearance({ guardAt: Date.now() - 1 });
  await assert.rejects(outside, (e) => e.name === "BrowseBudgetExhaustedError");
  telemetry.setManualBrowseClearance(null);
  process.env.BROWSE_BUDGET_MODE = "enforce";
  await assert.rejects(outside, (e) => e.name === "BrowseBudgetExhaustedError");
  delete process.env.BROWSE_BUDGET_MODE;
  assert.equal(sent, 1);

  // the real forensic scripts, offline, no BROWSE_BUDGET_MODE: enforce row -> exit 1 and ZERO Browse requests
  const { spawnSync } = await import("node:child_process");
  const { mkdtempSync, readFileSync: readLog } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  for (const script of ["scripts/_dealImageForensics.mjs", "scripts/_auctionPriceForensics.mjs"]) {
    for (const seed of ["enforce", "observe"]) {
      const log = join(mkdtempSync(join(tmpdir(), "bb14-")), "requests.log");
      const env = { ...process.env, SCRIPT_HARNESS_LOG: log, SCRIPT_HARNESS_LEDGER: seed, EBAY_CLIENT_ID: "x", EBAY_CLIENT_SECRET: "y", NEXT_PUBLIC_SUPABASE_URL: "http://stub", SUPABASE_SERVICE_ROLE_KEY: "stub" };
      delete env.BROWSE_BUDGET_MODE;
      readFileSync; // (source reads above use the ROOT reader)
      require("node:fs").writeFileSync(log, "");
      const r = spawnSync(process.execPath, ["--no-warnings", "--import", "./tests/harness/scripts/register.mjs", script, "32672"], { cwd: ROOT, env, encoding: "utf8", timeout: 60_000 });
      const urls = readLog(log, "utf8").split("\n").filter(Boolean);
      const browse = urls.filter((u) => u.includes("api.ebay.com/buy/browse")).length;
      if (seed === "enforce") {
        assert.equal(r.status, 1, `${script}: refused`);
        assert.match(r.stderr, /manual Browse use refused: production_enforce_configured/);
        assert.equal(browse, 0, `${script}: no Browse request was sent`);
      } else {
        assert.equal(r.status, 0, `${script}: allowed when production is not enforcing (${r.stderr})`);
        assert.equal(browse, 1, `${script}: its one request went through the guarded path`);
      }
    }
    const src = read(script);
    assert.ok(!/\bfetch\([\s\S]{0,200}?X-EBAY-C-MARKETPLACE-ID/.test(src), `${script}: no direct Browse fetch remains`);
    assert.match(src, /browseRequest\(/);
  }
  for (const s of ["scripts/auditHighRiskListings.js", "scripts/backfillDealImages.js", "scripts/backfillDealQuality.js", "scripts/verifyRawConditionDeals.js"]) {
    assert.match(read(s), /ensureManualBrowseAllowed\(/, `${s} obtains the clearance`);
  }
});

test("BB-15 real verify-deals route in a PENDING enforce window keeps today's floor and batch, refuses nothing, and records enforce's hypothetical decision", async () => {
  const { spawnSync } = await import("node:child_process");
  const r = spawnSync(process.execPath, ["--no-warnings", "--import", "./tests/harness/ingestion/register.mjs", "tests/harness/ingestion/verifyBudget.mjs"], { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  assert.equal(r.status, 0, r.stderr);
  const { pending } = JSON.parse(r.stdout);
  assert.equal(pending.run.budget.effective, "observe");
  assert.equal(pending.run.calls, 20, "BATCH 20, as today");
  assert.equal(pending.floorSkip.skipped, "quota_reserve", "the 800 floor still applies in a pending window");
  assert.equal(pending.floorSkip.calls, 0);
  // the floor-skipped run's lease is settled (0 attempts), not left to expire and be charged 20
  assert.equal(pending.floorSkip.ledgerOpenAfter, 0);
  assert.equal(pending.floorSkip.settledAfter, 2);
  assert.equal(pending.floorSkip.usedVerifyAfter, pending.run.calls);
  assert.equal(pending.rowState, "pending");
  assert.ok(pending.hypotheticalRequests >= 1);
});

test("BB-16 every committed script that can send a Browse request obtains the durable clearance before it does", async () => {
  const { readdirSync } = await import("node:fs");
  const scripts = readdirSync(join(ROOT, "scripts")).filter((f) => /\.(m?js|cjs)$/.test(f));
  const browseCapable = scripts.filter((f) => {
    const src = read(`scripts/${f}`);
    const usesClient = /require\(["']\.\.\/lib\/ebay(?:\.js)?["']\)|from ["']\.\.\/lib\/ebay(?:\.js)?["']/.test(src);
    const callsBrowse = /api\.ebay\.com\/buy\/browse/.test(src);
    const onlyRateLimit = usesClient && !callsBrowse && /getBrowseRateLimit/.test(src) && !/(searchListings|searchNewlyListed|getGradingDetails|getRawListingDetail|getRawCardCondition|getListingSnapshot|getListingFreshness|getItemsByLegacyIds|fetchWithRetry)\b/.test(src);
    return (usesClient || callsBrowse) && !onlyRateLimit;
  });
  assert.ok(browseCapable.length >= 6, `found ${browseCapable.join(", ")}`);
  for (const f of browseCapable) assert.match(read(`scripts/${f}`), /ensureManualBrowseAllowed\(/, `scripts/${f} must obtain the clearance`);
});
