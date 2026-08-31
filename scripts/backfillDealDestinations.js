// node scripts/backfillDealDestinations.js [--apply]
//
// A verified deal's CTA must open the ONE eBay listing it was priced
// against. Two failure modes among currently-active rows:
//   auction_ended     - an AUCTION past auction_end_at, still is_active.
//                       eBay retires the listing and redirects its /itm/
//                       url to the /p/<epid> product group (this is what
//                       deal 12912 hit).
//   destination:non_exact - stored affiliate_url / listing_url is not an
//                       /itm/<legacyId> matching listing_id (a /p/, /sch/,
//                       homepage, missing, malformed, or wrong-id url).
//
// Both -> is_active=false + disqualified_reason. No /itm/ url is ever
// fabricated from an epid. Covers `deals` and `sealed_deals`.
//
// Dry run by default; no eBay calls (stored data only). --apply writes.

require("dotenv").config({ path: ".env.local" });
const { createClient } = require("@supabase/supabase-js");
const { isExactEbayDealDestination, auctionEnded } = require("../lib/dealQuality");

const APPLY = process.argv.includes("--apply");
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const log = (...a) => console.log(...a);

async function columnExists(table, col) {
  const { error } = await db.from(table).select(col).limit(1);
  return !error;
}

async function run(table) {
  const rows = [];
  for (let f = 0; ; f += 1000) {
    const { data, error } = await db
      .from(table)
      .select("id, listing_id, listing_url, affiliate_url, listing_type, auction_end_at, marketplace, first_seen_at")
      .eq("is_active", true)
      .range(f, f + 999);
    if (error) throw new Error(error.message);
    if (!data || !data.length) break;
    rows.push(...data);
    if (data.length < 1000) break;
  }

  const byReason = new Map();
  for (const r of rows) {
    let reason = null;
    if (!isExactEbayDealDestination(r)) reason = "destination:non_exact";
    else if (auctionEnded(r)) reason = "auction_ended";
    if (!reason) continue;
    if (!byReason.has(reason)) byReason.set(reason, []);
    byReason.get(reason).push(r.id);
  }

  const total = [...byReason.values()].reduce((n, a) => n + a.length, 0);
  log(`\n===== ${table} (${rows.length} active) =====`);
  for (const [k, ids] of [...byReason.entries()].sort((a, b) => b[1].length - a[1].length)) {
    log(`  ${k}: ${ids.length}`);
  }
  // per-marketplace split of the ended auctions
  const ended = byReason.get("auction_ended") ?? [];
  const mkt = {};
  for (const r of rows) if (ended.includes(r.id)) mkt[r.marketplace] = (mkt[r.marketplace] ?? 0) + 1;
  if (ended.length) log(`  auction_ended by marketplace: ${JSON.stringify(mkt)}`);
  log(`  total to disqualify: ${total}`);
  return byReason;
}

(async () => {
  const hasReason = (await columnExists("deals", "disqualified_reason"))
    ? await columnExists("deals", "disqualified_reason")
    : false;
  log(`disqualified_reason column: ${hasReason ? "present" : "absent (is_active only)"}`);

  for (const table of ["deals", "sealed_deals"]) {
    let byReason;
    try {
      byReason = await run(table);
    } catch (e) {
      log(`${table}: skipped (${e.message})`);
      continue;
    }
    if (!APPLY) continue;
    const canReason = await columnExists(table, "disqualified_reason");
    for (const [reason, ids] of byReason) {
      for (let i = 0; i < ids.length; i += 200) {
        const slice = ids.slice(i, i + 200);
        const { error } = await db
          .from(table)
          .update(canReason ? { is_active: false, disqualified_reason: reason } : { is_active: false })
          .in("id", slice);
        if (error) throw new Error(error.message);
      }
      log(`  ${table} ${reason}: disqualified ${ids.length}`);
    }
  }
  log(APPLY ? "\nAPPLIED." : "\n(dry run - re-run with --apply)");
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
