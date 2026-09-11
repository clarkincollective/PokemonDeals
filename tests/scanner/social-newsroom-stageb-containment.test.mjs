// STAGE-B CONTAINMENT (2026-09-11) - the backlog circuit is DURABLE,
// RACE-SAFE, and every disabled / killed / suspended / unreadable path
// performs ZERO provider mutations. Pure + static checks, no network, no
// real DB: the circuit store is injected in memory and the provider is a
// tripwire that throws on any call.

import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  setBacklogCircuitStore, backlogCircuitStatus, noteBacklogFailure, noteBacklogSuccess,
  suspendBacklogCircuit, resumeBacklogCircuit, circuitSuspended, loadBacklogCircuit, deriveBacklogCircuit,
  OWNER_SUSPENDED, UNREADABLE,
} from "../../lib/social/newsroom/backlogCircuit.mjs";
import { refillQueueReconcile } from "../../lib/newsroom/backlogRefill.mjs";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => readFileSync(join(REPO, p), "utf8");
const T = (s) => Date.parse(`2026-09-12T${s}Z`);

// A shared "database": an append-only row list. Independent store
// instances over the same rows = separate Vercel invocations.
function memoryDb() { return { rows: [], seq: 0 }; }
function memoryStore(db, { failLoad = false } = {}) {
  return {
    async loadEvents() {
      if (failLoad) throw new Error("simulated DB outage");
      return db.rows.map((r) => ({ ...r.detail, checked_at: r.checked_at }));
    },
    async appendEvent(event) {
      db.rows.push({ qa_type: "BACKLOG_CIRCUIT", checked_at: new Date(1_800_000_000_000 + db.seq++).toISOString(), detail: event });
    },
  };
}
const events = (db) => db.rows.map((r) => r.detail.event);

// Any provider call = a mutation attempt = test failure.
const tripwire = new Proxy({}, { get: (_, m) => () => { throw new Error(`PROVIDER CALLED: ${String(m)}`); } });
const ARMED_ENV = Object.freeze({ SOCIAL_BUFFER_BACKLOG_ENABLED: "true", SOCIAL_BUFFER_BACKLOG_MODE: "scheduled", BUFFER_ACCESS_TOKEN: "x" });

let db;
beforeEach(() => { db = memoryDb(); setBacklogCircuitStore(memoryStore(db)); });

test("1. never-written state is CLOSED; 3 failures / 24h trip it (TRIP marker written); the trip is visible to a DIFFERENT store instance", async () => {
  assert.equal((await backlogCircuitStatus()).suspended, false);
  await noteBacklogFailure({ reason: "provider_schedule_failure", at: T("20:00:00") });
  await noteBacklogFailure({ reason: "provider_schedule_failure", at: T("20:01:00") });
  assert.equal((await backlogCircuitStatus({ now: T("20:02:00") })).suspended, false);
  await noteBacklogFailure({ reason: "provider_auth_error", at: T("20:02:00") });
  const s = await backlogCircuitStatus({ now: T("20:03:00") });
  assert.equal(s.suspended, true);
  assert.equal(s.state, "AUTO_SUSPENDED");
  assert.equal(s.failures_24h, 3);
  assert.deepEqual(events(db), ["FAILURE", "FAILURE", "FAILURE", "TRIP"]);
  setBacklogCircuitStore(memoryStore(db)); // next invocation
  assert.equal((await backlogCircuitStatus({ now: T("21:00:00") })).suspended, true, "trip must be durable across invocations");
  await noteBacklogSuccess({ at: T("22:00:00") });
  assert.equal((await backlogCircuitStatus({ now: T("22:01:00") })).suspended, true, "a success never un-trips");
});

