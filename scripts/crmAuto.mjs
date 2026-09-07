#!/usr/bin/env node
// Phase AUTO-1 - AUTONOMOUS EMAIL DIGEST ORCHESTRATION CLI.
//
//   npm run crm:auto -- --dry-run   (default) decide only, no send
//   npm run crm:auto -- --once      one evaluation; send ONLY if the
//                                   resolved posture is LIVE + circuit CLOSED
//                                   + DIGEST_SEND_ENABLED + emailEnabled()
//   npm run crm:auto -- --live      request a live evaluation (still refused
//                                   unless EMAIL_AUTONOMOUS_ENABLED=true, a
//                                   mutating EMAIL_STAGE, and kill=false)
//
// DEFAULT IS DRY RUN. In dry-run this process never imports lib/email and
// never calls Resend. It reads the live DB read-only (digest deal set +
// subscriber status counts) and the persisted digest send history.
//
// EMAIL_AUTONOMOUS_ENABLED never enables social; SOCIAL_AUTONOMOUS_ENABLED
// never enables email. CRM capture / confirm / unsubscribe are unaffected
// by this command in every mode.

import { existsSync } from "node:fs";
import { config as loadDotenv } from "dotenv";
if (existsSync(".env.local")) loadDotenv({ path: ".env.local", quiet: true });
else loadDotenv({ quiet: true });

import { resolveEmailPosture, describePosture } from "../lib/autonomous/config.mjs";
import { newRun, finishRun, appendRun, loadCircuit, isTripped, effectiveMode, loadDigestHistory, appendDigestSend } from "../lib/autonomous/runState.mjs";
import { decideDigest, DIGEST_MIN_DEALS } from "../lib/autonomous/emailAuto.mjs";

const args = process.argv.slice(2);
const wantLive = args.includes("--live");
const once = args.includes("--once") || wantLive;
const jsonOut = args.includes("--json");
const line = (s = "") => { if (!jsonOut) console.log(s); };

function digestSendEnabled() {
  return String(process.env.DIGEST_SEND_ENABLED ?? "").trim().toLowerCase() === "true";
}
function emailEnabled() {
  return Boolean(process.env.RESEND_API_KEY && process.env.ALERT_FROM_EMAIL);
}

async function main() {
  const posture = resolveEmailPosture(process.env, { requestLive: wantLive });
  const circuit = loadCircuit("email");
  const mode = effectiveMode(posture.mode, circuit);
  const run = newRun({ surface: "email", mode, requestLive: wantLive });
  run.circuit_state = circuit.state;

  line("\n  === EMAIL AUTONOMOUS DIGEST ORCHESTRATION (AUTO-1) ===");
  line(`  ${describePosture(posture)}`);
  line(`  circuit: ${circuit.state}${isTripped(circuit) ? ` (tripped ${circuit.tripped_at}: ${circuit.reason} - owner resume required)` : ""}`);
  line(`  DIGEST_SEND_ENABLED=${digestSendEnabled()}  emailEnabled()=${emailEnabled()}`);
  line(`  effective mode: ${mode}\n`);

  // ---- live read-only DB: digest deals + subscriber status counts ----
  let candidates = [];
  let audienceRows = [];
  try {
    const { fetchDigestDeals } = await import("../lib/deals.js");
    const res = await fetchDigestDeals({ limit: 12 });
    candidates = res?.deals ?? [];
  } catch (e) {
    run.provider_errors.push(`digest deal read failed: ${String(e.message).slice(0, 120)}`);
  }
  try {
    const { supabaseAdmin } = await import("../lib/supabaseAdmin.js");
    const db = supabaseAdmin();
    // minimal rows only - status / confirmed / unsubscribed_at. NEVER email.
    const { data } = await db.from("newsletter_subscribers").select("status, confirmed, unsubscribed_at").limit(50000);
    audienceRows = data ?? [];
  } catch (e) {
    run.provider_errors.push(`subscriber read failed: ${String(e.message).slice(0, 120)}`);
  }

  const sentHistory = loadDigestHistory();
  const decision = decideDigest({
    candidates,
    audienceRows,
    sentHistory,
    maxDigestsPerWeek: posture.maxDigestsPerWeek,
    digestSendEnabled: digestSendEnabled(),
    emailEnabled: emailEnabled(),
    canMutateProviders: posture.canMutateProviders && !isTripped(circuit),
    now: Date.now(),
  });

  run.eligible_candidates = candidates.length;
  run.selected_content_ids = decision.selected_deal_ids;

  line(`  digest candidates (fetchDigestDeals, BIN-only): ${candidates.length}`);
  line(`  eligible after per-deal safety: ${decision.selected_count}  (need >= ${DIGEST_MIN_DEALS})`);
  if (decision.dropped.length) line(`  dropped: ${decision.dropped.map((d) => `#${d.id} (${d.blockers.join(",")})`).join("; ")}`);
  line(`  audience: ${decision.audience_count} ACTIVE/confirmed/subscribed  (excluded: ${JSON.stringify(decision.audience_excluded)})`);
  line(`  frequency: ${decision.frequency.ok ? `OK (${decision.frequency.sentThisWeek}/${decision.frequency.cap} this week)` : decision.frequency.reason}`);
  line(`  fingerprint: ${decision.fingerprint}`);
  line(`\n  DECISION: ${decision.decision}`);
  if (decision.blockers.length) for (const b of decision.blockers) line(`    blocker: ${b}`);
  if (decision.send_gates_blocking.length) for (const g of decision.send_gates_blocking) line(`    send gate (held): ${g}`);

  if (decision.decision === "SKIP") {
    run.skip_reasons = decision.blockers;
    finishRun(run, "NO_CONTENT");
  } else if (!decision.wouldSend) {
    run.skip_reasons = decision.send_gates_blocking;
    finishRun(run, "DRY_RUN_OK");
    line("\n  READY BUT HELD: content + audience pass, but a send gate is closed. No email sent.\n");
  } else {
    // AUTO-1 does NOT enable production sending. Even with every gate
    // green we STOP before Resend and record the intent only.
    run.skip_reasons.push("AUTO-1: Resend send is intentionally NOT wired in this phase");
    appendDigestSend({ fingerprint: decision.fingerprint, deal_ids: decision.selected_deal_ids, recipient_count: decision.audience_count, status: "DRY_RUN", created_at: new Date().toISOString() });
    finishRun(run, "DRY_RUN_OK");
    line("\n  WOULD SEND (all gates green) - but AUTO-1 does not wire the Resend send. No email sent.\n");
  }

  appendRun("email", run);
  if (jsonOut) console.log(JSON.stringify({ run, posture, decision, effective_mode: mode }, null, 2));
  else {
    console.log(`  run ${run.run_id}  outcome=${run.outcome}  mode=${mode}`);
    console.log("  NO marketing email sent. No Resend call. No eBay Browse call.\n");
  }
}

main().catch((e) => { console.error("\n  ✖ " + (e?.message ?? e) + "\n"); process.exit(1); });
