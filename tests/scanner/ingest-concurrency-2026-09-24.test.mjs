// ingest-hard-bound concurrency proof (2026-09-24).
//
// THE CLAIM UNDER TEST: `decision.capLeft` + `setBrowseAttemptGuard` stop
// two ingest invocations from collectively exceeding the daily allowance.
// The guard alone is invocation-local, so on its own it proves nothing
// about two invocations. What has to hold globally is the RESERVATION.
//
// Attempts are counted at the single external chokepoint: the real
// `fetch` inside lib/ebay.fetchWithRetry, reached through the real
// getItemsByLegacyIds. Retries are included - the stub answers 500 so
// fetchWithRetry genuinely retries.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createMemoryDb } from "../harness/ingestion/memoryDb.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..");
const require = createRequire(import.meta.url);
const B = require(join(REPO, "lib", "browseBudget.js"));
const T = require(join(REPO, "lib", "ebayTelemetry.js"));
const EBAY = require(join(REPO, "lib", "ebay.js"));

const CAP = B.CONSUMER_CAPS.ingest; // 40
const ALREADY_USED = 23;
const REMAINING = CAP - ALREADY_USED; // 17

const T0 = Date.now();
const OBS = { remaining: 4000, limit: 5000, reset: new Date(T0 + 6 * 3.6e6).toISOString(), timeWindow: 86400, readAt: new Date(T0).toISOString() };

function seededDb() {
  const db = createMemoryDb({ catalog_snapshot: [] }, { unique: { catalog_snapshot: ["kind"] } });
  const win = B.windowFromObservation(OBS, T0);
  const led = B.emptyLedger(win);
  led.used.ingest = ALREADY_USED;
  db.tables.catalog_snapshot.push({
    kind: `${B.LEDGER_KIND_PREFIX.observe}${win.id}`,
    data: led,
    updated_at: new Date(win.windowStart).toISOString(),
  });
  return db;
}

// A db wrapper that holds the FIRST compare-and-set write open until
// released, so the second invocation is guaranteed to read the same ledger
// version the first one did. This is the worst case for the race.
function racingDb(db) {
  let held = null;
  const gate = { released: false, reached: null };
  gate.reached = new Promise((r) => (gate._reached = r));
  return {
    wrapped: {
      from(table) {
        const q = db.from(table);
        const origUpdate = q.update.bind(q);
        q.update = (values) => {
          const inner = origUpdate(values);
          const origThen = inner.then.bind(inner);
          inner.then = (res, rej) => {
            if (!gate.released && held === null) {
              held = true;
              gate._reached();
              return gate.hold.then(() => origThen(res, rej));
            }
            return origThen(res, rej);
          };
          return inner;
        };
        return q;
      },
      tables: db.tables,
    },
    gate,
  };
}

// One invocation's budgeting boundary, exactly as app/api/ingest-feed does it.
async function acquire(db) {
  const budget = await B.acquireBrowseLease(db, {
    key: "ingest",
    requested: CAP,
    minGrant: 5,
    observation: OBS,
    ttlMs: 360_000,
    mode: "observe", // production's real mode
  });
  const capLeft = Number(budget.decision?.capLeft);
  const dailyAttemptsLeft = Number.isFinite(capLeft) ? Math.max(0, Math.floor(capLeft)) : null;
  const skip = dailyAttemptsLeft === 0;
  const attemptCeiling = Math.min(dailyAttemptsLeft ?? CAP, CAP);
  return { budget, dailyAttemptsLeft, skip, attemptCeiling };
}

