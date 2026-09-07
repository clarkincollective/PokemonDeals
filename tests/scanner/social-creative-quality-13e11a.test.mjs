// Phase 13E.11A - CREATIVE QUALITY AUDIT + TEMPLATE POLISH.
//
// Pins:
//   * E1 (PRICE_CONTRAST vs PERCENT_GAP) renders byte-identical except the
//     hook line - same card, background slot, layout, scale, price row,
//     phrase cue and CTA (§26);
//   * the Deal Drop drops the standalone % figure when a hook is present -
//     one headline + one factual comparison, not a third loud number;
//   * card occupancy meets the deterministic floor;
//   * the hook line is hard-bounded to <= 3 lines (max-height + overflow);
//   * exactly one CTA, text-first, and NO direct eBay link in the creative;
//   * no fake-urgency copy in any template string;
//   * Market Mover carries no directional colour on the move figure and no
//     directional chart accent (§15);
//   * WEAK background styles are excluded from the first-live rotation
//     deterministically (§8);
//   * the new modules make no network / eBay / Buffer call.
// No network.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { buildDealPayload, buildMoverPayload } from "../../lib/social/payload.mjs";
import { buildSlideContent, renderHtml } from "../../lib/social/templates.mjs";
import { renderHook } from "../../lib/social/experiments/hooks.mjs";
import { findExperiment } from "../../lib/social/experiments/experiments.mjs";
import {
  DENSITY_LIMITS,
  estimateHookLines,
  duplicateFactCount,
  densityChecks,
  densityGrade,
  scoreCreative,
  categoryGrades,
} from "../../lib/social/creativeQa.mjs";
import {
  BACKGROUND_RANK,
  FIRST_LIVE_BACKGROUND_STYLES,
  EXCLUDED_FROM_FIRST_LIVE,
  backgroundTier,
  isFirstLiveEligible,
  rankedBackgrounds,
  FIRST_LIVE_DEAL_DROP_BACKGROUND,
} from "../../lib/social/backgroundQuality.mjs";
import { PLATFORM_TARGETS } from "../../lib/social/creativeSpec.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => readFileSync(join(ROOT, p), "utf8");

const FX = JSON.parse(read("tests/fixtures/social-deals.json"));
const NOW = Date.parse(FX.pulled_at);
const CARD_ART = { presentation: "hero_left", card: { fileUrl: "file:///cache/card.png" } };

function e1Pair() {
  const e1 = findExperiment("e1_deal_hook_pricecontrast_vs_percentgap");
  for (const d of FX.deals) {
    const facts = {
      family: "deal_drop",
      cardName: d.row.card_name,
      listedUsd: d.row.total_price_usd,
      marketRefUsd: d.row.market_price,
      discountPct: d.row.discount_pct,
      freshnessState: "FRESH",
    };
    const a = renderHook(e1.variants.A.hook_variant, facts);
    const b = renderHook(e1.variants.B.hook_variant, facts);
    if (!(a.ok && b.ok)) continue;
    const payload = buildDealPayload({ contentType: "deal_of_day", row: d.row, now: NOW, utmCampaign: "deal_of_day" });
    const base = buildSlideContent(payload);
    return {
      row: d.row,
      hookA: a.text,
      hookB: b.text,
      htmlA: renderHtml({ ...base, hook: a.text }, { variant: "A", cardArtwork: CARD_ART }),
      htmlB: renderHtml({ ...base, hook: b.text }, { variant: "A", cardArtwork: CARD_ART }),
    };
  }
  throw new Error("no fixture deal renders both E1 hook variants");
}

const maskHook = (h) => h.replace(/(<div class="hook-line"[^>]*>)([\s\S]*?)(<\/div>)/, "$1__HOOK__$3");

// ---------------------------------------------------------------------

test("13E.11A-1 E1 variants differ ONLY in the hook line", () => {
  const { htmlA, htmlB, hookA, hookB } = e1Pair();
  assert.notEqual(hookA, hookB, "the two hooks must actually differ");
  assert.equal(maskHook(htmlA), maskHook(htmlB), "everything outside the hook line must be byte-identical (§26)");
});

