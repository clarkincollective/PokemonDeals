#!/usr/bin/env node
// Phase SOCIAL-CREATIVE-3C - `npm run social:review-policy`
//
// (1) Reviewer STABILITY BENCHMARK (SS6): >=20 exact artifacts across
//     strong/borderline deal_hero + market_shape + asking_vs_sold +
//     printing_compare + three_up, each reviewed 5x. Measures
//     same-artifact verdict variance / flip rate / FAIL consistency /
//     rubric-score variance, and compares the WORST-CASE rule against the
//     SOCIAL-CREATIVE-3C consensus rule (lib/newsroom/visualConsensus).
// (2) FALSE-HOLD audit (SS7): artifacts worst-case HOLDS but consensus
//     PASSES - listed for manual inspection.
// (3) THREE_UNDER_25 hardening (SS8-SS12): >=12 real story opportunities,
//     deterministic gates + staged visual consensus -> AUTONOMOUS_SAFE?
// (4) 14-day FEED sufficiency (SS13-SS14) with bid_vs_total retired.
//
// NOTHING published/scheduled/hosted/queued. No Buffer. No eBay Browse.
// No verify/scanner/email change. NEWSROOM-3 not activated.
//
//   node scripts/socialReviewPolicy.mjs [--json] [--bench-samples 5] [--stories 12]

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { config as loadDotenv } from "dotenv";
if (existsSync(".env.local")) loadDotenv({ path: ".env.local", quiet: true });
else loadDotenv({ quiet: true });

import { createRenderer } from "../lib/social/render.mjs";
import { supabaseAdmin } from "../lib/supabaseAdmin.js";
import { resolveCardArtwork } from "../lib/social/cardArtwork.mjs";
import { RIGHTS_STATE } from "../lib/social/rights.mjs";
import { sha256 } from "../lib/social/storage/hostedAssets.mjs";

import { renderCardEditorialHtml, CARD_TARGETS } from "../lib/social/newsroom/cardEditorialTemplates.mjs";
import { collectibleAppeal } from "../lib/social/newsroom/collectibleAppeal.mjs";
import { editorialCreativeQa } from "../lib/social/newsroom/editorialQa.mjs";
import {
  dealHeroChecks, threeUpChecks, dealHeroWithholdReason,
  DEAL_HERO_LAYOUT, THREE_UP_LAYOUT,
} from "../lib/social/newsroom/cardCreativeChecks.mjs";
import * as MD from "../lib/social/newsroom/marketData.mjs";
import { feedReview } from "../lib/social/newsroom/feedReview.mjs";
import { CARD_LAYOUT_CTA_ZONE, CARD_LAYOUT_STATUS } from "../lib/social/newsroom/cardLayoutStatus.mjs";
import {
  reviewRenderedCreative, reviewAvailable,
} from "../lib/newsroom/visualReview.mjs";
import {
  consensusFromReviews, reviewConsensus, CONSENSUS_RULE, VISUAL_REVIEW_POLICY_VERSION,
} from "../lib/newsroom/visualConsensus.mjs";

const args = process.argv.slice(2);
const JSON_OUT = args.includes("--json");
const BENCH_SAMPLES = Number((args[args.indexOf("--bench-samples") + 1] ?? "").match(/^\d+$/)?.[0] || 5);
const STORIES = Number((args[args.indexOf("--stories") + 1] ?? "").match(/^\d+$/)?.[0] || 12);
const ROOT = process.cwd();
const OUT = path.join(ROOT, ".social-preview", "review-policy");
const RENDERS = path.join(OUT, "renders");
const log = (...a) => { if (!JSON_OUT) console.log(...a); };

async function artFor(ids) {
  const db = supabaseAdmin();
  const clean = [...new Set(ids.map(String))].filter((x) => /^\d+$/.test(x));
  const { data: cat } = await db.from("card_catalog").select("tcgplayer_id,name,set,card_number,image_url").in("tcgplayer_id", clean);
  const byId = Object.fromEntries((cat ?? []).map((r) => [String(r.tcgplayer_id).trim(), r]));
  const map = {}; const ready = [];
  for (const id of clean) {
    const row = byId[id];
    const r = await resolveCardArtwork(
      { card_tcgplayer_id: id, card_name: row?.name ?? null, card_set: row?.set ?? null, card_number: row?.card_number ?? null },
      { rightsState: RIGHTS_STATE, catalogRow: row ?? null }
    );
    if (r.status === "ready") { map[id] = pathToFileURL(path.resolve(r.localPath)).href; ready.push(id); }
  }
  return { map, ready };
}

