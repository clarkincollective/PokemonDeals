import { unstable_cache } from "next/cache";
import { supabase } from "@/lib/supabaseClient";

// GEO audit 2026-09-19 - the listing integrity report (/integrity).
//
// Real counts from the live `deals` table, nothing modelled: how many
// listings are currently active and shown, how many active rows are
// withheld and for which recorded reason (`disqualified_reason`, the
// audit-trail string lib/dealQuality writes), how many listings were
// checked in the last 24 hours and how many stopped being shown in that
// window. Rebuilt on a 6-hour cache; the page prints the build time.
//
// A withheld row is one the scanner keeps but the site will not show; the
// reason string is grouped by its family (the part before the first ":")
// and mapped to a plain-English label. Families not in the map are still
// counted, under "other checks".

const REVALIDATE_SECONDS = 6 * 3600;
const PAGE = 1000;
const DAY_MS = 24 * 3600 * 1000;

// The pure half (labels, family lookup, grouping) lives in
// lib/integrityReasons.js so it can be unit-tested without a database.
import { groupReasons } from "@/lib/integrityReasons";
export { REASON_LABELS, reasonFamily, groupReasons } from "@/lib/integrityReasons";

async function countWhere(build) {
  const { count, error } = await build(supabase.from("deals").select("id", { count: "exact", head: true }));
  if (error) throw new Error(error.message);
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

async function fetchIntegrityReportUncached() {
  const now = Date.now();
  const since24h = new Date(now - DAY_MS).toISOString();
  try {
    const [activeShown, withheldReasons, checked24h, ended24h] = await Promise.all([
      countWhere((q) => q.eq("is_active", true).is("disqualified_reason", null)),
      readWithheldReasons(),
      countWhere((q) => q.gte("last_seen_at", since24h)),
      countWhere((q) => q.eq("is_active", false).gte("last_seen_at", since24h)),
    ]);
    return {
      generatedAt: new Date(now).toISOString(),
      activeShown,
      withheldActive: withheldReasons.length,
      withheldByReason: groupReasons(withheldReasons),
      checked24h,
      ended24h,
      marketplaces: ["eBay US", "eBay UK", "eBay Australia", "eBay Canada", "eBay Germany", "eBay Italy"],
      error: null,
    };
  } catch (e) {
    return { generatedAt: new Date(now).toISOString(), activeShown: null, withheldActive: null, withheldByReason: [], checked24h: null, ended24h: null, marketplaces: [], error: e.message };
  }
}

export function fetchIntegrityReport() {
  return unstable_cache(fetchIntegrityReportUncached, ["integrity-report-v1"], { revalidate: REVALIDATE_SECONDS })();
}
