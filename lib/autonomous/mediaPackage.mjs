// Phase SOCIAL-AUTOPILOT-3 §2/§7/§8 - THE MEDIA PACKAGE + PLATFORM ADAPTER.

import { MEDIA_TYPE_FOR_PLATFORM } from "./mediaHostingStage.mjs";
import { failure } from "../newsroom/editorial/failureStates.mjs";

export const MEDIA_PACKAGE_VERSION = "auto3.1";

// §8 - every normal PokemonDealFinder visual social family requires media
// on every platform this pipeline targets. There is no text-only family
// in this architecture yet - a future one would be a NEW, explicit,
// named family, never a silent fallback from a media failure.
export const MEDIA_REQUIRED = Object.freeze({ instagram: true, x: true, tiktok: true, youtube_shorts: true });

/**
 * §2 - the canonical media_package shape, built from a hosted record +
 * the package it belongs to.
 */
export function buildMediaPackage({ pkg, platform, hostedRecord, verified = null }) {
  const mediaType = MEDIA_TYPE_FOR_PLATFORM[platform] ?? null;
  return {
    snapshot_hash: pkg.snapshot?.snapshot_hash ?? null,
    story_id: pkg.story_id,
    platform,
    media_type: mediaType,
    source_asset_path: hostedRecord?.local_source_path ?? null,
    sha256: hostedRecord?.sha256 ?? null,
    mime_type: hostedRecord?.mime_type ?? null,
    width: hostedRecord?.width ?? null,
    height: hostedRecord?.height ?? null,
    duration_ms: hostedRecord?.duration_s != null ? Math.round(hostedRecord.duration_s * 1000) : null,
    hosted_url: hostedRecord?.public_url ?? null,
    hosted_provider: hostedRecord?.storage_provider ?? null,
    hosted_at: hostedRecord?.uploaded_at ?? null,
    verified_at: verified?.at ?? null,
    accessibility: verified ? "PUBLIC_VERIFIED" : hostedRecord?.public_url ? "HOSTED_UNVERIFIED" : "NOT_HOSTED",
    cache_state: hostedRecord?._cache_hit ? "CACHE_HIT" : "FRESH_UPLOAD",
  };
}

// §8 - the hard rule: a media-required placement can never submit with
// assets:[]. Checked independently of everything else - this is the
// literal fix for the bug this phase exists to close.
export function assertMediaPresent(mediaPackage, platform) {
  if (!MEDIA_REQUIRED[platform]) return { ok: true };
  if (!mediaPackage?.hosted_url || mediaPackage.accessibility !== "PUBLIC_VERIFIED") {
    return { ok: false, ...failure("MEDIA_REQUIRED_FAIL", `${platform} requires verified public media but hosted_url/accessibility is ${mediaPackage?.hosted_url ? mediaPackage.accessibility : "absent"}`, { stage: "media_required" }) };
  }
  return { ok: true };
}

/**
 * §7 - buildPlatformMediaPayload(pkg, platform, mediaPackage) -> the
 * EXACT shape the existing Buffer client (lib/social/providers/buffer.mjs
 * createPost) expects for `assets`. This is the ONE place that decides
 * how a verified media package becomes a provider asset entry - no
 * caller builds its own ad hoc payload.
 */
export function buildPlatformMediaPayload(pkg, platform, mediaPackage) {
  const present = assertMediaPresent(mediaPackage, platform);
  if (!present.ok) return present;
  const type = mediaPackage.media_type === "VIDEO" ? "video" : "image";
  return {
    ok: true,
    assets: [{ type, url: mediaPackage.hosted_url }],
    postType: mediaPackage.media_type === "VIDEO" ? (platform === "tiktok" ? "post" : "short") : "post",
  };
}
