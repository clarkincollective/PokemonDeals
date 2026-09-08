// Phase SOCIAL-CREATIVE-4C.1 - generative video art direction.
// OPENAI DESIGNS THE SCENES. CODE ANIMATES THEM. THE FACT SYSTEM OWNS TRUTH.
// Pure-logic + source-scan + a mocked image/vision fetch. No real OpenAI.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { FAILURE_STATES, REVISABLE_STATES } from "../../lib/newsroom/editorial/failureStates.mjs";
import {
  directVideo, boardScenesFrom, deriveMotionLayout, buildBoardBrief,
  buildGenerativeMotionPlan, buildGenerativeVideoDocument, gradeCreativeQa,
  STYLE_BAR, MAX_BOARDS_PER_VIDEO, GENERATIVE_VIDEO_DIRECTOR_VERSION,
} from "../../lib/newsroom/video/index.mjs";
import { buildFactManifest } from "../../lib/newsroom/hybrid/fullGenerative.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..");
const read = (p) => readFileSync(join(REPO, p), "utf8");
const code = (p) => read(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1").replace(/`(?:\\[\s\S]|[^`\\])*`/g, "``").replace(/"(?:\\.|[^"\\])*"/g, '""').replace(/'(?:\\.|[^'\\])*'/g, "''");
const VID_FILES = readdirSync(join(REPO, "lib/newsroom/video")).map((f) => `lib/newsroom/video/${f}`);

const SEM_DEAL = Object.freeze({
  layout: "deal_hero", classification: "COMMERCIAL",
  comparison_left: { label: "listed price", value: 20, text: "$20" },
  comparison_right: { label: "market reference", value: 36, text: "$36" },
  comparison_direction: "BELOW_MARKET", comparison_pct: 44,
  card_identity: { name: "Magneton", set: "Base Set" },
  card_metadata_lock: { _displayable: ["name", "set"], name: "Magneton", set: "Base Set" },
  required_numeric_facts: { listed_price: 20, market_price: 36, discount_pct: 44 }, fact_lock_hash: "a",
  required_takeaway: "the listed price is genuinely below the real market reference", appropriate_lesson: "compare",
});
const SEM_MKT = Object.freeze({
  layout: "market_shape", classification: "EDITORIAL",
  claim_scope: "ALL_TRACKED_SINGLES", claim_value: 85.7, claim_population: "24,545 tracked singles", claim_metric: "share selling under $25",
  example_card: "Clefairy", example_card_is_not_population: true,
  visualization_data_manifest: { allowed_points: [{ label: "Under $25", value: 85.7 }, { label: "$25\u2013$100", value: 9.6 }, { label: "$100+", value: 4.7 }], source_population: 24545 },
  card_metadata_lock: { _displayable: ["name"], name: "Clefairy" }, required_takeaway: "the stat applies to the tracked population",
});
const planDeal = () => directVideo({ story: { story_id: "s" }, semanticManifest: SEM_DEAL, family: "deal_hero", captionHandoff: { semantic_hash: "c" }, cardImagePaths: ["/x.png"] });
const planMkt = () => directVideo({ story: { story_id: "s" }, semanticManifest: SEM_MKT, family: "market_shape", captionHandoff: { semantic_hash: "c" }, cardImagePaths: [] });
const FM_DEAL = buildFactManifest({ layout: "deal_hero", factLock: { card_name: "Magneton", card_set: "Base Set", listed_price: 20, market_price: 36, discount_pct: 44 }, resolved: null, contract: { classification: "COMMERCIAL" } });

// ================= BOARD SCENES =========================
test("SC4C1-1. the micro-scene plan collapses to 3-5 board scenes covering hook..cta", () => {
  for (const p of [planDeal(), planMkt()]) {
    const bs = boardScenesFrom(p);
    assert.ok(bs.length >= 3 && bs.length <= MAX_BOARDS_PER_VIDEO, `${p.family} -> ${bs.length} boards`);
    assert.equal(bs[0].role, "hook");
    assert.equal(bs[bs.length - 1].role, "cta");
    for (const b of bs) {
      assert.ok(b.end_ms > b.start_ms);
      assert.ok(Array.isArray(b.required_copy));
    }
    // the boards span the whole video
    assert.equal(bs[0].start_ms, 0);
    assert.ok(Math.abs(bs[bs.length - 1].end_ms - p.duration) < 50);
  }
});

test("SC4C1-2. deriveMotionLayout gives a zone map read FROM the generated board (not a fixed template)", () => {
  const bs = boardScenesFrom(planDeal());
  const hero = bs.find((b) => b.role === "card_hero") ?? bs[1];
  const ml = deriveMotionLayout(hero);
  assert.equal(ml.reads_from, "generated_scene_board");
  assert.ok(ml.emphasis_zones.includes("card_zone"));
  assert.ok(ml.zones.includes("chart_zone") && ml.zones.includes("why_zone") && ml.zones.includes("cta_zone"));
});

// ================= THE ART BRIEF ========================
test("SC4C1-3. the board brief carries the FULL_GENERATIVE_SOCIAL style, the anti-sparse rules, the brand-safe zone and the real facts", () => {
  const bs = boardScenesFrom(planDeal());
  const brief = buildBoardBrief({ boardScene: bs[1], index: 1, total: bs.length, family: "deal_hero", semanticManifest: SEM_DEAL, factManifest: FM_DEAL, continuity: "one campaign" });
  assert.match(brief, /premium Pokemon-card collector editorial/i);
  assert.match(brief, /trading-card magazine|collectibles publication/i);
  assert.match(brief, /VISUALLY DENSE|AVOID:.*sparse/i);
  assert.match(brief, /centred card on an empty ground|single centred card/i);
  assert.match(brief, /TOP-LEFT CORNER.*clear|brand chip/i);
  assert.match(brief, /NEVER draw a Poke Ball/i);
  assert.match(brief, /MAY NOT.*INVENT DATA|not invent/i);
  assert.match(brief, /\$20/);       // the real listed price
  assert.match(brief, /\$36/);       // the real market reference
  assert.match(brief, /CONTINUITY/); // §10 visual continuity
  // the CTA board is told to leave the brand strip empty
  const ctaBrief = buildBoardBrief({ boardScene: bs[bs.length - 1], index: bs.length - 1, total: bs.length, family: "deal_hero", semanticManifest: SEM_DEAL, factManifest: FM_DEAL, continuity: "x" });
  assert.match(ctaBrief, /website-first|do not draw a logo/i);
});

// ================= CREATIVE QA GATE (§17) ===============
test("SC4C1-4. a centred-card-only board -> CENTERED_CARD_ONLY_FAIL", () => {
  const r = gradeCreativeQa({ composition_density: 62, empty_space_pct: 30, is_centered_card_only: true, editorial_richness: 55, matches_premium_collector_editorial: true, has_designed_background: true }, "card_hero");
  assert.equal(r.ok, false);
  assert.equal(r.state, "CENTERED_CARD_ONLY_FAIL");
});

test("SC4C1-5. a sparse template -> SPARSE_TEMPLATE_FAIL", () => {
  const r = gradeCreativeQa({ composition_density: 30, empty_space_pct: 38, is_sparse_template: true, editorial_richness: 55, matches_premium_collector_editorial: true, has_designed_background: true }, "explanation");
  assert.equal(r.ok, false);
  assert.equal(r.state, "SPARSE_TEMPLATE_FAIL");
});

test("SC4C1-6. an empty frame -> EXCESS_EMPTY_SPACE_FAIL; a HUD frame -> GENERIC_MOTION_GRAPHICS_FAIL; off-style -> VISUAL_STYLE_MISMATCH_FAIL", () => {
  assert.equal(gradeCreativeQa({ composition_density: 60, empty_space_pct: 58, editorial_richness: 60, matches_premium_collector_editorial: true, has_designed_background: true }, "explanation").state, "EXCESS_EMPTY_SPACE_FAIL");
  assert.equal(gradeCreativeQa({ composition_density: 75, empty_space_pct: 20, is_generic_motion_graphics: true, editorial_richness: 65, matches_premium_collector_editorial: true, has_designed_background: true }, "explanation").state, "GENERIC_MOTION_GRAPHICS_FAIL");
  assert.equal(gradeCreativeQa({ composition_density: 70, empty_space_pct: 25, editorial_richness: 30, matches_premium_collector_editorial: false, has_designed_background: false }, "card_hero").state, "VISUAL_STYLE_MISMATCH_FAIL");
});

test("SC4C1-7. a dense, editorial, designed board PASSES", () => {
  const r = gradeCreativeQa({ composition_density: 80, empty_space_pct: 20, editorial_richness: 82, matches_premium_collector_editorial: true, has_designed_background: true, card_is_hero: true }, "card_hero");
  assert.equal(r.ok, true);
  assert.equal(r.scores.matches_style, true);
});

// ================= MOTION FROM DESIGNED FRAMES ==========
test("SC4C1-8. motion plan animates BETWEEN boards - entrance + hold-drift + exit, drift <= 3%", () => {
  const p = planDeal();
  const bs = boardScenesFrom(p);
  const mp = buildGenerativeMotionPlan({ boardScenes: bs, boards: [], plan: p });
  assert.equal(mp.length, bs.length);
  for (const m of mp) {
    assert.ok(m.entrance && m.entrance.dur_ms > 0);
    assert.ok(m.hold && m.hold.parallax_pct <= 3, `drift ${m.hold.parallax_pct}%`);
    assert.ok(m.exit);
  }
  // first board masks in, not a crossfade of a static poster
  assert.match(mp[0].entrance.type, /mask_reveal|wipe/);
  // board-to-board is a match cut (element motion), last board has no next
  assert.equal(mp[0].transition_to_next.type, "match_cut");
  assert.equal(mp[mp.length - 1].transition_to_next, null);
});

test("SC4C1-9. the generative document layers the DESIGNED boards + a deterministic brand strip, one shared paused timeline, no network subresource", () => {
  const p = planDeal();
  const bs = boardScenesFrom(p);
  const mp = buildGenerativeMotionPlan({ boardScenes: bs, boards: [], plan: p });
  const imgs = bs.map((b) => ({ index: b.index, role: b.role, b64: "iVBORw0KGgoAAAANSUhEUg==" }));
  const { html, total } = buildGenerativeVideoDocument({ plan: p, boardImages: imgs, motionPlan: mp, ctaText: "See the live deal" });
  assert.equal(total, p.duration);
  assert.match(html, /width:1080px;height:1920px/);
  assert.equal((html.match(/class="board"/g) || []).length, bs.length);
  assert.match(html, /width:100%;height:auto/);      // fit to width - nothing cropped horizontally
  assert.match(html, /animation-play-state:paused/);
  assert.match(html, /<b>Pokemon<\/b> Deal Finder/); // approved deterministic brand
  assert.doesNotMatch(html, /Poke\s?Ball|red-and-white ball/i);
  assert.doesNotMatch(html, /https?:\/\/[^"']*\.(png|jpe?g|webp)/i); // boards embedded as data:
});

// ================= FACT SAFETY UNCHANGED ================
test("SC4C1-10. the 4C.1 director still runs the 5A/5A.1 auditors per board (source scan)", () => {
  const src = read("lib/newsroom/video/generativeVideoDirector.mjs");
  assert.match(src, /reviewCardFidelity/);
  assert.match(src, /semanticVerify/);
  assert.match(src, /auditFactSources/);
  assert.match(src, /verifyFacts/);
  assert.match(src, /auditVideoCreativeQa/);
  // the fact system owns truth: the brief forbids invented data
  assert.match(src, /MAY NOT.*INVENT DATA/);
  // it reuses the approved image workflow, not a new one
  assert.match(src, /generateFullSocial/);
  assert.match(src, /buildMasterPrompt/);
});

test("SC4C1-11. it KEEPS the 4C plan (timing / motion vocab / fact timeline / safe zones) - does not rebuild them", () => {
  const src = read("lib/newsroom/video/generativeVideoDirector.mjs");
  assert.match(src, /directVideo\(/);            // reuses the 4C director
  assert.doesNotMatch(code("lib/newsroom/video/generativeVideoDirector.mjs"), /function directVideo|renderVideoPlanToMp4\s*\(/); // does not reimplement them
  // the renderer accepts a pre-built document rather than being forked
  assert.match(read("lib/newsroom/video/videoRenderer.mjs"), /document && document\.html/);
});

// ================= STATES / SAFETY =====================
test("SC4C1-12. all 4C.1 failure states declared + revisable; NO publishing / upload / cron / RIGHTS / email / eBay", () => {
  for (const s of ["SPARSE_TEMPLATE_FAIL", "CENTERED_CARD_ONLY_FAIL", "EXCESS_EMPTY_SPACE_FAIL", "GENERIC_MOTION_GRAPHICS_FAIL", "VISUAL_STYLE_MISMATCH_FAIL", "SCENE_BOARD_GENERATION_FAILED"]) {
    assert.ok(FAILURE_STATES.includes(s), `missing ${s}`);
  }
  for (const s of ["SPARSE_TEMPLATE_FAIL", "CENTERED_CARD_ONLY_FAIL", "EXCESS_EMPTY_SPACE_FAIL", "GENERIC_MOTION_GRAPHICS_FAIL", "VISUAL_STYLE_MISMATCH_FAIL"]) {
    assert.ok(REVISABLE_STATES.includes(s), `${s} should allow one bounded regen`);
  }
  for (const f of VID_FILES) {
    const src = code(f);
    assert.doesNotMatch(src, /tiktok\.com\/.*upload|youtube.*upload|uploadVideo|publishVideo/i, `${f} upload`);
    assert.doesNotMatch(src, /createPost|scheduleOne|bufferBacklog|BUFFER_ACCESS_TOKEN/i, `${f} Buffer`);
    assert.doesNotMatch(src, /CronCreate|vercel\.json|REFILL_SCHEDULE/i, `${f} cron`);
    assert.doesNotMatch(src, /RIGHTS_STATE|SOCIAL_.*_ENABLED|Stage\s*1/i, `${f} RIGHTS/Stage1`);
    assert.doesNotMatch(src, /resend|sendEmail|newsletter_subscribers/i, `${f} email`);
    assert.doesNotMatch(src, /getBrowse|browseApi|api\.ebay\.com/i, `${f} eBay Browse`);
  }
  assert.match(read("lib/newsroom/hybrid/imageMode.mjs"), /return "SAFE_FALLBACK"/);
  assert.equal(GENERATIVE_VIDEO_DIRECTOR_VERSION, "4c1.1");
});

test("SC4C1-13. STYLE_BAR is the shared FULL_GENERATIVE_SOCIAL language and rejects the old sparse look in words", () => {
  assert.match(STYLE_BAR, /premium Pokemon-card collector editorial/i);
  assert.match(STYLE_BAR, /visually DENSE|rich/i);
  assert.match(STYLE_BAR, /NOT templated|NOT sparse|NOT a centred card/i);
});
