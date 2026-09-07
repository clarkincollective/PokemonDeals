// Phase SOCIAL-NEWSROOM-1 - THE FOUR CONTENT CLOCKS (§8).
//
// Every series carries a SHELF-LIFE CLASS. It determines how far ahead a
// story may be planned and the latest instant it can still publish
// truthfully. This layer reuses the existing freshness contract
// (lib/social/eligibility.SOCIAL_FRESHNESS_MAX_AGE_HOURS) for LIVE content
// - it does NOT relax it and it does NOT let social accept a stale BIN.
//
// Pure. No I/O, no network.

import { SOCIAL_FRESHNESS_MAX_AGE_HOURS } from "../eligibility.mjs";
import { PUBLISH_SAFETY_MARGIN_MINUTES } from "../planner/freshness.mjs";

const HRS = 3_600_000;
const MIN = 60_000;

export const SHELF_LIFE_CLASSES = Object.freeze(["LIVE", "SHORT", "EDITORIAL", "EVERGREEN"]);

// Nominal planning horizon per class, in hours. LIVE is intentionally the
// social freshness contract itself (not a looser number).
export const CLOCK_HOURS = Object.freeze({
  LIVE: SOCIAL_FRESHNESS_MAX_AGE_HOURS, // hours - a live listing claim
  SHORT: 48, // 12-48h - a fact frozen very recently
  EDITORIAL: 14 * 24, // 3-14d - canonical/observed data
  EVERGREEN: 120 * 24, // weeks/months - explainer content
});

// The floor of each band, for "is this too far ahead" checks.
export const CLOCK_MIN_HOURS = Object.freeze({
  LIVE: 0,
  SHORT: 12,
  EDITORIAL: 3 * 24,
  EVERGREEN: 14 * 24,
});

export function isShelfClass(x) {
  return SHELF_LIFE_CLASSES.includes(String(x || "").toUpperCase());
}

// Compute the publish window for a story.
//   shelfClass  - LIVE | SHORT | EDITORIAL | EVERGREEN
//   capturedAt  - ISO; when the story's facts were frozen
//   anchorAt    - ISO (LIVE only); the exact_verified_at of the underlying
//                 listing. LIVE content is pinned to the freshness
//                 contract from THIS instant, exactly like the planner's
//                 latestSafePublishAt for deal families.
// Returns { valid_from, valid_until, latest_safe_publish_at, basis }.
export function shelfWindow(shelfClass, { capturedAt, anchorAt = null } = {}) {
  const cls = String(shelfClass || "").toUpperCase();
  const capMs = Date.parse(capturedAt ?? "");
  const from = Number.isFinite(capMs) ? capMs : Date.now();

  if (cls === "LIVE") {
    const anchorMs = Date.parse(anchorAt ?? capturedAt ?? "");
    const base = Number.isFinite(anchorMs) ? anchorMs : from;
    const latest = base + SOCIAL_FRESHNESS_MAX_AGE_HOURS * HRS - PUBLISH_SAFETY_MARGIN_MINUTES * MIN;
    return {
      valid_from: new Date(from).toISOString(),
      valid_until: new Date(base + SOCIAL_FRESHNESS_MAX_AGE_HOURS * HRS).toISOString(),
      latest_safe_publish_at: new Date(latest).toISOString(),
      basis: `LIVE: exact_verified_at + ${SOCIAL_FRESHNESS_MAX_AGE_HOURS}h freshness contract - ${PUBLISH_SAFETY_MARGIN_MINUTES}m margin`,
    };
  }

  const span = (CLOCK_HOURS[cls] ?? CLOCK_HOURS.SHORT) * HRS;
  const until = from + span;
  // a small margin so it is never scheduled exactly at the edge
  const latest = until - PUBLISH_SAFETY_MARGIN_MINUTES * MIN;
  return {
    valid_from: new Date(from).toISOString(),
    valid_until: new Date(until).toISOString(),
    latest_safe_publish_at: new Date(latest).toISOString(),
    basis: `${cls}: capture + ${(CLOCK_HOURS[cls] ?? CLOCK_HOURS.SHORT) / 24}d - ${PUBLISH_SAFETY_MARGIN_MINUTES}m margin`,
  };
}

// Can a story of this class still publish at `whenIso`?
export function publishableAt(shelfClass, whenIso, { capturedAt, anchorAt = null } = {}) {
  const { latest_safe_publish_at } = shelfWindow(shelfClass, { capturedAt, anchorAt });
  const when = Date.parse(whenIso);
  const latest = Date.parse(latest_safe_publish_at);
  return Number.isFinite(when) && Number.isFinite(latest) && when <= latest;
}

// LIVE / SHORT belong to the FRESH lane; EDITORIAL / EVERGREEN to the
// PLANNED lane (§9, §10). This is the single source of that split.
export function laneFor(shelfClass) {
  const cls = String(shelfClass || "").toUpperCase();
  return cls === "LIVE" || cls === "SHORT" ? "FRESH" : "PLANNED";
}
