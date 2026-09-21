#!/usr/bin/env node
// PRICING-DATA INVENTORY (2026-09-22). READ-ONLY. Makes no provider call.
//
//   node scripts/preservation/inventory.mjs
//
// Answers "what would we actually still have if the PokemonPriceTracker
// subscription were paused", by counting what is DURABLY STORED in our
// own database - not what the provider could serve us.
//
// Deliberately reports coverage rather than totals alone: a catalogue of
// 29k cards is worth little if only a fraction carry a usable reference,
// and it is coverage that decides what the site can still show.
import { existsSync } from "node:fs";
import { config as loadDotenv } from "dotenv";
import { createClient } from "@supabase/supabase-js";

if (existsSync(".env.local")) loadDotenv({ path: ".env.local", quiet: true });
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const pct = (n, d) => (d ? `${((n / d) * 100).toFixed(1)}%` : "-");

async function count(table, build) {
  let q = db.from(table).select("*", { count: "exact", head: true });
  if (build) q = build(q);
  const { count: c, error } = await q;
  if (error) return { error: error.message };
  return { count: c ?? 0 };
}

async function sample(table, cols, n = 1) {
  const { data, error } = await db.from(table).select(cols).limit(n);
  if (error) return { error: error.message };
  return { rows: data ?? [] };
}

const TABLES = [
  "card_catalog",
  "price_history",
  "deals",
  "sealed_deals",
  "sealed_catalog",
  "watchlist",
  "sealed_watchlist",
  "integrity_snapshots",
  "raw_sales",
  "graded_sales",
];

console.log("PRICING DATA INVENTORY - read-only, no provider call\n");
console.log(`  taken: ${new Date().toISOString()}\n`);

console.log("TABLE PRESENCE AND SIZE");
const sizes = {};
for (const t of TABLES) {
  const r = await count(t);
  if (r.error) {
    console.log(`  ${t.padEnd(22)} absent or unreadable (${r.error.slice(0, 60)})`);
    continue;
  }
  sizes[t] = r.count;
  console.log(`  ${t.padEnd(22)} ${String(r.count).padStart(8)} rows`);
}

// ---- catalogue coverage ------------------------------------------------
console.log("\nCARD CATALOGUE COVERAGE (what a paused site could still price)");
const cat = sizes.card_catalog ?? 0;
if (cat) {
  const priced = await count("card_catalog", (q) => q.not("market_price", "is", null).gt("market_price", 0));
  const imaged = await count("card_catalog", (q) => q.not("image_url", "is", null));
  const numbered = await count("card_catalog", (q) => q.not("card_number", "is", null));
  const withCond = await count("card_catalog", (q) => q.not("market_condition", "is", null));
  const withPrint = await count("card_catalog", (q) => q.not("market_printing", "is", null));
  const synced = await count("card_catalog", (q) => q.not("synced_at", "is", null));
  console.log(`  total catalogue rows        ${String(cat).padStart(8)}`);
  console.log(`  with a usable market price  ${String(priced.count).padStart(8)}  ${pct(priced.count, cat)}`);
  console.log(`  with an image reference     ${String(imaged.count).padStart(8)}  ${pct(imaged.count, cat)}`);
  console.log(`  with a collector number     ${String(numbered.count).padStart(8)}  ${pct(numbered.count, cat)}`);
  console.log(`  price labelled by CONDITION ${String(withCond.count).padStart(8)}  ${pct(withCond.count, cat)}`);
  console.log(`  price labelled by PRINTING  ${String(withPrint.count).padStart(8)}  ${pct(withPrint.count, cat)}`);
  console.log(`  carrying a provider sync ts ${String(synced.count).padStart(8)}  ${pct(synced.count, cat)}`);

  const s = await sample("card_catalog", "*");
  if (s.rows?.length) console.log(`  columns: ${Object.keys(s.rows[0]).join(", ")}`);
}

// ---- history -----------------------------------------------------------
console.log("\nPRICE HISTORY (the part a pause can never rebuild)");
if (sizes.price_history != null) {
  const { data: oldest } = await db.from("price_history").select("*").order("observed_on", { ascending: true }).limit(1);
  const { data: newest } = await db.from("price_history").select("*").order("observed_on", { ascending: false }).limit(1);
  if (oldest?.length) console.log(`  columns: ${Object.keys(oldest[0]).join(", ")}`);
  console.log(`  earliest observation: ${oldest?.[0]?.observed_on ?? "?"}`);
  console.log(`  latest observation  : ${newest?.[0]?.observed_on ?? "?"}`);
  const { data: distinctCards } = await db.rpc("noop_does_not_exist").select?.() ?? {};
  void distinctCards;
}

// ---- sealed ------------------------------------------------------------
console.log("\nSEALED PRODUCT");
if (sizes.sealed_catalog != null) {
  const pricedSealed = await count("sealed_catalog", (q) => q.not("market_price", "is", null).gt("market_price", 0));
  console.log(`  sealed catalogue rows       ${String(sizes.sealed_catalog).padStart(8)}`);
  console.log(`  with a usable market price  ${String(pricedSealed.count).padStart(8)}  ${pct(pricedSealed.count, sizes.sealed_catalog)}`);
  const s = await sample("sealed_catalog", "*");
  if (s.rows?.length) console.log(`  columns: ${Object.keys(s.rows[0]).join(", ")}`);
}

// ---- graded ------------------------------------------------------------
console.log("\nGRADED REFERENCES (held on the deal rows, not the catalogue)");
const gradedDeals = await count("deals", (q) => q.eq("is_graded", true));
const gradedRef = await count("deals", (q) => q.eq("is_graded", true).not("reference_grade", "is", null));
console.log(`  deal rows marked graded     ${String(gradedDeals.count ?? 0).padStart(8)}`);
console.log(`  of those, with grader+grade ${String(gradedRef.count ?? 0).padStart(8)}  ${pct(gradedRef.count, gradedDeals.count)}`);

console.log("\nNOTE: every figure above is from OUR database. Nothing here");
console.log("required a provider request, and none was made.");
