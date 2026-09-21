#!/usr/bin/env node
// READ-ONLY catalogue lookup.
//
//   node scripts/seo/catalogueLookup.mjs --name=Lugia
//   node scripts/seo/catalogueLookup.mjs --name=Lugia --set=30th
//
// Answers "does this card exist in that set, and what is it worth there",
// which is the question behind every reported set-mismatch.
import { existsSync } from "node:fs";
import { config as loadDotenv } from "dotenv";
import { createClient } from "@supabase/supabase-js";

if (existsSync(".env.local")) loadDotenv({ path: ".env.local", quiet: true });
const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, "").split("=")));
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const TABLE = args.table ?? "card_catalog";
let q = db.from(TABLE).select("*").limit(200);
if (args.name) q = q.ilike("name", `%${args.name}%`);
const { data, error } = await q;
if (error) {
  console.error(`  x ${TABLE}: ${error.message}`);
  process.exit(1);
}
let rows = data ?? [];
if (args.set) rows = rows.filter((r) => new RegExp(args.set, "i").test(String(r.set ?? "")));

console.log(`${TABLE}: ${rows.length} row(s) matching name~"${args.name ?? "*"}"${args.set ? ` set~"${args.set}"` : ""}\n`);
const cols = rows[0] ? Object.keys(rows[0]) : [];
const price = cols.find((c) => /market|price|usd/i.test(c));
for (const r of rows.slice(0, 40)) {
  console.log(
    `  ${String(r.name ?? "").slice(0, 34).padEnd(36)}${String(r.set ?? "").slice(0, 34).padEnd(36)}${String(r.number ?? r.card_number ?? "").padEnd(10)}${price ? String(r[price] ?? "") : ""}`
  );
}
if (rows.length === 0 && cols.length === 0) console.log("  (no rows; check --table)");
