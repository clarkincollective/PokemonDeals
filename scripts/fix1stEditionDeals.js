// Run with: node scripts/fix1stEditionDeals.js
//
// One-off correction for deals whose market_price was already stored
// using the 1st-Edition-inflation bug (see lib/pokemonPriceTracker.js's
// pickMarketPrice) before the fix landed. Re-fetches the real price for
// every watchlist card behind an active deal, and for any card whose
// primaryPrinting is flagged 1st Edition, recomputes market_price/
// discount_pct with the fix - deactivating the deal if it no longer
// clears the real 10% discount threshold once correctly priced.
require("dotenv").config({ path: ".env.local" });
const { getRawPrice } = require("../lib/pokemonPriceTracker");
const { supabaseAdmin } = require("../lib/supabaseAdmin");

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const DISCOUNT_THRESHOLD = 0.1;
const SANITY_FLOOR_PCT = 0.25;

// 1st Edition print stamps only ever existed on these sets (1999-2002,
// discontinued after Neo Destiny) - scoping to them avoids burning a
// PokemonPriceTracker lookup on the ~3,700 modern-era active deals that
// categorically can't have this bug.
const WOTC_ERA_PATTERN =
  /^(base set|base set \(shadowless\)|base set 2|jungle|fossil|team rocket|gym heroes|gym challenge|neo genesis|neo discovery|neo revelation|neo destiny)$/i;

async function main() {
  const db = supabaseAdmin();

  let deals = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db
      .from("deals")
      .select(
        "id, watchlist_id, condition, total_price, market_price, discount_pct, watchlist:watchlist_id!inner(name, set, justtcg_tcgplayer_id, justtcg_condition, language)"
      )
      .eq("is_active", true)
      .eq("watchlist.language", "english")
      .range(from, from + 999);
    if (error) throw error;
    if (!data || data.length === 0) break;
    deals = deals.concat(data);
    if (data.length < 1000) break;
  }
  deals = deals.filter((d) => WOTC_ERA_PATTERN.test(d.watchlist?.set ?? ""));
  console.log(`${deals.length} active deals in WOTC-era sets...`);

  // Group by the exact (card, condition, language) key the price lookup
  // itself is keyed on - several deals (different sellers/listings) often
  // share the same watched card, and there's no reason to pay for the
  // same PokemonPriceTracker lookup twice.
  const groups = new Map();
  for (const deal of deals) {
    const wl = deal.watchlist;
    if (!wl) continue;
    const key = `${wl.justtcg_tcgplayer_id}|${deal.condition ?? wl.justtcg_condition ?? "Near Mint"}|${wl.language ?? "english"}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(deal);
  }
  console.log(`${groups.size} unique card+condition lookups needed.`);

  let checked = 0;
  let corrected = 0;
  let deactivated = 0;
  const flaggedCards = new Set();

  for (const [key, groupDeals] of groups) {
    const [tcgPlayerId, condition, language] = key.split("|");
    checked++;

    let raw;
    try {
      raw = await getRawPrice(tcgPlayerId, condition, language);
    } catch (err) {
      console.log(`  ! price lookup failed for ${groupDeals[0].watchlist.name}: ${err.message}`);
      await sleep(150);
      continue;
    }
    await sleep(150);
    if (!raw) continue;

    const correctPrice = raw.price;

    for (const deal of groupDeals) {
      const wl = deal.watchlist;
      const oldPrice = Number(deal.market_price);
      // Only touch rows where the stored price is meaningfully wrong (not
      // just normal day-to-day price drift) - a >15% gap is well beyond
      // what an ordinary market move looks like at scan cadence.
      const diffPct = Math.abs(correctPrice - oldPrice) / oldPrice;
      if (diffPct < 0.15) continue;

      flaggedCards.add(wl.name);
      const newDiscountPct = (correctPrice - Number(deal.total_price)) / correctPrice;
      const stillAValidDeal =
        newDiscountPct >= DISCOUNT_THRESHOLD && Number(deal.total_price) >= correctPrice * SANITY_FLOOR_PCT;

      if (stillAValidDeal) {
        const { error: updateErr } = await db
          .from("deals")
          .update({ market_price: correctPrice, discount_pct: newDiscountPct })
          .eq("id", deal.id);
        if (updateErr) console.log(`  ! failed to update deal ${deal.id}: ${updateErr.message}`);
        else {
          corrected++;
          console.log(
            `  corrected: ${wl.name} (${wl.set}) - deal ${deal.id}: $${oldPrice} -> $${correctPrice} market, ${(newDiscountPct * 100).toFixed(1)}% below market`
          );
        }
      } else {
        const { error: updateErr } = await db.from("deals").update({ is_active: false }).eq("id", deal.id);
        if (updateErr) console.log(`  ! failed to deactivate deal ${deal.id}: ${updateErr.message}`);
        else {
          deactivated++;
          console.log(
            `  deactivated (no longer a real deal): ${wl.name} (${wl.set}) - deal ${deal.id}: real market $${correctPrice} vs $${deal.total_price} listing`
          );
        }
      }
    }
  }

  console.log(
    `\nDone. checked=${checked} corrected=${corrected} deactivated=${deactivated} affectedCards=${flaggedCards.size}`
  );
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
