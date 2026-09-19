import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { computeIntegrityReport } from "@/lib/integrityReport";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Daily cron (vercel.json): write today's integrity counts to
// integrity_snapshots so /integrity can show the series. Aggregate counts
// only. Idempotent per UTC day (upsert on `day`). Until
// supabase/integrity_migration.sql has run the table is absent and this
// returns { skipped: "table_missing" } - no error, nothing written.
export async function GET(request) {
  if (request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const report = await computeIntegrityReport();
  if (report.error) return Response.json({ ok: false, error: report.error }, { status: 200 });
  const day = report.generatedAt.slice(0, 10);
  const row = {
    day,
    generated_at: report.generatedAt,
    active_shown: report.activeShown,
    withheld_active: report.withheldActive,
    checked_24h: report.checked24h,
    stopped_24h: report.stopped24h,
    withheld_by_reason: report.withheldByReason,
  };
  const { error } = await supabaseAdmin().from("integrity_snapshots").upsert(row, { onConflict: "day" });
  if (error) {
    if (/integrity_snapshots/.test(error.message)) return Response.json({ ok: true, skipped: "table_missing", day });
    return Response.json({ ok: false, error: error.message }, { status: 200 });
  }
  return Response.json({ ok: true, day, ...row });
}
