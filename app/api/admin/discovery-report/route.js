import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { discoveryReport } from "@/lib/discoveryAnalytics";

// Internal discovery-gap report (Phase 2, brief Step 14). Auth: the same
// CRON_SECRET bearer the cron routes use - there is no public admin UI and
// this data (external discovery source, internal analytics) must never be
// exposed to end users. ?days=1|7|30 (default 7).
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request) {
  if (request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const days = Math.min(90, Math.max(1, Number(new URL(request.url).searchParams.get("days")) || 7));

  try {
    const report = await discoveryReport(supabaseAdmin(), { days });
    return Response.json(report);
  } catch (err) {
    // discovery_events / the Phase 1 columns not migrated yet, etc.
    return Response.json(
      {
        error: err.message,
        hint:
          "Requires supabase/deals_feed_discovery_migration.sql and " +
          "supabase/discovery_analytics_migration.sql to be applied, plus " +
          "some ingest-feed runs to have happened.",
      },
      { status: 200 }
    );
  }
}
