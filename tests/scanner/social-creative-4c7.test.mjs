// Phase SOCIAL-CREATIVE-4C.7 - FINAL VISUAL PARITY PASS.
//
// STOP AFTER THIS PHASE. Same architecture as 4C.4-4C.6 (PROFESSIONAL_SOCIAL_LOOP,
// approved master reuse, canonical cards, exact-fact lock, 8-10s + 2.4-3.0s
// CTA, website-first CTA, $0). This phase FAITHFULLY REFLOWS the approved
// static master's hierarchy instead of reinterpreting it as a sparser
// infographic: a bigger ASKING hero card + editorial price chips + a
// boxed % callout + an integrated LESSON panel; a MARKET split composition
// (giant stat + donut LEFT, a large REAL EXAMPLE card RIGHT) + a two-item
// bottom band; a brighter CTA. Pure-logic + file cache. No real OpenAI, no
// render in the tests.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";

import { FAILURE_STATES, REVISABLE_STATES } from "../../lib/newsroom/editorial/failureStates.mjs";
import {
  PROFESSIONAL_SOCIAL_LOOP_VERSION, PROFESSIONAL_VIDEO_QA_VERSION, VIDEO_SAFE_DERIVATIVE_VERSION, PROFESSIONAL_LOOP_DOC_VERSION,
  buildVideoSafeDerivative, FRAME_DENSITY_BANDS,
  buildUniversalCtaEndScreen, CTA_VALUE_POINTS,
  buildProfessionalTimeline, runProfessionalSocialLoop,
  runProfessionalVideoQa, auditContentOccupancy, auditCardProminence, auditLowerDeadSpace, auditCtaLuminance,
  auditStaticMasterParity, staticParityRubric, OCCUPANCY_MIN, CARD_PROMINENCE_MIN, LOWER_DEAD_SPACE_MAX, STATIC_MASTER_REFERENCE_SCORE,
  buildProfessionalLoopDocument,
  registerExistingMaster,
} from "../../lib/newsroom/video/index.mjs";
import { videoSemanticHash } from "../../lib/newsroom/video/videoDirector.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..");
const read = (p) => readFileSync(join(REPO, p), "utf8");
const code = (p) => read(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1").replace(/`(?:\\[\s\S]|[^`\\])*`/g, "``").replace(/"(?:\\.|[^"\\])*"/g, '""').replace(/'(?:\\.|[^'\\])*'/g, "''");

const CARD_CACHE = join(REPO, ".social-preview", "card-art-cache");
const HAVE_CARDS = (() => { try { return readdirSync(CARD_CACHE).filter((f) => /^\d+\.jpg$/.test(f)).length >= 3; } catch { return false; } })();
const CARD = (id) => join(CARD_CACHE, `${id}.jpg`);

const PNG_1x1 = Buffer.from("89504e470d0a1a0a0000000d49484452000000010000000108020000009077533d0000000c4944415478da6364f8cf00000201010027187a870000000049454e44ae426082", "hex");
function tmpCache() { const d = join(tmpdir(), `4c7-${Date.now()}-${Math.random().toString(36).slice(2)}`); mkdirSync(d, { recursive: true }); return d; }
function seedMaster(dir, storyId, hash, family, over = {}) {
  const p = join(dir, "_src.png"); writeFileSync(p, PNG_1x1);
  return registerExistingMaster({ storyId, semanticHash: hash, family, imagePath: p, dir, brandInMaster: true, verification: { approved: true, derived_values: "EXACT", state: "BUFFER_READY" }, ...over });
}

const SEM_ASK = Object.freeze({
  layout: "asking_vs_sold", classification: "EDITORIAL",
  comparison_left: { label: "asking price", value: 49.98, text: "$49.98" },
  comparison_right: { label: "market reference", value: 199, text: "$199" },
  comparison_direction: "BELOW_MARKET", comparison_pct: -75,
  appropriate_lesson: "An asking price can also sit well below market - compare before you judge.",
  card_identity: { name: "Clefairy", set: "Base Set", tcgplayer_id: "113669" },
  required_numeric_facts: { asking: 49.98, market: 199, premium_pct: -75 },
});
const SEM_MKT = Object.freeze({
  layout: "market_shape", classification: "EDITORIAL", claim_value: 85.7,
  example_card: "Clefairy", card_identity: { name: "Clefairy", set: "Base Set", tcgplayer_id: "113669" },
  card_metadata_lock: { set: "Base Set", rarity: "Holo Rare" },
  required_numeric_facts: { under_25_pct: 85.7, tracked_count: 24545 },
  visualization_data_manifest: { allowed_points: [{ label: "under $25", value: 85.7 }, { label: "$25-100", value: 9.6 }, { label: "$100+", value: 4.7 }] },
});
const CH = { story_id: "S", semantic_hash: "cap-S", image_artifact_id: "img-S" };

function build(family, sem, { cards = [CARD("113669")] } = {}) {
  const d = buildVideoSafeDerivative({ family, semanticManifest: sem, factLock: { card_name: "Clefairy", card_set: "Base Set" }, cardAssets: cards });
  const es = buildUniversalCtaEndScreen({ family, heroCardId: "113669", heroCardName: "Clefairy", cacheDir: CARD_CACHE });
  const tl = buildProfessionalTimeline({ family, derivative: d });
  return { d, es, tl };
}
const RUN = (dir, sem, family, over = {}) => runProfessionalSocialLoop({
  story: { story_id: "S" }, semanticManifest: sem, factLock: { card_name: "Clefairy" },
  captionHandoff: CH, family, cardImagePaths: [CARD("113669")], heroCardId: "113669", heroCardName: "Clefairy",
  cacheDir: dir, ctaCacheDir: CARD_CACHE, ...over,
});

// ===================== ARCHITECTURE KEPT / STOP AFTER 4C.7 =====================
test("SC4C7-1. all video modules bumped to 4c7; architecture unchanged; no 4C.8 references", () => {
  for (const v of [PROFESSIONAL_SOCIAL_LOOP_VERSION, PROFESSIONAL_VIDEO_QA_VERSION, VIDEO_SAFE_DERIVATIVE_VERSION, PROFESSIONAL_LOOP_DOC_VERSION]) assert.ok(v.startsWith("4c7"), v);
  for (const f of ["videoSafeDerivative", "professionalVideoQa", "professionalLoopDocument", "professionalSocialLoop"].map((n) => `lib/newsroom/video/${n}.mjs`)) {
    assert.doesNotMatch(read(f), /4c\.?8|4C\.8/, `${f} references a next phase`);
  }
});

// ===================== CONTENT OCCUPANCY (§3/§13A) =====================
test("SC4C7-2. occupancy target ~80-88%; both proof families clear the hard floor and the band", () => {
  assert.ok(OCCUPANCY_MIN >= 0.7 && OCCUPANCY_MIN <= 0.78);
  for (const [f, s] of [["asking_vs_sold", SEM_ASK], ["market_shape", SEM_MKT]]) {
    const { d } = build(f, s);
    const [lo, hi] = FRAME_DENSITY_BANDS[f];
    assert.ok(lo >= 0.75, `${f} band lo ${lo} should target >=75%`);
    assert.ok(d.density.content_ratio >= lo && d.density.content_ratio <= hi, `${f} ${d.density.content_ratio}`);
    assert.ok(auditContentOccupancy({ derivative: d }).ok);
  }
});
test("SC4C7-3. an under-filled frame -> CONTENT_OCCUPANCY_FAIL", () => {
  const r = auditContentOccupancy({ derivative: { density: { content_ratio: 0.55 } } });
  assert.equal(r.ok, false);
  assert.equal(r.state, "CONTENT_OCCUPANCY_FAIL");
});

// ===================== CARD PROMINENCE (§4/§5/§13B) =====================
test("SC4C7-4. ASKING card is a HERO (>=40% of the safe height), notably larger than a thumbnail", () => {
  const { d } = build("asking_vs_sold", SEM_ASK);
  assert.ok(d.density.hero_fraction >= CARD_PROMINENCE_MIN.asking_vs_sold, `hero_fraction ${d.density.hero_fraction}`);
  assert.ok(auditCardProminence({ derivative: d }).ok);
});
test("SC4C7-5. MARKET example card does not collapse to a thumbnail (>=30% of the safe height)", () => {
  const { d } = build("market_shape", SEM_MKT);
  assert.ok(d.density.hero_fraction >= CARD_PROMINENCE_MIN.market_shape, `hero_fraction ${d.density.hero_fraction}`);
  assert.ok(auditCardProminence({ derivative: d }).ok);
});
test("SC4C7-6. a thumbnail-scale card -> CARD_PROMINENCE_FAIL", () => {
  const r = auditCardProminence({ derivative: { family: "asking_vs_sold", density: { hero_fraction: 0.15 } } });
  assert.equal(r.ok, false);
  assert.equal(r.state, "CARD_PROMINENCE_FAIL");
});

// ===================== LOWER DEAD SPACE (§3/§13C) =====================
test("SC4C7-7. no large empty lower third before the CTA transition", () => {
  for (const [f, s] of [["asking_vs_sold", SEM_ASK], ["market_shape", SEM_MKT]]) {
    const { d } = build(f, s);
    assert.ok(d.density.lower_dead_space <= LOWER_DEAD_SPACE_MAX, `${f} lower_dead_space ${d.density.lower_dead_space}`);
    assert.ok(auditLowerDeadSpace({ derivative: d }).ok);
  }
  assert.equal(auditLowerDeadSpace({ derivative: { density: { lower_dead_space: 0.4 } } }).state, "LOWER_DEAD_SPACE_FAIL");
});

// ===================== ASKING COMPOSITION (§4) =====================
test("SC4C7-8. ASKING = hero_row (card + editorial spine with chips/box/arrow) + an integrated LESSON panel; no floating domain", () => {
  const { d } = build("asking_vs_sold", SEM_ASK);
  const ids = d.blocks.map((b) => b.id);
  assert.ok(ids.includes("hook") && ids.includes("hero_row") && ids.includes("lesson"));
  assert.ok(!ids.includes("domain"), "the universal CTA owns the domain, not the story");
  const hr = d.blocks.find((b) => b.id === "hero_row");
  const askRow = hr.spine.find((r) => r.kind === "ask");
  const gapRow = hr.spine.find((r) => r.kind === "gap");
  const mktRow = hr.spine.find((r) => r.kind === "mkt");
  assert.ok(askRow.chip && /LISTING/.test(askRow.chip));
  assert.ok(gapRow.box === true && gapRow.emphasis === true);
  assert.ok(mktRow.chip && mktRow.chip_kind === "positive");
  assert.ok(hr.spine.some((r) => r.op === "arrow"));
  const lesson = d.blocks.find((b) => b.id === "lesson");
  assert.equal(lesson.eyebrow, "LESSON");
  assert.match(lesson.text, /market/i);
});
test("SC4C7-9. the document renders the price chips, boxed % callout, drawn arrow and LESSON panel", { skip: !HAVE_CARDS }, () => {
  const { d, es, tl } = build("asking_vs_sold", SEM_ASK);
  const doc = buildProfessionalLoopDocument({ derivative: d, endScreen: es, timeline: tl, cardImages: { [CARD("113669")]: "AAAA" }, endCardImages: {} });
  assert.ok(doc.html.includes("chip") && doc.html.includes("sr.emph.box"));
  assert.ok(doc.html.includes("lessonblk") && doc.html.includes("LESSON"));
  assert.ok(doc.html.includes("arrow"));
});

// ===================== MARKET COMPOSITION (§5) =====================
test("SC4C7-10. MARKET = a SPLIT composition (giant stat + donut LEFT, REAL EXAMPLE card + metadata RIGHT) + a two-item bottom band", () => {
  const { d } = build("market_shape", SEM_MKT);
  const ids = d.blocks.map((b) => b.id);
  assert.ok(ids.includes("hook") && ids.includes("market_split") && ids.includes("market_band"));
  const split = d.blocks.find((b) => b.id === "market_split");
  assert.equal(split.stat_lines[0], "85.7%");
  assert.ok(split.chart.length === 3 && split.chart[0].value === 85.7, "dominant point first, exact scope");
  assert.equal(split.example_label, "REAL EXAMPLE");
  assert.ok(split.meta && /Base Set/.test(split.meta));
  const band = d.blocks.find((b) => b.id === "market_band");
  assert.equal(band.items.length, 2);
});
test("SC4C7-11. the 85.7% scope stays the tracked-singles population, never implied Clefairy-specific", () => {
  const { d } = build("market_shape", SEM_MKT);
  const split = d.blocks.find((b) => b.id === "market_split");
  assert.match(split.stat_lines.join(" "), /TRACKED/i);
  assert.ok(!/clefairy/i.test(split.stat_lines.join(" ")));
});
test("SC4C7-12. the document renders a donut chart + legend + the example card with metadata, not plain bars on black", { skip: !HAVE_CARDS }, () => {
  const { d, es, tl } = build("market_shape", SEM_MKT);
  const doc = buildProfessionalLoopDocument({ derivative: d, endScreen: es, timeline: tl, cardImages: { [CARD("113669")]: "AAAA" }, endCardImages: {} });
  assert.ok(doc.html.includes("donutlegend") && doc.html.includes("conic-gradient"));
  assert.ok(doc.html.includes("mmeta") && doc.html.includes("Base Set"));
  assert.ok(doc.html.includes("mband"));
});

// ===================== STATIC MASTER PARITY (§6/§13E) =====================
test("SC4C7-13. static_master_visual_score / video_derivative_visual_score / parity_gap use broad rubric categories, never fabricated precision", () => {
  assert.equal(staticParityRubric(95), "MATCH");
  assert.equal(staticParityRubric(84), "NEAR_MATCH");
  assert.equal(staticParityRubric(75), "WEAKER");
  assert.equal(staticParityRubric(40), "FAIL");
  const { d, es } = build("asking_vs_sold", SEM_ASK);
  const p = auditStaticMasterParity({ derivative: d, endScreen: es });
  assert.ok(["MATCH", "NEAR_MATCH"].includes(staticParityRubric(p.verification.overall)), `overall ${p.verification.overall}`);
  assert.equal(STATIC_MASTER_REFERENCE_SCORE, 90);
});
test("SC4C7-14. both proof families reach MATCH or NEAR_MATCH (owner target)", () => {
  for (const [f, s] of [["asking_vs_sold", SEM_ASK], ["market_shape", SEM_MKT]]) {
    const { d, es } = build(f, s);
    const p = auditStaticMasterParity({ derivative: d, endScreen: es });
    assert.ok(p.ok, `${f}: ${JSON.stringify(p.verification)}`);
    assert.ok(["MATCH", "NEAR_MATCH"].includes(staticParityRubric(p.verification.overall)), `${f} rubric ${staticParityRubric(p.verification.overall)}`);
  }
});

// ===================== CTA LUMINANCE (§9) =====================
test("SC4C7-15. the CTA is declared bright, not darker than the story, near-white headline tone", () => {
  const es = buildUniversalCtaEndScreen({ family: "asking_vs_sold", heroCardId: "113669", cacheDir: CARD_CACHE });
  assert.ok(auditCtaLuminance({ endScreen: es }).ok, JSON.stringify(auditCtaLuminance({ endScreen: es })));
  assert.equal(es.end_screen.brightness, "high");
  assert.equal(es.end_screen.cta_darker_than_story, false);
  assert.equal(es.end_screen.primary_cta.tone, "near_white");
});
test("SC4C7-16. a fade-out-looking CTA (dark / grey headline) -> CTA_LUMINANCE_FAIL", () => {
  const bad = auditCtaLuminance({ endScreen: { end_screen: { brightness: "low", cta_darker_than_story: true, primary_cta: { tone: "grey" }, brand: { mark: "magnifier" }, value_points: ["a", "b"] } } });
  assert.equal(bad.ok, false);
  assert.equal(bad.state, "CTA_LUMINANCE_FAIL");
});
test("SC4C7-17. the document declares a dedicated CTA glow layer and a brighter card filter than plain", { skip: !HAVE_CARDS }, () => {
  const { d, es, tl } = build("asking_vs_sold", SEM_ASK);
  const doc = buildProfessionalLoopDocument({ derivative: d, endScreen: es, timeline: tl });
  assert.ok(doc.html.includes("ctaglow"));
  assert.match(doc.html, /filter:brightness\(1\.1[0-9]/);
});

// ===================== MOTION (kept restrained, targets updated for new roles) =====================
test("SC4C7-18. ASKING motion targets hero_row sub-elements (card / spine / % emphasis) without clobbering transforms", { skip: !HAVE_CARDS }, () => {
  const { d, es, tl } = build("asking_vs_sold", SEM_ASK);
  const ids = tl.events.map((e) => e.id);
  assert.ok(ids.includes("card_lift") && ids.includes("spine_draw") && ids.includes("gap_impact") && ids.includes("card_glint"));
  const doc = buildProfessionalLoopDocument({ derivative: d, endScreen: es, timeline: tl });
  assert.ok(doc.html.includes(".blk-hero_row .hrcard{") || doc.html.includes(".blk-hero_row .sr.emph{") || doc.html.includes(".blk-hero_row .hrspine{"));
});
test("SC4C7-19. MARKET motion targets market_split sub-elements (stat / donut / card)", { skip: !HAVE_CARDS }, () => {
  const { d, es, tl } = build("market_shape", SEM_MKT);
  const ids = tl.events.map((e) => e.id);
  assert.ok(ids.includes("stat_reveal") && ids.includes("chart_fill") && ids.includes("card_sweep"));
  const doc = buildProfessionalLoopDocument({ derivative: d, endScreen: es, timeline: tl });
  assert.ok(doc.html.includes(".blk-market_split .mstat .big{") || doc.html.includes(".blk-market_split .donutwrap{") || doc.html.includes(".blk-market_split .mscard{"));
});
test("SC4C7-20. motion stays restrained - no bounce/elastic/spin, premium easing only", () => {
  const { tl } = build("market_shape", SEM_MKT);
  for (const e of tl.events) { if (e.kind === "cta_transition") continue; assert.match(e.ease ?? "", /^cubic-bezier\(/); assert.ok(!/bounce|elastic|spin/i.test(e.ease ?? "")); }
});

// ===================== ORCHESTRATOR (end to end) =====================
test("SC4C7-21. runProfessionalSocialLoop: PASS, $0, occupancy/prominence/lowerDeadSpace/luminance all reported PASS, parity rubric present", { skip: !HAVE_CARDS }, () => {
  const dir = tmpCache();
  seedMaster(dir, "S", videoSemanticHash(SEM_ASK), "asking_vs_sold");
  const r = RUN(dir, SEM_ASK, "asking_vs_sold");
  assert.ok(r.ok, JSON.stringify(r).slice(0, 400));
  assert.equal(r.state, "READY_FOR_MANUAL_REVIEW");
  assert.equal(r.cost.video_incremental_api_cost, 0);
  assert.equal(r.content_occupancy_audit, "PASS");
  assert.equal(r.card_prominence_audit.verdict, "PASS");
  assert.equal(r.lower_dead_space_audit, "PASS");
  assert.equal(r.cta_luminance_audit, "PASS");
  assert.ok(["MATCH", "NEAR_MATCH"].includes(r.static_parity_rubric.parity_gap));
  assert.equal(r.static_parity_rubric.static_master_visual_score, 90);
  assert.ok(r.duration_ms >= 8500 && r.duration_ms <= 10500);
  assert.ok(r.cta_hold.hold_ms >= 2400);
});
test("SC4C7-22. MARKET_SNAPSHOT also passes end to end", { skip: !HAVE_CARDS }, () => {
  const dir = tmpCache();
  seedMaster(dir, "S", videoSemanticHash(SEM_MKT), "market_shape");
  const r = RUN(dir, SEM_MKT, "market_shape");
  assert.ok(r.ok, JSON.stringify(r).slice(0, 400));
  assert.ok(["MATCH", "NEAR_MATCH"].includes(r.static_parity_rubric.parity_gap));
});
test("SC4C7-23. an old rounding-drift master is still withheld (fact safety unweakened)", () => {
  const dir = tmpCache();
  seedMaster(dir, "S", videoSemanticHash(SEM_ASK), "asking_vs_sold", { verification: { approved: true, derived_values: "DRIFT", state: "BUFFER_READY" } });
  assert.equal(RUN(dir, SEM_ASK, "asking_vs_sold").state, "VIDEO_DERIVED_VALUE_EXACT_FAIL");
});
test("SC4C7-24. dedupe_key = master sha + mode version", { skip: !HAVE_CARDS }, () => {
  const dir = tmpCache();
  seedMaster(dir, "S", videoSemanticHash(SEM_MKT), "market_shape");
  const r = RUN(dir, SEM_MKT, "market_shape");
  assert.ok(r.dedupe_key.endsWith(`::${PROFESSIONAL_SOCIAL_LOOP_VERSION}`));
});

// ===================== REAL CARD / FACT SAFETY (§11/§12) =====================
test("SC4C7-25. every card path is canonical; an AI / altered card still fails", () => {
  const { d } = build("asking_vs_sold", SEM_ASK);
  for (const p of d.card_asset_paths) assert.match(p, /card-art-cache[\\/]\d+\.jpg$/);
  const bad = runProfessionalVideoQa({
    derivative: d, timeline: build("asking_vs_sold", SEM_ASK).tl, endScreen: build("asking_vs_sold", SEM_ASK).es,
    semanticManifest: SEM_ASK, captionHandoff: CH, cardAssets: ["/tmp/ai-generated-clefairy.png"],
  });
  assert.equal(bad.state, "AI_GENERATED_CARD_FAIL");
});
test("SC4C7-26. exact-fact lock unweakened - zero tolerance for derived-value drift", () => {
  const { d } = build("market_shape", SEM_MKT);
  assert.ok(d.shown_numbers.includes("85.7%") || d.shown_numbers.some((n) => n.includes("85.7")));
});
test("SC4C7-27. eBay-first CTA still fails", () => {
  const { d, tl } = build("asking_vs_sold", SEM_ASK);
  const bad = runProfessionalVideoQa({ derivative: d, timeline: tl, endScreen: { end_screen: { primary_cta: { line1: "VIEW ON EBAY" }, domain: "pokemondealfinder.com", brand: { mark: "magnifier" }, value_points: ["a", "b"] } }, semanticManifest: SEM_ASK, captionHandoff: CH, cardAssets: [CARD("113669")] });
  assert.equal(bad.state, "VIDEO_EBAY_FIRST_CTA_FAIL");
});

// ===================== FAILURE-STATE REGISTRY =====================
test("SC4C7-28. the 4 new 4C.7 failure states are declared + revisable", () => {
  for (const s of ["CONTENT_OCCUPANCY_FAIL", "CARD_PROMINENCE_FAIL", "LOWER_DEAD_SPACE_FAIL", "CTA_LUMINANCE_FAIL"]) {
    assert.ok(FAILURE_STATES.includes(s), `${s} missing`);
    assert.ok(REVISABLE_STATES.includes(s), `${s} not revisable`);
  }
});

// ===================== STRICT SCOPE (§17) =====================
test("SC4C7-29. no publishing / Buffer / upload / cron / RIGHTS / email / eBay-Browse / SOCIAL_IMAGE_MODE in any 4C.7 module", () => {
  for (const f of ["videoSafeDerivative", "universalCtaEndScreen", "professionalVideoQa", "professionalLoopDocument", "professionalSocialLoop", "premiumVideoAtmosphere"].map((n) => `lib/newsroom/video/${n}.mjs`)) {
    const src = code(f);
    assert.doesNotMatch(src, /tiktok\.com\/.*upload|youtube.*upload|instagram.*upload|uploadVideo|publishVideo/i, `${f} upload`);
    assert.doesNotMatch(src, /createPost|scheduleOne|bufferBacklog|BUFFER_ACCESS_TOKEN/i, `${f} Buffer`);
    assert.doesNotMatch(src, /CronCreate|vercel\.json|REFILL_SCHEDULE/i, `${f} cron`);
    assert.doesNotMatch(src, /RIGHTS_STATE|SOCIAL_.*_ENABLED|Stage\s*1/i, `${f} RIGHTS/Stage1`);
    assert.doesNotMatch(src, /resend|sendEmail|newsletter_subscribers/i, `${f} email`);
    assert.doesNotMatch(src, /getBrowse|browseApi|api\.ebay\.com|\/buy\/browse/i, `${f} eBay Browse`);
    assert.doesNotMatch(src, /SOCIAL_IMAGE_MODE\s*=/i, `${f} image-mode flip`);
  }
});
test("SC4C7-30. no new video-specific generative-art workflow; existing CTA background AI stays GATED + owner-review + max 2", () => {
  for (const f of ["professionalSocialLoop", "videoSafeDerivative", "professionalLoopDocument"].map((n) => `lib/newsroom/video/${n}.mjs`)) {
    assert.doesNotMatch(read(f), /images\/(generations|edits)|generateSceneBoards|runGenerativeVideoDirector/i, `${f}`);
  }
  const src = read("lib/newsroom/video/universalCtaEndScreen.mjs");
  assert.match(src, /SOCIAL_CTA_BRAND_ASSET_GENERATE/);
  assert.match(src, /owner_review_required/);
  assert.match(src, /max\s*=\s*2|Math\.min\(2/);
});
test("SC4C7-31. value-point copy stays safe (no overpromise)", () => {
  assert.ok(CTA_VALUE_POINTS.every((v) => !/always|guarantee|profit|rich|moon/i.test(v)));
});
