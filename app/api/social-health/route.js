// SOCIAL-LIVE-3 - every 2 h: reconcile queued social posts from provider
// evidence, verify sent posts are publicly visible on the right accounts,
// flag stuck submits / failures / empty slots in the next 24 h, and email
// the owner (Resend -> SOCIAL_ALERT_EMAIL, debounced 12 h per issue set).

import { runSocialHealth, ownerAlert } from "@/lib/social/autopilot/ops.mjs";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET(request) {
  if (request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const report = await runSocialHealth();
    if (report.alerts.length) report.alert = await ownerAlert({ subject: `health: ${report.alerts.length} issue(s)`, lines: report.alerts });
    return Response.json({ route: "social-health", ...report });
  } catch (e) {
    const detail = String(e?.message ?? e).slice(0, 300);
    const alert = await ownerAlert({ subject: "health route error", lines: [detail] }).catch(() => null);
    return Response.json({ ok: false, outcome: "ERROR", error: detail, alert }, { status: 200 });
  }
}
