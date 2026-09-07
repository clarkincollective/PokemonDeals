#!/usr/bin/env node
// Phase 13E.11A - `npm run social:creative-quality`
//
// A DRY-RUN creative-quality review pack. Reads the EXISTING rendered
// artifacts (.social-preview/13e3/*.png, .social-preview/13e4/manifest.json)
// and the deterministic template/experiment code, runs the density
// heuristic (lib/social/creativeQa.mjs), and writes a labelled review pack
// to .social-preview/creative-quality/.
//
// It renders the E1 hook A/B pair through the ACTUAL experiment system
// (lib/social/experiments/hooks.mjs) + the ACTUAL static renderer
// (lib/social/templates.renderHtml) so the "identical except the hook"
// claim is verified, not asserted.
//
// NOTHING is published, scheduled, rendered to video, or sent to a
// provider. No eBay call. No Buffer call. Fixture data only - labelled
// SIMULATION / REVIEW ONLY.

import { existsSync, mkdirSync, writeFileSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import { buildDealPayload, buildMoverPayload } from "../lib/social/payload.mjs";
import { buildSlideContent, renderHtml } from "../lib/social/templates.mjs";
import { renderHook } from "../lib/social/experiments/hooks.mjs";
import { factsFromCandidate } from "../lib/social/experiments/index.mjs";
import { findExperiment } from "../lib/social/experiments/experiments.mjs";
import { scoreCreative, categoryGrades, minInlineFontPx } from "../lib/social/creativeQa.mjs";
import { rankedBackgrounds, FIRST_LIVE_DEAL_DROP_BACKGROUND, FIRST_LIVE_BACKGROUND_STYLES } from "../lib/social/backgroundQuality.mjs";
import { PLATFORM_TARGETS } from "../lib/social/creativeSpec.mjs";

const ROOT = process.cwd();
const FIXTURE = path.join(ROOT, "tests", "fixtures", "social-deals.json");
const A13E3 = path.join(ROOT, ".social-preview", "13e3");
const A13E4 = path.join(ROOT, ".social-preview", "13e4", "manifest.json");
const OUT_DIR = path.join(ROOT, ".social-preview", "creative-quality");

const die = (m) => { console.error(`\n  ✖ ${m}\n`); process.exit(1); };
const readJson = (p, fb = null) => { try { return JSON.parse(readFileSync(p, "utf8")); } catch { return fb; } };

// --- fixture -> a strong Deal Drop candidate + a Mover candidate ---------

const fx = readJson(FIXTURE);
if (!fx) die(`no fixture at ${path.relative(ROOT, FIXTURE)}`);

// pick the fixture deal that BOTH E1 variants render for (a real contrast).
function e1Candidate() {
  const e1 = findExperiment("e1_deal_hook_pricecontrast_vs_percentgap");
  for (const d of fx.deals ?? []) {
    const facts = factsFromCandidate({ family: "deal_drop", card_name: d.row?.card_name, total_price_usd: d.row?.total_price_usd, market_price: d.row?.market_price, discount_pct: d.row?.discount_pct, freshness_state: d.freshness_state ?? "FRESH" });
    const a = renderHook(e1.variants.A.hook_variant, facts);
    const b = renderHook(e1.variants.B.hook_variant, facts);
    if (a.ok && b.ok) return { row: d.row, facts, hookA: a.text, hookB: b.text, hookAVar: e1.variants.A.hook_variant, hookBVar: e1.variants.B.hook_variant };
  }
  return null;
}

// The static-template geometry constants THIS build ships (kept in sync
// with lib/social/templates.mjs + videoDocument.mjs by the 13E.11A tests).
// Deal Drop always carries an experiment hook, so the standalone % figure
// renders in its `.metric.compact` form (56px) - stepped down below the
// 64px hook. Card art tops out at 700px on the 1080x1350 canvas.
const STATIC_DEAL = { hookPx: 64, metricPx: 56, cardMaxHeightPx: 700 };
const VIDEO_DEAL = { hookPx: 78, metricPx: 64, cardMaxHeightPx: 560 };
const VIDEO_MOVER = { movePx: 104, cardMaxHeightPx: 460 };

function e1Slides(c) {
  const payload = buildDealPayload({ contentType: "deal_of_day", row: c.row, now: Date.parse(fx.pulled_at) || Date.now(), utmCampaign: "deal_of_day" });
  const base = buildSlideContent(payload);
  const cardArtwork = { presentation: "hero_left", card: { fileUrl: "file:///cache/card.png" } };
  const A = renderHtml({ ...base, hook: c.hookA }, { variant: "A", cardArtwork });
  const B = renderHtml({ ...base, hook: c.hookB }, { variant: "A", cardArtwork });
  return { payload, A, B, cardArtwork };
}

// diff two rendered HTML strings after masking out ONLY the hook text -
// everything else must be byte-identical for E1 to be a clean experiment.
function diffExceptHook(a, b) {
  const mask = (h) => h.replace(/(<div class="hook-line"[^>]*>)([\s\S]*?)(<\/div>)/, "$1__HOOK__$3");
  return mask(a) === mask(b);
}

function dealMeta(html, geom, family = "deal_drop", hookText = "") {
  return {
    family,
    canvasW: 1080, canvasH: 1350,
    safe: PLATFORM_TARGETS.ig_portrait.safe,
    hookText,
    hookPx: geom.hookPx,
    // the standalone % figure is dropped when a hook is present, so the
    // "metric" that could compete is just the 22px phrase label.
    metricPx: /<span class="fig"/.test(html) ? geom.metricPx : 22,
    cardMaxHeightPx: geom.cardMaxHeightPx,
    numericCallouts: extractCallouts(html),
    ctaCount: (html.match(/class="cta"/g) || []).length,
    brandMarkCount: (html.match(/DealFinder<\/span>/g) || []).length,
    minInlineFontPx: minInlineFontPx(html),
    bodyHtml: html,
  };
}

// The big-number DISPLAY BLOCKS a viewer parses as separate callouts: the
// standalone metric figure (dropped when a hook is present) and the two
// price-row values. The hook's own numbers are part of the headline (the
// hero line) and are scored by headline_lines, not counted again here -
// otherwise a PRICE_CONTRAST hook would be double-penalised for saying the
// same two prices the price row shows.
function extractCallouts(html) {
  const out = [];
  const metricFig = html.match(/<span class="fig"[^>]*>([^<]+)<\/span>/);
  if (metricFig) out.push(metricFig[1].trim());
  out.push(...[...html.matchAll(/<div class="val">([^<]+)<\/div>/g)].map((m) => m[1].trim()));
  return out;
}

// --- build the pack ----------------------------------------------------

const c = e1Candidate();
if (!c) die("no fixture deal renders BOTH E1 hook variants");

const e1 = e1Slides(c);
const e1Identical = diffExceptHook(e1.A, e1.B);

const metaA = dealMeta(e1.A, STATIC_DEAL, "deal_drop", c.hookA);
const metaB = dealMeta(e1.B, STATIC_DEAL, "deal_drop", c.hookB);

// Market Mover (static) meta from a fixture mover.
const mv = (fx.movers ?? [])[0];
let moverPack = null;
if (mv?.movement?.ok || mv?.movement) {
  const mvPayload = buildMoverPayload({ row: mv.row, movement: mv.movement, now: Date.parse(fx.pulled_at) || Date.now() });
  const mvSlide = buildSlideContent(mvPayload);
  const mvHtml = renderHtml(mvSlide, { variant: "A", cardArtwork: { presentation: "hero_left", card: { fileUrl: "file:///cache/mv.png" } } });
  const moverMeta = {
    family: "market_mover",
    canvasW: 1080, canvasH: 1350, safe: PLATFORM_TARGETS.ig_portrait.safe,
    // no experiment hook line on a Mover - the subject name is the label,
    // the single move figure is the one callout. hookPx omitted so the
    // hook-vs-metric check is skipped rather than falsely failed.
    hookText: mvSlide.name, metricPx: 112,
    cardMaxHeightPx: 480,
    numericCallouts: [(mvHtml.match(/class="mover-move"[^>]*>([^<]+)</) || [])[1]].filter(Boolean),
    ctaCount: (mvHtml.match(/class="cta"/g) || []).length,
    brandMarkCount: (mvHtml.match(/DealFinder<\/span>/g) || []).length,
    minInlineFontPx: minInlineFontPx(mvHtml),
    bodyHtml: mvHtml,
    // true only if the move figure ELEMENT carries an inline colour (a
    // directional green/red). The neutral `color` in the stylesheet rule
    // does not count.
    directional_colour: /<div class="mover-move"[^>]*style="[^"]*color:/.test(mvHtml),
  };
  moverPack = {
    subject: mvSlide.name,
    move: (mvHtml.match(/class="mover-move"[^>]*>([^<]+)</) || [])[1] ?? null,
    directional_colour_on_move: moverMeta.directional_colour,
    ...scoreCreative(moverMeta),
    categories: categoryGrades(moverMeta),
  };
}

