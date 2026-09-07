// Phase 13E.5A - CREATIVE FAMILY -> PLATFORM FORMAT eligibility.
//
// Deterministic. Given a creative family + the media it actually produced
// (a still 4:5, a set of 4:5 carousel slides, or a 9:16 MP4), this says
// exactly which platform placements are valid and why the others are not.
// Nothing here belongs on every platform - a 4:5 still is never a TikTok,
// a carousel is IG-only, a 9:16 video is a Reel AND a TikTok.
//
// Aspect-ratio bounds are the CURRENT documented Buffer/Instagram limits
// (see docs/social-distribution.md - VERIFIED PROVIDER FACT):
//   IG feed post : 3:4 (0.75) .. 1.91:1 (1.913)   -> 4:5 (0.8) is valid
//   IG Reel      : 4:5 (0.8) .. 9:16 (0.5625), <=1920px wide
//   IG carousel  : same as feed post, up to 10 items
//   TikTok       : vertical video, 9:16 nominal
//
// No provider call. No I/O.

export const PLATFORMS = Object.freeze(["instagram_feed", "instagram_carousel", "instagram_reel", "tiktok"]);

// media kinds the existing render system emits
export const MEDIA_KINDS = Object.freeze(["image_45", "carousel_45", "video_916"]);

// aspect ratio (w/h) for each media kind the render pipeline produces
export const MEDIA_ASPECT = Object.freeze({
  image_45: 1080 / 1350, // 0.8
  carousel_45: 1080 / 1350, // 0.8
  video_916: 1080 / 1920, // 0.5625
});

const IG_FEED_MIN = 0.75; // 3:4
const IG_FEED_MAX = 1.7778 + 0.14; // ~1.91:1 (allow provider's stated 1.91)
const IG_REEL_MIN = 0.5625; // 9:16
const IG_REEL_MAX = 0.8; // 4:5
const MAX_CAROUSEL_ITEMS = 10;

// family -> the media kinds it can be distributed as, and the platform
// placements each of those media kinds is eligible for. This is the whole
// eligibility table; anything not listed is NOT eligible.
export const FAMILY_DISTRIBUTION = Object.freeze({
  deal_drop: {
    // "DEAL DROP static" -> IG single image ; "DEAL DROP 9:16" -> Reel + TikTok
    image_45: ["instagram_feed"],
    video_916: ["instagram_reel", "tiktok"],
  },
  market_mover: {
    image_45: ["instagram_feed"],
    video_916: ["instagram_reel", "tiktok"],
  },
  hook_carousel: {
    // "HOOK CAROUSEL" -> IG carousel only ; a 9:16 cut also goes to Reel + TikTok
    carousel_45: ["instagram_carousel"],
    video_916: ["instagram_reel", "tiktok"],
  },
  brand_ad: {
    // brand ad still is a single IG image; the 9:16 cut is Reel + TikTok
    image_45: ["instagram_feed"],
    video_916: ["instagram_reel", "tiktok"],
  },
  // market_snapshot is a still aggregate view - IG feed image only, never video
  market_snapshot: {
    image_45: ["instagram_feed"],
  },
});

// content_type -> family (mirrors creativeSpec.familyForContentType but
// kept local so this module has zero import surface). Aggregate/spotlight
// content_types all render with the hook_carousel family EXCEPT
// market_snapshot which has no single card.
const CONTENT_TYPE_FAMILY = Object.freeze({
  deal_of_day: "deal_drop",
  just_found: "deal_drop",
  market_mover: "market_mover",
  best_deals_found_today: "hook_carousel",
  pokemon_spotlight: "hook_carousel",
  set_spotlight: "hook_carousel",
  brand_ad: "brand_ad",
  market_snapshot: "market_snapshot",
});

export function familyForContentType(contentType) {
  return CONTENT_TYPE_FAMILY[contentType] ?? null;
}

// Is this (family, mediaKind, platform) a valid placement?
// -> { ok:boolean, reason:string }
export function placementEligibility({ family, mediaKind, platform } = {}) {
  const fam = FAMILY_DISTRIBUTION[family];
  if (!fam) return { ok: false, reason: `unknown creative family "${family}"` };
  if (!MEDIA_KINDS.includes(mediaKind)) return { ok: false, reason: `unknown media kind "${mediaKind}"` };
  const allowed = fam[mediaKind];
  if (!allowed) return { ok: false, reason: `${family} does not distribute as ${mediaKind}` };
  if (!allowed.includes(platform)) {
    return { ok: false, reason: `${family}/${mediaKind} is not eligible for ${platform} (eligible: ${allowed.join(", ") || "none"})` };
  }
  return { ok: true, reason: `${family}/${mediaKind} -> ${platform} is an approved placement` };
}

