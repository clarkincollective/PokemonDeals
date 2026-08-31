// node scripts/syncCardCatalogFull.js
//
// Off-Vercel full sync of PokemonPriceTracker's /export printings CSV into
// card_catalog. Same record-building logic as
// app/api/sync-card-catalog/route.js, but with NO 800s function ceiling -
// runs the whole parse + extractSpecies + upsert end to end in one
// long-lived process.
//
// Why this exists: the Vercel route kept getting killed mid-upsert by
// maxDuration, leaving card_catalog a partial patchwork (see
// IMPLEMENTATION_STATUS "A4 - three-way coverage spot-check").
//
// /export is capped at 2 downloads/day. This script makes exactly ONE
// download. If it 429s, the daily quota has not reset - it exits loudly
// WITHOUT having consumed anything. Do not re-run speculatively; hold the
// 2nd call in reserve for a genuine retry.

require("dotenv").config({ path: ".env.local" });
const { createClient } = require("@supabase/supabase-js");
const {
  downloadPrintingsExport,
  pickCatalogMarketPrice,
  WOTC_DUAL_PRINTING_SETS,
  getCatalogNmPrice,
} = require("../lib/pokemonPriceTracker");
const { extractSpecies } = require("../lib/pokemonSpecies");
const { catalogImageUrl } = require("../lib/cardImage");

const LANGUAGE = "english";
const UPSERT_CHUNK = 1000;

function db() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url, key);
}

function firstNonEmpty(...vals) {
  for (const v of vals) if (v != null && String(v).trim() !== "") return String(v);
  return null;
}

const log = (...a) => console.log(`[${new Date().toISOString()}]`, ...a);

