import { unstable_cache } from "next/cache";
import { supabase } from "@/lib/supabaseClient";

// GEO audit 2026-09-19 - the listing integrity report (/integrity).
//
// Real counts from the live `deals` table, nothing modelled: how many
// listings are currently active and shown, how many active rows are
// withheld and for which recorded reason (`disqualified_reason`, the
// audit-trail string lib/dealQuality writes), how many listings were
// checked in the last 24 hours and - once supabase/integrity_migration.sql
// has run and the trigger stamps `deactivated_at` - how many stopped
// being shown in that window. Rebuilt on a 6-hour cache; the page prints
// the build time.
//
// The pure half (labels, family lookup, grouping) lives in
// lib/integrityReasons.js so it can be unit-tested without a database.
import { groupReasons } from "@/lib/integrityReasons";
export { REASON_LABELS, reasonFamily, groupReasons } from "@/lib/integrityReasons";

const REVALIDATE_SECONDS = 6 * 3600;
const PAGE = 1000;
const DAY_MS = 24 * 3600 * 1000;
export const MARKETPLACES = Object.freeze(["eBay US", "eBay UK", "eBay Australia", "eBay Canada", "eBay Germany", "eBay Italy"]);

async function countWhere(build) {
  const { count, error } = await build(supabase.from("deals").select("id", { count: "exact", head: true }));
  if (error) throw new Error(error.message);
  return count ?? 0;
}

// null (not 0) when the column is absent - the page then says nothing
// about it rather than print a false zero.
async function countStopped(since24h) {
  const { count, error } = await supabase
    .from("deals")
    .select("id", { count: "exact", head: true })
    .eq("is_active", false)
    .gte("deactivated_at", since24h);
  if (error) return null;
  return count ?? 0;
}

async function readWithheldReasons() {
  const out = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("deals")
      .select("disqualified_reason")
      .eq("is_active", true)
      .not("disqualified_reason", "is", null)
      .order("id", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    for (const row of data ?? []) out.push(row.disqualified_reason);
    if (!data || data.length < PAGE) break;
  }
  return out;
}

// Uncached: the cron snapshot calls this directly so a day's row is never
// a stale cache read.
export async function computeIntegrityReport(now = Date.now()) {
  const since24h = new Date(now - DAY_MS).toISOString();
  try {
    const [activeShown, withheldReasons, checked24h, stopped24h] = await Promise.all([
      countWhere((q) => q.eq("is_active", true).is("disqualified_reason", null)),
      readWithheldReasons(),
      countWhere((q) => q.gte("last_seen_at", since24h)),
      countStopped(since24h),
    ]);
    return {
      generatedAt: new Date(now).toISOString(),
      activeShown,
      withheldActive: withheldReasons.length,
      withheldByReason: groupReasons(withheldReasons),
      checked24h,
      stopped24h,
      marketplaces: [...MARKETPLACES],
      error: null,
    };
  } catch (e) {
    return { generatedAt: new Date(now).toISOString(), activeShown: null, withheldActive: null, withheldByReason: [], checked24h: null, stopped24h: null, marketplaces: [], error: e.message };
  }
}

export function fetchIntegrityReport() {
  return unstable_cache(() => computeIntegrityReport(), ["integrity-report-v2"], { revalidate: REVALIDATE_SECONDS })();
}

// The daily series (integrity_snapshots, written by /api/integrity-
// snapshot). [] until the migration has run - the page then shows no
// history section, never an empty chart.
async function fetchIntegrityHistoryUncached(days = 30) {
  const { data, error } = await supabase
    .from("integrity_snapshots")
    .select("day, generated_at, active_shown, withheld_active, checked_24h, stopped_24h, withheld_by_reason")
    .order("day", { ascending: false })
    .limit(days);
  if (error) return [];
  return (data ?? []).reverse();
}

export function fetchIntegrityHistory(days = 30) {
  return unstable_cache(() => fetchIntegrityHistoryUncached(days), ["integrity-history-v1", String(days)], { revalidate: REVALIDATE_SECONDS })();
}
