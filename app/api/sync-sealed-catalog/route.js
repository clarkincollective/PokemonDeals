import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { listSets, listSealedProductsForSet } from "@/lib/pokemonPriceTracker";
import { sealedCatalogRecord, flagImplausibleSealedPrices } from "@/lib/sealedCatalog";

// Daily sync of PokemonPriceTracker's sealed-product catalogue into our
// own `sealed_catalog` table - the browsing layer's source of "every
// sealed product for a set" + a reference price for products with no
// active eBay deal. Sealed twin of /api/sync-card-catalog.
//
// PPT has no bulk sealed list without a set filter and no cheap sealed
// export we can rely on, so this walks every English set and calls
// /sealed-products?setName= (~219 requests, ~1 credit per product, a few
// thousand total). Small enough for one function invocation; paced to
// stay under PPT's per-minute window.
//
// Cached in our DB, never re-exposed as a feed (PPT terms - see
// supabase/sealed_catalog_migration.sql).
export const dynamic = "force-dynamic";
export const maxDuration = 800;

const LANGUAGE = "english";
const UPSERT_CHUNK = 500;
const PACE_MS = 1000; // listSealedProductsForSet self-throttles on 429

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function GET(request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const limit = Number(url.searchParams.get("limit")) || null; // test pass
  const db = supabaseAdmin();
  const started = Date.now();

  let sets;
  try {
    sets = await listSets(LANGUAGE);
  } catch (err) {
    return Response.json({ ok: false, stage: "listSets", error: err.message }, { status: 200 });
  }
  if (limit) sets = sets.slice(0, limit);

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
    } catch (err) {
      errors.push(`${s.name}: ${err.message}`);
    }
    await sleep(PACE_MS);
  }

  const records = [...byId.values()];
  const nulledPrices = flagImplausibleSealedPrices(records);
  let upserted = 0;
  for (let i = 0; i < records.length; i += UPSERT_CHUNK) {
    const slice = records.slice(i, i + UPSERT_CHUNK);
    const { error } = await db.from("sealed_catalog").upsert(slice, { onConflict: "tcgplayer_id" });
    if (error) {
      return Response.json(
        { ok: false, stage: "upsert", upserted, error: error.message },
        { status: 200 }
      );
    }
    upserted += slice.length;
  }

  return Response.json({
    ok: true,
    setsScanned: scanned,
    setsWithProducts: withProducts,
    distinctProducts: byId.size,
    upserted,
    implausibleBoxPricesNulled: nulledPrices,
    withPrice: records.filter((r) => r.market_price != null).length,
    setErrors: errors.length,
    errors: errors.slice(0, 10),
    creditsApprox: records.length,
    tookMs: Date.now() - started,
  });
}