test("13E.11A-2 with a hook, the standalone % steps down to its compact (secondary) form", () => {
  const { htmlA, htmlB } = e1Pair();
  // the figure is still present (factual integrity across variants) but
  // rendered compact - 56px, below the 64px hook - so it never competes.
  assert.match(htmlA, /class="metric compact"/, "metric is in compact form when a hook leads");
  assert.match(htmlA, /BELOW RECENT MARKET/);
  const css = read("lib/social/templates.mjs");
  const compactFig = Number(css.match(/\.hero-split \.rail \.metric\.compact \.fig\{font-size:(\d+)px/)[1]);
  const hookPx = Number(css.match(/\.hook-line\{font-size:(\d+)px/)[1]);
  assert.ok(compactFig < hookPx, `compact metric ${compactFig}px < hook ${hookPx}px`);
  // and it is identical in both E1 variants
  const fig = (h) => (h.match(/class="fig"[^>]*>([^<]+)</) || [])[1];
  assert.equal(fig(htmlA), fig(htmlB), "the % figure is byte-identical across E1 variants");
});

test("13E.11A-3 exactly one price comparison + one compact cue, no loud third figure", () => {
  const { htmlA } = e1Pair();
  const vals = [...htmlA.matchAll(/<div class="val">([^<]+)<\/div>/g)];
  assert.equal(vals.length, 2, "one LISTED + one MARKET REF value only");
  // the only non-compact (display-size) metric figure must NOT appear when
  // a hook leads - i.e. no `.metric` without `.compact`.
  assert.doesNotMatch(htmlA, /class="metric"(?!\s+compact)/, "no full-size metric block competing with the hook");
});

test("13E.11A-4 hook line is hard-bounded to <= 3 lines", () => {
  const css = read("lib/social/templates.mjs");
  assert.ok(css.includes(".hook-line{"), "static hook rule exists");
  assert.match(css, /max-height:3\.4em;overflow:hidden\}/, "static hook has a max-height + overflow clamp");
  const vcss = read("lib/social/videoDocument.mjs");
  assert.ok(vcss.includes(".vhook{"), "video hook rule exists");
  assert.match(vcss, /max-height:3\.2em;overflow:hidden\}/, "video hook has a max-height + overflow clamp");
  assert.equal(estimateHookLines("$450 CARD. LISTED FOR $180."), 2);
  assert.ok(estimateHookLines("A".repeat(90)) > DENSITY_LIMITS.headline_max_lines);
});

test("13E.11A-5 card occupancy meets the deterministic floor", () => {
  const { htmlA } = e1Pair();
  const usableH = PLATFORM_TARGETS.ig_portrait.h - PLATFORM_TARGETS.ig_portrait.safe.top - PLATFORM_TARGETS.ig_portrait.safe.bottom;
  const cardMax = Number(read("lib/social/templates.mjs").match(/\.hero-split \.prod \.card-art\{max-height:(\d+)px/)[1]);
  assert.ok(cardMax / usableH >= DENSITY_LIMITS.card_occupancy_min, `card occ ${(cardMax / usableH).toFixed(3)} >= ${DENSITY_LIMITS.card_occupancy_min}`);
  assert.ok(htmlA.includes('class="card-art"'), "card art is present in the composition");
});

test("13E.11A-6 exactly one CTA, text-first, no direct eBay link in the creative", () => {
  const { htmlA } = e1Pair();
  assert.equal((htmlA.match(/<div class="cta">/g) || []).length, 1, "one CTA block");
  assert.doesNotMatch(htmlA, /<button/i, "no filled button");
  assert.doesNotMatch(htmlA, /ebay\.com|rover\.ebay|ebay\.to/i, "no eBay URL rendered into the creative");
});

test("13E.11A-7 no fake-urgency copy in any Deal Drop / Mover / Brand string", () => {
  const src = read("lib/social/templates.mjs") + read("lib/social/videoDocument.mjs");
  for (const bad of [/\bhurry\b/i, /\bact now\b/i, /don't miss/i, /last chance/i, /selling fast/i, /\bwon't last\b/i, /limited time/i, /\bends soon\b/i]) {
    assert.doesNotMatch(src, bad, `urgency phrase ${bad} must not appear`);
  }
});

test("13E.11A-8 Market Mover carries no directional colour on the move figure or chart", () => {
  const mv = FX.movers.find((m) => m.movement && m.movement.ok === true);
  assert.ok(mv, "fixture has a confident mover");
  const payload = buildMoverPayload({ row: mv.row, movement: mv.movement, now: NOW });
  const slide = buildSlideContent(payload);
  const html = renderHtml(slide, { variant: "A", cardArtwork: { presentation: "hero_left", card: { fileUrl: "file:///c/m.png" } } });
  assert.doesNotMatch(html, /<div class="mover-move"[^>]*style="[^"]*color:/, "no inline directional colour on the move figure");
  // the move figure element itself is neutral in the stylesheet
  assert.match(read("lib/social/templates.mjs"), /\.mover-move\{[^}]*color:\$\{C\.ink\}/, "mover-move rule is neutral ink");
});

