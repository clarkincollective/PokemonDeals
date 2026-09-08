// Phase SOCIAL-CREATIVE-4C.2 - one-master layered motion system.
// ONE PREMIUM MASTER. LAYER IT. ANIMATE THE STORY. Optional extra frame
// only when justified. Near-zero incremental video cost when a verified
// master already exists.
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
  MULTI_BOARD_VIDEO, buildChoreography, buildAudioCueTimeline, runMasterLayeredMotion,
  MASTER_LAYERED_MOTION_VERSION,
  registerExistingMaster, getMasterCreative, putMasterCreative, listMasters, masterCacheKey,
  deriveLayers, MOTION_LAYERS,
  auditMasterMotion, auditVideoDerivedExact, scorePremiumMotion,
  buildMasterMotionDocument,
} from "../../lib/newsroom/video/index.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..");
const read = (p) => readFileSync(join(REPO, p), "utf8");
const code = (p) => read(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1").replace(/`(?:\\[\s\S]|[^`\\])*`/g, "``").replace(/"(?:\\.|[^"\\])*"/g, '""').replace(/'(?:\\.|[^'\\])*'/g, "''");
const VID_FILES = readdirSync(join(REPO, "lib/newsroom/video")).map((f) => `lib/newsroom/video/${f}`);

// a tiny valid PNG (1x1) so the cache has a real file to sha + size
const PNG_1x1 = Buffer.from("89504e470d0a1a0a0000000d49484452000000010000000108020000009077533d0000000c4944415478da6364f8cf00000201010027187a870000000049454e44ae426082", "hex");
function tmpCache() { const d = join(tmpdir(), `4c2-${Date.now()}-${Math.random().toString(36).slice(2)}`); mkdirSync(d, { recursive: true }); return d; }
function seedMaster(dir, storyId, hash, family = "deal_hero") {
  const p = join(dir, "_src.png"); writeFileSync(p, PNG_1x1);
  return registerExistingMaster({ storyId, semanticHash: hash, family, imagePath: p, dir });
}

const SEM_DEAL = Object.freeze({
  layout: "deal_hero", classification: "COMMERCIAL", appropriate_lesson: "compare",
  comparison_left: { label: "listed price", value: 20, text: "$20" },
  comparison_right: { label: "market reference", value: 36, text: "$36" },
  comparison_direction: "BELOW_MARKET", comparison_pct: 44,
  card_identity: { name: "Magneton", set: "Base Set" },
  card_metadata_lock: { _displayable: ["name", "set"], name: "Magneton", set: "Base Set" },
  required_numeric_facts: { listed_price: 20, market_price: 36, discount_pct: 44 }, fact_lock_hash: "a",
  required_takeaway: "the listed price is genuinely below the real market reference",
});
const SEM_MKT = Object.freeze({
  layout: "market_shape", classification: "EDITORIAL",
  claim_scope: "ALL_TRACKED_SINGLES", claim_value: 85.7, claim_population: "24,545 tracked singles",
  example_card: "Clefairy", example_card_is_not_population: true,
  visualization_data_manifest: { allowed_points: [{ label: "Under $25", value: 85.7 }, { label: "$25\u2013$100", value: 9.6 }, { label: "$100+", value: 4.7 }], source_population: 24545 },
  card_metadata_lock: { _displayable: ["name"], name: "Clefairy" }, required_takeaway: "the stat applies to the tracked population",
});

// ================= CACHE / REUSE (§4, §26) =============
test("SC4C2-1. an existing approved master is reused - runMasterLayeredMotion costs $0", async () => {
  const dir = tmpCache();
  const hash = videoSemanticHash(SEM_DEAL);
  seedMaster(dir, "DEAL_DROP", hash);
  const r = await runMasterLayeredMotion({ story: { story_id: "DEAL_DROP" }, semanticManifest: SEM_DEAL, captionHandoff: { semantic_hash: "c", image_artifact_id: "i" }, family: "deal_hero", cacheDir: dir, allowGenerate: false });
  assert.equal(r.ok, true, r.reason);
  assert.equal(r.state, "MASTER_LAYERED_MOTION_READY");
  assert.equal(r.master.from_cache, true);
  assert.equal(r.cost.master_generation_cost, 0);
  assert.equal(r.cost.video_incremental_api_cost, 0);
  assert.equal(r.cost.extra_frame_cost, 0);
  rmSync(dir, { recursive: true, force: true });
});

test("SC4C2-2. a duplicate master (same story_id + semantic_hash) is NOT regenerated / rewritten", () => {
  const dir = tmpCache();
  const hash = videoSemanticHash(SEM_DEAL);
  const a = seedMaster(dir, "DEAL_DROP", hash);
  assert.ok(a._stored);
  const b = seedMaster(dir, "DEAL_DROP", hash);
  assert.equal(b._deduped, true);
  assert.equal(listMasters({ dir }).length, 1);
  rmSync(dir, { recursive: true, force: true });
});

test("SC4C2-3. no approved master + allowGenerate:false -> MASTER_CREATIVE_UNAVAILABLE (no board generation)", async () => {
  const dir = tmpCache();
  const r = await runMasterLayeredMotion({ story: { story_id: "NOPE" }, semanticManifest: SEM_DEAL, captionHandoff: { semantic_hash: "c" }, family: "deal_hero", cacheDir: dir, allowGenerate: false, env: {} });
  assert.equal(r.ok, false);
  assert.equal(r.state, "MASTER_CREATIVE_UNAVAILABLE");
  rmSync(dir, { recursive: true, force: true });
});

test("SC4C2-4. MULTI_BOARD_VIDEO is marked EXPENSIVE_FALLBACK; the default mode is MASTER_LAYERED_MOTION", () => {
  assert.equal(MULTI_BOARD_VIDEO, "EXPENSIVE_FALLBACK");
  const raw = read("lib/newsroom/video/masterLayeredMotion.mjs");
  assert.match(raw, /the NEW primary\s*\/\/\s*video mode|NEW primary video mode/);
  assert.match(raw, /EXPENSIVE_FALLBACK - not used by default/);
  // the master-motion module does NOT import / call the multi-board generator
  assert.doesNotMatch(code("lib/newsroom/video/masterLayeredMotion.mjs"), /generateSceneBoards|runGenerativeVideoDirector/);
});

// ================= CHOREOGRAPHY (§9-§16) ==============
test("SC4C2-5. the first meaningful fact lands <= 350ms and the opening is not logo-only / black", () => {
  for (const [fam, sem] of [["deal_hero", SEM_DEAL], ["market_shape", SEM_MKT]]) {
    const ch = buildChoreography({ family: fam, semanticManifest: sem });
    const b0 = ch.beats[0];
    assert.equal(b0.at_ms, 0);
    assert.ok((b0.text?.lines?.length) || (b0.reveals ?? []).some((r) => r !== "brand"));
    assert.notEqual(b0.dominant, "brand");
    const layers = deriveLayers({ family: fam, semanticManifest: sem });
    const a = auditMasterMotion({ choreography: ch, layers });
    assert.equal(a.verification?.dead_opening, "PASS", a.reason);
    assert.equal(a.verification?.weak_hook, "PASS");
  }
});

test("SC4C2-6. a logo-only opening -> DEAD_OPENING_FAIL; a hook with no figure -> WEAK_HOOK_FAIL", () => {
  const ch = buildChoreography({ family: "deal_hero", semanticManifest: SEM_DEAL });
  const layers = deriveLayers({ family: "deal_hero", semanticManifest: SEM_DEAL });
  const dead = JSON.parse(JSON.stringify(ch));
  dead.beats[0] = { ...dead.beats[0], text: null, reveals: ["brand"], dominant: "brand", visual: "logo only" };
  assert.equal(auditMasterMotion({ choreography: dead, layers }).state, "DEAD_OPENING_FAIL");
  const weak = JSON.parse(JSON.stringify(ch));
  weak.beats[0] = { ...weak.beats[0], text: { lines: ["look at this"] }, reveals: ["headline"] };
  assert.equal(auditMasterMotion({ choreography: weak, layers }).state, "WEAK_HOOK_FAIL");
});

test("SC4C2-7. one dominant thought per beat: <= 2 lines / <= 7 words each", () => {
  for (const fam of ["deal_hero", "asking_vs_sold", "market_shape", "three_up"]) {
    const ch = buildChoreography({ family: fam, semanticManifest: fam === "market_shape" ? SEM_MKT : SEM_DEAL });
    for (const b of ch.beats) {
      const lines = b.text?.lines ?? [];
      assert.ok(lines.length <= 2, `${fam}/${b.id} ${lines.length} lines`);
      for (const l of lines) assert.ok(String(l).split(/\s+/).filter(Boolean).length <= 7, `${fam}/${b.id} "${l}"`);
    }
  }
});

test("SC4C2-8. the hero card is present across most beats + the reveal order is HOOK->CARD->VALUE->WHY->CTA", () => {
  const ch = buildChoreography({ family: "deal_hero", semanticManifest: SEM_DEAL });
  const layers = deriveLayers({ family: "deal_hero", semanticManifest: SEM_DEAL });
  assert.ok(layers.layers.hero_card.present);
  assert.ok(layers.order.indexOf("headline") < layers.order.indexOf("hero_card"));
  assert.ok(layers.order.indexOf("hero_card") < layers.order.indexOf("cta"));
  // hero card is the dominant / camera subject on multiple beats
  const heroBeats = ch.beats.filter((b) => b.dominant === "hero_card" || b.camera?.crop_to === "hero_card").length;
  assert.ok(heroBeats >= 2, `hero card dominant on only ${heroBeats} beats`);
});

// ================= MOTION QA (§20, §21) ===============
test("SC4C2-9. the default choreography passes the premium motion audit + score", () => {
  for (const [fam, sem] of [["deal_hero", SEM_DEAL], ["asking_vs_sold", SEM_DEAL], ["market_shape", SEM_MKT]]) {
    const ch = buildChoreography({ family: fam, semanticManifest: sem });
    const layers = deriveLayers({ family: fam, semanticManifest: sem });
    const a = auditMasterMotion({ choreography: ch, layers });
    assert.equal(a.ok, true, `${fam}: ${a.reason}`);
    const s = scorePremiumMotion({ choreography: ch, layers, motionAudit: a });
    assert.equal(s.verdict, "PASS", `${fam} premium ${s.score}`);
    assert.equal(s.owner_review_required, true);
  }
});

test("SC4C2-10. a whole-poster-zoom-only cut -> WHOLE_POSTER_MOTION_FAIL / POSTER_DRIFT_FAIL", () => {
  const ch = buildChoreography({ family: "deal_hero", semanticManifest: SEM_DEAL });
  const layers = deriveLayers({ family: "deal_hero", semanticManifest: SEM_DEAL });
  const bad = JSON.parse(JSON.stringify(ch));
  bad.beats = bad.beats.map((b) => ({ ...b, camera: { crop_to: "full", scale: 1.2 }, motion: "scale", reveals: [], text: null }));
  const a = auditMasterMotion({ choreography: bad, layers });
  assert.equal(a.ok, false);
  assert.ok(["WHOLE_POSTER_MOTION_FAIL", "POSTER_DRIFT_FAIL", "CHEAP_EDIT_FAIL", "WEAK_HOOK_FAIL", "DEAD_OPENING_FAIL"].includes(a.state));
});

test("SC4C2-11. an over-long static non-final hold -> EXCESSIVE_STATIC_HOLD_FAIL", () => {
  const ch = buildChoreography({ family: "deal_hero", semanticManifest: SEM_DEAL });
  const layers = deriveLayers({ family: "deal_hero", semanticManifest: SEM_DEAL });
  const bad = JSON.parse(JSON.stringify(ch));
  bad.beats[3] = { ...bad.beats[3], at_ms: 3200, end_ms: 8200, motion: "hold", reveals: [], text: null };
  const a = auditMasterMotion({ choreography: bad, layers });
  assert.equal(a.findings.some((f) => f.code === "EXCESSIVE_STATIC_HOLD_FAIL"), true);
});

test("SC4C2-12. a CTA that fills the frame -> CTA_BANNER_AD_FAIL", () => {
  const ch = buildChoreography({ family: "deal_hero", semanticManifest: SEM_DEAL });
  const layers = deriveLayers({ family: "deal_hero", semanticManifest: SEM_DEAL });
  const bigCta = { ...layers, layers: { ...layers.layers, cta: { ...layers.layers.cta, zone: { x: 0, y: 0.4, w: 1, h: 0.4 } } } };
  const a = auditMasterMotion({ choreography: ch, layers: bigCta });
  assert.equal(a.findings.some((f) => f.code === "CTA_BANNER_AD_FAIL"), true);
});

// ================= EXACT ROUNDING (§19) ==============
test("SC4C2-13. a shown 45% for a declared 44% -> VIDEO_DERIVED_VALUE_EXACT_FAIL (zero tolerance)", () => {
  const bad = auditVideoDerivedExact({ extraction: { headline: "45% below market", all_numbers: ["$20", "$36", "45%"] }, semanticManifest: SEM_DEAL });
  assert.equal(bad.ok, false);
  assert.equal(bad.state, "VIDEO_DERIVED_VALUE_EXACT_FAIL");
  const ok = auditVideoDerivedExact({ extraction: { all_numbers: ["$20", "$36", "44%"] }, semanticManifest: SEM_DEAL });
  assert.equal(ok.ok, true);
});

// ================= LAYERS / DOC / POSTER =============
test("SC4C2-14. deriveLayers gives every motion layer + a per-family zone map (not a fixed template)", () => {
  const L = deriveLayers({ family: "deal_hero", semanticManifest: SEM_DEAL });
  for (const name of MOTION_LAYERS) assert.ok(L.layers[name], `missing layer ${name}`);
  assert.ok(L.layers.hero_card.zone.w > 0 && L.layers.hero_card.zone.h > 0);
  // a market_shape master zones the card off to the side, not centre-full
  const M = deriveLayers({ family: "market_shape", semanticManifest: SEM_MKT });
  assert.notDeepEqual(M.layers.hero_card.zone, L.layers.hero_card.zone);
  assert.ok(M.layers.chart.present);
});

test("SC4C2-15. the master-motion document is one master + camera + captions, one shared paused timeline, no re-drawn copies, no network", () => {
  const ch = buildChoreography({ family: "deal_hero", semanticManifest: SEM_DEAL });
  const layers = deriveLayers({ family: "deal_hero", semanticManifest: SEM_DEAL });
  const { html, total } = buildMasterMotionDocument({ masterB64: "iVBORw0KGgo=", masterMime: "image/png", choreography: ch, layers });
  assert.equal(total, ch.duration_ms);
  assert.match(html, /width:1080px;height:1920px/);
  assert.equal((html.match(/class="master"/g) || []).length, 1); // ONE master, not re-drawn copies
  assert.match(html, /@keyframes cam/);
  assert.match(html, /animation-play-state:paused/);
  assert.match(html, /<b>Pokemon<\/b> Deal Finder/);
  assert.doesNotMatch(html, /https?:\/\//);
});

test("SC4C2-16. audio cue timeline carries premium sound-design cues, no music asset (§18)", () => {
  const ch = buildChoreography({ family: "deal_hero", semanticManifest: SEM_DEAL });
  const cues = ch.audio_cue_timeline.cues.map((c) => c.id);
  assert.ok(cues.includes("card_reveal_whoosh"));
  assert.ok(cues.includes("price_tick") || cues.includes("comparison_snap"));
  assert.ok(cues.includes("cta_cue"));
  assert.match(ch.audio_cue_timeline.music, /NONE/);
});

test("SC4C2-17. safe zones preserved; ONE 9:16 master; caption handoff linked; poster derived locally", async () => {
  const dir = tmpCache();
  seedMaster(dir, "DEAL_DROP", videoSemanticHash(SEM_DEAL));
  const r = await runMasterLayeredMotion({ story: { story_id: "DEAL_DROP" }, semanticManifest: SEM_DEAL, captionHandoff: { semantic_hash: "cap-x", image_artifact_id: "img-x" }, family: "deal_hero", cacheDir: dir, allowGenerate: false });
  assert.deepEqual(r.safe_zones, SAFE);
  assert.equal(r.choreography.width, 1080);
  assert.equal(r.choreography.height, 1920);
  assert.equal(r.caption_link.semantic_hash, "cap-x");
  assert.match(r.poster_from, /master_animated_state|local/);
  assert.equal(r.extra_frame, null); // §22 - no extra frame by default
  rmSync(dir, { recursive: true, force: true });
});

test("SC4C2-18. an optional extra frame is never auto-added and would require a reason (§22)", () => {
  const src = read("lib/newsroom/video/masterLayeredMotion.mjs");
  assert.match(src, /extra_frame:\s*null/);
  assert.match(src, /extra_frame_reason/);
  // no default multi-frame generation
  assert.doesNotMatch(code("lib/newsroom/video/masterLayeredMotion.mjs"), /for\s*\(.*board.*of|boards\.map|generateSceneBoards/);
});

// ================= STATES / SAFETY ==================
test("SC4C2-19. all 4C.2 failure states declared; NO publishing / upload / cron / RIGHTS / Stage-1 / email / eBay-Browse / SOCIAL_IMAGE_MODE flip", () => {
  for (const s of ["VIDEO_DERIVED_VALUE_EXACT_FAIL", "CHEAP_EDIT_FAIL", "POSTER_DRIFT_FAIL", "DEAD_OPENING_FAIL", "WEAK_HOOK_FAIL", "WHOLE_POSTER_MOTION_FAIL", "EXCESSIVE_STATIC_HOLD_FAIL", "CTA_BANNER_AD_FAIL", "LOW_MOTION_HIERARCHY_FAIL", "MASTER_CREATIVE_UNAVAILABLE"]) {
    assert.ok(FAILURE_STATES.includes(s), `missing ${s}`);
  }
  for (const f of VID_FILES) {
    const src = code(f);
    assert.doesNotMatch(src, /tiktok\.com\/.*upload|youtube.*upload|uploadVideo|publishVideo/i, `${f} upload`);
    assert.doesNotMatch(src, /createPost|scheduleOne|bufferBacklog|BUFFER_ACCESS_TOKEN/i, `${f} Buffer`);
    assert.doesNotMatch(src, /CronCreate|vercel\.json|REFILL_SCHEDULE/i, `${f} cron`);
    assert.doesNotMatch(src, /RIGHTS_STATE|SOCIAL_.*_ENABLED|Stage\s*1/i, `${f} RIGHTS/Stage1`);
    assert.doesNotMatch(src, /resend|sendEmail|newsletter_subscribers/i, `${f} email`);
    assert.doesNotMatch(src, /getBrowse|browseApi|api\.ebay\.com/i, `${f} eBay Browse`);
    assert.doesNotMatch(src, /SOCIAL_IMAGE_MODE\s*=/i, `${f} image-mode flip`);
  }
  assert.match(read("lib/newsroom/hybrid/imageMode.mjs"), /return "SAFE_FALLBACK"/);
  assert.equal(MASTER_LAYERED_MOTION_VERSION, "4c2.1");
});

test("SC4C2-20. fact timeline complete + semantic checks unchanged (source scan)", () => {
  const src = read("lib/newsroom/video/masterLayeredMotion.mjs");
  assert.match(src, /directVideo\(/);          // reuses the 4C director for timing / fact timeline
  assert.match(src, /auditVideoDerivedExact/); // §19 exact derived-value lock
  // a generated master still goes through the 5A/5A.1 audit before caching
  assert.match(src, /runFullGenerativeSocial/);
  assert.match(src, /derived_values:\s*"EXACT"/);
});