// Independent hard check on the media itself vs. the platform's accepted
// envelope - runs even if the family table said ok, so a wrong-ratio
// asset can never slip through.
// mediaMeta: { kind, width, height, durationS?, itemCount? }
export function mediaCompatibility({ platform, mediaMeta } = {}) {
  if (!mediaMeta || !mediaMeta.kind) return { ok: false, reason: "no media metadata" };
  const { kind } = mediaMeta;
  const w = Number(mediaMeta.width);
  const h = Number(mediaMeta.height);
  if (!(w > 0 && h > 0)) return { ok: false, reason: `media has no usable dimensions (${w}x${h})` };
  const ratio = w / h;

  if (platform === "instagram_feed") {
    if (kind !== "image_45") return { ok: false, reason: `instagram_feed takes a single image, got ${kind}` };
    if (ratio < IG_FEED_MIN || ratio > IG_FEED_MAX) {
      return { ok: false, reason: `ratio ${ratio.toFixed(3)} outside IG feed range ${IG_FEED_MIN}..${IG_FEED_MAX.toFixed(3)}` };
    }
    return { ok: true, reason: `image ${w}x${h} within IG feed range` };
  }

  if (platform === "instagram_carousel") {
    if (kind !== "carousel_45") return { ok: false, reason: `instagram_carousel takes a carousel, got ${kind}` };
    const n = Number(mediaMeta.itemCount);
    if (!(n >= 2)) return { ok: false, reason: `a carousel needs >=2 slides, got ${n}` };
    if (n > MAX_CAROUSEL_ITEMS) return { ok: false, reason: `Buffer/IG cap is ${MAX_CAROUSEL_ITEMS} slides, got ${n}` };
    if (ratio < IG_FEED_MIN || ratio > IG_FEED_MAX) {
      return { ok: false, reason: `slide ratio ${ratio.toFixed(3)} outside IG feed range` };
    }
    return { ok: true, reason: `${n}-slide carousel, each ${w}x${h}` };
  }

  if (platform === "instagram_reel") {
    if (kind !== "video_916") return { ok: false, reason: `instagram_reel takes a 9:16 video, got ${kind}` };
    if (ratio < IG_REEL_MIN - 0.001 || ratio > IG_REEL_MAX + 0.001) {
      return { ok: false, reason: `reel ratio ${ratio.toFixed(4)} outside 4:5..9:16` };
    }
    if (w > 1920) return { ok: false, reason: `reel width ${w}px exceeds 1920` };
    const d = Number(mediaMeta.durationS);
    if (!(d >= 3 && d <= 900)) return { ok: false, reason: `reel duration ${d}s outside 3s..15min` };
    return { ok: true, reason: `9:16 video ${w}x${h}, ${d}s` };
  }

  if (platform === "tiktok") {
    if (kind !== "video_916") return { ok: false, reason: `tiktok takes a vertical video, got ${kind}` };
    if (ratio > 1) return { ok: false, reason: `tiktok video must be vertical, ratio ${ratio.toFixed(3)}` };
    const d = Number(mediaMeta.durationS);
    if (!(d >= 3 && d <= 600)) return { ok: false, reason: `tiktok duration ${d}s outside 3s..10min` };
    return { ok: true, reason: `vertical video ${w}x${h}, ${d}s` };
  }

  return { ok: false, reason: `unknown platform "${platform}"` };
}

// The Buffer channel key each platform maps to. instagram_* all publish
// through the ONE Instagram channel; the placement (feed/carousel/reel) is
// carried in the post's metadata, not a separate channel.
export const PLATFORM_CHANNEL_KEY = Object.freeze({
  instagram_feed: "instagram_main",
  instagram_carousel: "instagram_main",
  instagram_reel: "instagram_main",
  tiktok: "tiktok_main",
});

// The Buffer PostType / IG placement hint for a platform value.
export const PLATFORM_POST_TYPE = Object.freeze({
  instagram_feed: "post",
  instagram_carousel: "post",
  instagram_reel: "reel",
  tiktok: "post",
});
