// Phase SOCIAL-CREATIVE-4C.5 - PREMIUM TRUST-FIRST POLISH + 2.5-3.0s CTA.
//
// Same architecture as 4C.4 (PROFESSIONAL_SOCIAL_LOOP, approved master
// reuse, VIDEO_SAFE_DERIVATIVE, canonical cards, exact-fact lock,
// website-first CTA, universal end screen, $0). This phase fixes the
// owner-review problems: CTA that flashes, dead black space, a too-plain
// derivative, functional-not-premium typography, mechanical motion, a flat
// CTA. Pure-logic + file cache. No real OpenAI, no render in the tests.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";

import { FAILURE_STATES, REVISABLE_STATES } from "../../lib/newsroom/editorial/failureStates.mjs";
import {
  PROFESSIONAL_SOCIAL_LOOP_VERSION, FAMILY_STORY_MS, CTA_HOLD_MS, STORY_CTA_TRANSITION_MS, familyDurationMs, FAMILY_DURATION_MS,
  buildVideoSafeDerivative, VS_SAFE, CARD_SCALE, VIDEO_SAFE_DERIVATIVE_VERSION,
  buildUniversalCtaEndScreen, CTA_END_SCREEN_DEFAULT_MS, CTA_END_SCREEN_MIN_MS, CTA_END_SCREEN_MAX_MS, CTA_VALUE_POINTS, CTA_VALUE_POINT_ICONS,
  buildProfessionalTimeline, runProfessionalSocialLoop,
  runProfessionalVideoQa, auditCtaHold, auditCtaReadability, auditDeadBlackSpace, auditFrameDensity, auditMobilePreview, auditReplayTransition, auditMotion,
  CTA_HOLD, FRAME_DENSITY,
  buildAtmosphere, hasAtmosphere, PREMIUM_VIDEO_ATMOSPHERE_VERSION,
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
function tmpCache() { const d = join(tmpdir(), `4c5-${Date.now()}-${Math.random().toString(36).slice(2)}`); mkdirSync(d, { recursive: true }); return d; }
function seedMaster(dir, storyId, hash, family, over = {}) {
  const p = join(dir, "_src.png"); writeFileSync(p, PNG_1x1);
  return registerExistingMaster({ storyId, semanticHash: hash, family, imagePath: p, dir, brandInMaster: true, verification: { approved: true, derived_values: "EXACT", state: "BUFFER_READY" }, ...over });
}

const SEM_ASK = Object.freeze({
  layout: "asking_vs_sold", classification: "EDITORIAL",
  comparison_left: { label: "asking price", value: 49.98, text: "$49.98" },
  comparison_right: { label: "market reference", value: 199, text: "$199" },
  comparison_direction: "BELOW_MARKET", comparison_pct: -75,
  appropriate_lesson: "compare before you judge",
  card_identity: { name: "Clefairy", set: "Base Set", tcgplayer_id: "113669" },
  required_numeric_facts: { asking: 49.98, market: 199, premium_pct: -75 },
});
const SEM_MKT = Object.freeze({
  layout: "market_shape", classification: "EDITORIAL", claim_value: 85.7,
  example_card: "Clefairy", card_identity: { name: "Clefairy", set: "Base Set", tcgplayer_id: "113669" },
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
  story: { story_id: "S" }, semanticManifest: sem, factLock: { card_name: "Clefairy", card_set: "Base Set" },
  captionHandoff: CH, family, cardImagePaths: [CARD("113669")], heroCardId: "113669", heroCardName: "Clefairy",
  cacheDir: dir, ctaCacheDir: CARD_CACHE, ...over,
});

// ===================== ARCHITECTURE KEPT =====================
test("SC4C5-1. still PROFESSIONAL_SOCIAL_LOOP, still $0, version bumped (4c5 -> 4c6 ...)", () => {
  assert.ok(PROFESSIONAL_SOCIAL_LOOP_VERSION.startsWith("4c"));
  assert.ok(VIDEO_SAFE_DERIVATIVE_VERSION.startsWith("4c"));
});

// ===================== CTA HOLD (§4 / §28) =====================
test("SC4C5-2. CTA hold default is 2.6s and clamps to 2.4-3.0s", () => {
  assert.equal(CTA_END_SCREEN_DEFAULT_MS, 2600);
  assert.equal(CTA_END_SCREEN_MIN_MS, 2400);
  assert.equal(CTA_END_SCREEN_MAX_MS, 3000);
  assert.equal(CTA_HOLD.min_ms, 2400);
  assert.equal(buildUniversalCtaEndScreen({ family: "deal_hero", heroCardId: "113669", cacheDir: CARD_CACHE, durationMs: 9000 }).end_screen.duration_ms, 3000);
  assert.equal(buildUniversalCtaEndScreen({ family: "deal_hero", heroCardId: "113669", cacheDir: CARD_CACHE, durationMs: 500 }).end_screen.duration_ms, 2400);
});
test("SC4C5-3. the timeline holds the CTA (past the transition) for >= 2.4s; a short CTA -> CTA_TOO_SHORT_FAIL", () => {
  const { tl } = build("asking_vs_sold", SEM_ASK);
  const h = auditCtaHold({ timeline: tl });
  assert.ok(h.ok, JSON.stringify(h));
  assert.ok(h.hold_ms >= 2400);
  const short = auditCtaHold({ timeline: { duration_ms: 8000, story_ms: 7200, events: [{ kind: "cta_transition", at_ms: 7200, end_ms: 7600 }] } });
  assert.equal(short.state, "CTA_TOO_SHORT_FAIL");
});
test("SC4C5-4. old ~1.5s CTA regression -> CTA_TOO_SHORT_FAIL (§28)", () => {
  const r = auditCtaHold({ timeline: { duration_ms: 8500, story_ms: 7000, events: [{ kind: "cta_transition", at_ms: 7000, end_ms: 7250 }] } });
  assert.equal(r.ok, false);
  assert.equal(r.state, "CTA_TOO_SHORT_FAIL");
});

// ===================== STORY STRUCTURE / DURATION (§3) =====================
test("SC4C5-5. total = story + 400ms transition + 2600ms CTA; lands in 8.5-10.5s", () => {
  assert.equal(STORY_CTA_TRANSITION_MS, 400);
  assert.equal(CTA_HOLD_MS, 2600);
  for (const f of Object.keys(FAMILY_STORY_MS)) {
    const total = familyDurationMs(f);
    assert.equal(total, FAMILY_STORY_MS[f] + 400 + 2600);
    assert.ok(total >= 8500 && total <= 10500, `${f} total ${total}`);
    assert.equal(FAMILY_DURATION_MS[f], total);
  }
});
test("SC4C5-6. the timeline declares story_ms, transition_ms, cta_content_start_ms and a cta_transition event", () => {
  const { tl } = build("market_shape", SEM_MKT);
  assert.equal(tl.transition_ms, 400);
  assert.equal(tl.cta_content_start_ms, tl.story_ms + 400);
  const t = tl.events.find((e) => e.kind === "cta_transition");
  assert.ok(t && t.to_black === false);
});

// ===================== NO DEAD BLACK / ATMOSPHERE (§6 / §7) =====================
test("SC4C5-7. the derivative declares an atmosphere variant; buildAtmosphere renders a self-contained layer, no API", () => {
  const { d } = build("asking_vs_sold", SEM_ASK);
  assert.equal(d.atmosphere.enabled, true);
  assert.equal(d.atmosphere.variant, "story");
  const a = buildAtmosphere({ variant: "story", durationMs: 9000 });
  assert.ok(a.html.includes("atmo") && a.css.includes("radial-gradient"));
  assert.ok(!/https?:\/\/|api\.|openai/i.test(a.css + a.html));
  assert.ok(hasAtmosphere({ atmosphere: a }));
  assert.equal(PREMIUM_VIDEO_ATMOSPHERE_VERSION.startsWith("4c5"), true);
});
test("SC4C5-8. a derivative with no atmosphere / near-empty -> DEAD_BLACK_SPACE_FAIL", () => {
  assert.equal(auditDeadBlackSpace({ derivative: { density: { content_ratio: 0.7 } } }).state, "DEAD_BLACK_SPACE_FAIL");
  assert.equal(auditDeadBlackSpace({ derivative: { atmosphere: { enabled: true }, density: { content_ratio: 0.2 } } }).state, "DEAD_BLACK_SPACE_FAIL");
  assert.ok(auditDeadBlackSpace({ derivative: { atmosphere: { enabled: true }, density: { content_ratio: 0.7 } } }).ok);
});

// ===================== DERIVATIVE: SIMPLIFIED BUT DESIGNED (§8 / §10) =====================
test("SC4C5-9. the derivative carries style intent - spotlight, red rule/spine accents, a strong value structure", () => {
  const { d } = build("asking_vs_sold", SEM_ASK);
  assert.ok(d.blocks.some((b) => b.style?.spotlight), "no spotlight block");
  assert.ok(d.blocks.some((b) => b.style?.rule || b.style?.spine), "no red rule / spine accent");
  // 4C.6: a strong comparison spine on the hero_row (or a value_ladder in 4C.5)
  assert.ok(d.blocks.some((b) => (b.role === "hero_row" && b.style?.spine) || b.role === "value_ladder"), "no strong value structure");
});
test("SC4C5-10. ASKING derivative = branded label + hero card + ASK->%->MARKET comparison + short lesson; no paragraph copy, no CARD DETAILS", () => {
  const { d } = build("asking_vs_sold", SEM_ASK);
  const ids = d.blocks.map((b) => b.id);
  assert.ok(ids.includes("hook") && (ids.includes("hero_card") || ids.includes("hero_row")));
  const vb = d.blocks.find((b) => b.id === "value_ladder" || b.id === "hero_row");
  const labels = (vb.rows ?? vb.spine ?? []).map((r) => [r.label, r.sub, r.op].filter(Boolean).join(" ")).join(" ");
  assert.match(labels, /ASK/);
  assert.match(labels, /75%.*BELOW MARKET/);
  assert.match(labels, /RECENT MARKET/);
  assert.ok(!d.blocks.some((b) => /card details/i.test(String(b.text ?? ""))));
  for (const b of d.blocks) assert.ok(String(b.text ?? "").length <= 90, `${b.id} paragraph copy`);
});
test("SC4C5-11. MARKET derivative = a label + a giant 85.7% + support + a premium chart + a real example card (now a SPLIT composition, 4C.7)", () => {
  const { d } = build("market_shape", SEM_MKT);
  const byId = Object.fromEntries(d.blocks.map((b) => [b.id, b]));
  assert.match(String(byId.hook?.text), /MARKET/);
  const split = byId.market_split ?? byId.hero_stat;
  assert.ok(split, "no market hero block");
  if (byId.market_split) {
    assert.match(split.stat_lines.join(" "), /85\.7%/);
    assert.ok((split.chart ?? []).length);
    assert.ok((split.cardIds ?? []).length);
  } else {
    assert.match(String(split.text), /85\.7%/);
    assert.equal(byId.chart?.premium, true);
    assert.ok(byId.example_card && byId.chart);
  }
});
test("SC4C5-12. family-aware card scale - ASKING card is a hero; MARKET example is a real collectible", () => {
  assert.ok(CARD_SCALE.asking_vs_sold >= 1.0);
  assert.ok(CARD_SCALE.market_shape >= 0.8);
  const hr = build("asking_vs_sold", SEM_ASK).d.blocks.find((b) => ["card", "hero_row"].includes(b.role));
  assert.ok((hr.cardScale ?? 0) >= 1.0);
});

// ===================== FRAME DENSITY (§29 / §30) =====================
test("SC4C5-13. the derivative reports composition density in the target band; too sparse / too crowded fail", () => {
  for (const [f, s] of [["asking_vs_sold", SEM_ASK], ["market_shape", SEM_MKT]]) {
    const { d } = build(f, s);
    // 4C.6 - per-family band supplied on the derivative
    assert.ok(d.density.content_ratio >= d.density.target_lo && d.density.content_ratio <= d.density.target_hi, `${f} ${d.density.content_ratio}`);
    assert.ok(auditFrameDensity({ derivative: d }).ok);
  }
  assert.ok(["FRAME_DENSITY_TOO_LOW_FAIL", "UNDERCOMPOSED_FRAME_FAIL"].includes(auditFrameDensity({ derivative: { family: "asking_vs_sold", density: { content_ratio: 0.2, hero_fraction: 0.4, largest_gap: 0.1, target_lo: 0.58, target_hi: 0.84 } } }).state));
  assert.equal(auditFrameDensity({ derivative: { family: "asking_vs_sold", density: { content_ratio: 0.97, hero_fraction: 0.4, largest_gap: 0.1, target_lo: 0.58, target_hi: 0.84 } } }).state, "FRAME_DENSITY_TOO_HIGH_FAIL");
});

// ===================== MOTION (§15 / §16) =====================
test("SC4C5-14. events carry premium easing (cubic-bezier, never linear / bounce / elastic)", () => {
  const { tl } = build("asking_vs_sold", SEM_ASK);
  for (const e of tl.events) {
    if (e.kind === "cta_transition") continue;
    assert.match(e.ease ?? "", /^cubic-bezier\(/);
    assert.ok(!/bounce|elastic|linear/i.test(e.ease ?? ""));
  }
  assert.ok(tl.easing && tl.easing.outCubic.startsWith("cubic-bezier"));
});
test("SC4C5-15. motion is perceptible: salience score meets the production threshold; a near-static plan fails", () => {
  const good = auditMotion({ timeline: build("market_shape", SEM_MKT).tl });
  assert.ok(good.ok, JSON.stringify(good));
  assert.ok(good.salience_score >= 55, `salience ${good.salience_score}`);
  const flat = auditMotion({ timeline: { events: [{ id: "a", kind: "settle", scale_from: 1, scale_to: 1.002, at_ms: 0, end_ms: 6000 }] } });
  assert.equal(flat.state, "MOTION_TOO_SUBTLE_FAIL");
});
test("SC4C5-16. <= 4 primary story events (4C.6 raised the cap for more obvious motion); oversized motion still MOTION_TOO_AGGRESSIVE_FAIL", () => {
  for (const f of Object.keys(FAMILY_STORY_MS)) {
    const sem = f === "market_shape" ? SEM_MKT : SEM_ASK;
    const tl = buildProfessionalTimeline({ family: f, derivative: build(f === "market_shape" ? "market_shape" : "asking_vs_sold", sem).d });
    const story = tl.events.filter((e) => !["cta_transition", "settle", "hold"].includes(e.kind));
    assert.ok(story.length <= 4, `${f}: ${story.length}`);
  }
  assert.equal(auditMotion({ timeline: { events: [{ id: "z", kind: "stat_pulse", scale_from: 1, scale_to: 1.3, at_ms: 0, end_ms: 2000 }] } }).state, "MOTION_TOO_AGGRESSIVE_FAIL");
});

// ===================== TRANSITIONS (§17 / §34) =====================
test("SC4C5-17. story->CTA transition is 300-450ms, not a hard cut / fade-to-black", () => {
  const { tl } = build("asking_vs_sold", SEM_ASK);
  assert.ok(auditReplayTransition({ timeline: tl }).ok);
  const bad = auditReplayTransition({ timeline: { events: [{ kind: "cta_transition", at_ms: 6000, end_ms: 6040 }] } });
  assert.equal(bad.state, "REPLAY_TRANSITION_FAIL");
  const black = auditReplayTransition({ timeline: { events: [{ kind: "cta_transition", at_ms: 6000, end_ms: 6400, to_black: true }] } });
  assert.equal(black.state, "REPLAY_TRANSITION_FAIL");
});
test("SC4C5-18. CTA -> hook replay does not pass through black", () => {
  const { tl } = build("market_shape", SEM_MKT);
  assert.equal(tl.replay_to_black, false);
  assert.equal(auditReplayTransition({ timeline: { ...tl, replay_to_black: true } }).ok, false);
});

// ===================== CTA (§18-§26) =====================
test("SC4C5-19. CTA end screen: 3 real cards, magnifier brand, value pills WITH icons, hero URL, footer", { skip: !HAVE_CARDS }, () => {
  const es = buildUniversalCtaEndScreen({ family: "asking_vs_sold", heroCardId: "113669", cacheDir: CARD_CACHE }).end_screen;
  assert.equal(es.cards.length, 3);
  assert.equal(es.brand.mark, "magnifier");
  assert.equal(es.value_points.length, 3);
  assert.equal(es.value_point_icons.length, 3);
  assert.deepEqual([...CTA_VALUE_POINT_ICONS], es.value_point_icons);
  assert.equal(es.domain, "pokemondealfinder.com");
  assert.ok(es.hold_ms >= 2400);
  assert.ok(es.animation.some((a) => /light-?sweep/i.test(a.what)));
  assert.ok(es.animation.some((a) => /stagger/i.test(a.what)));
});
test("SC4C5-20. value-point copy stays safe (no overpromise)", () => {
  assert.ok(CTA_VALUE_POINTS.every((v) => !/always|guarantee|profit|rich|moon/i.test(v)));
});
test("SC4C5-21. auditCtaReadability: needs headline + pokemondealfinder.com + brand mark + >=2 value points", () => {
  assert.ok(auditCtaReadability({ endScreen: build("asking_vs_sold", SEM_ASK).es }).ok);
  assert.equal(auditCtaReadability({ endScreen: { end_screen: { primary_cta: { line1: "GO" }, domain: "x.com", brand: { mark: "magnifier" }, value_points: ["a", "b"] } } }).state, "CTA_READABILITY_FAIL");
});

// ===================== DOC RENDER (no master slice / no network) =====================
test("SC4C5-22. document = atmosphere + story scene + veil + CTA layer; premium FX; real card <img>; no network", { skip: !HAVE_CARDS }, () => {
  const { d, es, tl } = build("asking_vs_sold", SEM_ASK);
  const doc = buildProfessionalLoopDocument({ derivative: d, endScreen: es, timeline: tl, cardImages: { [CARD("113669")]: "AAAA" }, endCardImages: { "113669": "AAAA" } });
  assert.ok(doc.html.includes('class="atmo') && doc.html.includes('class="scene"') && doc.html.includes('class="veil"'));
  assert.ok(doc.html.includes("@keyframes storydim") && doc.html.includes("@keyframes endin") && doc.html.includes("eSweep"));
  assert.ok(doc.html.includes("urlsweep") && doc.html.includes("ladder"));
  assert.ok(!/https?:\/\//.test(doc.html.replace(/pokemondealfinder\.com/g, "")));
  assert.ok(!/background-position|master/i.test(doc.html)); // no re-drawn master slice
});
test("SC4C5-23. the CTA transition darkens (veil) rather than fading to full black in the document", () => {
  const { d, es, tl } = build("market_shape", SEM_MKT);
  const doc = buildProfessionalLoopDocument({ derivative: d, endScreen: es, timeline: tl });
  assert.ok(doc.html.includes("@keyframes storyveil"), "no story veil keyframe");
  assert.ok(doc.html.includes("@keyframes storydim"), "no story dim keyframe");
  // the story dims to a low non-zero opacity, not 0 (the CTA + atmosphere stay visible underneath)
  assert.match(doc.html, /storydim\{[^@]*opacity:\.12/);
  assert.ok(!/fade.?to.?black|to-full-black/i.test(doc.html));
});

// ===================== ORCHESTRATOR (end to end) =====================
test("SC4C5-24. runProfessionalSocialLoop: PASS, $0, 2.6s CTA hold, atmosphere, premium easing, density in band", { skip: !HAVE_CARDS }, () => {
  const dir = tmpCache();
  seedMaster(dir, "S", videoSemanticHash(SEM_ASK), "asking_vs_sold");
  const r = RUN(dir, SEM_ASK, "asking_vs_sold");
  assert.ok(r.ok, JSON.stringify(r).slice(0, 400));
  assert.equal(r.state, "READY_FOR_MANUAL_REVIEW");
  assert.equal(r.cost.video_incremental_api_cost, 0);
  assert.equal(r.cta_hold.verdict, "PASS");
  assert.ok(r.cta_hold.hold_ms >= 2400);
  assert.equal(r.dead_black_audit, "PASS");
  assert.equal(r.frame_density_audit.verdict, "PASS");
  assert.equal(r.atmosphere.variant, "story");
  assert.ok(r.duration_ms >= 8500 && r.duration_ms <= 10500);
  assert.ok((r.professional_brand?.score ?? 0) >= 80);
});
test("SC4C5-25. MARKET_SNAPSHOT also passes end to end", { skip: !HAVE_CARDS }, () => {
  const dir = tmpCache();
  seedMaster(dir, "S", videoSemanticHash(SEM_MKT), "market_shape");
  const r = RUN(dir, SEM_MKT, "market_shape");
  assert.ok(r.ok, JSON.stringify(r).slice(0, 400));
  assert.equal(r.cta_hold.verdict, "PASS");
  assert.equal(r.motion_salience.verdict, "PASS");
});
test("SC4C5-26. dedupe_key still master sha + mode version; exact-fact lock unchanged", { skip: !HAVE_CARDS }, () => {
  const dir = tmpCache();
  seedMaster(dir, "S", videoSemanticHash(SEM_MKT), "market_shape");
  const r = RUN(dir, SEM_MKT, "market_shape");
  assert.ok(r.dedupe_key.endsWith(`::${PROFESSIONAL_SOCIAL_LOOP_VERSION}`));
  assert.equal(r.fact_audit.exact_values, "PASS");
});
test("SC4C5-27. an old rounding-drift master is still withheld (VIDEO_DERIVED_VALUE_EXACT_FAIL)", () => {
  const dir = tmpCache();
  seedMaster(dir, "S", videoSemanticHash(SEM_ASK), "asking_vs_sold", { verification: { approved: true, derived_values: "DRIFT", state: "BUFFER_READY" } });
  assert.equal(RUN(dir, SEM_ASK, "asking_vs_sold").state, "VIDEO_DERIVED_VALUE_EXACT_FAIL");
});

// ===================== MOBILE PREVIEW (§32) =====================
test("SC4C5-28. mobile preview: readable at ~360w; tiny fonts -> MOBILE_PREVIEW_FAIL", () => {
  const { d, es } = build("asking_vs_sold", SEM_ASK);
  assert.ok(auditMobilePreview({ derivative: d, endScreen: es }).ok, JSON.stringify(auditMobilePreview({ derivative: d, endScreen: es })));
  const tiny = { width: 1080, family: "asking_vs_sold", blocks: [{ id: "hero_stat", role: "hero_stat", font: 24, zone: { h: 120 } }] };
  assert.equal(auditMobilePreview({ derivative: tiny, endScreen: es }).state, "MOBILE_PREVIEW_FAIL");
});

// ===================== FAILURE-STATE REGISTRY / REGRESSIONS (§39) =====================
test("SC4C5-29. every 4C.5 failure state is declared + revisable", () => {
  const st = ["CTA_TOO_SHORT_FAIL", "CTA_READABILITY_FAIL", "DEAD_BLACK_SPACE_FAIL", "FRAME_DENSITY_TOO_LOW_FAIL", "FRAME_DENSITY_TOO_HIGH_FAIL", "MOBILE_PREVIEW_FAIL", "REPLAY_TRANSITION_FAIL"];
  for (const s of st) { assert.ok(FAILURE_STATES.includes(s), `${s} missing`); assert.ok(REVISABLE_STATES.includes(s), `${s} not revisable`); }
});
test("SC4C5-30. runProfessionalVideoQa exposes every 4C.5 verdict + still catches 4C.4 faults", () => {
  const { d, es, tl } = build("asking_vs_sold", SEM_ASK);
  const qa = runProfessionalVideoQa({ derivative: d, timeline: tl, endScreen: es, semanticManifest: SEM_ASK, captionHandoff: CH, cardAssets: [CARD("113669"), ...es.end_screen.cards.map((c) => c.path)] });
  assert.ok(qa.ok, JSON.stringify(qa.verification));
  for (const k of ["cta_hold", "cta_readability", "dead_black_space", "frame_density", "mobile_preview", "replay_transition", "motion_salience_score"]) assert.ok(k in qa.verification, `missing ${k}`);
  // 4C.4 regression: an eBay-first CTA still fails
  const bad = runProfessionalVideoQa({ derivative: d, timeline: tl, endScreen: { end_screen: { ...es.end_screen, primary_cta: { line1: "VIEW ON EBAY" } } }, semanticManifest: SEM_ASK, captionHandoff: CH, cardAssets: [CARD("113669")] });
  assert.equal(bad.state, "VIDEO_EBAY_FIRST_CTA_FAIL");
});
test("SC4C5-31. no publishing / Buffer / upload / cron / RIGHTS / email / eBay-Browse in any 4C.5 module", () => {
  for (const f of ["premiumVideoAtmosphere", "videoSafeDerivative", "universalCtaEndScreen", "professionalVideoQa", "professionalLoopDocument", "professionalSocialLoop"].map((n) => `lib/newsroom/video/${n}.mjs`)) {
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
test("SC4C5-32. the CTA background AI asset is still GATED + owner-review + max 2 (§27)", () => {
  const src = read("lib/newsroom/video/universalCtaEndScreen.mjs");
  assert.match(src, /SOCIAL_CTA_BRAND_ASSET_GENERATE/);
  assert.match(src, /owner_review_required/);
  assert.match(src, /max\s*=\s*2|Math\.min\(2/);
  assert.match(src, /NO cards|NO.*brand mark|never AI-invented|ai_invented: false/i);
});
