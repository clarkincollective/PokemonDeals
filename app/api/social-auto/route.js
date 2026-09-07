import { resolveSocialPosture } from "@/lib/autonomous/config";
import { loadCircuit, isTripped, effectiveMode } from "@/lib/autonomous/runState";
import { resolveLiveSocialGates, submitAutonomousBatch } from "@/lib/autonomous/socialPublish";
import { loadBatches, saveBatches } from "@/lib/social/distribution/batch";
import { loadLedger, saveLedger } from "@/lib/social/distribution/ledger";
import { readFileSync } from "node:fs";
import path from "node:path";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

// Phase AUTO-2 - protected autonomous-social cron endpoint (hourly).
//
// The endpoint verifies EVERY flag itself - cron presence alone can never
// enable autonomy (§34). "Cron fires" means EVALUATE, never "force a
// post". No qualifying content -> exit cleanly.
//
// The endpoint does NOT render / QA / host (that needs headless Chrome +
// ffmpeg - a CLI / worker job, `npm run social:auto -- --once`). It only
// SUBMITS an already autonomous-approved batch. Provider truth model:
// createPost accepted -> ledger QUEUED (+ provider_ref); PUBLISHED comes
// only from a later sync on real send evidence.
function loadChannels() {
  try {
    return JSON.parse(readFileSync(path.join(process.cwd(), "lib", "social", "distribution", "channels.json"), "utf8"));
  } catch {
    return [];
  }
}

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

  const gate = resolveLiveSocialGates({ env: process.env, posture, circuit });
  if (!gate.ok) {
    return Response.json({ ok: true, skipped: "live_gates_blocked", blockers: gate.blockers, mode, stage: posture.stageId });
  }

  // Submit the oldest autonomous-approved, untampered batch (one per run;
  // STAGE_1 cap is enforced by socialAuto candidate selection at build
  // time - the endpoint never builds a batch).
  const batches = loadBatches();
  const batch = batches
    .filter((b) => (b.status === "APPROVED" || b.status === "PARTIAL_SUCCESS") && b.owner_approved_by === "SYSTEM_AUTONOMOUS")
    .sort((a, b) => Date.parse(a.owner_approved_at ?? 0) - Date.parse(b.owner_approved_at ?? 0))[0];
  if (!batch) {
    return Response.json({ ok: true, skipped: "no_autonomous_approved_batch", mode, stage: posture.stageId });
  }

  const ledger = loadLedger();
  const out = await submitAutonomousBatch({ batch, ledger, channels: loadChannels(), env: process.env });
  saveLedger(ledger);
  saveBatches(batches);
  return Response.json({
    ok: true,
    mode,
    stage: posture.stageId,
    batch_id: batch.batch_id,
    content_id: batch.content_id,
    verdict: out.verdict,
    results: out.results,
    note: "QUEUED != PUBLISHED - a later sync confirms",
  });
}
