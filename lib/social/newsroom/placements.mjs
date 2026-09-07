// Phase SOCIAL-NEWSROOM-1 - ONE STORY -> MANY PLATFORM-NATIVE PLACEMENTS
// (§2, §19, §39, §40, §41).
//
// A STORY is platform-independent. A PLACEMENT is that story presented
// natively on one platform. Placements are NOT four unrelated ideas and
// they are NOT literal copies of each other - each carries a
// platform-native caption shape and media kind.
//
// This module decides WHICH placements a story gets and stamps the
// per-platform presentation contract. It does NOT render pixels or call
// Buffer - lib/social/render.mjs + the distribution layer own that.
//
// Pure. No I/O.

import { createHash } from "node:crypto";
import { getSeries } from "./series.mjs";
import { SERIES_RENDER } from "./renderRegistry.mjs";
import { PLATFORM_ROLES } from "../planner/platformRoles.mjs";

// platform -> native media kind for a given series clock/pillar.
// SOCIAL-NEWSROOM-2D: editorial newsroom assets are SINGLE images, so
// Instagram is a static feed `post` - never `carousel` (Buffer rejects a
// 1-asset carousel with InvalidInputError). A future genuinely
// multi-frame editorial story would set placement_type: "carousel"
// explicitly at build time.
const MEDIA_KIND = Object.freeze({
  instagram: { LIVE: "post", SHORT: "post", EDITORIAL: "post", EVERGREEN: "post" },
  tiktok: { LIVE: "video", SHORT: "video", EDITORIAL: "video", EVERGREEN: "video" },
  x: { LIVE: "post", SHORT: "post", EDITORIAL: "post", EVERGREEN: "post" },
  youtube: { LIVE: "short", SHORT: "short", EDITORIAL: "short", EVERGREEN: "short" },
});

// platform -> caption STYLE contract (§19). The renderer/caption layer
// fills the words; this fixes the register so the four are meaningfully
// different, not one text reused.
export const CAPTION_STYLE = Object.freeze({
  instagram: { register: "visual/editorial", max_chars: 2200, first_line_is_hook: true, hashtags: "restrained_set", link: "profile" },
  tiktok: { register: "short hook-led", max_chars: 300, first_line_is_hook: true, hashtags: "3-5_discovery", link: "profile" },
  x: { register: "concise observation + useful commentary", max_chars: 270, first_line_is_hook: false, hashtags: "0-2", link: "inline" },
  youtube: { register: "title + structured description", max_chars: 5000, title_max: 90, first_line_is_hook: true, hashtags: "3_in_description", link: "description" },
});

// §40 - YouTube requires MATERIAL substance variation, not just
// card/price/percentage. A YouTube placement is only allowed when the
// story carries a narrative OR an editorial/evergreen data context.
export function youtubeAllowed(story) {
  const def = getSeries(story.series);
  if (!def) return false;
  // SOCIAL-NEWSROOM-2D: a series the render registry marks short:false
  // (e.g. BIGGEST_MOVERS - a static ranking makes a meaningless Short,
  // SS14) gets NO YouTube placement even if its pillar/clock would allow
  // one.
  const rr = SERIES_RENDER[String(story.series || "").toUpperCase()];
  if (rr && rr.short === false) return false;
  if (story.narrative || def.narrative) return true;
  return def.clock === "EDITORIAL" || def.clock === "EVERGREEN";
}

// §41 - X is fresh-alert + commentary. An X placement must carry a
// distinct observation - a bare link/price is not enough. LIVE deal
// stories qualify (the alert IS the value); everything else needs
// editorial substance.
// A small allow-list of BRAND-pillar series that genuinely carry an
// observation worth posting on X (a thesis, not just a name-drop).
// SOCIAL-NEWSROOM-2D SS12/SS13.
const X_BRAND_OK = new Set(["METHODOLOGY", "PRODUCT_EXPLAINER"]);

export function xAllowed(story) {
  const def = getSeries(story.series);
  if (!def) return false;
  if (def.pillar === "DEALS" && def.clock === "LIVE") return true;
  if (["MARKET", "COMPARISON", "EDUCATION", "STORY", "BEHIND_THE_FINDER"].includes(def.pillar)) return true;
  // selected BRAND/AUTHORITY series that make a real point
  if (def.pillar === "BRAND" && X_BRAND_OK.has(def.id)) return true;
  return false;
}

function placementId(storyId, platform) {
  return `plc_${createHash("sha256").update(`${storyId}::${platform}`).digest("hex").slice(0, 12)}`;
}

// Build the native placements for a story. `platforms` optionally narrows
// the set (e.g. a refill targeting only YouTube).
export function placementsForStory(story, { platforms = null } = {}) {
  const def = getSeries(story.series);
  if (!def) return [];
  const wanted = (platforms ?? def.platforms).filter((p) => ["instagram", "tiktok", "x", "youtube"].includes(p));
  const out = [];
  for (const platform of wanted) {
    // map pillar -> nearest existing deal-creative family (for IG/TikTok,
    // which inherit the deal-creative platform roles) + a per-platform
    // fit check.
    const famGuess =
      def.pillar === "DEALS" || def.pillar === "BUDGET" ? "deal_drop"
      : def.pillar === "MARKET" ? "market_mover"
      : def.pillar === "COMPARISON" || def.pillar === "STORY" ? "hook_carousel"
      : "brand_ad";

    // SOCIAL-NEWSROOM-2D - X and YouTube editorial fit is decided by the
    // dedicated newsroom rules (xAllowed / youtubeAllowed), NOT the
    // deal-creative PLATFORM_ROLES.<p>.families table (which only lists
    // deal_drop/market_mover for X and would wrongly exclude every
    // EDUCATION / STORY / BEHIND_THE_FINDER editorial series). IG / TikTok
    // still gate on the shared role table.
    // SOCIAL-NEWSROOM-2D: TikTok is motion-only and no professional
    // editorial MOTION renderer is wired (SS15) -> the newsroom produces
    // NO TikTok placement for editorial content. The fresh/live TikTok
    // path (Deal Drops via the video pipeline) is unaffected.
    if (platform === "tiktok") continue;
    if (platform === "instagram") {
      const roleFamilies = PLATFORM_ROLES[platform]?.families ?? [];
      if (!roleFamilies.includes(famGuess)) continue;
    }
    if (platform === "youtube" && !youtubeAllowed(story)) continue;
    if (platform === "x" && !xAllowed(story)) continue;

    out.push({
      placement_id: placementId(story.story_id, platform),
      story_id: story.story_id,
      platform,
      placement_type: MEDIA_KIND[platform]?.[def.clock] ?? "post",
      caption_style: CAPTION_STYLE[platform],
      family_hint: famGuess,
      status: "PLANNED",
      lane: story.lane,
      planned_for: null, // set by calendar.mjs
      artifact_hash: null,
      hosted_url: null,
      buffer_provider_ref: null,
      published_at: null,
      platform_post_url: null,
    });
  }
  return out;
}

// how many distinct platform-native placements a story is eligible for.
export function placementCount(story) {
  return placementsForStory(story).length;
}
