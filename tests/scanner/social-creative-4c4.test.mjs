// Phase SOCIAL-CREATIVE-4C.4 - PROFESSIONAL 8-10s SOCIAL VIDEO + UNIVERSAL CTA.
//
// PROFESSIONAL_SOCIAL_LOOP: approved static master -> VIDEO-SAFE DERIVATIVE
// (simplified for vertical, nothing clipped) -> 8-10s choreography with
// 2-3 perceivable focal events -> UNIVERSAL CTA END SCREEN (real canonical
// card fan + pokemondealfinder.com). Pure-logic + a file cache. No real
// OpenAI, no render in the tests.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";

import { FAILURE_STATES, REVISABLE_STATES, TERMINAL_WITHHOLD_STATES } from "../../lib/newsroom/editorial/failureStates.mjs";
import {
  PROFESSIONAL_SOCIAL_LOOP, PROFESSIONAL_SOCIAL_LOOP_VERSION, DEPRECATED_VIDEO_MODES, FAMILY_DURATION_MS,
  buildVideoSafeDerivative, VS_SAFE, VS_MIN_FONT, centreSafe,
  buildUniversalCtaEndScreen, selectCtaCards, CTA_DOMAIN, CTA_VALUE_POINTS, CTA_VARIANTS, CTA_UNIVERSAL_FALLBACK,
  CTA_END_SCREEN_MIN_MS, CTA_END_SCREEN_MAX_MS, EVERGREEN_CTA_CARDS,
  buildProfessionalTimeline, runProfessionalSocialLoop,
  runProfessionalVideoQa, auditContentComprehension, auditCutoffAndSafeZones, auditMobileReadability,
  auditMotion, auditRealCards, auditVideoCta, scoreProfessionalTrust, unsanctionedShownPercents,
  buildProfessionalLoopDocument, MOTION_SALIENCE,
  registerExistingMaster, getMasterCreative,
} from "../../lib/newsroom/video/index.mjs";
import { videoSemanticHash } from "../../lib/newsroom/video/videoDirector.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..");
const read = (p) => readFileSync(join(REPO, p), "utf8");
const code = (p) => read(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1").replace(/`(?:\\[\s\S]|[^`\\])*`/g, "``").replace(/"(?:\\.|[^"\\])*"/g, '""').replace(/'(?:\\.|[^'\\])*'/g, "''");
const NR_VIDEO = readdirSync(join(REPO, "lib/newsroom/video")).map((f) => `lib/newsroom/video/${f}`);

const CARD_CACHE = join(REPO, ".social-preview", "card-art-cache");
const HAVE_CARDS = (() => { try { return readdirSync(CARD_CACHE).filter((f) => /^\d+\.jpg$/.test(f)).length >= 3; } catch { return false; } })();
const CARD = (id) => join(CARD_CACHE, `${id}.jpg`);

const PNG_1x1 = Buffer.from("89504e470d0a1a0a0000000d49484452000000010000000108020000009077533d0000000c4944415478da6364f8cf00000201010027187a870000000049454e44ae426082", "hex");
function tmpCache() { const d = join(tmpdir(), `4c4-${Date.now()}-${Math.random().toString(36).slice(2)}`); mkdirSync(d, { recursive: true }); return d; }
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
  required_numeric_facts: { under_25_pct: 85.7, tracked_count: 24545 },
  visualization_data_manifest: { allowed_points: [{ label: "under $25", value: 85.7 }, { label: "$25-100", value: 9.1 }, { label: "$100+", value: 5.2 }] },
});
const CH = { story_id: "S", semantic_hash: "cap-S", image_artifact_id: "img-S" };

