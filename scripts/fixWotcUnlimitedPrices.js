// node scripts/fixWotcUnlimitedPrices.js [--apply]
//
// The printings /export CSV the daily sync uses does not split WOTC
// dual-printing products into their "1st Edition" and "Unlimited" rows, so
// card_catalog.market_price for every 1st-Ed/Unlimited product (holo AND
// non-holo) is the 1st-Edition figure. Our unqualified /cards/<slug>
// identity is Unlimited by convention. This re-derives market_price for
// the WOTC dual-printing sets from /cards (prices.variants ->
// pickMarketPrice, the SAME helper the card page uses) - never a manual
// per-card patch.
//
// Dry run by default. Costs one PPT /cards credit per WOTC-set row
// (~1,000); PPT's credit allowance is large. --apply writes.

require("dotenv").config({ path: ".env.local" });
const { createClient } = require("@supabase/supabase-js");
const { WOTC_DUAL_PRINTING_SETS, getCatalogNmPrice } = require("../lib/pokemonPriceTracker");

const APPLY = process.argv.includes("--apply");
const CONCURRENCY = 4;
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const log = (...a) => console.log(...a);

(async () => {
  const rows = [];
  for (const set of WOTC_DUAL_PRINTING_SETS) {
    const { data, error } = await db
      .from("card_catalog")
      .select("tcgplayer_id, name, set, rarity, market_price")
      .eq("set", set)
      .eq("language", "english");
    if (error) throw new Error(error.message);
    rows.push(...(data ?? []));
  }
  log(`WOTC dual-printing rows: ${rows.length} across ${WOTC_DUAL_PRINTING_SETS.size} sets`);

  const queue = [...rows];
  let checked = 0;
  let changed = 0;
  let unchanged = 0;
  let noPrice = 0;
  const samples = [];

  async function worker() {
    let r;
    while ((r = queue.shift())) {
      checked++;
      let nm;
      try {
        nm = await getCatalogNmPrice(String(r.tcgplayer_id));
      } catch (e) {
        log(`   ! ${r.tcgplayer_id} ${r.name}: ${e.message}`);
        continue;
      }
      if (nm == null) {
        noPrice++;
        continue;
      }
      const cur = r.market_price == null ? null : Number(r.market_price);
      // Only rewrite on a MATERIAL move (>2% or a null) - the CSV aggregate
      // already equals the Unlimited figure for single-printing rows.
      if (cur != null && Math.abs(cur - nm) / nm <= 0.02) {
        unchanged++;
        continue;
      }
      changed++;
      if (samples.length < 30) samples.push(`${cur} -> ${nm}  ${r.name} / ${r.set} (${r.rarity})`);
      if (APPLY) {
        const { error } = await db.from("card_catalog").update({ market_price: nm }).eq("tcgplayer_id", r.tcgplayer_id);
        if (error) throw new Error(error.message);
      }
      if (checked % 100 === 0) process.stdout.write(`  ...${checked}/${rows.length}\r`);
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  log(`\nchecked ${checked} | would change ${changed} | unchanged ${unchanged} | no /cards price ${noPrice}`);
  log("sample changes (was -> Unlimited NM):");
  for (const s of samples) log(`   ${s}`);
  log(APPLY ? "\nAPPLIED." : "\n(dry run - re-run with --apply)");
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
