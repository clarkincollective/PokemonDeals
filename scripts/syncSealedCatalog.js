// node scripts/syncSealedCatalog.js  [--limit N]
//
// Off-Vercel full sync of PokemonPriceTracker's sealed-product catalogue
// into `sealed_catalog`. Iterates every English set, pulls its sealed
// products via /sealed-products?setName=, upserts. ~219 requests, ~1
// credit per product returned (~3-5k credits total). Paced to stay under
// PPT's per-minute window.
//
// Same record-building as /api/sync-sealed-catalog/route.js (both use
// lib/sealedCatalog.js). Idempotent - safe to re-run.

require("dotenv").config({ path: ".env.local" });
const { createClient } = require("@supabase/supabase-js");
const { listSets, listSealedProductsForSet } = require("../lib/pokemonPriceTracker");
const { sealedCatalogRecord } = require("../lib/sealedCatalog");

const LANGUAGE = "english";
const UPSERT_CHUNK = 500;
// PPT bills sealed list requests as ~limit/10 "minute calls" against a
// tiny window; listSealedProductsForSet already uses a small page +
// fetchPPTPaced backoff, this is just base spacing between sets.
const PACE_MS = 1200;

const limitArg = (() => {
  const i = process.argv.indexOf("--limit");
  return i >= 0 ? Number(process.argv[i + 1]) : null;
})();

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);
const log = (...a) => console.log(`[${new Date().toISOString()}]`, ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const started = Date.now();

  const { count: before } = await db
    .from("sealed_catalog")
    .select("tcgplayer_id", { count: "exact", head: true })
    .eq("language", LANGUAGE);
  log(`sealed_catalog rows BEFORE: ${before ?? 0}`);

  let sets;
  try {
    sets = await listSets(LANGUAGE);
  } catch (e) {
    log(`FAILED to list sets: ${e.message}`);
    process.exit(1);
  }
  if (limitArg) sets = sets.slice(0, limitArg);
  log(`sets to scan: ${sets.length}`);

  const byId = new Map();
  let scanned = 0;
  let withProducts = 0;
  const errors = [];

  for (const s of sets) {
    scanned++;
    try {
      const products = await listSealedProductsForSet(s.name, { language: LANGUAGE });
      if (products.length) withProducts++;
      for (const p of products) {
        const rec = sealedCatalogRecord(p, { language: LANGUAGE });
        if (rec) byId.set(rec.tcgplayer_id, rec);
      }
      if (scanned % 25 === 0 || products.length > 20) {
        log(`  [${scanned}/${sets.length}] ${s.name} -> ${products.length} products (cum distinct ${byId.size})`);
      }
    } catch (e) {
      errors.push(`${s.name}: ${e.message}`);
      log(`  [${scanned}/${sets.length}] ${s.name} -> ERROR ${e.message}`);
    }
    await sleep(PACE_MS);
  }

  const records = [...byId.values()];
  log(`\nscanned ${scanned} sets (${withProducts} had sealed products); ${records.length} distinct products; ${errors.length} set errors`);
  if (errors.length) errors.slice(0, 10).forEach((e) => log(`  err: ${e}`));

  let upserted = 0;
  for (let i = 0; i < records.length; i += UPSERT_CHUNK) {
    const slice = records.slice(i, i + UPSERT_CHUNK);
    const { error } = await db.from("sealed_catalog").upsert(slice, { onConflict: "tcgplayer_id" });
    if (error) {
      log(`UPSERT FAILED at rows ${i}..${i + slice.length}: ${error.message}`);
      log(`  ${upserted} upserted before failure - state is PARTIAL.`);
      process.exit(1);
    }
    upserted += slice.length;
    log(`  upserted ${upserted}/${records.length}`);
  }

  // Prune broken image URLs -> null so SpeciesCard falls back to the
  // placeholder instead of a broken <img>. ~2% of TCGplayer CDN product
  // photos 403/404 (mostly older misc products).
  {
    const rows = [];
    for (let from = 0; ; from += 1000) {
      const { data } = await db
        .from("sealed_catalog")
        .select("tcgplayer_id, image_url")
        .not("image_url", "is", null)
        .range(from, from + 999);
      if (!data || !data.length) break;
      rows.push(...data);
      if (data.length < 1000) break;
    }
    const broken = [];
    for (let i = 0; i < rows.length; i += 40) {
      await Promise.all(
        rows.slice(i, i + 40).map(async (r) => {
          try {
            const res = await fetch(r.image_url, { method: "HEAD" });
            if (!res.ok) broken.push(r.tcgplayer_id);
          } catch {
            broken.push(r.tcgplayer_id);
          }
        })
      );
    }
    for (let i = 0; i < broken.length; i += 100) {
      await db.from("sealed_catalog").update({ image_url: null }).in("tcgplayer_id", broken.slice(i, i + 100));
    }
    log(`pruned ${broken.length} broken image URLs -> null`);
  }

  // verify
  const { count: after } = await db
    .from("sealed_catalog")
    .select("tcgplayer_id", { count: "exact", head: true })
    .eq("language", LANGUAGE);

  const seen = new Set();
  const dups = new Set();
  const typeCounts = {};
  for (let from = 0; ; from += 1000) {
    const { data } = await db
      .from("sealed_catalog")
      .select("tcgplayer_id, product_type")
      .eq("language", LANGUAGE)
      .range(from, from + 999);
    if (!data || !data.length) break;
    for (const r of data) {
      const id = String(r.tcgplayer_id);
      if (seen.has(id)) dups.add(id);
      seen.add(id);
      typeCounts[r.product_type] = (typeCounts[r.product_type] || 0) + 1;
    }
    if (data.length < 1000) break;
  }

  log("\n================ RESULT ================");
  log(`sets scanned              : ${scanned}`);
  log(`distinct products upserted : ${upserted}`);
  log(`sealed_catalog rows now    : ${after} (was ${before ?? 0})`);
  log(`duplicate tcgplayer_id     : ${dups.size} ${dups.size ? [...dups].slice(0, 10).join(",") : "(none)"}`);
  log(`by product_type            : ${JSON.stringify(typeCounts)}`);
  log(`took                       : ${((Date.now() - started) / 1000).toFixed(0)}s`);
  log("=======================================");
  if (dups.size) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
