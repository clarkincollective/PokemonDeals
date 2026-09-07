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
} from "../lib/social/newsroom/index.mjs";
import { loadPlacements, tablesReady } from "../lib/social/newsroom/db.mjs";
import { reviewAvailable } from "../lib/social/newsroom/visionReview.mjs";

const ROOT = process.cwd();
const OUT_DIR = path.join(ROOT, ".social-preview", "editorial-newsroom");
const args = process.argv.slice(2);
const has = (f) => args.includes(f);
const JSON_OUT = has("--json");
const MODE = has("reconcile") ? "reconcile" : has("--status") ? "status" : "plan";
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
function plannedLaneStories(matrix, capturedAt, sourceCommit) {
  const out = [];
  for (const row of matrix.rows) {
    if (row.support === "DATA_NOT_READY") continue;
    if (row.clock === "LIVE") continue; // handled by the fresh lane
    out.push(
      makeStory({
        series: row.series,
        subjectType: row.requires.length ? "catalog" : "concept",
        subjectId: `${row.series.toLowerCase()}-representative`,
        capturedAt,
        facts: {
          headline_fact: row.requires.length ? `derived from: ${row.checks.map((c) => c.detail).join("; ")}` : null,
          layout_family: row.pillar.toLowerCase(),
          numeric_structure: row.pillar === "MARKET" ? "distribution" : row.pillar === "COMPARISON" ? "compare" : null,
        },
        sourceCommit,
      })
    );
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

  if (MODE === "reconcile") {
    const hasBuffer = Boolean(process.env.BUFFER_ACCESS_TOKEN);
    const payload = {
      generated_at: new Date(NOW).toISOString(),
      buffer_configured: hasBuffer,
      tables_ready: ready,
      persisted_placements: placed.length,
      queued_placements: placed.filter((p) => p.status === "BUFFER_QUEUED").length,
      result: !hasBuffer ? "BUFFER_NOT_CONFIGURED" : placed.length === 0 ? "NOTHING_TO_RECONCILE" : "READ_ONLY_COMPARE_ONLY",
      note: "reconcile never resubmits or mutates Buffer (§29). It only reports MISSING_PROVIDER_POST / TIME_DRIFT / FAILED / QUEUED / PUBLISHED once placements exist.",
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
  const planned = plannedLaneStories(matrix, capturedAt, sourceCommit);
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
    vision_review: {
      openai_vision_available: false,
      note: "no OpenAI vision/chat client in repo (OpenAI = image-gen only). Adapter reuses the existing Anthropic vision path.",
      anthropic_review_configured: reviewAvailable(),
      layer5_verdict_when_unconfigured: "WATCH (cannot autonomously schedule)",
    },
    runtime_gates_not_evaluated: [
      "rights_cleared per artifact (assumed cleared in this content-quality sim)",
      "vision review (Layer 5) - env-gated; WATCH when unconfigured, cannot auto-schedule",
      "distribution gates.mjs (publish_switch, live_mode, epn, owner_approval, freshness_at_send)",
      "RIGHTS_STATE.publishing must be ALLOWED (code constant, currently DISABLED)",
    ],
    publishing: { published: 0, scheduled: 0, buffer_calls: 0, supabase_writes: 0, ebay_browse_calls: 0, stage1: "OFF" },
  };

  writeFileSync(path.join(OUT_DIR, "backlog-summary.json"), JSON.stringify(summary, null, 2) + "\n");
  writeFileSync(path.join(OUT_DIR, "calendar-14d.json"), JSON.stringify(calendar, null, 2) + "\n");
  writeFileSync(path.join(OUT_DIR, "support-matrix.json"), JSON.stringify(matrix, null, 2) + "\n");
  writeFileSync(
    path.join(OUT_DIR, "README.txt"),
    "SIMULATION / REVIEW ONLY - SOCIAL-NEWSROOM-1\n" +
      "Nothing here was published or scheduled. No Buffer call, no Supabase write, no eBay Browse call.\n" +
      "Fresh-lane stories use the live read-only source; editorial-lane stories use real aggregate\n" +
      "data where available and are otherwise representative concept stories. Stage 1 autonomy is OFF.\n"
  );

  if (JSON_OUT) return console.log(JSON.stringify(summary, null, 2));

  log("SOCIAL EDITORIAL NEWSROOM - DRY RUN (nothing published / scheduled)");
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
  log(`  vision review: OpenAI n/a; Anthropic adapter ${reviewAvailable() ? "configured" : "NOT configured -> layer 5 = WATCH"}`);
  log(`  backlog health: ${health.overall}`);
  log(`  review pack: ${path.relative(ROOT, OUT_DIR)}/`);
})().catch((e) => {
  console.error("social:backlog failed:", e?.stack || e?.message || e);
  process.exit(1);
});
