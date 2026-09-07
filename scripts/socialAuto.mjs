#!/usr/bin/env node
// Phase AUTO-1 - AUTONOMOUS SOCIAL ORCHESTRATION CLI.
//
//   npm run social:auto -- --dry-run   (default) plan only, no mutation
//   npm run social:auto -- --once      plan one cycle; mutate ONLY if the
//                                      resolved posture is LIVE + circuit CLOSED
//   npm run social:auto -- --live      request a live cycle (still refused
//                                      unless SOCIAL_AUTONOMOUS_ENABLED=true,
//                                      a mutating STAGE, and kill=false)
//
// DEFAULT IS DRY RUN. In dry-run this process cannot reach a provider:
// it never imports the Buffer client and never calls social:publish send.
//
// It reads the LIVE source snapshot (scripts/socialSource - a Supabase
// read, NO eBay Browse call) + the local ledger / batches / cooldown
// history. If there is no fresh live snapshot, that is a successful
// "NO CONTENT" run - it does NOT fall back to a fixture.

import { existsSync } from "node:fs";
import { config as loadDotenv } from "dotenv";
if (existsSync(".env.local")) loadDotenv({ path: ".env.local", quiet: true });
else loadDotenv({ quiet: true });

import { resolveSocialPosture, describePosture } from "../lib/autonomous/config.mjs";
import { newRun, finishRun, appendRun, lastRun, loadCircuit, isTripped, effectiveMode } from "../lib/autonomous/runState.mjs";
import { selectAutonomousCandidate, stageCapCheck, cadenceCheck, firstLiveDealSafe, preSendRevalidate } from "../lib/autonomous/socialAuto.mjs";
import { loadSourceSnapshot } from "./socialSource.mjs";
import { loadLedger } from "../lib/social/distribution/ledger.mjs";
import { loadBatches } from "../lib/social/distribution/batch.mjs";
import { loadPostHistory, buildCooldownKeys, COOLDOWN_WINDOW_HOURS } from "../lib/social/cooldown.mjs";
import { SOCIAL_FRESHNESS_MAX_AGE_HOURS } from "../lib/social/eligibility.mjs";

const args = process.argv.slice(2);
const wantLive = args.includes("--live");
const once = args.includes("--once") || wantLive;
const jsonOut = args.includes("--json");

function line(s = "") { if (!jsonOut) console.log(s); }

