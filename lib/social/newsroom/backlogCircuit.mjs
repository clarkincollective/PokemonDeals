// Phase SOCIAL-NEWSROOM-2 - BACKLOG-QUEUEING CIRCUIT BREAKER (§39).
// STAGE-B CONTAINMENT (2026-09-11) - DURABLE across Vercel invocations.
//
// REUSES the pure circuit primitives from lib/autonomous/runState (no new
// breaker implementation) with its own `surface` key so backlog
// scheduling suspends independently of live autonomous social.
//
// WHY THIS CHANGED: the circuit state used to live in a JSON file under
// .social-preview/, which on Vercel is a fresh, empty filesystem on every
// invocation. A trip recorded by one /api/social-backlog-refill run was
// therefore forgotten by the next - the breaker could never actually hold
// the cron back. The state now lives in Supabase (`social_qa_runs`, the
// same deny-all, service-role-written table the refill lock already uses:
// one append-only snapshot row per change, qa_type "BACKLOG_CIRCUIT"), so
// a trip, an owner suspend, and an owner resume all survive across
// invocations, machines and deploys. The pure trip/resume rules are
// unchanged and still come from runState.mjs.
//
// Trips -> BACKLOG_SUSPENDED after 3 qualifying failures / 24h:
//   * provider scheduling failure
//   * visual-review failure attributable to a renderer/system issue
//   * provider auth error
//   * DB integrity error
// Owner-resume only (a timer never clears it). An OWNER suspend
// (suspendBacklogCircuit) is a deliberate no-deploy kill switch read by the
// route on every invocation; it is cleared only by resumeBacklogCircuit.
//
// FAIL CLOSED: if the durable state cannot be read (DB down, table
// missing, unexpected shape) the circuit reports `suspended: true` with
// reason "circuit_state_unreadable" - the cron then does nothing rather
// than queueing on an unknown state.

import {
  defaultCircuit,
  recordFailure,
  recordSuccess,
  resumeCircuit,
  isTripped,
  CIRCUIT_THRESHOLD,
  CIRCUIT_WINDOW_MS,
} from "../../autonomous/runState.mjs";
import { loadBacklogCircuitRow, saveBacklogCircuitRow, BACKLOG_CIRCUIT_QA_TYPE } from "./db.mjs";

export const BACKLOG_SURFACE = "backlog";
export { BACKLOG_CIRCUIT_QA_TYPE };
export const OWNER_SUSPENDED = "OWNER_SUSPENDED";
export const UNREADABLE = "UNREADABLE";

export const QUALIFYING_FAILURES = Object.freeze([
  "provider_schedule_failure",
  "visual_review_system_failure",
  "provider_auth_error",
  "db_integrity_error",
]);

// ---------------------------------------------------------------- store
// { load(): Promise<circuit|null>, save(circuit): Promise<void> }
// Default = the sanctioned newsroom DB module (db.mjs owns every table
// write). Tests inject an in-memory store via setBacklogCircuitStore();
// nothing else should.

function supabaseStore() {
  return {
    load: () => loadBacklogCircuitRow(),
    save: (circuit) => saveBacklogCircuitRow(circuit),
  };
}

let _store = null;
export function setBacklogCircuitStore(store) {
  _store = store ?? null;
}
function store() {
  return _store ?? (_store = supabaseStore());
}

// ---------------------------------------------------------------- state
function unreadable(reason) {
  return { ...defaultCircuit(BACKLOG_SURFACE), state: UNREADABLE, reason: String(reason).slice(0, 200) };
}

export async function loadBacklogCircuit() {
  try {
    const c = await store().load();
    return c ?? defaultCircuit(BACKLOG_SURFACE);
  } catch (e) {
    return unreadable(e?.message ?? e);
  }
}

async function save(c) {
  await store().save(c);
  return c;
}

export async function noteBacklogFailure({ reason, detail = "", at = Date.now() } = {}) {
  const kind = QUALIFYING_FAILURES.includes(reason) ? reason : "provider_schedule_failure";
  const cur = await loadBacklogCircuit();
  if (cur.state === UNREADABLE) return cur; // never overwrite an unreadable state
  return save(recordFailure(cur, { at, reason: kind, detail }));
}

export async function noteBacklogSuccess({ at = Date.now() } = {}) {
  const cur = await loadBacklogCircuit();
  if (cur.state === UNREADABLE) return cur;
  return save(recordSuccess(cur, { at }));
}

// Deliberate owner stop. Read by every route invocation; survives redeploys
// (it lives in the DB, not in env or on disk). Cleared only by resume.
export async function suspendBacklogCircuit({ by = "owner", reason = "owner_suspend", at = Date.now() } = {}) {
  const cur = await loadBacklogCircuit();
  const base = cur.state === UNREADABLE ? defaultCircuit(BACKLOG_SURFACE) : cur;
  return save({ ...base, state: OWNER_SUSPENDED, tripped_at: new Date(at).toISOString(), reason: String(reason).slice(0, 200), suspended_by: by });
}

export async function resumeBacklogCircuit({ by = "owner", at = Date.now() } = {}) {
  const cur = await loadBacklogCircuit();
  const base = cur.state === UNREADABLE ? defaultCircuit(BACKLOG_SURFACE) : cur;
  const { suspended_by, ...rest } = base;
  return save(resumeCircuit(rest, { by, at }));
}

// Pure: is this circuit blocking? (exported for tests)
export function circuitSuspended(c) {
  return !c || isTripped(c) || c.state === OWNER_SUSPENDED || c.state === UNREADABLE;
}

// { suspended, state, reason, failures_24h, ... }
export async function backlogCircuitStatus() {
  const c = await loadBacklogCircuit();
  return {
    suspended: circuitSuspended(c),
    state: c.state,
    reason: c.state === UNREADABLE ? `circuit_state_unreadable (fail closed): ${c.reason}` : (c.reason ?? null),
    tripped_at: c.tripped_at ?? null,
    failures_24h: (c.failures ?? []).length,
    threshold: CIRCUIT_THRESHOLD,
    window_hours: Math.round(CIRCUIT_WINDOW_MS / 3.6e6),
    durable: true,
  };
}
