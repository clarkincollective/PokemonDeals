#!/usr/bin/env node
// Phase SOCIAL-NEWSROOM-1 - `npm run social:backlog`
//
//   npm run social:backlog                 dry-run (default) - 14d editorial calendar sim
//   npm run social:backlog -- --status     backlog health only
//   npm run social:backlog -- --week       7-day horizon
//   npm run social:backlog -- --14d        14-day horizon (default)
//   npm run social:backlog -- --build      build the review pack (STILL no publish, no DB write)
//   npm run social:backlog -- reconcile    read-only Buffer vs local placement compare
//   npm run social:backlog -- --json       machine-readable
//
// It:
//   1. reads backlog health (from persisted placements, if the migration is applied)
//   2. reads a bounded, READ-ONLY data snapshot -> support matrix (§7)
//   3. derives supported story opportunities (FRESH lane from resolveLiveSource;
//      PLANNED lane from real aggregate data + labelled fixtures for editorial series)
//   4. ranks stories (organic / originality / conversion-proxy)
//   5. runs the deterministic QA layers (1-4) + records the vision-review gap (layer 5)
//   6. builds a balanced editorial calendar (§49) with reserved fresh capacity
//   7. writes a review pack to .social-preview/editorial-newsroom/
//
// NO publish. NO Buffer mutation. NO Supabase write. NO eBay Browse call.

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { config as loadDotenv } from "dotenv";
if (existsSync(".env.local")) loadDotenv({ path: ".env.local", quiet: true });
else loadDotenv({ quiet: true });

import { fetchActiveDealPool } from "../lib/social/db.mjs";
import { socialBinPool } from "../lib/social/candidates.mjs";
import { isBuyItNowOnly } from "../lib/social/eligibility.mjs";
import { hoursSinceExactVerification } from "../lib/dealQuality.js";
import { extractSpecies } from "../lib/pokemonSpecies.js";
import { RECOGNIZABLE_SPECIES } from "../lib/social/planner/scoring.mjs";
import { resolveLiveSource } from "./socialSource.mjs";
import { supabaseAdmin } from "../lib/supabaseAdmin.js";

import {
  makeStory,
  placementsForStory,
  organicScore,
  originalityScore,
  conversionProxy,
  runQaStack,
  minimumAutonomousQuality,
  buildSupportMatrix,
  buildEditorialCalendar,
  backlogHealth,
  refillNeeds,
  fatigueReport,
  sequenceCtaCheck,
  feedReview,
  stableStoryId,
  quantizedCapturedAtIso,
  storyRow,
  placementRows,
  qaRunRow,
  resolveBacklogPosture,
  scheduleTimeAcceptable,
  MAX_QUEUE_PER_RUN,
  MAX_QUEUE_PER_PLATFORM_PER_RUN,
  backlogCircuitStatus,
  noteBacklogFailure,
  noteBacklogSuccess,
  logEvent,
} from "../lib/social/newsroom/index.mjs";
import { loadStories, loadPlacements, loadQaRuns, tablesReady, upsertStory, upsertPlacements, patchPlacement, recordQaRun } from "../lib/social/newsroom/db.mjs";
import { reviewAvailable } from "../lib/newsroom/visualReview.mjs";
import { scheduleOne, reconcileOne, queuedContentStale, resolveProviderMode } from "../lib/newsroom/bufferBacklog.mjs";

const ROOT = process.cwd();
const OUT_DIR = path.join(ROOT, ".social-preview", "editorial-newsroom");
const args = process.argv.slice(2);
const has = (f) => args.includes(f) || args.includes(f.replace(/^--/, ""));
const JSON_OUT = has("--json");
const MODE = has("--refill") ? "refill" : has("--reconcile") ? "reconcile" : has("--status") ? "status" : "plan";
const DO_BUILD = has("--build") || has("--queue"); // --queue implies build
const DO_QUEUE = has("--queue");
const HORIZON_DAYS = has("--week") ? 7 : 14;
const NOW = Date.now();

function log(...a) {
  if (!JSON_OUT) console.log(...a);
}

