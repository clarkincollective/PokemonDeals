#!/usr/bin/env node
// REPRINT RE-MATCH AUDIT (2026-09-21). READ-ONLY. Writes nothing.
//
//   node scripts/seo/reprintRematchAudit.mjs
//   node scripts/seo/reprintRematchAudit.mjs --all       # every row, not just active
//
// The savings-claim rule stops a reprint being advertised at the
// original's discount. That is the safe answer, not the right one: the
// listing may still be a genuine deal against the REPRINT's own market
// price. This asks, for every affected row, whether we hold a catalogue
// card that the listing should have matched instead - same card name,
// same number, in the reprint set - and what the price would become.
//
// It proposes nothing and changes nothing. It answers "could we re-match,
// and what would it be worth".
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { config as loadDotenv } from "dotenv";
import { createClient } from "@supabase/supabase-js";

if (existsSync(".env.local")) loadDotenv({ path: ".env.local", quiet: true });
const req = createRequire(import.meta.url);
const { isDisplayableDeal } = req("../../lib/dealQuality.js");

const ALL = process.argv.includes("--all");
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

// Must mirror lib/dealQuality REPRINT_FAMILIES.
const FAMILIES = [
  { key: "30th", title: /\b(?:30th|thirtieth)\b/i, set: /\b30th\b/i },
  { key: "Celebrations/25th", title: /\b(?:25th|celebrations)\b/i, set: /\bcelebrations\b/i },
];

const normNum = (s) =>
  String(s ?? "")
    .split("/")
    .map((p) => p.trim().replace(/^0+(?=\d)/, ""))
    .join("/");
const titleNumber = (t) => {
  const m = String(t ?? "").match(/\b(\d{1,3})\s*\/\s*(\d{1,3})\b/);
  return m ? normNum(`${m[1]}/${m[2]}`) : null;
};
const money = (v) => (v == null || v === "" ? null : Number(v));

async function page(table, select, build) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    let q = db.from(table).select(select).order("id", { ascending: true }).range(from, from + 999);
    if (build) q = build(q);
    const { data, error } = await q;
    if (error) throw new Error(`${table}: ${error.message}`);
    out.push(...(data ?? []));
    if ((data?.length ?? 0) < 1000) break;
  }
  return out;
}

async function main() {
  const rows = await page("deals", "*", (q) => (ALL ? q : q.eq("is_active", true)));
  console.log(`Reprint re-match audit - READ-ONLY  (${ALL ? "ALL rows" : "active rows"})\n`);
  console.log(`  rows scanned: ${rows.length}`);

  const affected = [];
  for (const r of rows) {
    const set = String(r.card_set ?? "");
    if (!set.trim()) continue;
    for (const fam of FAMILIES) {
      if (fam.title.test(String(r.title ?? "")) && !fam.set.test(set)) {
        affected.push({ r, fam });
        break;
      }
    }
  }
  console.log(`  rows whose title names a reprint family but matched elsewhere: ${affected.length}`);
  console.log(`  of those, currently displayable: ${affected.filter((a) => isDisplayableDeal(a.r)).length}\n`);

  // Could each one be re-matched? Look for the same card name in the
  // reprint set, and prefer an exact number match.
  const names = [...new Set(affected.map((a) => a.r.card_name).filter(Boolean))];
  const byName = new Map();
  for (const n of names) {
    const { data, error } = await db.from("card_catalog").select("*").ilike("name", `%${n}%`).limit(500);
    if (error) throw new Error(`card_catalog "${n}": ${error.message}`);
    byName.set(n, data ?? []);
  }

  let rematchable = 0;
  let noCandidate = 0;
  let noPrice = 0;
  const lines = [];
  for (const { r, fam } of affected) {
    const cands = (byName.get(r.card_name) ?? []).filter((c) => fam.set.test(String(c.set ?? "")));
    const tn = titleNumber(r.title);
    const exact = cands.filter((c) => normNum(c.number ?? c.card_number) === tn);
    const pick = exact[0] ?? (cands.length === 1 ? cands[0] : null);
    const priceCol = pick ? Object.keys(pick).find((k) => /^market|price|usd/i.test(k)) : null;
    const newPrice = pick && priceCol ? money(pick[priceCol]) : null;
    const oldPrice = money(r.market_price);

    if (!pick) {
      noCandidate++;
      lines.push(`  NO CANDIDATE  deal ${r.id}  ${String(r.card_set).slice(0, 26)}  "${String(r.title).slice(0, 62)}"`);
      continue;
    }
    if (newPrice == null) {
      noPrice++;
      lines.push(
        `  NO PRICE      deal ${r.id}  -> ${String(pick.set).slice(0, 34)} ${pick.number ?? ""}  (catalogue holds no reference)`
      );
      continue;
    }
    rematchable++;
    const total = money(r.total_price);
    const stillDeal = total != null && newPrice > 0 ? total < newPrice : null;
    lines.push(
      `  RE-MATCHABLE  deal ${r.id}  ${String(r.card_set).slice(0, 22).padEnd(24)} $${String(oldPrice).padEnd(9)} -> ${String(pick.set).slice(0, 30).padEnd(32)} $${String(newPrice).padEnd(9)} asking $${String(total).padEnd(8)} ${
        stillDeal == null ? "" : stillDeal ? "STILL A DEAL" : "not a deal at the correct reference"
      }`
    );
  }

  console.log(`  re-matchable with a priced catalogue card : ${rematchable}`);
  console.log(`  reprint card exists but carries no price  : ${noPrice}`);
  console.log(`  no reprint card of that name at all       : ${noCandidate}\n`);
  for (const l of lines.slice(0, 40)) console.log(l);
  if (lines.length > 40) console.log(`  ... and ${lines.length - 40} more`);
}

main().catch((e) => {
  console.error(`FAILED: ${e.message}`);
  process.exitCode = 1;
});
