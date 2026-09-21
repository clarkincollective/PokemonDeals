#!/usr/bin/env node
// REPRINT COLLISION SCAN (2026-09-21). READ-ONLY.
//
//   node scripts/seo/reprintCollisionScan.mjs
//   node scripts/seo/reprintCollisionScan.mjs --min=3
//
// The 30th and Celebrations families were found by hand, from one owner
// report. This asks the catalogue the general question instead: which
// pairs of sets print the SAME card at the SAME number? Any such pair is
// a place where a collector number cannot identify the printing, which is
// the whole mechanism behind the mispricing.
//
// It is a detector, not a rule. A collision is only worth acting on when
// the two sets are far apart in price and a seller could plausibly name
// either - which is a judgement, made by reading the output.
import { existsSync } from "node:fs";
import { config as loadDotenv } from "dotenv";
import { createClient } from "@supabase/supabase-js";

if (existsSync(".env.local")) loadDotenv({ path: ".env.local", quiet: true });
const MIN = Number((process.argv.find((a) => a.startsWith("--min=")) ?? "--min=2").split("=")[1]);
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const normName = (s) => String(s ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "");
const normNum = (s) =>
  String(s ?? "")
    .split("/")
    .map((p) => p.trim().replace(/^0+(?=\d)/, ""))
    .join("/");

const rows = [];
for (let from = 0; ; from += 1000) {
  const { data, error } = await db
    .from("card_catalog")
    .select("name,set,card_number,market_price")
    .order("tcgplayer_id", { ascending: true })
    .range(from, from + 999);
  if (error) throw new Error(error.message);
  rows.push(...(data ?? []));
  if ((data?.length ?? 0) < 1000) break;
}
console.log(`Reprint collision scan - READ-ONLY\n  catalogue rows: ${rows.length}\n`);

// key = normalised name + number; group the sets that print it.
const byCard = new Map();
for (const r of rows) {
  const nm = normName(r.name);
  const num = normNum(r.card_number);
  if (!nm || !num) continue;
  const key = `${nm}|${num}`;
  if (!byCard.has(key)) byCard.set(key, []);
  byCard.get(key).push(r);
}

// Count collisions per unordered set pair, and track the worst price gap.
const pairs = new Map();
for (const [, group] of byCard) {
  const sets = [...new Set(group.map((g) => String(g.set ?? "")))].filter(Boolean);
  if (sets.length < 2) continue;
  for (let i = 0; i < sets.length; i++) {
    for (let j = i + 1; j < sets.length; j++) {
      const key = [sets[i], sets[j]].sort().join("  <->  ");
      const entry = pairs.get(key) ?? { n: 0, worst: null };
      entry.n++;
      const a = group.find((g) => g.set === sets[i]);
      const b = group.find((g) => g.set === sets[j]);
      const pa = Number(a?.market_price);
      const pb = Number(b?.market_price);
      if (Number.isFinite(pa) && Number.isFinite(pb) && pa > 0 && pb > 0) {
        const ratio = Math.max(pa, pb) / Math.min(pa, pb);
        if (!entry.worst || ratio > entry.worst.ratio) {
          entry.worst = { ratio, name: a?.name, num: normNum(a?.card_number), pa, pb, sa: sets[i], sb: sets[j] };
        }
      }
      pairs.set(key, entry);
    }
  }
}

const ranked = [...pairs.entries()]
  .filter(([, v]) => v.n >= MIN)
  .sort((a, b) => (b[1].worst?.ratio ?? 0) - (a[1].worst?.ratio ?? 0));

console.log(`  set pairs sharing >= ${MIN} card name+number: ${ranked.length}`);
console.log(`  (ordered by the worst price gap found in the pair)\n`);
for (const [key, v] of ranked.slice(0, 25)) {
  console.log(`  ${String(v.n).padStart(3)} shared   ${key}`);
  if (v.worst) {
    console.log(
      `        worst gap ${v.worst.ratio.toFixed(1)}x on ${v.worst.name} ${v.worst.num}: $${v.worst.pa} vs $${v.worst.pb}`
    );
  }
}
console.log("\n  A pair matters when the price gap is large AND a seller could name");
console.log("  either set in the title. Read before adding any family to the rule.");