function build(family, sem, { cards = [CARD("113669")], over = {} } = {}) {
  const d = buildVideoSafeDerivative({ family, semanticManifest: sem, factLock: { card_name: "Clefairy", card_set: "Base Set" }, cardAssets: cards, ...over });
  const es = buildUniversalCtaEndScreen({ family, heroCardId: "113669", heroCardName: "Clefairy", cacheDir: CARD_CACHE });
  const tl = buildProfessionalTimeline({ family, derivative: d });
  return { d, es, tl };
}
const RUN = (dir, sem, family, over = {}) => runProfessionalSocialLoop({
  story: { story_id: "S" }, semanticManifest: sem, factLock: { card_name: "Clefairy", card_set: "Base Set" },
  captionHandoff: CH, family, cardImagePaths: [CARD("113669")], heroCardId: "113669", heroCardName: "Clefairy",
  cacheDir: dir, ctaCacheDir: CARD_CACHE, ...over,
});

// ===================== MODE / DEPRECATION =====================
test("SC4C4-1. PROFESSIONAL_SOCIAL_LOOP is the mode; 4C/4C.1/4C.2/4C.3 are deprecated", () => {
  assert.equal(PROFESSIONAL_SOCIAL_LOOP, "PROFESSIONAL_SOCIAL_LOOP");
  assert.ok(PROFESSIONAL_SOCIAL_LOOP_VERSION.startsWith("4c")); // 4c4 -> 4c5 (premium polish)
  const j = DEPRECATED_VIDEO_MODES.join(",");
  assert.match(j, /SPARSE_4C/);
  assert.match(j, /MULTI_BOARD_4C1/);
  assert.match(j, /MASTER_LAYERED_MOTION_LONG_4C2/);
  assert.match(j, /PREMIUM_5S_LOOP_4C3/);
});

// ===================== DURATION (§2) =====================
test("SC4C4-2. family durations are 8.5-10.5s (4C.5 adds a 2.6s CTA hold); weak content is not padded", () => {
  assert.ok(FAMILY_DURATION_MS.deal_hero >= 8000 && FAMILY_DURATION_MS.deal_hero <= 9000);
  assert.ok(FAMILY_DURATION_MS.asking_vs_sold >= 8500 && FAMILY_DURATION_MS.asking_vs_sold <= 9500);
  assert.ok(FAMILY_DURATION_MS.market_shape >= 9000 && FAMILY_DURATION_MS.market_shape <= 10000);
  assert.ok(FAMILY_DURATION_MS.three_up >= 9000 && FAMILY_DURATION_MS.three_up <= 10000);
  assert.ok(FAMILY_DURATION_MS.printing_compare <= 12000);
  for (const f of Object.keys(FAMILY_DURATION_MS)) {
    const tl = buildProfessionalTimeline({ family: f, derivative: build(f === "market_shape" ? "market_shape" : "asking_vs_sold", f === "market_shape" ? SEM_MKT : SEM_ASK).d, durationMs: FAMILY_DURATION_MS[f] });
    // total = story content + transition + CTA hold
    assert.equal(tl.story_ms + (tl.transition_ms ?? 0) + tl.cta_ms, tl.duration_ms);
  }
});

// ===================== CONTENT COMPREHENSION (§4) =====================
test("SC4C4-3. the story is understandable from the first frame (hook + card + figure)", () => {
  const { d, tl } = build("asking_vs_sold", SEM_ASK);
  const c = auditContentComprehension({ derivative: d, timeline: tl });
  assert.ok(c.ok, JSON.stringify(c));
  assert.ok(d.comprehension_line && d.comprehension_line.length > 8);
});
test("SC4C4-4. a derivative with no hook / no subject -> CONTENT_PURPOSE_UNCLEAR_FAIL", () => {
  const bare = { width: 1080, height: 1920, centre_safe: centreSafe(VS_SAFE), blocks: [{ id: "domain", role: "domain", priority: 3, zone: { x: 100, y: 900, w: 880, h: 74 }, font: 32, fully_inside_safe: true }], comprehension_line: "" };
  const c = auditContentComprehension({ derivative: bare, timeline: { events: [] } });
  assert.equal(c.ok, false);
  assert.equal(c.state, "CONTENT_PURPOSE_UNCLEAR_FAIL");
});