async function main() {
  const posture = resolveSocialPosture(process.env, { requestLive: wantLive });
  const circuit = loadCircuit("social");
  const mode = effectiveMode(posture.mode, circuit);
  const run = newRun({ surface: "social", mode, requestLive: wantLive });
  run.circuit_state = circuit.state;

  line("\n  === SOCIAL AUTONOMOUS ORCHESTRATION (AUTO-1) ===");
  line(`  ${describePosture(posture)}`);
  line(`  circuit: ${circuit.state}${isTripped(circuit) ? ` (tripped ${circuit.tripped_at}: ${circuit.reason} - owner resume required)` : ""}`);
  line(`  effective mode: ${mode}${wantLive && mode !== "LIVE" ? "  (--live requested but not permitted - running as a plan only)" : ""}\n`);

  // ---- 1. load live eligible social source (no Browse call) ----
  const snap = loadSourceSnapshot();
  const isLive = snap && snap.source_is_live === true && !String(snap.source ?? "").toLowerCase().startsWith("fixture");
  if (!snap) {
    run.skip_reasons.push("no live source snapshot (run: npm run social:source -- live)");
    finishRun(run, "NO_CONTENT");
    appendRun("social", run);
    line("  NO CONTENT: no source snapshot on disk. Nothing rendered, nothing published. (successful run)\n");
    return report(run, posture, circuit, mode);
  }
  if (!isLive) {
    run.skip_reasons.push(`source snapshot is not live (source=${snap.source ?? "?"}) - autonomous mode never posts from a fixture / stale snapshot`);
    finishRun(run, "NO_CONTENT");
    appendRun("social", run);
    line(`  NO CONTENT: source snapshot is "${snap.source}", not live. Autonomous mode will not post from it.\n`);
    return report(run, posture, circuit, mode);
  }

  const candidates = Array.isArray(snap.candidates) ? snap.candidates : Array.isArray(snap.deals) ? snap.deals : [];
  run.eligible_candidates = candidates.length;
  line(`  live snapshot: ${snap.source}  captured ${snap.captured_at ?? snap.pulled_at ?? "?"}  (${candidates.length} candidate(s))`);

  // ---- 2-4. select an autonomous candidate (stricter than planner) ----
  const ledger = loadLedger();
  const history = loadPostHistory();
  const cooldownKeys = new Set();
  for (const h of history) for (const k of Object.values(h.keys ?? {})) if (k) cooldownKeys.add(k);
  const sel = selectAutonomousCandidate(candidates, { ledger, cooldownKeys, now: Date.now() });

  if (!sel.picked) {
    for (const c of sel.considered.slice(0, 6)) run.skip_reasons.push(`${c.candidate.content_id ?? c.candidate.card_name ?? "?"}: ${c.reasons.join("; ")}`);
    finishRun(run, "NO_CONTENT");
    appendRun("social", run);
    line(`  NO CONTENT: ${sel.considered.length} candidate(s) considered, 0 cleared the autonomous quality floor.`);
    for (const c of sel.considered.slice(0, 6)) line(`    - ${c.candidate.content_id ?? c.candidate.card_name ?? "?"} (${c.family}/${c.tier}): ${c.reasons.join("; ")}`);
    line("");
    return report(run, posture, circuit, mode);
  }

  const pick = sel.picked;
  run.selected_content_ids.push(pick.candidate.content_id ?? pick.candidate.id ?? "unknown");
  line(`\n  SELECTED: ${pick.candidate.content_id ?? pick.candidate.card_name}  family=${pick.family}  tier=${pick.tier}`);

  // ---- 5-7. first-live deal safety + would-render ----
  const dealSafe = firstLiveDealSafe(pick.candidate.snapshot ?? pick.candidate ?? {}, { maxAgeHours: SOCIAL_FRESHNESS_MAX_AGE_HOURS });
  if (!dealSafe.ok) {
    run.skipped.push(pick.candidate.content_id);
    run.skip_reasons.push(`first-live safety: ${dealSafe.blockers.join("; ")}`);
    finishRun(run, "NO_CONTENT");
    appendRun("social", run);
    line(`  SKIP: first-live deal safety failed - ${dealSafe.blockers.join("; ")}\n`);
    return report(run, posture, circuit, mode);
  }
  line("  first-live deal safety: PASS");
  run.rendered.push({ content_id: pick.candidate.content_id, would: "render + QA + host" });

  // ---- 9. cadence + 10. rollout stage cap ----
  const publishedTodayContentIds = ledgerContentIdsPublishedToday(ledger);
  const stage = stageCapCheck({ maxContentPerDay: posture.maxContentPerDay, publishedTodayContentIds, selectedContentId: pick.candidate.content_id });
  if (!stage.ok) run.skip_reasons.push(stage.reason);
  line(`  rollout stage: ${posture.stageId} - ${stage.ok ? `OK (${stage.wouldBeCount}/${stage.cap === Infinity ? "∞" : stage.cap} content items today)` : stage.reason}`);

  // ---- 8. pre-send revalidation (dry: against the snapshot itself) ----
  const fakeBatch = { frozen_facts: { listed_usd: pick.candidate.snapshot?.listed_usd ?? pick.candidate.listed_usd, market_price: pick.candidate.snapshot?.market_price ?? pick.candidate.market_price, discount_pct: pick.candidate.snapshot?.discount_pct ?? pick.candidate.discount_pct }, source_captured_at: snap.captured_at ?? snap.pulled_at, placements: [] };
  const reval = preSendRevalidate(fakeBatch, { ...(pick.candidate.snapshot ?? pick.candidate), source_is_live: true, source_captured_at: snap.captured_at ?? snap.pulled_at }, { maxAgeHours: SOCIAL_FRESHNESS_MAX_AGE_HOURS });
  line(`  pre-send revalidation: ${reval.verdict}${reval.blockers.length ? ` - ${reval.blockers.join("; ")}` : ""}`);

  // ---- 11-13. would submit? ----
  const allGreen = dealSafe.ok && stage.ok && reval.ok;
  run.planned_placements.push({ content_id: pick.candidate.content_id, platforms: "planner decides (IG/TikTok/X/YouTube subset)", note: "not resolved in AUTO-1 dry-run" });

  if (mode === "LIVE" && once && allGreen && posture.canMutateProviders && !isTripped(circuit)) {
    // AUTO-1 does NOT enable production sending. Even here, we STOP before
    // any provider mutation and record the intent - the actual submit is
    // wired to scripts/socialPublish send-batch, which is a separate
    // owner-run, 6-flag-gated step. This branch is unreachable in AUTO-1
    // because the posture flags are OFF by default.
    run.skip_reasons.push("AUTO-1: provider submission is intentionally NOT wired in this phase - would hand off to social:publish send-batch");
    finishRun(run, "DRY_RUN_OK");
    line("\n  WOULD SUBMIT (all gates green) - but AUTO-1 does not wire the provider mutation. No Buffer call made.\n");
  } else {
    finishRun(run, allGreen ? "DRY_RUN_OK" : "NO_CONTENT");
    line(`\n  ${allGreen ? "DRY RUN: all gates green - this content WOULD be submitted in a LIVE run." : "HELD: one or more gates blocked - nothing would be submitted."}\n`);
  }
  appendRun("social", run);
  return report(run, posture, circuit, mode);
}

function ledgerContentIdsPublishedToday(ledger) {
  const dayStart = new Date(); dayStart.setUTCHours(0, 0, 0, 0);
  return [...new Set(ledger.filter((r) => ["QUEUED", "PUBLISHED"].includes(r.status) && Date.parse(r.queued_at ?? r.published_at ?? r.created_at ?? "") >= dayStart.getTime()).map((r) => r.content_id))];
}

function report(run, posture, circuit, mode) {
  if (jsonOut) {
    console.log(JSON.stringify({ run, posture, circuit: { state: circuit.state, tripped_at: circuit.tripped_at, reason: circuit.reason }, effective_mode: mode }, null, 2));
  } else {
    console.log(`  run ${run.run_id}  outcome=${run.outcome}  mode=${mode}`);
    console.log("  NOTHING was published or scheduled. No Buffer call. No eBay Browse call.\n");
  }
}

main().catch((e) => { console.error("\n  ✖ " + (e?.message ?? e) + "\n"); process.exit(1); });