// ---------------------------------------------------------------
// bounded, READ-ONLY data stats for the support matrix (§7)
// ---------------------------------------------------------------
async function buildDataStats() {
  const { rows, error } = await fetchActiveDealPool({ poolLimit: 3000 });
  if (error) return { error, stats: {} };
  const bin = socialBinPool(rows, NOW);
  const fresh = bin.filter((r) => {
    const h = hoursSinceExactVerification(r, NOW);
    return Number.isFinite(h) && h <= 6;
  });
  const usd = (r) => Number(r.total_price_usd ?? r.total_price ?? NaN);
  const perSet = {};
  for (const r of fresh) if (r.card_set) perSet[r.card_set] = (perSet[r.card_set] ?? 0) + 1;

  // catalogue priced-card count (bounded head count, read-only)
  let catalogPriced = 0;
  try {
    const db = supabaseAdmin();
    const { count } = await db
      .from("card_catalog")
      .select("tcgplayer_id", { count: "exact", head: true })
      .gt("market_price", 0);
    catalogPriced = count ?? 0;
  } catch {
    catalogPriced = 0;
  }

  // price-history breadth (bounded head count)
  let priceHistoryDays = 0;
  try {
    const db = supabaseAdmin();
    const { count } = await db.from("price_history").select("id", { count: "exact", head: true });
    priceHistoryDays = count && count > 500 ? 21 : count && count > 100 ? 10 : count && count > 0 ? 4 : 0;
  } catch {
    priceHistoryDays = 0;
  }

  const stats = {
    fresh_bin_deal_count: fresh.length,
    fresh_graded_bin_count: fresh.filter((r) => r.is_graded).length,
    recent_discovery_bin_count: fresh.filter((r) => {
      const t = Date.parse(r.first_seen_at ?? "");
      return Number.isFinite(t) && NOW - t <= 48 * 3600_000;
    }).length,
    fresh_bin_under_25_count: fresh.filter((r) => usd(r) < 25).length,
    fresh_bin_under_50_count: fresh.filter((r) => usd(r) < 50).length,
    fresh_bin_under_100_count: fresh.filter((r) => usd(r) < 100).length,
    max_fresh_bin_per_set: Math.max(0, ...Object.values(perSet)),
    vintage_bin_count: bin.filter((r) => /base|jungle|fossil|neo|gym|wotc|rocket|1999|2000/i.test(String(r.card_set ?? ""))).length,
    catalog_priced_card_count: catalogPriced,
    price_history_days: priceHistoryDays,
    max_price_history_points_one_card: priceHistoryDays >= 21 ? 12 : priceHistoryDays >= 10 ? 6 : 0,
    sets_with_price_observations: priceHistoryDays >= 10 ? 6 : 0,
    species_with_price_observations: priceHistoryDays >= 10 ? 6 : 0,
    weekly_top_deal_history_days: priceHistoryDays >= 10 ? 7 : 3,
    weekly_new_deal_count: rows.filter((r) => {
      const t = Date.parse(r.first_seen_at ?? "");
      return Number.isFinite(t) && NOW - t <= 7 * 86400_000;
    }).length,
    safe_rejection_example_count: 0, // disqualified rows are not in the active pool; needs a dedicated read (deferred)
    has_shipping_delta_example: false,
    has_bin_price_drop_signal: false,
    max_live_listings_one_printing: (() => {
      const byPrint = {};
      for (const r of bin) if (r.card_tcgplayer_id) byPrint[r.card_tcgplayer_id] = (byPrint[r.card_tcgplayer_id] ?? 0) + 1;
      return Math.max(0, ...Object.values(byPrint));
    })(),
    printings_across_marketplaces: 0,
    vintage_and_modern_reference_count: 0,
  };
  return { stats, poolSize: rows.length, binSize: bin.length, freshBin: fresh.length, freshDeals: fresh };
}

// ---------------------------------------------------------------
// story opportunities
// ---------------------------------------------------------------
function factsForDeal(r) {
  const market = Number(r.market_price ?? NaN);
  const paid = Number(r.total_price_usd ?? r.total_price ?? NaN);
  return {
    exact_verified_at: r.exact_verified_at ?? null,
    discount_pct: Number(r.discount_pct ?? 0),
    dollars_saved: Number.isFinite(market) && Number.isFinite(paid) ? Math.max(0, market - paid) : 0,
    card_tcgplayer_id: r.card_tcgplayer_id ?? null,
    card_set: r.card_set ?? null,
    market_price: Number.isFinite(market) ? market : null,
    total_price_usd: Number.isFinite(paid) ? paid : null,
    recognisable: RECOGNIZABLE_SPECIES.has(String(extractSpecies(r.card_name ?? "") ?? "").toLowerCase()),
    has_exact_destination: true,
  };
}

