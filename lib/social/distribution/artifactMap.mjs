// Phase 13E.5A / 13E.5B - CREATIVE FAMILY -> PLATFORM PLACEMENT eligibility.
//
// Deterministic. Given a creative family + the media it actually produced
// (a still 4:5, a set of 4:5 carousel slides, a 9:16 MP4, or text only),
// this says exactly which platform placements are valid and why the
// others are not. Nothing belongs on every platform.
//
// PLATFORMS (13E.5B): Instagram, TikTok, X (Twitter), YouTube (Shorts).
//
// Media envelopes are CURRENT documented Buffer limits (see
// docs/social-distribution.md - VERIFIED PROVIDER FACT, 2026-09-07):
//   IG feed / carousel : 3:4 (0.75) .. 1.91:1 ; carousel <= 10 items
//   IG Reel            : 4:5 .. 9:16 ; <= 1920px wide ; 3s .. 15min
//   TikTok             : vertical video ; 3s .. 10min
//   YouTube Short      : 9:16 or 1:1 ; <= 3min ; .mp4/.mov/... ; <=10GB
//   X (Twitter)        : text <= 280 chars (standard) ; up to 4 images OR 1 video
//
// No provider call. No I/O.

export const PLATFORMS = Object.freeze([
  "instagram_feed",
  "instagram_carousel",
  "instagram_reel",
  "tiktok",
  "x_post",
  "youtube_short",
]);

// The Buffer service each platform value belongs to.
export const PLATFORM_SERVICE = Object.freeze({
  instagram_feed: "instagram",
  instagram_carousel: "instagram",
  instagram_reel: "instagram",
  tiktok: "tiktok",
  x_post: "twitter",
  youtube_short: "youtube",
});

// The short "placement" label (§10).
export const PLATFORM_PLACEMENT = Object.freeze({
  instagram_feed: "feed",
  instagram_carousel: "carousel",
  instagram_reel: "reel",
  tiktok: "video",
  x_post: "post",
  youtube_short: "short",
});

// media kinds the existing render system emits (+ text_only for X)
export const MEDIA_KINDS = Object.freeze(["image_45", "carousel_45", "video_916", "text_only"]);

export const MEDIA_ASPECT = Object.freeze({
  image_45: 1080 / 1350, // 0.8
  carousel_45: 1080 / 1350, // 0.8
  video_916: 1080 / 1920, // 0.5625
});

const IG_FEED_MIN = 0.75; // 3:4
const IG_FEED_MAX = 1.7778 + 0.14; // ~1.91:1
const IG_REEL_MIN = 0.5625; // 9:16
const IG_REEL_MAX = 0.8; // 4:5
const MAX_CAROUSEL_ITEMS = 10;
const X_TEXT_MAX = 280; // standard account; do not assume X Premium
const X_MAX_IMAGES = 4;
const YT_SHORT_MAX_SECONDS = 180;

// family -> media kind -> eligible platform placements. This IS the whole
// eligibility table; anything not listed is NOT eligible.
export const FAMILY_DISTRIBUTION = Object.freeze({
  deal_drop: {
    image_45: ["instagram_feed", "x_post"],
    video_916: ["instagram_reel", "tiktok", "youtube_short"],
    text_only: ["x_post"], // concise real-data deal text post
  },
  market_mover: {
    image_45: ["instagram_feed", "x_post"],
    video_916: ["instagram_reel", "tiktok", "youtube_short"],
    text_only: ["x_post"],
  },
  hook_carousel: {
    carousel_45: ["instagram_carousel"],
    video_916: ["instagram_reel", "tiktok", "youtube_short"],
    // NOTE: no x_post - a multi-card carousel has no honest single-fact
    // text form; the 9:16 motion cut carries it instead.
  },
  brand_ad: {
    image_45: ["instagram_feed", "x_post"],
    video_916: ["instagram_reel", "tiktok", "youtube_short"],
  },
  market_snapshot: {
    image_45: ["instagram_feed", "x_post"],
    text_only: ["x_post"],
  },
});

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

