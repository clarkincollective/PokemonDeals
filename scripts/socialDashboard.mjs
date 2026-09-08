#!/usr/bin/env node
// Phase 13E.9A - SOCIAL OPERATOR DASHBOARD (READ-ONLY).
//
//   npm run social:dashboard              build the dashboard from local state + a bounded DB read
//   npm run social:dashboard -- --no-db   skip the freshness/image DB reads (local files only)
//   npm run social:dashboard -- --no-quota  skip the (free, non-Browse) eBay rate-limit read
//   npm run social:dashboard -- --json    print the machine-readable snapshot to stdout
//
// Combines, in one place:
//   TODAY'S CONTENT PLAN  +  REVIEW/APPROVAL STATE  +  DISTRIBUTION STATUS
//   +  METRICS STATUS  +  BLOCKERS  +  FIRST-LIVE READINESS.
//
// It is READ ONLY (13E.9A §17). It performs NO:
//   Buffer publish/schedule · batch approval · eBay Browse call · outreach
//   send · image-recovery trigger · planner mutation · ledger mutation.
// The ONLY eBay call is getBrowseRateLimit() - the free Developer-Analytics
// rate-limit read the scan crons and _waitForQuota.sh already use; it is
// NOT a Browse call. It is optional (--no-quota) and cached.
//
// Output (its own directory, added to NO route and NO sitemap):
//   .social-preview/operator-dashboard/index.html   static, <meta noindex>, zero secrets
//   .social-preview/operator-dashboard/dashboard.json

import { existsSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import path from "node:path";
import { config as loadDotenv } from "dotenv";
if (existsSync(".env.local")) loadDotenv({ path: ".env.local", quiet: true });
else loadDotenv({ quiet: true });

import { readDistributionFlags, describeFlags, brisbaneLabel } from "../lib/social/distribution/config.mjs";
import { RIGHTS_STATE } from "../lib/social/rights.mjs";
import { loadLedger } from "../lib/social/distribution/ledger.mjs";
import { loadBatches, batchStatus, batchApprovalValid } from "../lib/social/distribution/batch.mjs";
import { loadPlans, planCounts, expireStale } from "../lib/social/planner/plans.mjs";
import { buildPlan } from "../lib/social/planner/planner.mjs";
import { loadPostHistory } from "../lib/social/cooldown.mjs";
import { loadHostedAssets } from "../lib/social/storage/hostedAssets.mjs";
import { getSocialProvider } from "../lib/social/providers/index.mjs";
import { PLATFORM_ROLES, CADENCE_CEILING_PER_DAY, serviceOf } from "../lib/social/planner/platformRoles.mjs";
import {
  quotaState,
  statusForItem,
  platformSummary as buildPlatformSummary,
  firstLiveOverall,
  deriveBlockers,
  recoveryStateFromLog,
  QUOTA_RESERVE,
  QUOTA_HEALTHY_FLOOR,
} from "../lib/social/operator.mjs";
import { loadSourceSnapshot } from "./socialSource.mjs";
import { resolveSocialPosture, resolveEmailPosture, describePosture } from "../lib/autonomous/config.mjs";
import { loadCircuit, effectiveMode, lastRun, lastDigest } from "../lib/autonomous/runState.mjs";

const ROOT = process.cwd();
const OUT_DIR = path.join(ROOT, ".social-preview", "operator-dashboard");
const OUT_HTML = path.join(OUT_DIR, "index.html");
const OUT_JSON = path.join(OUT_DIR, "dashboard.json");
const FIXTURE = path.join(ROOT, "tests", "fixtures", "social-deals.json");
const CHANNELS = path.join(ROOT, "lib", "social", "distribution", "channels.json");
const OUTREACH_RECORDS = path.join(ROOT, "lib", "outreach", "records.json");
const RECOVER_OUT = path.join(ROOT, "scripts", "_recover_run.out");
const QUOTA_WAIT_LOG = path.join(ROOT, ".social-preview", "_quota_wait.log");
const REVIEW_PACK = path.join(ROOT, ".social-preview", "distribution-review-pack", "manifest.json");

const RESERVE = QUOTA_RESERVE; // the recovery reserve (_recoverWhenQuota.sh)
const HEALTHY_FLOOR = QUOTA_HEALTHY_FLOOR; // _waitForQuota.sh resume threshold

const args = process.argv.slice(2);
const NO_DB = args.includes("--no-db");
const NO_QUOTA = args.includes("--no-quota");
const AS_JSON = args.includes("--json");

const readJson = (p, fb = null) => {
  try {
    return JSON.parse(readFileSync(p, "utf8"));
  } catch {
    return fb;
  }
};
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : null);
const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// ---- gather (READ ONLY) --------------------------------------

