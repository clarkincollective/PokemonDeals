// node scripts/backfillNonCardDeals.js [--apply]
//
// Phase 1 STAGE-0 backfill. Re-judges every active `deals` row against the
// new product-type gate (lib/dealMatching qualifiesAsTradingCard): a row
// whose stored title reads as merchandise that merely names a card - a
// keychain, an "Extended Art Case" display piece, a coin/tazo, a sticker,
// a fan-made proxy - is deactivated with disqualified_reason
// 'type:not_a_card'. Stored title only; no eBay calls. Sealed deals are
// deliberately untouched (box/lot/bundle are legitimate product words
// there).

require("dotenv").config({ path: ".env.local" });
const { createClient } = require("@supabase/supabase-js");
const { qualifiesAsTradingCard } = require("../lib/dealMatching");

const APPLY = process.argv.includes("--apply");
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const log = (...a) => console.log(...a);

(async () => {
  const rows = [];
  for (let f = 0; ; f += 1000) {
    const { data, error } = await db
      .from("deals")
      .select("id, title, card_name, card_set, marketplace, market_price, discount_pct, total_price_usd")
      .eq("is_active", true)
      .range(f, f + 999);
    if (error) throw new Error(error.message);
    if (!data || !data.length) break;
    rows.push(...data);
    if (data.length < 1000) break;
  }
  log(`active card deals: ${rows.length}`);

  const bad = rows.filter((r) => !qualifiesAsTradingCard({ title: r.title }));
  log(`\ntype:not_a_card: ${bad.length}`);
  for (const r of bad.sort((a, b) => (b.discount_pct ?? 0) - (a.discount_pct ?? 0))) {
    log(
      `  #${r.id} ${r.marketplace} ${((r.discount_pct ?? 0) * 100).toFixed(0)}% $${Math.round(r.total_price_usd)}/$${Math.round(r.market_price)}  [${r.card_name}]  "${r.title}"`
    );
  }

  if (APPLY) {
    const ids = bad.map((r) => r.id);
    for (let i = 0; i < ids.length; i += 200) {
      const { error } = await db
        .from("deals")
        .update({ is_active: false, disqualified_reason: "type:not_a_card" })
        .in("id", ids.slice(i, i + 200));
      if (error) throw new Error(error.message);
    }
    log(`\nAPPLIED: ${ids.length} deactivated (type:not_a_card).`);
  } else {
    log("\n(dry run - re-run with --apply)");
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
