// Run with: node scripts/fixBadMarketDeals.js [--apply]
//
// One-off cleanup for deals whose "% below market" is fiction because the
// market reference or the listing price can't be trusted:
//
//   sentinel   - market_price is a PokemonPriceTracker "no data"
//                placeholder (999, 9999, ...). Verified live: "Rayquaza
//                ex" (EX Deoxys) stored market 999, a A$497 listing shown
//                as "64% below".
//   auction    - listing_type AUCTION with >=1 bid: the current bid is
//                not a settled price, it climbs. "M Rayquaza EX" at 1 bid
//                showed "72% below market".
//   pricegap   - market_price disagrees with the watchlist row's
//                last_known_price (daily catalog-sync value) by >40% -
//                the live aggregate price is contaminated (graded comps /
//                wrong printing). "Venusaur (Base Set Shadowless)" scanned
//                at market $501 vs last_known $919.
//
// Dry run by default; --apply to deactivate.
require("dotenv").config({ path: ".env.local" });
const { supabaseAdmin } = require("../lib/supabaseAdmin");
const { isSentinelPrice } = require("../lib/pokemonPriceTracker");

const APPLY = process.argv.includes("--apply");
const PRICE_GAP = 0.4;

async function main() {
  const db = supabaseAdmin();
  console.log(APPLY ? "APPLY mode - will deactivate." : "DRY RUN - pass --apply to write.");

  const deals = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db
      .from("deals")
      .select(
        "id, title, listing_type, bid_count, market_price, discount_pct, watchlist:watchlist_id(name, set, last_known_price)"
      )
      .eq("is_active", true)
      .range(from, from + 999);
    if (error) throw error;
    if (!data || data.length === 0) break;
    deals.push(...data);
    if (data.length < 1000) break;
  }
  console.log(`${deals.length} active deals to check`);

  const buckets = { sentinel: [], auction: [], pricegap: [] };

  for (const d of deals) {
    const market = Number(d.market_price);
    const lk = Number(d.watchlist?.last_known_price);
    let reason = null;

    if (isSentinelPrice(market)) reason = "sentinel";
    else if (d.listing_type === "AUCTION" && (d.bid_count ?? 0) >= 1) reason = "auction";
    else if (Number.isFinite(lk) && lk > 0 && Number.isFinite(market) && Math.abs(market - lk) / lk > PRICE_GAP)
      reason = "pricegap";

    if (!reason) continue;
    buckets[reason].push(d.id);
    console.log(
      `  ${reason}: "${d.watchlist?.name}" (${d.watchlist?.set}) - ${Math.round(d.discount_pct * 100)}% "below" ` +
        `market $${market}${reason === "pricegap" ? ` vs last_known $${lk}` : ""} :: ${d.title}`
    );
  }

  const all = [...buckets.sentinel, ...buckets.auction, ...buckets.pricegap];
  console.log(
    `\nsentinel=${buckets.sentinel.length} auction=${buckets.auction.length} pricegap=${buckets.pricegap.length} total=${all.length}`
  );

  if (APPLY && all.length > 0) {
    for (let i = 0; i < all.length; i += 500) {
      const chunk = all.slice(i, i + 500);
      const { error } = await db.from("deals").update({ is_active: false }).in("id", chunk);
      if (error) console.log(`  ! chunk ${i}: ${error.message}`);
    }
    console.log(`retired ${all.length}`);
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
