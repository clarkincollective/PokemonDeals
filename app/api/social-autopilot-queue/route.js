// SOCIAL-LIVE-3 - hourly: queue rendered autopilot posts (AUTOPILOT_READY,
// produced by the GitHub render worker) into Buffer at their reserved slot
// times. Gates, identity checks and the crash-safe submit marker live in
// lib/social/autopilot/ops.mjs. ?dryRun=1 reports without provider writes;
// ?check=1 is a non-disclosing startup check (booleans only).

import channels from "@/lib/social/distribution/channels.json";
import { queueAutopilot, ownerAlert } from "@/lib/social/autopilot/ops.mjs";
import { getSocialProvider } from "@/lib/social/providers/index.mjs";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET(request) {
  if (request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const url = new URL(request.url);
  if (url.searchParams.get("check") === "1") {
    const lc = await getSocialProvider().listChannels();
    const usable = ["instagram_main", "x_main", "tiktok_main", "youtube_main"].filter((a) => lc.ok && lc.channels.some((c) => c.id === channels[a] && c.service === channels._channels[a].service && !c.locked && !c.disconnected));
    return Response.json({
      buffer_token_present: Boolean(process.env.BUFFER_ACCESS_TOKEN),
      buffer_channels_usable: usable.length,
      backlog_enabled: process.env.SOCIAL_BUFFER_BACKLOG_ENABLED === "true",
      backlog_mode_scheduled: process.env.SOCIAL_BUFFER_BACKLOG_MODE === "scheduled",
      kill_flag: process.env.SOCIAL_BUFFER_BACKLOG_KILL === "true",
      resend_configured: Boolean(process.env.RESEND_API_KEY && process.env.ALERT_FROM_EMAIL),
      alert_recipient_configured: Boolean(process.env.SOCIAL_ALERT_EMAIL),
      supabase_service_role_present: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
    });
  }
  if (url.searchParams.get("testAlert") === "1") {
    // one delivery test to the configured owner address (debounced 12 h)
    const alert = await ownerAlert({ subject: "alert route test", lines: ["This is a one-off test that social autopilot failure alerts reach you. No action needed."] });
    return Response.json({ route: "social-autopilot-queue", test_alert: alert });
  }
  if (url.searchParams.get("alertStatus")) {
    const id = url.searchParams.get("alertStatus");
    if (!/^[0-9a-f-]{16,64}$/i.test(id) || !process.env.RESEND_API_KEY) return Response.json({ ok: false }, { status: 400 });
    const r = await fetch(`https://api.resend.com/emails/${id}`, { headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}` } });
    const j = await r.json().catch(() => ({}));
    return Response.json({ ok: r.ok, last_event: j.last_event ?? null, created_at: j.created_at ?? null });
  }
  try {
    const report = await queueAutopilot({ channels, dryRun: url.searchParams.get("dryRun") === "1" });
    if (report.alerts.length && !report.dry_run) report.alert = await ownerAlert({ subject: `queue: ${report.alerts.length} issue(s)`, lines: report.alerts });
    return Response.json({ route: "social-autopilot-queue", ...report });
  } catch (e) {
    const detail = String(e?.message ?? e).slice(0, 300);
    const alert = await ownerAlert({ subject: "queue route error", lines: [detail] }).catch(() => null);
    return Response.json({ ok: false, outcome: "ERROR", error: detail, alert }, { status: 200 });
  }
}
