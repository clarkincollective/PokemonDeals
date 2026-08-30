import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { SEALED_AUTO_SCAN_TYPES, SEALED_AUTO_MIN_PRICE } from "@/lib/sealedCatalog";

// Auto-promote qualifying `sealed_catalog` rows into `sealed_watchlist`
// so the daily `/api/refresh-sealed-deals` scan covers them. This is the
// sealed-side equivalent of `/api/sync-watchlist`'s card promotion:
// pure DB→DB (no API calls - `sealed_catalog` is already populated by
// `/api/sync-sealed-catalog`), tags rows `source: "auto"`, and retires
// auto rows that no longer qualify. The ~48 hand-picked `source:
// "manual"` rows are never touched.
//
// Criteria (see lib/sealedCatalog.js): product_type in Booster Box /
// Elite Trainer Box, market_price >= $25. ~193 products across ~71 sets
// as of 2026-08-31.
//
// Every promoted row goes through the SAME scan pipeline as the manual
// ones - `isTrustworthySealedListing` (incl. the contested-auction
// reject), `listingMatchesSealedProduct`, `SANITY_FLOOR_PCT`,
// `DISCOUNT_THRESHOLD` - no looser bar.
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const UPSERT_CHUNK = 500;

export async function GET(request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = supabaseAdmin();
  const started = Date.now();

  // 1. Qualifying catalogue rows.
  const qualifying = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db
      .from("sealed_catalog")
      .select("tcgplayer_id, name, set, product_type, market_price")
      .in("product_type", SEALED_AUTO_SCAN_TYPES)
      .not("market_price", "is", null)
      .gte("market_price", SEALED_AUTO_MIN_PRICE)
      .range(from, from + 999);
    if (error) return Response.json({ ok: false, stage: "read-catalog", error: error.message }, { status: 200 });
    if (!data || data.length === 0) break;
    qualifying.push(...data);
    if (data.length < 1000) break;
  }

  // 2. Existing watchlist - manual keys are off-limits, and we need the
  //    current auto rows to reconcile retirement.
  const { data: existing, error: exErr } = await db
    .from("sealed_watchlist")
    .select("id, name, set, source, active");
  if (exErr) return Response.json({ ok: false, stage: "read-watchlist", error: exErr.message }, { status: 200 });

  const key = (r) => `${r.name}|${r.set}`;
  const manualKeys = new Set((existing ?? []).filter((r) => r.source === "manual").map(key));
  const autoRows = (existing ?? []).filter((r) => r.source === "auto");

  // 3. Promote (skip anything already curated manually).
  const promoteKeys = new Set();
  const rows = [];
  for (const c of qualifying) {
    if (manualKeys.has(key(c))) continue;
    promoteKeys.add(key(c));
    rows.push({
      name: c.name,
      set: c.set,
      tcgplayer_id: String(c.tcgplayer_id),
      active: true,
      source: "auto",
    });
  }

  let upserted = 0;
  for (let i = 0; i < rows.length; i += UPSERT_CHUNK) {
    const slice = rows.slice(i, i + UPSERT_CHUNK);
    const { error } = await db.from("sealed_watchlist").upsert(slice, { onConflict: "name,set" });
    if (error) {
      return Response.json({ ok: false, stage: "upsert", upserted, error: error.message }, { status: 200 });
    }
    upserted += slice.length;
  }

  // 4. Retire auto rows that no longer qualify (deactivate only - keeps
  //    their history + reactivates cleanly on the upsert if they return).
  const staleIds = autoRows.filter((r) => r.active && !promoteKeys.has(key(r))).map((r) => r.id);
  let retired = 0;
  if (staleIds.length > 0) {
    const { error } = await db.from("sealed_watchlist").update({ active: false }).in("id", staleIds);
    if (error) return Response.json({ ok: false, stage: "retire", error: error.message }, { status: 200 });
    retired = staleIds.length;
  }

  // 5. Report coverage.
  const { count: activeTotal } = await db
    .from("sealed_watchlist")
    .select("id", { count: "exact", head: true })
    .eq("active", true);
  const { data: activeRows } = await db
    .from("sealed_watchlist")
    .select("set")
    .eq("active", true);
  const setsWithCoverage = new Set((activeRows ?? []).map((r) => r.set)).size;

  return Response.json({
    ok: true,
    qualifyingCatalogRows: qualifying.length,
    skippedAlreadyManual: qualifying.length - rows.length,
    autoUpserted: upserted,
    autoRetired: retired,
    activeWatchlistTotal: activeTotal,
    setsWithScanCoverage: setsWithCoverage,
    tookMs: Date.now() - started,
  });
}
