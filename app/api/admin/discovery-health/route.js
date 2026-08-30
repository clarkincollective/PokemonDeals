import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getBrowseRateLimit } from "@/lib/ebay";
import { discoveryHealthReport } from "@/lib/discoveryHealth";

// Phase 2.5 - read-only operational health of the external discovery
// pipeline. Auth: the same CRON_SECRET bearer the cron routes use. No
// public UI; this never writes. Distinct from /api/admin/discovery-report
// (that's the Phase 3 gap analysis).
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request) {
  if (request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const report = await discoveryHealthReport(supabaseAdmin(), { getBrowseRateLimit });
    return Response.json(report);
  } catch (err) {
    return Response.json({ error: err.message }, { status: 200 });
  }
}
