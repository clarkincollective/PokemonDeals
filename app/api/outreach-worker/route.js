// OUTREACH-AUTO-1 - scheduled outreach automation (Vercel cron, every 15 min).
// Handles incoming replies first, then the capped weekday first-contact queue.
// Inert unless OUTREACH_AUTOMATION_ENABLED=true, the durable pause is off and
// Instantly grants email access (paid plan + scoped key). ?dryRun=1 reports
// without writes or sends; ?check=1 returns capability booleans only.
// Replies are drafted with Claude through the Vercel AI Gateway using this
// deployment's OIDC token.

import { runOutreach } from "@/lib/outreach/automation/worker.mjs";
import { instantlyClient } from "@/lib/outreach/automation/instantly.mjs";
import { ownerAlert } from "@/lib/social/autopilot/ops.mjs";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request) {
  if (request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const url = new URL(request.url);
  const oidcToken = request.headers.get("x-vercel-oidc-token") || process.env.VERCEL_OIDC_TOKEN || null;
  if (url.searchParams.get("check") === "1") {
    const caps = await instantlyClient().capabilities({ eaccount: process.env.OUTREACH_FROM_EMAIL, campaign: process.env.INSTANTLY_CAMPAIGN_ID });
    return Response.json({
      automation_enabled: process.env.OUTREACH_AUTOMATION_ENABLED === "true",
      instantly_key_present: Boolean(process.env.INSTANTLY_API_KEY),
      campaign_id_present: Boolean(process.env.INSTANTLY_CAMPAIGN_ID),
      from_email_present: Boolean(process.env.OUTREACH_FROM_EMAIL),
      ai_gateway_oidc_present: Boolean(oidcToken),
      alert_recipient_configured: Boolean(process.env.SOCIAL_ALERT_EMAIL),
      instantly: caps,
    });
  }
  const alert = ({ subject, lines }) => ownerAlert({ subject, lines });
  try {
    const report = await runOutreach({ dryRun: url.searchParams.get("dryRun") === "1", oidcToken, alert });
    const failures = (report.blockers ?? []).filter((b) => /poll failed|pause/.test(b));
    if (failures.length && !report.dry_run) report.alert = await ownerAlert({ subject: "outreach automation problem", lines: failures });
    return Response.json({ route: "outreach-worker", ...report, capabilities: report.capabilities ? { ...report.capabilities } : null });
  } catch (e) {
    const detail = String(e?.message ?? e).slice(0, 300);
    const a = await ownerAlert({ subject: "outreach worker error", lines: [detail] }).catch(() => null);
    return Response.json({ ok: false, outcome: "ERROR", error: detail, alert: a });
  }
}
