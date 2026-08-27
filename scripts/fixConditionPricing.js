// Run with: node scripts/fixConditionPricing.js
//
// One-off correction for deals whose market_price was computed against
// the Near Mint price regardless of the listing's real condition (see
// lib/dealMatching.js's detectListingCondition/selectConditionPrice and
// the pokemonPriceTracker.js getConditionPrices fix). Re-detects each
// affected deal's real condition from its title, fetches the correct
// per-condition price, and recomputes market_price/discount_pct -
// deactivating the deal if it no longer clears the real 10% threshold
// once correctly priced.
require("dotenv").config({ path: ".env.local" });
const { getConditionPrices } = require("../lib/pokemonPriceTracker");
const { detectListingCondition, selectConditionPrice, SANITY_FLOOR_PCT } = require("../lib/dealMatching");
const { supabaseAdmin } = require("../lib/supabaseAdmin");

const DISCOUNT_THRESHOLD = 0.1;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  const db = supabaseAdmin();

  let deals = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db
      .from("deals")
      .select("id, title, total_price, market_price, discount_pct, watchlist:watchlist_id(justtcg_tcgplayer_id, language, name, set)")
      .eq("is_active", true)
      .eq("is_graded", false)
      .range(from, from + 999);
    if (error) throw error;
    if (!data || data.length === 0) break;
    deals = deals.concat(data);
    if (data.length < 1000) break;
  }

  const affected = deals
    .map((d) => ({ ...d, detectedCondition: detectListingCondition(d.title) }))
    .filter((d) => d.detectedCondition !== "Near Mint" && d.watchlist);

  console.log(`${affected.length} active raw deals with a non-Near-Mint condition signal...`);

  // Dedupe the PokemonPriceTracker lookup per unique card (many deals
  // share the same watched card).
  const groups = new Map();
  for (const d of affected) {
    const key = `${d.watchlist.justtcg_tcgplayer_id}|${d.watchlist.language ?? "english"}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(d);
  }
  console.log(`${groups.size} unique cards to look up.`);

  let corrected = 0;
  let deactivated = 0;
  let unchanged = 0;
  let lookupFailed = 0;

  for (const [key, groupDeals] of groups) {
    const [tcgPlayerId, language] = key.split("|");
    let priceData;
    try {
      priceData = await getConditionPrices(tcgPlayerId, language);
    } catch (err) {
      console.log(`  ! lookup failed for ${groupDeals[0].watchlist.name}: ${err.message}`);
      lookupFailed += groupDeals.length;
      await sleep(150);
      continue;
    }
    await sleep(150);
    if (!priceData) {
      lookupFailed += groupDeals.length;
      continue;
    }

    for (const deal of groupDeals) {
      const correctPrice = selectConditionPrice(priceData.byCondition, deal.detectedCondition, priceData.fallbackPrice);
      if (correctPrice == null) {
        // A real condition signal was detected (this loop only ever
        // contains non-Near-Mint deals), but there's no real price data
        // at that tier or worse - we genuinely can't verify what this
        // listing is worth, so the deal can't be trusted anymore.
        const { error } = await db.from("deals").update({ is_active: false }).eq("id", deal.id);
        if (error) console.log(`  ! failed to deactivate deal ${deal.id}: ${error.message}`);
        else {
          deactivated++;
          console.log(
            `  deactivated (no verifiable ${deal.detectedCondition} price): ${deal.watchlist.name} (${deal.watchlist.set}) - deal ${deal.id}`
          );
        }
        continue;
      }

      const oldPrice = Number(deal.market_price);
      const diffPct = Math.abs(correctPrice - oldPrice) / oldPrice;
      if (diffPct < 0.05) {
        unchanged++;
        continue;
      }

      const newDiscountPct = (correctPrice - Number(deal.total_price)) / correctPrice;
      const stillAValidDeal =
        newDiscountPct >= DISCOUNT_THRESHOLD && Number(deal.total_price) >= correctPrice * SANITY_FLOOR_PCT;

      if (stillAValidDeal) {
        const { error } = await db
          .from("deals")
          .update({ market_price: correctPrice, discount_pct: newDiscountPct, condition: deal.detectedCondition })
          .eq("id", deal.id);
        if (error) console.log(`  ! failed to update deal ${deal.id}: ${error.message}`);
        else {
          corrected++;
          console.log(
            `  corrected (${deal.detectedCondition}): ${deal.watchlist.name} (${deal.watchlist.set}) - deal ${deal.id}: $${oldPrice} -> $${correctPrice} market, ${(newDiscountPct * 100).toFixed(1)}% below market`
          );
        }
      } else {
        const { error } = await db.from("deals").update({ is_active: false }).eq("id", deal.id);
        if (error) console.log(`  ! failed to deactivate deal ${deal.id}: ${error.message}`);
        else {
          deactivated++;
          console.log(
            `  deactivated (no longer a real deal, ${deal.detectedCondition}): ${deal.watchlist.name} (${deal.watchlist.set}) - deal ${deal.id}: real $${correctPrice} vs $${deal.total_price} listing`
          );
        }
      }
    }
  }

  console.log(
    `\nDone. checked=${affected.length} corrected=${corrected} deactivated=${deactivated} unchanged=${unchanged} lookupFailed=${lookupFailed}`
  );
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
