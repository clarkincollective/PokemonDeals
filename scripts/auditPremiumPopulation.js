// Task G audit: how the new premium placement trust gate
// (lib/dealQuality.isPremiumDealEligible) reshapes the pool that feeds
// Best Finds / Top 10 / Fresh Finds / Auctions Ending Soon.
//
//   node scripts/auditPremiumPopulation.js

require("dotenv").config({ path: ".env.local" });
const { createClient } = require("@supabase/supabase-js");
const {
  isDisplayableDeal,
  isPremiumDealEligible,
  premiumNeedsVisualMatch,
} = require("../lib/dealQuality.js");
const { isVisualScreeningCandidate } = require("../lib/visualAuthenticity.js");

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const BEST_FINDS_MIN_MARKET_PRICE = 75;
const BEST_FINDS_MAX_DISCOUNT_PCT = 0.65;

async function pageAll(build) {
  const out = [];
  let from = 0;
  const size = 1000;
  for (;;) {
    const { data, error } = await build().range(from, from + size - 1);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if (!data || data.length < size) break;
    from += size;
  }
  return out;
}

function tally(rows, label) {
  const displayable = rows.filter(isDisplayableDeal);
  const premium = displayable.filter((r) => isPremiumDealEligible(r));
  const highRisk = displayable.filter((r) => !r.is_graded && premiumNeedsVisualMatch(r));
  const byStatus = (list) =>
    list.reduce((m, r) => {
      const k = r.visual_authenticity_status || "null";
      m[k] = (m[k] || 0) + 1;
      return m;
    }, {});
  const removed = displayable.filter((r) => !isPremiumDealEligible(r));

  console.log(`\n===== ${label} =====`);
  console.log(`rows scanned            : ${rows.length}`);
  console.log(`isDisplayableDeal       : ${displayable.length}`);
  console.log(`isPremiumDealEligible   : ${premium.length}`);
  console.log(`removed by premium gate : ${removed.length}`);
  console.log(`  of which high-risk unscreened/UNKNOWN/mismatch:`);
  console.log(`    ${JSON.stringify(byStatus(removed))}`);
  console.log(`high-risk (>=100 & >=40%), non-graded, displayable : ${highRisk.length}`);
  console.log(`  by visual status      : ${JSON.stringify(byStatus(highRisk))}`);
  const hrUnscreened = highRisk.filter(
    (r) => !r.visual_authenticity_status || r.visual_authenticity_status === "null"
  );
  console.log(`  unscreened high-risk (need screening) : ${hrUnscreened.length}`);
  console.log(
    `  ...that isVisualScreeningCandidate now catches : ${
      hrUnscreened.filter(isVisualScreeningCandidate).length
    }`
  );
  return { displayable, premium, removed, highRisk, hrUnscreened };
}

(async () => {
  // ---- 1. whole active English deal population ----
  const active = await pageAll(() =>
    db
      .from("deals")
      .select(
        "id, is_active, is_graded, title, condition, card_name, card_set, card_language, card_tcgplayer_id, market_price, discount_pct, total_price, listing_type, marketplace, auction_end_at, last_seen_at, first_seen_at, listing_id, listing_url, image_url, image_count, returns_accepted, seller_feedback_score, disqualified_reason, visual_authenticity_status, visual_authenticity_reason"
      )
      .eq("is_active", true)
      .eq("card_language", "english")
  );
  tally(active, "ALL ACTIVE ENGLISH DEALS");

  // ---- 2. the actual Best Finds candidate pool ----
  // mirror fetchBestFindsUncached: market_price>=75, discount_pct<=0.65,
  // english, order by discount desc, take 200, dedup by watchlist_id.
  const { data: bf, error: bfErr } = await db
    .from("deals")
    .select(
      "id, watchlist_id, is_active, is_graded, title, condition, card_name, card_set, card_language, card_tcgplayer_id, market_price, discount_pct, total_price, listing_type, marketplace, auction_end_at, last_seen_at, first_seen_at, listing_id, listing_url, image_url, image_count, returns_accepted, seller_feedback_score, disqualified_reason, visual_authenticity_status, visual_authenticity_reason, watchlist:watchlist_id!inner (language)"
    )
    .eq("is_active", true)
    .eq("watchlist.language", "english")
    .gte("market_price", BEST_FINDS_MIN_MARKET_PRICE)
    .lte("discount_pct", BEST_FINDS_MAX_DISCOUNT_PCT)
    .order("discount_pct", { ascending: false })
    .limit(200);
  if (bfErr) throw new Error(bfErr.message);

  const dedup = [];
  const seen = new Set();
  for (const r of bf) {
    if (seen.has(r.watchlist_id)) continue;
    seen.add(r.watchlist_id);
    dedup.push(r);
  }
  const res = tally(dedup, "BEST FINDS CANDIDATE POOL (200 by discount, deduped by card)");

  console.log("\n----- removed-from-premium detail (Best Finds pool) -----");
  for (const r of res.removed) {
    console.log(
      `#${r.id}  $${r.market_price}  ${Math.round(r.discount_pct * 100)}% off  ` +
        `status=${r.visual_authenticity_status || "null"}  graded=${!!r.is_graded}  ${String(
          r.card_name
        ).slice(0, 40)}`
    );
  }

  console.log("\n----- highest-risk SURVIVORS in premium (manual-inspect list) -----");
  const survivors = res.premium
    .filter((r) => Number(r.market_price) >= 150)
    .sort((a, b) => b.discount_pct - a.discount_pct)
    .slice(0, 25);
  for (const r of survivors) {
    console.log(
      `#${r.id}  $${r.market_price}  ${Math.round(r.discount_pct * 100)}% off  ` +
        `status=${r.visual_authenticity_status || "null"}  graded=${!!r.is_graded}  ` +
        `${String(r.card_name).slice(0, 40)}  | ${r.listing_url}`
    );
  }

  // ---- 3. genuine steep-deal regression checks ----
  console.log("\n----- genuine steep-deal regression (must stay eligible) -----");
  const { data: genuine } = await db
    .from("deals")
    .select(
      "id, is_active, is_graded, title, condition, card_name, card_set, card_language, card_tcgplayer_id, market_price, discount_pct, total_price, listing_type, marketplace, auction_end_at, last_seen_at, first_seen_at, listing_id, listing_url, image_url, image_count, returns_accepted, seller_feedback_score, disqualified_reason, visual_authenticity_status"
    )
    .in("id", [30444, 30699, 30934, 12750]);
  for (const r of genuine ?? []) {
    console.log(
      `#${r.id}  ${String(r.card_name).slice(0, 34)}  $${r.market_price}  ${Math.round(
        (r.discount_pct || 0) * 100
      )}% off  status=${r.visual_authenticity_status || "null"}  ` +
        `active=${r.is_active}  displayable=${isDisplayableDeal(r)}  premium=${isPremiumDealEligible(r)}`
    );
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
