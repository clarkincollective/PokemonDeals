import { revalidateTag } from "next/cache";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { computeAggregates } from "@/lib/catalogAggregates";
import { buildSetVocabularyFromRows, buildCatalogSetsFromRows } from "@/lib/setCatalogAggregates";
import { CATALOG_SNAPSHOT_TAG } from "@/lib/listingAvailability";
import { sameJson } from "@/lib/stableStringify";
import { logRunSummary } from "@/lib/runtimeLog";

// Recomputes the per-catalogue aggregates (sets / card hubs / species
// hubs) and stores them in catalog_snapshot, so the read path in
// lib/deals.js reads one JSON row instead of scanning ~8k deal rows on
// every cold cache. DB-only - no eBay or PokemonPriceTracker calls, so
// it's cheap to run every 30 minutes. See supabase/catalog_snapshot_migration.sql.
//
// VERCEL-COST-2 (27 Sep 2026), three changes, same output for readers:
//   1. CRON_SECRET, like every other cron route. This one ran two full-table
//      scans for anyone who knew the path.
//   2. CHANGE DETECTION. Each snapshot kind is compared (key-order-insensitive)
//      with the stored row; only kinds that differ are rewritten. Unchanged
//      kinds get their updated_at bumped so lib/deals' SNAPSHOT_MAX_AGE_MS
//      freshness check still passes (the snapshot IS current - it just did
//      not change).
//   3. TARGETED INVALIDATION. The route used to expire DEAL_LISTS_TAG - the
//      site's broadest tag (homepage lanes, every category page, every cached
//      deals-page permutation) - on every run, 48 times a day, without ever
//      touching fetchSets / fetchCardHubs / fetchSpeciesHubs, which read this
//      snapshot and carried no tag at all. It now expires CATALOG_SNAPSHOT_TAG
//      (carried by exactly those three caches and, through Next's tag
//      propagation, the pages that read them), and only when one of the three
//      deal-derived aggregates actually changed. Deal freshness on the lists
//      is unchanged: those caches are expired by the deal scan when it stores
//      something, and expire on their own 180 s window regardless.
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const PAGE_SIZE = 1000;
// Both selects carry lib/deals SAVINGS_EVIDENCE_COLUMNS verbatim (kept as
// plain strings here; a test pins them to that list). computeAggregates
// filters on savingsClaimTrusted, which reads the stored reference
// evidence - without these columns every row of a tracked recent release
// fails that check and the set can never become deal-backed.
// FINDING 6: `id` and `listing_id` are REQUIRED - computeAggregates counts
// distinct eBay listings with them. See lib/deals AGGREGATE_SELECT.
const SELECT =
  "id, listing_id, total_price, total_price_usd, image_url, disqualified_reason, visual_authenticity_status, visual_authenticity_reason, market_price, discount_pct, card_set, title, card_tcgplayer_id, is_graded, grader, grade, condition, reference_product_id, reference_amount, reference_currency, reference_fx_rate, reference_fx_asof, reference_observed_at, reference_condition, reference_printing, reference_grader, reference_grade, watchlist:watchlist_id!inner (id, name, set, language, justtcg_tcgplayer_id)";
const SELECT_LEGACY =
  "id, listing_id, total_price, image_url, disqualified_reason, visual_authenticity_status, visual_authenticity_reason, market_price, discount_pct, card_set, title, card_tcgplayer_id, is_graded, grader, grade, condition, reference_product_id, reference_amount, reference_currency, reference_fx_rate, reference_fx_asof, reference_observed_at, reference_condition, reference_printing, reference_grader, reference_grade, watchlist:watchlist_id!inner (id, name, set, language, justtcg_tcgplayer_id)";

const DEAL_KINDS = ["sets", "cardHubs", "speciesHubs"];
const CATALOG_KINDS = ["setVocabulary", "catalogSets"];

// The stored snapshot rows for these kinds, keyed by kind. A read failure
// yields an empty map, which makes every kind "changed" - the safe side.
async function loadStored(db, kinds) {
  const out = new Map();
  try {
    const { data } = await db.from("catalog_snapshot").select("kind, data").in("kind", kinds);
    for (const r of data ?? []) out.set(r.kind, r.data);
  } catch {
    /* treat as changed */
  }
  return out;
}

// Writes the kinds whose data differs from what is stored; bumps updated_at
// on the rest. Returns { changed: [kinds], error }.
async function writeChanged(db, stored, next, updated_at) {
  const changed = Object.keys(next).filter((k) => !stored.has(k) || !sameJson(stored.get(k), next[k]));
  const unchanged = Object.keys(next).filter((k) => !changed.includes(k));
  if (changed.length) {
    const { error } = await db.from("catalog_snapshot").upsert(
      changed.map((kind) => ({ kind, data: next[kind], updated_at })),
      { onConflict: "kind" }
    );
    if (error) return { changed, error: error.message };
  }
  if (unchanged.length) {
    const { error } = await db.from("catalog_snapshot").update({ updated_at }).in("kind", unchanged);
    if (error) return { changed, error: error.message };
  }
  return { changed, error: null };
}

export async function GET(request) {
  const authHeader = request?.headers?.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
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

  const stored = await loadStored(db, [...DEAL_KINDS, ...CATALOG_KINDS]);
  const dealWrite = await writeChanged(db, stored, { sets, cardHubs, speciesHubs }, updated_at);
  if (dealWrite.error) {
    return Response.json({ ok: false, stage: "upsert", error: dealWrite.error }, { status: 200 });
  }

  // 13B.6.3 - one card_catalog scan -> the deterministic set structures
  // the /search cold path used to rebuild per cold cache (a ~24-request
  // full scan x2). Independent of the deal snapshots above: a failure
  // here leaves them intact and the read path falls back to the live
  // scan. card_catalog is rewritten once a day (sync-card-catalog), so on
  // 46 of 48 runs this recomputes an identical structure - the write is
  // skipped then, the scan itself is a few light paginated reads.
  let setVocabulary = [];
  let catalogSets = [];
  let catalogRows = 0;
  let setSnapshotError = null;
  let catalogChanged = [];
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
    const catalogWrite = await writeChanged(db, stored, { setVocabulary, catalogSets }, updated_at);
    catalogChanged = catalogWrite.changed;
    if (catalogWrite.error) throw new Error(catalogWrite.error);
  } catch (err) {
    setSnapshotError = err.message;
  }

  // SEO-4 freshness, now targeted: expire the snapshot readers' tag only when
  // a deal-derived aggregate changed (a newly deal-backed set, a hub crossing
  // the listing threshold...). An identical snapshot invalidates nothing.
  //
  // Never throws - a failed invalidation must not fail the refresh, which
  // has already written its rows. The outcome is reported so a run that
  // silently stopped invalidating is visible.
  let invalidated = 0;
  const invalidationErrors = [];
  if (dealWrite.changed.length > 0) {
    try {
      revalidateTag(CATALOG_SNAPSHOT_TAG, { expire: 0 });
      invalidated = 1;
    } catch (e) {
      invalidationErrors.push(e?.message ?? String(e));
    }
  }

  const summary = {
    ok: true,
    changed: [...dealWrite.changed, ...catalogChanged],
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
  };
  logRunSummary("refresh_catalog_complete", summary);
  return Response.json(summary);
}