test("2. RACE: a delayed SUCCESS/FAILURE write that started BEFORE an owner suspend can never clear OWNER_SUSPENDED", async () => {
  // Invocation A (a refill run) is mid-flight: it observed CLOSED at 19:59.
  const A = memoryStore(db);
  setBacklogCircuitStore(A);
  assert.equal((await backlogCircuitStatus({ now: T("19:59:00") })).suspended, false);
  // The owner suspends from another machine at 20:00.
  const owner = memoryStore(db);
  await owner.appendEvent({ event: "SUSPEND", by: "james", reason: "hold", at: new Date(T("20:00:00")).toISOString() });
  // A's delayed writes land afterwards - with an EARLIER `at` (stale clock)
  // and with a LATER `at` - both must be inert against the suspend.
  setBacklogCircuitStore(A);
  await noteBacklogSuccess({ at: T("19:59:30") });
  await noteBacklogSuccess({ at: T("20:05:00") });
  await noteBacklogFailure({ reason: "provider_schedule_failure", at: T("19:59:45") });
  for (const store of [A, memoryStore(db)]) {
    setBacklogCircuitStore(store);
    const s = await backlogCircuitStatus({ now: T("20:10:00") });
    assert.equal(s.suspended, true);
    assert.equal(s.state, OWNER_SUSPENDED);
    assert.equal(s.reason, "hold");
  }
  // there is no snapshot anywhere that a late write could have replaced
  assert.ok(db.rows.every((r) => typeof r.detail.event === "string" && !("circuit" in r.detail)), "store must be append-only events, never snapshots");
});

test("3. only an explicit owner RESUME clears a SUSPEND or a TRIP; stale rows dated before the resume no longer count", async () => {
  await suspendBacklogCircuit({ by: "james", reason: "hold", at: T("20:00:00") });
  await noteBacklogSuccess({ at: T("20:30:00") });
  assert.equal((await backlogCircuitStatus({ now: T("20:31:00") })).suspended, true);
  await resumeBacklogCircuit({ by: "james", at: T("21:00:00") });
  setBacklogCircuitStore(memoryStore(db));
  const r = await backlogCircuitStatus({ now: T("21:01:00") });
  assert.equal(r.suspended, false);
  assert.equal(r.state, "CLOSED");
  // an auto trip, then resume, then a DELAYED failure row dated before the resume: ignored
  for (const m of ["21:10", "21:11", "21:12"]) await noteBacklogFailure({ reason: "provider_schedule_failure", at: T(`${m}:00`) });
  assert.equal((await backlogCircuitStatus({ now: T("21:13:00") })).state, "AUTO_SUSPENDED");
  await resumeBacklogCircuit({ by: "james", at: T("22:00:00") });
  await noteBacklogFailure({ reason: "provider_schedule_failure", at: T("21:12:30") }); // stale, pre-resume
  const after = await backlogCircuitStatus({ now: T("22:05:00") });
  assert.equal(after.suspended, false);
  assert.equal(after.failures_24h, 0);
  // a RESUME row must never be produced by a note (only the owner functions write it)
  const resumes = db.rows.filter((r) => r.detail.event === "RESUME");
  assert.equal(resumes.length, 2);
  assert.ok(resumes.every((r) => r.detail.by === "james"));
});

test("4. an unreadable store FAILS CLOSED; a malformed event row also fails closed (never silently CLOSED)", async () => {
  setBacklogCircuitStore(memoryStore(db, { failLoad: true }));
  const s = await backlogCircuitStatus();
  assert.equal(s.suspended, true);
  assert.equal(s.state, UNREADABLE);
  assert.match(s.reason, /circuit_state_unreadable \(fail closed\)/);
  assert.equal(circuitSuspended(await loadBacklogCircuit()), true);
  assert.equal(circuitSuspended(null), true);
  assert.throws(() => deriveBacklogCircuit([{ event: "BOGUS", at: "2026-09-12T00:00:00Z" }]), /malformed/);
  assert.throws(() => deriveBacklogCircuit([{ event: "SUSPEND", at: "not-a-date" }]), /valid "at"/);
  setBacklogCircuitStore(memoryStore(db));
  db.rows.push({ checked_at: "2026-09-12T00:00:00Z", detail: { circuit: { state: "CLOSED" } } }); // an old-shape snapshot row
  assert.equal((await backlogCircuitStatus()).state, UNREADABLE);
});

