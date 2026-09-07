import { resolveEmailPosture } from "@/lib/autonomous/config";
import { loadCircuit, isTripped, effectiveMode } from "@/lib/autonomous/runState";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Phase AUTO-1 - protected autonomous-email cron endpoint.
//
// The Vercel cron (see docs/autonomous-social-email.md - NOT added to
// vercel.json in AUTO-1) would call this ~1-2x/week. "Cron fires" means
// "evaluate whether a digest should exist", never "must send an email"
// (§28). The endpoint verifies EVERY flag itself (§34).
//
// In AUTO-1 this endpoint NEVER calls Resend. Independent of
// SOCIAL_AUTONOMOUS_*. It also still sits under the CRM-1B
// DIGEST_SEND_ENABLED kill switch and emailEnabled().
export async function GET(request) {
  if (request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const posture = resolveEmailPosture(process.env, { requestLive: true });
  const circuit = loadCircuit("email");
  const mode = effectiveMode(posture.mode, circuit);
  const digestSendEnabled = String(process.env.DIGEST_SEND_ENABLED ?? "").trim().toLowerCase() === "true";
  const emailEnabled = Boolean(process.env.RESEND_API_KEY && process.env.ALERT_FROM_EMAIL);

  if (mode !== "LIVE") {
    return Response.json({
      ok: true,
      skipped: mode === "SUSPENDED" ? (isTripped(circuit) ? "circuit_auto_suspended" : "kill_switch") : mode === "OFF" ? "autonomous_disabled" : "dry_run_stage",
      mode,
      stage: posture.stageId,
      circuit: circuit.state,
    });
  }
  if (!emailEnabled) return Response.json({ ok: true, skipped: "email_disabled", mode });
  if (!digestSendEnabled) return Response.json({ ok: true, skipped: "digest_send_disabled", mode });

  // AUTO-1: the Resend send is intentionally not wired here.
  return Response.json({
    ok: true,
    skipped: "auto1_no_resend_send",
    note: "posture is LIVE but AUTO-1 does not perform the Resend send from this endpoint",
    mode,
    stage: posture.stageId,
    max_digests_per_week: posture.maxDigestsPerWeek,
  });
}
