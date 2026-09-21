#!/usr/bin/env node
// AMBIGUOUS PRICING EXPOSURE (2026-09-21). READ-ONLY.
//
//   node scripts/seo/ambiguousPricingExposure.mjs
//   node scripts/seo/ambiguousPricingExposure.mjs --gap=3
//
// The reprint work started from one owner report about 30th Anniversary
// cards. reprintCollisionScan then showed 70 set pairs in the catalogue
// share a card name+number, some with 70-266x price gaps - so the
// mechanism is far wider than anniversary sets.
//
// A shared number is only a problem if a LIVE listing is priced against
// one of the two. This measures that: for every displayable deal carrying
// a savings claim, is there another catalogue card of the same name and
// number, in a different set, at a materially different price? If so, the
// discount depends on which printing the seller actually holds.
//
// It reports exposure. It changes nothing and proposes nothing.
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { config as loadDotenv } from "dotenv";
import { createClient } from "@supabase/supabase-js";

if (existsSync(".env.local")) loadDotenv({ path: ".env.local", quiet: true });
const req = createRequire(import.meta.url);
const { isDisplayableDeal, savingsClaimTrusted } = req("../../lib/dealQuality.js");

const GAP = Number((process.argv.find((a) => a.startsWith("--gap=")) ?? "--gap=2").split("=")[1]);
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const normName = (s) => String(s ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "");
const normNum = (s) =>
  String(s ?? "")
    .split("/")
    .map((p) => p.trim().replace(/^0+(?=\d)/, ""))
    .join("/");

async function pageAll(table, select, build) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    let q = db.from(table).select(select).range(from, from + 999);
    q = build ? build(q) : q;
    const { data, error } = await q;
    if (error) throw new Error(`${table}: ${error.message}`);
    out.push(...(data ?? []));
    if ((data?.length ?? 0) < 1000) break;
  }
  return out;
}

const cat = await pageAll("card_catalog", "name,set,card_number,market_price", (q) =>
  q.order("tcgplayer_id", { ascending: true })
);
const byCard = new Map();
for (const c of cat) {
  const k = `${normName(c.name)}|${normNum(c.card_number)}`;
  if (!k.startsWith("|") && !k.endsWith("|")) {
    if (!byCard.has(k)) byCard.set(k, []);
    byCard.get(k).push(c);
  }
}

const deals = await pageAll("deals", "*", (q) => q.eq("is_active", true).order("id", { ascending: true }));
const shown = deals.filter((d) => isDisplayableDeal(d));
const claiming = shown.filter((d) => savingsClaimTrusted(d));

console.log("Ambiguous pricing exposure - READ-ONLY\n");
console.log(`  catalogue rows ${cat.length}; active deals ${deals.length}; displayable ${shown.length}; claiming savings ${claiming.length}\n`);

const exposed = [];
for (const d of claiming) {
  const num = normNum(String(d.title ?? "").match(/\b(\d{1,3})\s*\/\s*(\d{1,3})\b/)?.slice(1, 3).join("/") ?? "");
  if (!num) continue;
  const alts = (byCard.get(`${normName(d.card_name)}|${num}`) ?? []).filter(
    (c) => String(c.set ?? "") !== String(d.card_set ?? "") && Number(c.market_price) > 0
  );
  if (alts.length === 0) continue;
  const mine = Number(d.market_price);
  if (!Number.isFinite(mine) || mine <= 0) continue;
  for (const a of alts) {
    const ratio = Math.max(mine, Number(a.market_price)) / Math.min(mine, Number(a.market_price));
    if (ratio >= GAP) {
      exposed.push({ d, alt: a, ratio, num });
      break;
    }
  }
}

exposed.sort((x, y) => y.ratio - x.ratio);
console.log(`  listings claiming savings whose name+number also exists in another set at >= ${GAP}x price: ${exposed.length}`);
console.log(`  (${((exposed.length / Math.max(claiming.length, 1)) * 100).toFixed(1)} % of claiming listings)\n`);

// The risky subset: priced as the EXPENSIVE side, and the title does not
// actually name that set. Priced as the cheap side is conservative - the
// discount can only be understated - and a title that names its set is
// evidence the match is right.
const setNamed = (d) => {
  const t = normName(d.title);
  const toks = String(d.card_set ?? "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 2 && !/^(the|and|ex|sv|sm|swsh|me)$/.test(w));
  return toks.length > 0 && toks.every((w) => t.includes(w));
};
const risky = exposed.filter((e) => Number(e.d.market_price) > Number(e.alt.market_price) && !setNamed(e.d));
console.log(`  of those, priced as the EXPENSIVE side with no set name in the title: ${risky.length}`);
for (const e of risky.slice(0, 10)) {
  console.log(`      deal ${e.d.id}  ${e.ratio.toFixed(1)}x  ${String(e.d.card_set).slice(0, 34)} $${e.d.market_price} vs ${String(e.alt.set).slice(0, 30)} $${e.alt.market_price}`);
  console.log(`          ${String(e.d.title).slice(0, 96)}`);
}
console.log("");

for (const e of exposed.slice(0, 20)) {
  const d = e.d;
  console.log(
    `  deal ${String(d.id).padEnd(6)} ${e.ratio.toFixed(1)}x   asking $${String(d.total_price).padEnd(9)} ${(Number(d.discount_pct) * 100).toFixed(0)} % off`
  );
  console.log(`      priced as : ${String(d.card_set).slice(0, 40).padEnd(42)} $${d.market_price}`);
  console.log(`      could be  : ${String(e.alt.set).slice(0, 40).padEnd(42)} $${e.alt.market_price}`);
  console.log(`      title     : ${String(d.title).slice(0, 96)}`);
}
if (exposed.length > 20) console.log(`  ... and ${exposed.length - 20} more`);

console.log("\n  A row here is NOT automatically wrong - the title may name its set");
console.log("  unambiguously, and the printing/condition evidence may settle it. This");
console.log("  is the population to judge, not a defect list.");