// existing rendered artifacts (referenced, not re-rendered)
const pngs = existsSync(A13E3) ? readdirSync(A13E3).filter((f) => f.endsWith(".png")) : [];
const videoManifest = readJson(A13E4);

const manifest = {
  phase: "13E.11A",
  label: "SIMULATION / REVIEW ONLY — fixture data, NOT live. Nothing published, scheduled, or re-rendered.",
  generated_at: new Date().toISOString(),
  fixture_source: "tests/fixtures/social-deals.json",
  existing_static_artifacts: pngs,
  existing_video_artifacts: videoManifest ? (videoManifest.families ?? []).map((f) => f.family) : [],

  e1_hook_ab: {
    experiment_id: "e1_deal_hook_pricecontrast_vs_percentgap",
    subject: c.row?.card_name,
    variant_A: { hook_variant: c.hookAVar, hook_text: c.hookA, ...scoreCreative(metaA), categories: categoryGrades(metaA) },
    variant_B: { hook_variant: c.hookBVar, hook_text: c.hookB, ...scoreCreative(metaB), categories: categoryGrades(metaB) },
    layout_identical_except_hook: e1Identical,
    verdict: e1Identical ? "CLEAN — the two variants differ only in the hook text; card, background slot, layout, scale, price stack and CTA are byte-identical." : "CONFOUNDED — the variants differ in more than the hook; fix before running E1.",
  },

  market_mover: moverPack ?? { note: "no fixture mover with a confident movement" },

  deal_drop_first_live_spec: {
    layout: "Version A (hero split) — card on one side (~54% width), identity + one small % cue on the other; hook above the split; price row + one trust line + CTA below.",
    aspect_ratio: "4:5 static (1080×1350) for the review baseline; 9:16 (1080×1920) for Reel/TikTok/Short.",
    hook_placement: "top, above the hero split; the single largest text; ≤ 3 lines; uppercase.",
    card_scale: "card is the hero — static max-height 700px on a 1080×1350 canvas (~57% of usable height); 9:16 --cah 560px.",
    price_hierarchy: "LISTED (USD) prominent → MARKET REF (USD) dim + smaller → a small '% BELOW RECENT MARKET' cue. No standalone dollar-saving block (that lives in the DOLLAR_SAVING hook).",
    cta: "text-first: the experiment CTA label with a red underline + one arrow, then PokemonDealFinder.com. No filled button, no 'SHOP/BUY NOW'.",
    trust_line: "one quiet line: 'Live on eBay <MK> · Market ref recent sold prices'. Freshness + 'Ad' in the disclosure bar. Full affiliate disclosure lives in the caption.",
    background_class: `${FIRST_LIVE_DEAL_DROP_BACKGROUND} (STRONG). First-live rotation is limited to: ${FIRST_LIVE_BACKGROUND_STYLES.join(", ")}.`,
  },

  first_live_platform_formats: {
    instagram: "Reel / 9:16 (the 13E.4 master). If a future review finds the static 4:5 reads better for a given card, use static — video is not assumed superior.",
    tiktok: "the SAME 9:16 motion master, original-audio only (platform-safe).",
    x: "strong 4:5 static + the concise frozen X text (13E.5B platformCopy). No video needed for the first Deal Drop.",
    youtube: "9:16 Short (the same master) with the deterministic YouTube title + description.",
  },

  backgrounds: rankedBackgrounds(),
};

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(path.join(OUT_DIR, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n", "utf8");
// keep the two E1 HTML strings for a human to eyeball side by side
writeFileSync(path.join(OUT_DIR, "e1_variant_A.html"), e1.A, "utf8");
writeFileSync(path.join(OUT_DIR, "e1_variant_B.html"), e1.B, "utf8");

// --- console summary -------------------------------------------------

console.log("\n  === CREATIVE QUALITY REVIEW PACK (13E.11A) ===");
console.log(`  ${manifest.label}\n`);
console.log(`  E1 hook A/B — subject: ${c.row?.card_name}`);
console.log(`    A ${c.hookAVar.padEnd(14)} "${c.hookA}"   grade ${manifest.e1_hook_ab.variant_A.grade} (${manifest.e1_hook_ab.variant_A.score})`);
console.log(`    B ${c.hookBVar.padEnd(14)} "${c.hookB}"   grade ${manifest.e1_hook_ab.variant_B.grade} (${manifest.e1_hook_ab.variant_B.score})`);
console.log(`    layout identical except the hook: ${e1Identical ? "YES ✓" : "NO ✗"}`);
console.log(`    ${manifest.e1_hook_ab.verdict}\n`);
console.log("  Impeccable-style category grades (variant A):");
for (const [k, v] of Object.entries(manifest.e1_hook_ab.variant_A.categories)) console.log(`    ${k.padEnd(20)} ${v}`);
if (moverPack) {
  console.log(`\n  Market Mover — ${moverPack.subject}  move ${moverPack.move}  grade ${moverPack.grade}`);
  console.log(`    directional colour on the move figure: ${moverPack.directional_colour_on_move ? "PRESENT (should be neutral)" : "none ✓"}`);
}
console.log("\n  Backgrounds (first-live eligible = STRONG/OK):");
for (const b of manifest.backgrounds) console.log(`    ${b.style.padEnd(24)} ${b.tier.padEnd(7)} first-live=${b.first_live}`);
console.log(`\n  wrote ${path.relative(ROOT, path.join(OUT_DIR, "manifest.json"))}`);
console.log("  NOTHING was published, scheduled, or re-rendered. No eBay call. No Buffer call.\n");
