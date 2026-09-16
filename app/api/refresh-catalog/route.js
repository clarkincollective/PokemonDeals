import { revalidateTag } from "next/cache";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { computeAggregates } from "@/lib/catalogAggregates";
import { buildSetVocabularyFromRows, buildCatalogSetsFromRows } from "@/lib/setCatalogAggregates";
import { DEAL_LISTS_TAG } from "@/lib/listingAvailability";

// Recomputes the per-catalogue aggregates (sets / card hubs / species
// hubs) and stores them in catalog_snapshot, so the read path in
// lib/deals.js reads one JSON row instead of scanning ~8k deal rows on
// every cold cache. DB-only - no eBay or PokemonPriceTracker calls, so
// it's cheap to run every 15 minutes. See supabase/catalog_snapshot_migration.sql.
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const PAGE_SIZE = 1000;
// Both selects carry lib/deals SAVINGS_EVIDENCE_COLUMNS verbatim (kept as
// plain strings here; a test pins them to that list). computeAggregates
// filters on savingsClaimTrusted, which reads the stored reference
// evidence - without these columns every row of a tracked recent release
// fails that check and the set can never become deal-backed.
const SELECT =
  "total_price, total_price_usd, image_url, disqualified_reason, visual_authenticity_status, visual_authenticity_reason, market_price, discount_pct, card_set, title, card_tcgplayer_id, is_graded, grader, grade, condition, reference_product_id, reference_amount, reference_currency, reference_fx_rate, reference_fx_asof, reference_observed_at, reference_condition, reference_printing, reference_grader, reference_grade, watchlist:watchlist_id!inner (id, name, set, language, justtcg_tcgplayer_id)";
const SELECT_LEGACY =
  "total_price, image_url, disqualified_reason, visual_authenticity_status, visual_authenticity_reason, market_price, discount_pct, card_set, title, card_tcgplayer_id, is_graded, grader, grade, condition, reference_product_id, reference_amount, reference_currency, reference_fx_rate, reference_fx_asof, reference_observed_at, reference_condition, reference_printing, reference_grader, reference_grade, watchlist:watchlist_id!inner (id, name, set, language, justtcg_tcgplayer_id)";

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
      // reader-consistency: a held row (re-sighted or not) is never counted
      .is("disqualified_reason", null)
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

  // 13B.6.3 - one card_catalog scan -> the deterministic set structures
  // the /search cold path used to rebuild per cold cache (a ~24-request
  // full scan x2). Independent of the deal snapshots above: a failure
  // here leaves them intact and the read path falls back to the live
  // scan.
  let setVocabulary = [];
  let catalogSets = [];
  let catalogRows = 0;
  let setSnapshotError = null;
  try {
    const cat = [];
    for (let from = 0; ; from += PAGE_SIZE) {
      const { data, error } = await db
        .from("card_catalog")
        .select("set, set_id, name, tcgplayer_id, market_price, image_url")
        .eq("language", "english")
        .not("set", "is", null)
        .range(from, from + PAGE_SIZE - 1);
      if (error) throw new Error(error.message);
      if (!data || data.length === 0) break;
      cat.push(...data);
      if (data.length < PAGE_SIZE) break;
    }
    catalogRows = cat.length;
    setVocabulary = buildSetVocabularyFromRows(cat);
    catalogSets = buildCatalogSetsFromRows(cat.filter((r) => r.market_price != null && r.market_price > 0 && r.image_url));
    const { error: setUpsertError } = await db.from("catalog_snapshot").upsert(
      [
        { kind: "setVocabulary", data: setVocabulary, updated_at },
        { kind: "catalogSets", data: catalogSets, updated_at },
      ],
      { onConflict: "kind" }
    );
    if (setUpsertError) throw new Error(setUpsertError.message);
  } catch (err) {
    setSnapshotError = err.message;
  }

  // SEO-4 freshness. Writing the snapshot is not enough on its own: the
  // read path caches it (fetchSets, unstable_cache 900s) and the set /
  // species pages are ISR on top of that, so a newly deal-backed set took
  // up to ~75 minutes to surface even though the snapshot was current
  // within 30. Expiring the shared list tag here hands the new snapshot to
  // the next visitor instead of the next cache window.
  //
  // Never throws - a failed invalidation must not fail the refresh, which
  // has already written its rows. The outcome is reported so a run that
  // silently stopped invalidating is visible.
  let invalidated = 0;
  const invalidationErrors = [];
  try {
    revalidateTag(DEAL_LISTS_TAG, { expire: 0 });
    invalidated = 1;
  } catch (e) {
    invalidationErrors.push(e?.message ?? String(e));
  }

  return Response.json({
    ok: true,
    invalidated,
    invalidationErrors,
    scannedRows: rows.length,
    sets: sets.length,
    cardHubs: cardHubs.length,
    speciesHubs: speciesHubs.length,
    catalogRows,
    setVocabulary: setVocabulary.length,
    catalogSets: catalogSets.length,
    setSnapshotError,
    ms: Date.now() - started,
  });
}
