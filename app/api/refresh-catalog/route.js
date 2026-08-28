import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { computeAggregates } from "@/lib/catalogAggregates";

// Recomputes the per-catalogue aggregates (sets / card hubs / species
// hubs) and stores them in catalog_snapshot, so the read path in
// lib/deals.js reads one JSON row instead of scanning ~8k deal rows on
// every cold cache. DB-only - no eBay or PokemonPriceTracker calls, so
// it's cheap to run every 15 minutes. See supabase/catalog_snapshot_migration.sql.
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const PAGE_SIZE = 1000;
const SELECT =
  "total_price, total_price_usd, image_url, watchlist:watchlist_id!inner (id, name, set, language, justtcg_tcgplayer_id)";
const SELECT_LEGACY =
  "total_price, image_url, watchlist:watchlist_id!inner (id, name, set, language, justtcg_tcgplayer_id)";

export async function GET() {
  const started = Date.now();
  const db = supabaseAdmin();

  // Sequential paginated scan of every active English deal row. Falls
  // back to a select without total_price_usd if the currency migration
  // hasn't run yet.
  let select = SELECT;
  const rows = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await db
      .from("deals")
      .select(select)
      .eq("is_active", true)
      .eq("watchlist.language", "english")
      .range(from, from + PAGE_SIZE - 1);
    if (error) {
      if (select === SELECT) {
        select = SELECT_LEGACY;
        from -= PAGE_SIZE; // retry this page with the legacy select
        continue;
      }
      return Response.json({ ok: false, stage: "scan", error: error.message }, { status: 200 });
    }
    if (!data || data.length === 0) break;
    rows.push(...data);
    if (data.length < PAGE_SIZE) break;
  }

  const { sets, cardHubs, speciesHubs } = computeAggregates(rows);
  const updated_at = new Date().toISOString();

  const { error: upsertError } = await db.from("catalog_snapshot").upsert(
    [
      { kind: "sets", data: sets, updated_at },
      { kind: "cardHubs", data: cardHubs, updated_at },
      { kind: "speciesHubs", data: speciesHubs, updated_at },
    ],
    { onConflict: "kind" }
  );
  if (upsertError) {
    return Response.json({ ok: false, stage: "upsert", error: upsertError.message }, { status: 200 });
  }

  return Response.json({
    ok: true,
    scannedRows: rows.length,
    sets: sets.length,
    cardHubs: cardHubs.length,
    speciesHubs: speciesHubs.length,
    ms: Date.now() - started,
  });
}
