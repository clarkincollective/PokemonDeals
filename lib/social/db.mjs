// Phase 13D.4 - shared read-only Supabase access for the local social
// preview tool. Mirrors the exact query shape lib/deals.js's own
// flagshipCandidateQuery / fetchFreshFindsUncached already use (same
// columns, same is_active/language filters) - this file does NOT
// introduce a second deal-quality model, it only can't import lib/deals.js
// directly because that file pulls in next/cache, which has no meaning
// outside a Next.js server (the same constraint scripts/reporting/*.mjs
// already works around for the exact same reason - see
// scripts/reportHomepageConversion.mjs's own history).
//
// Uses supabaseAdmin() (service-role), consistent with every other
// scripts/ tool in this repo - this is local, admin-only tooling, never
// shipped to the browser, and read-only (no .update()/.insert()/.delete()
// call exists anywhere in this module or anywhere in lib/social/).

import { supabaseAdmin } from "../supabaseAdmin.js";

// The full column set every selector needs across all four MVP families -
// intentionally excludes nothing that isDisplayableDeal/isPremiumDealEligible
// need, and intentionally INCLUDES image_url/listing_url/affiliate_url only
// so the eligibility/destination-building code can still validate the
// exact-listing-destination rule - lib/social/render.mjs and
// lib/social/payload.mjs are responsible for never forwarding image_url
// or the raw listing/affiliate URL text to a template (see
// tests/scanner/social-no-ebay-image.test.mjs).
const SELECT_COLUMNS =
  "id, watchlist_id, card_tcgplayer_id, card_name, card_set, card_language, " +
  "listing_id, marketplace, listing_type, title, image_url, listing_url, affiliate_url, " +
  "price, shipping, total_price, total_price_usd, market_price, discount_pct, " +
  "condition, is_graded, grader, grade, is_active, first_seen_at, last_seen_at, " +
  "exact_verified_at, auction_end_at, disqualified_reason, visual_authenticity_status, " +
  "visual_authenticity_reason, " +
  "watchlist:watchlist_id!inner (name, set, language)";

// One bounded read of the current active English-catalogue deal pool.
// `limit` caps the pool actually scanned (never the output count) -
// mirrors lib/deals.js's own BEST_FINDS_POOL_LIMIT-style bounding so this
// tool can never accidentally do an unbounded table scan.
export async function fetchActiveDealPool({ language = "english", poolLimit = 2000 } = {}) {
  const db = supabaseAdmin();
  const { data, error } = await db
    .from("deals")
    .select(SELECT_COLUMNS)
    .eq("is_active", true)
    .eq("watchlist.language", language)
    .limit(poolLimit);
  if (error) return { rows: [], error: error.message };
  // Normalize the row shape so every downstream function can read
  // row.card_name / row.card_set the same way regardless of whether the
  // flat columns or the watchlist embed carries the real value -
  // mirrors lib/deals.js's own withCard() helper (not imported directly,
  // for the same next/cache-free reason as above, but functionally
  // identical and just as small).
  const rows = (data ?? []).map((row) => ({
    ...row,
    card_name: row.card_name ?? row.watchlist?.name ?? null,
    card_set: row.card_set ?? row.watchlist?.set ?? null,
    card_language: row.card_language ?? row.watchlist?.language ?? language,
  }));
  return { rows, error: null };
}
