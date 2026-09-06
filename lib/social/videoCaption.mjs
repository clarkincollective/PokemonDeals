// Phase 13E.4 - deterministic caption drafts for the short-form VIDEO
// system. There is NO free-text generation here: the factual spine is the
// already-approved static assembler (lib/social/caption.mjs), and the only
// thing this module adds is a short, non-factual, scroll-native OPENER
// chosen purely by `content_goal`. Every number, price, percentage, card
// name and URL still comes from the verified payload / timeline - this
// file never introduces a value of its own.
//
// Reuses: assembleCaption + DISCLOSURE_LINE (caption.mjs), buildHashtags
// (hashtags.mjs). Output is a plain object the review pack writes to disk;
// nothing here publishes.

import { assembleCaption, DISCLOSURE_LINE } from "./caption.mjs";
import { buildHashtags } from "./hashtags.mjs";
import { SITE_HOST } from "./creativeSpec.mjs";

// content_goal -> opener fragments. Deliberately claim-free: they set the
// viewing frame, never a fact. Sound-off safe (no "sound on"). Keyed to
// the 13E.3D CONTENT_GOALS enum (REACH|ENGAGEMENT|TRUST|CONVERSION|BRAND).
const GOAL_OPENERS = Object.freeze({
  REACH: {
    instagram: "Today's under-market Pokemon card find 👇",
    tiktok: "Another one the scanner caught today 👇",
  },
  ENGAGEMENT: {
    instagram: "Would you have spotted this gap? 👇",
    tiktok: "Fair price or a steal? 👇",
  },
  TRUST: {
    instagram: "How every listing gets checked against a real market reference 👇",
    tiktok: "How we check it 👇",
  },
  CONVERSION: {
    instagram: "Live on eBay right now — details and link below 👇",
    tiktok: "It's live right now 👇",
  },
  BRAND: {
    instagram: "This is PokemonDealFinder 👇",
    tiktok: "This is what PokemonDealFinder does 👇",
  },
});

const CTA_URL_LINE = (url) => (url ? `More: ${url}` : null);

// brand_ad has no static caption assembler (it isn't a content_type). Its
// body is fixed, claim-free prose about what the product does + the same
// disclosure line every other caption carries.
function brandBody(mode) {
  const hook = "PokemonDealFinder scans live eBay listings and compares each one to a real market reference.";
  const fact = `You see the listings priced below that reference. Free to use at ${SITE_HOST}.`;
  const context = "We show the market reference and price history — we never tell you what a card will do next.";
  const parts = mode === "tiktok" ? [hook, fact, DISCLOSURE_LINE] : [hook, fact, context, DISCLOSURE_LINE];
  return parts.join("\n\n");
}

function bodyFor(payload, mode) {
  if (payload.content_type === "brand_ad" || !payload.content_type) return brandBody(mode);
  try {
    return assembleCaption(payload, { variant: mode });
  } catch {
    return brandBody(mode);
  }
}

// Build the IG + TikTok video caption drafts.
//   timeline - a frozen buildVideoTimeline() result (for content_goal +
//              the website-first CTA url that already lives on it)
//   payload  - the verified 13E.3D payload the timeline was built from
// Returns { instagram, tiktok, hashtags, meta }.
export function buildVideoCaptions({ timeline, payload } = {}) {
  if (!timeline) throw new Error("buildVideoCaptions: timeline required");
  if (!payload) throw new Error("buildVideoCaptions: payload required");

  const goal = timeline.content_goal || "REACH";
  const openers = GOAL_OPENERS[goal] || GOAL_OPENERS.REACH;

  // factual spine - the already-approved static assembler for this
  // content_type (brand_ad falls back to fixed brand prose). It ends in
  // DISCLOSURE_LINE already.
  const igBody = bodyFor(payload, "instagram");
  const ttBody = bodyFor(payload, "tiktok");

  // the website-first CTA url from the timeline (never fabricated - it is
  // resolveCta()'s output). Only add it if the assembler didn't already
  // print the bare host on its own line.
  const urlLine = CTA_URL_LINE(timeline.facts?.cta_url || null);
  const withUrl = (body) => {
    if (!urlLine) return body;
    const host = String(timeline.facts.cta_url).split("/")[0];
    return body.includes(host) ? body : body.replace(`\n\n${DISCLOSURE_LINE}`, `\n\n${urlLine}\n\n${DISCLOSURE_LINE}`);
  };

  const instagram = `${openers.instagram}\n\n${withUrl(igBody)}`;
  const tiktok = `${openers.tiktok}\n\n${withUrl(ttBody)}`;
  const hashtags = buildHashtags(payload);

  return Object.freeze({
    instagram,
    tiktok,
    hashtags,
    meta: Object.freeze({
      content_goal: goal,
      content_id: timeline.content_id,
      creative_family: timeline.creative_family,
      opener_source: "content_goal",
      body_source: "lib/social/caption.mjs",
      disclosure_present: instagram.includes(DISCLOSURE_LINE) && tiktok.includes(DISCLOSURE_LINE),
    }),
  });
}

export { GOAL_OPENERS };