function freshLaneStories(freshDeals, capturedAt, sourceCommit) {
  const out = [];
  const sorted = [...freshDeals].sort((a, b) => Number(b.discount_pct ?? 0) - Number(a.discount_pct ?? 0));
  for (const r of sorted.slice(0, 8)) {
    const species = String(extractSpecies(r.card_name ?? "") ?? "").toLowerCase() || null;
    out.push(
      makeStory({
        series: "DEAL_DROP",
        subjectType: "card",
        subjectId: r.card_slug ?? `${r.card_name}-${r.card_set}`,
        pokemon: species,
        setId: r.card_set ?? null,
        cardIds: r.card_tcgplayer_id ? [r.card_tcgplayer_id] : [],
        dealIds: [r.id],
        capturedAt,
        facts: factsForDeal(r),
        sourceCommit,
      })
    );
  }
  return out;
}

// PLANNED-lane editorial stories: one representative story per
// SUPPORTED (NOW/LIMITED) editorial series. Evergreen explainers are
// concept stories (no live data needed). Data-backed editorial series get
// a story only when their required facts are SUPPORTED.
function plannedLaneStories(matrix, sourceCommit) {
  const out = [];
  for (const row of matrix.rows) {
    if (row.support === "DATA_NOT_READY") continue; // §9 - never forced
    if (row.clock === "LIVE") continue; // handled by the fresh lane
    // §8 - a LIMITED series only produces a story when its required facts
    // are actually satisfied this run (SUPPORTED_WITH_LIMITATIONS still
    // means the checks cleared the "thin" threshold, not DATA_NOT_READY).
    const subjectId = `${row.series.toLowerCase()}-representative`;
    // stable per-series captured_at (real ISO) -> idempotent story id + a
    // valid timestamptz for the DB column.
    const capturedAt = quantizedCapturedAtIso(row.series, { now: NOW });
    out.push(
      makeStory({
        series: row.series,
        subjectType: row.requires.length ? "catalog" : "concept",
        subjectId,
        capturedAt,
        facts: {
          headline_fact: row.requires.length ? `derived from: ${row.checks.map((c) => c.detail).join("; ")}` : null,
          layout_family: row.pillar.toLowerCase(),
          numeric_structure: row.pillar === "MARKET" ? "distribution" : row.pillar === "COMPARISON" ? "compare" : null,
        },
        sourceCommit,
      })
    );
    // overwrite with the deterministic stable id so repeated builds upsert
    out[out.length - 1].story_id = stableStoryId({ series: row.series, subjectType: row.requires.length ? "catalog" : "concept", subjectId, now: NOW });
  }
  return out;
}

function scoreStory(story, context) {
  const organic = organicScore(story);
  const originality = originalityScore(story, context, NOW);
  const conv = conversionProxy(story);
  return { organic, originality, conversion_proxy: conv };
}

