// Run with: node scripts/fixCurrencyPricing.js
//
// One-off backfill after the currency migration. eBay prices each
// marketplace's listings in that marketplace's currency; until now they
// were stored raw and compared against a USD market price. This:
//   - sets `currency` from `marketplace` (each marketplace has one),
//   - sets `total_price_usd` = total_price converted to USD (ECB rates),
//   - recomputes `discount_pct` against the USD figure,
//   - deactivates a deal that no longer clears the 10% threshold / sanity
//     floor once correctly priced.
// US rows are unchanged except the two new columns.
//
// Safe to re-run: rows already carrying a `currency` are skipped, so an
// interrupted run just continues.
require("dotenv").config({ path: ".env.local" });
const { getUsdRates, toUsd } = require("../lib/fx");
const { supabaseAdmin } = require("../lib/supabaseAdmin");
const { MARKETPLACE_CURRENCY } = require("../lib/money");
const { SANITY_FLOOR_PCT } = require("../lib/dealMatching");

const DISCOUNT_THRESHOLD = 0.1;
const CONCURRENCY = 24;

async function runPool(items, worker) {
  let i = 0;
  async function next() {
    while (i < items.length) {
      const idx = i++;
      await worker(items[idx]);
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, next));
}

async function backfillTable(db, table, idCol, rates) {
  let checked = 0;
  let updated = 0;
  let deactivated = 0;
  let skipped = 0;

  for (;;) {
    // Always pull the next 1,000 rows that still need work. Because each
    // pass sets `currency`, the "is null" filter naturally advances.
    const { data, error } = await db
      .from(table)
      .select(`${idCol}, marketplace, total_price, market_price`)
      .eq("is_active", true)
      .is("currency", null)
      .limit(1000);
    if (error) throw error;
    if (!data || data.length === 0) break;

    await runPool(data, async (row) => {
      checked++;
      const currency = MARKETPLACE_CURRENCY[row.marketplace] || "USD";
      const totalUsd = toUsd(Number(row.total_price), currency, rates);
      const market = Number(row.market_price);
      const discountPct = (market - totalUsd) / market;
      const stillADeal =
        discountPct >= DISCOUNT_THRESHOLD && totalUsd >= market * SANITY_FLOOR_PCT;

      if (currency === "USD" || stillADeal) {
        const { error: uErr } = await db
          .from(table)
          .update({
            currency,
            total_price_usd: Number(totalUsd.toFixed(2)),
            discount_pct: discountPct,
          })
          .eq(idCol, row[idCol]);
        if (uErr) console.log(`  ! update ${row[idCol]}: ${uErr.message}`);
        else updated++;
      } else {
        const { error: dErr } = await db
          .from(table)
          .update({ currency, total_price_usd: Number(totalUsd.toFixed(2)), is_active: false })
          .eq(idCol, row[idCol]);
        if (dErr) console.log(`  ! deactivate ${row[idCol]}: ${dErr.message}`);
        else deactivated++;
      }
    });

    process.stdout.write(`  ${table}: ${checked} processed…\r`);
  }

  console.log(
    `\n${table}: checked=${checked} updated=${updated} deactivated=${deactivated} skipped=${skipped}`
  );
}

async function main() {
  const db = supabaseAdmin();
  const rates = await getUsdRates();
  console.log("USD-base FX rates:", rates);
  await backfillTable(db, "deals", "id", rates);
  await backfillTable(db, "sealed_deals", "id", rates);
  console.log("Done.");
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