// ===================== VIDEO-SAFE DERIVATIVE (§7-§9) =====================
test("SC4C4-5. the derivative is a simplified re-composition - it drops master-only chrome", () => {
  const { d } = build("market_shape", SEM_MKT);
  assert.ok(d.dropped_from_master.join(" ").match(/methodology|footer|metadata/i));
  assert.ok(d.blocks.length <= 8);
  assert.ok(d.version.startsWith("4c"));
});
test("SC4C4-6. the real card is present and every block is P1/P2/P3 from frozen data", () => {
  const { d } = build("asking_vs_sold", SEM_ASK);
  assert.ok(d.blocks.some((b) => ["card", "hero_row"].includes(b.role) && (b.cardIds ?? []).length));
  assert.ok(d.priority1_ids.includes("hook"));
  for (const b of d.blocks) assert.ok([1, 2, 3].includes(b.priority));
});

// ===================== CUTOFF / SAFE ZONE (§10-§12) =====================
test("SC4C4-7. every kept block lies fully inside the 1080x1920 frame and the centre-safe region", () => {
  const cs = centreSafe(VS_SAFE);
  for (const [family, sem] of [["asking_vs_sold", SEM_ASK], ["market_shape", SEM_MKT]]) {
    const { d, es } = build(family, sem);
    assert.equal(d.fits, true, `${family} did not fit`);
    for (const b of d.blocks) {
      assert.ok(b.zone.x >= cs.x - 0.5 && b.zone.x + b.zone.w <= cs.right + 0.5, `${family}/${b.id} x`);
      assert.ok(b.zone.y >= cs.y - 0.5 && b.zone.y + b.zone.h <= cs.bottom + 0.5, `${family}/${b.id} y`);
      assert.equal(b.partial, false);
    }
    assert.ok(auditCutoffAndSafeZones({ derivative: d, endScreen: es }).ok);
  }
});
test("SC4C4-8. a block pushed past the safe edge -> a specific cutoff failure, never a half-shown panel", () => {
  const d = { width: 1080, height: 1920, centre_safe: centreSafe(VS_SAFE), fits: true, overflow: [], blocks: [
    { id: "hero_card", role: "card", priority: 1, zone: { x: 100, y: 1500, w: 880, h: 700 }, fully_inside_safe: false, partial: false },
  ] };
  const r = auditCutoffAndSafeZones({ derivative: d, endScreen: {} });
  assert.equal(r.ok, false);
  assert.ok(["CARD_CROP_FAIL", "TEXT_CUTOFF_FAIL", "SAFE_ZONE_VIOLATION_FAIL"].includes(r.state));
});
test("SC4C4-9. a partial panel is a hard fail (§11)", () => {
  const d = { width: 1080, height: 1920, centre_safe: centreSafe(VS_SAFE), fits: true, overflow: [], blocks: [
    { id: "why", role: "context", priority: 1, zone: { x: 100, y: 300, w: 880, h: 100 }, fully_inside_safe: true, partial: true },
  ] };
  const r = auditCutoffAndSafeZones({ derivative: d, endScreen: {} });
  assert.equal(r.state, "PARTIAL_PANEL_FAIL");
});
test("SC4C4-10. VS_SAFE keeps content off the platform chrome (top/right/bottom insets)", () => {
  assert.ok(VS_SAFE.top >= 180 && VS_SAFE.bottom >= 340 && VS_SAFE.right >= 90 && VS_SAFE.left >= 90);
});

// ===================== MOBILE READABILITY (§13) =====================
test("SC4C4-11. no on-screen text below the per-role minimum size", () => {
  const { d } = build("asking_vs_sold", SEM_ASK);
  assert.ok(auditMobileReadability({ derivative: d }).ok);
  for (const b of d.blocks) if (b.font != null) assert.ok(b.font >= (VS_MIN_FONT[b.role] ?? 30), `${b.id} ${b.font}`);
});
test("SC4C4-12. tiny text -> MOBILE_TEXT_TOO_SMALL_FAIL", () => {
  const d = { blocks: [{ id: "context", role: "context", font: 18, text: "x" }] };
  assert.equal(auditMobileReadability({ derivative: d }).state, "MOBILE_TEXT_TOO_SMALL_FAIL");
});
test("SC4C4-13. paragraph copy in the video is rejected - it belongs in the caption", () => {
  const d = { blocks: [{ id: "context", role: "context", font: 40, text: "x".repeat(140) }] };
  assert.equal(auditMobileReadability({ derivative: d }).ok, false);
});

