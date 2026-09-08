// Phase SOCIAL-CREATIVE-4B.2 - WEBSITE-FIRST BRAND / CTA (§11, §12).
//
// BUSINESS RULE: social content drives SOCIAL -> PokemonDealFinder -> eBay
// affiliate, NEVER SOCIAL -> eBay directly. "View on eBay" (and any bare
// "on eBay" phrasing) is REJECTED as a default social CTA. Commercial Deal
// Drops get a stronger website CTA; educational posts show only the domain.
//
// Pure. No I/O.

export const SITE = "pokemondealfinder.com";

// website-first CTA phrasings by intent
export const WEB_CTAS = Object.freeze({
  live_deal: "See the live deal",
  more_deals: "Find more deals",
  browse: "Browse live deals",
  on_site: "See it on PokemonDealFinder",
  domain: SITE,
});

// A phrase is a forbidden eBay-first CTA if it points the viewer at eBay
// as the destination.
const EBAY_FIRST = /\b(view|see|buy|shop|find|get|check)\b[^.]*\bon ebay\b|\bon ebay\s*→?$|^\s*ebay\b/i;

export function isEbayFirstCta(text) {
  return EBAY_FIRST.test(String(text ?? "").trim());
}

// Throw if a CTA would send social traffic straight to eBay (§11).
export function assertNotEbayDefaultCta(text) {
  if (isEbayFirstCta(text)) {
    throw new Error(`CTA "${text}" sends social traffic straight to eBay - social must route via ${SITE} (§11 / SOCIAL-CREATIVE-4B.2)`);
  }
  return true;
}

// The CTA for a story. `classification` = "COMMERCIAL" | "EDITORIAL".
//   COMMERCIAL  -> a real website CTA
//   EDITORIAL   -> just the domain, subtle
export function webFirstCta({ classification = "EDITORIAL", layout = null } = {}) {
  if (classification === "COMMERCIAL") {
    const label = layout === "three_up" ? WEB_CTAS.more_deals : WEB_CTAS.live_deal;
    return { text: label, sub: SITE, intensity: "SOFT", url: `https://${SITE}` };
  }
  return { text: SITE, sub: null, intensity: "DOMAIN_ONLY", url: `https://${SITE}` };
}

export const CTA_VERSION = "4b2.1";
