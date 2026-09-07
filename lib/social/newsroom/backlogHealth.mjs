// Phase SOCIAL-NEWSROOM-1 - BUFFER BACKLOG HEALTH + RESERVED CAPACITY
// (§9, §11, §12, §30, §32, §33).
//
// The system maintains a PLANNED editorial backlog days ahead while
// keeping ~20-30% of each platform's publishing capacity RESERVED for
// fresh live Deal Drops. A 30-day queue is NOT better than a 10-day one -
// OVERFILLED is a real bad state.
//
// Capacity is derived from the EXISTING cadence ceilings
// (lib/social/planner/platformRoles.CADENCE_CEILING_PER_DAY) - this layer
// invents no new posting quota.
//
// Pure. No I/O.

import { CADENCE_CEILING_PER_DAY } from "../planner/platformRoles.mjs";

const DAY = 86_400_000;

// §9 - target backlog DEPTH per platform, in days. Health targets, not
// quotas. [low_watermark, high_watermark].
export const BACKLOG_TARGET_DAYS = Object.freeze({
  instagram: [7, 10],
  tiktok: [5, 7],
  x: [2, 4],
  youtube: [10, 14],
});

// §11 - fraction of each platform's daily capacity kept for the FRESH
// lane. Planned editorial fills at most (1 - reserve) of capacity.
export const FRESH_RESERVE_FRACTION = Object.freeze({
  instagram: 0.3,
  tiktok: 0.3,
  x: 0.4, // X is more live by design (§11, §41)
  youtube: 0.2, // YouTube leans evergreen/editorial (§11)
});

// planned editorial slots available per platform per day.
export function editorialCapacityPerDay(platform) {
  const cap = CADENCE_CEILING_PER_DAY[platform] ?? 1;
  const reserve = FRESH_RESERVE_FRACTION[platform] ?? 0.3;
  return Math.max(1, Math.floor(cap * (1 - reserve)) || 1);
}

export function freshReservePerDay(platform) {
  const cap = CADENCE_CEILING_PER_DAY[platform] ?? 1;
  return Math.max(0, cap - editorialCapacityPerDay(platform));
}

// placements: [{ platform, planned_for (ISO), status, lane }]. Only
// forward-looking, non-terminal PLANNED-lane items count toward depth.
const COUNTS_AS_BACKLOG = new Set(["PLANNED", "RENDERED", "QA_PASS", "HOSTED", "BUFFER_READY", "BUFFER_QUEUED"]);

export function backlogHealthForPlatform(platform, placements = [], { now = Date.now() } = {}) {
  const capPerDay = editorialCapacityPerDay(platform);
  const [lo, hi] = BACKLOG_TARGET_DAYS[platform] ?? [3, 7];

  const future = placements
    .filter((p) => p.platform === platform)
    .filter((p) => COUNTS_AS_BACKLOG.has(p.status))
    .filter((p) => p.lane !== "FRESH")
    .map((p) => Date.parse(p.planned_for))
    .filter((t) => Number.isFinite(t) && t >= now)
    .sort((a, b) => a - b);

  const scheduled_count = future.length;
  const days_covered = Number((scheduled_count / capPerDay).toFixed(1));

  // next gap: first day (from tomorrow) with zero planned items
  let next_gap = null;
  for (let d = 0; d < Math.max(hi + 3, 14); d++) {
    const dayStart = now + d * DAY;
    const dayEnd = dayStart + DAY;
    const inDay = future.filter((t) => t >= dayStart && t < dayEnd).length;
    if (inDay === 0) {
      next_gap = new Date(dayStart).toISOString().slice(0, 10);
      break;
    }
  }

  let state;
  if (scheduled_count === 0) state = "EMPTY";
  else if (days_covered < lo * 0.5) state = "LOW";
  else if (days_covered < lo) state = "WATCH";
  else if (days_covered > hi * 1.5) state = "OVERFILLED";
  else state = "HEALTHY";

  return {
    platform,
    editorial_capacity_per_day: capPerDay,
    fresh_reserved_per_day: freshReservePerDay(platform),
    target_days: [lo, hi],
    scheduled_count,
    days_covered,
    next_gap,
    oldest_planned: future.length ? new Date(future[0]).toISOString() : null,
    latest_planned: future.length ? new Date(future[future.length - 1]).toISOString() : null,
    state,
  };
}

export function backlogHealth(placements = [], { now = Date.now() } = {}) {
  const platforms = ["instagram", "tiktok", "x", "youtube"];
  const byPlatform = {};
  for (const p of platforms) byPlatform[p] = backlogHealthForPlatform(p, placements, { now });
  const worst = ["EMPTY", "LOW", "WATCH", "OVERFILLED", "HEALTHY"].find((s) =>
    Object.values(byPlatform).some((h) => h.state === s)
  );
  return { by_platform: byPlatform, overall: worst ?? "EMPTY" };
}

// §30 - which platforms need a refill, in priority order (most under first).
export function refillNeeds(health) {
  const order = { EMPTY: 0, LOW: 1, WATCH: 2, OVERFILLED: 8, HEALTHY: 9 };
  return Object.values(health.by_platform ?? {})
    .filter((h) => order[h.state] <= 2)
    .sort((a, b) => order[a.state] - order[b.state] || a.days_covered - b.days_covered)
    .map((h) => ({ platform: h.platform, state: h.state, days_covered: h.days_covered, need_slots: Math.max(0, Math.ceil((h.target_days[0] - h.days_covered) * h.editorial_capacity_per_day)) }));
}
