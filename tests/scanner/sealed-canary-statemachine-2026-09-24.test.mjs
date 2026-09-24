// Sealed enforcement canary - the full state machine, on the real
// browseBudget code path with a compare-and-set memory ledger.
//
//   PENDING birth -> effective observe, neutral
//   -> next eligible window -> ACTIVE
//   -> effective enforce
//   -> the cap actually binds when exceeded
//   -> kill switch -> neutral again
//
// This is the sequence the canary will walk through in production, proven
// here rather than assumed from the comments.
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

const PRODUCTS = 196; // the measured sealed watchlist size
const newDb = () => createMemoryDb({ catalog_snapshot: [] }, { unique: { catalog_snapshot: ["kind"] } });

// A window whose reset is `hoursToReset` away, i.e. we are inside it.
const obsAt = (now, hoursToReset, remaining = 4600) => ({
  remaining,
  limit: 5000,
  reset: new Date(now + hoursToReset * 3.6e6).toISOString(),
  timeWindow: 86400,
  readAt: new Date(now).toISOString(),
});

// Exactly what app/api/refresh-sealed-deals asks for.
const lease = (db, obs, now, { killed = false, requested = PRODUCTS } = {}) =>
  B.acquireBrowseLease(db, {
    key: "sealed",
    requested: Math.max(requested, 1),
    minGrant: Math.max(Math.ceil(requested / 4), 1),
    observation: obs,
    ttlMs: 360_000,
    ...(killed ? {} : { mode: "enforce" }),
  });

const ledgerRow = (db, mode, win) => db.tables.catalog_snapshot.find((r) => r.kind === `${B.LEDGER_KIND_PREFIX[mode]}${win.id}`);

test("SM-1. birth is PENDING and the first run is neutral - it enforces nothing", async () => {
  const db = newDb();
  const now = Date.now();
  const obs = obsAt(now, 6);
  const win = B.windowFromObservation(obs, now);
  const res = await lease(db, obs, now);

  assert.equal(res.mode, "enforce", "enforcement was requested for this key");
  assert.equal(res.effective, "observe", "but a PENDING window runs as observe");
  assert.equal(res.granted, PRODUCTS, "so the full ask is granted - behaviourally neutral");
  const row = ledgerRow(db, "enforce", win);
  assert.ok(row, "an enforce ledger row is created, which is what makes the NEXT window eligible");
  assert.equal(row.data.state, "pending");
  assert.equal(row.data.stateReason, "enforce_not_configured_in_previous_window");
});

test("SM-2. the next eligible window transitions to ACTIVE and effective becomes enforce", async () => {
  const db = newDb();
  const now = Date.now();
  const obs = obsAt(now, 6);
  const win = B.windowFromObservation(obs, now);
  // Seed the PREVIOUS window's enforce row, configured well before this
  // window opened - the evidence enforceBirthState requires.
  db.tables.catalog_snapshot.push({
    kind: `${B.LEDGER_KIND_PREFIX.enforce}${new Date(win.windowStart).toISOString()}`,
    data: { ...B.emptyLedger(win), enforceSeenAt: new Date(win.windowStart - 4 * 3.6e6).toISOString() },
    updated_at: new Date(win.windowStart - 4 * 3.6e6).toISOString(),
  });
  // and little of the window consumed, so the counter is trustworthy at birth
  const res = await lease(db, obsAt(now, 6, 5000 - 20), now);

  const row = ledgerRow(db, "enforce", win);
  assert.equal(row.data.state, "active", `expected active, got ${row.data.state} (${row.data.stateReason})`);
  assert.equal(res.effective, "enforce", "enforcement is now real for this key");
  assert.equal(res.granted, PRODUCTS, "and it still grants the whole normal pass - the canary stays neutral");
  assert.equal(res.decision.binding, "requested");
});

