// node scripts/syncSealedCatalogSets.js  --file <json array of set names>
//                                        [--all]  (rescan every set)
//
// Targeted sealed-catalog sync for a specific list of set names (the ~68
// the first full run left uncovered). Same record-building + implausible-
// price pass as scripts/syncSealedCatalog.js, per-set progress logging,
// idempotent upsert. Reports which of the requested sets genuinely have
// no PPT sealed product vs which now landed rows.
//
// Note: PPT's ?setName= is a loose match; a product is filed under its
// OWN setName (sealedCatalogRecord), so scanning set X can legitimately
// upsert rows for set Y. "no sealed product" below means: no product in
// the response whose own setName is the queried set.

require("dotenv").config({ path: ".env.local" });
const fs = require("fs");
const { createClient } = require("@supabase/supabase-js");
const { listSets, listSealedProductsForSet } = require("../lib/pokemonPriceTracker");
const { sealedCatalogRecord, flagImplausibleSealedPrices } = require("../lib/sealedCatalog");

const LANGUAGE = "english";
const UPSERT_CHUNK = 500;
const PACE_MS = 1200;

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);
const log = (...a) => console.log(`[${new Date().toISOString()}]`, ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const started = Date.now();
  let targets;
  const fileArg = process.argv.indexOf("--file");
  if (process.argv.includes("--all")) {
    targets = (await listSets(LANGUAGE)).map((s) => s.name);
  } else if (fileArg >= 0) {
    targets = JSON.parse(fs.readFileSync(process.argv[fileArg + 1], "utf-8"));
  } else {
    console.error("pass --file <json> or --all");
    process.exit(1);
  }
  log(`targets: ${targets.length} sets`);

  const { count: before } = await db
    .from("sealed_catalog")
    .select("tcgplayer_id", { count: "exact", head: true })
    .eq("language", LANGUAGE);
  log(`sealed_catalog rows BEFORE: ${before ?? 0}`);

  const byId = new Map();
  const perSet = {}; // queried set -> count of products whose OWN setName === it
  const errors = [];
  let scanned = 0;

  for (const name of targets) {
    scanned++;
    try {
      const products = await listSealedProductsForSet(name, { language: LANGUAGE });
      const own = products.filter((p) => p.setName === name).length;
      perSet[name] = own;
      for (const p of products) {
        const rec = sealedCatalogRecord(p, { language: LANGUAGE });
        if (rec) byId.set(rec.tcgplayer_id, rec);
      }
      log(`  [${scanned}/${targets.length}] ${name} -> ${products.length} in response, ${own} truly this set (cum distinct ${byId.size})`);
    } catch (e) {
      errors.push(`${name}: ${e.message}`);
      log(`  [${scanned}/${targets.length}] ${name} -> ERROR ${e.message}`);
    }
    await sleep(PACE_MS);
  }

  const records = [...byId.values()];
  const nulled = flagImplausibleSealedPrices(records);
  log(`\n${records.length} distinct products to upsert; ${nulled} implausible box prices -> null; ${errors.length} set errors`);
  errors.forEach((e) => log(`  err: ${e}`));

  let upserted = 0;
  for (let i = 0; i < records.length; i += UPSERT_CHUNK) {
    const slice = records.slice(i, i + UPSERT_CHUNK);
    const { error } = await db.from("sealed_catalog").upsert(slice, { onConflict: "tcgplayer_id" });
    if (error) {
      log(`UPSERT FAILED rows ${i}..${i + slice.length}: ${error.message} (${upserted} done)`);
      process.exit(1);
    }
    upserted += slice.length;
    log(`  upserted ${upserted}/${records.length}`);
  }

  // Re-derive coverage across ALL sets
  const allSetNames = new Set((await listSets(LANGUAGE)).map((s) => s.name));
  const coveredNow = new Set();
  let totalNow = 0;
  for (let f = 0; ; f += 1000) {
    const { data } = await db.from("sealed_catalog").select("set").eq("language", LANGUAGE).range(f, f + 999);
    if (!data || !data.length) break;
    data.forEach((r) => {
      coveredNow.add(r.set);
      totalNow++;
    });
    if (data.length < 1000) break;
  }
  const stillUncovered = [...allSetNames].filter((n) => !coveredNow.has(n));

  const requestedEmpty = targets.filter((n) => (perSet[n] ?? 0) === 0);
  const requestedFilled = targets.filter((n) => (perSet[n] ?? 0) > 0);

  log("\n================ RESULT ================");
  log(`sets requested            : ${targets.length}`);
  log(`  -> now have own rows     : ${requestedFilled.length}  ${JSON.stringify(requestedFilled)}`);
  log(`  -> genuinely no PPT sealed product : ${requestedEmpty.length}`);
  log(`sealed_catalog total rows : ${totalNow} (was ${before ?? 0})`);
  log(`sets with any rows        : ${coveredNow.size} / ${allSetNames.size}`);
  log(`sets still with zero rows : ${stillUncovered.length}`);
  log(`took                      : ${((Date.now() - started) / 1000).toFixed(0)}s`);
  log("=======================================");

  fs.writeFileSync(
    "C:/Users/James/AppData/Local/Temp/claude/C--Users-James/7d17598c-f943-45a3-890d-4779db9dc754/scratchpad/sealed-fill-result.json",
    JSON.stringify({ perSet, requestedFilled, requestedEmpty, stillUncovered, totalNow, coveredSets: coveredNow.size }, null, 2)
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
