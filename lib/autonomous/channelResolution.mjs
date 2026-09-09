// Phase SOCIAL-AUTOPILOT-2 §5 - REAL BUFFER CHANNEL RESOLUTION.
//
// Reuses the EXISTING resolved channel mapping
// (lib/social/distribution/channels.json - populated once via
// `npm run social:publish -- channels` against the owner's real Buffer
// token) rather than hardcoding ids or re-resolving them. Fails rather
// than guessing on anything ambiguous.

import { readFileSync, existsSync } from "node:fs";
import path from "node:path";

export const CHANNEL_RESOLUTION_VERSION = "auto2.1";

const CHANNELS_PATH = path.join(process.cwd(), "lib", "social", "distribution", "channels.json");

// this package's platform names -> the channels.json alias + expected
// Buffer `service` value (defence: refuse a mapping whose recorded
// service doesn't match the platform we think it is).
const PLATFORM_TO_ALIAS = Object.freeze({
  instagram: { alias: "instagram_main", service: "instagram" },
  x: { alias: "x_main", service: "twitter" },
  tiktok: { alias: "tiktok_main", service: "tiktok" },
  youtube_shorts: { alias: "youtube_main", service: "youtube" },
});

export function loadChannelMap(channelsPath = CHANNELS_PATH) {
  if (!existsSync(channelsPath)) return null;
  try { return JSON.parse(readFileSync(channelsPath, "utf8")); } catch { return null; }
}

/**
 * resolveChannel(platform, map?) -> { ok, channelId, service, name, reason }
 *
 * Fails (never guesses) on: no channels.json, missing alias, a recorded
 * service that doesn't match the expected platform, or a channel this
 * file's own metadata marks locked/disconnected.
 */
export function resolveChannel(platform, map = loadChannelMap()) {
  const spec = PLATFORM_TO_ALIAS[platform];
  if (!spec) return { ok: false, reason: `PLATFORM_NOT_ELIGIBLE_FAIL: unknown platform "${platform}"` };
  if (!map) return { ok: false, reason: "CHANNEL_NOT_FOUND: lib/social/distribution/channels.json is missing or unreadable - run `npm run social:publish -- channels` first" };
  const channelId = map[spec.alias];
  if (!channelId) return { ok: false, reason: `CHANNEL_NOT_FOUND: no "${spec.alias}" entry in channels.json` };
  const meta = map._channels?.[spec.alias];
  if (meta?.service && meta.service !== spec.service) {
    return { ok: false, reason: `CHANNEL_NOT_FOUND: "${spec.alias}" is recorded as service "${meta.service}", expected "${spec.service}" - refusing an ambiguous/wrong-platform channel` };
  }
  if (meta?.locked === true || meta?.disconnected === true) {
    return { ok: false, reason: `CHANNEL_NOT_FOUND: "${spec.alias}" is ${meta.locked ? "locked" : "disconnected"} in the last recorded channel list` };
  }
  return { ok: true, channelId, service: spec.service, name: meta?.name ?? spec.alias };
}

export const SUPPORTED_LIVE_PLATFORMS = Object.freeze(Object.keys(PLATFORM_TO_ALIAS));
