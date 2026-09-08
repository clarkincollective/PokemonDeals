// Phase SOCIAL-CREATIVE-4C - motion-native short-form video engine.
// VIDEO MUST BE MOTION-NATIVE. Not a slideshow / Ken Burns / template.
// Pure-logic + source-scan. No real Chrome render, no OpenAI, no I/O.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { FAILURE_STATES } from "../../lib/newsroom/editorial/failureStates.mjs";
import {
  directVideo, runVideoDirector, auditVideo, auditPacing, scoreMotionQuality,
  buildVideoDocument, VIDEO_W, VIDEO_H, SAFE, DURATION_WINDOWS,
  APPROVED_MOTION_KEYS, BANNED_MOTIONS, isBannedMotion,
  VIDEO_DIRECTOR_VERSION,
} from "../../lib/newsroom/video/index.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..");
const read = (p) => readFileSync(join(REPO, p), "utf8");
const code = (p) => read(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1").replace(/`(?:\\[\s\S]|[^`\\])*`/g, "``").replace(/"(?:\\.|[^"\\])*"/g, '""').replace(/'(?:\\.|[^'\\])*'/g, "''");
const VIDEO_FILES = readdirSync(join(REPO, "lib/newsroom/video")).map((f) => `lib/newsroom/video/${f}`);

// ---- fixtures ------------------------------------------
const SEM_ASK = Object.freeze({
  layout: "asking_vs_sold", classification: "EDITORIAL",
  required_takeaway: "asking != market", appropriate_lesson: "compare before you judge",
  comparison_left: { label: "asking price", value: 49.98, text: "$49.98" },
  comparison_right: { label: "market reference", value: 199, text: "$199" },
  comparison_direction: "BELOW_MARKET", comparison_pct: 75,
  card_identity: { name: "Clefairy", set: "Base Set (Shadowless)" },
  card_metadata_lock: { _displayable: ["name", "set"], name: "Clefairy", set: "Base Set (Shadowless)" },
  required_numeric_facts: { asking: 49.98, market: 199 }, fact_lock_hash: "a",
});
const SEM_DEAL = Object.freeze({
  layout: "deal_hero", classification: "COMMERCIAL",
  comparison_left: { label: "listed price", value: 20, text: "$20" },
  comparison_right: { label: "market reference", value: 36, text: "$36" },
  comparison_direction: "BELOW_MARKET", comparison_pct: 44,
  card_identity: { name: "Magneton", set: "Base Set" },
  card_metadata_lock: { _displayable: ["name", "set"], name: "Magneton", set: "Base Set" },
  required_numeric_facts: { listed_price: 20, market_price: 36, discount_pct: 44 }, fact_lock_hash: "b",
  required_takeaway: "the listed price is genuinely below the real market reference",
});
const SEM_MKT = Object.freeze({
  layout: "market_shape", classification: "EDITORIAL",
  claim_scope: "ALL_TRACKED_SINGLES", claim_value: 85.7, claim_population: "24,545 tracked singles",
  claim_metric: "share selling under $25",
  example_card: "Clefairy", example_card_is_not_population: true,
  forbidden_scope_phrases: ["85.7% of clefairy singles", "24,545 clefairy singles"],
  visualization_data_manifest: { allowed_points: [{ label: "Under $25", value: 85.7 }, { label: "$25\u2013$100", value: 9.6 }, { label: "$100+", value: 4.7 }], source_population: 24545 },
  card_metadata_lock: { _displayable: ["name"], name: "Clefairy" },
  required_takeaway: "the stat applies to the tracked population, not to the example card",
});
const SEM_PRINT = Object.freeze({
  layout: "printing_compare", classification: "EDITORIAL",
  card_identity: { name: "Gengar" }, printing_axis: "1st Edition stamp",
  printing_identity_a: { name: "Gengar" },
  comparison_left: { label: "A", value: 330, text: "$330" },
  comparison_right: { label: "B", value: 20, text: "$20" },
  comparison_pct: 1550, required_takeaway: "the value difference follows from a real printing difference",
});
const CH = { story_id: "s1", cta: "See it on Pokemon Deal Finder", semantic_hash: "cap123", image_artifact_id: "img1" };
const planAsk = () => directVideo({ story: { story_id: "s1" }, semanticManifest: SEM_ASK, family: "asking_vs_sold", captionHandoff: CH, cardImagePaths: ["/x.png"] });
const planDeal = () => directVideo({ story: { story_id: "s2" }, semanticManifest: SEM_DEAL, family: "deal_hero", captionHandoff: CH, cardImagePaths: ["/x.png"] });
const planMkt = () => directVideo({ story: { story_id: "s3" }, semanticManifest: SEM_MKT, family: "market_shape", captionHandoff: CH, cardImagePaths: [] });

// ================= FORMAT / STRUCTURE ==================
test("SC4C-1. the hook lands within 1s and the first scene is not a logo intro", () => {
  for (const p of [planAsk(), planDeal(), planMkt()]) {
    assert.ok(p.hook.lands_by_ms <= 1800, `${p.family} hook lands at ${p.hook.lands_by_ms}`);
    assert.equal(p.hook.no_logo_intro, true);
    assert.equal(p.scenes[0].purpose, "hook");
    assert.doesNotMatch(p.scenes[0].visual, /logo|brand splash|wordmark/i);
    assert.notEqual(p.scenes[0].animation, "logo_intro");
  }
  // and the pacing auditor enforces it
  const p = planAsk();
  const slow = JSON.parse(JSON.stringify(p));
  slow.scenes[0].end_ms = 2600; slow.hook.lands_by_ms = 2600;
  assert.equal(auditPacing({ plan: slow }).ok, false);
});

test("SC4C-2. correct 9:16 master format + deterministic safe zones", () => {
  const p = planAsk();
  assert.equal(p.width, 1080);
  assert.equal(p.height, 1920);
  assert.equal(VIDEO_W, 1080);
  assert.equal(VIDEO_H, 1920);
  assert.deepEqual(p.safe_zones, SAFE);
  assert.ok(SAFE.bottom >= 440 && SAFE.top >= 240, "safe zone must clear TikTok/Shorts chrome");
  assert.equal(p.platform, "master_9x16");
  // ONE master + a platform_handoff for both (§28)
  assert.ok(p.platform_handoff.tiktok && p.platform_handoff.youtube_shorts);
});

test("SC4C-3. per-family duration stays inside the target window (§3)", () => {
  for (const [fam, sem] of [["asking_vs_sold", SEM_ASK], ["deal_hero", SEM_DEAL], ["market_shape", SEM_MKT], ["printing_compare", SEM_PRINT]]) {
    const p = directVideo({ semanticManifest: sem, family: fam, captionHandoff: CH, cardImagePaths: fam === "printing_compare" ? ["/a.png", "/b.png"] : ["/x.png"] });
    const [lo, hi] = DURATION_WINDOWS[fam];
    assert.ok(p.duration >= lo && p.duration <= hi, `${fam} ${p.duration} not in [${lo},${hi}]`);
  }
});

test("SC4C-4. every scene uses an approved motion; no banned motion anywhere", () => {
  for (const p of [planAsk(), planDeal(), planMkt()]) {
    for (const s of p.scenes) {
      assert.ok(APPROVED_MOTION_KEYS.includes(s.animation), `${p.family}/${s.id}: ${s.animation}`);
      assert.equal(isBannedMotion(s.animation), false);
    }
  }
  for (const b of BANNED_MOTIONS) assert.equal(isBannedMotion(b), true);
});

test("SC4C-5. scene timing is valid + monotonic; >= 4 scenes; a real CTA in the last ~3s", () => {
  for (const p of [planAsk(), planDeal(), planMkt()]) {
    assert.ok(p.scenes.length >= 4);
    for (const s of p.scenes) assert.ok(s.end_ms > s.start_ms, `${s.id} end<=start`);
    const cta = p.scenes.find((s) => s.purpose === "cta");
    assert.ok(cta, "no cta scene");
    assert.ok(cta.start_ms >= p.duration - 3400 && cta.start_ms <= p.duration - 1400, `cta at ${cta.start_ms} of ${p.duration}`);
  }
});

test("SC4C-6. a slideshow-feeling cut is HELD (dead holds / one repeated motion)", () => {
  const p = planDeal();
  const bad = JSON.parse(JSON.stringify(p));
  for (const s of bad.scenes) { s.animation = "crop_detail_reveal"; s.end_ms = s.start_ms + 5000; }
  const r = auditPacing({ plan: bad });
  assert.equal(r.ok, false);
  assert.equal(r.verdict, "HOLD");
});

test("SC4C-7. a healthy plan passes pacing + motion-quality", () => {
  for (const p of [planAsk(), planDeal(), planMkt()]) {
    const pace = auditPacing({ plan: p });
    assert.equal(pace.ok, true, `${p.family} pacing: ${pace.findings.map((f) => f.detail).join("; ")}`);
    const mq = scoreMotionQuality({ plan: p, pacing: pace });
    assert.equal(mq.verdict, "PASS", `${p.family} motion quality ${mq.score}`);
    assert.equal(mq.owner_review_required, true);
  }
});

// ================= FACT / SEMANTIC SAFETY ==============
test("SC4C-8. video_fact_timeline covers every scene that shows a number", () => {
  const p = planDeal();
  const numScenes = p.scenes.filter((s) => /(\$\d|\d+\s?%|\d{1,3}(,\d{3})+)/.test((s.text?.lines ?? []).join(" ")));
  const covered = new Set(p.video_fact_timeline.map((r) => r.scene_id));
  for (const s of numScenes) assert.ok(covered.has(s.id), `scene ${s.id} not on the fact timeline`);
  for (const row of p.video_fact_timeline) {
    assert.ok(row.source_ref && row.source_ref.length, `row ${row.scene_id} has no source_ref`);
    assert.equal(row.verification, "PASS");
  }
});

test("SC4C-9. a wrong price on a frame -> VIDEO_FACT_FAIL", () => {
  const p = planAsk();
  const bad = JSON.parse(JSON.stringify(p));
  bad.scenes[2].text.lines[0] = "$12.99 listed";
  const r = auditVideo({ plan: bad, semanticManifest: SEM_ASK });
  assert.equal(r.ok, false);
  assert.equal(r.state, "VIDEO_FACT_FAIL");
});

test("SC4C-10. a wrong percentage on a frame -> VIDEO_FACT_FAIL", () => {
  const p = planAsk();
  const bad = JSON.parse(JSON.stringify(p));
  bad.scenes[3].text.lines[0] = "40% BELOW MARKET";
  bad.video_fact_timeline.push({ scene_id: bad.scenes[3].id, start_ms: 1, end_ms: 2, visible_claim: "40% BELOW MARKET", data_refs: [], verification: "PASS" });
  const r = auditVideo({ plan: bad, semanticManifest: SEM_ASK });
  assert.equal(r.ok, false);
  assert.equal(r.state, "VIDEO_FACT_FAIL");
});

test("SC4C-11. a wrong above/below direction -> VIDEO_SEMANTIC_FAIL", () => {
  const p = planAsk();
  const bad = JSON.parse(JSON.stringify(p));
  bad.scenes[4].text.lines[0] = "a clear premium over market";
  const r = auditVideo({ plan: bad, semanticManifest: SEM_ASK });
  assert.equal(r.ok, false);
  assert.equal(r.state, "VIDEO_SEMANTIC_FAIL");
  assert.equal(r.verification.direction, "FAIL");
});

test("SC4C-12. scope migration across scenes -> VIDEO_SEMANTIC_FAIL", () => {
  const p = planMkt();
  const bad = JSON.parse(JSON.stringify(p));
  bad.scenes[0].text.lines[0] = "85.7% of Clefairy singles";
  const r = auditVideo({ plan: bad, semanticManifest: SEM_MKT });
  assert.equal(r.ok, false);
  assert.equal(r.state, "VIDEO_SEMANTIC_FAIL");
  assert.equal(r.verification.scope, "FAIL");
});

test("SC4C-13. an invented chart value -> VIDEO_FACT_FAIL", () => {
  const p = planMkt();
  const bad = JSON.parse(JSON.stringify(p));
  bad.scenes[1].text.lines = ["$500+ = 22%"];
  bad.video_fact_timeline.push({ scene_id: bad.scenes[1].id, start_ms: 1, end_ms: 2, visible_claim: "$500+ = 22%", data_refs: [], verification: "PASS" });
  const r = auditVideo({ plan: bad, semanticManifest: SEM_MKT });
  assert.equal(r.ok, false);
  assert.equal(r.state, "VIDEO_FACT_FAIL");
});

test("SC4C-14. wrong card-to-stat association -> VIDEO_SEMANTIC_FAIL", () => {
  const p = planAsk();
  const bad = JSON.parse(JSON.stringify(p));
  const dealScene = bad.scenes.find((s) => s.stat_asset === "gap" || s.stat_asset === "direction");
  dealScene.card_asset = 3;
  const r = auditVideo({ plan: bad, semanticManifest: SEM_ASK });
  assert.equal(r.ok, false);
  assert.equal(r.state, "VIDEO_SEMANTIC_FAIL");
});

test("SC4C-15. printing_compare requires two distinct real cards", () => {
  const one = directVideo({ semanticManifest: SEM_PRINT, family: "printing_compare", captionHandoff: CH, cardImagePaths: ["/only.png"] });
  const r = auditVideo({ plan: one, semanticManifest: SEM_PRINT });
  assert.equal(r.ok, false);
  assert.equal(r.state, "VIDEO_SEMANTIC_FAIL");
  // runVideoDirector also surfaces it as a blocker
  const rd = runVideoDirector({ semanticManifest: SEM_PRINT, family: "printing_compare", captionHandoff: CH, cardImagePaths: ["/only.png"] });
  assert.ok(rd.blockers.some((b) => /TWO canonical/.test(b)));
});

test("SC4C-16. fake urgency anywhere -> VIDEO_SEMANTIC_FAIL", () => {
  const p = planDeal();
  const bad = JSON.parse(JSON.stringify(p));
  bad.scenes[3].text.lines[1] = "hurry, ending soon";
  const r = auditVideo({ plan: bad, semanticManifest: SEM_DEAL });
  assert.equal(r.ok, false);
  assert.equal(r.state, "VIDEO_SEMANTIC_FAIL");
});

test("SC4C-17. generated brand risk -> VIDEO_SEMANTIC_FAIL; the approved plan forbids a generated mark", () => {
  const p = planDeal();
  assert.equal(p.brand_plan.no_generated_mark, true);
  assert.equal(p.brand_plan.no_logo_intro, true);
  const bad = JSON.parse(JSON.stringify(p));
  bad.brand_plan.wordmark_text = "official pokemon poke ball logo";
  const r = auditVideo({ plan: bad, semanticManifest: SEM_DEAL });
  assert.equal(r.ok, false);
  assert.equal(r.state, "VIDEO_SEMANTIC_FAIL");
});

test("SC4C-18. wrong card metadata on a frame -> VIDEO_FACT_FAIL (grade the record doesn't have)", () => {
  const p = planDeal();
  const bad = JSON.parse(JSON.stringify(p));
  bad.scenes[1].text.lines = ["PSA 10 Magneton"];
  bad.video_fact_timeline.push({ scene_id: bad.scenes[1].id, start_ms: 1, end_ms: 2, visible_claim: "PSA 10 Magneton", data_refs: [], verification: "FAIL" });
  const r = auditVideo({ plan: bad, semanticManifest: SEM_DEAL });
  assert.equal(r.ok, false);
});

// ================= POSTER / DOC / HANDOFF ==============
test("SC4C-19. poster frame is a real scene with the validation checklist (§19)", () => {
  const p = planDeal();
  assert.ok(p.poster_frame.scene_id);
  assert.ok(p.scenes.some((s) => s.id === p.poster_frame.scene_id));
  for (const c of ["card_visible", "hook_readable", "brand_present", "no_clipped_text", "facts_correct"]) {
    assert.ok(p.poster_frame.checks.includes(c), `poster check ${c} missing`);
  }
});

test("SC4C-20. on-screen text beats are <= 2 lines (§16)", () => {
  for (const p of [planAsk(), planDeal(), planMkt()]) {
    for (const b of p.on_screen_text) assert.ok(b.lines.length <= 2, `${p.family} beat ${b.scene_id} has ${b.lines.length} lines`);
  }
});

test("SC4C-21. narration is verified-facts-only, no TTS vendor, persisted as a handoff (§15)", () => {
  const p = planAsk();
  assert.equal(p.narration.tts_vendor, null);
  assert.ok(Array.isArray(p.narration.narration_handoff.lines));
  const joined = p.narration.script.join(" ");
  assert.match(joined, /\$49\.98/);
  assert.match(joined, /\$199/);
  assert.doesNotMatch(joined, /invest|guaranteed|hurry|act fast|rare opportunity/i);
});

test("SC4C-22. the caption_handoff is linked, not regenerated (§29)", () => {
  const r = runVideoDirector({ semanticManifest: SEM_ASK, family: "asking_vs_sold", captionHandoff: CH, cardImagePaths: ["/x.png"] });
  assert.equal(r.plan.caption_link.semantic_hash, "cap123");
  assert.equal(r.plan.caption_link.image_artifact_id, "img1");
  // no caption text is generated inside the video plan
  assert.ok(!("caption_text" in r.plan));
  // missing link -> a surfaced blocker
  const noLink = runVideoDirector({ semanticManifest: SEM_ASK, family: "asking_vs_sold", captionHandoff: null, cardImagePaths: ["/x.png"] });
  assert.ok(noLink.blockers.some((b) => /VIDEO_CAPTION_LINK_MISSING/.test(b)));
});

test("SC4C-23. buildVideoDocument emits a self-contained 1080x1920 doc with a shared paused timeline", () => {
  const p = planDeal();
  const { html, total } = buildVideoDocument(p);
  assert.equal(total, p.duration);
  assert.match(html, /width:1080px;height:1920px/);
  assert.match(html, /animation-play-state:paused/);
  assert.match(html, /@keyframes layer0/);
  assert.doesNotMatch(html, /https?:\/\//); // no network subresource
  assert.doesNotMatch(html, /<video|<audio|<iframe/);
});

test("SC4C-24. all 4C failure states declared; NO publishing / cron / RIGHTS / Stage-1 / email / eBay-Browse / upload", () => {
  for (const s of ["VIDEO_SEMANTIC_FAIL", "VIDEO_FACT_FAIL", "VIDEO_CARD_FIDELITY_FAIL", "VIDEO_SAFE_ZONE_FAIL", "VIDEO_PACING_HOLD", "VIDEO_MOTION_QUALITY_HOLD", "VIDEO_RENDER_FAILED", "VIDEO_CAPTION_LINK_MISSING"]) {
    assert.ok(FAILURE_STATES.includes(s), `missing ${s}`);
  }
  for (const f of VIDEO_FILES) {
    const src = code(f);
    assert.doesNotMatch(src, /tiktok\.com\/.*upload|youtube.*upload|googleapis.*youtube|uploadVideo|publishVideo/i, `${f} upload`);
    assert.doesNotMatch(src, /createPost|scheduleOne|bufferBacklog|BUFFER_ACCESS_TOKEN/i, `${f} Buffer`);
    assert.doesNotMatch(src, /CronCreate|vercel\.json|REFILL_SCHEDULE/i, `${f} cron`);
    assert.doesNotMatch(src, /RIGHTS_STATE|SOCIAL_.*_ENABLED|Stage\s*1/i, `${f} RIGHTS/Stage1`);
    assert.doesNotMatch(src, /resend|sendEmail|newsletter_subscribers/i, `${f} email`);
    assert.doesNotMatch(src, /getBrowse|browseApi|api\.ebay\.com/i, `${f} eBay Browse`);
  }
  assert.match(read("lib/newsroom/hybrid/imageMode.mjs"), /return "SAFE_FALLBACK"/);
  assert.equal(VIDEO_DIRECTOR_VERSION, "4c.1");
});

test("SC4C-25. the render engine is local-compute only (Chrome + ffmpeg), no OpenAI, no network at render", () => {
  const raw = read("lib/newsroom/video/videoRenderer.mjs");
  assert.doesNotMatch(code("lib/newsroom/video/videoRenderer.mjs"), /openai\.com|api\.anthropic/i);
  assert.doesNotMatch(raw, /fetch\(\s*["'`]https/i);
  assert.match(raw, /ffmpeg-static|FFMPEG/);
  assert.match(raw, /libx264/);
  assert.match(raw, /plan\.height|1920/);
  // the animated document embeds card art as data: URIs - no http subresource
  assert.match(read("lib/newsroom/video/videoDocument.mjs"), /data:\$\{mime\}|data:image/);
});
