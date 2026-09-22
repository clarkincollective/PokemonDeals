#!/usr/bin/env node
// PRINTING-REPAIR PROGRESS (deal 42127). READ-ONLY. No provider call.
//
//   node scripts/integrity/printingRepairProgress.mjs
//
// The upstream matcher (lib/printingMatch) stops NEW bad references. The
// rows written before it shipped are repaired by the NORMAL refresh
// pipeline: each listing is re-priced with the correct printing the next
// time its card is scanned. Nothing is mass-updated here - a bespoke
// pricing mutation would rewrite comparisons without fresh provider
// prices for the correct printing, and the pipeline does it properly and
// idempotently on its existing schedule.
//
// This makes that recovery OBSERVABLE: run it to see how many rows still
// carry an unevidenced parallel reference. It should fall as cards are
// re-scanned. Note that many of these will not regain a claim at all -
// if the plain printing has no price for the listing's condition (which
// is exactly why the bug occurred), the listing is correctly skipped
// rather than priced.
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { config as loadDotenv } from "dotenv";
import { createClient } from "@supabase/supabase-js";
if (existsSync(".env.local")) loadDotenv({ path: ".env.local", quiet: true });
const req = createRequire(import.meta.url);
const Q = req("../../lib/dealQuality.js");
const P = req("../../lib/printingMatch.js");
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const rows = [];
for (let from = 0; ; from += 1000) {
  const { data } = await db.from("deals").select("*").eq("is_active", true).range(from, from + 999);
  if (!data?.length) break; rows.push(...data); if (data.length < 1000) break;
}
const live = rows.filter((r) => Q.isDisplayableDeal(r));
const refused = live.filter((r) => Q.referenceIsUnevidencedParallelPrinting(r));

const ids = [...new Set(refused.map((r) => r.card_tcgplayer_id).filter(Boolean).map(String))];
const cat = new Map();
for (let i = 0; i < ids.length; i += 500) {
  const { data } = await db.from("card_catalog").select("tcgplayer_id, market_printing, market_condition, market_price").in("tcgplayer_id", ids.slice(i, i + 500));
  for (const c of data ?? []) cat.set(String(c.tcgplayer_id), c);
}

// What the NEW matcher would resolve on the next scan, given only the
// variants we can prove exist (catalogue printing + the stored parallel).
let recoverable = 0, sameCondition = 0, noCatalogue = 0, stillAmbiguous = 0;
for (const r of refused) {
  const c = cat.get(String(r.card_tcgplayer_id));
  if (!c?.market_printing) { noCatalogue++; continue; }
  const choice = P.selectReferencePrinting({
    variantNames: [c.market_printing, r.reference_printing],
    evidenceText: `${r.title ?? ""} ${r.condition ?? ""}`,
    catalogPrinting: c.market_printing,
  });
  if (!choice.printing || choice.parallel) { stillAmbiguous++; continue; }
  recoverable++;
  if (c.market_condition && r.condition && c.market_condition === r.condition) sameCondition++;
}
console.log(`refused by the containment gate        ${refused.length}`);
console.log(`  new matcher resolves a NON-parallel  ${recoverable}`);
console.log(`    of those, catalogue condition also`);
console.log(`    matches the listing condition      ${sameCondition}   <- priceable from the catalogue alone`);
console.log(`  no catalogue printing on file        ${noCatalogue}`);
console.log(`  still ambiguous                      ${stillAmbiguous}`);
console.log(`\nthese ${refused.length} deal pages are currently noindex,follow (rule 17C.7)`);
