// Phase 13D.4 - the structured content payload. This is the exact
// architecture described in docs/social-creative-system.md SS29 and the
// P0.4 brief SS12, made concrete against this codebase's real field
// names. No eBay data is ever handed to an LLM anywhere in this file or
// anywhere this payload is consumed (caption.mjs, templates.mjs) - every
// value is either a fixed enum or a number/date copied straight off an
// already-verified row.

import { cardDisplayName } from "../cardName.js";
import { discoveryAgeHours, hoursSinceExactVerification } from "../dealQuality.js";
import { socialFreshnessLine } from "./eligibility.mjs";
import { RIGHTS_STATE } from "./rights.mjs";
import { buildUtmPreview } from "./utm.mjs";

const CANDIDATE_VERSION = "13d4-v1";

// Only these fields ever leave a raw `deals` row and reach a payload /
// template / caption. Deliberately excludes image_url, listing_url,
// affiliate_url, title (raw seller text), seller_username, and anything
// else not on this list - see tests/scanner/social-no-ebay-image.test.mjs
// and social-no-raw-title.test.mjs.
function normalizeDeal(row) {
  return {
    id: row.id,
    card_name: cardDisplayName({ name: row.card_name ?? "" }),
    card_set: row.card_set ?? null,
    is_graded: Boolean(row.is_graded),
    grader: row.grader ?? null,
    grade: row.grade ?? null,
    listing_type: row.listing_type,
    total_price_usd: Number(row.total_price_usd ?? row.total_price),
    market_price: Number(row.market_price),
    discount_pct: Number(row.discount_pct),
    exact_verified_at: row.exact_verified_at,
    marketplace: row.marketplace,
  };
}

function humanAge(hours) {
  if (hours < 1) return `${Math.max(1, Math.round(hours * 60))} minutes`;
  if (hours < 48) return `${Math.round(hours)} hours`;
  return `${Math.round(hours / 24)} days`;
}

function disclosureBlock() {
  return {
    captionLine: "Ad · PokemonDealFinder is an eBay Partner — this post may contain affiliate links.",
    creativeLabel: "Ad",
    platformToggleRequired: true, // TikTok Commercial Content Disclosure toggle - see docs/social-compliance-readiness.md SS12
  };
}

function baseFreshness(row, now) {
  const line = socialFreshnessLine(row, { at: new Date(now) });
  return {
    exactVerifiedAt: row.exact_verified_at,
    hoursSinceExactVerification: hoursSinceExactVerification(row, now),
    label: line.label,
    checkedAt: line.checkedAt,
  };
}

// --- single-deal families: deal_of_day, just_found ------------------------
export function buildDealPayload({ contentType, row, now = Date.now(), utmCampaign }) {
  const deal = normalizeDeal(row);
  const freshness = {
    ...baseFreshness(row, now),
    discoveryAgeHours: discoveryAgeHours(row, now),
    discoveryAgeLabel: humanAge(discoveryAgeHours(row, now)),
  };
  return {
    content_type: contentType,
    template_family: contentType,
    generated_at: new Date(now).toISOString(),
    candidate_version: CANDIDATE_VERSION,
    freshness,
    subject: { display_name: deal.card_name, card_set: deal.card_set },
    deal_data: deal,
    market_data: { reference_usd: deal.market_price, currency: "USD", basis: "existing on-site market reference" },
    destination: {
      route: `/deals/${deal.id}`,
      utm: buildUtmPreview({ source: "instagram", campaign: utmCampaign, content: "slide_hook" }),
    },
    disclosure: disclosureBlock(),
    rights_state: RIGHTS_STATE,
    review_state: "pending",
  };
}

// --- multi-deal family: best_deals_found_today -----------------------------
export function buildBestDealsPayload({ rows, now = Date.now() }) {
  const deals = rows.map(normalizeDeal);
  // Conservative: the LEAST-fresh candidate in the set governs the
  // collective freshness claim - never overstate the freshness of the
  // whole post by only looking at the freshest member.
  const oldest = rows.reduce((worst, r) => (hoursSinceExactVerification(r, now) > hoursSinceExactVerification(worst, now) ? r : worst), rows[0]);
  const freshness = baseFreshness(oldest, now);
  return {
    content_type: "best_deals_found_today",
    template_family: "best_deals_found_today",
    generated_at: new Date(now).toISOString(),
    candidate_version: CANDIDATE_VERSION,
    freshness,
    subject: { display_name: "Today's live deals", deal_count: deals.length },
    deal_data: deals,
    market_data: { currency: "USD", basis: "existing on-site market reference" },
    destination: {
      route: "/deals",
      utm: buildUtmPreview({ source: "instagram", campaign: "best_deals_found_today", content: "carousel_close" }),
    },
    disclosure: disclosureBlock(),
    rights_state: RIGHTS_STATE,
    review_state: "pending",
  };
}

// --- spotlight families: pokemon_spotlight, set_spotlight ------------------
export function buildSpotlightPayload({ contentType, displayName, dealCount, topDeals, destinationRoute, now = Date.now() }) {
  const deals = topDeals.map(normalizeDeal);
  const oldest = topDeals.reduce((worst, r) => (hoursSinceExactVerification(r, now) > hoursSinceExactVerification(worst, now) ? r : worst), topDeals[0]);
  const freshness = baseFreshness(oldest, now);
  return {
    content_type: contentType,
    template_family: contentType,
    generated_at: new Date(now).toISOString(),
    candidate_version: CANDIDATE_VERSION,
    freshness,
    subject: { display_name: displayName, deal_count: dealCount },
    deal_data: deals,
    market_data: { currency: "USD", basis: "existing on-site market reference" },
    destination: {
      route: destinationRoute,
      utm: buildUtmPreview({ source: "instagram", campaign: contentType, content: "slide_hook" }),
    },
    disclosure: disclosureBlock(),
    rights_state: RIGHTS_STATE,
    review_state: "pending",
  };
}