// ===================== MOTION (§15-§18) =====================
test("SC4C4-14. no whole-image push; the composition is stable and focal content animates", () => {
  const { tl } = build("asking_vs_sold", SEM_ASK);
  assert.equal(tl.whole_image_push, false);
  assert.equal(tl.camera.frames_whole_creative, true);
  assert.ok(!tl.events.some((e) => e.kind === "whole_image_push" || (e.kind === "push" && ["full", "whole"].includes(e.target))));
});
test("SC4C4-15. a whole-image push is flagged MOTION_TOO_SUBTLE_FAIL", () => {
  const r = auditMotion({ timeline: { camera: { frames_whole_creative: true }, events: [{ id: "p", kind: "whole_image_push", target: "full", at_ms: 0, end_ms: 8000 }] } });
  assert.equal(r.state, "MOTION_TOO_SUBTLE_FAIL");
});
test("SC4C4-16. a pan / region-framing move is CAMERA_TOUR_FAIL", () => {
  const r = auditMotion({ timeline: { events: [{ id: "pan", kind: "pan", target: "hero_card", at_ms: 0, end_ms: 3000 }] } });
  assert.equal(r.state, "CAMERA_TOUR_FAIL");
});
test("SC4C4-17. 2-3 clearly perceivable focal events pass; zero perceivable -> MOTION_TOO_SUBTLE_FAIL", () => {
  const { tl } = build("asking_vs_sold", SEM_ASK);
  const good = auditMotion({ timeline: tl });
  assert.ok(good.ok, JSON.stringify(good));
  assert.ok(good.perceivable >= MOTION_SALIENCE.min_perceivable_events);
  const flat = auditMotion({ timeline: { events: [{ id: "a", kind: "settle", scale_from: 1, scale_to: 1.001, at_ms: 0, end_ms: 8000 }] } });
  assert.equal(flat.state, "MOTION_TOO_SUBTLE_FAIL");
});
test("SC4C4-18. oversized / gimmicky motion -> MOTION_TOO_AGGRESSIVE_FAIL", () => {
  const big = auditMotion({ timeline: { events: [{ id: "z", kind: "stat_pulse", scale_from: 1, scale_to: 1.3, at_ms: 0, end_ms: 2000 }] } });
  assert.equal(big.state, "MOTION_TOO_AGGRESSIVE_FAIL");
  const spin = auditMotion({ timeline: { events: [{ id: "s", kind: "spin", at_ms: 0, end_ms: 2000 }, { id: "b", kind: "illuminate", opacity_from: 0, opacity_to: 1, at_ms: 0, end_ms: 2000 }] } });
  assert.equal(spin.state, "MOTION_TOO_AGGRESSIVE_FAIL");
});
test("SC4C4-19. max 3 primary story-motion events before the CTA (§18)", () => {
  const { tl } = build("market_shape", SEM_MKT);
  const story = tl.events.filter((e) => !["cta_transition", "cross_dissolve", "settle", "hold"].includes(e.kind));
  assert.ok(story.length <= 3, `got ${story.length}`);
});

// ===================== REAL CARDS ONLY (§19) =====================
test("SC4C4-20. an AI / non-canonical card asset -> AI_GENERATED_CARD_FAIL", () => {
  const bad = auditRealCards({ derivative: { blocks: [] }, endScreen: { cards: [{ id: "x", path: "/tmp/ai_generated_card.png", ai_generated: true }] }, cardAssets: [] });
  assert.equal(bad.state, "AI_GENERATED_CARD_FAIL");
  const bad2 = auditRealCards({ derivative: { blocks: [] }, endScreen: { cards: [] }, cardAssets: ["/some/where/fake-charizard.webp"] });
  assert.equal(bad2.ok, false);
});
test("SC4C4-21. canonical card-art-cache / TCGplayer-CDN paths pass the real-card audit", () => {
  const ok = auditRealCards({ derivative: { blocks: [] }, endScreen: { cards: [{ id: "113669", path: CARD("113669"), canonical: true }] }, cardAssets: [CARD("113669"), "https://tcgplayer-cdn.tcgplayer.com/product/113669_in_1000x1000.jpg"] });
  assert.ok(ok.ok, JSON.stringify(ok));
});

