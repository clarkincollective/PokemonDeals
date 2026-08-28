// Run with: node scripts/auditSpeciesExtraction.js
//
// Dev-only audit for Phase 5 (/pokemon/[slug] species entity pages). Runs
// lib/pokemonSpecies.js's extractSpecies() over every English watchlist
// card that currently has an active deal, then reports:
//   - overall + distinct-name match rate
//   - a sample of UNMATCHED distinct names (eyeball for real species the
//     whitelist / normalizer is missing)
//   - a sample of matched names where the species token is NOT first
//     (eyeball for false positives from trainer/energy cards)
//   - the per-species active-deal count distribution, to choose
//     SPECIES_MIN_LISTINGS in lib/deals.js
//   - the top 40 species by active-deal count
//
// Read-only. No writes.

require("dotenv").config({ path: ".env.local" });
const { supabaseAdmin } = require("../lib/supabaseAdmin");
const { extractSpecies } = require("../lib/pokemonSpecies");

const PAGE_SIZE = 1000;
const LANGUAGE = "english";

function normalizeForFirstTokenCheck(name, species) {
  // cheap: does the species' first word appear as the card name's first
  // word? if not, the match came from deeper in the string.
  const a = name.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().split(" ")[0];
  const b = species.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().split(" ")[0];
  return a === b;
}

async function main() {
  const db = supabaseAdmin();

  const nameCounts = new Map(); // watchlist name -> active deal count
  let rows = 0;
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await db
      .from("deals")
      .select("watchlist:watchlist_id!inner (name, language)")
      .eq("is_active", true)
      .eq("watchlist.language", LANGUAGE)
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) break;
    for (const row of data) {
      const name = row.watchlist?.name;
      if (!name) continue;
      rows++;
      nameCounts.set(name, (nameCounts.get(name) ?? 0) + 1);
    }
    if (data.length < PAGE_SIZE) break;
  }

  const distinctNames = [...nameCounts.keys()];
  let matchedRows = 0;
  let matchedNames = 0;
  const unmatched = [];
  const nonFirstToken = [];
  const speciesCounts = new Map(); // species -> active deal count

  for (const name of distinctNames) {
    const count = nameCounts.get(name);
    const species = extractSpecies(name);
    if (species) {
      matchedNames++;
      matchedRows += count;
      speciesCounts.set(species, (speciesCounts.get(species) ?? 0) + count);
      if (!normalizeForFirstTokenCheck(name, species)) {
        nonFirstToken.push(`${name}  ->  ${species}`);
      }
    } else {
      unmatched.push(`${name}  (${count})`);
    }
  }

  const pct = (n, d) => (d === 0 ? "0" : ((100 * n) / d).toFixed(1));

  console.log("=== Phase 5 species-extraction audit ===\n");
  console.log(`active English card deals scanned : ${rows}`);
  console.log(`distinct watchlist card names     : ${distinctNames.length}`);
  console.log(
    `names matched to a species        : ${matchedNames} (${pct(matchedNames, distinctNames.length)}%)`
  );
  console.log(
    `deal rows covered by a species    : ${matchedRows} (${pct(matchedRows, rows)}%)`
  );
  console.log(`distinct species seen             : ${speciesCounts.size}`);

  const thresholds = [1, 2, 3, 4, 5, 8, 10, 15, 20];
  console.log("\n--- species meeting each SPECIES_MIN_LISTINGS ---");
  for (const t of thresholds) {
    const n = [...speciesCounts.values()].filter((c) => c >= t).length;
    console.log(`  >= ${String(t).padStart(2)} active listings : ${n} species -> ${n} pages`);
  }

  console.log("\n--- top 40 species by active-deal count ---");
  [...speciesCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 40)
    .forEach(([s, c], i) => console.log(`  ${String(i + 1).padStart(2)}. ${s} — ${c}`));

  console.log(`\n--- unmatched distinct names (sample of up to 80 of ${unmatched.length}) ---`);
  unmatched.slice(0, 80).forEach((s) => console.log(`  ${s}`));

  console.log(
    `\n--- matched where species token is NOT first (sample of up to 60 of ${nonFirstToken.length}) ---`
  );
  nonFirstToken.slice(0, 60).forEach((s) => console.log(`  ${s}`));
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
