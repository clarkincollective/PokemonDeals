// Phase SOCIAL-NEWSROOM-3 - PLANNED-BACKLOG REFILL: the QUEUE + RECONCILE
// stage, shared by `npm run social:backlog -- --refill` and
// /api/social-backlog-refill (SS32 - one implementation, no fork).
//
// This module does NOT render / QA / host - that needs headless Chrome and
// runs in the CLI before this stage (the same split social-auto uses).
// It takes the persisted BUFFER_READY placements (already rendered, QA'd,
// consensus-passed offline), curates a small diverse batch, and schedules
// it through Buffer in SCHEDULED mode via the existing scheduleOne().
//
// Every guardrail is enforced here, fail-closed:
//   SS2   SOCIAL_BUFFER_BACKLOG_ENABLED gate (resolveBacklogPosture)
//   SS5   Instagram + X only
//   SS6   MANUAL_ONLY never queues; CONDITIONAL needs artifact consensus
//   SS7   artifactQueueEligible: exact hash, latest STACK PASS, latest
//         consensus PASS under policy 3c.1, 0 FAIL
//   SS12  initial horizon caps (IG 3-5d, X 2-3d)
//   SS14  deal_hero uses a NEAR-TERM slot only, shelf-life must cover it
//   SS15  three_up: story must still be publishable at the scheduled time
//   SS19  FEED_PASS over the curated batch + the next 12
//   SS20  the staged consensus already ran offline; not re-run here
//   SS21  scheduled mode -> provider BUFFER_QUEUED, never PUBLISHED
//   SS22  idempotent: never re-queue a placement with a provider ref
//   SS23  reconcile every queued placement; drift -> flag + suspend
//   SS24  backlog circuit
//   SS9   cost accounting is a passthrough (calls happened offline)

import {
  scheduleOne, reconcileOne, queuedContentStale, resolveProviderMode, buildProviderMessage,
} from "./bufferBacklog.mjs";
import { resolveBacklogPosture } from "../social/newsroom/backlogConfig.mjs";
import {
  loadBacklogCircuit, noteBacklogFailure, noteBacklogSuccess, backlogCircuitStatus,
} from "../social/newsroom/backlogCircuit.mjs";
import {
  loadPlacements, loadStories, patchPlacement, recordQaRun, getPlacement,
  artifactQueueEligible,
} from "../social/newsroom/db.mjs";
import { familyStatusFor, VISUAL_REVIEW_POLICY_VERSION } from "../social/newsroom/cardLayoutStatus.mjs";
import { refillConsiderable, EDITORIAL_REFILL_PLATFORMS, INITIAL_HORIZON_DAYS } from "../social/newsroom/refill.mjs";
import { feedReview } from "../social/newsroom/feedReview.mjs";
import { getSocialProvider } from "../social/providers/index.mjs";
// SOCIAL-NEWSROOM-14C: reuse the EXISTING failure taxonomy from the other
// (bufferHandoff.mjs) submit path rather than inventing a second one -
// "network/unknown outcome -> never blind-retry" is the same rule either
// path needs.
import { classifyProviderFailure, retryPolicyFor } from "../autonomous/bufferHandoff.mjs";

const COMMERCIAL_SERIES = new Set(["DEAL_DROP", "THREE_UNDER_25"]);
const NEAR_TERM_HOURS = 30; // SS14 - a deal_hero may only sit this far out

// Brisbane (UTC+10, no DST) editorial windows -> UTC ISO for `dueAt`.
function brisbaneSlotUtc(dayOffset, hourLocal, now = Date.now()) {
  const d = new Date(now + dayOffset * 86_400_000);
  // shift to Brisbane, set the local hour, shift back to UTC
  const bris = new Date(d.getTime() + 10 * 3_600_000);
  bris.setUTCHours(hourLocal, 0, 0, 0);
  return new Date(bris.getTime() - 10 * 3_600_000).toISOString();
}

