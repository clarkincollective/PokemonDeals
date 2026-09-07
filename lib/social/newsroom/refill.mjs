// Phase SOCIAL-NEWSROOM-2D - RECURRING BACKLOG REFILL PLAN (SS25, SS26).
//
// PREPARED, NOT ACTIVATED. No cron entry, no mutation. A future
// Sunday+Wednesday job would call planRefill() and then run the existing
// render -> host -> QA -> Layer-5 -> queue path for the returned targets.
//
// Rules (SS25):
//   * refill ONLY platforms below their target depth
//   * ONLY series whose render layout is autonomous-safe (reliable Layer-5
//     PASS) AND currently data-supported
//   * NEVER filler - if nothing qualifies, return BACKLOG_LOW_BUT_NO_QUALITY_CONTENT
//   * NEVER overfill - stop at the target's LOW watermark
//   * preserve the fresh-lane reserved capacity (backlogHealth already
//     excludes it from editorial_capacity_per_day)
//
// SS26: a PROVIDER_BLOCKED platform (e.g. no editorial IG path) is
// reported BLOCKED, not EMPTY - it must not drive an endless refill loop.
//
// Pure. No I/O.

import { backlogHealth, refillNeeds, BACKLOG_TARGET_DAYS } from "./backlogHealth.mjs";
import { seriesAutonomousSafe } from "./renderRegistry.mjs";
import { getSeries } from "./series.mjs";

export const REFILL_SCHEDULE = Object.freeze({
  days: ["sunday", "wednesday"],
  cron_hint: "0 20 * * 0,3", // 20:00 UTC Sun+Wed - NOT added to vercel.json
  activated: false,
});

// platform -> its editorial readiness (SS16/SS26). Instagram editorial is
// SUPPORTED (single static `post` verified). TikTok editorial has no
// motion renderer wired -> NOT_PLATFORM_FIT (the fresh/live TikTok video
// path is separate and unaffected).
export const PLATFORM_EDITORIAL_STATUS = Object.freeze({
  instagram: "SUPPORTED",
  x: "SUPPORTED",
  youtube: "SUPPORTED_WITH_LIMITATIONS", // 9:16 Layer-5 is flakier; narrative/editorial series only
  tiktok: "NOT_PLATFORM_FIT", // motion-only, no editorial motion renderer
});

// candidateSeries: the series the caller knows are data-supported right
// now (from supportMatrix). placements: the persisted placement rows.
export function planRefill({ candidateSeries = [], placements = [], now = Date.now() } = {}) {
  const health = backlogHealth(placements, { now });
  const needs = refillNeeds(health); // [{ platform, state, days_covered, need_slots }]

  const safeSeries = candidateSeries.filter((s) => seriesAutonomousSafe(s) && getSeries(s));
  const perPlatform = [];
  for (const n of needs) {
    const status = PLATFORM_EDITORIAL_STATUS[n.platform] ?? "UNKNOWN";
    if (status === "NOT_PLATFORM_FIT" || status === "PROVIDER_BLOCKED") {
      perPlatform.push({ platform: n.platform, state: "BLOCKED", reason: status, refill: 0 });
      continue;
    }
    if (!safeSeries.length) {
      perPlatform.push({ platform: n.platform, state: "BACKLOG_LOW_BUT_NO_QUALITY_CONTENT", refill: 0 });
      continue;
    }
    // never overfill: cap the ask at the LOW watermark
    const lowDays = (BACKLOG_TARGET_DAYS[n.platform] ?? [3])[0];
    const cap = Math.max(0, Math.min(n.need_slots, Math.ceil(lowDays * (health.by_platform[n.platform]?.editorial_capacity_per_day ?? 1))));
    perPlatform.push({
      platform: n.platform,
      state: cap > 0 ? "REFILL" : "AT_TARGET",
      refill: cap,
      series_pool: safeSeries,
    });
  }
  return {
    schedule: REFILL_SCHEDULE,
    overall: health.overall,
    platform_editorial_status: PLATFORM_EDITORIAL_STATUS,
    needs: perPlatform,
    total_refill_slots: perPlatform.reduce((s, p) => s + p.refill, 0),
    note: "Prepared only. No cron is wired. A refill run would render/host/QA/Layer-5/queue the returned series into the below-target platforms.",
  };
}
