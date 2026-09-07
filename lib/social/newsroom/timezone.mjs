// Phase SOCIAL-NEWSROOM-2 - TIMEZONE SAFETY (§15).
//
// The owner is Australia/Brisbane (UTC+10, no DST). Buffer schedules in
// UTC (dueAt is an ISO instant). Every stored schedule is
// scheduled_for_utc; scheduled_for_local + timezone are advisory. All
// conversions are explicit here - no ambient `new Date()` local math.
//
// Pure. No I/O.

export const OWNER_TZ = "Australia/Brisbane";
export const OWNER_UTC_OFFSET_HOURS = 10; // no DST, ever

const HRS = 3_600_000;

// A Brisbane wall-clock { y, m, d, hh, mm } -> the UTC instant (ISO).
export function brisbaneWallToUtc({ y, m, d, hh = 0, mm = 0 } = {}) {
  const asIfUtc = Date.UTC(y, m - 1, d, hh, mm, 0);
  return new Date(asIfUtc - OWNER_UTC_OFFSET_HOURS * HRS).toISOString();
}

// A UTC instant -> the Brisbane wall-clock label (for display / audit).
export function utcToBrisbaneLabel(iso) {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  const b = new Date(t + OWNER_UTC_OFFSET_HOURS * HRS);
  const pad = (n) => String(n).padStart(2, "0");
  return `${b.getUTCFullYear()}-${pad(b.getUTCMonth() + 1)}-${pad(b.getUTCDate())} ${pad(b.getUTCHours())}:${pad(b.getUTCMinutes())} ${OWNER_TZ}`;
}

// The Brisbane calendar date (YYYY-MM-DD) that a UTC instant falls on.
export function brisbaneDateOf(iso) {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  return new Date(t + OWNER_UTC_OFFSET_HOURS * HRS).toISOString().slice(0, 10);
}

// Normalise a schedule request into the stored shape.
//   input: an ISO string (assumed UTC) OR { utc } OR { brisbane:{...} }
export function normaliseSchedule(input) {
  let utcIso = null;
  if (typeof input === "string") utcIso = input;
  else if (input?.utc) utcIso = input.utc;
  else if (input?.brisbane) utcIso = brisbaneWallToUtc(input.brisbane);
  const t = Date.parse(utcIso ?? "");
  if (!Number.isFinite(t)) return null;
  const iso = new Date(t).toISOString();
  return {
    scheduled_for_utc: iso,
    scheduled_for_local: utcToBrisbaneLabel(iso),
    timezone: OWNER_TZ,
  };
}
