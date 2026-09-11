// STAGE-B CONTAINMENT (2026-09-11) - the backlog circuit is DURABLE and
// every disabled / killed / suspended / unreadable path performs ZERO
// provider mutations. Pure + static checks, no network, no real DB: the
// circuit store is injected in memory and the provider is a tripwire that
// throws on any call.

import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  setBacklogCircuitStore, backlogCircuitStatus, noteBacklogFailure, noteBacklogSuccess,
  suspendBacklogCircuit, resumeBacklogCircuit, circuitSuspended, loadBacklogCircuit,
  BACKLOG_CIRCUIT_QA_TYPE, OWNER_SUSPENDED, UNREADABLE,
} from "../../lib/social/newsroom/backlogCircuit.mjs";
import { refillQueueReconcile } from "../../lib/newsroom/backlogRefill.mjs";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => readFileSync(join(REPO, p), "utf8");

// A shared "database": an append-only row list two independent store
// instances read from - i.e. two separate Vercel invocations.
function memoryDb() {
  return { rows: [] };
}
function memoryStore(db, { failLoad = false } = {}) {
  return {
    async load() {
      if (failLoad) throw new Error("simulated DB outage");
      const last = db.rows[db.rows.length - 1];
      return last ? last.detail.circuit : null;
    },
    async save(circuit) {
      db.rows.push({ qa_type: BACKLOG_CIRCUIT_QA_TYPE, result: circuit.state === "CLOSED" ? "PASS" : "FAIL", detail: { circuit } });
    },
  };
}

// Any provider call = a mutation attempt = test failure.
const tripwire = new Proxy({}, { get: (_, m) => () => { throw new Error(`PROVIDER CALLED: ${String(m)}`); } });

const ARMED_ENV = Object.freeze({ SOCIAL_BUFFER_BACKLOG_ENABLED: "true", SOCIAL_BUFFER_BACKLOG_MODE: "scheduled", BUFFER_ACCESS_TOKEN: "x" });

let db;
beforeEach(() => { db = memoryDb(); setBacklogCircuitStore(memoryStore(db)); });

test("1. never-written state is CLOSED; 3 failures / 24h trip it; the trip is visible to a DIFFERENT store instance (a later invocation)", async () => {
  assert.equal((await backlogCircuitStatus()).suspended, false);
  const t0 = Date.parse("2026-09-12T20:00:00Z");
  await noteBacklogFailure({ reason: "provider_schedule_failure", at: t0 });
  await noteBacklogFailure({ reason: "provider_schedule_failure", at: t0 + 60_000 });
  assert.equal((await backlogCircuitStatus()).suspended, false);
  await noteBacklogFailure({ reason: "provider_auth_error", at: t0 + 120_000 });
  const s = await backlogCircuitStatus();
  assert.equal(s.suspended, true);
  assert.equal(s.state, "AUTO_SUSPENDED");
  assert.equal(s.failures_24h, 3);
  // a brand-new store instance over the SAME rows (next Vercel invocation)
  setBacklogCircuitStore(memoryStore(db));
  assert.equal((await backlogCircuitStatus()).suspended, true, "trip must be durable across invocations");
  // a success never un-trips
  await noteBacklogSuccess({ at: t0 + 3_600_000 });
  assert.equal((await backlogCircuitStatus()).suspended, true);
});

test("2. owner suspend is durable and cleared ONLY by resume", async () => {
  await suspendBacklogCircuit({ by: "james", reason: "hold until reviewed" });
  setBacklogCircuitStore(memoryStore(db));
  const s = await backlogCircuitStatus();
  assert.equal(s.suspended, true);
  assert.equal(s.state, OWNER_SUSPENDED);
  assert.equal(s.reason, "hold until reviewed");
  await noteBacklogSuccess({});
  assert.equal((await backlogCircuitStatus()).suspended, true, "success must not clear an owner suspend");
  await resumeBacklogCircuit({ by: "james" });
  setBacklogCircuitStore(memoryStore(db));
  const r = await backlogCircuitStatus();
  assert.equal(r.suspended, false);
  assert.equal(r.state, "CLOSED");
  assert.ok(db.rows.length >= 2, "every change is an appended snapshot row (audit)");
  assert.equal(db.rows.at(-1).result, "PASS");
  assert.equal(db.rows.at(-2).result, "FAIL");
});

test("3. an unreadable store FAILS CLOSED (suspended) and is never overwritten by a failure/success note", async () => {
  setBacklogCircuitStore(memoryStore(db, { failLoad: true }));
  const s = await backlogCircuitStatus();
  assert.equal(s.suspended, true);
  assert.equal(s.state, UNREADABLE);
  assert.match(s.reason, /circuit_state_unreadable \(fail closed\)/);
  await noteBacklogFailure({ reason: "provider_schedule_failure" });
  await noteBacklogSuccess({});
  assert.equal(db.rows.length, 0, "no snapshot may be written over an unreadable state");
  assert.equal(circuitSuspended(await loadBacklogCircuit()), true);
  assert.equal(circuitSuspended(null), true);
});

test("4. refill: SUSPENDED circuit -> BACKLOG_SUSPENDED before any provider call, even fully armed", async () => {
  await suspendBacklogCircuit({ by: "james" });
  const rep = await refillQueueReconcile({ dryRun: false, initial: true, env: ARMED_ENV, provider: tripwire });
  assert.equal(rep.ok, false);
  assert.equal(rep.outcome, "BACKLOG_SUSPENDED");
  assert.equal(rep.queued.length, 0);
});

