// Run with: node scripts/verifyRawConditionDeals.js [--apply] [--limit N]
//
// One-off cleanup for the "played/damaged card priced as Near Mint = fake
// discount" bug, for deals created BEFORE the scanner started verifying
// raw wear against eBay's "Card Condition" descriptor.
//
// A raw deal is a suspect when it shows a big discount (>= 45%) but has no
// recorded wear (condition null or "Near Mint") - the seller may simply
// never have said "LP"/"MP" in the title, and the card is correctly cheap
// because it's played, not underpriced.
//
// For each suspect this calls eBay getItem (one Browse call) to read the
// real card condition. If eBay says the card is worse than Near Mint it
// re-prices the deal against that tier's real market price and either
// updates discount_pct / market_price / condition, or retires the deal if
// it's no longer a deal at the corrected price. eBay says Near Mint (or
// says nothing) -> left untouched.
//
// COSTS API CALLS: 1 eBay getItem per suspect, plus 1 PokemonPriceTracker
// lookup per suspect that turns out to be played. --limit caps it
// (default 120). Dry run by default; --apply to write.
require("dotenv").config({ path: ".env.local" });
const { supabaseAdmin } = require("../lib/supabaseAdmin");
const { getRawCardCondition } = require("../lib/ebay");
const { getConditionPrices } = require("../lib/pokemonPriceTracker");
const { selectConditionPrice, worseCondition, SANITY_FLOOR_PCT } = require("../lib/dealMatching");

const APPLY = process.argv.includes("--apply");
const limitArg = process.argv.indexOf("--limit");
const LIMIT = limitArg !== -1 ? Number(process.argv[limitArg + 1]) : 120;

const SUSPICIOUS_DISCOUNT = 0.45; // matches SUSPICIOUS_RAW_DISCOUNT_PCT in refresh-deals
const DEAL_THRESHOLD = 0.1; // matches DISCOUNT_THRESHOLD in refresh-deals
const SLEEP_MS = 250;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function loadSuspects(db) {
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db
      .from("deals")
      .select(
        "id, title, marketplace, listing_id, total_price_usd, total_price, market_price, discount_pct, condition, " +
          "watchlist:watchlist_id!inner (justtcg_tcgplayer_id, language, name, set)"
      )
      .eq("is_active", true)
      .eq("is_graded", false)
      .gte("discount_pct", SUSPICIOUS_DISCOUNT)
      .or("condition.is.null,condition.eq.Near Mint")
      .range(from, from + 999);
    if (error) throw error;
    if (!data || data.length === 0) break;
    rows.push(...data);
    if (data.length < 1000) break;
  }
  return rows;
}

async function main() {
  const db = supabaseAdmin();
  console.log(APPLY ? "APPLY mode - will write." : "DRY RUN - pass --apply to write.");

  const suspects = await loadSuspects(db);
  console.log(`${suspects.length} suspect raw deals (>=${SUSPICIOUS_DISCOUNT * 100}% off, no recorded wear)`);
  const work = suspects.slice(0, LIMIT);
  if (work.length < suspects.length) console.log(`checking first ${work.length} (--limit ${LIMIT})`);

  let played = 0;
  let repriced = 0;
  let retired = 0;
  let stillDeal = 0;
  const updates = [];
  const retireIds = [];

  for (const d of work) {
    let ebayTier;
    try {
      ebayTier = await getRawCardCondition(d.listing_id, d.marketplace);
    } catch (err) {
      console.log(`  ? getItem failed for ${d.id} (${d.title.slice(0, 50)}): ${err.message}`);
      continue;
    }
    await sleep(SLEEP_MS);

    const tier = worseCondition("Near Mint", ebayTier);
    if (tier === "Near Mint") continue; // eBay says NM-or-better, or says nothing
    played++;

    const wl = d.watchlist;
    let priceInfo;
    try {
      priceInfo = await getConditionPrices(wl.justtcg_tcgplayer_id, wl.language ?? "english");
    } catch (err) {
      console.log(`  ? PPT failed for ${d.id}: ${err.message}`);
      continue;
    }
    await sleep(SLEEP_MS);
    if (!priceInfo) continue;

    const corrected = selectConditionPrice(priceInfo.byCondition, tier, priceInfo.fallbackPrice);
    const usd = Number(d.total_price_usd ?? d.total_price);
    if (corrected == null || !Number.isFinite(usd)) {
      // Can't price this card at its real condition -> it should never
      // have been published as a deal.
      retireIds.push(d.id);
      retired++;
      console.log(`  RETIRE ${d.id} "${wl.name}" (${wl.set}) - ${tier}, no priceable tier. was ${Math.round(d.discount_pct * 100)}% off $${d.market_price}`);
      continue;
    }

    const newDiscount = (corrected - usd) / corrected;
    if (newDiscount >= DEAL_THRESHOLD && usd >= corrected * SANITY_FLOOR_PCT) {
      updates.push({ id: d.id, market_price: corrected, discount_pct: newDiscount, condition: tier });
      repriced++;
      stillDeal++;
      console.log(
        `  REPRICE ${d.id} "${wl.name}" (${wl.set}) - ${tier}: ${Math.round(d.discount_pct * 100)}% off $${d.market_price} -> ${Math.round(newDiscount * 100)}% off $${corrected.toFixed(2)}`
      );
    } else {
      retireIds.push(d.id);
      retired++;
      console.log(
        `  RETIRE ${d.id} "${wl.name}" (${wl.set}) - ${tier}: real discount only ${Math.round(newDiscount * 100)}% vs $${corrected.toFixed(2)} (was shown ${Math.round(d.discount_pct * 100)}% off $${d.market_price})`
      );
    }
  }

  console.log(
    `\nchecked ${work.length} | played ${played} | reprice ${repriced} | retire ${retired} | (${stillDeal} still a deal at corrected condition)`
  );

  if (!APPLY) {
    console.log("dry run - nothing written. pass --apply to write.");
    return;
  }

  for (const u of updates) {
    const { error } = await db
      .from("deals")
      .update({ market_price: u.market_price, discount_pct: u.discount_pct, condition: u.condition })
      .eq("id", u.id);
    if (error) console.log(`  ! reprice ${u.id} failed: ${error.message}`);
  }
  for (let i = 0; i < retireIds.length; i += 500) {
    const chunk = retireIds.slice(i, i + 500);
    const { error } = await db.from("deals").update({ is_active: false }).in("id", chunk);
    if (error) console.log(`  ! retire chunk ${i} failed: ${error.message}`);
  }
  console.log(`applied: ${updates.length} repriced, ${retireIds.length} retired.`);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
