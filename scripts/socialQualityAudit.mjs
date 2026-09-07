#!/usr/bin/env node
// Phase SOCIAL-NEWSROOM-1 - `npm run social:quality-audit` (§23, §44, §45).
//
// Builds a representative review pack for a periodic DEVELOPMENT-TIME
// Claude / Impeccable review. Claude Code does NOT run inside Vercel
// production - the autonomous runtime uses the deterministic QA stack
// (lib/social/newsroom/qaStack) + the env-gated vision-review adapter.
// This command just assembles the artefacts a human-in-the-loop review
// would grade.
//
//   npm run social:quality-audit            build the pack
//   npm run social:quality-audit -- --json  machine-readable
//
// SIMULATION / REVIEW ONLY. No publish, no Buffer, no Supabase write, no
// eBay call. Fixtures / representative specs only.

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { config as loadDotenv } from "dotenv";
if (existsSync(".env.local")) loadDotenv({ path: ".env.local", quiet: true });
else loadDotenv({ quiet: true });

import {
  makeStory,
  placementsForStory,
  organicBreakdown,
  conversionProxyBreakdown,
  originalityBreakdown,
  runQaStack,
  getSeries,
} from "../lib/social/newsroom/index.mjs";
import { RUBRIC_KEYS, reviewAvailable } from "../lib/social/newsroom/visionReview.mjs";

const ROOT = process.cwd();
const OUT_DIR = path.join(ROOT, ".social-preview", "editorial-newsroom", "quality-audit");
const JSON_OUT = process.argv.includes("--json");
const NOW = Date.parse("2026-09-07T12:00:00Z"); // fixed for determinism

// §44 - at least these formats in the pack.
const SPECS = [
  { series: "DEAL_DROP", pokemon: "charizard", dealIds: [90001], facts: { exact_verified_at: "2026-09-07T09:00:00Z", discount_pct: 0.58, dollars_saved: 220, market_price: 380, total_price_usd: 160, card_tcgplayer_id: "191319", recognisable: true, has_exact_destination: true } },
  { series: "THREE_UNDER_25", pokemon: null, facts: { headline_fact: "3 real fresh BINs under $25", layout_family: "budget" } },
  { series: "SAME_CARD_DIFFERENT_PRICES", pokemon: "umbreon", facts: { headline_fact: "same printing, 3 sellers, $41 spread", numeric_structure: "compare", card_tcgplayer_id: "252680" } },
  { series: "WEEKLY_WINNERS_LOSERS", pokemon: null, facts: { headline_fact: "7-day movement, top 5 up / down", layout_family: "market", numeric_structure: "distribution" } },
  { series: "RAW_VS_GRADED_EXPLAINER", pokemon: null, facts: {} },
  { series: "SET_WATCH", pokemon: null, facts: { headline_fact: "Surging Sparks 30-day", layout_family: "market" } },
  { series: "MARKET_SNAPSHOT", pokemon: null, facts: { headline_fact: "catalogue price distribution", layout_family: "market", numeric_structure: "distribution" } },
  { series: "EXACT_PRINTING_MATTERS", pokemon: null, facts: {} },
  { series: "WHY_WE_REJECTED_IT", pokemon: null, facts: { headline_fact: "language mismatch on the exact card", layout_family: "behind" } },
  { series: "THOUGHT_IT_WAS_A_DEAL", pokemon: null, facts: { headline_fact: "70% off - until the printing didn't match", layout_family: "story" } },
];

mkdirSync(OUT_DIR, { recursive: true });

