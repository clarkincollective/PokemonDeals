#!/usr/bin/env node
// Phase INFRA-DB-1 - `npm run infra:db-health`
//
// READ-ONLY Supabase pressure + deal-pool cache audit. It runs the exact
// cached-pool query, measures the serialised payload, and reports whether
// it fits under Next's ~2 MB data-cache entry ceiling (the thing that,
// when exceeded, silently disables caching and sends every request to
// Supabase). Also counts the newsroom tables and the inactive-deal
// backlog.
//
// It does NOT touch Postgres internals: pg_stat_statements, pg_indexes,
// pg_stat_activity and pg_stat_user_tables are not reachable through
// PostgREST (public schema only) and there is no exec_sql RPC on this
// project, so CPU / memory / connection / bloat metrics require the
// Supabase dashboard (Reports -> Database) or a SQL-editor run of
// supabase/infra_db_pressure_audit.sql. Those gaps are named explicitly.
//
// No secrets are printed.

import { existsSync } from "node:fs";
import { config as loadDotenv } from "dotenv";
if (existsSync(".env.local")) loadDotenv({ path: ".env.local", quiet: true });
else loadDotenv({ quiet: true });

import { createClient } from "@supabase/supabase-js";
import {
  DEAL_POOL_MAX_ROWS,
  DEAL_POOL_SELECT,
  POOL_ROW_FIELDS,
  slimPoolRow,
} from "../lib/dealPoolShape.mjs";
import { isDisplayableDeal } from "../lib/dealQuality.js";

const JSON_OUT = process.argv.includes("--json");
const log = (...a) => { if (!JSON_OUT) console.log(...a); };

