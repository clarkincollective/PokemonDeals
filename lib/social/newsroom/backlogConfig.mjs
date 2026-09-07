// Phase SOCIAL-NEWSROOM-2 - BACKLOG SCHEDULING POSTURE (§11).
//
// SOCIAL_BUFFER_BACKLOG_ENABLED is a SEPARATE concern from live
// autonomous publishing. It gates ONLY the creation of FUTURE-scheduled
// Buffer posts for evergreen/editorial backlog content.
//
// Even with SOCIAL_BUFFER_BACKLOG_ENABLED=true the system still:
//   * never publishes immediately (every provider request must carry a
//     future dueAt at least SCHEDULE_SAFETY_MINUTES away - §25);
//   * never enables Social Stage 1 (SOCIAL_AUTONOMOUS_* are untouched);
//   * never flips RIGHTS_STATE.publishing (that gate is for LIVE Deal
//     Drop autonomy and still applies to that path);
//   * never schedules a LIVE-lane story (Deal Drops go through the
//     existing live-publish gate stack, not this one).
//
// Pure. No I/O.

export const BACKLOG_FLAG = "SOCIAL_BUFFER_BACKLOG_ENABLED";
export const KILL_FLAG = "SOCIAL_BUFFER_BACKLOG_KILL";

// A future dueAt must be at least this far ahead - no near-immediate posts.
export const SCHEDULE_SAFETY_MINUTES = 60;

// Per-run conservative ceiling on how many provider schedule requests to
// fire (§40 rate limiting). Small on purpose.
export const MAX_QUEUE_PER_RUN = 8;
export const MAX_QUEUE_PER_PLATFORM_PER_RUN = 2;

function truthy(v) {
  return v === true || v === "true" || v === "1" || v === "yes";
}

// Resolve the backlog-scheduling posture from an env bag.
//   { enabled, kill, mode: "OFF" | "DRY_RUN" | "QUEUE",
//     canQueueProvider: boolean, reason }
// canQueueProvider is true ONLY when: kill=false, enabled=true, an
// explicit request to queue (requestQueue), AND a Buffer token is present.
export function resolveBacklogPosture(env = process.env, { requestQueue = false } = {}) {
  const kill = truthy(env[KILL_FLAG]);
  const enabled = truthy(env[BACKLOG_FLAG]);
  const hasBuffer = Boolean(env.BUFFER_ACCESS_TOKEN);

  if (kill) {
    return { enabled, kill: true, mode: "OFF", canQueueProvider: false, reason: `${KILL_FLAG}=true (suspended)` };
  }
  if (!enabled) {
    return { enabled: false, kill: false, mode: "DRY_RUN", canQueueProvider: false, reason: `${BACKLOG_FLAG} not set - build/persist only, no provider call` };
  }
  if (!requestQueue) {
    return { enabled: true, kill: false, mode: "DRY_RUN", canQueueProvider: false, reason: "enabled, but no explicit --queue - build/persist only" };
  }
  if (!hasBuffer) {
    return { enabled: true, kill: false, mode: "QUEUE", canQueueProvider: false, reason: "BUFFER_ACCESS_TOKEN missing - cannot reach the provider" };
  }
  return { enabled: true, kill: false, mode: "QUEUE", canQueueProvider: true, reason: "backlog scheduling armed" };
}

// A dueAt is acceptable only if it is a valid future time far enough
// ahead. Returns { ok, reason }.
export function scheduleTimeAcceptable(dueAtIso, { now = Date.now(), safetyMinutes = SCHEDULE_SAFETY_MINUTES } = {}) {
  const t = Date.parse(dueAtIso ?? "");
  if (!Number.isFinite(t)) return { ok: false, reason: "scheduled_for is not a valid timestamp" };
  const minAt = now + safetyMinutes * 60_000;
  if (t <= minAt) return { ok: false, reason: `scheduled_for ${dueAtIso} is <= now + ${safetyMinutes}m safety buffer` };
  return { ok: true, reason: null };
}