// ===================== UNIVERSAL CTA END SCREEN (§26-§37) =====================
test("SC4C4-22. the end screen carries the magnifier brand mark, 3 real cards, value points, domain, footer", { skip: !HAVE_CARDS }, () => {
  const es = buildUniversalCtaEndScreen({ family: "deal_hero", heroCardId: "113669", cacheDir: CARD_CACHE });
  assert.ok(es.ok, JSON.stringify(es));
  const s = es.end_screen;
  assert.equal(s.brand.mark, "magnifier");
  assert.equal(s.brand.ai_invented, false);
  assert.equal(s.cards.length, 3);
  assert.ok(s.value_points.length >= 3);
  assert.equal(s.domain, "pokemondealfinder.com");
  assert.ok(s.footer && s.footer.length);
  assert.ok(s.duration_ms >= CTA_END_SCREEN_MIN_MS && s.duration_ms <= CTA_END_SCREEN_MAX_MS);
});
test("SC4C4-23. end screen is a real hold (4C.5 raised it to ~2.6s) and clamps to its min/max", { skip: !HAVE_CARDS }, () => {
  const d = buildUniversalCtaEndScreen({ family: "deal_hero", heroCardId: "113669", cacheDir: CARD_CACHE }).end_screen.duration_ms;
  assert.ok(d >= CTA_END_SCREEN_MIN_MS && d <= CTA_END_SCREEN_MAX_MS);
  assert.equal(buildUniversalCtaEndScreen({ family: "deal_hero", heroCardId: "113669", cacheDir: CARD_CACHE, durationMs: 90000 }).end_screen.duration_ms, CTA_END_SCREEN_MAX_MS);
  assert.equal(buildUniversalCtaEndScreen({ family: "deal_hero", heroCardId: "113669", cacheDir: CARD_CACHE, durationMs: 200 }).end_screen.duration_ms, CTA_END_SCREEN_MIN_MS);
});
test("SC4C4-24. CTA wording adapts by family with a universal fallback; visual design is constant", () => {
  assert.deepEqual(CTA_UNIVERSAL_FALLBACK, { line1: "FIND MORE LIVE", line2: "POKEMON CARD DEALS" });
  for (const f of ["deal_hero", "asking_vs_sold", "market_shape", "three_up"]) assert.ok(CTA_VARIANTS[f].line1);
  assert.ok(CTA_VALUE_POINTS.every((v) => !/always save|guaranteed|profit/i.test(v)));
});
test("SC4C4-25. fewer than 3 distinct canonical cards -> refuse (no redraw / no duplicate) (§34)", () => {
  const es = buildUniversalCtaEndScreen({ family: "deal_hero", heroCardId: "999999999", cacheDir: tmpCache() });
  assert.equal(es.ok, false);
  assert.equal(es.state, "AI_GENERATED_CARD_FAIL");
});
test("SC4C4-26. selectCtaCards dedupes and keeps the story hero first", { skip: !HAVE_CARDS }, () => {
  const sel = selectCtaCards({ heroCardId: "113669", cacheDir: CARD_CACHE });
  const ids = sel.cards.map((c) => c.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(ids[0], "113669");
  assert.equal(sel.cards[0].decorative, false);
});

// ===================== WEBSITE-FIRST CTA (§38-§39) =====================
test("SC4C4-27. an eBay-first CTA -> VIDEO_EBAY_FIRST_CTA_FAIL", () => {
  const r = auditVideoCta({ endScreen: { end_screen: { primary_cta: { line1: "VIEW ON EBAY" }, domain: "pokemondealfinder.com", value_points: ["a", "b"], brand: { mark: "magnifier" } } }, derivative: { blocks: [] } });
  assert.equal(r.state, "VIDEO_EBAY_FIRST_CTA_FAIL");
});
test("SC4C4-28. a domain that is not pokemondealfinder.com or a purposeless screen -> CTA_PURPOSE_UNCLEAR_FAIL", () => {
  assert.equal(auditVideoCta({ endScreen: { end_screen: { primary_cta: { line1: "GO" }, domain: "example.com", value_points: ["a", "b"], brand: { mark: "magnifier" } } }, derivative: { blocks: [] } }).state, "CTA_PURPOSE_UNCLEAR_FAIL");
  assert.equal(auditVideoCta({ endScreen: { end_screen: { primary_cta: { line1: "GO" }, domain: "pokemondealfinder.com", value_points: [], brand: {} } }, derivative: { blocks: [] } }).state, "CTA_PURPOSE_UNCLEAR_FAIL");
});
test("SC4C4-29. the pipeline CTA is website-first: pokemondealfinder.com, never a marketplace link", () => {
  const { es } = build("asking_vs_sold", SEM_ASK);
  assert.equal(es.end_screen.domain, CTA_DOMAIN);
  assert.ok(!JSON.stringify(es.end_screen).match(/ebay/i));
});

// ===================== PROFESSIONAL TRUST (§40-§41) =====================
test("SC4C4-30. a clean derivative + restrained motion scores PASS; clipped / AI / hype loses points", () => {
  const { d, tl, es } = build("asking_vs_sold", SEM_ASK);
  assert.equal(scoreProfessionalTrust({ derivative: d, timeline: tl, endScreen: es, subVerdicts: { cutoff: true, readability: true, motion_subtle: true, motion_aggressive: true, camera_tour: true, real_cards: true, comprehension: true, cta: true } }).verdict, "PASS");
  const bad = scoreProfessionalTrust({ derivative: d, timeline: tl, endScreen: es, subVerdicts: { cutoff: false, real_cards: false } });
  assert.equal(bad.verdict, "HOLD");
  assert.ok(bad.owner_review_required);
});
test("SC4C4-31. hype / investment language anywhere on the video is penalised (§43)", () => {
  const d = { width: 1080, height: 1920, fits: true, blocks: [{ id: "h", role: "hook", text: "INSANE DEAL - dont miss out" }] };
  const s = scoreProfessionalTrust({ derivative: d, timeline: { events: [{ kind: "illuminate" }] }, endScreen: { end_screen: {} }, subVerdicts: {} });
  assert.ok(s.score < 100 && s.reasons.join(" ").match(/hype|investment/i));
});

// ===================== ORCHESTRATOR (end to end, no render) =====================
test("SC4C4-32. runProfessionalSocialLoop: approved master -> READY_FOR_MANUAL_REVIEW, $0, reused caption", { skip: !HAVE_CARDS }, () => {
  const dir = tmpCache();
  const hash = videoSemanticHash(SEM_ASK);
  seedMaster(dir, "S", hash, "asking_vs_sold");
  const r = RUN(dir, SEM_ASK, "asking_vs_sold");
  assert.ok(r.ok, JSON.stringify(r).slice(0, 300));
  assert.equal(r.state, "READY_FOR_MANUAL_REVIEW");
  assert.equal(r.mode, "PROFESSIONAL_SOCIAL_LOOP");
  assert.equal(r.cost.master_generation_cost, 0);
  assert.equal(r.cost.cta_generation_cost, 0);
  assert.equal(r.cost.video_incremental_api_cost, 0);
  assert.equal(r.caption_link.reused, true);
  assert.ok(r.duration_ms >= 8000 && r.duration_ms <= 10000);
});
test("SC4C4-33. no approved master cached -> MASTER_CREATIVE_UNAVAILABLE (never generates one)", () => {
  const r = RUN(tmpCache(), SEM_ASK, "asking_vs_sold");
  assert.equal(r.ok, false);
  assert.equal(r.state, "MASTER_CREATIVE_UNAVAILABLE");
});
test("SC4C4-34. a master flagged with rounding drift -> VIDEO_DERIVED_VALUE_EXACT_FAIL (an old 45%-for-44% master is withheld)", () => {
  const dir = tmpCache();
  const hash = videoSemanticHash(SEM_ASK);
  seedMaster(dir, "S", hash, "asking_vs_sold", { verification: { approved: true, derived_values: "DRIFT", state: "BUFFER_READY" } });
  const r = RUN(dir, SEM_ASK, "asking_vs_sold");
  assert.equal(r.ok, false);
  assert.equal(r.state, "VIDEO_DERIVED_VALUE_EXACT_FAIL");
});
test("SC4C4-35. dedupe_key = master sha + mode version (§25)", { skip: !HAVE_CARDS }, () => {
  const dir = tmpCache();
  const hash = videoSemanticHash(SEM_MKT);
  seedMaster(dir, "S", hash, "market_shape");
  const r = RUN(dir, SEM_MKT, "market_shape");
  assert.ok(r.dedupe_key.endsWith(`::${PROFESSIONAL_SOCIAL_LOOP_VERSION}`));
});
test("SC4C4-36. exact-fact lock: unsanctioned percentages are what gets scrutinised, not sanctioned chart values", () => {
  const { d } = build("market_shape", SEM_MKT);
  assert.deepEqual(unsanctionedShownPercents(d, SEM_MKT), []);
  const drifted = { shown_numbers: ["44%", "80%"] };
  assert.deepEqual(unsanctionedShownPercents(drifted, { claim_value: 85.7 }).sort(), ["44%", "80%"]);
});

// ===================== DOCUMENT (§7 - no master slice, no network) =====================
test("SC4C4-37. the document is ONE deterministic composition + a CTA layer, real card <img>, no network", { skip: !HAVE_CARDS }, () => {
  const { d, es, tl } = build("asking_vs_sold", SEM_ASK);
  const doc = buildProfessionalLoopDocument({ derivative: d, endScreen: es, timeline: tl, cardImages: { [CARD("113669")]: "AAAA" }, endCardImages: { "113669": "AAAA" } });
  assert.ok(doc.html.includes('class="story"') && doc.html.includes('class="end"'));
  assert.ok(!/https?:\/\//.test(doc.html.replace(/pokemondealfinder\.com/g, "")));
  assert.ok((doc.html.includes("@keyframes storyout") || doc.html.includes("@keyframes storydim")) && doc.html.includes("@keyframes endin"));
  assert.ok(!/background-position|background-image:url\('data:.*master/i.test(doc.html)); // no re-drawn master slice
});
test("SC4C4-38. the story->CTA transition is a controlled cross-dissolve/darken, never a fade to black", () => {
  const { tl } = build("asking_vs_sold", SEM_ASK);
  const t = tl.events.find((e) => e.id === "cta_transition");
  assert.ok(["cross_dissolve", "cta_transition"].includes(t.kind));
  assert.notEqual(t.to_black, true);
  assert.ok(!tl.events.some((e) => /fade.?to.?black/i.test(e.kind)));
});

// ===================== FAILURE-STATE REGISTRY / SAFETY =====================
test("SC4C4-39. every 4C.4 failure state is declared and correctly classified", () => {
  const hard = ["TEXT_CUTOFF_FAIL", "CARD_CROP_FAIL", "CTA_CUTOFF_FAIL", "PARTIAL_PANEL_FAIL", "FOOTER_TRUNCATION_FAIL", "SAFE_ZONE_VIOLATION_FAIL", "MOBILE_TEXT_TOO_SMALL_FAIL", "AI_GENERATED_CARD_FAIL", "VIDEO_EBAY_FIRST_CTA_FAIL"];
  const soft = ["CONTENT_PURPOSE_UNCLEAR_FAIL", "MOTION_TOO_SUBTLE_FAIL", "MOTION_TOO_AGGRESSIVE_FAIL", "CTA_PURPOSE_UNCLEAR_FAIL", "PROFESSIONAL_BRAND_FAIL"];
  for (const s of [...hard, ...soft]) assert.ok(FAILURE_STATES.includes(s), `${s} not declared`);
  for (const s of hard) assert.ok(TERMINAL_WITHHOLD_STATES.includes(s), `${s} should be terminal`);
  for (const s of soft) assert.ok(REVISABLE_STATES.includes(s), `${s} should be revisable`);
});
test("SC4C4-40. no publishing / Buffer / upload / cron / Stage1 / RIGHTS / email / eBay-Browse path in any 4C.4 module", () => {
  const files = ["videoSafeDerivative", "universalCtaEndScreen", "professionalVideoQa", "professionalLoopDocument", "professionalSocialLoop"].map((n) => `lib/newsroom/video/${n}.mjs`);
  for (const f of files) {
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
test("SC4C4-41. GenAI is confined to lib/newsroom/ and the CTA brand-asset generator is GATED + owner-review", () => {
  const src = read("lib/newsroom/video/universalCtaEndScreen.mjs");
  assert.match(src, /SOCIAL_CTA_BRAND_ASSET_GENERATE/);
  assert.match(src, /owner_review_required/);
  assert.match(src, /max\s*=\s*2|Math\.min\(2/);
  // it never invents card art / domain / cta text / brand identity
  assert.match(src, /never AI-invented|ai_invented: false|Real card art/i);
});

// ===================== OWNER REGRESSIONS (§48) =====================
test("SC4C4-42. owner regression: old ASKING CARD DETAILS cutoff would now FAIL", () => {
  const d = { width: 1080, height: 1920, centre_safe: centreSafe(VS_SAFE), fits: false, overflow: [{ id: "card_details", zone: { x: 100, y: 1600, w: 880, h: 400 } }],
    blocks: [{ id: "card_details", role: "context", priority: 1, zone: { x: 100, y: 1600, w: 880, h: 400 }, fully_inside_safe: false, partial: true }] };
  const r = auditCutoffAndSafeZones({ derivative: d, endScreen: {} });
  assert.equal(r.ok, false);
});
test("SC4C4-43. owner regression: the 4C.3 near-static loop would now be MOTION_TOO_SUBTLE_FAIL", () => {
  const loopish = { camera: { frames_whole_creative: true }, events: [{ id: "push", kind: "push", target: "full", at_ms: 300, end_ms: 5000, push_pct: 2 }] };
  assert.equal(auditMotion({ timeline: loopish }).state, "MOTION_TOO_SUBTLE_FAIL");
});
test("SC4C4-44. owner regression: a 4C.2 whole-poster camera tour would now be CAMERA_TOUR_FAIL", () => {
  const tour = { camera: { frames_whole_creative: false }, events: [{ id: "c", kind: "camera", target: "chart", at_ms: 0, end_ms: 4000, translate_pct: 8 }] };
  assert.equal(auditMotion({ timeline: tour }).state, "CAMERA_TOUR_FAIL");
});

// ===================== TIMELINE STRUCTURE / HOOK-STORY-PROOF-CTA =====================
test("SC4C4-45. the timeline follows HOOK -> STORY/VALUE -> PROOF -> CTA and every second communicates", () => {
  const { tl } = build("asking_vs_sold", SEM_ASK);
  const ids = tl.events.map((e) => e.id);
  // 4C.6: a card lift, a downward-drawing comparison spine, a % impact
  assert.ok(ids.some((i) => /lift|card_sweep/.test(i)) && ids.some((i) => /spine|ladder|illuminate/.test(i)) && ids.some((i) => /impact|pulse/.test(i)));
  assert.equal(tl.events[tl.events.length - 1].id, "cta_transition");
  // no dead gap > 1.6s between story events before the CTA
  const story = tl.events.filter((e) => e.kind !== "cta_transition").sort((a, b) => a.at_ms - b.at_ms);
  for (let i = 1; i < story.length; i++) assert.ok(story[i].at_ms - story[i - 1].end_ms <= 1600, `gap before ${story[i].id}`);
});
