// Phase 13E.8A - PLATFORM ROLES, CADENCE CEILINGS, SPACING, POSTING WINDOWS
// (§2, §3, §13, §14).
//
// Distinct role per platform - nothing goes to every platform by default.
// All ceilings are PLANNING CEILINGS, never quotas: if no qualifying
// content exists, the planner posts nothing (§21).

// coarse service key for a distribution platform id
export function serviceOf(platform) {
  const p = String(platform ?? "").toLowerCase();
  if (p.startsWith("instagram")) return "instagram";
  if (p === "tiktok") return "tiktok";
  if (p === "x_post" || p === "x" || p === "twitter") return "x";
  if (p.startsWith("youtube")) return "youtube";
  return null;
}

// §2 - what each platform is FOR, and which families it should carry.
export const PLATFORM_ROLES = Object.freeze({
  instagram: {
    label: "Instagram",
    role: "polished visual brand — Deal Drops, carousels, Reels, Market Movers",
    families: ["deal_drop", "market_mover", "hook_carousel", "brand_ad"],
  },
  tiktok: {
    label: "TikTok",
    role: "short-form discovery — scroll-stop Deal Drops, Market Movers, fast carousel-motion",
    families: ["deal_drop", "market_mover", "hook_carousel"],
  },
  x: {
    label: "X",
    role: "immediate deal alerts + concise market observations + real price movement + link traffic",
    families: ["deal_drop", "market_mover"],
  },
  youtube: {
    label: "YouTube Shorts",
    role: "evergreen/discoverable shorts — Deal Drops, Market Movers, educational/data hooks",
    families: ["deal_drop", "market_mover", "brand_ad"],
  },
});

// §3 - conservative INITIAL cadence ceilings (per calendar day, in the
// owner's timezone). Not quotas.
export const CADENCE_CEILING_PER_DAY = Object.freeze({
  instagram: 2,
  tiktok: 2,
  x: 4,
  youtube: 1,
});

// carousels are selective (§3) - a separate, lower weekly ceiling.
export const CAROUSEL_CEILING_PER_WEEK = 3;

// §11 - Brand Ad is comparatively rare.
export const BRAND_AD_CEILING_PER_WEEK = 2;

// §14 - minimum spacing between two placements on the SAME service.
// X can be tighter than Instagram.
export const MIN_SPACING_MINUTES = Object.freeze({
  instagram: 240, // 4h
  tiktok: 240,
  x: 45,
  youtube: 360, // 6h
});

// §13 - INITIAL proposed posting windows. NOT "statistically optimal" -
// diversified TEST windows until 13E.7A performance data exists. Stored
// and reasoned about in UTC; the owner is Australia/Brisbane (UTC+10, no
// DST) and the audience skews US, so the windows straddle US daytime +
// early-US-evening with one AU-friendly morning slot.
//
//   17:00 UTC = 03:00 Brisbane / 12:00 US-CT / 13:00 US-ET  (US midday)
//   21:00 UTC = 07:00 Brisbane / 16:00 US-CT / 17:00 US-ET  (US afternoon)
//   00:00 UTC = 10:00 Brisbane / 19:00 US-CT / 20:00 US-ET  (US evening / AU morning)
//   13:00 UTC = 23:00 Brisbane / 08:00 US-CT / 09:00 US-ET  (US morning)
export const POSTING_WINDOWS_UTC_HOURS = Object.freeze({
  instagram: [21, 0], // afternoon + evening US
  tiktok: [0, 17], // evening US + midday US
  x: [13, 17, 21, 0], // spread across the US day (matches the x ceiling of 4)
  youtube: [17], // one midday-US slot
});

// US Eastern is UTC-4 (Sep = EDT). Display helper only.
export const US_ET_OFFSET_HOURS = -4;
