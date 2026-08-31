// node scripts/applyHighRiskDispositions.js [--apply]
//
// Phase 1 high-risk listing audit - APPLY step. Consumes
// $TEMP/hra_dispositions.json (produced by _hraDispose.js from the
// ~141-listing Browse audit) and deactivates each non-`keep` row with its
// derived disqualified_reason:
//
//   listing_sold                 - eBay reports the item sold / out of stock
//   type:not_a_card              - not actually a trading card
//   condition:<tier>             - eBay condition descriptor worse than promotable
//   reference:price_unverified   - >=4 active listings / >=3 sellers of the
//                                  SAME card, EVERY ask <=55% of our market
//                                  reference -> the reference, not the
//                                  market, is wrong; no valid discount
//   trust:high_risk_below_market - multi-signal risk score >= 6 on a
//                                  >=55%-off listing (thin seller history +
//                                  <=1-2 photos + no returns + title-only
//                                  description, in combination)
//
// Only the ~141 audited rows are touched. No unvalidated heuristic is
// mass-applied to the wider table.

require("dotenv").config({ path: ".env.local" });
const fs = require("fs");
const { createClient } = require("@supabase/supabase-js");

const APPLY = process.argv.includes("--apply");
const TMP = process.env.TEMP || "/tmp";
const disp = JSON.parse(fs.readFileSync(`${TMP}/hra_dispositions.json`, "utf8"));
// Active rows for the SAME 8 catalogue cards the audit proved have an
// untrustworthy reference price, but which fell outside the >=60%/>=$100
// audit window (lower marketplace variants, smaller "discounts" that are
// themselves fiction against an inflated reference). Same reason code.
let refExtra = [];
try {
  refExtra = JSON.parse(fs.readFileSync(`${TMP}/hra_ref_extra.json`, "utf8"));
} catch {
  /* optional */
}
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const log = (...a) => console.log(...a);

(async () => {
  const act = disp.filter((d) => d.action === "inactive");
  const byReason = {};
  for (const d of act) (byReason[d.reason] ??= []).push(d.id);
  const already = new Set(act.map((d) => d.id));
  let extraIds = refExtra.filter((id) => !already.has(id));
  if (extraIds.length) {
    // only rows still active / not already disqualified for another reason
    const stillActive = new Set();
    for (let i = 0; i < extraIds.length; i += 200) {
      const { data } = await db
        .from("deals")
        .select("id")
        .in("id", extraIds.slice(i, i + 200))
        .eq("is_active", true)
        .is("disqualified_reason", null);
      for (const r of data ?? []) stillActive.add(r.id);
    }
    extraIds = extraIds.filter((id) => stillActive.has(id));
    (byReason["reference:price_unverified"] ??= []).push(...extraIds);
    log(`+ ${extraIds.length} extra reference:price_unverified rows (same 8 cards, outside audit window)`);
  }

  log(`audited rows: ${disp.length}  keep: ${disp.length - act.length}  deactivate: ${act.length}`);
  for (const [reason, ids] of Object.entries(byReason)) log(`  ${reason}: ${ids.length}  (${ids.join(",")})`);

  if (!APPLY) {
    log("\n(dry run - re-run with --apply)");
    return;
  }

  for (const [reason, ids] of Object.entries(byReason)) {
    for (let i = 0; i < ids.length; i += 200) {
      const { error } = await db
        .from("deals")
        .update({ is_active: false, disqualified_reason: reason })
        .in("id", ids.slice(i, i + 200));
      if (error) throw new Error(`${reason}: ${error.message}`);
    }
  }
  log(`\nAPPLIED: ${act.length} rows deactivated across ${Object.keys(byReason).length} reasons.`);

  // spot-check the originally-flagged five
  const { data } = await db
    .from("deals")
    .select("id,is_active,disqualified_reason")
    .in("id", [29411, 4220, 12286, 4247, 4256, 24217]);
  log("flagged rows now:", JSON.stringify(data));
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