const items = [];
for (const spec of SPECS) {
  const def = getSeries(spec.series);
  if (!def) continue;
  const story = makeStory({
    series: spec.series,
    subjectType: spec.facts.card_tcgplayer_id ? "card" : def.requires.length ? "catalog" : "concept",
    subjectId: `${spec.series.toLowerCase()}-audit`,
    pokemon: spec.pokemon,
    cardIds: spec.facts.card_tcgplayer_id ? [spec.facts.card_tcgplayer_id] : [],
    dealIds: spec.dealIds ?? [],
    capturedAt: new Date(NOW).toISOString(),
    facts: spec.facts,
  });
  const organic = organicBreakdown(story);
  const conv = conversionProxyBreakdown(story);
  const orig = originalityBreakdown(story, [], NOW);
  const qa = runQaStack(story, {
    creativeMeta: { family: story.pillar === "DEALS" ? "deal_drop" : "brand_ad", canvasW: 1080, canvasH: 1350, hookText: "REVIEW HOOK", hookPx: 72, ctaCount: 1, brandMarkCount: 1, minInlineFontPx: 26, numericCallouts: spec.facts.discount_pct ? [`${Math.round(spec.facts.discount_pct * 100)}%`] : [], cardMaxHeightPx: 640 },
    rights: { rightsCleared: true, artifactIsOwnRender: true },
    requireVisualReview: false,
  });
  items.push({
    series: spec.series,
    pillar: story.pillar,
    shelf_life_class: story.shelf_life_class,
    lane: story.lane,
    cta_intensity: story.cta_intensity,
    platforms: placementsForStory(story).map((p) => `${p.platform}:${p.placement_type}`),
    scores: { organic: organic.score, conversion_proxy: conv.score, originality: orig.score },
    deterministic_qa: { professional_result: qa.professional_result, blockers: qa.blockers, layers: qa.layers.map((l) => ({ layer: l.layer, result: l.result })) },
  });
}

const pack = {
  generated_at: new Date().toISOString(),
  disclaimer: "SIMULATION / REVIEW ONLY. Representative specs, not live deals. Nothing published or scheduled.",
  reviewer_note: "Claude / Impeccable is a development-time auditor. Grade each item PASS / WATCH / FAIL against the rubric below; feed P0/P1 findings back as design-system fixes.",
  impeccable_rubric: [
    "ORGANIC_VALUE", "SCROLL_STOP", "STORY_CLARITY", "CARD_DOMINANCE", "FACT_HIERARCHY",
    "EDITORIAL_VALUE", "ORIGINALITY", "VISUAL_POLISH", "MOBILE", "PLATFORM_FIT", "AI_SPAM_RISK", "CONVERSION_FIT",
  ],
  runtime_vision_rubric: RUBRIC_KEYS,
  runtime_vision_configured: reviewAvailable(),
  items,
};

writeFileSync(path.join(OUT_DIR, "review-pack.json"), JSON.stringify(pack, null, 2) + "\n");
writeFileSync(
  path.join(OUT_DIR, "review-pack.md"),
  `# SOCIAL-NEWSROOM-1 - editorial review pack\n\n_${pack.disclaimer}_\n\n` +
    `${pack.reviewer_note}\n\n## Impeccable rubric\n\n${pack.impeccable_rubric.map((k) => `- [ ] ${k}: PASS / WATCH / FAIL`).join("\n")}\n\n` +
    `## Items\n\n` +
    items
      .map(
        (it) =>
          `### ${it.series} (${it.pillar} / ${it.shelf_life_class} / ${it.lane})\n` +
          `- platforms: ${it.platforms.join(", ")}\n` +
          `- CTA: ${it.cta_intensity}\n` +
          `- scores: organic ${it.scores.organic}, conversion-proxy ${it.scores.conversion_proxy}, originality ${it.scores.originality}\n` +
          `- deterministic QA: ${it.deterministic_qa.professional_result}${it.deterministic_qa.blockers.length ? ` (blockers: ${it.deterministic_qa.blockers.join("; ")})` : ""}\n`
      )
      .join("\n") +
    "\n",
);

if (JSON_OUT) console.log(JSON.stringify(pack, null, 2));
else {
  console.log(`social:quality-audit - ${items.length} representative items`);
  for (const it of items) console.log(`  ${it.series.padEnd(28)} ${it.deterministic_qa.professional_result.padEnd(6)} organic ${it.scores.organic}  originality ${it.scores.originality}`);
  console.log(`  runtime vision review configured: ${reviewAvailable()}`);
  console.log(`  pack: ${path.relative(ROOT, OUT_DIR)}/`);
}
