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
  SWEEP_COUNTRY_CAPS,
  WINDOW_GUARD_MS,
  emptyLedger,
  evaluateGrant,
  expireLeases,
  reconcile,
  windowFromObservation,
  acquireBrowseLease,
  settleBrowseLease,
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

test("BB-1 envelope: consumer caps + 420 reserve = 5,000; per-country caps sum to their group; sealed and manual unfunded", () => {
  const sum = (o) => Object.values(o).reduce((a, b) => a + b, 0);
  assert.equal(BROWSE_DAILY_LIMIT, 5000);
  assert.equal(BROWSE_RESERVE, 420);
  assert.deepEqual(
    { verify: 720, allocated: 2000, sweep: 1700, ingest: 150, images: 10, sealed: 0, manual: 0 },
    { ...CONSUMER_GROUP_CAPS }
  );
  assert.equal(sum(CONSUMER_CAPS), 4580);
  assert.equal(sum(ALLOCATED_COUNTRY_CAPS), 2000);
  assert.equal(sum(SWEEP_COUNTRY_CAPS), 1700);
  for (const c of ["EBAY_US", "EBAY_GB", "EBAY_CA", "EBAY_AU", "EBAY_DE", "EBAY_IT"]) {
    assert.ok(ALLOCATED_COUNTRY_CAPS[c] > 0 && SWEEP_COUNTRY_CAPS[c] > 0, `${c} has guaranteed allocated and sweep capacity`);
  }
  assert.equal(CONSUMER_CAPS.sealed, 0);
  assert.equal(evaluateGrant(ledgerWith(), { key: "sealed", requested: 50, observation: obs(5000), now: at(12) }).denied, "unfunded");
  assert.equal(evaluateGrant(ledgerWith(), { key: "manual", requested: 1, observation: obs(5000), now: at(12) }).denied, "unfunded");
});

test("BB-2 grants: cost is evaluated before granting; hard cap, pace (burst borrowed from the same cap) and provider balance all bind", () => {
  // pace: at reset only the 40-call burst; mid-window 360 + 40; never above the cap
  assert.equal(evaluateGrant(ledgerWith(), { key: "verify", requested: 100, observation: obs(5000), now: at(0) }).granted, 40);
  assert.equal(evaluateGrant(ledgerWith({ verify: 390 }), { key: "verify", requested: 20, observation: obs(5000), now: at(12) }).granted, 10);
  assert.equal(evaluateGrant(ledgerWith({ verify: 710 }), { key: "verify", requested: 20, observation: obs(5000), now: at(23.9) }).granted, 10, "cap binds");
  assert.equal(evaluateGrant(ledgerWith({ verify: 720 }), { key: "verify", requested: 20, observation: obs(5000), now: at(23.9) }).denied, "cap");
  // the request is evaluated whole: minGrant refuses a grant too small to be useful
  assert.equal(evaluateGrant(ledgerWith({ verify: 717 }), { key: "verify", requested: 20, minGrant: 5, observation: obs(5000), now: at(23.9) }).denied, "cap");
  // open (in-flight) leases count as fully spent
  const open = { a: { key: "verify", granted: 20, expiresAt: new Date(at(13)).toISOString() } };
  assert.equal(evaluateGrant(ledgerWith({ verify: 700 }, open), { key: "verify", requested: 20, observation: obs(5000), now: at(23.9) }).denied, "cap");
});

