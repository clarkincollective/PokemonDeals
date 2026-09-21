#!/usr/bin/env node
// READ-ONLY single-deal inspector.
//
//   node scripts/seo/inspectDeal.mjs --id=41596
//
// Prints the stored row and what each shipped gate makes of it, so a
// reported listing can be judged on evidence rather than on its title.
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { config as loadDotenv } from "dotenv";
import { createClient } from "@supabase/supabase-js";

if (existsSync(".env.local")) loadDotenv({ path: ".env.local", quiet: true });
const req = createRequire(import.meta.url);
const Q = req("../../lib/dealQuality.js");
const M = req("../../lib/dealMatching.js");

const id = (process.argv.find((a) => a.startsWith("--id=")) ?? "").split("=")[1];
if (!id) {
  console.error("  x pass --id=<deal id>");
  process.exit(1);
}

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const { data, error } = await db.from("deals").select("*").eq("id", Number(id)).limit(1);
if (error) {
  console.error(`  x ${error.message}`);
  process.exit(1);
}
const r = (data ?? [])[0];
if (!r) {
  console.error(`  x no deal ${id}`);
  process.exit(1);
}

const show = [
  "id", "title", "card_name", "card_set", "card_language", "card_tcgplayer_id", "watchlist_id",
  "listing_id", "listing_type", "condition", "is_graded", "grader", "grade",
  "price", "total_price", "market_price", "discount_pct",
  "reference_condition", "reference_printing", "reference_grader", "reference_grade",
  "reference_amount", "reference_currency", "reference_observed_at",
  "seller_feedback_score", "seller_feedback_pct", "returns_accepted", "image_count",
  "visual_authenticity_status", "visual_authenticity_reason", "image_verdict",
  "disqualified_reason", "is_active", "first_seen_at", "last_seen_at", "exact_verified_at",
];
console.log(`deal ${r.id}\n`);
for (const k of show) {
  if (!(k in r)) continue;
  let v = r[k];
  if (v == null) v = "null";
  v = String(v);
  if (v.length > 150) v = v.slice(0, 150) + " …";
  console.log(`  ${k.padEnd(28)}${v}`);
}

console.log("\n  --- what the shipped gates say ---");
console.log(`  isDisplayableDeal          ${Q.isDisplayableDeal(r)}`);
console.log(`  disqualificationReason     ${Q.disqualificationReason(r) ?? "none"}`);
console.log(`  savingsClaimTrusted        ${Q.savingsClaimTrusted(r)}`);
console.log(`  titleNamesDifferentExpansion  ${M.titleNamesDifferentExpansion(r.card_set, r.title) ?? "no"}`);
console.log(`  premiumBandLacksSellerTrust   ${Q.premiumBandLacksSellerTrust(r)}`);
