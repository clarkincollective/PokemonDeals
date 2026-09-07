// Phase 13E.8A - PLATFORM-SPECIFIC CONTENT SELECTION (§2, §12).
//
// One content item may create several placements - but the planner
// chooses deliberately by quality tier + family, and only ever proposes a
// placement the existing eligibility table (FAMILY_DISTRIBUTION) allows.
//
//   Exceptional Deal Drop     -> IG Reel + TikTok + X + YouTube Short
//   Strong Deal Drop          -> IG Reel + X + YouTube Short   (skip TikTok)
//   Mild Deal Drop            -> X only
//   Strong visual Market Mover-> IG Reel + X + YouTube Short
//   Mild Market Mover         -> X only
//   Hook Carousel             -> IG carousel only (a motion TikTok cut is a
//                                design flag, off by default)
//   Brand Ad                  -> IG feed + YouTube Short (rare)
//   NOT_SOCIAL                -> nothing
//
// Pure. No I/O.

import { FAMILY_DISTRIBUTION } from "../distribution/artifactMap.mjs";
import { defaultGoalFor } from "./families.mjs";
import { serviceOf } from "./platformRoles.mjs";

// design flag (§12): render a motion-cut carousel for TikTok too. Off
// until a real multi-slide carousel video export exists.
export const CAROUSEL_TIKTOK_MOTION_CUT = false;

// the media kind a family produces for a given "video-capable" content
// piece. deal_drop / market_mover / brand_ad have a 9:16 master;
// hook_carousel is slides.
function mediaKindFor(family) {
  if (family === "hook_carousel") return "carousel_45";
  return "video_916";
}

// intersect a wishlist of platforms with what FAMILY_DISTRIBUTION actually
// allows for (family, mediaKind).
function allowed(family, mediaKind, wishlist) {
  const table = FAMILY_DISTRIBUTION[family]?.[mediaKind] ?? [];
  const textTable = FAMILY_DISTRIBUTION[family]?.text_only ?? [];
  const ok = new Set([...table, ...textTable]);
  return wishlist.filter((p) => ok.has(p));
}

// tier -> platform wishlist per family (before the eligibility intersect).
function wishlistFor(family, tier) {
  if (tier === "NOT_SOCIAL") return [];
  if (family === "deal_drop") {
    if (tier === "S_TIER") return ["instagram_reel", "tiktok", "x_post", "youtube_short"];
    if (tier === "A_TIER") return ["instagram_reel", "x_post", "youtube_short"];
    return ["x_post"]; // B_TIER - mild deal, X only
  }
  if (family === "market_mover") {
    if (tier === "S_TIER" || tier === "A_TIER") return ["instagram_reel", "x_post", "youtube_short"];
    return ["x_post"]; // mild mover - X only
  }
  if (family === "hook_carousel") {
    return CAROUSEL_TIKTOK_MOTION_CUT ? ["instagram_carousel", "tiktok"] : ["instagram_carousel"];
  }
  if (family === "brand_ad") {
    return ["instagram_feed", "youtube_short"];
  }
  return [];
}

// Returns [{ platform, service, placement_media_kind, goal }].
export function choosePlacements(cand) {
  const family = cand.family;
  const tier = cand.quality_tier;
  const goal = cand.goal ?? defaultGoalFor(family);
  const mk = mediaKindFor(family);
  const wish = wishlistFor(family, tier);
  // x_post uses text_only for deal_drop/market_mover; keep the media kind
  // honest per placement.
  return allowed(family, mk, wish).map((platform) => ({
    platform,
    service: serviceOf(platform),
    placement_media_kind: platform === "x_post" && (family === "deal_drop" || family === "market_mover") ? "text_only" : mk,
    goal,
  }));
}