test("5. refill: SUSPENDED (owner) or TRIPPED circuit -> BACKLOG_SUSPENDED before any provider call, fully armed", async () => {
  await suspendBacklogCircuit({ by: "james" });
  let rep = await refillQueueReconcile({ dryRun: false, initial: true, env: ARMED_ENV, provider: tripwire });
  assert.equal(rep.ok, false); assert.equal(rep.outcome, "BACKLOG_SUSPENDED"); assert.equal(rep.queued.length, 0);
  db = memoryDb(); setBacklogCircuitStore(memoryStore(db));
  const t0 = Date.now() - 60_000;
  for (let i = 0; i < 3; i++) await noteBacklogFailure({ reason: "provider_schedule_failure", at: t0 + i });
  rep = await refillQueueReconcile({ dryRun: false, initial: true, env: ARMED_ENV, provider: tripwire });
  assert.equal(rep.outcome, "BACKLOG_SUSPENDED");
});

test("6. refill: KILL flag / enable unset / wrong mode -> no provider call (circuit CLOSED)", async () => {
  const kill = await refillQueueReconcile({ dryRun: false, initial: true, env: { ...ARMED_ENV, SOCIAL_BUFFER_BACKLOG_KILL: "true" }, provider: tripwire });
  assert.match(kill.outcome, /^NOT_ENABLED: SOCIAL_BUFFER_BACKLOG_KILL=true/); assert.equal(kill.posture.kill, true);
  const off = await refillQueueReconcile({ dryRun: false, initial: true, env: { SOCIAL_BUFFER_BACKLOG_MODE: "scheduled", BUFFER_ACCESS_TOKEN: "x" }, provider: tripwire });
  assert.match(off.outcome, /^NOT_ENABLED/);
  const wrong = await refillQueueReconcile({ dryRun: false, initial: true, env: { ...ARMED_ENV, SOCIAL_BUFFER_BACKLOG_MODE: "draft" }, provider: tripwire });
  assert.match(wrong.outcome, /^WRONG_MODE/);
});

test("7. refill: unreadable circuit store -> BACKLOG_SUSPENDED (fail closed), zero provider calls", async () => {
  setBacklogCircuitStore(memoryStore(db, { failLoad: true }));
  const rep = await refillQueueReconcile({ dryRun: false, initial: true, env: ARMED_ENV, provider: tripwire });
  assert.equal(rep.outcome, "BACKLOG_SUSPENDED");
  assert.match(rep.circuit.reason, /fail closed/);
});

