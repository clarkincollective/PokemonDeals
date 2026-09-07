// Phase 13E.7A - DETERMINISTIC SOCIAL CTA ATTRIBUTION (first-party UTM).
//
// Every social placement points at a PokemonDealFinder.com deep link. This
// module is the ONE place that stamps campaign attribution onto that link
// so a website visit can later be tied back to CONTENT -> PLATFORM POST.
//
//   utm_source   = the platform            (instagram | tiktok | x | youtube)
//   utm_medium   = "social"                (constant)
//   utm_campaign = the content goal        (reach | engagement | trust | conversion | brand)
//   utm_content  = the deterministic creative content_id  (creativeSpec)
//
// Rules:
//   * platform-specific + content-specific + fully deterministic - the same
//     (baseUrl, platform, goal, content_id) always yields the same string.
//   * NO personal data. content_id is a coarse creative id (family + type +
//     subject slug + date + variant + short hash), never a user/session id,
//     never a card/deal/listing id, never a price.
//   * first-party only - the params land on our own canonical deep link and
//     are read back by lib/analytics/session.js (cookieless). They do NOT
//     touch the eBay affiliate URL: the EPN campid / customid path in
//     lib/affiliateSurfaces.js is completely separate and byte-unchanged
//     (see docs/social-performance.md "EPN customid" + docs/ebay-affiliate-attribution.md).
//   * idempotent - re-stamping an already-stamped URL replaces (never
//     appends) each param, so exactly one of each survives.
//
// Pure. No I/O, no network, no randomness.

// Canonical site host (matches lib/social/creativeSpec.mjs SITE_HOST, sans scheme).
export const SITE_ORIGIN = "https://pokemondealfinder.com";

// platform placement family -> utm_source token. Keyed by the DISTRIBUTION
// platform ids (artifactMap.PLATFORMS) AND their coarse service names, so a
// caller can pass either "instagram_reel" or "instagram".
export const PLATFORM_UTM_SOURCE = Object.freeze({
  instagram_feed: "instagram",
  instagram_carousel: "instagram",
  instagram_reel: "instagram",
  instagram: "instagram",
  tiktok: "tiktok",
  x_post: "x",
  x: "x",
  twitter: "x",
  youtube_short: "youtube",
  youtube: "youtube",
});

export const UTM_MEDIUM = "social";

// content goal -> utm_campaign token. contentGoalFor() returns upper-case
// enums (REACH/ENGAGEMENT/TRUST/CONVERSION/BRAND); we lower-case them into
// a stable campaign code. Anything unrecognised -> "social".
export const CONTENT_GOAL_CAMPAIGN = Object.freeze({
  REACH: "reach",
  ENGAGEMENT: "engagement",
  TRUST: "trust",
  CONVERSION: "conversion",
  BRAND: "brand",
});

// Conservative token guard - mirrors lib/analytics/props.js sanitizeUtmValue
// (letters, digits, _ . - ; <=64 chars; not URL/email-ish). A value that
// fails this is NOT stamped (fail closed) rather than emitted dirty.
const UTM_TOKEN_RE = /^[A-Za-z0-9](?:[A-Za-z0-9_.-]{0,62}[A-Za-z0-9])?$/;
export function isCleanUtmToken(v) {
  return typeof v === "string" && v.length > 0 && v.length <= 64 && UTM_TOKEN_RE.test(v);
}

export function utmSourceFor(platform) {
  return PLATFORM_UTM_SOURCE[String(platform ?? "").toLowerCase()] ?? null;
}

export function utmCampaignFor(contentGoal, fallbackFamily = null) {
  const g = String(contentGoal ?? "").toUpperCase();
  if (CONTENT_GOAL_CAMPAIGN[g]) return CONTENT_GOAL_CAMPAIGN[g];
  const fam = String(fallbackFamily ?? "").toLowerCase();
  return isCleanUtmToken(fam) ? fam : "social";
}

// The canonical attributed CTA URL for one placement.
//   baseUrl   : an on-site URL or bare "pokemondealfinder.com/deals/123"
//               (NEVER an eBay URL - the caller must pass the website link)
//   platform  : a distribution platform id or service name
//   contentGoal / contentId : from the artifact
// Returns the absolute https URL string. If platform/content_id can't be
// resolved to clean tokens the corresponding param is simply omitted -
// the link still works, attribution is just coarser.
export function attributedCtaUrl({ baseUrl, platform, contentGoal, contentId, contentFamily = null } = {}) {
  const raw = String(baseUrl ?? "").trim();
  if (!raw) throw new Error("attributedCtaUrl: baseUrl is required");

  let u;
  try {
    u = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw.replace(/^\/+/, "")}`);
  } catch {
    throw new Error(`attributedCtaUrl: unparseable baseUrl "${raw}"`);
  }
  // Hard refuse to attribute a non-site URL (defence: never stamp an eBay /
  // affiliate link with our first-party params).
  if (!/(^|\.)pokemondealfinder\.com$/i.test(u.hostname)) {
    throw new Error(`attributedCtaUrl: refusing to attribute non-site host "${u.hostname}"`);
  }

  const src = utmSourceFor(platform);
  const campaign = utmCampaignFor(contentGoal, contentFamily);
  const content = isCleanUtmToken(contentId) ? contentId : null;

  // .set() (never .append()) -> idempotent re-stamping.
  if (src) u.searchParams.set("utm_source", src);
  u.searchParams.set("utm_medium", UTM_MEDIUM);
  if (campaign) u.searchParams.set("utm_campaign", campaign);
  if (content) u.searchParams.set("utm_content", content);

  return u.toString();
}

// Read our four params back off a URL (for tests / the review pack / a
// landing-context assertion). Returns { utm_source, utm_medium,
// utm_campaign, utm_content } with nulls for anything absent.
export function parseAttribution(url) {
  const out = { utm_source: null, utm_medium: null, utm_campaign: null, utm_content: null };
  try {
    const sp = new URL(String(url)).searchParams;
    for (const k of Object.keys(out)) out[k] = sp.get(k);
  } catch {
    /* not a URL - all nulls */
  }
  return out;
}

// True when a URL carries the minimum viable social attribution
// (source + medium). Used by the pre-send review to flag an un-attributed CTA.
export function hasSocialAttribution(url) {
  const a = parseAttribution(url);
  return a.utm_source != null && a.utm_medium === UTM_MEDIUM;
}