test("5. refill: tripped circuit (3 failures) -> BACKLOG_SUSPENDED, zero provider calls", async () => {
  const t0 = Date.now() - 60_000;
  for (let i = 0; i < 3; i++) await noteBacklogFailure({ reason: "provider_schedule_failure", at: t0 + i });
  const rep = await refillQueueReconcile({ dryRun: false, initial: true, env: ARMED_ENV, provider: tripwire });
  assert.equal(rep.outcome, "BACKLOG_SUSPENDED");
});

test("6. refill: KILL flag -> NOT_ENABLED, zero provider calls (circuit CLOSED)", async () => {
  const rep = await refillQueueReconcile({ dryRun: false, initial: true, env: { ...ARMED_ENV, SOCIAL_BUFFER_BACKLOG_KILL: "true" }, provider: tripwire });
  assert.equal(rep.ok, false);
  assert.match(rep.outcome, /^NOT_ENABLED: SOCIAL_BUFFER_BACKLOG_KILL=true/);
  assert.equal(rep.posture.kill, true);
});

test("7. refill: enable flag unset -> NOT_ENABLED; wrong mode -> WRONG_MODE; both with zero provider calls", async () => {
  const off = await refillQueueReconcile({ dryRun: false, initial: true, env: { SOCIAL_BUFFER_BACKLOG_MODE: "scheduled", BUFFER_ACCESS_TOKEN: "x" }, provider: tripwire });
  assert.match(off.outcome, /^NOT_ENABLED/);
  const wrong = await refillQueueReconcile({ dryRun: false, initial: true, env: { ...ARMED_ENV, SOCIAL_BUFFER_BACKLOG_MODE: "draft" }, provider: tripwire });
  assert.match(wrong.outcome, /^WRONG_MODE/);
});

test("8. refill: unreadable circuit store -> BACKLOG_SUSPENDED (fail closed), zero provider calls", async () => {
  setBacklogCircuitStore(memoryStore(db, { failLoad: true }));
  const rep = await refillQueueReconcile({ dryRun: false, initial: true, env: ARMED_ENV, provider: tripwire });
  assert.equal(rep.outcome, "BACKLOG_SUSPENDED");
  assert.match(rep.circuit.reason, /fail closed/);
});

test("9. route: kill -> durable circuit -> lock, all before refill; every circuit call awaited; no provider import", () => {
  const r = read("app/api/social-backlog-refill/route.js");
  assert.match(r, /status: 401/);
  const iKill = r.indexOf("posture.kill"), iCircuit = r.indexOf("await backlogCircuitStatus()"), iLock = r.indexOf("acquireRefillLock("), iRefill = r.indexOf("refillQueueReconcile(");
  assert.ok(iKill > 0 && iKill < iCircuit && iCircuit < iLock && iLock < iRefill, "gate order: kill < circuit < lock < refill");
  assert.match(r, /outcome: "KILLED"/);
  assert.match(r, /outcome: "BACKLOG_SUSPENDED"/);
  assert.doesNotMatch(r, /providers\/buffer|getSocialProvider|createPost/);
  const refill = read("lib/newsroom/backlogRefill.mjs").replace(/\/\/[^\n]*/g, "");
  assert.doesNotMatch(refill, /[^t] backlogCircuitStatus\(\)/, "every backlogCircuitStatus() call must be awaited");
  assert.doesNotMatch(refill, /[^t] noteBacklog(Failure|Success)\(/, "every noteBacklog* call must be awaited");
  const circuit = read("lib/social/newsroom/backlogCircuit.mjs").replace(/\/\/[^\n]*/g, "");
  assert.doesNotMatch(circuit, /loadCircuit\(|saveCircuit\(|readFileSync|writeFileSync|\.social-preview/, "no file-backed state on the backlog surface");
  assert.doesNotMatch(circuit, /\.from\(|\.insert\(|supabaseAdmin/, "rules module holds no table I/O (NR-3)");
  assert.match(circuit, /loadBacklogCircuitRow, saveBacklogCircuitRow[^\n]*from "\.\/db\.mjs"/, "durable store comes from the sanctioned db.mjs");
  const dbm = read("lib/social/newsroom/db.mjs").replace(/\/\/[^\n]*/g, "");
  assert.match(dbm, /from\("social_qa_runs"\)\s*\.select\([^)]*\)\s*\.eq\("qa_type", BACKLOG_CIRCUIT_QA_TYPE\)/, "reads the newest BACKLOG_CIRCUIT row");
  assert.match(dbm, /qa_type: BACKLOG_CIRCUIT_QA_TYPE,\s*result: circuit\.state === "CLOSED" \? "PASS" : "FAIL"/, "append-only snapshot writes");
  assert.match(dbm, /throw new Error\(`backlog circuit read failed/, "a read error is thrown so the caller fails closed");
  for (const f of ["scripts/socialBacklog.mjs", "scripts/socialDashboard.mjs"]) assert.match(read(f), /await backlogCircuitStatus\(\)/, `${f} awaits the async circuit`);
  assert.match(read("package.json"), /"social:backlog-circuit": "node scripts\/socialBacklogCircuit\.mjs"/);
});

test("10. the runbook no longer claims env flag edits take effect without a redeploy", () => {
  assert.doesNotMatch(read("docs/autonomous-social-email.md"), /invocation without a redeploy\*\*/);
  assert.match(read("docs/social-newsroom-3-runbook.md"), /social:backlog-circuit -- suspend/);
});