const variance = (xs) => {
  const v = xs.filter(Number.isFinite);
  if (v.length < 2) return 0;
  const m = v.reduce((a, b) => a + b, 0) / v.length;
  return Math.round((v.reduce((a, b) => a + (b - m) ** 2, 0) / v.length) * 10) / 10;
};

(async () => {
  mkdirSync(RENDERS, { recursive: true });
  if (!reviewAvailable()) { console.error("social:review-policy: OPENAI_API_KEY not set"); process.exit(1); }
  const renderer = await createRenderer();
  const out = { generated_at: new Date().toISOString(), policy_version: VISUAL_REVIEW_POLICY_VERSION, rule: CONSENSUS_RULE };
  let apiCalls = 0;
  const t0 = Date.now();

  try {
    // ---------- build the benchmark artifact set ----------
    const dh = await MD.resolveDealHeroSamples({ n: 14 });
    const ms = await MD.resolveAskingVsSold({ minDiscount: 0.4, minMarket: 40 });
    const pr = await MD.resolvePrintingPair();
    const mk = await MD.resolveMarketShape();
    const tuStories = await MD.resolveThreeUnderSamples({ cap: 25, stories: STORIES });

    const bench = [];
    // deal_hero: split strong (iconic/notable, not withheld) vs borderline
    if (dh.ok) {
      const eligible = dh.data.items.filter((it) => !dealHeroWithholdReason({ price_usd: it.price_usd, market_usd: it.market_ref_usd, saved_pct: it.gap_pct, card_name: it.card_name }));
      const strong = eligible.filter((it) => it.market_ref_usd >= 120).slice(0, 4);
      const border = eligible.filter((it) => it.market_ref_usd < 120).slice(0, 3);
      for (const it of [...strong, ...border]) {
        bench.push({ kind: strong.includes(it) ? "deal_hero_strong" : "deal_hero_border", family: "deal_hero", series: "DEAL_DROP",
          props: { card: { tcgplayerId: it.tcgplayerId, name: it.card_name, set: it.card_set }, priceUsd: it.price_usd, marketUsd: it.market_ref_usd, discountPct: it.gap_pct },
          ids: [it.tcgplayerId], label: it.card_name });
      }
    }
    if (ms.ok) for (let i = 0; i < 3; i++) bench.push({ kind: "asking_vs_sold", family: "asking_vs_sold", series: "WHY_SOLD_PRICES_MATTER",
      props: { card: { tcgplayerId: ms.data.tcgplayerId, name: ms.data.card_name, set: ms.data.card_set }, askingUsd: ms.data.asking_usd, soldPoints: ms.data.sold_points, marketRefUsd: ms.data.market_ref_usd },
      ids: [ms.data.tcgplayerId], label: `${ms.data.card_name} #${i + 1}` });
    if (pr.ok) for (let i = 0; i < 3; i++) bench.push({ kind: "printing_compare", family: "printing_compare", series: "EXACT_PRINTING_MATTERS",
      props: { species: pr.data.species, high: pr.data.high, low: pr.data.low, multiple: pr.data.multiple },
      ids: [pr.data.high.tcgplayerId, pr.data.low.tcgplayerId], label: `${pr.data.species} #${i + 1}` });
    if (mk.ok) for (let i = 0; i < 3; i++) bench.push({ kind: "market_shape", family: "market_shape", series: "MARKET_SNAPSHOT",
      props: { pricedCards: mk.data.priced_cards, under25Pct: mk.data.under_25_pct, over100Pct: mk.data.over_100_pct, featured: mk.data.featured },
      ids: mk.cards.map((c) => c.tcgplayerId), label: `market_shape #${i + 1}` });
    if (tuStories.ok) for (const st of tuStories.data.stories.slice(0, 4)) bench.push({ kind: "three_up", family: "three_up", series: "THREE_UNDER_25",
      props: { cap: st.cap, items: st.items },
      ids: st.items.map((x) => x.tcgplayerId), label: `three_up ${st.items.map((x) => x.card_name).join("/").slice(0, 30)}` });

    log(`\n=== STABILITY BENCHMARK: ${bench.length} artifacts x ${BENCH_SAMPLES} reviews ===`);
    const benchRows = [];
    for (const b of bench) {
      const art = await artFor(b.ids);
      const html = renderCardEditorialHtml(b.family, { ...b.props, target: "ig_45", cardArt: art.map });
      const p = path.join(RENDERS, `bench_${b.kind}_${b.ids.join("-")}.png`);
      await renderer.renderToPng(html, p);
      const bytes = readFileSync(p);
      const runs = [];
      for (let i = 0; i < BENCH_SAMPLES; i++) {
        runs.push(await reviewRenderedCreative(p, { platform: "instagram", family: b.family, series: b.series, cardForward: true, editorial: true }, { noCache: true }));
        apiCalls++;
      }
      const verdicts = runs.map((r) => r.verdict);
      const pass = verdicts.filter((v) => v === "PASS").length;
      const watch = verdicts.filter((v) => v === "WATCH").length;
      const fail = verdicts.filter((v) => v === "FAIL").length;
      const worst = fail ? "FAIL" : watch ? "WATCH" : "PASS";
      const cons = consensusFromReviews(runs);
      const scoreVar = {};
      for (const k of ["SCROLL_STOP_STRENGTH", "THUMBNAIL_STORY_CLARITY", "PREMIUM_FEEL", "COLLECTIBLE_VISUAL_APPEAL"]) {
        scoreVar[k] = variance(runs.map((r) => Number(r.scores?.[k])));
      }
      const row = {
        kind: b.kind, label: b.label, sha: sha256(bytes).slice(0, 12),
        verdicts, pass, watch, fail, worst_case: worst, consensus: cons.result,
        consensus_reasons: cons.reasons, core_score: cons.core_score, ai_spam: cons.ai_spam,
        flip: pass > 0 && watch > 0, score_variance: scoreVar,
        decision_changed: worst !== cons.result,
      };
      benchRows.push(row);
      log(`  ${b.kind.padEnd(20)} ${verdicts.join("/").padEnd(28)} worst=${worst.padEnd(5)} consensus=${cons.result.padEnd(7)} core=${cons.core_score ?? "?"}${row.decision_changed ? "  <-- changed" : ""}`);
    }

    // aggregate stability
    const byKind = {};
    for (const r of benchRows) {
      const g = r.kind.startsWith("deal_hero") ? "deal_hero" : r.kind;
      (byKind[g] ??= []).push(r);
    }
    const stability = {};
    for (const [g, rows] of Object.entries(byKind)) {
      const flips = rows.filter((r) => r.flip).length;
      const anyFail = rows.filter((r) => r.fail > 0).length;
      stability[g] = {
        artifacts: rows.length,
        flip_rate: Math.round((flips / rows.length) * 100) / 100,
        worst_case_pass: rows.filter((r) => r.worst_case === "PASS").length,
        consensus_pass: rows.filter((r) => r.consensus === "PASS").length,
        consensus_blocked: rows.filter((r) => r.consensus === "BLOCKED").length,
        artifacts_with_a_fail: anyFail,
        decisions_changed_vs_worst_case: rows.filter((r) => r.decision_changed).length,
        mean_scroll_stop_variance: Math.round((rows.reduce((a, r) => a + (r.score_variance.SCROLL_STOP_STRENGTH || 0), 0) / rows.length) * 10) / 10,
      };
    }
    out.stability_benchmark = { rule: "worst-case vs consensus 3c.1", per_family: stability, artifacts: benchRows };

    // ---------- FALSE-HOLD audit ----------
    out.false_hold_candidates = benchRows
      .filter((r) => r.worst_case === "WATCH" && r.consensus === "PASS")
      .map((r) => ({ kind: r.kind, label: r.label, sha: r.sha, verdicts: r.verdicts, core_score: r.core_score }));
    out.false_pass_candidates = benchRows
      .filter((r) => r.worst_case === "PASS" && r.consensus !== "PASS")
      .map((r) => ({ kind: r.kind, label: r.label, sha: r.sha, verdicts: r.verdicts, reasons: r.consensus_reasons }));
    log(`\n=== FALSE-HOLD: ${out.false_hold_candidates.length}  FALSE-PASS: ${out.false_pass_candidates.length} ===`);

    // ---------- THREE_UNDER_25 hardening (staged consensus) ----------
    log(`\n=== THREE_UNDER_25 hardening: ${tuStories.ok ? tuStories.data.stories.length : 0} real stories ===`);
    const tuRows = [];
    if (tuStories.ok) {
      for (const st of tuStories.data.stories) {
        const art = await artFor(st.items.map((x) => x.tcgplayerId));
        const det = threeUpChecks({ ...THREE_UP_LAYOUT, cap: st.cap, items: st.items, card_art_ready_ids: art.ready });
        const html = renderCardEditorialHtml("three_up", { cap: st.cap, items: st.items, target: "ig_45", cardArt: art.map });
        const p = path.join(RENDERS, `three_up_${st.items.map((x) => x.tcgplayerId).join("-")}.png`);
        await renderer.renderToPng(html, p);
        const bytes = readFileSync(p);
        const ca = collectibleAppeal({
          layout_family: "three_up", card_ids_shown: st.items.map((x) => String(x.tcgplayerId)), card_art_ready_ids: art.ready,
          numeric_callouts: st.items.flatMap((x) => [x.price_usd, x.discount_pct]), has_price_contrast: true,
          hero_fraction: THREE_UP_LAYOUT.hero_fraction, is_generic_typographic: false, species: st.items[0].card_name,
        });
        const t = CARD_TARGETS.ig_45;
        const eqa = editorialCreativeQa({
          editorial: true, layout_family: "three_up", target: "ig_45",
          hookText: `What $${st.cap} buys right now`, ctaCount: 1, wordmarkCount: 1, minInlineFontPx: 22,
          statCallouts: st.items.map((x) => String(x.price_usd)), bodyChars: 80,
          safe: { top: t.pad, right: t.pad, bottom: t.pad, left: t.pad },
        });
        let consensus = { result: "HELD", reasons: ["not run"], calls: 0 };
        if (det.grade !== "FAIL" && eqa.grade !== "FAIL" && ca.grade !== "FAIL") {
          consensus = await reviewConsensus(p, { platform: "instagram", family: "three_up", series: "THREE_UNDER_25", cardForward: true, editorial: true });
          apiCalls += consensus.calls ?? 0;
        }
        const eligible = det.grade === "PASS" && eqa.grade !== "FAIL" && ca.grade === "PASS" && consensus.result === "PASS";
        tuRows.push({
          cards: st.items.map((x) => `${x.card_name} $${x.price_usd}`), sha: sha256(bytes).slice(0, 12),
          det: det.grade, det_failed: det.failed, eqa: eqa.grade, ca: ca.grade,
          consensus: consensus.result, consensus_calls: consensus.calls, verdicts: consensus.verdicts,
          eligible,
        });
        log(`  ${st.items.map((x) => x.card_name).join(" / ").slice(0, 40).padEnd(40)} det=${det.grade.padEnd(5)} eQA=${eqa.grade.padEnd(5)} CA=${ca.grade.padEnd(5)} consensus=${consensus.result}[${(consensus.verdicts || []).join("/")}] -> ${eligible ? "ELIGIBLE" : "held"}`);
      }
    }
    const tuEligible = tuRows.filter((r) => r.eligible).length;
    const tuRate = tuRows.length ? tuEligible / tuRows.length : 0;
    const tuQualifies = tuRows.length >= 8 && tuEligible >= Math.ceil(tuRows.length * 0.75) &&
      tuRows.every((r) => r.det !== "FAIL" && r.consensus !== "BLOCKED");
    out.three_under_25 = {
      stories: tuRows.length, deterministic_pass: tuRows.filter((r) => r.det === "PASS").length,
      consensus_pass: tuEligible, eligibility_rate: Math.round(tuRate * 100) / 100,
      qualifies_autonomous_safe: tuQualifies, rows: tuRows,
    };
    log(`  => ${tuEligible}/${tuRows.length} ELIGIBLE (${Math.round(tuRate * 100)}%)  AUTONOMOUS_SAFE: ${tuQualifies ? "YES" : "NO"}`);

    // ---------- 14-day FEED sufficiency ----------
    const tuSafe = tuQualifies;
    const AUTO = [["market_shape", "MARKET_SNAPSHOT", "MARKET"], ["asking_vs_sold", "WHY_SOLD_PRICES_MATTER", "EDUCATION"], ["printing_compare", "EXACT_PRINTING_MATTERS", "COMPARISON"]];
    if (tuSafe) AUTO.push(["three_up", "THREE_UNDER_25", "BUDGET"]);
    const COND = [["deal_hero", "DEAL_DROP", "DEALS"]];
    const EDIT = [["process_explainer", "HOW_WE_FIND_DEALS", "BEHIND_THE_FINDER"], ["trust_editorial", "METHODOLOGY", "BRAND"]];
    // 14 days, ~1/day: rotate AUTO + COND (capped) + EDIT, no bid_vs_total
    const rotation = [];
    const pool14 = [...AUTO, ...AUTO, ...COND, ...EDIT, ...AUTO, ...EDIT];
    for (let i = 0; i < 14; i++) rotation.push(pool14[i % pool14.length]);
    const planned = rotation.map(([lf, series, pillar], i) => ({
      story: { series, pillar, bucket: pillar === "DEALS" || pillar === "BUDGET" ? "CONVERSION" : "AUTHORITY", facts_json: {} },
      signature: { layout_family: lf, cta_zone: CARD_LAYOUT_CTA_ZONE[lf] ?? "bottom", hook_grammar: `${lf}:${i % 4}`, loud_brand: false, red_accent: false },
    }));
    const feed = feedReview(planned, { windowN: 14 });
    const distinctPillars = new Set(rotation.map((r) => r[2])).size;
    const commercialShare = rotation.filter((r) => r[2] === "DEALS" || r[2] === "BUDGET").length / rotation.length;
    const sufficient =
      (AUTO.length + COND.length) >= 4 &&
      distinctPillars >= 3 &&
      feed.verdict === "FEED_PASS" &&
      commercialShare <= 0.6;
    out.feed_14 = {
      autonomous_safe_families: AUTO.map((a) => a[1]),
      conditional_families: COND.map((a) => a[1]),
      manual_only_families: ["AUCTION_BID_VS_TOTAL", "BIGGEST_MOVERS"],
      distinct_pillars: distinctPillars, commercial_share: Math.round(commercialShare * 100) / 100,
      feed_verdict: feed.verdict, feed_metrics: feed.metrics, feed_warnings: feed.warnings, feed_blockers: feed.blockers,
      sufficient_for_newsroom3: sufficient,
    };
    log(`\n=== 14-DAY FEED: ${feed.verdict}  pillars=${distinctPillars}  commercial=${Math.round(commercialShare * 100)}%  sufficient=${sufficient ? "YES" : "NO"} ===`);

    out.newsroom3_infra_ready = sufficient ? "READY" : "NOT_READY";
    out.cost = {
      openai_calls: apiCalls,
      wall_seconds: Math.round((Date.now() - t0) / 1000),
      avg_latency_ms: apiCalls ? Math.round((Date.now() - t0) / apiCalls) : null,
      note: "staged consensus: 3 calls minimum, up to 5 for borderline; unanimous-PASS or all-WATCH-weak stop at 3",
    };
  } finally {
    await renderer.close();
  }

  out.safety = { published: 0, scheduled: 0, buffer_calls: 0, hosted: 0, ebay_browse: 0, stage1: "OFF", newsroom3: "OFF" };
  writeFileSync(path.join(OUT, "review-policy.json"), JSON.stringify(out, null, 2) + "\n");
  if (JSON_OUT) console.log(JSON.stringify(out, null, 2));
  else log(`\npack: ${path.relative(ROOT, OUT)}/  | ${out.cost.openai_calls} OpenAI calls in ${out.cost.wall_seconds}s`);
})().catch((e) => { console.error("social:review-policy failed:", e?.stack || e?.message || e); process.exit(1); });