test("13E.11A-9 WEAK backgrounds are excluded from the first-live rotation", () => {
  assert.ok(FIRST_LIVE_BACKGROUND_STYLES.includes("clean_editorial"));
  assert.ok(FIRST_LIVE_BACKGROUND_STYLES.includes("collector_desk"));
  for (const weak of ["abstract_market", "dark_market_intelligence"]) {
    assert.equal(backgroundTier(weak), "WEAK");
    assert.equal(isFirstLiveEligible(weak), false);
    assert.ok(EXCLUDED_FROM_FIRST_LIVE.has(weak));
  }
  assert.equal(FIRST_LIVE_DEAL_DROP_BACKGROUND, "clean_editorial");
  const ranked = rankedBackgrounds();
  assert.equal(ranked[0].tier, "STRONG");
  assert.equal(ranked.at(-1).tier, "WEAK");
});

test("13E.11A-10 density heuristic grades the polished Deal Drop as PASS", () => {
  const { htmlA } = e1Pair();
  const meta = {
    family: "deal_drop",
    canvasW: 1080,
    canvasH: 1350,
    safe: PLATFORM_TARGETS.ig_portrait.safe,
    hookText: "$450 CARD. LISTED FOR $180.",
    hookPx: 64,
    metricPx: 56, // compact fig
    cardMaxHeightPx: 700,
    numericCallouts: [
      (htmlA.match(/class="fig"[^>]*>([^<]+)</) || [])[1],
      ...[...htmlA.matchAll(/<div class="val">([^<]+)<\/div>/g)].map((m) => m[1]),
    ].filter(Boolean),
    ctaCount: 1,
    brandMarkCount: (htmlA.match(/DealFinder<\/span>/g) || []).length,
    minInlineFontPx: 22,
    bodyHtml: htmlA,
  };
  const res = scoreCreative(meta);
  assert.equal(res.grade, "PASS", `expected PASS, got ${res.grade} (${res.score})`);
  const cats = categoryGrades(meta);
  for (const [k, v] of Object.entries(cats)) assert.notEqual(v, "FAIL", `${k} must not FAIL`);
});

test("13E.11A-11 duplicateFactCount catches a % shown as hook AND figure", () => {
  assert.equal(duplicateFactCount(["60%", "60%", "$180"]), 1);
  assert.equal(duplicateFactCount(["$180.00", "$180", "$450"]), 1);
  assert.equal(duplicateFactCount(["$180", "$450"]), 0);
});

test("13E.11A-12 densityGrade: a P1 failure cannot be PASS", () => {
  const checks = densityChecks({
    canvasH: 1350,
    safe: { top: 96, bottom: 112 },
    hookText: "x",
    hookPx: 40,
    metricPx: 120, // metric louder than the hook -> hook_is_hero P1 fail
    numericCallouts: ["a"],
    cardMaxHeightPx: 700,
    ctaCount: 1,
    bodyHtml: '<div class="safe"></div>',
  });
  assert.notEqual(densityGrade(checks).grade, "PASS");
});

test("13E.11A-13 new modules + CLI make no network / eBay / Buffer call", () => {
  const src =
    read("lib/social/creativeQa.mjs") +
    read("lib/social/backgroundQuality.mjs") +
    read("scripts/socialCreativeQuality.mjs");
  for (const bad of [/\bfetch\(/, /\bimport\s+.*\bnode:https?\b/, /require\(['"]node:https?['"]\)/, /\baxios\b/, /browse\.api\.ebay/i, /api\.buffer\.com/i, /\.publish\(/]) {
    assert.doesNotMatch(src, bad, `must not reference ${bad}`);
  }
});

test("13E.11A-14 review pack script writes only under .social-preview and is labelled SIMULATION", () => {
  const cli = read("scripts/socialCreativeQuality.mjs");
  assert.match(cli, /SIMULATION \/ REVIEW ONLY/);
  assert.match(cli, /\.social-preview["'\s,)/]/), "output path is under .social-preview";
  assert.doesNotMatch(cli, /writeFileSync\([^)]*(ledger|batches|plans)\.json/i, "does not touch the committed distribution ledgers");
});

test("13E.11A-15 BACKGROUND_RANK covers every STYLE_FAMILY with a rationale", () => {
  const ranked = rankedBackgrounds();
  for (const r of ranked) {
    assert.ok(BACKGROUND_RANK[r.style], `${r.style} ranked`);
    assert.ok(r.why && r.why.length > 20, `${r.style} has a real rationale`);
    assert.ok(["STRONG", "OK", "WEAK"].includes(r.tier));
  }
});
