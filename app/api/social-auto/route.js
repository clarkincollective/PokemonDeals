import { resolveSocialPosture } from "@/lib/autonomous/config";
import { loadCircuit, isTripped, effectiveMode } from "@/lib/autonomous/runState";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Phase AUTO-1 - protected autonomous-social cron endpoint.
//
// The Vercel cron (see docs/autonomous-social-email.md - NOT added to
// vercel.json in AUTO-1) would call this hourly. The endpoint verifies
// EVERY flag itself: cron presence alone can never enable autonomy (§34).
//
// In AUTO-1 this endpoint NEVER mutates a provider. Even when the posture
// resolves LIVE it returns a decision summary only - the actual Buffer
// submit stays a separate, 6-flag-gated owner step (social:publish
// send-batch). It exists now so the cron wiring is ready and provably
// inert.
export async function GET(request) {
  if (request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const posture = resolveSocialPosture(process.env, { requestLive: true });
  const circuit = loadCircuit("social");
  const mode = effectiveMode(posture.mode, circuit);

  if (mode !== "LIVE") {
    return Response.json({
      ok: true,
      skipped: mode === "SUSPENDED" ? (isTripped(circuit) ? "circuit_auto_suspended" : "kill_switch") : mode === "OFF" ? "autonomous_disabled" : "dry_run_stage",
      mode,
      stage: posture.stageId,
      circuit: circuit.state,
    });
  }

  // AUTO-1: the provider mutation is intentionally not wired here.
  return Response.json({
    ok: true,
    skipped: "auto1_no_provider_mutation",
    note: "posture is LIVE but AUTO-1 does not perform the Buffer submit from this endpoint",
    mode,
    stage: posture.stageId,
    max_content_per_day: posture.maxContentPerDay,
  });
}
