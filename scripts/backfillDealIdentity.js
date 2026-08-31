// node scripts/backfillDealIdentity.js [--apply]
//
// Re-judge every active deal against the (fixed) listing<->catalogue
// identity matcher. A row whose stored title no longer matches the
// card_name/card_set it was priced against is disqualified
// (identity:card_mismatch). Stored data only - no eBay calls. The prime
// cause: "Base Set 2" / "POP Series N" etc. tokenised to a form a
// different set's listing also satisfied (deal 29411 - Expedition
// Charizard priced against Base Set 2 Charizard's $489).

require("dotenv").config({ path: ".env.local" });
const { createClient } = require("@supabase/supabase-js");
const { listingStillMatchesCatalogue } = require("../lib/dealQuality");

const APPLY = process.argv.includes("--apply");
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const log = (...a) => console.log(...a);

(async () => {
  const rows = [];
  for (let f = 0; ; f += 1000) {
    const { data, error } = await db
      .from("deals")
      .select("id, title, card_name, card_set, card_language, marketplace, market_price, discount_pct, is_graded")
      .eq("is_active", true)
      .range(f, f + 999);
    if (error) throw new Error(error.message);
    if (!data || !data.length) break;
    rows.push(...data);
    if (data.length < 1000) break;
  }
  log(`active deals: ${rows.length}`);

  const bad = rows.filter((r) => r.card_name && r.card_set && !listingStillMatchesCatalogue(r));
  const bySet = {};
  for (const r of bad) bySet[r.card_set] = (bySet[r.card_set] ?? 0) + 1;
  log(`\nidentity:card_mismatch: ${bad.length}`);
  log("by matched set:", JSON.stringify(bySet, null, 1));
  log("\nsample:");
  for (const r of bad.slice(0, 30)) {
    log(`  #${r.id} ${r.marketplace} disc=${((r.discount_pct ?? 0) * 100).toFixed(0)}% mkt=$${r.market_price}  [${r.card_name} / ${r.card_set}]  "${r.title}"`);
  }

  if (APPLY) {
    const ids = bad.map((r) => r.id);
    for (let i = 0; i < ids.length; i += 200) {
      const { error } = await db
        .from("deals")
        .update({ is_active: false, disqualified_reason: "identity:card_mismatch" })
        .in("id", ids.slice(i, i + 200));
      if (error) throw new Error(error.message);
    }
    log(`\nAPPLIED: ${ids.length} deactivated (identity:card_mismatch).`);
    const { data: [d] } = await db.from("deals").select("id,is_active,disqualified_reason").eq("id", 29411);
    log("deal 29411 ->", JSON.stringify(d));
  } else {
    log("\n(dry run - re-run with --apply)");
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
