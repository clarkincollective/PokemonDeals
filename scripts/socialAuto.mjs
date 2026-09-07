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
import { resolveLiveSocialGates, submitAutonomousBatch } from "../lib/autonomous/socialPublish.mjs";
import { saveCircuit, recordFailure } from "../lib/autonomous/runState.mjs";
import { loadSourceSnapshot } from "./socialSource.mjs";
import { loadLedger, saveLedger } from "../lib/social/distribution/ledger.mjs";
import { loadBatches, saveBatches, findBatch } from "../lib/social/distribution/batch.mjs";
import { readFileSync } from "node:fs";
import path from "node:path";

function loadChannels() {
  try {
    return JSON.parse(readFileSync(path.join(process.cwd(), "lib", "social", "distribution", "channels.json"), "utf8"));
  } catch {
    return [];
  }
}
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

  // ---- 11-13. LIVE submission (AUTO-2 - wired, but multi-gated) ----
  // The provider submit runs ONLY when: mode LIVE + all content gates
  // green + resolveLiveSocialGates().ok (which re-checks the AUTO flags,
  // the 4 existing publish controls, provider auth, and the circuit) +
  // an already autonomous-approved batch exists for this content_id.
  const liveGate = resolveLiveSocialGates({ env: process.env, posture, circuit });
  if (mode === "LIVE" && once && allGreen && liveGate.ok) {
    const batches = loadBatches();
    const batch = batches.find((b) => b.content_id === pick.candidate.content_id && (b.status === "APPROVED" || b.status === "PARTIAL_SUCCESS") && b.owner_approved_by === "SYSTEM_AUTONOMOUS");
    if (!batch) {
      run.skip_reasons.push("no autonomous-approved batch for this content_id yet - render + host + autonomous-approve it first (social:publish prepare-batch, then a --once render cycle)");
      finishRun(run, "NO_CONTENT");
      line("\n  HELD: gates green but no autonomous-approved batch exists to submit. No Buffer call.\n");
    } else {
      const ledgerRows = loadLedger();
      const out = await submitAutonomousBatch({ batch, ledger: ledgerRows, channels: loadChannels(), env: process.env });
      saveLedger(ledgerRows);
      saveBatches(batches);
      run.submitted = out.results.filter((r) => r.outcome === "QUEUED").map((r) => r.platform);
      run.queued = run.submitted;
      run.failed = out.results.filter((r) => r.outcome === "FAILED" || r.outcome === "BLOCKED").map((r) => r.platform);
      run.provider_errors = out.providerErrors ?? [];
      for (const r of out.results) if (r.providerRef) run.planned_placements.push({ platform: r.platform, provider_ref: r.providerRef, outcome: r.outcome });
      // circuit: record failures / trim on a clean pass
      let c2 = circuit;
      for (const e of out.providerErrors ?? []) c2 = recordFailure(c2, { reason: "buffer_submit_failed", detail: e });
      if ((out.providerErrors ?? []).length === 0) c2 = recordSuccess(c2);
      saveCircuit("social", c2);
      run.circuit_state = c2.state;
      finishRun(run, out.verdict === "PARTIAL_SUCCESS" ? "PARTIAL_SUCCESS" : out.verdict === "ALL_QUEUED" ? "PUBLISHED" : "ERROR");
      line(`\n  SUBMITTED: ${out.verdict}`);
      for (const r of out.results) line(`    ${r.platform}: ${r.outcome}${r.providerRef ? ` ref ${r.providerRef}` : ""}${r.reason ? ` (${r.reason})` : ""}`);
      line("  QUEUED != PUBLISHED - confirm with: npm run social:publish -- sync-batch " + batch.batch_id + "\n");
    }
  } else {
    if (mode === "LIVE" && once && allGreen && !liveGate.ok) run.skip_reasons.push(...liveGate.blockers);
    finishRun(run, allGreen ? "DRY_RUN_OK" : "NO_CONTENT");
    line(`\n  ${allGreen && liveGate.ok ? "READY: would submit (no batch yet)." : allGreen ? "DRY RUN: content gates green; live gates blocked -> " + liveGate.blockers.join("; ") : "HELD: one or more content gates blocked."}\n`);
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