test("8. dry-run contract: every DB write in the refill engine is inside the real-queue path; the circuit note is dryRun-guarded", () => {
  const src = read("lib/newsroom/backlogRefill.mjs").replace(/\/\/[^\n]*/g, "");
  // the dry-run branch `continue`s before the first placement write
  const dryBranch = src.indexOf("if (dryRun) {");
  const firstWrite = src.indexOf("await patchPlacement(");
  assert.ok(dryBranch > 0 && firstWrite > dryBranch, "placement writes must sit after the dry-run branch");
  const between = src.slice(dryBranch, firstWrite);
  assert.match(between, /continue;/, "the dry-run branch must `continue` past the write path");
  assert.doesNotMatch(between, /patchPlacement\(|recordQaRun\(|noteBacklog(Failure|Success)\(/, "no writes inside the dry-run branch");
  // the only pre-branch circuit note is guarded
  assert.match(src, /if \(!dryRun\) await noteBacklogSuccess\(\{ at: now \}\); return report; \}/);
  assert.match(src, /if \(!dryRun && report\.queued\.some\(\(q\) => q\.provider_ref\)\) await noteBacklogSuccess\(/);
  // a dry-run queued entry never carries a provider_ref, so the reconcile loop skips it
  assert.match(src, /if \(!q\.provider_ref\) continue;/);
});

test("9. route: kill -> durable circuit -> lock -> refill, in that order; ?dryRun=1 only skips Buffer, the lock rows are still written", () => {
  const r = read("app/api/social-backlog-refill/route.js").replace(/\/\/[^\n]*/g, "");
  assert.match(r, /status: 401/);
  const iKill = r.indexOf("posture.kill"), iCircuit = r.indexOf("await backlogCircuitStatus()"), iLock = r.indexOf("acquireRefillLock("), iRefill = r.indexOf("refillQueueReconcile(");
  assert.ok(iKill > 0 && iKill < iCircuit && iCircuit < iLock && iLock < iRefill, "gate order: kill < circuit < lock < refill");
  assert.match(r, /outcome: "KILLED"/);
  assert.match(r, /outcome: "BACKLOG_SUSPENDED"/);
  assert.match(r, /searchParams\.get\("dryRun"\) === "1"/, "?dryRun=1 is honoured (forces dryRun)");
  assert.match(r, /refillQueueReconcile\(\{ dryRun, initial: true \}\)/, "and passed through to the engine");
  assert.doesNotMatch(r, /providers\/buffer|getSocialProvider|createPost/);
  // the lock is acquired regardless of dryRun - documented, not a Buffer mutation
  assert.ok(r.indexOf("acquireRefillLock(") < r.indexOf("refillQueueReconcile("));
  const refill = read("lib/newsroom/backlogRefill.mjs").replace(/\/\/[^\n]*/g, "");
  assert.doesNotMatch(refill, /[^t] backlogCircuitStatus\(\)/, "every backlogCircuitStatus() call must be awaited");
  assert.doesNotMatch(refill, /[^t] noteBacklog(Failure|Success)\(/, "every noteBacklog* call must be awaited");
  const circuit = read("lib/social/newsroom/backlogCircuit.mjs").replace(/\/\/[^\n]*/g, "");
  assert.doesNotMatch(circuit, /loadCircuit\(|saveCircuit\(|readFileSync|writeFileSync|\.social-preview/, "no file-backed state on the backlog surface");
  assert.doesNotMatch(circuit, /\.from\(|\.insert\(|supabaseAdmin/, "rules module holds no table I/O (NR-3)");
  assert.match(circuit, /loadBacklogCircuitEvents, appendBacklogCircuitEvent[^\n]*from "\.\/db\.mjs"/, "durable store comes from the sanctioned db.mjs");
  assert.doesNotMatch(circuit, /\.update\(|\.upsert\(|\.delete\(/, "append-only: the rules module never updates or deletes");
  const dbm = read("lib/social/newsroom/db.mjs").replace(/\/\/[^\n]*/g, "");
  const block = dbm.slice(dbm.indexOf("loadBacklogCircuitEvents"), dbm.indexOf("appendBacklogCircuitEvent") + 600);
  assert.doesNotMatch(block, /\.update\(|\.upsert\(|\.delete\(/, "append-only in the I/O module too");
  assert.match(dbm, /\.in\("detail->>event", CIRCUIT_DIRECTIVE_EVENTS\)/, "directive rows are loaded regardless of age");
  assert.match(dbm, /throw new Error\(`backlog circuit read failed/, "a read error is thrown so the caller fails closed");
  for (const f of ["scripts/socialBacklog.mjs", "scripts/socialDashboard.mjs"]) assert.match(read(f), /await backlogCircuitStatus\(\)/, `${f} awaits the async circuit`);
  assert.match(read("package.json"), /"social:backlog-circuit": "node scripts\/socialBacklogCircuit\.mjs"/);
});

test("10. the runbooks no longer claim env flag edits take effect without a redeploy, and document the append-only SQL", () => {
  assert.doesNotMatch(read("docs/autonomous-social-email.md"), /invocation without a redeploy\*\*/);
  const rb = read("docs/social-newsroom-3-runbook.md");
  assert.match(rb, /social:backlog-circuit -- suspend/);
  assert.match(rb, /'event','SUSPEND'/);
  assert.doesNotMatch(rb, /'circuit', jsonb_build_object/);
});
