// Phase SOCIAL-NEWSROOM-2 - BACKLOG-QUEUEING CIRCUIT BREAKER (§39).
// STAGE-B CONTAINMENT (2026-09-11) - DURABLE and RACE-SAFE across Vercel
// invocations.
//
// REUSES the pure circuit primitives from lib/autonomous/runState (no new
// breaker implementation) with its own `surface` key so backlog
// scheduling suspends independently of live autonomous social.
//
// WHY THIS CHANGED: the circuit state used to live in a JSON file under
// .social-preview/, which on Vercel is a fresh, empty filesystem on every
// invocation - a trip recorded by one /api/social-backlog-refill run was
// forgotten by the next, so the breaker could never actually hold the
// cron back.
//
// HOW IT IS STORED NOW - append-only EVENTS, never snapshots. Each change
// is one row in `social_qa_runs` (qa_type BACKLOG_CIRCUIT, deny-all RLS,
// service-role only - the same table the refill lock uses) through the
// sanctioned db.mjs write path:
//
//   FAILURE  { reason, detail, at }   a qualifying failure (counter)
//   SUCCESS  { at }                   a successful mutating run (counter)
//   TRIP     { reason, at }           written when a FAILURE reaches the
//                                     threshold - a sticky auto-suspend marker
//   SUSPEND  { by, reason, at }       OWNER stop
//   RESUME   { by, at }               OWNER resume - the ONLY thing that
//                                     clears a SUSPEND or a TRIP
//
// The current state is DERIVED from the events (deriveBacklogCircuit):
//   * owner-suspended  = the newest SUSPEND is later than the newest RESUME
//   * auto-suspended   = the newest TRIP is later than the newest RESUME
//   * failure counting = the pure runState fold (recordFailure /
//     recordSuccess / resumeCircuit) over the events in time order
// Because SUCCESS / FAILURE rows can only ever ADD a row, a delayed or
// concurrent success/failure write can never clear an owner SUSPEND or a
// TRIP - there is no snapshot to overwrite. Snapshot-based
// "newest row wins" storage had exactly that race and was replaced.
//
// FAIL CLOSED: if the events cannot be read (DB down, table missing, a row
// of unexpected shape) the circuit reports `suspended: true` with reason
// "circuit_state_unreadable" - the cron then does nothing rather than
// queueing on an unknown state.

import {
  defaultCircuit,
  recordFailure,
  recordSuccess,
  resumeCircuit,
  isTripped,
  CIRCUIT_THRESHOLD,
  CIRCUIT_WINDOW_MS,
} from "../../autonomous/runState.mjs";
import { loadBacklogCircuitEvents, appendBacklogCircuitEvent, BACKLOG_CIRCUIT_QA_TYPE } from "./db.mjs";

export const BACKLOG_SURFACE = "backlog";
export { BACKLOG_CIRCUIT_QA_TYPE };
export const OWNER_SUSPENDED = "OWNER_SUSPENDED";
export const UNREADABLE = "UNREADABLE";
export const CIRCUIT_EVENTS = Object.freeze(["FAILURE", "SUCCESS", "TRIP", "SUSPEND", "RESUME"]);

export const QUALIFYING_FAILURES = Object.freeze([
  "provider_schedule_failure",
  "visual_review_system_failure",
  "provider_auth_error",
  "db_integrity_error",
]);

// ---------------------------------------------------------------- store
// { loadEvents(): Promise<event[]>, appendEvent(event): Promise<void> }
// Default = the sanctioned newsroom DB module (db.mjs owns every table
// write). Tests inject an in-memory store via setBacklogCircuitStore();
// nothing else should.
function supabaseStore() {
  return {
    loadEvents: () => loadBacklogCircuitEvents(),
    appendEvent: (event) => appendBacklogCircuitEvent(event),
  };
}
let _store = null;
export function setBacklogCircuitStore(store) {
  _store = store ?? null;
}
function store() {
  return _store ?? (_store = supabaseStore());
}

// ---------------------------------------------------------------- derive
const ms = (v) => {
  const t = typeof v === "number" ? v : Date.parse(v ?? "");
  return Number.isFinite(t) ? t : NaN;
};

