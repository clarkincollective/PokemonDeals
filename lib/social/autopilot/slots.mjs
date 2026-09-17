// SOCIAL-LIVE-3 - autopilot posting slots, Australia/Brisbane (UTC+10, no
// DST). Two story slots a day; each story goes to all four feeds, spread
// out. X and Instagram hours match the Stage-B backlog cadence
// (REFILL_SLOT_HOURS_BRISBANE) so the two paths share - and never
// double-book - the same feed slots.

export const BRISBANE_OFFSET_MS = 10 * 3_600_000;
export const STORY_SLOTS = Object.freeze({
  A: Object.freeze({ x: [8, 0], instagram: [10, 0], tiktok: [11, 30], youtube: [12, 30] }),
  B: Object.freeze({ x: [16, 0], instagram: [18, 0], tiktok: [19, 0], youtube: [20, 0] }),
});
export const AUTOPILOT_PLATFORMS = Object.freeze(["x", "instagram", "tiktok", "youtube"]);
export const MIN_LEAD_MINUTES = 65; // the same safety buffer the backlog preflight enforces

// MANUALLY PRODUCED FEEDS (owner decision, 2026-09-18: Instagram).
// A platform listed here is not planned, not reserved, not rendered, not
// submitted to Buffer, and - because planSlotGroups is the single source the
// health check reads - its slots are not counted as empty-queue gaps either.
// Nothing about the channel itself changes: it stays connected, and posts the
// owner writes by hand are untouched.
//
// Reverse it by deleting the entry below, or without a deploy by setting
// SOCIAL_AUTOPILOT_MANUAL_PLATFORMS (comma-separated; empty string = none).
export const MANUAL_PLATFORMS_DEFAULT = Object.freeze(["instagram"]);

export function manualPlatforms(env = process.env) {
  const raw = env?.SOCIAL_AUTOPILOT_MANUAL_PLATFORMS;
  if (raw === undefined || raw === null) return new Set(MANUAL_PLATFORMS_DEFAULT);
  return new Set(String(raw).split(",").map((s) => s.trim().toLowerCase()).filter(Boolean));
}

// the feeds autopilot still owns end to end
export function autopilotPlatforms(env = process.env) {
  const manual = manualPlatforms(env);
  return AUTOPILOT_PLATFORMS.filter((p) => !manual.has(p));
}

export function brisbaneDate(ms) {
  return new Date(ms + BRISBANE_OFFSET_MS).toISOString().slice(0, 10);
}

// slot groups whose posting times fall inside (now + lead, now + horizon]
export function planSlotGroups({ now = Date.now(), horizonHours = 48, leadMinutes = MIN_LEAD_MINUTES, env = process.env } = {}) {
  const groups = [];
  const manual = manualPlatforms(env);
  const today = brisbaneDate(now);
  const [y, m, d] = today.split("-").map(Number);
  for (let off = 0; off <= Math.ceil(horizonHours / 24) + 1; off++) {
    const date = new Date(Date.UTC(y, m - 1, d + off)).toISOString().slice(0, 10);
    for (const [slot, byPlatform] of Object.entries(STORY_SLOTS)) {
      const times = {};
      for (const [platform, [hh, mm]] of Object.entries(byPlatform)) {
        if (manual.has(platform)) continue; // manually produced feed - autopilot plans no slot
        const [yy, mo, dd] = date.split("-").map(Number);
        const t = Date.UTC(yy, mo - 1, dd, hh, mm) - BRISBANE_OFFSET_MS;
        if (t > now + leadMinutes * 60_000 && t <= now + horizonHours * 3_600_000) times[platform] = new Date(t).toISOString();
      }
      if (Object.keys(times).length) groups.push({ key: `${date}|${slot}`, date, slot, times });
    }
  }
  return groups;
}

export function brisbaneLabel(iso) {
  const t = new Date(Date.parse(iso) + BRISBANE_OFFSET_MS);
  return `${t.toISOString().slice(0, 10)} ${t.toISOString().slice(11, 16)} AEST`;
}