async function gather() {
  const now = Date.now();
  const nowIso = new Date(now).toISOString();
  const flags = readDistributionFlags();
  const provider = getSocialProvider();

  // ---- snapshot + planner (pure buildPlan, never persisted) ----
  let snapshot = loadSourceSnapshot();
  let snapshotIsFixture = false;
  if (!snapshot) {
    snapshot = readJson(FIXTURE);
    if (snapshot) {
      snapshot = {
        source: "fixture:tests/fixtures/social-deals.json",
        empty: !(snapshot.deals?.length),
        captured_at: snapshot.pulled_at,
        deals: (snapshot.deals ?? []).map((d) => ({ ...d, exact_verified_at: d.row?.exact_verified_at ?? null })),
        movers: snapshot.movers ?? [],
        carousel: snapshot.carousel ?? null,
      };
      snapshotIsFixture = true;
    }
  } else {
    snapshotIsFixture = String(snapshot.source ?? "").startsWith("fixture");
  }
  const history = loadPostHistory();
  const plan = snapshot ? buildPlan({ snapshot, history, horizon: "today", now, simulate: false }) : { empty: true, entries: [], unfilled: [], not_scheduled: [], mix: null, warnings: [] };

  // ---- distribution: ledger + batches ----
  const ledger = loadLedger();
  const batches = loadBatches();
  const ledgerByJob = new Map(ledger.map((r) => [r.job_id, r]));

  // ---- persisted plans (EXPIRED display derived on a CLONE - never saved) ----
  const plansRaw = loadPlans();
  const plansClone = JSON.parse(JSON.stringify(plansRaw));
  expireStale(plansClone, now); // pure mutation of the clone only
  const planStateByKey = new Map(plansClone.map((p) => [`${p.content_id}|${p.platform}`, p.state]));
  const planStats = planCounts(plansClone);

  // ---- channels ----
  const channels = readJson(CHANNELS, {});
  const aliases = ["instagram_main", "tiktok_main", "x_main", "youtube_main"];
  const channelResolved = Object.fromEntries(aliases.map((a) => [a, typeof channels[a] === "string" && channels[a].length > 0]));
  const allChannelsResolved = aliases.every((a) => channelResolved[a]);

  // ---- hosted assets ----
  const hosted = loadHostedAssets();
  const hostedVerified = hosted.filter((h) => h.public_url && h.verified && h.verified.status === 200 && !h.verified.authChallenged);

  // ---- per-planned-item status ----
  function statusFor(entry) {
    const planState = planStateByKey.get(`${entry.content_id}|${entry.platform}`);
    const ledgerRow = ledger.find((r) => r.content_id === entry.content_id && r.platform === entry.platform);
    return statusForItem({ planState, ledgerRow });
  }
  const todayItems = (plan.entries ?? []).map((e) => ({
    time_utc: e.time_utc,
    time_brisbane: e.time_brisbane,
    time_us_et: e.time_us_et,
    platform: e.platform,
    service: e.service,
    family: e.family,
    goal: e.goal,
    subject: e.subject,
    quality_tier: e.quality_tier,
    score: e.score,
    fresh_until: e.fresh_until_utc,
    content_id: e.content_id,
    why: e.why,
    score_breakdown: e.score_breakdown,
    diversity: e.diversity,
    status: statusFor(e),
    source_ref: e.source_ref,
  }));

  // ---- platform summary (each service from its own slice - independent) ----
  const platformSummary = {};
  for (const svc of ["instagram", "tiktok", "x", "youtube"]) {
    const aliasKey = { instagram: "instagram_main", tiktok: "tiktok_main", x: "x_main", youtube: "youtube_main" }[svc];
    const p = buildPlatformSummary({
      label: PLATFORM_ROLES[svc].label,
      role: PLATFORM_ROLES[svc].role,
      planned: todayItems.filter((i) => i.service === svc),
      ledgerRows: ledger.filter((r) => serviceOf(r.platform) === svc),
      ceiling: CADENCE_CEILING_PER_DAY[svc] ?? 1,
      resolved: channelResolved[aliasKey] === true,
    });
    platformSummary[svc] = { ...p, next_proposed_brisbane: p.next_proposed_utc ? brisbaneLabel(p.next_proposed_utc) : null };
  }

  // ---- quota (free, non-Browse; cached; optional) ----
  const prevDash = readJson(OUT_JSON, {});
  let quota = { state: "UNKNOWN", remaining: null, limit: null, reset: null, source: "unavailable", read_at: null };
  if (!NO_QUOTA) {
    try {
      const { getBrowseRateLimit } = await import("../lib/ebay.js");
      const q = await getBrowseRateLimit(); // { limit, remaining, reset } | null - NOT a Browse call
      if (q && q.remaining != null) {
        quota = { ...q, source: "live", read_at: nowIso, state: null };
      }
    } catch {
      /* fall through to cache */
    }
  }
  if (quota.state !== null && prevDash?.quota?.remaining != null) {
    quota = { ...prevDash.quota, source: "cache", stale_read_at: prevDash.quota.read_at };
  }
  quota.state = quotaState(quota.remaining);
  quota.reserve = RESERVE;
  // last quota_wait / recover log line for context (no control)
  const tailLine = (p) => {
    const t = (readJson_str(p) || "").trim().split(/\r?\n/).filter(Boolean);
    return t.length ? t[t.length - 1] : null;
  };
  quota.waiter_last_line = tailLine(QUOTA_WAIT_LOG);

  // ---- freshness health (bounded DB read, optional) ----
  let freshness = { available: false, note: NO_DB ? "skipped (--no-db)" : "not read" };
  if (!NO_DB) {
    try {
      const { fetchActiveDealPool } = await import("../lib/social/db.mjs");
      const { hoursSinceExactVerification } = await import("../lib/dealQuality.js");
      const { isSociallyEligiblePremium, SOCIAL_FRESHNESS_MAX_AGE_HOURS } = await import("../lib/social/eligibility.mjs");
      const { rows, error } = await fetchActiveDealPool({ poolLimit: 3000 });
      if (error) throw new Error(error);
      const ages = rows.map((r) => hoursSinceExactVerification(r, now)).filter(Number.isFinite).sort((a, b) => a - b);
      const within = (h) => ages.filter((a) => a <= h).length;
      freshness = {
        available: true,
        active_deals: rows.length,
        freshest_hours: ages.length ? Number(ages[0].toFixed(2)) : null,
        within_1h: within(1),
        within_3h: within(3),
        within_6h: within(6),
        within_12h: within(12),
        social_eligible: rows.filter((r) => isSociallyEligiblePremium(r, now)).length,
        ceiling_hours: SOCIAL_FRESHNESS_MAX_AGE_HOURS,
      };
    } catch (e) {
      freshness = { available: false, note: `DB read failed: ${String(e.message ?? e).slice(0, 120)}` };
    }
  }

  // ---- image recovery status (file read; bounded DB count optional) ----
  const recoverTail = (readJson_str(RECOVER_OUT) || "").trim().split(/\r?\n/).filter(Boolean);
  const recoverLast = recoverTail.length ? recoverTail[recoverTail.length - 1] : null;
  const recoveryState = recoveryStateFromLog(recoverLast);
  let imageless = null;
  if (!NO_DB) {
    try {
      const { supabaseAdmin } = await import("../lib/supabaseAdmin.js");
      const { count } = await supabaseAdmin()
        .from("deals")
        .select("id", { count: "exact", head: true })
        .eq("is_active", true)
        .eq("image_verdict", "NO_TRUSTED_IMAGE");
      imageless = count ?? null;
    } catch {
      imageless = null;
    }
  }

  // ---- subscribers summary (CRM-1: counts only, NEVER an address) ----
  let subscribers = null;
  if (!NO_DB) {
    try {
      const { supabaseAdmin } = await import("../lib/supabaseAdmin.js");
      const { summaryFromCounts } = await import("../lib/crm/summary.js");
      const db = supabaseAdmin();
      const countWhere = async (apply) => {
        let q = db.from("newsletter_subscribers").select("id", { count: "exact", head: true });
        q = apply(q);
        const { count } = await q;
        return count ?? 0;
      };
      const iso = (daysAgo) => new Date(Date.now() - daysAgo * 864e5).toISOString();
      const [active, pending, unsubscribed, bounced, complained, s7, s30] = await Promise.all([
        countWhere((q) => q.eq("status", "ACTIVE")),
        countWhere((q) => q.eq("status", "PENDING")),
        countWhere((q) => q.eq("status", "UNSUBSCRIBED")),
        countWhere((q) => q.eq("status", "BOUNCED")),
        countWhere((q) => q.eq("status", "COMPLAINED")),
        countWhere((q) => q.gte("created_at", iso(7))),
        countWhere((q) => q.gte("created_at", iso(30))),
      ]);
      subscribers = summaryFromCounts({
        byStatus: { ACTIVE: active, PENDING: pending, UNSUBSCRIBED: unsubscribed, BOUNCED: bounced, COMPLAINED: complained },
        signups7d: s7,
        signups30d: s30,
      });
    } catch {
      subscribers = null;
    }
  }

  // ---- verifier freshness mix (P0.4.3: read-only) ----
  let verifierHealth = null;
  if (!NO_DB) {
    try {
      const { supabaseAdmin } = await import("../lib/supabaseAdmin.js");
      const { verifyHealthMetrics } = await import("../lib/verifyAllocator.mjs");
      const db = supabaseAdmin();
      const rows = [];
      for (let f = 0; f < 6000; f += 1000) {
        const { data } = await db.from("deals")
          .select("id,listing_type,exact_verified_at,discount_pct,is_graded,condition,card_language,disqualified_reason,visual_authenticity_status,visual_authenticity_reason,market_price,card_tcgplayer_id,title,card_name,card_set")
          .eq("is_active", true).range(f, f + 999);
        if (!data?.length) break;
        rows.push(...data);
        if (data.length < 1000) break;
      }
      verifierHealth = { ...verifyHealthMetrics(rows), quota_remaining: quota?.remaining ?? null };
    } catch {
      verifierHealth = null;
    }
  }

  // ---- editorial newsroom backlog (SOCIAL-NEWSROOM-1: read-only) ----
  let editorialBacklog = null;
  try {
    const { backlogHealth, refillNeeds } = await import("../lib/social/newsroom/backlogHealth.mjs");
    const { backlogCircuitStatus } = await import("../lib/social/newsroom/backlogCircuit.mjs");
    const { resolveBacklogPosture } = await import("../lib/social/newsroom/backlogConfig.mjs");
    const { queuedContentStale } = await import("../lib/newsroom/bufferBacklog.mjs");
    const { loadPlacements, loadStories, loadQaRuns, tablesReady } = await import("../lib/social/newsroom/db.mjs");
    const ready = await tablesReady().catch(() => false);
    const placed = ready ? (await loadPlacements({})).rows : [];
    const storyRows = ready ? (await loadStories({})).rows : [];
    const qaRows = ready ? (await loadQaRuns({})).rows : [];
    const health = backlogHealth(placed, { now: Date.now() });
    const byId = Object.fromEntries(storyRows.map((s) => [s.story_id, s]));
    // §36 - distinguish local plan state from provider state
    const stateCounts = { DB_PLANNED: 0, BUFFER_READY: 0, BUFFER_QUEUED: 0, PUBLISHED: 0 };
    let staleRisk = 0;
    for (const p of placed) {
      if (p.status === "BUFFER_QUEUED") stateCounts.BUFFER_QUEUED++;
      else if (p.status === "BUFFER_READY") stateCounts.BUFFER_READY++;
      else if (p.status === "PUBLISHED") stateCounts.PUBLISHED++;
      else stateCounts.DB_PLANNED++;
      const st = byId[p.story_id];
      if (st && queuedContentStale(st, p, { now: Date.now() })) staleRisk++;
    }
    const visionWatch = qaRows.filter((q) => q.qa_type === "VISUAL_REVIEW" && q.result === "WATCH").length;
    const queuedTimes = placed.filter((p) => p.buffer_provider_ref && p.scheduled_for).map((p) => Date.parse(p.scheduled_for)).filter(Number.isFinite).sort((a, b) => a - b);
    // enrich from the last review-pack summary if present (series/pillar mix,
    // support counts, AI-spam + fatigue signals) - never re-runs the DB stats.
    let packSummary = null;
    try {
      const { readFileSync } = await import("node:fs");
      packSummary = JSON.parse(readFileSync(".social-preview/editorial-newsroom/backlog-summary.json", "utf8"));
    } catch {
      packSummary = null;
    }
    editorialBacklog = {
      tables_ready: ready,
      overall: health.overall,
      by_platform: health.by_platform,
      refill_needs: refillNeeds(health),
      state_counts: stateCounts,
      stale_risk: staleRisk,
      vision_watch_count: visionWatch,
      oldest_queued: queuedTimes.length ? new Date(queuedTimes[0]).toISOString() : null,
      newest_queued: queuedTimes.length ? new Date(queuedTimes[queuedTimes.length - 1]).toISOString() : null,
      circuit: backlogCircuitStatus(),
      posture: resolveBacklogPosture(process.env, { requestQueue: false }),
      // SOCIAL-NEWSROOM-3 (SS26) - recurring refill readiness + retention
      refill: await (async () => {
        try {
          const { REFILL_SCHEDULE, EDITORIAL_REFILL_PLATFORMS, refillConsiderable, refillNeedsConsensus } = await import("../lib/social/newsroom/refill.mjs");
          const { qaRetentionReport } = await import("../lib/social/newsroom/qaRetention.mjs");
          const { CARD_LAYOUT_STATUS } = await import("../lib/social/newsroom/cardLayoutStatus.mjs");
          const placementState = Object.fromEntries(placed.map((p) => [p.placement_id, p.status]));
          const fams = Object.entries(CARD_LAYOUT_STATUS).reduce((a, [k, v]) => { (a[v.family_status] ??= []).push(k); return a; }, {});
          return {
            cron_activated: REFILL_SCHEDULE.activated,
            schedule: `${REFILL_SCHEDULE.cron_hint}  (${REFILL_SCHEDULE.cron_utc}  =  ${REFILL_SCHEDULE.brisbane_local})`,
            editorial_platforms: EDITORIAL_REFILL_PLATFORMS,
            tiktok: "NOT_PLATFORM_FIT", youtube: "manual/selective (not in editorial refill)",
            families: fams,
            enabled_flag: process.env.SOCIAL_BUFFER_BACKLOG_ENABLED === "true",
            provider_mode: process.env.SOCIAL_BUFFER_BACKLOG_MODE ?? "(unset)",
            qa_retention: qaRetentionReport(qaRows, placementState),
          };
        } catch (e) { return { error: String(e?.message ?? e) }; }
      })(),
      pack: packSummary
        ? {
            generated_at: packSummary.generated_at,
            support: packSummary.support_matrix,
            series_diversity: packSummary.calendar_sim?.series_diversity ?? null,
            pillar_counts: packSummary.calendar_sim?.pillar_counts ?? null,
            editorial_balance: packSummary.calendar_sim?.editorial_balance?.byBucket ?? null,
            unfilled_editorial_slots: packSummary.calendar_sim?.unfilled_editorial_slots ?? null,
            cta_sequence_ok: packSummary.calendar_sim?.cta_sequence?.ok ?? null,
            fatigue_warnings: packSummary.calendar_sim?.fatigue?.warnings ?? [],
            vision_review: packSummary.vision_review ?? null,
            feed_review: packSummary.feed_review?.verdict ?? null,
          }
        : null,
    };
  } catch {
    editorialBacklog = null;
  }

  // ---- autonomous orchestration status (AUTO-1: read-only, no secrets) ----
  let autonomous = null;
  try {
    const sp = resolveSocialPosture(process.env, { requestLive: false });
    const ep = resolveEmailPosture(process.env, { requestLive: false });
    const sc = loadCircuit("social");
    const ec = loadCircuit("email");
    const sLast = lastRun("social");
    const eLast = lastRun("email");
    const dLast = lastDigest();
    autonomous = {
      social: {
        mode: effectiveMode(sp.mode, sc), stage: sp.stageId, circuit: sc.state,
        last_run_at: sLast?.started_at ?? null, last_outcome: sLast?.outcome ?? null,
        last_skip_reason: sLast?.skip_reasons?.[0] ?? null,
        failures_24h: (sc.failures ?? []).length,
        last_submission: (sLast?.submitted?.length ? sLast.finished_at : null),
        last_publish: (ledger.filter((r) => r.status === "PUBLISHED").sort((a, b) => Date.parse(b.published_at ?? 0) - Date.parse(a.published_at ?? 0))[0]?.published_at) ?? null,
        next_window: "hourly (evaluate)",
      },
      email: {
        mode: effectiveMode(ep.mode, ec), stage: ep.stageId, circuit: ec.state,
        last_eval_at: eLast?.started_at ?? null, last_outcome: eLast?.outcome ?? null,
        last_skip_reason: eLast?.skip_reasons?.[0] ?? null,
        failures_24h: (ec.failures ?? []).length,
        last_digest_at: dLast?.sent_at ?? dLast?.created_at ?? null,
        last_digest_status: dLast?.status ?? null,
        next_eligible_window: (() => {
          const lastSent = dLast?.status === "SENT" && dLast?.sent_at ? Date.parse(dLast.sent_at) : null;
          const floorDays = ep.maxDigestsPerWeek >= 2 ? 3 : 6;
          return lastSent ? new Date(lastSent + floorDays * 864e5).toISOString() : "twice weekly (Tue/Fri 16:00 UTC)";
        })(),
        active_subscribers: subscribers?.active ?? null,
        digest_send_enabled: String(process.env.DIGEST_SEND_ENABLED ?? "").trim().toLowerCase() === "true",
      },
    };
  } catch {
    autonomous = null;
  }

  // ---- outreach (status only, NO email addresses) ----
  const outreachRaw = readJson(OUTREACH_RECORDS, []);
  const outreach = ["packz", "pokemonpricetracker"].map((name) => {
    const r = (Array.isArray(outreachRaw) ? outreachRaw : []).find((x) => (x.name ?? x.id) === name) ?? null;
    return { name, status: r?.status ?? "UNKNOWN", queued_at: r?.queuedAt ?? r?.queued_at ?? null, sent_at: r?.sentAt ?? null };
  });

  // ---- metrics (13E.7A) ----
  const publishedRows = ledger.filter((r) => r.status === "PUBLISHED");
  const metrics = {
    anything_published: publishedRows.length > 0,
    state: publishedRows.length > 0 ? "LIVE" : "NOT_AVAILABLE_YET",
    per_placement: publishedRows.map((r) => ({
      platform: r.platform,
      content_id: r.content_id,
      published_at: r.published_at,
      platform_post_url: r.platform_post_url ?? null,
      metrics: r.metrics ?? {},
      last_metrics_sync: r.last_metrics_sync ?? null,
    })),
  };

  // ---- conversion experiments (13E.10A §21) ----
  let experiments = { rows: [], anything_published: false };
  try {
    const { reportAll } = await import("../lib/social/experiments/report.mjs");
    const { experimentDashboardRows } = await import("../lib/social/operator.mjs");
    const attrRaw = readJson(path.join(ROOT, ".social-preview", "metrics", "attribution-import.json"), {});
    const reports = reportAll(ledger, attrRaw && typeof attrRaw === "object" ? attrRaw : {});
    experiments = {
      rows: experimentDashboardRows(plan.entries ?? [], reports),
      anything_published: ledger.some((r) => r.status === "PUBLISHED" && r.experiment_id),
    };
  } catch {
    /* experiments layer optional */
  }

  // ---- review-pack preview (existing artifact, if present) ----
  const reviewPack = readJson(REVIEW_PACK);

  // ---- first-live readiness (§12) ----
  const flCandidate = (plan.entries ?? [])[0] ?? null;
  const approvedBatch = batches.some((b) => b.status === "APPROVED" && batchApprovalValid(b).ok);
  const gates = {
    fresh_candidate: { ok: Boolean(flCandidate) && !snapshotIsFixture, detail: flCandidate ? `${flCandidate.content_id}` : "none" },
    batch_created: { ok: batches.length > 0, detail: batches.length ? batches.map((b) => b.batch_id).join(", ") : "none" },
    owner_approved: { ok: approvedBatch, detail: approvedBatch ? "approved + untampered" : "no approved batch" },
    publishing_switch: { ok: RIGHTS_STATE.publishing === "ALLOWED" && flags.publishEnabled === true, detail: `rights=${RIGHTS_STATE.publishing}, enabled=${flags.publishEnabled}` },
    live_mode: { ok: flags.dryRun === false, detail: `dry_run=${flags.dryRun}` },
    epn_classification: { ok: flags.epnAiClassification != null, detail: flags.epnAiClassification ?? "unset" },
    provider_auth: { ok: provider.isConfigured(), detail: provider.name },
    channel_mapping: { ok: allChannelsResolved, detail: aliases.filter((a) => channelResolved[a]).length + "/4 resolved" },
    media_hosted: { ok: hostedVerified.length > 0, detail: `${hostedVerified.length} verified` },
    fact_drift: { ok: true, detail: approvedBatch ? "not re-checked in the read-only dashboard" : "n/a - no approved batch" },
  };
  gates.ready_to_send = { ok: Object.keys(gates).every((k) => gates[k].ok), detail: "" };
  const flOverall = firstLiveOverall(gates);

  // ---- blockers (deriveBlockers - pure) ----
  const notSched = plan.not_scheduled ?? [];
  const blockers = deriveBlockers({
    publishing_disabled: RIGHTS_STATE.publishing !== "ALLOWED" || flags.publishEnabled !== true || flags.dryRun !== false,
    publishing_detail: `rights.publishing=${RIGHTS_STATE.publishing}, SOCIAL_PUBLISH_ENABLED=${flags.publishEnabled}, dry_run=${flags.dryRun}`,
    epn_unclassified: flags.epnAiClassification == null,
    no_fresh_live_content: snapshotIsFixture || Boolean(snapshot?.empty),
    no_fresh_detail: snapshot?.empty ? (snapshot.empty_reason ?? "snapshot empty") : "current snapshot is a fixture, not fresh live data",
    stale_source: freshness.available && freshness.social_eligible === 0,
    stale_detail: `0 socially-eligible deals; freshest exact_verified_at ${freshness.freshest_hours ?? "?"}h old vs ${freshness.ceiling_hours ?? "?"}h ceiling`,
    channel_unresolved: !allChannelsResolved,
    channel_detail: `not mapped: ${aliases.filter((a) => !channelResolved[a]).join(", ") || "none"}`,
    provider_unconfigured: !provider.isConfigured(),
    media_not_hosted: hostedVerified.length === 0,
    no_batch: batches.length === 0,
    owner_approval_required: batches.length > 0 && !approvedBatch,
    qa_failed: notSched.some((n) => /QA/i.test(n.reason)),
    qa_detail: notSched.find((n) => /QA/i.test(n.reason))?.reason ?? "",
    rights_blocked: notSched.some((n) => /rights/i.test(n.reason)),
    rights_detail: notSched.find((n) => /rights/i.test(n.reason))?.reason ?? "",
    quota_state: quota.state,
    quota_remaining: quota.remaining,
  });

  // ---- today operator summary (§16) ----
  const summary = {
    date_brisbane: new Intl.DateTimeFormat("en-AU", { timeZone: "Australia/Brisbane", weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(new Date(now)),
    date_utc: nowIso.slice(0, 10),
    fresh_social_content: snapshotIsFixture || snapshot?.empty ? 0 : (snapshot?.deals?.length ?? 0) + (snapshot?.movers?.length ?? 0),
    planned_placements: todayItems.length,
    queued: ledger.filter((r) => r.status === "QUEUED").length,
    published: ledger.filter((r) => r.status === "PUBLISHED").length,
    top_blocker: blockers[0]?.code ?? "none",
    quota_state: quota.state,
    quota_reset: quota.reset ?? null,
    first_live_readiness: flOverall,
  };

  return {
    generated_at: nowIso,
    read_only: true,
    summary,
    flags: { describe: describeFlags(flags), ...flags, rights_publishing: RIGHTS_STATE.publishing },
    today: { snapshot_source: snapshot?.source ?? null, snapshot_captured_at: snapshot?.captured_at ?? null, snapshot_is_fixture: snapshotIsFixture, items: todayItems, unfilled: plan.unfilled ?? [], not_scheduled: plan.not_scheduled ?? [], mix: plan.mix ?? null, warnings: plan.warnings ?? [], plan_counts: planStats },
    platforms: platformSummary,
    quota,
    freshness,
    image_recovery: { state: recoveryState, last_line: recoverLast, imageless_active_rows: imageless },
    subscribers,
    verifier_health: verifierHealth,
    editorial_backlog: editorialBacklog,
    autonomous,
    outreach,
    metrics,
    experiments,
    first_live: { gates, overall: flOverall },
    blockers,
    review_pack: reviewPack ? { generated_at: reviewPack.generated_at, items: (reviewPack.items ?? []).map((it) => ({ label: it.label, platform: it.platform, media: it.media, public_media_url: it.public_media_url ?? null, youtube_title: it.youtube_title ?? null, caption: it.caption ?? null, would_send: it.would_send })) } : null,
    commands: {
      plan: "npm run social:plan -- today",
      source_live: "npm run social:source -- live",
      render: "npm run social:video",
      host: "npm run social:publish -- host",
      prepare_batch: "npm run social:publish -- prepare-batch <content_id> --platforms instagram,tiktok,x,youtube",
      review: "npm run social:publish -- review <batch_id>",
      approve_batch: "npm run social:publish -- approve-batch <batch_id>",
      send: "DISABLED - requires the 6-flag live checklist + `send-batch <batch_id> --confirm-live` (see docs/first-live-social-runbook.md)",
      metrics: "npm run social:metrics -- report",
    },
  };
}

function readJson_str(p) {
  try {
    return readFileSync(p, "utf8");
  } catch {
    return null;
  }
}

// ---- render (static HTML, noindex, zero secrets) -------------

export const SECRET_RE = /(BUFFER_ACCESS_TOKEN|SUPABASE_SERVICE_ROLE_KEY|SERVICE_ROLE|CRON_SECRET|OPENAI_API_KEY|RESEND_API_KEY|EBAY_CLIENT_SECRET|sk-[A-Za-z0-9]{16,}|eyJ[A-Za-z0-9_-]{20,})/;

function pill(text, kind = "") {
  return `<span class="pill ${kind}">${esc(text)}</span>`;
}
function statusKind(s) {
  return (
    { PUBLISHED: "ok", QUEUED: "info", APPROVED: "info", READY: "info", PROPOSED: "muted", DRAFT: "muted", EXPIRED: "warn", UNAVAILABLE: "warn", FAILED: "bad", CANCELLED: "warn", HEALTHY: "ok", LOW: "warn", RESERVE: "bad", RESET_PENDING: "bad", UNKNOWN: "muted", COMPLETE: "ok", WAITING: "warn", RUNNING: "info" }[s] ?? "muted"
  );
}

export function renderHtml(d) {
  const s = d.summary;
  const row = (cells) => `<tr>${cells.map((c) => `<td>${c}</td>`).join("")}</tr>`;

  const todayRows = d.today.items.length
    ? d.today.items
        .map((i) =>
          row([
            `${esc(i.time_brisbane)}<div class="sub">${esc(i.time_us_et)} · ${esc(i.time_utc)}</div>`,
            pill(i.platform),
            esc(i.family),
            esc(i.goal),
            esc(i.subject),
            pill(i.quality_tier, i.quality_tier === "S_TIER" ? "ok" : i.quality_tier === "NOT_SOCIAL" ? "warn" : ""),
            esc(i.score),
            esc(i.fresh_until ?? "—"),
            pill(i.status, statusKind(i.status)),
          ])
        )
        .join("")
    : `<tr><td colspan="9" class="muted">NO QUALIFYING CONTENT — the planner recommends nothing for today (this is a clean state, not a failure).</td></tr>`;

  const platformCards = Object.entries(d.platforms)
    .map(
      ([svc, p]) => `
    <div class="card">
      <h3>${esc(p.label)} ${p.connection_resolved ? pill("connected", "ok") : pill("unresolved", "bad")}</h3>
      <p class="sub">${esc(p.role)}</p>
      <dl>
        <div><dt>planned today</dt><dd>${p.planned_today}</dd></div>
        <div><dt>queued</dt><dd>${p.queued}</dd></div>
        <div><dt>published</dt><dd>${p.published}</dd></div>
        <div><dt>failed</dt><dd>${p.failed}</dd></div>
        <div><dt>remaining ceiling</dt><dd>${p.remaining_ceiling}</dd></div>
        <div><dt>next proposed</dt><dd>${esc(p.next_proposed_brisbane ?? "—")}</dd></div>
      </dl>
    </div>`
    )
    .join("");

  const blockerRows = d.blockers.length
    ? d.blockers.map((b) => `<li>${pill(b.code, "bad")} <span class="sub">${esc(b.detail)}</span></li>`).join("")
    : `<li class="muted">no blockers</li>`;

  const flRows = Object.entries(d.first_live.gates)
    .map(([k, g]) => row([esc(k), g.ok ? pill("ok", "ok") : pill("blocked", "bad"), esc(g.detail)]))
    .join("");

  const detailBlocks = d.today.items
    .map(
      (i) => `
    <details>
      <summary>${esc(i.subject)} — ${esc(i.platform)} <span class="sub">${esc(i.content_id)}</span></summary>
      <table class="kv">
        ${row(["family / goal", `${esc(i.family)} / ${esc(i.goal)}`])}
        ${row(["quality tier / score", `${esc(i.quality_tier)} / ${esc(i.score)}`])}
        ${row(["why selected", esc(i.why)])}
        ${row(["score breakdown", `<code>${esc(JSON.stringify(i.score_breakdown))}</code>`])}
        ${row(["diversity penalties", `<code>${esc(JSON.stringify(i.diversity))}</code>`])}
        ${row(["source", `<code>${esc(JSON.stringify(i.source_ref))}</code>`])}
        ${row(["fresh until", esc(i.fresh_until ?? "—")])}
        ${row(["status", pill(i.status, statusKind(i.status))])}
      </table>
    </details>`
    )
    .join("");

  const rp = d.review_pack;
  const reviewPackHtml = rp
    ? `<p class="sub">from <code>.social-preview/distribution-review-pack/manifest.json</code> (generated ${esc(rp.generated_at)})</p>
       <table><thead><tr><th>label</th><th>platform</th><th>media</th><th>public URL</th><th>would send</th></tr></thead><tbody>
       ${rp.items
         .map((it) =>
           row([
             esc(it.label),
             pill(it.platform),
             esc(it.media),
             it.public_media_url ? `<a href="${esc(it.public_media_url)}" rel="noopener noreferrer">link</a>` : "—",
             pill(it.would_send ? "yes" : "NO", it.would_send ? "ok" : "muted"),
           ])
         )
         .join("")}
       </tbody></table>
       ${rp.items
         .filter((it) => it.platform === "x_post" || it.platform === "youtube_short")
         .map(
           (it) => `<details><summary>${esc(it.platform)} frozen copy — ${esc(it.label)}</summary>${it.youtube_title ? `<p><strong>Title:</strong> ${esc(it.youtube_title)}</p>` : ""}<pre>${esc(it.caption ?? "(none)")}</pre></details>`
         )
         .join("")}`
    : `<p class="muted">no review pack found — run <code>npm run social:publish -- review-pack</code></p>`;

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow, noarchive">
<title>Social Operator Dashboard — internal, read-only</title>
<style>
  :root { color-scheme: light dark; }
  * { box-sizing: border-box; }
  body { font: 14px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; margin: 0; padding: 1.5rem; max-width: 1100px; margin-inline: auto; }
  h1 { font-size: 1.3rem; margin: 0 0 .25rem; }
  h2 { font-size: 1rem; margin: 2rem 0 .5rem; border-bottom: 1px solid #8884; padding-bottom: .25rem; }
  h3 { font-size: .95rem; margin: 0 0 .25rem; }
  .sub { color: #8a8a8a; font-size: .8rem; }
  .muted { color: #8a8a8a; }
  table { border-collapse: collapse; width: 100%; font-size: .85rem; margin: .5rem 0; }
  th, td { text-align: left; padding: .35rem .5rem; border-bottom: 1px solid #8883; vertical-align: top; }
  th { font-weight: 600; color: #8a8a8a; }
  .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: .75rem; }
  .card { border: 1px solid #8884; border-radius: 8px; padding: .75rem 1rem; }
  .card dl { margin: .5rem 0 0; display: grid; grid-template-columns: 1fr auto; gap: .1rem .5rem; }
  .card dl div { display: contents; }
  .card dt { color: #8a8a8a; } .card dd { margin: 0; text-align: right; font-variant-numeric: tabular-nums; }
  .pill { display: inline-block; padding: .05rem .4rem; border-radius: 999px; font-size: .72rem; border: 1px solid #8886; }
  .pill.ok { background: #16a34a22; border-color: #16a34a; }
  .pill.bad { background: #dc262622; border-color: #dc2626; }
  .pill.warn { background: #d9770622; border-color: #d97706; }
  .pill.info { background: #2563eb22; border-color: #2563eb; }
  .pill.muted { background: #8882; }
  .summary { border: 2px solid #8886; border-radius: 8px; padding: 1rem; margin: 1rem 0; }
  .summary strong { font-size: 1.1rem; }
  code { font-size: .8rem; background: #8882; padding: .05rem .3rem; border-radius: 4px; word-break: break-all; }
  pre { background: #8881; padding: .6rem; border-radius: 6px; overflow-x: auto; font-size: .8rem; }
  details { margin: .25rem 0; }
  summary { cursor: pointer; }
  ul { padding-left: 1.1rem; } li { margin: .15rem 0; }
  .banner { background: #d9770622; border: 1px solid #d97706; border-radius: 6px; padding: .5rem .75rem; font-size: .85rem; }
</style>
</head>
<body>
<h1>Social Operator Dashboard</h1>
<p class="sub">Internal · READ-ONLY · generated ${esc(d.generated_at)} · not a route, not indexed, not in any sitemap</p>
<p class="banner">This page performs no write action: no Buffer publish/schedule, no batch approval, no eBay Browse call, no outreach send, no image-recovery trigger, no planner/ledger mutation.</p>

<div class="summary">
  <div><strong>TODAY — ${esc(s.date_brisbane)}</strong> <span class="sub">(${esc(s.date_utc)} UTC)</span></div>
  <table>
    ${row(["Fresh social content", String(s.fresh_social_content)])}
    ${row(["Planned placements", String(s.planned_placements)])}
    ${row(["Queued", String(s.queued)])}
    ${row(["Published", String(s.published)])}
    ${row(["Top blocker", pill(s.top_blocker, s.top_blocker === "none" ? "ok" : "bad")])}
    ${row(["Quota", pill(s.quota_state, statusKind(s.quota_state)) + (s.quota_reset ? ` <span class="sub">reset ${esc(s.quota_reset)}</span>` : "")])}
    ${row(["First-live readiness", pill(s.first_live_readiness, s.first_live_readiness === "BLOCKED" ? "bad" : "warn")])}
  </table>
</div>

<h2>Today — recommended content plan</h2>
<p class="sub">source: ${esc(d.today.snapshot_source ?? "none")}${d.today.snapshot_is_fixture ? " (FIXTURE — not fresh live data)" : ""} · captured ${esc(d.today.snapshot_captured_at ?? "—")}</p>
<table>
  <thead><tr><th>time</th><th>platform</th><th>family</th><th>goal</th><th>card / subject</th><th>tier</th><th>score</th><th>fresh until</th><th>status</th></tr></thead>
  <tbody>${todayRows}</tbody>
</table>

<h2>Platform summary</h2>
<div class="grid">${platformCards}</div>

<h2>Blockers</h2>
<ul>${blockerRows}</ul>

<h2>eBay Browse quota — read-only (free rate-limit read, NOT a Browse call)</h2>
<table>
  ${row(["state", pill(d.quota.state, statusKind(d.quota.state))])}
  ${row(["remaining / limit", `${esc(d.quota.remaining ?? "—")} / ${esc(d.quota.limit ?? "—")}`])}
  ${row(["reserve", String(d.quota.reserve)])}
  ${row(["reset", esc(d.quota.reset ?? "—")])}
  ${row(["source", esc(d.quota.source)])}
  ${row(["waiter last line", esc(d.quota.waiter_last_line ?? "—")])}
</table>

<h2>Freshness health</h2>
${
  d.freshness.available
    ? `<table>
    ${row(["active deals", String(d.freshness.active_deals)])}
    ${row(["freshest exact_verified_at", `${esc(d.freshness.freshest_hours ?? "—")} h ago`])}
    ${row(["verified ≤ 1h / ≤ 3h", `${d.freshness.within_1h} / ${d.freshness.within_3h}`])}
    ${row(["verified ≤ 6h / ≤ 12h", `${d.freshness.within_6h} / ${d.freshness.within_12h}`])}
    ${row(["social-eligible", `${d.freshness.social_eligible} <span class="sub">(social ceiling ${d.freshness.ceiling_hours}h)</span>`])}
  </table>
  ${d.freshness.social_eligible === 0 ? `<p class="banner">Social starvation is caused by verification freshness: 0 rows pass the ${d.freshness.ceiling_hours}h social ceiling right now.</p>` : ""}`
    : `<p class="muted">${esc(d.freshness.note)}</p>`
}

<h2>Planner summary</h2>
<table>
  ${row(["recommended placements", String(d.today.items.length)])}
  ${row(["unfilled slots", `${d.today.unfilled.length} <span class="sub">(reported, never padded)</span>`])}
  ${row(["plan states on file", esc(JSON.stringify(d.today.plan_counts))])}
</table>
${d.today.mix ? `<p class="sub">goal mix: ${Object.entries(d.today.mix.goal.byKey).map(([g, v]) => `${g} ${(v.share * 100).toFixed(0)}% [${v.status}]`).join(" · ")}</p><p class="sub">family mix: ${Object.entries(d.today.mix.family.byKey).map(([f, v]) => `${f} ${(v.share * 100).toFixed(0)}% [${v.status}]`).join(" · ")}</p>` : ""}
${d.today.warnings.length ? `<ul>${d.today.warnings.map((w) => `<li class="sub">⚠ ${esc(w)}</li>`).join("")}</ul>` : ""}
${d.today.not_scheduled.length ? `<details><summary>classified but not scheduled (${d.today.not_scheduled.length})</summary><ul>${d.today.not_scheduled.map((n) => `<li class="sub">${esc(n.family)} · ${esc(n.subject)}${n.platform ? ` (${esc(n.platform)})` : ""}: ${esc(n.reason)}</li>`).join("")}</ul></details>` : ""}

<h2>First-live status</h2>
<table><thead><tr><th>gate</th><th></th><th>detail</th></tr></thead><tbody>${flRows}</tbody></table>
<p><strong>OVERALL: ${pill(d.first_live.overall, d.first_live.overall === "BLOCKED" ? "bad" : "warn")}</strong></p>

<h2>Content detail</h2>
${detailBlocks || '<p class="muted">no planned items to inspect</p>'}

<h2>Review pack preview</h2>
${reviewPackHtml}

<h2>Social metrics</h2>
${
  d.metrics.anything_published
    ? `<table><thead><tr><th>platform</th><th>content</th><th>published</th><th>views</th><th>engagement</th><th>clicks</th><th>post URL</th></tr></thead><tbody>${d.metrics.per_placement
        .map((m) =>
          row([
            pill(m.platform),
            esc(m.content_id),
            esc(m.published_at ?? "—"),
            esc(m.metrics.views ?? "—"),
            esc(m.metrics.likes != null ? m.metrics.likes : "—"),
            esc(m.metrics.clicks ?? "—"),
            m.platform_post_url ? `<a href="${esc(m.platform_post_url)}" rel="noopener noreferrer">link</a>` : "—",
          ])
        )
        .join("")}</tbody></table>`
    : `<p>${pill("NOT_AVAILABLE_YET", "muted")} nothing has been published. Missing / unsupported metrics render as <code>—</code>, never a fake 0.</p>`
}

<h2>Conversion experiments (13E.10A)</h2>
${
  (d.experiments?.rows ?? []).length
    ? `<table><thead><tr><th>experiment</th><th>dimension</th><th>planned today A/B</th><th>published A/B</th><th>state</th><th>current leader</th></tr></thead><tbody>${d.experiments.rows
        .map((x) =>
          row([
            `<code>${esc(x.experiment_id)}</code>`,
            esc(x.dimension ?? "—"),
            `${x.planned_today.A} / ${x.planned_today.B}`,
            `${x.published.A} / ${x.published.B}`,
            pill(x.state, x.state === "WINNER_CANDIDATE" ? "ok" : x.state === "NOT_AVAILABLE_YET" ? "muted" : "info"),
            esc(x.leader),
          ])
        )
        .join("")}</tbody></table>
       <p class="sub">${d.experiments.anything_published ? "" : "Nothing with an experiment_id has been published — every state is NOT_AVAILABLE_YET (no fake 0 performance). "}The evaluator never changes production creative (§14, §15).</p>`
    : `<p>${pill("NOT_AVAILABLE_YET", "muted")} no experiment is assigned to any planned or published content yet.</p>`
}

<h2>Outreach status</h2>
<table><thead><tr><th>prospect</th><th>status</th><th>queued</th><th>sent</th></tr></thead><tbody>
${d.outreach.map((o) => row([esc(o.name), pill(o.status, o.status === "SENT" ? "ok" : o.status === "FAILED" ? "bad" : "info"), esc(o.queued_at ?? "—"), esc(o.sent_at ?? "—")])).join("")}
</tbody></table>

<h2>Image recovery status</h2>
<table>
  ${row(["waiter/job", pill(d.image_recovery.state, statusKind(d.image_recovery.state))])}
  ${row(["last log line", esc(d.image_recovery.last_line ?? "—")])}
  ${row(["NO_TRUSTED_IMAGE active rows", esc(d.image_recovery.imageless_active_rows ?? "— (not read)")])}
</table>

<h2>Subscribers (CRM-1 — counts only, no addresses)</h2>
${
  d.subscribers
    ? `<table>
  ${row(["active / pending", `${d.subscribers.active} / ${d.subscribers.pending}`])}
  ${row(["unsubscribed", String(d.subscribers.unsubscribed)])}
  ${row(["bounced / complained", `${d.subscribers.bounced} / ${d.subscribers.complained}`])}
  ${row(["signups — 7d / 30d", `${d.subscribers.signups_7d} / ${d.subscribers.signups_30d}`])}
</table>
<p class="sub">Full breakdown incl. top signup source: <code>npm run crm:summary</code></p>`
    : `<p class="muted">not read (—-no-db, or the newsletter_subscribers table is unavailable)</p>`
}

<h2>Verifier freshness mix (P0.4.3 — read-only)</h2>
${
  d.verifier_health
    ? `<table>
  ${row(["active BIN / AUCTION", `${d.verifier_health.active_bin} / ${d.verifier_health.active_auction}`])}
  ${row(["fresh BIN ≤1h / ≤3h / ≤6h" + (d.verifier_health.fresh_bin_6h === 0 && d.verifier_health.strong_bin_total > 5 ? " ⚠ SKEW" : ""), `${d.verifier_health.fresh_bin_1h} / ${d.verifier_health.fresh_bin_3h} / ${d.verifier_health.fresh_bin_6h}`])}
  ${row(["fresh AUCTION ≤6h", String(d.verifier_health.fresh_auction_6h)])}
  ${row(["strong BIN: total / fresh ≤6h / aging 3-6h / stale", `${d.verifier_health.strong_bin_total} / ${d.verifier_health.strong_bin_fresh_6h} / ${d.verifier_health.strong_bin_aging_3_6h} / ${d.verifier_health.strong_bin_stale}`])}
  ${row(["social-eligible BIN count", String(d.verifier_health.social_eligible_bin_count)])}
  ${row(["never-verified BIN / AUCTION", `${d.verifier_health.bin_never_verified} / ${d.verifier_health.auction_never_verified}`])}
  ${row(["Browse quota remaining", esc(String(d.verifier_health.quota_remaining ?? "—"))])}
</table>
<p class="sub">A large "strong BIN total" with 0 "fresh ≤6h" = verifier allocation skew (see <code>app/api/verify-deals</code> allocation block).</p>`
    : `<p class="muted">not read</p>`
}

<h2>Editorial backlog (SOCIAL-NEWSROOM-2 — read-only)</h2>
${
  d.editorial_backlog
    ? `<table>
  ${row(["migration applied", d.editorial_backlog.tables_ready ? "yes" : "NO — run supabase/social_editorial_newsroom_migration.sql"])}
  ${row(["overall health", esc(d.editorial_backlog.overall)])}
  ${row(["state: DB_PLANNED / BUFFER_READY / BUFFER_QUEUED / PUBLISHED", `${d.editorial_backlog.state_counts.DB_PLANNED} / ${d.editorial_backlog.state_counts.BUFFER_READY} / ${d.editorial_backlog.state_counts.BUFFER_QUEUED} / ${d.editorial_backlog.state_counts.PUBLISHED}`])}
  ${row(["queue window (oldest → newest scheduled)", `${d.editorial_backlog.oldest_queued ?? "—"} → ${d.editorial_backlog.newest_queued ?? "—"}`])}
  ${row(["stale-risk placements (QUEUED_CONTENT_STALE)", String(d.editorial_backlog.stale_risk)])}
  ${row(["visual-review WATCH count", String(d.editorial_backlog.vision_watch_count)])}
  ${row(["backlog-queue circuit", d.editorial_backlog.circuit.suspended ? `SUSPENDED (${esc(d.editorial_backlog.circuit.reason ?? "")})` : `${esc(d.editorial_backlog.circuit.state)} · failures 24h ${d.editorial_backlog.circuit.failures_24h}`])}
  ${row(["SOCIAL_BUFFER_BACKLOG_ENABLED", `${d.editorial_backlog.posture.enabled} · mode ${esc(d.editorial_backlog.posture.mode)}`])}
  ${Object.values(d.editorial_backlog.by_platform).map((h) => row([`${h.platform} — days covered / state`, `${h.days_covered}d / ${h.state} (target ${h.target_days[0]}-${h.target_days[1]}d, editorial cap ${h.editorial_capacity_per_day}/d, fresh reserve ${h.fresh_reserved_per_day}/d, next gap ${h.next_gap ?? "—"})`])).join("\n  ")}
  ${row(["refill needed", d.editorial_backlog.refill_needs.length ? esc(d.editorial_backlog.refill_needs.map((r) => `${r.platform}(+${r.need_slots})`).join(", ")) : "none"])}
  ${d.editorial_backlog.pack ? row(["support: NOW / LIMITED / NOT_READY", `${d.editorial_backlog.pack.support.supported_now.length} / ${d.editorial_backlog.pack.support.supported_with_limitations.length} / ${d.editorial_backlog.pack.support.data_not_ready.length}`]) : ""}
  ${d.editorial_backlog.pack ? row(["last sim: distinct series / open editorial slots / feed review", `${d.editorial_backlog.pack.series_diversity ?? "—"} / ${d.editorial_backlog.pack.unfilled_editorial_slots ?? "—"} / ${d.editorial_backlog.pack.feed_review ?? "—"}`]) : ""}
  ${d.editorial_backlog.pack?.editorial_balance ? row(["editorial balance", esc(Object.entries(d.editorial_backlog.pack.editorial_balance).map(([k, v]) => `${k} ${(v.share * 100).toFixed(0)}%(${v.status})`).join(", "))]) : ""}
  ${d.editorial_backlog.pack ? row(["fatigue warnings", d.editorial_backlog.pack.fatigue_warnings.length ? esc(d.editorial_backlog.pack.fatigue_warnings.join("; ")) : "none"]) : ""}
  ${d.editorial_backlog.pack?.vision_review ? row(["visual review (Layer 5)", `${esc(d.editorial_backlog.pack.vision_review.openai_vision_reviewer ?? "OpenAI gpt-4o")} · ${d.editorial_backlog.pack.vision_review.configured ? "configured" : "NOT configured → WATCH"}`]) : ""}
</table>
<p class="sub">${d.editorial_backlog.tables_ready ? "Backlog from persisted <code>social_story_placements</code>." : "<code>social_stories</code> not migrated yet — state shown for an empty backlog."} Read-only; nothing published or scheduled. BUFFER_QUEUED means the provider accepted a FUTURE-scheduled post, never that it published.</p>`
    : `<p class="muted">not read</p>`
}

<h2>Autonomous orchestration (AUTO-1 — read-only)</h2>
${
  d.autonomous
    ? `<table>
  ${row(["SOCIAL autonomous", `${pill(d.autonomous.social.mode, d.autonomous.social.mode === "LIVE" ? "ok" : d.autonomous.social.mode === "SUSPENDED" ? "bad" : "info")} · stage ${esc(d.autonomous.social.stage)} · circuit ${esc(d.autonomous.social.circuit)}`])}
  ${row(["social — last auto run / outcome", `${esc(d.autonomous.social.last_run_at ?? "—")} · ${esc(d.autonomous.social.last_outcome ?? "—")}`])}
  ${row(["social — last submission / last publish", `${esc(d.autonomous.social.last_submission ?? "—")} · ${esc(d.autonomous.social.last_publish ?? "—")}`])}
  ${row(["social — next window / last skip", `${esc(d.autonomous.social.next_window ?? "—")} · ${esc(d.autonomous.social.last_skip_reason ?? "—")}`])}
  ${row(["social — mutation failures 24h", String(d.autonomous.social.failures_24h)])}
  ${row(["EMAIL autonomous", `${pill(d.autonomous.email.mode, d.autonomous.email.mode === "LIVE" ? "ok" : d.autonomous.email.mode === "SUSPENDED" ? "bad" : "info")} · stage ${esc(d.autonomous.email.stage)} · circuit ${esc(d.autonomous.email.circuit)}`])}
  ${row(["email — last evaluation / outcome", `${esc(d.autonomous.email.last_eval_at ?? "—")} · ${esc(d.autonomous.email.last_outcome ?? "—")}`])}
  ${row(["email — last digest / status", `${esc(d.autonomous.email.last_digest_at ?? "—")} · ${esc(d.autonomous.email.last_digest_status ?? "—")}`])}
  ${row(["email — next eligible window", esc(d.autonomous.email.next_eligible_window ?? "—")])}
  ${row(["email — last skip reason", esc(d.autonomous.email.last_skip_reason ?? "—")])}
  ${row(["email — ACTIVE subscribers · DIGEST_SEND_ENABLED", `${d.autonomous.email.active_subscribers ?? "—"} · ${d.autonomous.email.digest_send_enabled}`])}
  ${row(["email — mutation failures 24h", String(d.autonomous.email.failures_24h)])}
</table>
<p class="sub">Plan a cycle: <code>npm run social:auto -- --dry-run</code> · <code>npm run crm:auto -- --dry-run</code>. Production flags are OFF (AUTO-1).</p>`
    : `<p class="muted">not read</p>`
}

<h2>Approval commands (§11 — no buttons; run these in a terminal)</h2>
<table>
${Object.entries(d.commands).map(([k, v]) => row([esc(k), `<code>${esc(v)}</code>`])).join("")}
</table>

<p class="sub">Flags: ${esc(d.flags.describe)}</p>
</body>
</html>
`;

  if (SECRET_RE.test(html)) {
    throw new Error("dashboard HTML would contain a secret-shaped string — refusing to write");
  }
  return html;
}

// ---- main -------------------------------------------------

async function main() {
  const data = await gather();
  if (AS_JSON) {
    console.log(JSON.stringify(data, null, 2));
  }
  const html = renderHtml(data);
  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(OUT_JSON, JSON.stringify(data, null, 2) + "\n", "utf8");
  writeFileSync(OUT_HTML, html, "utf8");

  const s = data.summary;
  console.log("\n  === SOCIAL OPERATOR DASHBOARD (read-only) ===");
  console.log(`  TODAY — ${s.date_brisbane}  (${s.date_utc} UTC)\n`);
  console.log(`  Fresh social content : ${s.fresh_social_content}`);
  console.log(`  Planned placements   : ${s.planned_placements}`);
  console.log(`  Queued / Published   : ${s.queued} / ${s.published}`);
  console.log(`  Top blocker          : ${s.top_blocker}`);
  console.log(`  Quota                : ${s.quota_state}${s.quota_reset ? `  (reset ${s.quota_reset})` : ""}`);
  console.log(`  First-live readiness : ${s.first_live_readiness}`);
  console.log(`\n  wrote ${path.relative(ROOT, OUT_HTML)}`);
  console.log(`  wrote ${path.relative(ROOT, OUT_JSON)}`);
  console.log("\n  READ ONLY. No Buffer call, no eBay Browse call, no publish, no schedule, no mutation.\n");
}

const isMain = (() => {
  try {
    return process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]));
  } catch {
    return false;
  }
})();
if (isMain) {
  main().catch((e) => {
    console.error(`\n  ✖ ${e && e.message ? e.message : e}\n`);
    process.exit(1);
  });
}