async function main() {
  const client = db();
  const started = Date.now();

  const { count: before } = await client
    .from("card_catalog")
    .select("tcgplayer_id", { count: "exact", head: true })
    .eq("language", LANGUAGE);
  log(`card_catalog english rows BEFORE: ${before}`);

  log("downloading /export printings CSV (1 of 2 daily calls) ...");
  let rows;
  try {
    rows = await downloadPrintingsExport();
  } catch (err) {
    if (/429|Daily export limit/i.test(err.message)) {
      log(`EXPORT QUOTA NOT RESET - aborting, nothing consumed:\n  ${err.message}`);
      process.exit(2);
    }
    log(`EXPORT DOWNLOAD FAILED:\n  ${err.message}`);
    process.exit(1);
  }
  log(`export rows (all printings, all languages): ${rows.length}`);

  // Merge per-printing rows -> one record per tcgPlayerId (english only).
  const byId = new Map();
  let skippedLang = 0;
  let skippedNoId = 0;
  for (const r of rows) {
    if ((r.language || "english") !== LANGUAGE) {
      skippedLang++;
      continue;
    }
    const id = r.tcgPlayerId != null ? String(r.tcgPlayerId).trim() : null;
    if (!id) {
      skippedNoId++;
      continue;
    }
    const cur = byId.get(id) ?? {
      tcgplayer_id: id,
      name: null,
      set: null,
      set_id: null,
      card_number: null,
      rarity: null,
      prices: [],
    };
    cur.name = cur.name ?? firstNonEmpty(r.name);
    cur.set = cur.set ?? firstNonEmpty(r.setName);
    cur.set_id = cur.set_id ?? firstNonEmpty(r.setId);
    cur.card_number = cur.card_number ?? firstNonEmpty(r.cardNumber);
    cur.rarity = cur.rarity ?? firstNonEmpty(r.rarity);
    // Keep the printing + full condition ladder so pickCatalogMarketPrice
    // can pick the Unlimited printing for a dual-printing WOTC card and
    // reject a Near Mint figure its own ladder contradicts.
    const num = (v) => {
      const n = Number(v);
      return Number.isFinite(n) && n > 0 ? n : null;
    };
    cur.prices.push({
      printing: r.printing ?? null,
      nm: num(r.marketNearMint) ?? num(r.marketPrice),
      lp: num(r.marketLightlyPlayed),
      mp: num(r.marketModeratelyPlayed),
      hp: num(r.marketHeavilyPlayed),
      dmg: num(r.marketDamaged),
    });
    byId.set(id, cur);
  }
  log(
    `merged -> ${byId.size} distinct english cards ` +
      `(skipped: ${skippedLang} non-english printings, ${skippedNoId} rows with no tcgPlayerId)`
  );

  const records = [...byId.values()].map((c) => ({
    tcgplayer_id: c.tcgplayer_id,
    name: c.name ?? "",
    set: c.set ?? "",
    set_id: c.set_id,
    card_number: c.card_number,
    rarity: c.rarity,
    card_type: null,
    species: extractSpecies(c.name ?? ""),
    language: LANGUAGE,
    market_price: pickCatalogMarketPrice(c.prices),
    image_url: catalogImageUrl(c.tcgplayer_id),
    source: "pokemonpricetracker",
    synced_at: new Date().toISOString(),
  }));

  const withSpecies = records.filter((r) => r.species != null).length;
  const withPrice = records.filter((r) => r.market_price != null).length;
  log(`records to upsert: ${records.length} | with species: ${withSpecies} | with price: ${withPrice}`);

  // Upsert in chunks. ANY error aborts loudly - no silent partial success.
  let upserted = 0;
  const totalChunks = Math.ceil(records.length / UPSERT_CHUNK);
  for (let i = 0; i < records.length; i += UPSERT_CHUNK) {
    const slice = records.slice(i, i + UPSERT_CHUNK);
    const chunkNo = i / UPSERT_CHUNK + 1;
    const { error } = await client
      .from("card_catalog")
      .upsert(slice, { onConflict: "tcgplayer_id" });
    if (error) {
      log(`UPSERT FAILED on chunk ${chunkNo}/${totalChunks} (rows ${i}..${i + slice.length}):`);
      log(`  ${error.message}`);
      log(`  ${upserted} rows upserted before the failure. STATE IS PARTIAL - re-run needed.`);
      process.exit(1);
    }
    upserted += slice.length;
    log(`  chunk ${chunkNo}/${totalChunks} ok - cumulative upserted: ${upserted}/${records.length}`);
  }

  // ---- WOTC 1st-Edition/Unlimited second pass ----
  // The printings CSV doesn't split these products, so the aggregate is
  // the 1st-Edition figure; the unqualified /cards/<slug> identity is
  // Unlimited. Re-derive from /cards (pickMarketPrice), paced.
  {
    const wotcRows = records.filter((r) => WOTC_DUAL_PRINTING_SETS.has(r.set));
    log(`\nWOTC dual-printing second pass: ${wotcRows.length} rows`);
    const queue = [...wotcRows];
    let checked = 0;
    let fixed = 0;
    const worker = async () => {
      let r;
      while ((r = queue.shift())) {
        checked++;
        let nm;
        try {
          nm = await getCatalogNmPrice(String(r.tcgplayer_id), LANGUAGE);
        } catch (e) {
          log(`   ! ${r.tcgplayer_id} ${r.name}: ${e.message}`);
          continue;
        }
        if (nm == null) continue;
        const cur = r.market_price == null ? null : Number(r.market_price);
        if (cur != null && Math.abs(cur - nm) / nm <= 0.02) continue;
        const { error } = await client
          .from("card_catalog")
          .update({ market_price: nm })
          .eq("tcgplayer_id", r.tcgplayer_id);
        if (!error) fixed++;
        if (checked % 100 === 0) log(`   ...${checked}/${wotcRows.length} (fixed ${fixed})`);
      }
    };
    await Promise.all(Array.from({ length: 4 }, worker));
    log(`WOTC second pass: checked ${checked}, corrected ${fixed}`);
  }

  // ---- verification ----
  const { count: after } = await client
    .from("card_catalog")
    .select("tcgplayer_id", { count: "exact", head: true })
    .eq("language", LANGUAGE);
  const { count: afterSp } = await client
    .from("card_catalog")
    .select("tcgplayer_id", { count: "exact", head: true })
    .eq("language", LANGUAGE)
    .not("species", "is", null);

  // duplicate check: pull every id, look for repeats (PK should prevent
  // this, but verify since the task asks).
  const seen = new Set();
  const dups = new Set();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await client
      .from("card_catalog")
      .select("tcgplayer_id")
      .eq("language", LANGUAGE)
      .range(from, from + 999);
    if (error) throw new Error(error.message);
    if (!data || !data.length) break;
    for (const r of data) {
      const id = String(r.tcgplayer_id);
      if (seen.has(id)) dups.add(id);
      seen.add(id);
    }
    if (data.length < 1000) break;
  }

  const expected = byId.size;
  const complete = after >= expected - 5; // tiny tolerance for churn between count calls

  log("");
  log("================ RESULT ================");
  log(`export distinct english cards : ${expected}`);
  log(`card_catalog english rows     : ${after}  (was ${before}, attempted upsert ${upserted})`);
  log(`  with a resolved species     : ${afterSp}`);
  log(`duplicate tcgplayer_id rows   : ${dups.size} ${dups.size ? [...dups].slice(0, 10).join(",") : "(none - upsert idempotent)"}`);
  log(`took                          : ${((Date.now() - started) / 1000).toFixed(0)}s`);
  log(`COMPLETE (rows >= export - 5) : ${complete ? "YES" : "NO"}`);
  log("=======================================");

  if (!complete) {
    log("Row count is short of the export total. Investigate before treating Part A as closed.");
    process.exit(1);
  }
  if (dups.size) {
    log("Duplicate ids present - upsert onConflict is not behaving. Investigate.");
    process.exit(1);
  }
  log("Sync complete. Re-run scripts/auditSpeciesCoverage.js to verify per-species coverage.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
