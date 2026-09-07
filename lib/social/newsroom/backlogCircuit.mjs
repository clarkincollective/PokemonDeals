// Phase SOCIAL-NEWSROOM-2 - BACKLOG-QUEUEING CIRCUIT BREAKER (§39).
//
// REUSES the pure circuit primitives from lib/autonomous/runState (no new
// breaker implementation) with its own `surface` key so backlog
// scheduling suspends independently of live autonomous social.
//
// Trips -> BACKLOG_SUSPENDED after 3 qualifying failures / 24h:
//   * provider scheduling failure
//   * visual-review failure attributable to a renderer/system issue
//   * provider auth error
//   * DB integrity error
// Owner-resume only (a timer never clears it).

import {
  loadCircuit,
  saveCircuit,
  recordFailure,
  recordSuccess,
  resumeCircuit,
  isTripped,
  CIRCUIT_THRESHOLD,
  CIRCUIT_WINDOW_MS,
} from "../../autonomous/runState.mjs";

export const BACKLOG_SURFACE = "backlog";

export const QUALIFYING_FAILURES = Object.freeze([
  "provider_schedule_failure",
  "visual_review_system_failure",
  "provider_auth_error",
  "db_integrity_error",
]);

export function loadBacklogCircuit() {
  return loadCircuit(BACKLOG_SURFACE);
}

export function noteBacklogFailure({ reason, detail = "", at = Date.now() } = {}) {
  const kind = QUALIFYING_FAILURES.includes(reason) ? reason : "provider_schedule_failure";
  const next = recordFailure(loadCircuit(BACKLOG_SURFACE), { at, reason: kind, detail });
  return saveCircuit(BACKLOG_SURFACE, next);
}

export function noteBacklogSuccess({ at = Date.now() } = {}) {
  return saveCircuit(BACKLOG_SURFACE, recordSuccess(loadCircuit(BACKLOG_SURFACE), { at }));
}

export function resumeBacklogCircuit({ by = "owner" } = {}) {
  return saveCircuit(BACKLOG_SURFACE, resumeCircuit(loadCircuit(BACKLOG_SURFACE), { by }));
}

// { suspended, state, reason, failures_24h }
export function backlogCircuitStatus() {
  const c = loadCircuit(BACKLOG_SURFACE);
  return {
    suspended: isTripped(c),
    state: c.state,
    reason: c.reason ?? null,
    tripped_at: c.tripped_at ?? null,
    failures_24h: (c.failures ?? []).length,
    threshold: CIRCUIT_THRESHOLD,
    window_hours: Math.round(CIRCUIT_WINDOW_MS / 3.6e6),
  };
}