// Pure. `events` = [{ event, at, reason?, detail?, by?, checked_at? }] in
// any order. Throws on a malformed event (unknown type / unparseable
// `at`) so the caller fails closed. Returns
// { circuit, ownerSuspended, autoSuspended, lastResumeAt, ... }.
export function deriveBacklogCircuit(events, { now = Date.now() } = {}) {
  const norm = (events ?? []).map((e) => {
    if (!e || !CIRCUIT_EVENTS.includes(e.event)) throw new Error(`malformed backlog circuit event: ${JSON.stringify(e).slice(0, 120)}`);
    const at = ms(e.at);
    if (!Number.isFinite(at)) throw new Error(`backlog circuit event without a valid "at": ${e.event}`);
    const seq = ms(e.checked_at);
    return { ...e, at, seq: Number.isFinite(seq) ? seq : at };
  });
  norm.sort((a, b) => a.at - b.at || a.seq - b.seq);

  const latest = (type) => norm.filter((e) => e.event === type).at(-1) ?? null;
  const lastResume = latest("RESUME");
  const lastResumeAt = lastResume ? lastResume.at : -Infinity;
  const lastSuspend = latest("SUSPEND");
  const lastTrip = latest("TRIP");
  const ownerSuspended = Boolean(lastSuspend && lastSuspend.at > lastResumeAt);
  const autoSuspended = Boolean(lastTrip && lastTrip.at > lastResumeAt);

  // Counter fold with the pure primitives, in time order.
  let c = defaultCircuit(BACKLOG_SURFACE);
  for (const e of norm) {
    if (e.event === "RESUME") c = resumeCircuit(c, { by: e.by ?? "owner", at: e.at });
    else if (e.at <= lastResumeAt) continue; // pre-resume history no longer counts
    else if (e.event === "FAILURE") c = recordFailure(c, { at: e.at, reason: e.reason ?? "provider_schedule_failure", detail: e.detail ?? "" });
    else if (e.event === "SUCCESS") c = recordSuccess(c, { at: e.at });
  }
  // display: only failures still inside the window relative to NOW
  const cutoff = now - CIRCUIT_WINDOW_MS;
  c = { ...c, failures: (c.failures ?? []).filter((f) => ms(f.at) >= cutoff) };
  if (autoSuspended && !isTripped(c)) {
    c = { ...c, state: "AUTO_SUSPENDED", tripped_at: new Date(lastTrip.at).toISOString(), reason: lastTrip.reason ?? c.reason ?? "tripped" };
  }
  if (ownerSuspended) {
    c = { ...c, state: OWNER_SUSPENDED, tripped_at: new Date(lastSuspend.at).toISOString(), reason: lastSuspend.reason ?? "owner_suspend", suspended_by: lastSuspend.by ?? "owner" };
  }
  return { circuit: c, ownerSuspended, autoSuspended, lastResumeAt: Number.isFinite(lastResumeAt) ? new Date(lastResumeAt).toISOString() : null, eventCount: norm.length };
}

// Pure: is this circuit blocking? (exported for tests)
export function circuitSuspended(c) {
  return !c || isTripped(c) || c.state === OWNER_SUSPENDED || c.state === UNREADABLE;
}

function unreadable(reason) {
  return { ...defaultCircuit(BACKLOG_SURFACE), state: UNREADABLE, reason: String(reason).slice(0, 200) };
}

// ---------------------------------------------------------------- reads
export async function loadBacklogCircuit({ now = Date.now() } = {}) {
  try {
    const events = await store().loadEvents();
    return deriveBacklogCircuit(events, { now }).circuit;
  } catch (e) {
    return unreadable(e?.message ?? e);
  }
}

// { suspended, state, reason, failures_24h, ... }
export async function backlogCircuitStatus({ now = Date.now() } = {}) {
  const c = await loadBacklogCircuit({ now });
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

// ---------------------------------------------------------------- writes
// Every write is an APPEND. None of them reads-then-overwrites state, so
// none can race an owner directive away.
const iso = (at) => new Date(at).toISOString();

export async function noteBacklogFailure({ reason, detail = "", at = Date.now() } = {}) {
  const kind = QUALIFYING_FAILURES.includes(reason) ? reason : "provider_schedule_failure";
  await store().appendEvent({ event: "FAILURE", reason: kind, detail: String(detail).slice(0, 200), at: iso(at) });
  // Did this failure reach the threshold? If so write the sticky TRIP
  // marker (a later-arriving SUCCESS with an earlier `at` can then never
  // un-trip it). Two concurrent trippers may both write TRIP - harmless.
  const c = await loadBacklogCircuit({ now: at });
  if (c.state === UNREADABLE) return c;
  if (isTripped(c) && c.state === "AUTO_SUSPENDED") {
    const events = await store().loadEvents();
    const { autoSuspended } = deriveBacklogCircuit(events, { now: at });
    if (!autoSuspended) await store().appendEvent({ event: "TRIP", reason: c.reason ?? `${CIRCUIT_THRESHOLD} mutation failures within ${Math.round(CIRCUIT_WINDOW_MS / 3.6e6)}h`, at: iso(at) });
  }
  return loadBacklogCircuit({ now: at });
}

export async function noteBacklogSuccess({ at = Date.now() } = {}) {
  await store().appendEvent({ event: "SUCCESS", at: iso(at) });
  return loadBacklogCircuit({ now: at });
}

// Deliberate owner stop. Read by every route invocation; survives
// redeploys (it lives in the DB, not in env or on disk). Cleared only by
// resumeBacklogCircuit.
export async function suspendBacklogCircuit({ by = "owner", reason = "owner_suspend", at = Date.now() } = {}) {
  await store().appendEvent({ event: "SUSPEND", by, reason: String(reason).slice(0, 200), at: iso(at) });
  return loadBacklogCircuit({ now: at });
}

export async function resumeBacklogCircuit({ by = "owner", at = Date.now() } = {}) {
  await store().appendEvent({ event: "RESUME", by, at: iso(at) });
  return loadBacklogCircuit({ now: at });
}