// Spend through the REAL chokepoint, counting real fetches. Every response
// is a 500 so fetchWithRetry retries - retries must draw the same allowance.
async function spend({ attemptCeiling, budget }, ids, counter) {
  const originalFetch = globalThis.fetch;
  process.env.EBAY_CLIENT_ID = process.env.EBAY_CLIENT_ID || "test-id";
  process.env.EBAY_CLIENT_SECRET = process.env.EBAY_CLIENT_SECRET || "test-secret";
  globalThis.fetch = async (url) => {
    const u = String(url?.url ?? url);
    // The OAuth token endpoint deliberately does NOT go through
    // fetchWithRetry, so it draws no allowance and is not counted here.
    if (u.includes("/identity/v1/oauth2/token")) {
      return new Response(JSON.stringify({ access_token: "t", expires_in: 7200 }), { status: 200, headers: { "content-type": "application/json" } });
    }
    // Every BROWSE call is counted. 500 so fetchWithRetry genuinely retries.
    counter.fetches += 1;
    return new Response("{}", { status: 500 });
  };
  try {
    const ctx = T.beginJobRun({ job: "ingest-feed" });
    T.attachBrowseLease(budget.lease ?? null);
    T.setBrowseAttemptGuard(attemptCeiling);
    try {
      await EBAY.getItemsByLegacyIds(ids, "EBAY_US", { concurrency: 4 });
    } finally {
      T.clearBrowseAttemptGuard();
      T.attachBrowseLease(null);
      ctx.status = "success";
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
}

test("IC-1. two concurrent invocations over a 17-attempt remainder make at most 17 real external calls", async () => {
  const base = seededDb();
  const { wrapped, gate } = racingDb(base);
  gate.hold = new Promise((r) => (gate.release = r));

  // A reaches the boundary and its CAS write is held open.
  const aPromise = acquire(wrapped);
  await gate.reached; // A has read the ledger and is about to write
  // B now reads the SAME version A read - the maximal race.
  const bPromise = acquire(base);
  gate.release();
  const [a, b] = await Promise.all([aPromise, bPromise]);

  const counter = { fetches: 0 };
  // 60 ids each: far more work than the allowance, so only the ceiling binds
  const ids = Array.from({ length: 60 }, (_, i) => String(100000000000 + i));
  if (!a.skip) await spend(a, ids, counter);
  if (!b.skip) await spend(b, ids, counter);

  assert.ok(
    counter.fetches <= REMAINING,
    `combined external calls ${counter.fetches} exceeded the ${REMAINING} remaining (A ceiling ${a.attemptCeiling}/skip ${a.skip}, B ceiling ${b.attemptCeiling}/skip ${b.skip})`
  );
  // and the allowance was genuinely exercised, not trivially zero
  assert.ok(counter.fetches > 0, "the test must actually spend, or it proves nothing");
});

test("IC-2. the reservation is what makes it global: an open lease removes capacity for everyone else", async () => {
  const db = seededDb();
  const first = await acquire(db);
  assert.equal(first.dailyAttemptsLeft, REMAINING, "the first invocation sees the true remainder");
  // With the first lease still OPEN (unsettled), the second sees the
  // capacity already reserved - capLeft is cap - used - sumOpen(key).
  const second = await acquire(db);
  assert.ok(second.dailyAttemptsLeft === 0, `second invocation must see no allowance, saw ${second.dailyAttemptsLeft}`);
  assert.equal(second.skip, true);
});

test("IC-3. retries draw from the same remainder at the real chokepoint", async () => {
  const db = seededDb();
  const a = await acquire(db);
  const counter = { fetches: 0 };
  // 5 ids, every response a 500 -> fetchWithRetry tries each twice = 10
  // attempts, all against the same ceiling.
  await spend({ ...a, attemptCeiling: 7 }, ["1", "2", "3", "4", "5"], counter);
  assert.equal(counter.fetches, 7, "the ceiling bound the retries, not the id count");
});

test("IC-5. negative control: the test has power - a fixed ceiling WOULD overspend", async () => {
  // If the route used a fixed per-run ceiling instead of the ledger's
  // capLeft, two invocations over a 17-attempt remainder would make 34 real
  // calls. Drive exactly that through the same chokepoint and show the
  // combined count exceeds the remainder - so IC-1 passing is a result, not
  // an artefact of a weak assertion.
  const db = seededDb();
  const a = await acquire(db);
  const b = await acquire(db); // would be skipped by the real rule
  assert.equal(b.skip, true, "the real rule skips the second invocation");
  const counter = { fetches: 0 };
  const ids = Array.from({ length: 60 }, (_, i) => String(200000000000 + i));
  // ignore the skip and force BOTH to spend a fixed 17 - the broken design
  await spend({ ...a, attemptCeiling: REMAINING }, ids, counter);
  await spend({ ...b, attemptCeiling: REMAINING }, ids, counter);
  assert.equal(counter.fetches, REMAINING * 2);
  assert.ok(counter.fetches > REMAINING, "a fixed ceiling overspends - which is what the reservation prevents");
});

test("IC-4. what provides the global guarantee, stated and pinned", () => {
  const src = require("node:fs").readFileSync(join(REPO, "lib", "browseBudget.js"), "utf8");
  // 1. capacity is reserved by OPEN leases, not only by settled usage
  assert.match(src, /const sumOpen = \(ledger, key = null\) =>/);
  assert.match(src, /const capLeft = cap - used - openKey;/);
  // 2. the reservation is written under compare-and-set on the row version
  assert.match(src, /\.eq\("updated_at", prevVersion\)/);
  // 3. the returned decision belongs to the iteration whose write WON:
  //    a losing writer loops, re-reads and re-evaluates
  assert.match(src, /if \(await casWrite\(db, kind, loaded\.version, ledger, now\)\) \{/);
  assert.match(src, /for \(let i = 0; i < CAS_ATTEMPTS; i\+\+\)/);
  // 4. an unsettled lease that expires is charged IN FULL, never refunded
  assert.match(src, /function expireLeases/);
  // 5. the attempt guard is invocation-local and is NOT the global bound -
  //    it converts the reserved allowance into a hard stop on real calls
  const tel = require("node:fs").readFileSync(join(REPO, "lib", "ebayTelemetry.js"), "utf8");
  assert.match(tel, /ctx\.attemptGuard = \{ limit:/);
});