// Independent hard check on the media vs. the platform's accepted
// envelope - runs even if the family table said ok.
// mediaMeta: { kind, width, height, durationS?, itemCount? }
// text: the frozen copy (for x_post text length)
export function mediaCompatibility({ platform, mediaMeta, text } = {}) {
  if (!mediaMeta || !mediaMeta.kind) return { ok: false, reason: "no media metadata" };
  const { kind } = mediaMeta;

  if (platform === "x_post") {
    const t = String(text ?? "");
    if (t.length === 0) return { ok: false, reason: "x_post has no frozen text" };
    if (t.length > X_TEXT_MAX) return { ok: false, reason: `x_post text ${t.length} > ${X_TEXT_MAX} chars (standard account)` };
    if (kind === "text_only") return { ok: true, reason: `text-only X post, ${t.length}/${X_TEXT_MAX} chars` };
    if (kind === "image_45") {
      const n = mediaMeta.files?.length ?? 1;
      if (n > X_MAX_IMAGES) return { ok: false, reason: `X allows <=${X_MAX_IMAGES} images, got ${n}` };
      return { ok: true, reason: `X post + ${n} image(s), ${t.length}/${X_TEXT_MAX} chars` };
    }
    return { ok: false, reason: `x_post takes text_only or image_45, got ${kind}` };
  }

  const w = Number(mediaMeta.width);
  const h = Number(mediaMeta.height);
  if (!(w > 0 && h > 0)) return { ok: false, reason: `media has no usable dimensions (${w}x${h})` };
  const ratio = w / h;

  if (platform === "instagram_feed") {
    if (kind !== "image_45") return { ok: false, reason: `instagram_feed takes a single image, got ${kind}` };
    if (ratio < IG_FEED_MIN || ratio > IG_FEED_MAX) return { ok: false, reason: `ratio ${ratio.toFixed(3)} outside IG feed range` };
    return { ok: true, reason: `image ${w}x${h} within IG feed range` };
  }

  if (platform === "instagram_carousel") {
    if (kind !== "carousel_45") return { ok: false, reason: `instagram_carousel takes a carousel, got ${kind}` };
    const n = Number(mediaMeta.itemCount);
    if (!(n >= 2)) return { ok: false, reason: `a carousel needs >=2 slides, got ${n}` };
    if (n > MAX_CAROUSEL_ITEMS) return { ok: false, reason: `Buffer/IG cap is ${MAX_CAROUSEL_ITEMS} slides, got ${n}` };
    if (ratio < IG_FEED_MIN || ratio > IG_FEED_MAX) return { ok: false, reason: `slide ratio ${ratio.toFixed(3)} outside IG feed range` };
    return { ok: true, reason: `${n}-slide carousel, each ${w}x${h}` };
  }

  if (platform === "instagram_reel") {
    if (kind !== "video_916") return { ok: false, reason: `instagram_reel takes a 9:16 video, got ${kind}` };
    if (ratio < IG_REEL_MIN - 0.001 || ratio > IG_REEL_MAX + 0.001) return { ok: false, reason: `reel ratio ${ratio.toFixed(4)} outside 4:5..9:16` };
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

  if (platform === "youtube_short") {
    if (kind !== "video_916") return { ok: false, reason: `youtube_short takes a 9:16 (or 1:1) video, got ${kind}` };
    const isVertical = Math.abs(ratio - 9 / 16) < 0.02;
    const isSquare = Math.abs(ratio - 1) < 0.02;
    if (!isVertical && !isSquare) return { ok: false, reason: `Short ratio ${ratio.toFixed(4)} is neither 9:16 nor 1:1` };
    const d = Number(mediaMeta.durationS);
    if (!(d >= 1 && d <= YT_SHORT_MAX_SECONDS)) return { ok: false, reason: `Short duration ${d}s outside 1s..${YT_SHORT_MAX_SECONDS}s` };
    return { ok: true, reason: `9:16 video ${w}x${h}, ${d}s (<= ${YT_SHORT_MAX_SECONDS}s Short cap)` };
  }

  return { ok: false, reason: `unknown platform "${platform}"` };
}

// logical channel alias per platform (all instagram_* share the one IG channel)
export const PLATFORM_CHANNEL_KEY = Object.freeze({
  instagram_feed: "instagram_main",
  instagram_carousel: "instagram_main",
  instagram_reel: "instagram_main",
  tiktok: "tiktok_main",
  x_post: "x_main",
  youtube_short: "youtube_main",
});

// Buffer PostType hint per platform (verified against the live PostType enum).
export const PLATFORM_POST_TYPE = Object.freeze({
  instagram_feed: "post",
  instagram_carousel: "carousel",
  instagram_reel: "reel",
  tiktok: "post",
  x_post: "post",
  youtube_short: "short",
});

// which frozen copy field a platform uses (§4)
export const PLATFORM_COPY_FIELD = Object.freeze({
  instagram_feed: "instagram_caption",
  instagram_carousel: "instagram_caption",
  instagram_reel: "instagram_caption",
  tiktok: "tiktok_caption",
  x_post: "x_post_text",
  youtube_short: "youtube_description", // + youtube_title carried separately
});

export const LIMITS = Object.freeze({ X_TEXT_MAX, X_MAX_IMAGES, YT_SHORT_MAX_SECONDS, YT_TITLE_MAX: 100, YT_DESC_MAX: 5000, MAX_CAROUSEL_ITEMS });