// ---------------------------------------------------------------
// MAIN
// ---------------------------------------------------------------
(async () => {
  mkdirSync(OUT_DIR, { recursive: true });

  // persisted placements (empty until the migration is applied)
  const ready = await tablesReady().catch(() => false);
  const placed = ready ? (await loadPlacements({})).rows : [];
  const health = backlogHealth(placed, { now: NOW });

  if (MODE === "status") {
    const payload = { generated_at: new Date(NOW).toISOString(), tables_ready: ready, backlog_health: health, refill_needs: refillNeeds(health) };
    if (JSON_OUT) return console.log(JSON.stringify(payload, null, 2));
    log("EDITORIAL BACKLOG HEALTH");
    for (const [p, h] of Object.entries(health.by_platform)) {
      log(`  ${p.padEnd(10)} ${String(h.days_covered).padStart(5)}d  ${h.state.padEnd(10)} (target ${h.target_days[0]}-${h.target_days[1]}d, cap ${h.editorial_capacity_per_day}/d, reserve ${h.fresh_reserved_per_day}/d, next gap ${h.next_gap ?? "-"})`);
    }
    log(`  overall: ${health.overall}`);
    const rn = refillNeeds(health);
    log(rn.length ? `  refill: ${rn.map((r) => `${r.platform}(+${r.need_slots})`).join(", ")}` : "  refill: none");
    if (!ready) log("\n  (social_stories table not found - run supabase/social_editorial_newsroom_migration.sql; health shown is for an empty backlog)");
    return;
  }

  if (MODE === "refill") {
    // SOCIAL-NEWSROOM-3 - the recurring PLANNED-BACKLOG refill. SAME shared
    // implementation the /api/social-backlog-refill cron uses (SS40 - no
    // second impl). Renders/QA/consensus/host must have run first (this
    // stage schedules already-BUFFER_READY placements). dryRun unless
    // SOCIAL_BUFFER_BACKLOG_ENABLED=true + SOCIAL_BUFFER_BACKLOG_MODE=scheduled.
    const { refillQueueReconcile } = await import("../lib/newsroom/backlogRefill.mjs");
    const { acquireRefillLock, releaseRefillLock } = await import("../lib/social/newsroom/db.mjs");
    const { qaRetentionReport, classifyQaRows } = await import("../lib/social/newsroom/qaRetention.mjs");
    const lock = await acquireRefillLock({ holder: "cli" });
    const payload = { generated_at: new Date(NOW).toISOString(), tables_ready: ready };
    if (!lock.acquired) {
      payload.refill = { ok: false, outcome: lock.reason ?? "LOCK_UNAVAILABLE" };
    } else {
      try {
        const enabled = process.env.SOCIAL_BUFFER_BACKLOG_ENABLED === "true";
        payload.refill = await refillQueueReconcile({ dryRun: !enabled, initial: true });
        const { rows: qa } = ready ? await loadQaRuns({ limit: 5000 }) : { rows: [] };
        const placementState = Object.fromEntries(placed.map((p) => [p.placement_id, p.status]));
        payload.qa_retention = qaRetentionReport(qa, placementState, {
          rowsPerRefill: (payload.refill.candidates_considered || 0) * 2 + 5, refillsPerWeek: 2,
        });
      } finally {
        await releaseRefillLock({ holder: "cli" });
      }
    }
    if (JSON_OUT) return console.log(JSON.stringify(payload, null, 2));
    const rr = payload.refill;
    log(`REFILL: ${rr.outcome} (dryRun=${rr.dry_run})`);
    log(`  circuit ${rr.circuit?.state} | posture ${rr.posture?.mode ?? "-"} | considered ${rr.candidates_considered} curated ${rr.curated} queued ${rr.queued?.length ?? 0} skipped ${rr.skipped?.length ?? 0}`);
    log(`  feed ${rr.feed_verdict ?? "-"} | commercial share ${rr.commercial_share ?? "-"}`);
    for (const q of rr.queued ?? []) log(`  + ${q.series} ${q.platform} [${q.family_status}] -> ${q.provider_state}${q.provider_ref ? ` ref=${q.provider_ref}` : ""} @ ${q.scheduled_brisbane}`);
    for (const s of (rr.skipped ?? []).slice(0, 12)) log(`  - ${s.series ?? s.placement_id}: ${s.reason}`);
    if (payload.qa_retention) log(`  qa_runs: ${payload.qa_retention.total} rows (${payload.qa_retention.severity}) - ${payload.qa_retention.action}`);
    return;
  }

  if (MODE === "reconcile") {
    const hasBuffer = Boolean(process.env.BUFFER_ACCESS_TOKEN);
    const queuedRows = placed.filter((p) => p.buffer_provider_ref);
    const findings = [];
    let published = 0;
    if (hasBuffer && ready && queuedRows.length) {
      const storyById = Object.fromEntries((await loadStories({})).rows.map((s) => [s.story_id, s]));
      for (const p of queuedRows) {
        const rc = await reconcileOne({ placement: p });
        const story = storyById[p.story_id];
        const stale = story ? queuedContentStale(story, p, { now: NOW }) : false;
        if (rc.published) {
          published++;
          logEvent("BUFFER_RECONCILED", { placement_id: p.placement_id, published: true });
        } else if (rc.drift) {
          logEvent("BUFFER_DRIFT", { placement_id: p.placement_id, drift: rc.drift });
        } else {
          logEvent("BUFFER_RECONCILED", { placement_id: p.placement_id, provider_state: rc.providerState });
        }
        if (stale) logEvent("QUEUED_CONTENT_STALE", { placement_id: p.placement_id, story_id: p.story_id });
        findings.push({
          placement_id: p.placement_id, story_id: p.story_id, platform: p.platform,
          local_status: p.status, provider_state: rc.providerState ?? null,
          drift: rc.drift ?? null, published: Boolean(rc.published),
          scheduled_for: p.scheduled_for ?? null,
          stale_risk: stale ? "QUEUED_CONTENT_STALE" : null,
        });
      }
    }
    const payload = {
      generated_at: new Date(NOW).toISOString(),
      buffer_configured: hasBuffer,
      tables_ready: ready,
      persisted_placements: placed.length,
      queued_placements: queuedRows.length,
      published_detected: published,
      result: !hasBuffer ? "BUFFER_NOT_CONFIGURED" : !ready ? "MIGRATION_REQUIRED" : queuedRows.length === 0 ? "NOTHING_TO_RECONCILE" : "RECONCILED",
      findings,
      note: "read-only: reconcile never resubmits or mutates Buffer (§29). PUBLISHED is only inferred from provider sent-evidence.",
    };
    return console.log(JSON.stringify(payload, null, 2));
  }

  // ---- PLAN ----
  const capturedAt = new Date(NOW).toISOString();
  const live = await resolveLiveSource({ sourceCommit: null }).catch((e) => ({ empty: true, empty_reason: String(e.message) }));
  const sourceCommit = live?.source_commit ?? null;
  const { stats, poolSize, binSize, freshBin, freshDeals = [], error: statsErr } = await buildDataStats();
  const matrix = buildSupportMatrix(stats);

  const fresh = statsErr ? [] : freshLaneStories(freshDeals, capturedAt, sourceCommit);
  const planned = plannedLaneStories(matrix, sourceCommit);
  const allStories = [...fresh, ...planned];

  // score + QA + minimum-autonomous-quality filter
  const context = []; // no published/queued history yet
  const candidates = [];
  const rejected = [];
  for (const story of allStories) {
    const sc = scoreStory(story, context);
    story.organic_score = sc.organic;
    story.originality_score = sc.originality;
    story.conversion_score = sc.conversion_proxy;
    const placements = placementsForStory(story);
    if (!placements.length) {
      rejected.push({ story_id: story.story_id, series: story.series, reason: "no eligible platform placement" });
      continue;
    }
    const qa = runQaStack(story, {
      creativeMeta: {
        family: story.pillar === "DEALS" ? "deal_drop" : "brand_ad",
        canvasW: 1080, canvasH: 1350,
        hookText: (sc.organic >= 0.6 ? "STRONG EDITORIAL HOOK" : "HOOK"), hookPx: 70,
        ctaCount: 1, brandMarkCount: 1, minInlineFontPx: 26,
        numericCallouts: story.facts_json.discount_pct ? [`${Math.round(story.facts_json.discount_pct * 100)}%`] : [],
        cardMaxHeightPx: 640,
      },
      // CONTENT-quality simulation: assume the render-time rights clear
      // (they always would for our own deterministic render) so the QA
      // stack reflects the story/creative quality. The LIVE runtime still
      // enforces rights_cleared + the vision review before BUFFER_READY -
      // see summary.runtime_gates_not_evaluated.
      rights: { rightsCleared: true, artifactIsOwnRender: true },
      requireVisualReview: false, // planning pass: layer 5 (vision) is a runtime gate, recorded separately
      originalityContext: context,
      sequenceOk: true,
    });
    const maq = minimumAutonomousQuality(story, qa, { conversionScore: sc.conversion_proxy, originalityContext: context, now: NOW });
    const rec = { story, placements, ...sc, qa_professional: qa.professional_result, qa_blockers: qa.blockers, maq_ok: maq.ok, maq_reasons: maq.reasons, exceptional: maq.exceptional };
    if (maq.ok) candidates.push(rec);
    else rejected.push({ story_id: story.story_id, series: story.series, reason: `min autonomous quality: ${maq.reasons.join("; ")}` });
  }

  const calCands = candidates.map((c) => ({
    story: c.story, placements: c.placements,
    organic_score: c.organic, conversion_score: c.conversion_proxy, originality_score: c.originality,
    exceptional: c.exceptional,
  }));
  const { calendar, diagnostics } = buildEditorialCalendar(calCands, { horizonDays: HORIZON_DAYS, now: NOW });

  // simulation summary
  const fixedSlots = Object.values(calendar).flat().filter((s) => s.type === "FIXED_EDITORIAL_SLOT");
  const bySeries = {}, byPillar = {}, byPokemon = {}, bySet = {}, byLayout = {};
  for (const s of fixedSlots) {
    bySeries[s.series] = (bySeries[s.series] ?? 0) + 1;
    byPillar[s.pillar] = (byPillar[s.pillar] ?? 0) + 1;
  }
  for (const c of candidates) {
    if (c.story.pokemon) byPokemon[c.story.pokemon] = (byPokemon[c.story.pokemon] ?? 0) + 1;
    if (c.story.set_id) bySet[c.story.set_id] = (bySet[c.story.set_id] ?? 0) + 1;
    byLayout[c.story.pillar.toLowerCase()] = (byLayout[c.story.pillar.toLowerCase()] ?? 0) + 1;
  }
  const orgDist = candidates.map((c) => c.organic).sort((a, b) => a - b);
  const convDist = candidates.map((c) => c.conversion_proxy).sort((a, b) => a - b);
  const pct = (arr, p) => (arr.length ? arr[Math.min(arr.length - 1, Math.floor((p / 100) * arr.length))] : null);
  const ctaSeq = sequenceCtaCheck(fixedSlots.map((s) => ({ cta_intensity: candidates.find((c) => c.story.story_id === s.story_id)?.story.cta_intensity ?? "SOFT" })));
  const fatigue = fatigueReport(fixedSlots.map((s) => ({ series: s.series, pillar: s.pillar, story: candidates.find((c) => c.story.story_id === s.story_id)?.story, time_utc: s.time_utc })), { now: NOW });

  // §33 feed-level review over the next ~12 planned editorial posts
  const feedStrip = fixedSlots
    .slice()
    .sort((a, b) => Date.parse(a.time_utc) - Date.parse(b.time_utc))
    .map((s) => ({ story: candidates.find((c) => c.story.story_id === s.story_id)?.story }))
    .filter((x) => x.story);
  const feed = feedReview(feedStrip);
  logEvent("FEED_REVIEW", { verdict: feed.verdict, sample: feed.sample, warnings: feed.warnings.length });

  // ---- §7/§22 BUILD (persist) + §10 QUEUE (Buffer future schedule) ----
  const posture = resolveBacklogPosture(process.env, { requestQueue: DO_QUEUE });
  const circuit = await backlogCircuitStatus();
  const build = { attempted: DO_BUILD, tables_ready: ready, stories_upserted: 0, placements_upserted: 0, qa_runs: 0, skipped: [], error: null };
  const queue = { attempted: DO_QUEUE, posture, circuit, provider_mode: resolveProviderMode(process.env), requests: 0, queued: 0, results: [], blocked_reason: null };
  const persistedStories = [];

  if (DO_BUILD) {
    if (!ready) {
      build.error = "MIGRATION_REQUIRED";
      build.skipped.push("social_stories/social_story_placements/social_qa_runs not found - run supabase/social_editorial_newsroom_migration.sql");
    } else {
      // persist ONLY calendar-placed editorial stories that passed min quality
      const placedIds = new Set(fixedSlots.map((s) => s.story_id));
      for (const c of candidates) {
        if (!placedIds.has(c.story.story_id)) continue;
        if (c.story.lane === "FRESH") continue; // never persist a LIVE deal story through the backlog builder
        c.story.status = "PLANNED";
        c.story.professional_score = c.qa_professional;
        const sRow = storyRow(c.story, { now: NOW, sourceCommit });
        const sRes = await upsertStory(sRow);
        if (sRes.error) { build.error = sRes.error; break; }
        build.stories_upserted += sRes.wrote;
        // attach the calendar slot time to each placement
        const slot = fixedSlots.find((s) => s.story_id === c.story.story_id);
        const pls = c.placements.map((p) => ({ ...p, planned_for: slot?.time_utc ?? null, content_id: p.content_id ?? c.story.story_id }));
        const pRes = await upsertPlacements(placementRows(c.story, pls, { now: NOW }));
        if (pRes.error) { build.error = pRes.error; break; }
        build.placements_upserted += pRes.wrote;
        const qRes = await recordQaRun(qaRunRow({ storyId: c.story.story_id, qaType: "STACK", result: c.qa_professional, score: c.organic, blockers: c.qa_blockers, detail: { min_autonomous_quality: c.maq_ok } }));
        build.qa_runs += qRes.wrote ?? 0;
        logEvent(c.qa_professional === "PASS" ? "QA_PASS" : c.qa_professional === "WATCH" ? "QA_WATCH" : "QA_FAIL", { story_id: c.story.story_id, series: c.story.series });
        logEvent("STORY_CREATED", { story_id: c.story.story_id, series: c.story.series, lane: c.story.lane });
        for (const p of pls) logEvent("PLACEMENT_PLANNED", { story_id: c.story.story_id, platform: p.platform, planned_for: p.planned_for });
        persistedStories.push({ story: c.story, placements: pls, qa_professional: c.qa_professional });
      }
    }
  }

  if (DO_QUEUE) {
    if (circuit.suspended) {
      queue.blocked_reason = `BACKLOG_SUSPENDED (${circuit.reason})`;
    } else if (!posture.canQueueProvider) {
      queue.blocked_reason = posture.reason;
    } else if (!ready) {
      queue.blocked_reason = "MIGRATION_REQUIRED - no persisted placements to schedule";
    } else {
      // Only evergreen/editorial, professional QA PASS, future schedule >= now + 60m.
      // Layer-5 visual review requires a rendered+hosted artifact; without one
      // the placement stays WATCH -> held (fail-closed, §20/§22).
      const perPlatform = {};
      for (const ps of persistedStories) {
        if (queue.requests >= MAX_QUEUE_PER_RUN) break;
        if (ps.qa_professional !== "PASS") { queue.results.push({ story_id: ps.story.story_id, queued: false, reason: `professional QA ${ps.qa_professional}` }); continue; }
        for (const p of ps.placements) {
          if (queue.requests >= MAX_QUEUE_PER_RUN) break;
          if ((perPlatform[p.platform] ?? 0) >= MAX_QUEUE_PER_PLATFORM_PER_RUN) continue;
          if (!p.hosted_url || !p.artifact_hash) {
            queue.results.push({ story_id: ps.story.story_id, platform: p.platform, queued: false, reason: "no rendered+hosted artifact - visual review cannot run -> WATCH (held)" });
            continue;
          }
          queue.requests++;
          perPlatform[p.platform] = (perPlatform[p.platform] ?? 0) + 1;
          logEvent("BUFFER_QUEUE_REQUEST", { story_id: ps.story.story_id, platform: p.platform, scheduled_for: p.planned_for });
          const r = await scheduleOne({ story: ps.story, placement: p, channelId: null, caption: null, dueAtUtc: p.planned_for, professionalResult: "PASS", mode: queue.provider_mode });
          if (r.queued) {
            queue.queued++;
            await patchPlacement(p.placement_id, r.placement_patch);
            logEvent("BUFFER_QUEUED", { story_id: ps.story.story_id, platform: p.platform, provider_ref: r.provider_ref, provider_state: r.provider_state });
            queue.results.push({ story_id: ps.story.story_id, platform: p.platform, queued: true, provider_ref: r.provider_ref, scheduled_for: r.placement_patch.scheduled_for, provider_state: r.provider_state });
          } else {
            noteBacklogFailure({ reason: "provider_schedule_failure", detail: (r.blockers ?? []).join("; ") });
            queue.results.push({ story_id: ps.story.story_id, platform: p.platform, queued: false, reason: r.reason, blockers: r.blockers });
          }
        }
      }
      if (queue.queued > 0) noteBacklogSuccess({});
    }
  }

  const summary = {
    generated_at: new Date(NOW).toISOString(),
    horizon_days: HORIZON_DAYS,
    source_is_live: Boolean(live?.source_is_live),
    live_empty_reason: live?.empty ? live.empty_reason : null,
    data: { active_pool: poolSize ?? 0, bin_pool: binSize ?? 0, fresh_bin_6h: freshBin ?? 0, stats },
    support_matrix: {
      supported_now: matrix.summary.SUPPORTED_NOW,
      supported_with_limitations: matrix.summary.SUPPORTED_WITH_LIMITATIONS,
      data_not_ready: matrix.summary.DATA_NOT_READY,
    },
    opportunities: { fresh_lane: fresh.length, planned_lane: planned.length, passed_min_quality: candidates.length, rejected: rejected.length },
    calendar_sim: {
      fixed_editorial_slots: fixedSlots.length,
      per_platform: diagnostics.platform,
      unfilled_editorial_slots: diagnostics.unfilled.length,
      series_diversity: Object.keys(bySeries).length,
      series_counts: bySeries,
      pillar_counts: byPillar,
      editorial_balance: diagnostics.balance,
      same_pokemon_repeats: Object.entries(byPokemon).filter(([, n]) => n > 1).map(([k, n]) => `${k}x${n}`),
      same_set_repeats: Object.entries(bySet).filter(([, n]) => n > 1).map(([k, n]) => `${k}x${n}`),
      same_layout_repeats: Object.entries(byLayout).filter(([, n]) => n > 2).map(([k, n]) => `${k}x${n}`),
      organic_score_dist: { min: orgDist[0] ?? null, p50: pct(orgDist, 50), p90: pct(orgDist, 90), max: orgDist[orgDist.length - 1] ?? null },
      conversion_proxy_dist: { min: convDist[0] ?? null, p50: pct(convDist, 50), p90: pct(convDist, 90), max: convDist[convDist.length - 1] ?? null },
      cta_sequence: ctaSeq,
      sequence_gate: diagnostics.sequence,
      fatigue,
    },
    backlog_health: health,
    refill_needs: refillNeeds(health),
    feed_review: feed,
    build,
    queue,
    vision_review: {
      openai_vision_reviewer: "lib/newsroom/visualReview.mjs (OpenAI Chat Completions, gpt-4o, image input) - OUTSIDE lib/social",
      configured: reviewAvailable(),
      layer5_verdict_when_unconfigured: "WATCH (cannot autonomously schedule)",
      cache: "keyed by artifact sha256 (.social-preview/editorial-newsroom/visual-review-cache.json)",
    },
    runtime_gates_not_evaluated: [
      "rights_cleared per artifact (assumed cleared in this content-quality sim)",
      "vision review (Layer 5) - env-gated; WATCH when unconfigured, cannot auto-schedule",
      "distribution gates.mjs (publish_switch, live_mode, epn, owner_approval, freshness_at_send)",
      "RIGHTS_STATE.publishing must be ALLOWED (code constant, currently DISABLED)",
    ],
    publishing: {
      published: 0,
      scheduled: queue.queued,
      provider_requests: queue.requests,
      supabase_story_writes: build.stories_upserted,
      supabase_placement_writes: build.placements_upserted,
      ebay_browse_calls: 0,
      stage1: "OFF",
      rights_state_publishing: "DISABLED",
    },
  };

  writeFileSync(path.join(OUT_DIR, "backlog-summary.json"), JSON.stringify(summary, null, 2) + "\n");
  writeFileSync(path.join(OUT_DIR, "calendar-14d.json"), JSON.stringify(calendar, null, 2) + "\n");
  writeFileSync(path.join(OUT_DIR, "support-matrix.json"), JSON.stringify(matrix, null, 2) + "\n");
  writeFileSync(
    path.join(OUT_DIR, "README.txt"),
    `${DO_QUEUE ? "BACKLOG BUILD + QUEUE" : DO_BUILD ? "BACKLOG BUILD (persist)" : "SIMULATION / REVIEW ONLY"} - SOCIAL-NEWSROOM-2\n` +
      "Live social publishing is OFF. Stage 1 OFF. RIGHTS_STATE.publishing DISABLED.\n" +
      "Any Buffer request in --queue mode is a FUTURE-scheduled draft/scheduled post (>= now + 60m), never an immediate publish.\n" +
      "eBay Browse calls: 0.\n"
  );

  if (JSON_OUT) return console.log(JSON.stringify(summary, null, 2));

  log(`SOCIAL EDITORIAL NEWSROOM - ${DO_QUEUE ? "BUILD + QUEUE" : DO_BUILD ? "BUILD (persist)" : "DRY RUN"} (no immediate publish)`);
  log(`  build: tables_ready ${build.tables_ready} | stories +${build.stories_upserted} | placements +${build.placements_upserted} | qa_runs +${build.qa_runs}${build.error ? ` | ${build.error}` : ""}`);
  log(`  queue: mode ${posture.mode} (${posture.reason}) | requests ${queue.requests} | queued ${queue.queued}${queue.blocked_reason ? ` | blocked: ${queue.blocked_reason}` : ""}`);
  log(`  feed review: ${feed.verdict}${feed.warnings.length ? ` (${feed.warnings.join("; ")})` : ""}`);
  log(`  circuit: ${circuit.suspended ? "SUSPENDED" : circuit.state} (failures 24h: ${circuit.failures_24h})`);
  log(`  source live: ${summary.source_is_live}${summary.live_empty_reason ? ` (${summary.live_empty_reason})` : ""}`);
  log(`  data: pool ${summary.data.active_pool}, BIN ${summary.data.bin_pool}, fresh BIN <=6h ${summary.data.fresh_bin_6h}`);
  log(`  support: NOW ${matrix.summary.SUPPORTED_NOW.length} / LIMITED ${matrix.summary.SUPPORTED_WITH_LIMITATIONS.length} / NOT_READY ${matrix.summary.DATA_NOT_READY.length}`);
  log(`  opportunities: fresh ${fresh.length} + planned ${planned.length} -> ${candidates.length} pass min quality`);
  log(`  ${HORIZON_DAYS}d calendar: ${fixedSlots.length} editorial slots filled, ${diagnostics.unfilled.length} open, ${Object.keys(bySeries).length} distinct series`);
  for (const [p, d] of Object.entries(diagnostics.platform)) {
    log(`    ${p.padEnd(10)} fixed ${d.fixed_editorial}, reserved ${d.reserved_fresh}, open ${d.open}, ~${d.days_covered}d`);
  }
  log(`  editorial balance: ${Object.entries(diagnostics.balance.byBucket).map(([k, v]) => `${k} ${(v.share * 100).toFixed(0)}%(${v.status})`).join(", ")}`);
  log(`  CTA sequence ok: ${ctaSeq.ok} (${ctaSeq.warnings.join("; ") || "clean"})`);
  log(`  fatigue warnings: ${fatigue.warnings.join("; ") || "none"}`);
  log(`  visual review (Layer 5): OpenAI gpt-4o reviewer ${reviewAvailable() ? "configured (lib/newsroom/visualReview.mjs)" : "NOT configured -> WATCH"}`);
  log(`  backlog health: ${health.overall}`);
  log(`  review pack: ${path.relative(ROOT, OUT_DIR)}/`);
})().catch((e) => {
  console.error("social:backlog failed:", e?.stack || e?.message || e);
  process.exit(1);
});
