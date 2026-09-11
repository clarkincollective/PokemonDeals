// Phase SOCIAL-NEWSROOM-3 - protected PLANNED-BACKLOG refill endpoint
// (SS31-SS34). Separate from /api/social-auto (the live/fresh path).
//
// This route runs ONLY the Vercel-safe stage: queue the already-rendered /
// QA'd / consensus-passed BUFFER_READY placements through Buffer in
// SCHEDULED mode, then reconcile. It does NOT render / QA / host - that
// needs headless Chrome and runs first via
// `npm run social:backlog -- --refill` on a committing machine (the same
// split /api/social-auto uses).
//
// Every flag is verified here: a cron firing means EVALUATE, never "force
// a post". With SOCIAL_BUFFER_BACKLOG_ENABLED unset the route is inert.
//
// STAGE-B CONTAINMENT (2026-09-11) - gate order, all before any provider
// or lock activity:
//   1. CRON_SECRET
//   2. SOCIAL_BUFFER_BACKLOG_KILL (env; NOTE: a Vercel env change only
//      reaches a NEW deployment - it does not alter the running one)
//   3. durable circuit (Supabase-backed; owner suspend / auto trip survive
//      every invocation and redeploy, and an unreadable state fails closed)
//   4. advisory lock
//   5. refillQueueReconcile, which re-checks 2 + 3 + the enable/mode gates.

import { refillQueueReconcile } from "@/lib/newsroom/backlogRefill";
import { acquireRefillLock, releaseRefillLock } from "@/lib/social/newsroom/db";
import { backlogCircuitStatus } from "@/lib/social/newsroom/backlogCircuit";
import { resolveBacklogPosture } from "@/lib/social/newsroom/backlogConfig";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

async function handle(request) {
  if (request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const dryRun = url.searchParams.get("dryRun") === "1" || process.env.SOCIAL_BUFFER_BACKLOG_ENABLED !== "true";

  // Kill flag first - cheapest, no I/O.
  const posture = resolveBacklogPosture(process.env, { requestQueue: !dryRun });
  if (posture.kill) {
    return Response.json({ ok: false, outcome: "KILLED", posture }, { status: 200 });
  }

  const circuit = await backlogCircuitStatus();
  if (circuit.suspended) {
    return Response.json({ ok: false, outcome: "BACKLOG_SUSPENDED", circuit }, { status: 200 });
  }

  // SS34 - advisory lock so a manual CLI refill + this cron can't overlap
  const lock = await acquireRefillLock({ holder: "cron" });
  if (!lock.acquired) {
    return Response.json({ ok: false, outcome: lock.reason ?? "LOCK_UNAVAILABLE", lock }, { status: 200 });
  }
  try {
    const report = await refillQueueReconcile({ dryRun, initial: true });
    return Response.json({ route: "social-backlog-refill", ...report }, { status: 200 });
  } catch (e) {
    return Response.json({ ok: false, outcome: "REFILL_ERROR", error: String(e?.message ?? e).slice(0, 300) }, { status: 200 });
  } finally {
    await releaseRefillLock({ holder: "cron" });
  }
}

export async function GET(request) { return handle(request); }
export async function POST(request) { return handle(request); }
