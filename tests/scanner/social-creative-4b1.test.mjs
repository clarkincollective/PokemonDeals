// Phase SOCIAL-CREATIVE-4B.1 - freeform AI art direction: blueprint schema
// + bounds + validator, primitive library, text-fit / clipping regression,
// dead-space & crowding scorers, generic-composition reject, concept
// scoring, multi-concept art director, fallback blueprints. Pure-logic +
// source-scan + MOCKED OpenAI.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { fitText, fitHeroNumber, measureText, assertNoClip, TEXT_FIT_VERSION } from "../../lib/newsroom/hybrid/textFit.mjs";
import {
  PRIMITIVES, PRIMITIVE_NAMES, isPrimitive, renderPrimitive, primitiveFactSlots,
} from "../../lib/newsroom/hybrid/primitives.mjs";
import {
  validateBlueprint, scoreConcept, chooseConcept, scoreDeadSpaceAndCrowding,
  genericCompositionReject, CANVAS, COMPOSITION_STYLES, ZONE_ROLES, CONCEPT_DIMENSIONS,
} from "../../lib/newsroom/hybrid/blueprint.mjs";
import {
  renderBlueprintHtml, buildSlots, FALLBACK_BLUEPRINTS, fallbackBlueprintFor,
} from "../../lib/newsroom/hybrid/freeformRenderer.mjs";
import { runArtDirector, MAX_CONCEPTS } from "../../lib/newsroom/hybrid/artDirector.mjs";
import { buildFactLock } from "../../lib/newsroom/editorial/factLock.mjs";
import { contractFor } from "../../lib/newsroom/editorial/storyContracts.mjs";
import { freeformEnabled, runHybridPipeline } from "../../lib/newsroom/hybrid/pipeline.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..");
const read = (p) => readFileSync(join(REPO, p), "utf8");
const code = (p) => read(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1").replace(/`(?:\\[\s\S]|[^`\\])*`/g, "``").replace(/"(?:\\.|[^"\\])*"/g, '""').replace(/'(?:\\.|[^'\\])*'/g, "''");
const hybridFiles = readdirSync(join(REPO, "lib/newsroom/hybrid")).filter((f) => f.endsWith(".mjs")).map((f) => `lib/newsroom/hybrid/${f}`);

const mockFetch = (handler) => async (url, opts) => {
  const body = JSON.parse(opts?.body ?? "{}");
  const r = handler(url, body);
  return { ok: r.status ? r.status < 400 : true, status: r.status ?? 200, async json() { return r.json; }, async text() { return JSON.stringify(r.json ?? {}); } };
};
const chatJSON = (obj) => ({ json: { choices: [{ message: { content: JSON.stringify(obj) } }] } });

const goodZones = (n = 6) => Array.from({ length: n }, (_, i) => ({ role: i === 0 ? "hero_card" : i === 1 ? "headline" : i === 2 ? "why_this_matters_box" : i === 3 ? "brand_mark" : "metric_strip", x: (i % 3) * 350 + 20, y: Math.floor(i / 3) * 400 + 20, width: 320, height: 360, priority: i === 0 ? 10 : 4, alignment: "start" }));
const goodBlueprint = (over = {}) => ({ composition_style: "asymmetric_editorial", visual_density: "medium", content_zones: goodZones(), why_this_matters: "real lesson here", brand_strategy: "wordmark", cta_strategy: "link out", expected_scroll_stop_reason: "big card", ...over });

// ================= TEXT FIT / §9 CLIPPING REGRESSION ==========
test("C4B1-1. fitHeroNumber never overflows the box for the §9 regression prices", () => {
  const box = 300;
  for (const p of ["$12.99", "$999.99", "$1,299.99", "$27,500"]) {
    const f = fitHeroNumber(p, box, { minPx: 40, maxPx: 160 });
    assert.ok(f.px >= 40 && f.px <= 160, `${p}: px ${f.px} out of bounds`);
    assert.ok(measureText(p, f.px, { tracking: -0.03 }) <= box + 1, `${p}: measured ${measureText(p, f.px, { tracking: -0.03 })} > ${box}`);
  }
});

test("C4B1-2. fitText reflows long labels within maxLines and never reports fit for an impossible box", () => {
  const long = "45% below the recent market reference for this exact printing";
  const f = fitText(long, { boxW: 360, boxH: 200, minPx: 20, maxPx: 44, maxLines: 3, lineHeight: 1.3 });
  assert.ok(f.lineCount <= 3);
  assert.ok(f.widest <= 360 + 1);
  const impossible = fitText("SUPERCALIFRAGILISTIC", { boxW: 20, minPx: 40, maxPx: 40, maxLines: 1 });
  assert.equal(impossible.fits, false);
});

test("C4B1-3. the deterministic deal_hero template now sizes its hero strings to the rail (no fixed 148px)", () => {
  const src = read("lib/social/newsroom/cardEditorialTemplates.mjs");
  assert.match(src, /fitHeroNumber/);
  assert.match(src, /railW/);
  assert.doesNotMatch(src, /font-size:\$\{sh \? 172 : 148\}px/); // the old hard-coded hero size is gone
});

test("C4B1-4. assertNoClip flags a zone whose text cannot fit its width", () => {
  const r = assertNoClip([
    { role: "ok", text: "$12", w: 300, fontPx: 40 },
    { role: "bad", text: "an extremely long headline that will absolutely not fit", w: 120, fontPx: 60, maxLines: 1 },
  ]);
  assert.equal(r.ok, false);
  assert.ok(r.clipped.some((c) => c.role === "bad"));
});

// ================= PRIMITIVE LIBRARY (§5) ====================
test("C4B1-5. primitive library has the §5 core primitives; unknown/invalid primitive is rejected", () => {
  for (const p of ["hero_card", "card_triptych", "headline", "hero_stat", "price_pair", "market_range", "price_gap_bar", "distribution_bar", "difference_arrow", "variant_badge", "set_era_tag", "sample_size_badge", "metric_strip", "mini_timeline", "why_this_matters_box", "collector_tip", "source_note", "cta", "brand_mark", "website_footer", "separator_rule", "spotlight_panel", "chart_panel"]) {
    assert.ok(isPrimitive(p), `missing primitive ${p}`);
  }
  assert.ok(PRIMITIVE_NAMES.length >= 24);
  assert.equal(isPrimitive("totally_made_up"), false);
  assert.throws(() => renderPrimitive("totally_made_up", {}, {}), /unknown primitive/);
});

test("C4B1-6. a primitive with unmet required real-data slots throws (renderer catches -> reject)", () => {
  const ctx = { C: { ink: "#fff", inkSub: "#aaa", inkFaint: "#888", up: "#3c8", brand: "#f33", hair: "#333", surface: "#161", surfaceHi: "#1f1" }, S: { label: 22, body: 30, metric: 68, fine: 22, cta: 34 }, zone: { width: 300, height: 200 }, fit: fitText };
  assert.throws(() => renderPrimitive("price_pair", { a: 10 }, ctx), /missing required real-data slot "b"/);
  assert.throws(() => renderPrimitive("difference_arrow", { from: "x" }, ctx), /slot "to"/);
  // hero_card degrades (art is NOT a hard slot) instead of throwing
  assert.doesNotThrow(() => renderPrimitive("hero_card", { name: "Card" }, ctx));
  assert.deepEqual(primitiveFactSlots("price_gap_bar"), ["listed", "market"]);
});

// ================= BLUEPRINT SCHEMA + BOUNDS (§4, §16) =======
test("C4B1-7. validateBlueprint clamps every zone inside the canvas and rejects <2 zones / unknown roles", () => {
  const v = validateBlueprint({ content_zones: [
    { role: "hero_card", x: -50, y: -20, width: 5000, height: 9000, priority: 10 },
    { role: "headline", x: 100, y: 100, width: 400, height: 120, priority: 6 },
  ] }, { target: "ig_45" });
  assert.equal(v.ok, true, v.errors.join("; "));
  const hero = v.blueprint.content_zones[0];
  assert.ok(hero.x >= 0 && hero.y >= 0 && hero.x + hero.width <= CANVAS.ig_45.w && hero.y + hero.height <= CANVAS.ig_45.h);

  assert.equal(validateBlueprint({ content_zones: [{ role: "headline", x: 0, y: 0, width: 100, height: 40 }] }).ok, false);
  assert.equal(validateBlueprint({ content_zones: [{ role: "nonsense_role", x: 0, y: 0, width: 100, height: 40 }, { role: "headline", x: 0, y: 100, width: 100, height: 40 }] }).ok, false);
});

test("C4B1-8. validateBlueprint rejects two HIGH-priority zones overlapping heavily", () => {
  const v = validateBlueprint({ content_zones: [
    { role: "hero_card", x: 100, y: 100, width: 600, height: 600, priority: 9 },
    { role: "spotlight_panel", x: 150, y: 150, width: 560, height: 560, priority: 9 },
  ] }, { target: "ig_45" });
  assert.equal(v.ok, false);
  assert.ok(v.errors.some((e) => /overlap/.test(e)));
});

// ================= DEAD SPACE / CROWDING (§17) ===============
test("C4B1-9. scoreDeadSpaceAndCrowding: a sparse layout scores high dead-space, an overlapping one high crowding", () => {
  const sparse = validateBlueprint({ content_zones: [
    { role: "hero_stat", x: 40, y: 40, width: 300, height: 120, priority: 10 },
    { role: "headline", x: 40, y: 200, width: 300, height: 80, priority: 6 },
  ] }, { target: "ig_45" }).blueprint;
  const s = scoreDeadSpaceAndCrowding(sparse);
  assert.ok(s.dead_space_score >= 50, `dead ${s.dead_space_score}`);

  const crowded = validateBlueprint({ content_zones: Array.from({ length: 12 }, (_, i) => ({ role: i === 0 ? "hero_card" : "metric_strip", x: 60 + (i % 4) * 20, y: 60 + Math.floor(i / 4) * 30, width: 900, height: 500, priority: 3 })) }, { target: "ig_45" }).blueprint;
  const c = scoreDeadSpaceAndCrowding(crowded);
  assert.ok(c.crowding_score >= 40, `crowd ${c.crowding_score}`);
});

// ================= GENERIC COMPOSITION REJECT (§8) ==========
test("C4B1-10. genericCompositionReject flags a KPI-tile grid and a near-empty numbers layout", () => {
  const kpi = validateBlueprint({ content_zones: [
    { role: "hero_card", x: 40, y: 40, width: 300, height: 200, priority: 9 },
    ...Array.from({ length: 5 }, (_, i) => ({ role: "spotlight_panel", x: 40 + (i % 3) * 340, y: 300 + Math.floor(i / 3) * 240, width: 320, height: 220, priority: 4 })),
  ] }, { target: "ig_45" }).blueprint;
  assert.equal(genericCompositionReject(kpi).generic, true);

  const sparse = validateBlueprint({ content_zones: [
    { role: "hero_stat", x: 40, y: 40, width: 300, height: 120, priority: 10 },
    { role: "secondary_stat", x: 40, y: 200, width: 300, height: 100, priority: 5 },
  ] }, { target: "ig_45" }).blueprint;
  assert.equal(genericCompositionReject(sparse).generic, true);
});

// ================= CONCEPT SCORING (§19) ====================
test("C4B1-11. scoreConcept returns all 10 dimensions + overall; chooseConcept picks the best non-generic", () => {
  const sc = scoreConcept(validateBlueprint(goodBlueprint(), { target: "ig_45" }).blueprint, { enrichmentKinds: ["price_gap_bar", "market_range"], relevance: { score: 0.8, classification: "COMMERCIAL" } });
  for (const d of CONCEPT_DIMENSIONS) assert.ok(Number.isFinite(sc.scores[d]), `no score for ${d}`);
  assert.ok(sc.overall >= 0 && sc.overall <= 100);
  assert.ok("dead_space_score" in sc && "crowding_score" in sc);

  const a = validateBlueprint(goodBlueprint({ composition_style: "asymmetric_editorial" }), { target: "ig_45" }).blueprint;
  const b = validateBlueprint(goodBlueprint({ composition_style: "stacked_hierarchy", content_zones: [{ role: "hero_stat", x: 40, y: 40, width: 300, height: 120, priority: 10 }, { role: "secondary_stat", x: 40, y: 200, width: 300, height: 100, priority: 5 }] }), { target: "ig_45" }).blueprint;
  const pick = chooseConcept([a, b], {});
  assert.ok(pick.chosen === a || pick.chosen == null || pick.chosenScore.overall >= 45);
});

// ================= ART DIRECTOR MULTI-CONCEPT (§18, §20) ====
test("C4B1-12. runArtDirector: no key -> a valid deterministic fallback blueprint per family", async () => {
  const fl = buildFactLock({ facts_json: { card_name: "X", total_price_usd: 10, market_price: 20 } });
  const r = await runArtDirector({ factLock: fl, contract: contractFor("DEAL_DROP"), layout: "deal_hero", env: {} });
  assert.equal(r.ok, true);
  assert.equal(r.source, "deterministic");
  assert.ok(r.blueprint.content_zones.length >= 4);
});

test("C4B1-13. runArtDirector caps at 3 concepts and picks one", async () => {
  // use the known-good deal_hero fallback as the concept shape, varied by style
  const concepts = Array.from({ length: 5 }, (_, i) => ({ ...FALLBACK_BLUEPRINTS.deal_hero, composition_style: COMPOSITION_STYLES[i % COMPOSITION_STYLES.length] }));
  const fetchImpl = mockFetch(() => chatJSON({ concepts, facts_echo: { card_name: "X", listed_price: 10, market_price: 20 }, human_taste: { would_a_designer_post_this: true, concept_index: 0 } }));
  const r = await runArtDirector({ factLock: buildFactLock({ facts_json: { card_name: "X", total_price_usd: 10, market_price: 20 } }), contract: contractFor("DEAL_DROP"), layout: "deal_hero", env: { OPENAI_API_KEY: "k" }, fetchImpl });
  assert.equal(r.ok, true);
  assert.equal(r.source, "openai");
  assert.ok(r.concepts.length <= MAX_CONCEPTS);
  assert.ok(r.blueprint && r.blueprint.content_zones.length >= 2);
});

test("C4B1-14. runArtDirector: a mutated fact in the echo -> AI_FACT_MUTATION (no render)", async () => {
  const fetchImpl = mockFetch(() => chatJSON({ concepts: [goodBlueprint()], facts_echo: { market_price: 999 }, human_taste: {} }));
  const r = await runArtDirector({ factLock: buildFactLock({ facts_json: { total_price_usd: 10, market_price: 20 } }), contract: contractFor("DEAL_DROP"), layout: "deal_hero", env: { OPENAI_API_KEY: "k" }, fetchImpl });
  assert.equal(r.ok, false);
  assert.equal(r.state, "AI_FACT_MUTATION");
});

test("C4B1-15. runArtDirector: a designer-would-not-post concept with a low score -> QA_WATCH held", async () => {
  const weak = goodBlueprint({ composition_style: "stacked_hierarchy", content_zones: [
    { role: "hero_stat", x: 40, y: 40, width: 260, height: 100, priority: 10 },
    { role: "secondary_stat", x: 40, y: 180, width: 260, height: 90, priority: 5 },
  ], why_this_matters: "", brand_strategy: "", cta_strategy: "", expected_scroll_stop_reason: "" });
  const fetchImpl = mockFetch(() => chatJSON({ concepts: [weak], facts_echo: {}, human_taste: { would_a_designer_post_this: false, why: "too bare" } }));
  const r = await runArtDirector({ factLock: buildFactLock({ facts_json: {} }), contract: contractFor("METHODOLOGY"), layout: "editorial", env: { OPENAI_API_KEY: "k" }, fetchImpl });
  assert.equal(r.ok, false);
  assert.ok(r.state === "QA_WATCH" || r.state === "CARD_FORWARD_RENDER_UNAVAILABLE");
});

// ================= FALLBACK BLUEPRINTS (§10-§14) ============
test("C4B1-16. all 5 family fallback blueprints validate and have a hero + why + brand zone", () => {
  for (const layout of ["deal_hero", "market_shape", "asking_vs_sold", "printing_compare", "three_up"]) {
    const fb = fallbackBlueprintFor(layout);
    assert.ok(fb, `no fallback for ${layout}`);
    const v = validateBlueprint(fb, { target: "ig_45" });
    assert.equal(v.ok, true, `${layout}: ${v.errors.join("; ")}`);
    const roles = v.blueprint.content_zones.map((z) => z.role);
    assert.ok(roles.some((r) => /hero_card|hero_stat|card_triptych|spotlight_panel/.test(r)), `${layout}: no hero`);
    assert.ok(roles.some((r) => /why_this_matters_box|collector_tip/.test(r)), `${layout}: no why-box`);
    assert.ok(roles.some((r) => /brand_mark|website_footer/.test(r)), `${layout}: no brand`);
  }
});

// ================= FREEFORM RENDERER =======================
test("C4B1-17. renderBlueprintHtml positions every zone and never throws on a missing slot", () => {
  const v = validateBlueprint(FALLBACK_BLUEPRINTS.deal_hero, { target: "ig_45" });
  const html = renderBlueprintHtml(v.blueprint, { slots: buildSlots("deal_hero", { factLock: buildFactLock({ facts_json: { card_name: "Gyarados EX", total_price_usd: 12.99, market_price: 23, discount_pct: 45 } }), resolved: { data: {} }, cardArt: {} }) });
  assert.match(html, /class="stage"/);
  assert.ok((html.match(/position:absolute;left:\d+px;top:\d+px/g) || []).length >= 6);
  // a blueprint referencing a data primitive with no slot data still renders (error box, no throw)
  const bare = validateBlueprint({ content_zones: [{ role: "hero_card", x: 40, y: 40, width: 400, height: 600, priority: 10 }, { role: "price_pair", x: 500, y: 40, width: 400, height: 200, priority: 7 }] }, { target: "ig_45" }).blueprint;
  assert.doesNotThrow(() => renderBlueprintHtml(bare, { slots: {} }));
});

test("C4B1-18. buildSlots maps ONLY real values; a card story with real prices yields price primitives", () => {
  const slots = buildSlots("deal_hero", { factLock: buildFactLock({ facts_json: { card_name: "Charizard", total_price_usd: 180, market_price: 300, discount_pct: 40, card_set: "Obsidian Flames" } }), resolved: { data: {} }, cardArt: {} });
  assert.equal(slots.price_pair.a, 180);
  assert.equal(slots.price_pair.b, 300);
  assert.equal(slots.price_gap_bar.listed, 180);
  assert.equal(slots.hero_stat.value, "40%");
  assert.match(slots.headline.text, /Charizard/);
});

// ================= GATE STILL HOLDS + SCOPE ================
test("C4B1-19. freeform hybrid still blocks the unrelated-era Umbreon (editorial gate)", async () => {
  const r = await runHybridPipeline({
    story: { series: "EXACT_PRINTING_MATTERS", facts_json: {} }, platform: "instagram", layout: "printing_compare",
    printingPair: { high: { name: "Umbreon", set: "Evolving Skies", card_number: "215", market_price: 520 }, low: { name: "Umbreon", set: "Neo Discovery", card_number: "13", market_price: 110 } },
    freeform: true, enabled: true, env: {}, fetchImpl: mockFetch(() => chatJSON({})),
  });
  assert.equal(r.ok, false);
  assert.equal(r.state, "EDITORIAL_WITHHOLD");
});

test("C4B1-20. hybrid + freeform are OFF by default", () => {
  assert.equal(freeformEnabled({}), false);
  assert.equal(freeformEnabled({ SOCIAL_HYBRID_FREEFORM: "false" }), false);
  assert.equal(freeformEnabled({ SOCIAL_HYBRID_FREEFORM: "true" }), true);
});

test("C4B1-21. the freeform layer performs NO Buffer / cron / Stage-1 / RIGHTS / email / eBay action", () => {
  for (const f of hybridFiles) {
    const src = code(f);
    assert.doesNotMatch(src, /createPost|scheduleOne|reconcileOne/, `${f} Buffer`);
    assert.doesNotMatch(src, /SOCIAL_BUFFER_BACKLOG_ENABLED\s*=|REFILL_SCHEDULE|CronCreate|vercel\.json/, `${f} schedule`);
    assert.doesNotMatch(src, /RIGHTS_STATE\.publishing\s*=/, `${f} RIGHTS`);
    assert.doesNotMatch(src, /resend|sendEmail|newsletter_subscribers/i, `${f} email`);
    assert.doesNotMatch(src, /getBrowse|browse api|\bebay\b/i, `${f} eBay`);
    assert.doesNotMatch(src, /from\(\s*price_history\s*\)/, `${f} price_history`);
  }
  assert.ok(TEXT_FIT_VERSION);
});

test("C4B1-22. verify / scanner cadence untouched: no scanner or verify-deals reference in the freeform layer", () => {
  for (const f of hybridFiles) {
    assert.doesNotMatch(code(f), /verify-deals|verifyDeals|runScanner|scanner cadence/i, `${f}`);
  }
});
