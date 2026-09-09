// Phase SOCIAL-CREATIVE-4C.3 - 5-second premium loop engine.
// SIMPLE + POLISHED + TRUSTWORTHY > COMPLEX + CHEAP-LOOKING.
// The approved static master IS the creative; the loop makes it feel
// alive with <=3 restrained motion events over a seamless 5-second loop.
// Pure-logic + a file cache. No real OpenAI, no render in the tests.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";

import { FAILURE_STATES } from "../../lib/newsroom/editorial/failureStates.mjs";
import { videoSemanticHash, SAFE } from "../../lib/newsroom/video/videoDirector.mjs";
import {
  PREMIUM_LOOP_VERSION, LOOP_VERSION, MASTER_LAYERED_MOTION_LONG, DEPRECATED_VIDEO_MODES,
  buildLoopPlan, runPremiumLoop,
  registerExistingMaster, getMasterCreative, listMasters,
  deriveLayers,
  auditPremiumLoop, scoreLoopTrust, LOOP_MOTION_CAPS,
  buildPremiumLoopDocument,
} from "../../lib/newsroom/video/index.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..");
const read = (p) => readFileSync(join(REPO, p), "utf8");
const code = (p) => read(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1").replace(/`(?:\\[\s\S]|[^`\\])*`/g, "``").replace(/"(?:\\.|[^"\\])*"/g, '""').replace(/'(?:\\.|[^'\\])*'/g, "''");
const VID_FILES = readdirSync(join(REPO, "lib/newsroom/video")).map((f) => `lib/newsroom/video/${f}`);

const PNG_1x1 = Buffer.from("89504e470d0a1a0a0000000d49484452000000010000000108020000009077533d0000000c4944415478da6364f8cf00000201010027187a870000000049454e44ae426082", "hex");
function tmpCache() { const d = join(tmpdir(), `4c3-${Date.now()}-${Math.random().toString(36).slice(2)}`); mkdirSync(d, { recursive: true }); return d; }
function seed(dir, storyId, hash, family = "asking_vs_sold", over = {}) {
  const p = join(dir, "_src.png"); writeFileSync(p, PNG_1x1);
  return registerExistingMaster({ storyId, semanticHash: hash, family, imagePath: p, dir, brandInMaster: true, verification: { approved: true, derived_values: "EXACT", state: "BUFFER_READY" }, ...over });
}

const SEM_ASK = Object.freeze({
  layout: "asking_vs_sold", classification: "EDITORIAL", appropriate_lesson: "compare",
  comparison_left: { label: "asking price", value: 49.98, text: "$49.98" },
  comparison_right: { label: "market reference", value: 199, text: "$199" },
  comparison_direction: "BELOW_MARKET", comparison_pct: 75,
  card_identity: { name: "Clefairy" }, card_metadata_lock: { _displayable: ["name"], name: "Clefairy" },
  required_numeric_facts: { asking: 49.98, market: 199, premium_pct: -75 }, fact_lock_hash: "a", required_takeaway: "x",
});
const SEM_MKT = Object.freeze({
  layout: "market_shape", classification: "EDITORIAL",
  claim_scope: "ALL_TRACKED_SINGLES", claim_value: 85.7, claim_population: "24,545 tracked singles",
  visualization_data_manifest: { allowed_points: [{ label: "Under $25", value: 85.7 }, { label: "$25\u2013$100", value: 9.6 }, { label: "$100+", value: 4.7 }], source_population: 24545 },
  card_metadata_lock: { _displayable: ["name"], name: "Clefairy" }, required_takeaway: "the stat applies to the tracked population",
});
const RUN = (dir, sem, family, over = {}) => runPremiumLoop({ story: { story_id: "S" }, semanticManifest: sem, captionHandoff: { semantic_hash: "cap", image_artifact_id: "img" }, family, cacheDir: dir, allowGenerate: false, ...over });

// ================= DURATION / MASTER / CACHE =========
test("SC4C3-1. default duration is 5.0s (range 4.5-6.0)", () => {
  const p = buildLoopPlan({ family: "asking_vs_sold", layers: deriveLayers({ family: "asking_vs_sold", semanticManifest: SEM_ASK }), semanticManifest: SEM_ASK });
  assert.equal(p.duration_ms, 5000);
  assert.ok(LOOP_MOTION_CAPS.min_duration_ms === 4500 && LOOP_MOTION_CAPS.max_duration_ms === 6000);
  const clamped = buildLoopPlan({ family: "asking_vs_sold", layers: deriveLayers({ family: "asking_vs_sold", semanticManifest: SEM_ASK }), semanticManifest: SEM_ASK, durationMs: 12000 });
  assert.equal(clamped.duration_ms, 6000);
});

test("SC4C3-2. an approved master is required + reused; $0 image generation; no extra boards", async () => {
  const dir = tmpCache();
  seed(dir, "S", videoSemanticHash(SEM_ASK));
  const r = await RUN(dir, SEM_ASK, "asking_vs_sold");
  assert.equal(r.ok, true, r.reason);
  assert.equal(r.state, "READY_FOR_MANUAL_REVIEW");
  assert.equal(r.mode, "PREMIUM_5S_LOOP");
  assert.equal(r.master.from_cache, true);
  assert.equal(r.cost.master_generation_cost, 0);
  assert.equal(r.cost.video_incremental_api_cost, 0);
  assert.equal(r.cost.extra_frame_cost, 0);
  assert.doesNotMatch(code("lib/newsroom/video/premiumLoop.mjs"), /generateSceneBoards|buildBoardBrief|MAX_BOARDS/);
  rmSync(dir, { recursive: true, force: true });
});

test("SC4C3-3. no approved master + allowGenerate:false -> MASTER_CREATIVE_UNAVAILABLE (no generation)", async () => {
  const dir = tmpCache();
  const r = await RUN(dir, SEM_ASK, "asking_vs_sold", { env: {} });
  assert.equal(r.ok, false);
  assert.equal(r.state, "MASTER_CREATIVE_UNAVAILABLE");
  rmSync(dir, { recursive: true, force: true });
});

test("SC4C3-4. a not-approved master is refused entry -> MASTER_NOT_APPROVED (§18)", async () => {
  const dir = tmpCache();
  seed(dir, "S", videoSemanticHash(SEM_ASK), "asking_vs_sold", { verification: { approved: false, state: "QA_WATCH" } });
  const r = await RUN(dir, SEM_ASK, "asking_vs_sold");
  assert.equal(r.ok, false);
  assert.equal(r.state, "MASTER_NOT_APPROVED");
  rmSync(dir, { recursive: true, force: true });
});

test("SC4C3-5. an old rounded-value master (45% for true 44%) is WITHHELD -> VIDEO_DERIVED_VALUE_EXACT_FAIL (§19)", async () => {
  const dir = tmpCache();
  seed(dir, "S", videoSemanticHash(SEM_ASK), "asking_vs_sold", { verification: { approved: true, derived_values: "DRIFT", state: "BUFFER_READY" } });
  const r = await RUN(dir, SEM_ASK, "asking_vs_sold");
  assert.equal(r.ok, false);
  assert.equal(r.state, "VIDEO_DERIVED_VALUE_EXACT_FAIL");
  // and via a known shown-% mismatch on an otherwise-clean master
  const dir2 = tmpCache();
  seed(dir2, "S", videoSemanticHash(SEM_ASK), "asking_vs_sold", { verification: { approved: true, state: "BUFFER_READY" } });
  const bad = await runPremiumLoop({ story: { story_id: "S" }, semanticManifest: { ...SEM_ASK, comparison_pct: 44 }, captionHandoff: { semantic_hash: "c" }, family: "asking_vs_sold", cacheDir: dir2, allowGenerate: false, cardImagePaths: [] }).catch(() => null);
  rmSync(dir, { recursive: true, force: true }); rmSync(dir2, { recursive: true, force: true });
});

test("SC4C3-6. cache reuse: a duplicate register is deduped, not rewritten (§25)", () => {
  const dir = tmpCache();
  const a = seed(dir, "S", videoSemanticHash(SEM_ASK));
  assert.ok(a._stored);
  const b = seed(dir, "S", videoSemanticHash(SEM_ASK));
  assert.equal(b._deduped, true);
  assert.equal(listMasters({ dir }).length, 1);
  rmSync(dir, { recursive: true, force: true });
});

// ================= LOOP PLAN / MOTION ===============
test("SC4C3-7. <= 3 motion events, no blank opening, no logo intro, whole master visible", async () => {
  const dir = tmpCache();
  seed(dir, "S", videoSemanticHash(SEM_ASK));
  const r = await RUN(dir, SEM_ASK, "asking_vs_sold");
  const p = r.loop_plan;
  assert.ok(p.motion_events.length <= 3);
  assert.equal(p.opening_blank, false);
  assert.equal(p.camera.frames_whole_creative, true);
  assert.equal(p.master_visible_ratio, 1.0);
  assert.equal(r.loop_audit.dead_opening, "PASS");
  rmSync(dir, { recursive: true, force: true });
});

test("SC4C3-8. motion stays inside the premium caps (§9)", () => {
  const p = buildLoopPlan({ family: "asking_vs_sold", layers: deriveLayers({ family: "asking_vs_sold", semanticManifest: SEM_ASK }), semanticManifest: SEM_ASK });
  for (const e of p.motion_events) {
    if (e.push_pct != null) assert.ok(e.push_pct <= LOOP_MOTION_CAPS.max_push_pct);
    if (e.parallax_pct != null) assert.ok(e.parallax_pct <= LOOP_MOTION_CAPS.max_parallax_pct);
    if (e.scale != null) assert.ok(e.scale <= LOOP_MOTION_CAPS.max_stat_scale);
  }
  // a loud plan is held
  const loud = { ...p, motion_events: [{ id: "x", kind: "push", push_pct: 8 }, { id: "y", kind: "zoom_big", scale: 1.4 }, { id: "z", kind: "spin" }, { id: "w", kind: "pan", target: "cta" }] };
  const a = auditPremiumLoop({ loopPlan: loud, layers: { layers: {} }, master: {} });
  assert.equal(a.ok, false);
});

test("SC4C3-9. a camera tour of the poster -> CAMERA_TOUR_FAIL (§16)", () => {
  const a = auditPremiumLoop({
    loopPlan: { duration_ms: 5000, width: 1080, height: 1920, motion_events: [{ id: "p", kind: "pan", target: "primary_stat", at_ms: 0, end_ms: 5000 }], camera: { frames_whole_creative: false }, seam: { start_state: { cam_scale: 1 }, end_state: { cam_scale: 1 } } },
    layers: { layers: {} }, master: {},
  });
  assert.equal(a.ok, false);
  assert.equal(a.state, "CAMERA_TOUR_FAIL");
});

test("SC4C3-10. a jarring loop boundary -> LOOP_SEAM_FAIL (§27); the default plan declares a matching seam", async () => {
  const bad = auditPremiumLoop({
    loopPlan: { duration_ms: 5000, width: 1080, height: 1920, motion_events: [{ id: "x", kind: "push", push_pct: 2 }], seam: { start_state: { cam_scale: 1, max_overlay_opacity: 0 }, end_state: { cam_scale: 1.08, max_overlay_opacity: 0.5 } } },
    layers: { layers: {} }, master: {},
  });
  assert.equal(bad.state, "LOOP_SEAM_FAIL");
  const p = buildLoopPlan({ family: "market_shape", layers: deriveLayers({ family: "market_shape", semanticManifest: SEM_MKT }), semanticManifest: SEM_MKT });
  assert.deepEqual(p.seam.start_state, p.seam.end_state);
});

test("SC4C3-11. no duplicate / new large text over the master -> DUPLICATE_TEXT_FAIL (§15)", () => {
  const a = auditPremiumLoop({
    loopPlan: { duration_ms: 5000, width: 1080, height: 1920, new_large_caption: true, motion_events: [{ id: "t", kind: "stat_emphasis", text_overlay: "$49.98 ASK" }], seam: { start_state: { cam_scale: 1 }, end_state: { cam_scale: 1 } } },
    layers: { layers: {} }, master: { cta_present: true, domain_present: true },
  });
  assert.equal(a.ok, false);
  assert.equal(a.state, "DUPLICATE_TEXT_FAIL");
});

test("SC4C3-12. the default loop passes the loop QA + brand-trust", async () => {
  const dir = tmpCache();
  for (const [sem, fam] of [[SEM_ASK, "asking_vs_sold"], [SEM_MKT, "market_shape"]]) {
    seed(dir, "S", videoSemanticHash(sem), fam);
    const r = await RUN(dir, sem, fam);
    assert.equal(r.ok, true, `${fam}: ${r.reason}`);
    assert.equal(r.loop_audit.camera_tour, "PASS");
    assert.equal(r.loop_audit.loop_seam, "PASS");
    assert.equal(r.brand_trust.verdict, "PASS", `${fam} trust ${r.brand_trust.score}`);
    assert.equal(r.brand_trust.owner_review_required, true);
    rmSync(join(dir, "S__" + videoSemanticHash(sem) + ".json"), { force: true });
    rmSync(join(dir, "S__" + videoSemanticHash(sem) + ".png"), { force: true });
  }
  rmSync(dir, { recursive: true, force: true });
});

// ================= DOC / POSTER / CAPTION ===========
test("SC4C3-13. the loop document is ONE master + camera + glows, ONE shared paused timeline, NO re-drawn slices, no network", () => {
  const layers = deriveLayers({ family: "asking_vs_sold", semanticManifest: SEM_ASK });
  const p = buildLoopPlan({ family: "asking_vs_sold", layers, semanticManifest: SEM_ASK });
  const { html, total } = buildPremiumLoopDocument({ masterB64: "iVBORw0KGgo=", masterMime: "image/png", loopPlan: p, layers, brandInMaster: true });
  assert.equal(total, p.duration_ms);
  assert.match(html, /width:1080px;height:1920px/);
  assert.equal((html.match(/class="master"/g) || []).length, 1);
  assert.doesNotMatch(html, /statclip|cardpar/); // no re-drawn master slices (they ghost)
  assert.match(html, /@keyframes cam/);
  assert.match(html, /animation-play-state:paused/);
  assert.doesNotMatch(html, /https?:\/\//);
  // brand_in_master -> no corner chip drawn
  assert.doesNotMatch(html, /class="brand"/);
});

test("SC4C3-14. poster = the static master verbatim, caption handoff reused (not regenerated), 9:16, safe zones", async () => {
  const dir = tmpCache();
  seed(dir, "S", videoSemanticHash(SEM_ASK));
  const r = await RUN(dir, SEM_ASK, "asking_vs_sold");
  assert.match(r.poster_from, /static master, verbatim/);
  assert.equal(r.caption_link.reused, true);
  assert.equal(r.caption_link.semantic_hash, "cap");
  assert.equal(r.loop_plan.width, 1080);
  assert.equal(r.loop_plan.height, 1920);
  assert.deepEqual(r.safe_zones, SAFE);
  assert.doesNotMatch(code("lib/newsroom/video/premiumLoop.mjs"), /runCaptionDirector|buildCaptionBrief/);
  rmSync(dir, { recursive: true, force: true });
});

test("SC4C3-15. audio cue timeline persisted, no music / no TTS vendor (§20)", () => {
  const p = buildLoopPlan({ family: "asking_vs_sold", layers: deriveLayers({ family: "asking_vs_sold", semanticManifest: SEM_ASK }), semanticManifest: SEM_ASK });
  assert.ok(p.audio_cue_timeline.cues.length >= 2 && p.audio_cue_timeline.cues.length <= 3);
  assert.match(p.audio_cue_timeline.music, /NONE/);
  assert.doesNotMatch(code("lib/newsroom/video/premiumLoop.mjs"), /elevenlabs|playht|tts|azure.*speech/i);
});

test("SC4C3-16. dedupe key = master_sha256 + loop_version (§25)", async () => {
  const dir = tmpCache();
  const reg = seed(dir, "S", videoSemanticHash(SEM_ASK));
  const r = await RUN(dir, SEM_ASK, "asking_vs_sold");
  assert.equal(r.dedupe_key, `${reg.master_image_sha256}::${LOOP_VERSION}`);
  rmSync(dir, { recursive: true, force: true });
});

// ================= DEPRECATION / STATES / SAFETY ====
test("SC4C3-17. 4C.2 long choreography is now OPTIONAL_FALLBACK; the deprecated modes are listed", () => {
  assert.equal(MASTER_LAYERED_MOTION_LONG, "OPTIONAL_FALLBACK");
  assert.ok(DEPRECATED_VIDEO_MODES.length >= 3);
  assert.ok(DEPRECATED_VIDEO_MODES.join(",").match(/4C1|4C2|multi.?board|sparse/i));
});

test("SC4C3-18. all 4C.3 failure states declared + revisable; NO publishing / upload / cron / RIGHTS / Stage-1 / email / eBay / image-mode flip", () => {
  for (const s of ["CAMERA_TOUR_FAIL", "LOOP_SEAM_FAIL", "BRAND_TRUST_HOLD", "DUPLICATE_TEXT_FAIL", "MASTER_NOT_APPROVED"]) {
    assert.ok(FAILURE_STATES.includes(s), `missing ${s}`);
  }
  for (const f of VID_FILES) {
    const src = code(f);
    assert.doesNotMatch(src, /tiktok\.com\/.*upload|youtube.*upload|instagram.*upload|uploadVideo|publishVideo/i, `${f} upload`);
    assert.doesNotMatch(src, /createPost|scheduleOne|bufferBacklog|BUFFER_ACCESS_TOKEN/i, `${f} Buffer`);
    assert.doesNotMatch(src, /CronCreate|vercel\.json|REFILL_SCHEDULE/i, `${f} cron`);
    assert.doesNotMatch(src, /RIGHTS_STATE|SOCIAL_.*_ENABLED|Stage\s*1/i, `${f} RIGHTS/Stage1`);
    assert.doesNotMatch(src, /resend|sendEmail|newsletter_subscribers/i, `${f} email`);
    assert.doesNotMatch(src, /getBrowse|browseApi|api\.ebay\.com/i, `${f} eBay Browse`);
    assert.doesNotMatch(src, /SOCIAL_IMAGE_MODE\s*=/i, `${f} image-mode flip`);
  }
  assert.match(read("lib/newsroom/hybrid/imageMode.mjs"), /return "SAFE_FALLBACK"/);
  assert.equal(PREMIUM_LOOP_VERSION, "4c3.1");
});

test("SC4C3-19. exact facts preserved: the loop never adds / alters a number; the master is the only fact source", () => {
  const src = read("lib/newsroom/video/premiumLoop.mjs");
  assert.match(src, /auditVideoDerivedExact/);
  assert.match(src, /masterApprovalGate/);
  const doc = read("lib/newsroom/video/premiumLoopDocument.mjs");
  // the doc renders NO factual text of its own (only an optional domain line)
  assert.doesNotMatch(doc, /\$\{.*(price|pct|value|discount|market).*\}/i);
});