// Build a small ordered list of future slots per platform (SS18 - spread
// naturally, no manufactured multi-post days).
function slotsFor(platform, count, now = Date.now()) {
  const hours = platform === "x" ? [8, 16] : [10]; // X twice/day, IG once/day
  const out = [];
  let day = 1;
  while (out.length < count && day <= 14) {
    for (const h of hours) {
      if (out.length >= count) break;
      out.push(brisbaneSlotUtc(day, h, now));
    }
    day += 1;
  }
  return out;
}

// The shared QUEUE + RECONCILE run.
// opts: { dryRun (default true), initial (default true), platforms, env, now, provider }
export async function refillQueueReconcile(opts = {}) {
  const {
    dryRun = true, initial = true,
    platforms = EDITORIAL_REFILL_PLATFORMS,
    env = process.env, now = Date.now(), provider = null,
  } = opts;

  const report = {
    ok: true, dry_run: dryRun, initial, policy_version: VISUAL_REVIEW_POLICY_VERSION,
    started_at: new Date(now).toISOString(),
    posture: null, circuit: null,
    candidates_considered: 0, curated: 0,
    queued: [], skipped: [], reconciled: [],
    feed_verdict: null, commercial_share: null,
    cost: { visual_review_calls_this_run: 0, note: "render + QA + staged consensus ran offline before this stage" },
    outcome: null,
  };

  // SS24 - circuit. STAGE-B CONTAINMENT: durable (Supabase-backed) and
  // fail-closed - an unreadable state suspends.
  const circuit = await backlogCircuitStatus();
  report.circuit = circuit;
  if (circuit.suspended) { report.ok = false; report.outcome = "BACKLOG_SUSPENDED"; return report; }

  // SS2 - the enable gate. dryRun never needs it; a real queue does.
  const posture = resolveBacklogPosture(env, { requestQueue: !dryRun });
  report.posture = posture;
  const mode = resolveProviderMode(env); // "scheduled" for recurring refill
  if (!dryRun && !posture.canQueueProvider) { report.ok = false; report.outcome = `NOT_ENABLED: ${posture.reason}`; return report; }
  if (!dryRun && mode !== "scheduled") { report.ok = false; report.outcome = `WRONG_MODE: SOCIAL_BUFFER_BACKLOG_MODE must be "scheduled" (got "${mode}")`; return report; }

  // channels
  let channelByService = {};
  if (!dryRun) {
    const prov = provider ?? getSocialProvider(env);
    const ch = await prov.listChannels?.();
    if (!ch?.ok) { report.ok = false; report.outcome = `CHANNELS_UNAVAILABLE: ${ch?.reason ?? "listChannels failed"}`; return report; }
    for (const c of ch.channels ?? []) {
      const svc = c.service === "twitter" ? "x" : c.service;
      if (platforms.includes(svc) && !c.disconnected && !c.isDisconnected && !c.isLocked) channelByService[svc] = c.id;
    }
  }

  // --- load already-rendered/QA'd/consensus-passed placements -------
  const { rows: placements } = await loadPlacements({ statuses: ["BUFFER_READY"] });
  const { rows: stories } = await loadStories({});
  const { rows: allPlacements } = await loadPlacements({});
  const byId = Object.fromEntries(stories.map((s) => [s.story_id, s]));
  const alreadyQueued = new Set(allPlacements.filter((p) => p.buffer_provider_ref).map((p) => p.placement_id));

  const eligible = [];
  for (const p of placements) {
    const st = byId[p.story_id];
    if (!st) { report.skipped.push({ placement_id: p.placement_id, reason: "no story row" }); continue; }
    if (!platforms.includes(p.platform)) { report.skipped.push({ placement_id: p.placement_id, platform: p.platform, reason: "out of initial platform scope (IG + X only)" }); continue; }
    const famStatus = familyStatusFor(st.series) ?? "AUTONOMOUS_SAFE";
    if (famStatus === "MANUAL_ONLY" || famStatus === "WITHHELD") { report.skipped.push({ placement_id: p.placement_id, series: st.series, reason: `family_status ${famStatus} - never autonomous` }); continue; }
    if (!refillConsiderable(st.series)) { report.skipped.push({ placement_id: p.placement_id, series: st.series, reason: "series not refill-considerable" }); continue; }
    if (alreadyQueued.has(p.placement_id) || p.buffer_provider_ref) { report.skipped.push({ placement_id: p.placement_id, reason: "already has a provider ref (idempotent)" }); continue; }
    if (!p.artifact_hash || !p.hosted_url) { report.skipped.push({ placement_id: p.placement_id, reason: "no artifact_hash / hosted_url" }); continue; }
    // SS7 - the exact-artifact invariant + (CONDITIONAL) consensus under policy 3c.1
    const aq = await artifactQueueEligible({
      placementId: p.placement_id, artifactSha: p.artifact_hash,
      familyStatus: famStatus, policyVersion: VISUAL_REVIEW_POLICY_VERSION,
    });
    if (!aq.ok) { report.skipped.push({ placement_id: p.placement_id, series: st.series, family_status: famStatus, reason: `artifact ineligible: ${aq.reason}` }); continue; }
    eligible.push({ p, st, famStatus, artifactQa: aq });
  }
  report.candidates_considered = eligible.length;

  // --- curate: distinct series + distinct layout family; per-platform
  //     depth cap from the initial horizon; DEAL_DROP capped hard (SS13) ---
  const horizonLow = (pl) => (initial ? (INITIAL_HORIZON_DAYS[pl] ?? [2]) : [2, 4])[0];
  const perPlatformCap = Object.fromEntries(platforms.map((pl) => [pl, pl === "x" ? Math.max(2, horizonLow(pl) * 2) : Math.max(3, horizonLow(pl))]));
  const dealDropCap = 1; // SS13 - never let Deal Drops dominate the first backlog
  const pickedSeries = new Set();
  const pickedLayout = new Set();
  const perPlatform = {};
  let dealDrops = 0;
  const curated = [];
  // education/market first (SS13/SS16 - the backbone), then commercial
  const order = eligible.slice().sort((a, b) => {
    const w = (x) => (x.st.series === "DEAL_DROP" ? 2 : COMMERCIAL_SERIES.has(x.st.series) ? 1 : 0);
    return w(a) - w(b);
  });
  for (const e of order) {
    const lf = e.p.caption_style?.layout_family ?? e.st.series;
    if ((perPlatform[e.p.platform] ?? 0) >= (perPlatformCap[e.p.platform] ?? 2)) continue;
    if (pickedSeries.has(e.st.series) && pickedLayout.has(lf)) continue;
    if (e.st.series === "DEAL_DROP") {
      if (dealDrops >= dealDropCap) continue;
      // SS14 - deal_hero only into a near-term slot
      e._nearTermOnly = true;
    }
    curated.push(e);
    pickedSeries.add(e.st.series);
    pickedLayout.add(lf);
    perPlatform[e.p.platform] = (perPlatform[e.p.platform] ?? 0) + 1;
    if (e.st.series === "DEAL_DROP") dealDrops += 1;
  }
  report.curated = curated.length;

  // SS20 - commercial share ceiling (<= 40% initial)
  const commercial = curated.filter((e) => COMMERCIAL_SERIES.has(e.st.series)).length;
  report.commercial_share = curated.length ? Math.round((commercial / curated.length) * 100) / 100 : 0;
  if (curated.length && report.commercial_share > 0.4) {
    // drop the lowest-priority commercial picks until <= 40%
    while (curated.length && (curated.filter((e) => COMMERCIAL_SERIES.has(e.st.series)).length / curated.length) > 0.4) {
      const idx = curated.map((e, i) => [e, i]).reverse().find(([e]) => COMMERCIAL_SERIES.has(e.st.series))?.[1];
      if (idx == null) break;
      report.skipped.push({ placement_id: curated[idx].p.placement_id, series: curated[idx].st.series, reason: "trimmed to keep commercial share <= 40%" });
      curated.splice(idx, 1);
    }
    report.commercial_share = curated.length ? Math.round((curated.filter((e) => COMMERCIAL_SERIES.has(e.st.series)).length / curated.length) * 100) / 100 : 0;
  }

  // STAGE-B CONTAINMENT: a dry-run writes nothing (the circuit note is a DB row).
  if (!curated.length) { report.outcome = "BACKLOG_LOW_BUT_NO_QUALITY_CONTENT"; if (!dryRun) await noteBacklogSuccess({ at: now }); return report; }

  // --- assign slots + per-placement shelf-life revalidation (SS14/15/25) ---
  const slotIdx = {};
  const toQueue = [];
  for (const e of curated) {
    const slots = (slotIdx[e.p.platform] ??= slotsFor(e.p.platform, 8, now));
    let due = null;
    for (let i = 0; i < slots.length; i++) {
      const cand = slots[i];
      if (slots[`_used_${i}`]) continue;
      const hoursOut = (Date.parse(cand) - now) / 3_600_000;
      if (e._nearTermOnly && hoursOut > NEAR_TERM_HOURS) continue;
      // SS15/SS25 - the story must still be publishable at that time
      if (!storyPublishableAt(e.st, cand)) continue;
      if (queuedContentStale(e.st, { status: "BUFFER_QUEUED", scheduled_for: cand }, { now })) continue;
      slots[`_used_${i}`] = true;
      due = cand;
      break;
    }
    if (!due) { report.skipped.push({ placement_id: e.p.placement_id, series: e.st.series, reason: e._nearTermOnly ? "no near-term slot within shelf-life (deal_hero)" : "no slot within shelf-life" }); continue; }
    toQueue.push({ ...e, dueAt: due });
  }

  // recompute commercial share on the FINAL to-queue set (post slot/shelf-life)
  report.commercial_share = toQueue.length
    ? Math.round((toQueue.filter((e) => COMMERCIAL_SERIES.has(e.st.series)).length / toQueue.length) * 100) / 100
    : 0;

  // --- SS19 - FEED_PASS over the batch + a synthetic next-12 -------
  const feedItems = toQueue.map((e) => ({
    story: { series: e.st.series, pillar: e.st.pillar, bucket: COMMERCIAL_SERIES.has(e.st.series) ? "CONVERSION" : "AUTHORITY", facts_json: {} },
    signature: { layout_family: e.p.caption_style?.layout_family ?? e.st.series, cta_zone: e.p.caption_style?.cta_zone ?? "bottom", hook_grammar: `${e.st.series}`, loud_brand: false },
  }));
  const feed = feedReview(feedItems, { windowN: Math.max(6, feedItems.length) });
  report.feed_verdict = feed.verdict;
  if (feed.verdict === "FEED_FAIL") { report.ok = false; report.outcome = `FEED_FAIL: ${feed.blockers.join("; ")}`; return report; }

  // --- schedule --------------------------------------------------------
  // SOCIAL-NEWSROOM-14C crash-recovery (mirrors lib/autonomous/
  // bufferHandoff.mjs's §6 design, which this path did not previously
  // have): Buffer's API has no request-level idempotency key, so "the
  // process dies between a provider accept and our own DB write" is a
  // real duplicate-post risk, not a theoretical one. The fix is the same
  // either path: persist a BUFFER_SUBMITTING marker BEFORE the network
  // call, and NEVER blind-retry a placement found already in that state -
  // that means an earlier attempt's outcome is unknown and needs a human
  // to check Buffer directly, not an automatic resubmit.
  for (const e of toQueue) {
    const common = { story_id: e.st.story_id, series: e.st.series, family_status: e.famStatus, platform: e.p.platform, artifact_hash: (e.p.artifact_hash ?? "").slice(0, 16), scheduled_utc: e.dueAt, scheduled_brisbane: new Date(Date.parse(e.dueAt) + 10 * 3_600_000).toISOString().replace("Z", "+10:00") };
    if (dryRun) {
      // SOCIAL-NEWSROOM-14C - a TRUE dry-run canary: construct the exact
      // provider payload buildProviderMessage() would produce (pure, no
      // I/O) so this mode proves what WOULD be sent, not just that a
      // candidate was picked. channelId is never resolved here - doing so
      // means a real (if read-only) Buffer call, and this mode must never
      // touch the provider at all, not even to read.
      // SOCIAL-NEWSROOM-14C DEFECT FOUND: `caption_text`/`caption` are not
      // real columns on social_story_placements - the actual persisted
      // caption text (where a render pass wrote one) lives at
      // caption_style.text. The pre-existing expression here always
      // evaluated to "" regardless of what was rendered - this dry-run
      // canary is what surfaced it (text_length was 0 for a real,
      // eligible candidate). Fixed to read the real field; see the
      // matching fix at the real scheduleOne() call below.
      const caption = e.p.caption_style?.text || e.p.caption_style?.hook || "";
      const wouldSendMsg = buildProviderMessage({
        story: e.st, placement: e.p, channelId: "<resolved from Buffer's channel list at real-queue time - not fetched in dry-run>",
        caption, assetUrl: e.p.hosted_url ?? null,
        assetType: ["video", "reel", "short"].includes(e.p.placement_type) ? "video" : "image",
        dueAtUtc: e.dueAt, mode: "scheduled", env,
      });
      report.queued.push({
        ...common,
        provider_ref: null,
        provider_state: "DRY_RUN_WOULD_SCHEDULE",
        why_selected: {
          family_status: e.famStatus,
          artifact_queue_eligible: e.artifactQa?.ok ?? null,
          artifact_eligibility_basis: e.artifactQa?.reason ?? "latest STACK + VISUAL_REVIEW (or CONDITIONAL consensus) PASS for this exact artifact_hash",
        },
        would_send_provider_payload: {
          platform: wouldSendMsg.platform, postType: wouldSendMsg.postType,
          channelId: wouldSendMsg.channelId, dueAt: wouldSendMsg.dueAt, schedulingType: wouldSendMsg.schedulingType,
          text_length: (wouldSendMsg.text || "").length, text_preview: (wouldSendMsg.text || "").slice(0, 140),
          assets: wouldSendMsg.assets.map((a) => ({ type: a.type, url: a.url })),
          siteLink: wouldSendMsg.siteLink,
        },
        would_persist_on_success: {
          status: "BUFFER_QUEUED",
          buffer_provider_ref: "<the real Buffer post id - only ever written after a genuine provider accept>",
          scheduled_for: e.dueAt,
          provider_state: "<provider's own reported status, e.g. scheduled>",
        },
      });
      continue;
    }

    // re-check the row's CURRENT state right before acting - never trust
    // the copy loaded at the top of this run for a decision this
    // consequential.
    const current = await getPlacement(e.p.placement_id);
    if (current.ready && current.row) {
      if (current.row.buffer_provider_ref) {
        report.skipped.push({ ...common, reason: "already has a provider ref (idempotent) - not resubmitting" });
        continue;
      }
      if (current.row.status === "BUFFER_SUBMITTING") {
        report.skipped.push({ ...common, reason: "a prior submit attempt left this placement at BUFFER_SUBMITTING with no provider_ref - reconcile with the provider by hand before any resubmit" });
        continue;
      }
    }

    await patchPlacement(e.p.placement_id, { status: "BUFFER_SUBMITTING" });

    const r = await scheduleOne({
      story: e.st, placement: e.p, channelId: channelByService[e.p.platform],
      // SOCIAL-NEWSROOM-14C DEFECT FIX: caption_text/caption are not real
      // placement columns (see the dry-run branch above for how this was
      // found) - the real generated text, where a render pass wrote one,
      // is at caption_style.text.
      caption: e.p.caption_style?.text || e.p.caption_style?.hook || "",
      dueAtUtc: e.dueAt, professionalResult: "PASS", artifactQa: e.artifactQa,
      mode: "scheduled", env, now, provider,
    });
    if (!r.queued) {
      // "preflight_failed" / "provider_not_configured" mean the network
      // call never happened at all - always safe to hand straight back.
      // Anything else came from a real provider response/exception and
      // gets the SAME classification bufferHandoff.mjs uses: only a
      // network/unclassifiable outcome is ambiguous enough to withhold
      // from the next run's eligibility.
      const neverCalledProvider = r.reason === "preflight_failed" || r.reason === "provider_not_configured";
      const failureClass = neverCalledProvider ? null : classifyProviderFailure(r.reason, (r.blockers ?? []).join("; "));
      const ambiguous = !neverCalledProvider && !retryPolicyFor(failureClass).safeToRetry && (failureClass === "NETWORK_FAILURE" || failureClass === "UNKNOWN_PROVIDER_STATE");
      if (ambiguous) {
        await patchPlacement(e.p.placement_id, { status: "BUFFER_SUBMIT_UNKNOWN", provider_state: r.reason ?? "unknown" });
        report.skipped.push({ ...common, reason: `schedule outcome UNKNOWN (${failureClass}) - held for manual reconciliation, never auto-retried: ${r.reason}` });
      } else {
        await patchPlacement(e.p.placement_id, { status: "BUFFER_READY" });
        report.skipped.push({ ...common, reason: `schedule failed: ${r.reason} ${(r.blockers ?? []).join("; ")}` });
      }
      await noteBacklogFailure({ reason: "buffer_schedule_failed", detail: `${e.p.placement_id}: ${r.reason}`, at: now });
      const c2 = await backlogCircuitStatus();
      if (c2.suspended) { report.ok = false; report.circuit = c2; report.outcome = "BACKLOG_SUSPENDED"; return report; }
      continue;
    }
    await patchPlacement(e.p.placement_id, r.placement_patch);
    await recordQaRun({
      placement_id: e.p.placement_id, qa_type: "SCHEDULE", result: "PASS",
      detail: { artifact_sha256: e.p.artifact_hash, provider_ref: r.provider_ref, provider_state: r.provider_state, dueAt: e.dueAt, mode: "scheduled", policy_version: VISUAL_REVIEW_POLICY_VERSION },
    });
    report.queued.push({ ...common, provider_ref: r.provider_ref, provider_state: r.provider_state });
  }

  // --- SS23 - reconcile every queued placement ----------------------
  for (const q of report.queued) {
    if (!q.provider_ref) continue;
    const p = placements.find((x) => x.story_id === q.story_id && x.platform === q.platform);
    const rc = await reconcileOne({ placement: { ...p, buffer_provider_ref: q.provider_ref }, env, provider });
    report.reconciled.push({ story_id: q.story_id, platform: q.platform, provider_ref: q.provider_ref, published: Boolean(rc.published), drift: rc.drift ?? null, provider_state: rc.providerState ?? null });
    if (rc.published) { report.ok = false; report.outcome = "UNEXPECTED_IMMEDIATE_PUBLISH"; await noteBacklogFailure({ reason: "unexpected_publish", detail: q.provider_ref, at: now }); return report; }
    if (rc.drift) { await noteBacklogFailure({ reason: "provider_readback_drift", detail: `${q.provider_ref}: ${rc.drift}`, at: now }); }
  }

  if (!dryRun && report.queued.some((q) => q.provider_ref)) await noteBacklogSuccess({ at: now });
  report.outcome = report.queued.length ? (dryRun ? "DRY_RUN_OK" : "QUEUED") : "NOTHING_TO_QUEUE";
  return report;
}

// story is publishable at `atIso` if latest_safe_publish_at (or valid_until)
// covers it. Mirrors bufferBacklog.storyPublishableAt without importing a
// non-exported helper.
function storyPublishableAt(story, atIso) {
  const at = Date.parse(atIso);
  const lim = Date.parse(story?.latest_safe_publish_at ?? story?.valid_until ?? "");
  if (!Number.isFinite(lim)) return story?.shelf_life_class === "EVERGREEN" || story?.shelf_life_class === "EDITORIAL";
  return at <= lim;
}

export { VISUAL_REVIEW_POLICY_VERSION };
