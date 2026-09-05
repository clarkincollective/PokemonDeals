// Phase 13D.4 - privacy-safe UTM preview builder. Fixed enums only,
// exactly matching docs/social-creative-system.md SS26 / SS13D.1 SS24 -
// never a card name, Pokemon/set name, eBay listing ID, or any user
// identity. These links are a PREVIEW ONLY (never deployed - nothing in
// this codebase attaches them to an outbound link yet).

const ALLOWED_SOURCES = new Set(["instagram", "tiktok"]);

const ALLOWED_CAMPAIGNS = new Set([
  "deal_daily",
  "deal_of_day",
  "best_deals_found_today",
  "just_found",
  "pokemon_spotlight",
  "set_spotlight",
]);

const ALLOWED_CONTENT = new Set(["slide_hook", "layout_a", "layout_b", "carousel_close"]);

export function buildUtmPreview({ source, campaign, content }) {
  if (!ALLOWED_SOURCES.has(source)) throw new Error(`buildUtmPreview: unknown utm_source "${source}"`);
  if (!ALLOWED_CAMPAIGNS.has(campaign)) throw new Error(`buildUtmPreview: unknown utm_campaign "${campaign}"`);
  if (content != null && !ALLOWED_CONTENT.has(content)) throw new Error(`buildUtmPreview: unknown utm_content "${content}"`);

  const params = { utm_source: source, utm_medium: "social", utm_campaign: campaign };
  if (content) params.utm_content = content;
  return params;
}

export function utmQueryString(params) {
  return new URLSearchParams(params).toString();
}