test("BB-3 reserve and verification protection: the 420 reserve is never granted; discovery cannot spend the verifier's unspent cap; verification and discovery are counted separately", () => {
  // provider balance 1,140 at hour 23, verifier has spent nothing: discovery sees 1,140 - 420 - 720 = 0
  const late = at(23);
  const d = evaluateGrant(ledgerWith({ "sweep:EBAY_US": 500 }), { key: "sweep:EBAY_US", requested: 25, observation: obs(1140), now: late });
  assert.equal(d.denied, "provider");
  const v = evaluateGrant(ledgerWith({ "sweep:EBAY_US": 500 }), { key: "verify", requested: 20, observation: obs(1140), now: late });
  assert.equal(v.granted, 20, "the verifier can still draw its own protected calls");
  // at exactly the reserve nobody gets anything
  assert.equal(evaluateGrant(ledgerWith({ verify: 720 }), { key: "verify", requested: 1, observation: obs(420), now: late }).denied, "cap");
  assert.equal(evaluateGrant(ledgerWith({ verify: 700 }), { key: "verify", requested: 1, observation: obs(420), now: late }).denied, "provider");
  assert.equal(evaluateGrant(ledgerWith({ verify: 720 }), { key: "ingest", requested: 1, observation: obs(420), now: late }).denied, "provider");
  // verifier spend never appears in a discovery consumer's pace or cap
  const heavyVerify = ledgerWith({ verify: 700 });
  assert.equal(evaluateGrant(heavyVerify, { key: "sweep:EBAY_GB", requested: 26, observation: obs(4000), now: at(12) }).granted, 26);
});

test("BB-4 allocated country progress: each market has its own durable cap; a first pass takes at most its share; an early market cannot consume a later one", () => {
  const firstHalf = at(1);
  // US first pass: ceil(530 x 0.6) = 318
  assert.equal(evaluateGrant(ledgerWith(), { key: "allocated:EBAY_US", requested: 700, observation: obs(5000), now: firstHalf }).granted, 318);
  // US has spent its first-pass share; IT (first pass at hour 10) still has its whole cap
  const afterUs = ledgerWith({ "allocated:EBAY_US": 318 });
  assert.equal(evaluateGrant(afterUs, { key: "allocated:EBAY_US", requested: 100, observation: obs(4600), now: at(2) }).denied, "pace");
  assert.equal(evaluateGrant(afterUs, { key: "allocated:EBAY_IT", requested: 400, observation: obs(4600), now: at(10) }).granted, 255);
  // second half: US gets the remainder of its cap and no more
  assert.equal(evaluateGrant(afterUs, { key: "allocated:EBAY_US", requested: 700, observation: obs(3000), now: at(13) }).granted, 212);
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
  const db = createMemoryDb({ catalog_snapshot: [] }, { unique: { catalog_snapshot: ["kind"] } });
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
  // 60 interleaved acquisitions for one 900-call sweep cap
  const results = await Promise.all(
    Array.from({ length: 60 }, (_, i) => acquireBrowseLease(db, { key: "sweep:EBAY_US", requested: 25, minGrant: 6, observation: obs(4000), now: at(23.5) + 5000 + i, ttlMs: 600_000, mode: "enforce" }))
  );
  const granted = results.reduce((t, r) => t + r.granted, 0);
  const ledger = db.tables.catalog_snapshot.find((r) => r.kind === a.lease.kind).data;
  const openSweep = Object.values(ledger.open).filter((l) => l.key === "sweep:EBAY_US").reduce((t, l) => t + l.granted, 0);
  assert.ok(granted <= 900, `granted ${granted} <= cap`);
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
  assert.match(verify, /if \(budgetMode !== "enforce"\) \{\s*\n(?:\s*\/\/.*\n)*\s*if \(rl\.remaining - BATCH < RESERVE\)/, "the 800 floor still applies outside enforce");
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
  assert.equal(used715.ledger.used.verify, 720);
  assert.equal(used718.skipped, "browse_budget");
  assert.equal(used718.calls, 0);
  assert.equal(crashGranted, 20);
  assert.equal(afterCrash.ledger.counters.expired, 1);
  assert.equal(afterCrash.ledger.used.verify, 100 + 20 + afterCrash.calls, "the crashed lease is charged its whole grant");
  assert.equal(observe.skipped, null);
  assert.equal(observe.calls, 20, "observe mode keeps today's batch");
  assert.equal(observe.ledger.used.verify, 20, "observe records real attempts in its own row");
});
