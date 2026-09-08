// Phase SOCIAL-CREATIVE-4A (§37) - PRINTING_COMPARISON_RELEVANCE_CHECK proof.
//
// Read-only. Pulls real card_catalog rows, groups by species, and runs
// printingComparisonRelevance() over candidate high/low pairs - showing
// which real pairs REJECT (a price gap, not a lesson) and which are
// MEANINGFUL. Also runs a fixed set of canonical pairs incl. the
// unrelated-era Umbreon that §37 says MUST fail.
//
//   node scripts/socialPrintingRelevanceProof.mjs
//
// No writes, no Buffer, no eBay.

import { config as loadDotenv } from "dotenv";
import { existsSync } from "node:fs";
if (existsSync(".env.local")) loadDotenv({ path: ".env.local", quiet: true });

import { supabaseAdmin } from "../lib/supabaseAdmin.js";
import { extractSpecies } from "../lib/pokemonSpecies.js";
import { printingComparisonRelevance } from "../lib/newsroom/editorial/printingRelevance.mjs";

const CANONICAL = {
  "unrelated-era Umbreon (the §37 case)": [
    { name: "Umbreon", set: "Evolving Skies", card_number: "215", rarity: "Alternate Art Secret Rare", market_price: 520 },
    { name: "Umbreon", set: "Neo Discovery", card_number: "13", rarity: "Rare Holo", market_price: 110 },
  ],
  "different cards, same species (Charizard ex vs VMAX)": [
    { name: "Charizard ex", set: "Obsidian Flames", card_number: "125", rarity: "Double Rare", market_price: 40 },
    { name: "Charizard VMAX", set: "Darkness Ablaze", card_number: "20", rarity: "Rare Holo VMAX", market_price: 25 },
  ],
  "same name, same era, pure price gap (Snorlax)": [
    { name: "Snorlax", set: "Cosmic Eclipse", card_number: "131", rarity: "Rare", market_price: 18 },
    { name: "Snorlax", set: "Vivid Voltage", card_number: "141", rarity: "Rare", market_price: 9 },
  ],
  "1st Edition vs Unlimited (Base Set Charizard #4)": [
    { name: "Charizard (1st Edition)", set: "Base Set", card_number: "4", rarity: "Rare Holo", market_price: 9000 },
    { name: "Charizard (Unlimited)", set: "Base Set", card_number: "4", rarity: "Rare Holo", market_price: 1200 },
  ],
  "Base Set vs Base Set 2 reprint (same #4)": [
    { name: "Charizard", set: "Base Set", card_number: "4", rarity: "Rare Holo", market_price: 1200 },
    { name: "Charizard", set: "Base Set 2", card_number: "4", rarity: "Rare Holo", market_price: 260 },
  ],
  "reverse holo vs regular (same set + number)": [
    { name: "Pikachu (Reverse Holo)", set: "Brilliant Stars", card_number: "58", rarity: "Common", market_price: 12 },
    { name: "Pikachu", set: "Brilliant Stars", card_number: "58", rarity: "Common", market_price: 5 },
  ],
};

function line(r, label) {
  const v = r.verdict.padEnd(10);
  const axis = r.axis ? ` axis=${r.axis}` : "";
  console.log(`  ${v} ${label}${axis}`);
  console.log(`             reason: ${r.reason}`);
  if (r.lesson) console.log(`             lesson: ${r.lesson}`);
}

console.log("=== CANONICAL PAIRS (fixed) ===");
let canonRejects = 0;
let canonAccepts = 0;
for (const [label, [a, b]] of Object.entries(CANONICAL)) {
  const r = printingComparisonRelevance(a, b);
  line(r, label);
  if (r.verdict === "REJECT") canonRejects++;
  else canonAccepts++;
}
const umbreon = printingComparisonRelevance(...CANONICAL["unrelated-era Umbreon (the §37 case)"]);
console.log(`\n  §37 assertion: unrelated-era Umbreon -> ${umbreon.verdict} ${umbreon.verdict === "REJECT" ? "(PASS)" : "(FAIL - regression!)"}`);
console.log(`  canonical: ${canonRejects} rejected, ${canonAccepts} accepted\n`);

console.log("=== REAL card_catalog PAIRS ===");
const db = supabaseAdmin();
const { data, error } = await db
  .from("card_catalog")
  .select("tcgplayer_id, name, set, card_number, rarity, market_price, image_url")
  .gt("market_price", 8)
  .not("image_url", "is", null)
  .order("market_price", { ascending: false })
  .limit(1500);

if (error) {
  console.log(`  DB read failed: ${error.message}`);
  process.exit(canonRejects >= 3 && canonAccepts >= 3 && umbreon.verdict === "REJECT" ? 0 : 1);
}

const bySpecies = {};
for (const r of data ?? []) {
  const sp = String(extractSpecies(r.name ?? "") ?? "").toLowerCase();
  if (!sp) continue;
  (bySpecies[sp] ??= []).push(r);
}

const rejected = [];
const meaningful = [];
for (const [sp, rowsRaw] of Object.entries(bySpecies)) {
  const rows = rowsRaw
    .filter((r) => /^\d+$/.test(String(r.tcgplayer_id ?? "").trim()))
    .sort((a, b) => Number(b.market_price) - Number(a.market_price))
    .slice(0, 25);
  for (let i = 0; i < rows.length - 1; i++) {
    for (let j = i + 1; j < rows.length; j++) {
      const ratio = Number(rows[i].market_price) / Number(rows[j].market_price);
      if (!Number.isFinite(ratio) || ratio < 1.6) continue;
      const r = printingComparisonRelevance(rows[i], rows[j]);
      const label = `${sp}: "${rows[i].name}" (${rows[i].set} #${rows[i].card_number ?? "?"}, $${Math.round(rows[i].market_price)}) vs "${rows[j].name}" (${rows[j].set} #${rows[j].card_number ?? "?"}, $${Math.round(rows[j].market_price)})`;
      if (r.verdict === "MEANINGFUL" && meaningful.length < 8) meaningful.push({ r, label });
      else if (r.verdict === "REJECT" && rejected.length < 8) rejected.push({ r, label });
    }
  }
}

console.log(`\n  -- REAL pairs REJECTED (sample of ${rejected.length}) --`);
for (const { r, label } of rejected) line(r, label);
console.log(`\n  -- REAL pairs MEANINGFUL (sample of ${meaningful.length}) --`);
if (!meaningful.length) console.log("  (none in the current catalogue snapshot - the check is strict by design; EXACT_PRINTING_MATTERS withholds until real data supplies one)");
for (const { r, label } of meaningful) line(r, label);

const pass = canonRejects >= 3 && canonAccepts >= 3 && umbreon.verdict === "REJECT";
console.log(`\n=== RESULT: ${pass ? "PASS" : "FAIL"} (canonical >=3 reject + >=3 accept + Umbreon rejected) ===`);
process.exit(pass ? 0 : 1);
