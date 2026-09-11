// Phase 17B - the site's VERIFIED public social profiles: the single source
// for the footer follow row AND Organization.sameAs, so the two can never
// disagree.
//
// Verified 2026-09-11, read-only, two ways each:
//   * Buffer's live channel list (lib/social/providers/buffer.mjs
//     listChannels, GraphQL query only) returns the connected accounts
//     instagram "pokemondealfinder" and twitter "pkmdealfinder" - the same
//     handles recorded in lib/social/distribution/channels.json on
//     2026-09-07 and the accounts the Phase 15M posts published to;
//   * the public profile URLs below answer 200 (Instagram's page
//     identifies itself as "Pokemon Deal Finder (@pokemondealfinder)").
//
// TikTok and YouTube channels are connected in Buffer too, but their
// public profile URLs have not been verified, so they are deliberately
// ABSENT - add one here only with the same evidence. Never derive a URL
// from a display name.
export const SOCIAL_PROFILES = Object.freeze([
  Object.freeze({
    platform: "instagram",
    label: "Instagram",
    handle: "pokemondealfinder",
    url: "https://www.instagram.com/pokemondealfinder/",
  }),
  Object.freeze({
    platform: "x",
    label: "X",
    handle: "pkmdealfinder",
    url: "https://x.com/pkmdealfinder",
  }),
]);

// Organization.sameAs - exactly the visible footer profiles.
export function organizationSameAs() {
  return SOCIAL_PROFILES.map((p) => p.url);
}
