import { resolveEmailPosture } from "@/lib/autonomous/config";
import { loadCircuit, isTripped, effectiveMode, loadDigestHistory, appendDigestSend, saveCircuit, recordFailure, recordSuccess } from "@/lib/autonomous/runState";
import { decideDigest, selectDigestDeals, preSendRevalidateDigest, selectDigestAudience, DIGEST_MIN_DEALS } from "@/lib/autonomous/emailAuto";
import { resolveLiveEmailGates, sendAutonomousDigest } from "@/lib/autonomous/emailSend";
import { fetchDigestDeals } from "@/lib/deals";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Phase AUTO-2 - protected autonomous-email cron endpoint (~2x/week).
//
// "Cron fires" means "evaluate whether a digest should exist", never
// "must send an email" (§28). Verifies EVERY flag itself (§34). Still
// under the CRM-1B DIGEST_SEND_ENABLED kill switch and emailEnabled().
// Independent of SOCIAL_AUTONOMOUS_*.
export async function GET(request) {
  if (request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const posture = resolveEmailPosture(process.env, { requestLive: true });
  const circuit = loadCircuit("email");
  const mode = effectiveMode(posture.mode, circuit);

  if (mode !== "LIVE") {
    return Response.json({
      ok: true,
      skipped: mode === "SUSPENDED" ? (isTripped(circuit) ? "circuit_auto_suspended" : "kill_switch") : mode === "OFF" ? "autonomous_disabled" : "dry_run_stage",
      mode,
      stage: posture.stageId,
    });
  }
  const gate = resolveLiveEmailGates({ env: process.env, posture, circuit });
  if (!gate.ok) return Response.json({ ok: true, skipped: "live_gates_blocked", blockers: gate.blockers, mode });

  const db = supabaseAdmin();

  // --- Supabase-persisted weekly guard (survives Vercel's ephemeral FS;
  // reuses the same catalog_snapshot/digest_state row as /api/send-digest).
  // STAGE_1 = 1/week -> a ~6-day floor between autonomous digests.
  const { data: state } = await db.from("catalog_snapshot").select("data").eq("kind", "digest_state").maybeSingle();
  const lastSentAt = state?.data?.lastSentAt ? new Date(state.data.lastSentAt).getTime() : 0;
  const floorDays = posture.maxDigestsPerWeek >= 2 ? 3 : 6;
  if (Date.now() - lastSentAt < floorDays * 24 * 60 * 60 * 1000) {
    return Response.json({ ok: true, skipped: "sent_recently", lastSentAt: state?.data?.lastSentAt, floor_days: floorDays, mode });
  }

  // --- evaluate ---
  const { deals: candidates = [] } = (await fetchDigestDeals({ limit: 12 }).catch(() => ({ deals: [] }))) ?? {};
  const { data: audRows } = await db.from("newsletter_subscribers").select("email, token, status, confirmed, unsubscribed_at").eq("confirmed", true).is("unsubscribed_at", null);
  const decision = decideDigest({
    candidates,
    audienceRows: audRows ?? [],
    sentHistory: loadDigestHistory(),
    maxDigestsPerWeek: posture.maxDigestsPerWeek,
    digestSendEnabled: true,
    emailEnabled: true,
    canMutateProviders: true,
  });
  if (decision.decision === "SKIP") {
    return Response.json({ ok: true, skipped: "no_digest", reason: decision.blockers, mode });
  }

  // --- pre-send revalidation ---
  const freshSel = selectDigestDeals(candidates, {});
  const reval = preSendRevalidateDigest(freshSel.deals, new Map(freshSel.deals.map((d) => [d.id, d])), {});
  if (reval.verdict !== "SEND") {
    return Response.json({ ok: true, skipped: "cancelled_at_presend", items_left: reval.count, min: DIGEST_MIN_DEALS, mode });
  }
  const audience = selectDigestAudience(audRows ?? []).audience;
  if (audience.length === 0) {
    return Response.json({ ok: true, skipped: "NO_ACTIVE_SUBSCRIBERS", mode });
  }

  // --- send ---
  const out = await sendAutonomousDigest({ items: reval.items, subscribers: audience, preset: "weekly" });
  let c2 = circuit;
  c2 = out.ok ? recordSuccess(c2) : recordFailure(c2, { reason: "resend_send", detail: out.reason ?? out.verdict });
  saveCircuit("email", c2);
  appendDigestSend({
    fingerprint: decision.fingerprint,
    deal_ids: reval.items.map((d) => d.id),
    recipient_count: audience.length,
    sent_at: out.sent_at ?? null,
    status: out.verdict === "SENT" ? "SENT" : out.verdict === "PARTIAL" ? "PARTIAL" : out.verdict === "FAILED" ? "FAILED" : "UNCERTAIN",
    created_at: new Date().toISOString(),
  });
  if (out.sent > 0) {
    await db.from("catalog_snapshot").upsert(
      { kind: "digest_state", data: { lastSentAt: out.sent_at ?? new Date().toISOString(), recipients: out.sent, failed: out.failed, deals: reval.items.length, via: "crm-auto" }, updated_at: new Date().toISOString() },
      { onConflict: "kind" }
    );
  }
  return Response.json({ ok: true, mode, verdict: out.verdict, sent: out.sent, failed: out.failed, recipients: audience.length, circuit: c2.state });
}
