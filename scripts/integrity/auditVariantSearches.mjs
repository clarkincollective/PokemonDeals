// AUDIT 2026-09-23, FINDING 8 — variant searches losing set / number.
//
// READ-ONLY. SELECT only against our own tables, plus GETs to our own
// /api/card-analysis. No provider call, no scan, and no eBay or Impact
// URL is ever requested - the queries below are decoded and printed, not
// followed, so no affiliate click is generated.
//
//   node scripts/integrity/auditVariantSearches.mjs [--limit N]

import { createRequire } from "node:module";
import { readFileSync } from "node:fs";

const require = createRequire(import.meta.url);
const ROOT = "C:/Users/James/OneDrive/Desktop/pokemon-deals";
for (const line of readFileSync(`${ROOT}/.env.local`, "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const { createClient } = require("@supabase/supabase-js");
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const { buildCardSearchQuery } = require(`${ROOT}/lib/cardSearchQuery.js`);

const LIMIT = Number((process.argv.find((a) => a.startsWith("--limit=")) ?? "").split("=")[1] || 40);
const SITE = "https://pokemondealfinder.com";

const { data: snap } = await db.from("catalog_snapshot").select("data").eq("kind", "cardHubs").maybeSingle();
const hubs = (snap?.data ?? []).slice(0, LIMIT);

console.log("# finding 8 — variant search queries, before and after (READ-ONLY)");
console.log(`cutoff: ${new Date().toISOString()}`);
console.log(`hubs sampled: ${hubs.length}\n`);

let withGrades = 0;
let lostSet = 0;
let lostNumber = 0;
const rows = [];

for (const h of hubs) {
  let analysis = null;
  try {
    const res = await fetch(`${SITE}/api/card-analysis?id=${encodeURIComponent(h.tcgplayerId)}`, {
      headers: { accept: "application/json" },
    });
    analysis = (await res.json())?.analysis ?? null;
  } catch {
    continue;
  }
  const grades = (analysis?.graded ?? []).map((g) => g.label);
  if (grades.length === 0) continue;
  withGrades++;

  const cardNumber = analysis?.cardNumber ?? null;
  const grade = grades[0];

  // WHAT THE GRID BUILT BEFORE: components/VariantPriceGrid used
  // `${cardName} ${g.label}`, where cardName was the hub name only.
  const before = `${h.name} ${grade}`;
  // WHAT IT BUILDS NOW.
  const after = buildCardSearchQuery({ name: h.name, set: h.set, cardNumber, grade });

  const setMissing = !before.toLowerCase().includes(String(h.set ?? "").toLowerCase().slice(0, 12));
  const numMissing = cardNumber ? !before.includes(cardNumber) : false;
  if (setMissing) lostSet++;
  if (numMissing) lostNumber++;

  rows.push({ slug: h.slug, set: h.set, cardNumber, grade, before, after, setMissing, numMissing });
}

console.log(`hubs rendering graded variant tiles: ${withGrades}`);
console.log(`…whose query lost the SET:            ${lostSet}`);
console.log(`…whose query lost the NUMBER:         ${lostNumber}\n`);

for (const r of rows) {
  console.log(`## ${r.slug}`);
  console.log(`   identity shown:  ${r.set} · ${r.cardNumber ?? "(no number)"} · ${r.grade}`);
  console.log(`   BEFORE (decoded): "${r.before}"${r.setMissing ? "   [set lost]" : ""}${r.numMissing ? "   [number lost]" : ""}`);
  console.log(`   AFTER  (decoded): "${r.after}"`);
}
