// Owner-reported listing HOLD (2026-09-20). One eBay item the owner has
// judged counterfeit is withheld from every surface by the existing
// mechanism - deals.disqualified_reason - on every row that carries that
// same eBay listing id (the scanner records one row per marketplace it
// saw the item on).
//
//   node scripts/remediation/holdReportedListing.mjs --ids=40200                         # dry run (read-only)
//   node scripts/remediation/holdReportedListing.mjs --ids=40200,39415,40885 --apply --confirm=1 --prior-out=<file>
//   node scripts/remediation/holdReportedListing.mjs --rollback=<prior file> --confirm=1
//
// Sets ONLY deals.disqualified_reason = "authenticity:owner_reported"
// (same mechanism as the other remediation scripts). Never changes
// is_active, identity, prices or timestamps; never touches a row whose
// eBay listing id differs from the first id given (guard against a typo
// holding an unrelated listing). A held row stays hidden even if a later
// scan re-sights it (isDisplayableDeal / isOfferCountable never clear a
// reason). Prints deal ids, marketplaces and the reason - never the
// seller. The public integrity report counts it under the authenticity
// family; nothing on the site names the seller or the listing as fake.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { config as loadDotenv } from "dotenv";
import { createClient } from "@supabase/supabase-js";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..");
const require = createRequire(import.meta.url);
export const HOLD_REASON = "authenticity:owner_reported";

const args = Object.fromEntries(process.argv.slice(2).map((a) => { const [k, v] = a.replace(/^--/, "").split("="); return [k, v ?? true]; }));
const apply = args.apply === true || args.apply === "1";
const confirmed = args.confirm === "1";

function db() {
  if (existsSync(join(REPO, ".env.local"))) loadDotenv({ path: join(REPO, ".env.local"), quiet: true });
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
}

async function main() {
  const client = db();
  const { isDisplayableDeal } = require(join(REPO, "lib", "dealQuality.js"));

  if (args.rollback) {
    if (!confirmed) throw new Error("rollback needs --confirm=1");
    const prior = JSON.parse(readFileSync(args.rollback, "utf8"));
    for (const r of prior.rows) {
      const { error } = await client.from("deals").update({ disqualified_reason: r.disqualified_reason }).eq("id", r.id).eq("disqualified_reason", HOLD_REASON);
      if (error) throw new Error(`rollback ${r.id}: ${error.message}`);
      console.log(`rolled back ${r.id} -> ${r.disqualified_reason ?? "null"}`);
    }
    return;
  }

  const ids = String(args.ids ?? "").split(",").map((s) => Number(s.trim())).filter(Number.isFinite);
  if (!ids.length) throw new Error("--ids=<dealId[,dealId…]> is required");
  const { data: rows, error } = await client.from("deals").select("*").in("id", ids);
  if (error) throw new Error(`deals read failed: ${error.message}`);
  if ((rows ?? []).length !== ids.length) throw new Error(`expected ${ids.length} rows, found ${rows?.length ?? 0}`);
  const listingIds = new Set(rows.map((r) => String(r.listing_id)));
  if (listingIds.size !== 1) throw new Error("the ids do not share one eBay listing id - refusing (one item per hold)");

  for (const r of rows) {
    console.log(JSON.stringify({ id: r.id, marketplace: r.marketplace, is_active: r.is_active, displayable_now: isDisplayableDeal(r), disqualified_reason: r.disqualified_reason, market_usd: r.market_price, discount_pct: r.discount_pct, visual: r.visual_authenticity_status }));
  }
  if (!apply) { console.log(`dry run: would set disqualified_reason="${HOLD_REASON}" on ${rows.length} row(s)`); return; }
  if (!confirmed || !args["prior-out"]) throw new Error("--apply needs --confirm=1 and --prior-out=<file>");

  writeFileSync(args["prior-out"], JSON.stringify({ at: new Date().toISOString(), reason: HOLD_REASON, rows: rows.map((r) => ({ id: r.id, disqualified_reason: r.disqualified_reason ?? null })) }, null, 2));
  for (const r of rows) {
    const { error: upErr } = await client.from("deals").update({ disqualified_reason: HOLD_REASON }).eq("id", r.id);
    if (upErr) throw new Error(`update ${r.id}: ${upErr.message}`);
  }
  const { data: after } = await client.from("deals").select("*").in("id", ids);
  for (const r of after ?? []) console.log(JSON.stringify({ id: r.id, marketplace: r.marketplace, disqualified_reason: r.disqualified_reason, displayable_now: isDisplayableDeal(r) }));
}

main().catch((e) => { console.error(`\n  x ${e.message}\n`); process.exit(1); });
