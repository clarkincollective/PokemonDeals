// Phase SOCIAL-NEWSROOM-2D / -3 - RECURRING BACKLOG REFILL PLAN (SS25, SS26).
//
// SOCIAL-NEWSROOM-3: the refill JOB is built (lib/newsroom/backlogRefill +
// `npm run social:backlog -- --refill` + /api/social-backlog-refill) but
// the Sunday+Wednesday PRODUCTION CRON is still NOT in vercel.json - it is
// activated only after a clean proof refill (SS30), an owner step.
//
// Rules (SS25):
//   * refill ONLY platforms below their target depth (IG + X only, SS5)
//   * AUTONOMOUS_SAFE families proceed through standard QA; CONDITIONAL
//     families need per-artifact visual consensus (policy 3c.1); MANUAL_ONLY
//     NEVER reaches the autonomous queue
//   * NEVER filler - if nothing qualifies, return BACKLOG_LOW_BUT_NO_QUALITY_CONTENT
//   * NEVER overfill - stop at the target's LOW watermark
//   * preserve the fresh-lane reserved capacity (backlogHealth already
//     excludes it from editorial_capacity_per_day)
//
// SS26: a NOT_PLATFORM_FIT / PROVIDER_BLOCKED platform is reported BLOCKED,
// not EMPTY - it must not drive an endless refill loop.
//
// Pure. No I/O.

import { backlogHealth, refillNeeds, BACKLOG_TARGET_DAYS } from "./backlogHealth.mjs";
import { getSeries } from "./series.mjs";
import { familyStatusFor } from "./cardLayoutStatus.mjs";

// SS3 / SOCIAL-NEWSROOM-3B SS16 - the prepared TWO-STAGE cadence
// (Australia/Brisbane is UTC+10, no DST):
//   Stage A  CI build + render + QA + consensus + host   05:00 Brisbane
//            Sun + Wed = 19:00 UTC Sat + Tue  ->  "0 19 * * 6,2"
//   Stage B  Vercel /api/social-backlog-refill queue+reconcile
//            06:00 Brisbane Sun + Wed = 20:00 UTC Sat + Tue  ->  "0 20 * * 6,2"
// One hour separation so a render never races a queue. NOTHING is added
// to vercel.json / .github until an owner proof (SS28/SS30).
export const REFILL_SCHEDULE = Object.freeze({
  days: ["sunday", "wednesday"],
  build_render_cron_utc: "0 19 * * 6,2",   // GitHub Actions - Stage A
  queue_cron_utc: "0 20 * * 6,2",           // Vercel cron - Stage B
  cron_hint: "0 20 * * 6,2",                // (Stage B; back-compat alias)
  cron_utc: "20:00 UTC Sat + Tue",
  brisbane_local: "06:00 Australia/Brisbane Sun + Wed (build/render 05:00; UTC+10, no DST)",
  activated: true,
});

// A series the refill may consider. AUTONOMOUS_SAFE -> yes (standard QA);
// CONDITIONAL -> yes but each exact artifact must clear consensus at queue
// time; MANUAL_ONLY / WITHHELD -> never. Falls back to the legacy
// renderRegistry autonomous flag for the typographic editorial series
// (which have no card-forward FAMILY_STATUS row).
export function refillConsiderable(series) {
  const fs = familyStatusFor(series);
  if (fs) return fs === "AUTONOMOUS_SAFE" || fs === "CONDITIONAL";
  // typographic editorial series (METHODOLOGY / PRODUCT_EXPLAINER / ...):
  // keep the SOCIAL-CREATIVE-3B set that was proven >=80% Layer-5 PASS
  return ["METHODOLOGY", "PRODUCT_EXPLAINER", "HOW_WE_FIND_DEALS"].includes(String(series || "").toUpperCase());
}
export function refillNeedsConsensus(series) {
  return familyStatusFor(series) === "CONDITIONAL";
}

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
// SS12 - the FIRST live refill is conservative: cap the ask at these
// day-depths instead of the full BACKLOG_TARGET_DAYS. Only after a clean
// reconcile may a later run use the normal targets.
export const INITIAL_HORIZON_DAYS = Object.freeze({ instagram: [3, 5], x: [2, 3] });

// SS5 - editorial backlog is IG + X only to start. YouTube stays
// manual/selective; TikTok is NOT_PLATFORM_FIT.
export const EDITORIAL_REFILL_PLATFORMS = Object.freeze(["instagram", "x"]);

export function planRefill({ candidateSeries = [], placements = [], now = Date.now(), initial = false, platforms = EDITORIAL_REFILL_PLATFORMS } = {}) {
  const health = backlogHealth(placements, { now });
  const needs = refillNeeds(health); // [{ platform, state, days_covered, need_slots }]

  const safeSeries = candidateSeries.filter((s) => refillConsiderable(s) && getSeries(s));
  const perPlatform = [];
  for (const n of needs) {
    if (!platforms.includes(n.platform)) {
      perPlatform.push({ platform: n.platform, state: "OUT_OF_INITIAL_SCOPE", refill: 0 });
      continue;
    }
    const status = PLATFORM_EDITORIAL_STATUS[n.platform] ?? "UNKNOWN";
    if (status === "NOT_PLATFORM_FIT" || status === "PROVIDER_BLOCKED") {
      perPlatform.push({ platform: n.platform, state: "BLOCKED", reason: status, refill: 0 });
      continue;
    }
    if (!safeSeries.length) {
      perPlatform.push({ platform: n.platform, state: "BACKLOG_LOW_BUT_NO_QUALITY_CONTENT", refill: 0 });
      continue;
    }
    // never overfill: cap the ask at the LOW watermark of the applicable
    // horizon (SS12 - the initial live refill uses a shallower horizon)
    const lowDays = initial
      ? (INITIAL_HORIZON_DAYS[n.platform] ?? [2])[0]
      : (BACKLOG_TARGET_DAYS[n.platform] ?? [3])[0];
    const cap = Math.max(0, Math.min(n.need_slots, Math.ceil(lowDays * (health.by_platform[n.platform]?.editorial_capacity_per_day ?? 1))));
    perPlatform.push({
      platform: n.platform,
      state: cap > 0 ? "REFILL" : "AT_TARGET",
      refill: cap,
      series_pool: safeSeries,
      conditional_in_pool: safeSeries.filter(refillNeedsConsensus),
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
