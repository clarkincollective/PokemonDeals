// P0 auction-price-integrity - §11 one-off remediation of the auctions
// that were already live with a stale (opening-bid) price.
//
// For every active AUCTION deal row: one authorized get_item_by_legacy_id
// call, then lib/auctionPricing decides:
//   - ENDED / SOLD           -> is_active=false
//   - live discount < floor  -> is_active=false (+ truthful numbers written)
//   - still a deal            -> price/shipping/total_price*/discount_pct/
//                               bid_count refreshed, stays active
//   - inconclusive read      -> FAIL CLOSED: is_active=false until a normal
//                               verify pass can re-confirm it (a stale
//                               auction price is actively misleading, so
//                               "leave it" is not safe here the way it is
//                               for the steady-state cron)
//
// Quota-guarded (respects the same RESERVE the verify-deals cron uses) and
// bounded. Read-then-write; prints a summary. Safe to re-run.
//
//   node scripts/_reverifyActiveAuctions.mjs [--apply]
import { config } from "dotenv";
config({ path: ".env.local", quiet: true });
import { createClient } from "@supabase/supabase-js";
import { getUsdRates } from "../lib/fx.js";
import { getListingSnapshot, getBrowseRateLimit } from "../lib/ebay.js";
import { repricedAuctionPatch } from "../lib/auctionPricing.js";

const APPLY = process.argv.includes("--apply");
const RESERVE = 800;
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const legacyOf = (listingId) => String(listingId ?? "").split("|")[1] || String(listingId ?? "") || null;

async function main() {
  const rl = await getBrowseRateLimit();
  console.log("Browse quota:", rl);
  const rates = await getUsdRates();

  const rows = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db
      .from("deals")
      .select("*")
      .eq("is_active", true)
      .eq("listing_type", "AUCTION")
      .range(from, from + 999);
    if (error) throw new Error(error.message);
    if (!data?.length) break;
    rows.push(...data);
    if (data.length < 1000) break;
  }
  console.log(`active auctions: ${rows.length}  (mode: ${APPLY ? "APPLY" : "DRY-RUN"})`);

  if (rl && rl.remaining != null && rl.remaining - rows.length < RESERVE) {
    console.error(
      `refusing: ${rows.length} calls would drop Browse quota (${rl.remaining}) below the ${RESERVE} reserve. Re-run after the daily reset.`
    );
    process.exit(1);
  }

  const summary = { checked: 0, repriced: 0, retired_ended: 0, retired_sold: 0, retired_stale: 0, failclosed: 0, unchanged: 0 };
  const changes = [];

  for (const r of rows) {
    summary.checked++;
    const nowIso = new Date().toISOString();
    let snap;
    try {
      snap = await getListingSnapshot(legacyOf(r.listing_id), r.marketplace);
    } catch {
      snap = { status: "UNKNOWN", calls: 1 };
    }
    const decision = repricedAuctionPatch({ row: r, snapshot: snap, rates, nowIso });

    let action;
    let patch;
    if (decision.action === "retire") {
      patch = { ...(decision.patch ?? {}), is_active: false, exact_verified_at: nowIso };
      if (decision.reason === "listing_ended") (action = "retire_ended"), summary.retired_ended++;
      else if (decision.reason === "listing_sold") (action = "retire_sold"), summary.retired_sold++;
      else (action = "retire_stale"), summary.retired_stale++;
    } else if (decision.action === "reprice") {
      patch = { ...decision.patch, last_seen_at: nowIso, exact_verified_at: nowIso };
      action = "reprice";
      summary.repriced++;
    } else {
      // inconclusive - fail closed
      patch = { is_active: false };
      action = "failclosed";
      summary.failclosed++;
    }

    changes.push({
      id: r.id,
      card: `${r.card_name ?? r.title} / ${r.card_set ?? ""}`.trim(),
      marketplace: r.marketplace,
      action,
      reason: decision.reason,
      stored_discount: r.discount_pct != null ? (r.discount_pct * 100).toFixed(1) + "%" : null,
      new_discount:
        patch.discount_pct != null ? (Number(patch.discount_pct) * 100).toFixed(1) + "%" : null,
      stored_total_usd: Number(r.total_price_usd ?? r.total_price),
      new_total_usd: patch.total_price_usd != null ? Number(patch.total_price_usd.toFixed(2)) : null,
    });

    if (APPLY) {
      const { error } = await db.from("deals").update(patch).eq("id", r.id);
      if (error) console.error(`update ${r.id} failed:`, error.message);
    }
  }

  console.log("\n---- CHANGES ----");
  console.log(JSON.stringify(changes.filter((c) => c.action !== "unchanged"), null, 2));
  console.log("\n---- SUMMARY ----");
  console.log(JSON.stringify(summary, null, 2));
  const after = await getBrowseRateLimit();
  console.log("Browse quota after:", after);
  if (!APPLY) console.log("\nDRY-RUN only. Re-run with --apply to write.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