const NEXT_CACHE_LIMIT = 2 * 1024 * 1024; // Next data-cache entry ceiling
const TARGET = 1.5 * 1024 * 1024; // INFRA-DB-1 headroom target
const POOL_REVALIDATE_SECONDS = 180;

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!url || !key) {
  console.error("infra:db-health: missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}
const db = createClient(url, key);
const mb = (n) => (n / 1048576).toFixed(2) + " MB";

(async () => {
  const out = { generated_at: new Date().toISOString() };

  // ---- 1. the deal pool, measured exactly -----------------------------
  const t0 = Date.now();
  const { data: raw, error } = await db
    .from("deals")
    .select(DEAL_POOL_SELECT)
    .eq("is_active", true)
    .eq("card_language", "english")
    .order("first_seen_at", { ascending: false })
    .limit(DEAL_POOL_MAX_ROWS);
  const queryMs = Date.now() - t0;
  if (error) { console.error("pool query failed:", error.message); process.exit(1); }

  const gated = (raw ?? []).filter(isDisplayableDeal).map((r) => slimPoolRow(r));
  const bytes = Buffer.byteLength(JSON.stringify(gated), "utf8");
  const rawBytes = Buffer.byteLength(JSON.stringify(raw ?? []), "utf8");
  const perRow = gated.length ? Math.round(bytes / gated.length) : 0;
  const cacheable = bytes < NEXT_CACHE_LIMIT;
  const withinTarget = bytes < TARGET;
  // projection to the row ceiling using the measured per-row average
  const atCeiling = perRow * DEAL_POOL_MAX_ROWS;

  out.deal_pool = {
    row_ceiling: DEAL_POOL_MAX_ROWS,
    rows_gated: gated.length,
    rows_fetched: raw?.length ?? 0,
    bytes,
    bytes_human: mb(bytes),
    bytes_per_row: perRow,
    projected_bytes_at_ceiling: atCeiling,
    projected_at_ceiling_human: mb(atCeiling),
    select_bytes_from_supabase: rawBytes,
    query_ms: queryMs,
    fields_stored: POOL_ROW_FIELDS.length + 1,
    cacheable_under_2mb: cacheable,
    within_1_5mb_target: withinTarget,
    verdict: !cacheable ? "OVER_2MB_NOT_CACHEABLE" : !withinTarget ? "CACHEABLE_LOW_HEADROOM" : "CACHEABLE_WITH_HEADROOM",
  };

  log("=== DEAL POOL (deals-pool-v2 / homepage-lanes-v2 grid) ===");
  log(`  rows: ${gated.length} gated / ${raw?.length ?? 0} fetched (ceiling ${DEAL_POOL_MAX_ROWS})`);
  log(`  serialised: ${mb(bytes)} (${perRow} B/row)  | at ceiling ~${mb(atCeiling)}`);
  log(`  supabase select payload: ${mb(rawBytes)}  | query ${queryMs} ms`);
  log(`  cacheable (<2MB): ${cacheable ? "YES" : "NO"}  | <=1.5MB target: ${withinTarget ? "YES" : "NO"}`);
  log(`  verdict: ${out.deal_pool.verdict}`);

  // ---- 2. deals table shape -----------------------------------------
  const [{ count: total }, { count: activeAll }, { count: activeEn }] = await Promise.all([
    db.from("deals").select("*", { count: "estimated", head: true }),
    db.from("deals").select("*", { count: "estimated", head: true }).eq("is_active", true),
    db.from("deals").select("*", { count: "estimated", head: true }).eq("is_active", true).eq("card_language", "english"),
  ]);
  out.deals_table = { total_est: total, active_all_est: activeAll, active_english_est: activeEn, inactive_backlog_est: (total ?? 0) - (activeAll ?? 0) };
  log("\n=== deals TABLE ===");
  log(`  ~${total} rows total | ~${activeAll} active | ~${activeEn} active English | ~${out.deals_table.inactive_backlog_est} inactive/expired retained`);

  // ---- 3. newsroom tables -----------------------------------------
  out.newsroom = {};
  for (const t of ["social_stories", "social_story_placements", "social_qa_runs"]) {
    const { count, error: e } = await db.from(t).select("*", { count: "exact", head: true });
    out.newsroom[t] = e ? `ERR ${e.message}` : count;
  }
  log("\n=== NEWSROOM TABLES ===");
  for (const [t, c] of Object.entries(out.newsroom)) log(`  ${t}: ${c}`);

  // ---- 4. estimated request-path DB reads for the pool -------------
  // With a 180s revalidate, one filter/country permutation forces at most
  // 1 pool query per 180s window = 480/day, regardless of traffic. The
  // homepage promo path adds fetchHomepageLanes (1 grid pool + 4 small
  // ranked pools) on the same 180s window.
  const windowsPerDay = Math.round(86400 / POOL_REVALIDATE_SECONDS);
  out.estimated_pool_reads_per_day = {
    per_cache_key_max: windowsPerDay,
    homepage_promo_default: windowsPerDay, // language+country=null key
    japanese_cards_default: windowsPerDay,
    note: "cron/scanner/verify/social reads are separate and NOT counted here",
  };
  log("\n=== ESTIMATED POOL DB READS / DAY (request path) ===");
  log(`  <= ${windowsPerDay} per distinct filter+country cache key (180s revalidate)`);
  log(`  homepage default + /japanese-cards default ~= ${windowsPerDay * 2} combined`);

  // ---- 5. what needs the owner dashboard -------------------------
  out.requires_owner_dashboard = [
    "CPU / memory / disk I/O utilisation (Supabase -> Reports -> Database)",
    "connection count + pooler saturation (Reports -> Database -> Connections)",
    "cache hit ratio, table/index sizes, bloat",
    "pg_stat_statements top queries by total_exec_time / calls / mean_exec_time",
    "EXPLAIN (ANALYZE, BUFFERS) for the pool + aggregate scans",
    "seq-scan counts per table (pg_stat_user_tables)",
    "which of supabase/seo_perf_indexes_migration.sql indexes are actually built",
  ];
  log("\n=== REQUIRES OWNER DASHBOARD / SQL EDITOR (not reachable via PostgREST) ===");
  for (const r of out.requires_owner_dashboard) log(`  - ${r}`);
  log("  -> run supabase/infra_db_pressure_audit.sql in the Supabase SQL editor");

  if (JSON_OUT) console.log(JSON.stringify(out, null, 2));
  process.exit(0);
})().catch((e) => { console.error("infra:db-health failed:", e?.stack || e?.message || e); process.exit(1); });