test("SM-3. under enforcement the cap actually binds when it is exceeded", async () => {
  const db = newDb();
  const now = Date.now();
  const obs = obsAt(now, 6, 5000 - 20);
  const win = B.windowFromObservation(obs, now);
  db.tables.catalog_snapshot.push({
    kind: `${B.LEDGER_KIND_PREFIX.enforce}${new Date(win.windowStart).toISOString()}`,
    data: { ...B.emptyLedger(win), enforceSeenAt: new Date(win.windowStart - 4 * 3.6e6).toISOString() },
    updated_at: new Date(win.windowStart - 4 * 3.6e6).toISOString(),
  });
  // first pass takes its 196
  const first = await lease(db, obs, now);
  assert.equal(first.effective, "enforce");
  assert.equal(first.granted, PRODUCTS);
  // a second full pass in the SAME window is refused at the cap
  const second = await lease(db, obs, now + 1000);
  assert.equal(second.granted, 0, "the cap binds");
  assert.equal(second.decision.denied, "cap");
  assert.equal(second.lease, null, "and no lease is handed out, so no call can be made");
});

test("SM-4. an over-large ask is trimmed to the cap rather than refused outright", async () => {
  const db = newDb();
  const now = Date.now();
  const obs = obsAt(now, 6, 5000 - 20);
  const win = B.windowFromObservation(obs, now);
  db.tables.catalog_snapshot.push({
    kind: `${B.LEDGER_KIND_PREFIX.enforce}${new Date(win.windowStart).toISOString()}`,
    data: { ...B.emptyLedger(win), enforceSeenAt: new Date(win.windowStart - 4 * 3.6e6).toISOString() },
    updated_at: new Date(win.windowStart - 4 * 3.6e6).toISOString(),
  });
  const res = await lease(db, obs, now, { requested: 260 });
  assert.equal(res.effective, "enforce");
  assert.equal(res.granted, B.CONSUMER_CAPS.sealed, "trimmed to 200, not denied");
});

test("SM-5. the kill switch returns sealed to neutral behaviour", async () => {
  const db = newDb();
  const now = Date.now();
  const obs = obsAt(now, 6, 5000 - 20);
  const win = B.windowFromObservation(obs, now);
  db.tables.catalog_snapshot.push({
    kind: `${B.LEDGER_KIND_PREFIX.enforce}${new Date(win.windowStart).toISOString()}`,
    data: { ...B.emptyLedger(win), enforceSeenAt: new Date(win.windowStart - 4 * 3.6e6).toISOString() },
    updated_at: new Date(win.windowStart - 4 * 3.6e6).toISOString(),
  });
  // exhaust the enforce cap so enforcement would definitely bite
  await lease(db, obs, now);
  const stillEnforced = await lease(db, obs, now + 1000);
  assert.equal(stillEnforced.granted, 0, "precondition: enforcement is biting");

  // now the same call with the kill switch on: no mode is passed, so the
  // GLOBAL mode applies. Under the production global mode (observe) the run
  // is neutral again and writes to the observe ledger, untouched by the
  // exhausted enforce row.
  const prev = process.env.BROWSE_BUDGET_MODE;
  process.env.BROWSE_BUDGET_MODE = "observe";
  try {
    const killed = await lease(db, obs, now + 2000, { killed: true });
    assert.equal(killed.effective, "observe");
    assert.equal(killed.granted, PRODUCTS, "the full normal pass is granted again");
    assert.notEqual(killed.lease?.kind, stillEnforced.lease?.kind ?? null);
  } finally {
    if (prev === undefined) delete process.env.BROWSE_BUDGET_MODE;
    else process.env.BROWSE_BUDGET_MODE = prev;
  }
});

test("SM-6. the kill switch is read per request, so a redeployed function picks it up immediately", () => {
  // The value is read inside the handler (dynamic route), not captured at
  // module load, so whichever value the running function has is the one that
  // applies on its very next invocation. What this does NOT prove - and what
  // the route comment must not claim - is that editing the variable in the
  // Vercel dashboard reaches an ALREADY-DEPLOYED function without a
  // redeploy. See docs/ebay-browse-budget-audit for the verified procedure.
  const src = require("node:fs").readFileSync(join(REPO, "app", "api", "refresh-sealed-deals", "route.js"), "utf8");
  const body = src.slice(src.indexOf("export async function GET"));
  assert.ok(body.includes("process.env.SEALED_BROWSE_ENFORCE"), "read inside the handler, not at module scope");
  assert.equal(src.indexOf("process.env.SEALED_BROWSE_ENFORCE") > src.indexOf("export async function GET"), true);
  assert.doesNotMatch(src, /no deploy|without a redeploy/i, "the route must not repeat the unproven claim");
});
