// Run with: node scripts/fixVariantMismatchDeals.js [--apply]
//
// One-off cleanup for fake deals created by variant-blind matching before
// the collector-number + premium-variant gates were added to
// listingMatchesCard (lib/dealMatching.js).
//
// Verified live: watchlist "Dark Blastoise (3)" (the Team Rocket holo,
// ~$450) matched an eBay listing for "Dark Blastoise 20/82" (the non-holo
// #20, a ~$15 card) and showed it as 71% below market; "Dragonite EX
// (Full Art)" matched a plain "Dragonite EX 72/108" the same way.
//
// This re-runs the *current* listingMatchesCard over every active deal
// (using the deal's stored title + its watchlist row's name/set/language)
// and retires the ones that no longer match. No API calls - pure re-check
// against data already in the row.
//
// Dry run by default (prints what it WOULD retire). Pass --apply to write.
require("dotenv").config({ path: ".env.local" });
const { supabaseAdmin } = require("../lib/supabaseAdmin");
const { listingMatchesCard } = require("../lib/dealMatching");

const APPLY = process.argv.includes("--apply");

async function loadActiveDeals(db, table, joinCol) {
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db
      .from(table)
      .select(`id, title, marketplace, total_price, market_price, discount_pct, ${joinCol}`)
      .eq("is_active", true)
      .range(from, from + 999);
    if (error) throw error;
    if (!data || data.length === 0) break;
    rows.push(...data);
    if (data.length < 1000) break;
  }
  return rows;
}

async function cleanTable(db, { table, joinCol, joinKey }) {
  const deals = await loadActiveDeals(db, table, joinCol);
  console.log(`\n${table}: ${deals.length} active deals to re-check`);

  const staleIds = [];
  for (const deal of deals) {
    const wl = deal[joinKey];
    if (!wl?.name) continue;
    const card = { name: wl.name, set: wl.set, language: wl.language ?? "english" };
    if (listingMatchesCard({ title: deal.title }, card)) continue;

    staleIds.push(deal.id);
    console.log(
      `  fake: "${wl.name}" (${wl.set}) vs listing "${deal.title}" ` +
        `- ${Math.round(deal.discount_pct * 100)}% "below" $${deal.market_price}`
    );
  }

  console.log(`${table}: ${staleIds.length} no longer match`);
  if (!APPLY || staleIds.length === 0) return staleIds.length;

  for (let i = 0; i < staleIds.length; i += 500) {
    const chunk = staleIds.slice(i, i + 500);
    const { error } = await db.from(table).update({ is_active: false }).in("id", chunk);
    if (error) console.log(`  ! failed to retire chunk ${i}: ${error.message}`);
  }
  console.log(`${table}: retired ${staleIds.length}`);
  return staleIds.length;
}

async function main() {
  const db = supabaseAdmin();
  console.log(APPLY ? "APPLY mode - will deactivate." : "DRY RUN - pass --apply to write.");

  // Singles only - the number / premium-variant gates live in
  // listingMatchesCard; sealed product has neither and its matcher didn't
  // change.
  const cards = await cleanTable(db, {
    table: "deals",
    joinCol: "watchlist:watchlist_id!inner (name, set, language)",
    joinKey: "watchlist",
  });

  console.log(`\nDone. deals flagged=${cards}${APPLY ? " (applied)" : " (dry run)"}`);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
