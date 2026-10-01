import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { listSets, listSealedProductsForSet } from "@/lib/pokemonPriceTracker";
import { fetchTcgcsvCatalogue, buildSealedCatalogRows, TCGCSV_SOURCE } from "@/lib/tcgcsv";
import { sealedCatalogRecord, flagImplausibleSealedPrices } from "@/lib/sealedCatalog";
import { setPptConsumer } from "@/lib/pptTelemetry";

// Daily sync of sealed-product reference prices into our own `sealed_catalog`
// table - the browsing layer's source of "every sealed product for a set" +
// a reference price for products with no active eBay deal. Sealed twin of
// /api/sync-card-catalog.
//
// 2026-09-28 (owner: "I'm not upgrading pokemon price tracker... find ways
// we can keep the market data updated. using free sources"): "tcgcsv"
// (default) now reads TCGplayer's daily catalogue from tcgcsv.com - the
// SAME per-group /products + /prices pass sync-card-catalog already runs
// for singles, which also downloads every sealed product in that group and,
// until now, discarded it (lib/tcgcsv `sealedSkipped`). No extra request,
// no cost, no credit. "ppt" is PokemonPriceTracker's own
// listSealedProductsForSet walk, kept only as an explicit opt-in
// (?source=ppt) for parity with sync-card-catalog - its free tier has no
// bulk sealed list, and with PPT_SAVED_DATA_MODE on it throws immediately
// without a request, same as every other PPT door.
export const dynamic = "force-dynamic";
export const maxDuration = 800;

const LANGUAGE = "english";
const UPSERT_CHUNK = 500;
const PACE_MS = 1000; // listSealedProductsForSet (ppt source only) self-throttles on 429

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function syncFromTcgcsv({ limit }) {
  const got = await fetchTcgcsvCatalogue({ language: LANGUAGE, groupLimit: limit ? 3 : null });
  const records = buildSealedCatalogRows(got.sealedRows, { language: LANGUAGE });
  return { records, tcgcsv: { asOf: got.asOf, ...got.stats }, setErrors: [], setsScanned: got.stats.groups, setsWithProducts: got.stats.groupsPriced };
}

async function syncFromPpt({ limit }) {
  let sets = await listSets(LANGUAGE);
  if (limit) sets = sets.slice(0, limit);
  const byId = new Map();
  let withProducts = 0;
  const errors = [];
  for (const s of sets) {
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
  return { records: [...byId.values()], tcgcsv: null, setErrors: errors, setsScanned: sets.length, setsWithProducts: withProducts };
}

export async function GET(request) {
  setPptConsumer("cron:sync-sealed-catalog"); // ppt-telemetry-r1 attribution only
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const limit = Number(url.searchParams.get("limit")) || null; // test pass
  const source = url.searchParams.get("source") === "ppt" ? "ppt" : TCGCSV_SOURCE;
  const db = supabaseAdmin();
  const started = Date.now();

  let result;
  try {
    result = source === "ppt" ? await syncFromPpt({ limit }) : await syncFromTcgcsv({ limit });
  } catch (err) {
    return Response.json({ ok: false, stage: source === "ppt" ? "listSets" : "tcgcsv", error: err.message }, { status: 200 });
  }

  const { records, tcgcsv, setErrors, setsScanned, setsWithProducts } = result;
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
    source,
    setsScanned,
    setsWithProducts,
    distinctProducts: records.length,
    upserted,
    implausibleBoxPricesNulled: nulledPrices,
    withPrice: records.filter((r) => r.market_price != null).length,
    setErrors: setErrors.length,
    errors: setErrors.slice(0, 10),
    creditsApprox: source === "ppt" ? records.length : 0,
    tcgcsv,
    tookMs: Date.now() - started,
  });
}
