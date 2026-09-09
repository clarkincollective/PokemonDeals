// Phase SOCIAL-CREATIVE-4C.6 - STATIC-MASTER PARITY + STRONGER COMPOSITION
// + BRIGHTER CTA.
//
// Same architecture as 4C.4/4C.5 (PROFESSIONAL_SOCIAL_LOOP, approved master
// reuse, VIDEO_SAFE_DERIVATIVE, canonical cards, exact-fact lock,
// website-first CTA, 8-10s + 2.4-3.0s CTA, $0). This phase corrects the
// composition: the 4C.5 build overcorrected into too much breathing room,
// small cards, faint panels, a dim CTA. Pure-logic + file cache. No real
// OpenAI, no render in the tests.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";

import { FAILURE_STATES, REVISABLE_STATES } from "../../lib/newsroom/editorial/failureStates.mjs";
import {
  PROFESSIONAL_SOCIAL_LOOP_VERSION, PROFESSIONAL_VIDEO_QA_VERSION, VIDEO_SAFE_DERIVATIVE_VERSION, PROFESSIONAL_LOOP_DOC_VERSION,
  buildVideoSafeDerivative, CARD_SCALE, FRAME_DENSITY_BANDS, VS_STYLE,
  buildUniversalCtaEndScreen, CTA_VALUE_POINTS,
  buildProfessionalTimeline, runProfessionalSocialLoop,
  runProfessionalVideoQa, auditStaticMasterParity, auditMobileHierarchy, scoreOwnerTaste, auditFrameDensity, auditMotion,
  PARITY_MIN_OVERALL, PARITY_MIN_DIMENSION, MOTION_SALIENCE,
  buildAtmosphere, buildProfessionalLoopDocument,
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
function tmpCache() { const d = join(tmpdir(), `4c6-${Date.now()}-${Math.random().toString(36).slice(2)}`); mkdirSync(d, { recursive: true }); return d; }
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
  story: { story_id: "S" }, semanticManifest: sem, factLock: { card_name: "Clefairy" },
  captionHandoff: CH, family, cardImagePaths: [CARD("113669")], heroCardId: "113669", heroCardName: "Clefairy",
  cacheDir: dir, ctaCacheDir: CARD_CACHE, ...over,
});

// ===================== ARCHITECTURE KEPT =====================
test("SC4C6-1. all video modules bumped to 4c6+; architecture unchanged", () => {
  for (const v of [PROFESSIONAL_SOCIAL_LOOP_VERSION, PROFESSIONAL_VIDEO_QA_VERSION, VIDEO_SAFE_DERIVATIVE_VERSION, PROFESSIONAL_LOOP_DOC_VERSION]) assert.ok(v.startsWith("4c"), v);
});

// ===================== DENSITY / UNDER-COMPOSITION (§4) =====================
test("SC4C6-2. per-family density bands 60-90%-ish; the derivative reports content_ratio + hero_fraction + largest_gap", () => {
  assert.ok(FRAME_DENSITY_BANDS.asking_vs_sold[0] >= 0.55 && FRAME_DENSITY_BANDS.asking_vs_sold[1] <= 0.95);
  for (const [f, s] of [["asking_vs_sold", SEM_ASK], ["market_shape", SEM_MKT]]) {
    const { d } = build(f, s);
    const [lo, hi] = FRAME_DENSITY_BANDS[f];
    assert.ok(d.density.content_ratio >= lo && d.density.content_ratio <= hi, `${f} ${d.density.content_ratio} not in ${lo}-${hi}`);
    assert.ok(typeof d.density.hero_fraction === "number" && typeof d.density.largest_gap === "number");
    assert.ok(auditFrameDensity({ derivative: d }).ok, JSON.stringify(auditFrameDensity({ derivative: d })));
  }
});
test("SC4C6-3. an under-filled frame / a thumbnail hero -> UNDERCOMPOSED_FRAME_FAIL", () => {
  assert.equal(auditFrameDensity({ derivative: { family: "asking_vs_sold", density: { content_ratio: 0.35, hero_fraction: 0.5, largest_gap: 0.1, target_lo: 0.58, target_hi: 0.84 } } }).state, "UNDERCOMPOSED_FRAME_FAIL");
  assert.equal(auditFrameDensity({ derivative: { family: "asking_vs_sold", density: { content_ratio: 0.7, hero_fraction: 0.18, largest_gap: 0.1, target_lo: 0.58, target_hi: 0.84 } } }).state, "UNDERCOMPOSED_FRAME_FAIL");
  assert.equal(auditFrameDensity({ derivative: { family: "asking_vs_sold", density: { content_ratio: 0.7, hero_fraction: 0.5, largest_gap: 0.32, target_lo: 0.58, target_hi: 0.84 } } }).state, "UNDERCOMPOSED_FRAME_FAIL");
});

// ===================== HERO CARD SCALE (§5) =====================
test("SC4C6-4. hero card scale is bigger than 4C.5; ASKING hero occupies >= 36% of the safe height", () => {
  assert.ok(CARD_SCALE.asking_vs_sold >= 1.0);
  assert.ok(CARD_SCALE.market_shape >= 1.0); // was 0.82
  const { d } = build("asking_vs_sold", SEM_ASK);
  assert.ok(d.density.hero_fraction >= 0.36, `hero_fraction ${d.density.hero_fraction}`);
});
test("SC4C6-5. MARKET example card is materially larger than the 4C.5 thumbnail", () => {
  const { d } = build("market_shape", SEM_MKT);
  const split = d.blocks.find((b) => b.id === "market_split");
  assert.ok(split, "market_split block present");
  assert.ok((split.cardIds ?? []).length === 1);
  assert.ok(split.zone.h >= 380, `market_split box ${split.zone.h}`); // 4C.5 example_card was 328
  assert.ok(split.example_label === "REAL EXAMPLE");
});

// ===================== ASKING COMPOSITION (§6-§8) =====================
test("SC4C6-6. ASKING = branded label + a hero_row (large card + strong comparison spine ASK->%->MARKET) + short lesson", () => {
  const { d } = build("asking_vs_sold", SEM_ASK);
  const ids = d.blocks.map((b) => b.id);
  assert.ok(ids.includes("hook") && ids.includes("hero_row") && (ids.includes("takeaway") || ids.includes("lesson")));
  const hr = d.blocks.find((b) => b.id === "hero_row");
  assert.ok((hr.cardIds ?? []).length === 1);
  assert.equal(hr.style.spine, true);
  const spine = hr.spine.map((r) => [r.label, r.sub, r.op].filter(Boolean).join(" ")).join(" ");
  assert.match(spine, /ASKING PRICE/);
  assert.match(spine, /75%.*BELOW MARKET/);
  assert.match(spine, /RECENT MARKET/);
  assert.ok(!ids.includes("value_ladder")); // the 4C.5 soft-glass ladder is gone
});
test("SC4C6-7. the value block is a strong dark slab with a red keyline, not soft glass", () => {
  assert.match(VS_STYLE.value_block_bg, /#(0[0-9a-f]|1[0-9a-f])/i); // dark
  assert.match(VS_STYLE.value_block_border, /232,\s*73,\s*61/); // red keyline
  const doc = buildProfessionalLoopDocument({ derivative: build("asking_vs_sold", SEM_ASK).d, endScreen: build("asking_vs_sold", SEM_ASK).es, timeline: build("asking_vs_sold", SEM_ASK).tl });
  assert.ok(doc.html.includes(".herorow .hrspine") && doc.html.includes("border-left:4px solid var(--accent)"));
});
test("SC4C6-8. no paragraph copy; no CARD DETAILS footer", () => {
  const { d } = build("asking_vs_sold", SEM_ASK);
  for (const b of d.blocks) assert.ok(String(b.text ?? "").length <= 90, `${b.id}`);
  assert.ok(!d.blocks.some((b) => /card details/i.test(String(b.text ?? ""))));
});

// ===================== MARKET COMPOSITION + CHART (§9-§11) =====================
test("SC4C6-9. MARKET = label + big 85.7% + support + premium dominant-first chart + REAL EXAMPLE card + takeaway", () => {
  const { d } = build("market_shape", SEM_MKT);
  const byId = Object.fromEntries(d.blocks.map((b) => [b.id, b]));
  assert.match(String(byId.hook?.text), /MARKET INSIGHT|MARKET SNAPSHOT/);
  if (byId.market_split) {
    const split = byId.market_split;
    assert.ok((split.font ?? 0) * 2.1 >= 120, `hero stat scaled font ${(split.font ?? 0) * 2.1}`);
    assert.ok((split.chart ?? []).length, "dominant-first chart points present");
    assert.ok((split.cardIds ?? []).length, "real example card present");
  } else {
    assert.ok((byId.hero_stat?.font ?? 0) >= 120, `hero stat font ${byId.hero_stat?.font}`);
    assert.equal(byId.chart?.premium, true);
    assert.equal(byId.chart?.dominant_first, true);
    assert.ok(byId.example_card && byId.chart);
  }
});
test("SC4C6-10. the chart document has a dominant first bar + a premium container (keyline), not plain bars on black", () => {
  const { d, es, tl } = build("market_shape", SEM_MKT);
  const doc = buildProfessionalLoopDocument({ derivative: d, endScreen: es, timeline: tl });
  assert.ok(doc.html.includes(".chartblk .bar.dom i"));
  assert.ok(doc.html.includes(".chartblk{") && /chartblk\{[^}]*border-left/.test(doc.html));
});

// ===================== TYPOGRAPHY (§12/§20) =====================
test("SC4C6-11. headlines / labels render near-white (#ffffff), not grey", () => {
  const { d, es, tl } = build("asking_vs_sold", SEM_ASK);
  const doc = buildProfessionalLoopDocument({ derivative: d, endScreen: es, timeline: tl });
  assert.match(doc.html, /label:\s*""|label\{/); // css present
  assert.ok(doc.html.includes("color:#ffffff"));
  assert.ok(doc.html.includes(".ecta .l{") && /\.ecta \.l\{[^}]*color:#ffffff/.test(doc.html));
});

// ===================== MOTION (§14/§15) =====================
test("SC4C6-12. motion is more obvious: up to 4 primary story events, all with premium easing", () => {
  assert.equal(MOTION_SALIENCE.max_primary_events, 4);
  const { tl } = build("asking_vs_sold", SEM_ASK);
  const story = tl.events.filter((e) => !["cta_transition", "settle", "hold"].includes(e.kind));
  assert.ok(story.length >= 3 && story.length <= 4, `story events ${story.length}`);
  for (const e of tl.events) { if (e.kind === "cta_transition") continue; assert.match(e.ease ?? "", /^cubic-bezier\(/); }
  const m = auditMotion({ timeline: tl });
  assert.ok(m.ok, JSON.stringify(m));
  assert.ok(m.salience_score >= 55);
});
test("SC4C6-13. the ASKING beats hit card lift, spine draw, % impact, glint (distinct sub-targets, no clobber)", () => {
  const { d, es, tl } = build("asking_vs_sold", SEM_ASK);
  const ids = tl.events.map((e) => e.id);
  assert.ok(ids.includes("card_lift") && ids.includes("spine_draw") && ids.includes("gap_impact") && ids.includes("card_glint"));
  const doc = buildProfessionalLoopDocument({ derivative: d, endScreen: es, timeline: tl });
  assert.ok(doc.html.includes(".blk-hero_row .sr.emph{") || doc.html.includes(".blk-hero_row .hrcard{") || /\.sr\.emph\{animation-name/.test(doc.html));
});

// ===================== CTA BRIGHTNESS (§16-§24) =====================
test("SC4C6-14. the CTA atmosphere renders bright:true (brighter base + stronger red halo)", () => {
  const dim = buildAtmosphere({ variant: "cta", durationMs: 9000, bright: false });
  const bright = buildAtmosphere({ variant: "cta", durationMs: 9000, bright: true });
  assert.equal(bright.bright, true);
  assert.notEqual(bright.css, dim.css);
  assert.ok(bright.spotlights.length >= dim.spotlights.length);
  const { d, es, tl } = build("asking_vs_sold", SEM_ASK);
  const doc = buildProfessionalLoopDocument({ derivative: d, endScreen: es, timeline: tl });
  // the bright CTA base is a lifted charcoal, distinctly lighter than the story ground (#17171c)
  assert.match(doc.html, /radial-gradient\([^)]*#[23][0-9a-f]{2}[0-9a-f]{3}[^)]*\)/i);
  assert.ok(bright.css.includes("0.34") || bright.css.includes(".34")); // stronger red halo alpha
});
test("SC4C6-15. the CTA end screen declares high brightness + a near-white headline tone; card fan is larger", () => {
  const es = buildUniversalCtaEndScreen({ family: "asking_vs_sold", heroCardId: "113669", cacheDir: CARD_CACHE }).end_screen;
  assert.equal(es.brightness, "high");
  assert.equal(es.cta_darker_than_story, false);
  assert.equal(es.primary_cta.tone, "near_white");
  const doc = buildProfessionalLoopDocument({ derivative: build("asking_vs_sold", SEM_ASK).d, endScreen: { end_screen: es }, timeline: build("asking_vs_sold", SEM_ASK).tl });
  assert.ok(/\.ec\{[^}]*width:372px/.test(doc.html)); // bigger fan card
  assert.ok(doc.html.includes("background:#ffffff") && /\.ego\{[^}]*border:6px solid/.test(doc.html)); // bright white URL field, thicker border
});
test("SC4C6-16. CTA hold stays 2.4-3.0s; a grey / darker CTA is penalised, a bright one is bonused", () => {
  const dir = tmpCache();
  seedMaster(dir, "S", videoSemanticHash(SEM_ASK), "asking_vs_sold");
  const r = RUN(dir, SEM_ASK, "asking_vs_sold");
  assert.ok(r.cta_hold.hold_ms >= 2400);
  const d = build("asking_vs_sold", SEM_ASK).d;
  const grey = scoreOwnerTaste({ derivative: d, endScreen: { end_screen: { brightness: "low", cta_darker_than_story: true, primary_cta: { tone: "grey" } } } });
  const bright = scoreOwnerTaste({ derivative: d, endScreen: { end_screen: { brightness: "high", cta_darker_than_story: false, primary_cta: { tone: "near_white" } } } });
  assert.ok(grey.penalties.join(" ").match(/grey|darker/i), JSON.stringify(grey.penalties));
  assert.ok(bright.score - grey.score >= 20, `bright ${bright.score} vs grey ${grey.score}`);
});

// ===================== STATIC-MASTER PARITY (§27) =====================
test("SC4C6-17. auditStaticMasterParity: the two autonomous-safe families reach >= 80 overall, no dimension < 72", () => {
  for (const [f, s] of [["asking_vs_sold", SEM_ASK], ["market_shape", SEM_MKT]]) {
    const { d, es } = build(f, s);
    const p = auditStaticMasterParity({ derivative: d, endScreen: es });
    assert.ok(p.ok, `${f}: ${JSON.stringify(p.verification)}`);
    assert.ok(p.verification.overall >= PARITY_MIN_OVERALL);
    for (const [k, v] of Object.entries(p.verification.dimensions)) assert.ok(v >= PARITY_MIN_DIMENSION, `${f}/${k}=${v}`);
  }
});
test("SC4C6-18. a weak frame (no hero, sparse, no strong value) -> STATIC_MASTER_PARITY_FAIL", () => {
  const weak = { family: "asking_vs_sold", fits: true, atmosphere: { enabled: true }, blocks: [{ role: "label", style: { rule: true } }, { role: "context" }], density: { content_ratio: 0.32, hero_fraction: 0.05, largest_gap: 0.4, target_lo: 0.58, target_hi: 0.84 } };
  const p = auditStaticMasterParity({ derivative: weak, endScreen: { end_screen: {} } });
  assert.equal(p.ok, false);
  assert.equal(p.state, "STATIC_MASTER_PARITY_FAIL");
});
test("SC4C6-19. the automated trust score never claims perfection - it is capped below 100 and moves with parity/taste", () => {
  const { d, es, tl } = build("asking_vs_sold", SEM_ASK);
  const t = runProfessionalVideoQa({ derivative: d, timeline: tl, endScreen: es, semanticManifest: SEM_ASK, captionHandoff: CH, cardAssets: [CARD("113669"), ...es.end_screen.cards.map((c) => c.path)] }).trust;
  assert.ok(t.score < 100 && t.score >= 80);
  assert.ok(t.static_master_parity && typeof t.static_master_parity.overall === "number");
  assert.ok(t.owner_taste && Array.isArray(t.owner_taste.penalties));
});

// ===================== OWNER TASTE (§28) =====================
test("SC4C6-20. owner-taste penalises a small hero / faint glass panel / tiny example card; bonuses a strong hero + editorial structure", () => {
  const strong = scoreOwnerTaste({ derivative: build("asking_vs_sold", SEM_ASK).d, endScreen: build("asking_vs_sold", SEM_ASK).es });
  assert.ok(strong.score > 0 && strong.bonuses.join(" ").match(/strong hero|editorial|accent hierarchy/i));
  const faint = scoreOwnerTaste({ derivative: { family: "asking_vs_sold", density: { content_ratio: 0.4, hero_fraction: 0.15, largest_gap: 0.3, target_lo: 0.58, target_hi: 0.84 }, blocks: [{ role: "value_ladder" }] }, endScreen: { end_screen: {} } });
  assert.ok(faint.score < 0 && faint.penalties.join(" ").match(/hero card too small|faint glass|inactive/i));
});

// ===================== MOBILE HIERARCHY (§29) =====================
test("SC4C6-21. auditMobileHierarchy: the family's key elements are instantly visible at 360w", () => {
  for (const [f, s] of [["asking_vs_sold", SEM_ASK], ["market_shape", SEM_MKT]]) {
    const { d, es } = build(f, s);
    assert.ok(auditMobileHierarchy({ derivative: d, endScreen: es }).ok, `${f}: ${JSON.stringify(auditMobileHierarchy({ derivative: d, endScreen: es }))}`);
  }
  const bad = auditMobileHierarchy({ derivative: { family: "market_shape", width: 1080, blocks: [{ role: "hero_stat", font: 40, priority: 1 }] }, endScreen: { end_screen: { brand: { mark: "magnifier" }, primary_cta: { line1: "GO" }, domain: "pokemondealfinder.com" } } });
  assert.equal(bad.state, "MOBILE_HIERARCHY_FAIL");
});

// ===================== ORCHESTRATOR (end to end) =====================
test("SC4C6-22. runProfessionalSocialLoop: PASS, $0, parity in the result, density band, bright CTA", { skip: !HAVE_CARDS }, () => {
  const dir = tmpCache();
  seedMaster(dir, "S", videoSemanticHash(SEM_ASK), "asking_vs_sold");
  const r = RUN(dir, SEM_ASK, "asking_vs_sold");
  assert.ok(r.ok, JSON.stringify(r).slice(0, 400));
  assert.equal(r.state, "READY_FOR_MANUAL_REVIEW");
  assert.equal(r.cost.video_incremental_api_cost, 0);
  assert.ok(r.static_master_parity.overall >= 80);
  assert.equal(r.mobile_hierarchy_audit, "PASS");
  assert.equal(r.end_screen.brightness, "high");
  assert.ok(r.density.content_ratio >= r.density.target_lo && r.density.content_ratio <= r.density.target_hi);
});
test("SC4C6-23. MARKET_SNAPSHOT also passes end to end with parity >= 80", { skip: !HAVE_CARDS }, () => {
  const dir = tmpCache();
  seedMaster(dir, "S", videoSemanticHash(SEM_MKT), "market_shape");
  const r = RUN(dir, SEM_MKT, "market_shape");
  assert.ok(r.ok, JSON.stringify(r).slice(0, 400));
  assert.ok(r.static_master_parity.overall >= 80);
});
test("SC4C6-24. an old rounding-drift master is still withheld", () => {
  const dir = tmpCache();
  seedMaster(dir, "S", videoSemanticHash(SEM_ASK), "asking_vs_sold", { verification: { approved: true, derived_values: "DRIFT", state: "BUFFER_READY" } });
  assert.equal(RUN(dir, SEM_ASK, "asking_vs_sold").state, "VIDEO_DERIVED_VALUE_EXACT_FAIL");
});

// ===================== DOC RENDER =====================
test("SC4C6-25. the document renders hero_row (card left + spine right), real card <img>, no network, no master slice", { skip: !HAVE_CARDS }, () => {
  const { d, es, tl } = build("asking_vs_sold", SEM_ASK);
  const doc = buildProfessionalLoopDocument({ derivative: d, endScreen: es, timeline: tl, cardImages: { [CARD("113669")]: "AAAA" }, endCardImages: { "113669": "AAAA" } });
  assert.ok(doc.html.includes('class="blk blk-hero_row') && doc.html.includes("hrspine") && doc.html.includes("class=\"rail\""));
  assert.ok(doc.html.includes("data:image/jpeg;base64,AAAA"));
  assert.ok(!/https?:\/\//.test(doc.html.replace(/pokemondealfinder\.com/g, "")));
  assert.ok(!/background-position|background-image:url\('data:.*master/i.test(doc.html));
  assert.ok(doc.html.includes("@keyframes storydim") && !/@keyframes .*fade.?to.?black/i.test(doc.html));
});

// ===================== FAILURE-STATE REGISTRY / §38 REGRESSIONS =====================
test("SC4C6-26. the 3 new 4C.6 failure states are declared + revisable", () => {
  for (const s of ["STATIC_MASTER_PARITY_FAIL", "UNDERCOMPOSED_FRAME_FAIL", "MOBILE_HIERARCHY_FAIL"]) {
    assert.ok(FAILURE_STATES.includes(s), `${s} missing`);
    assert.ok(REVISABLE_STATES.includes(s), `${s} not revisable`);
  }
});
test("SC4C6-27. §38 hard regressions still fail: small hero, tiny example card, AI card, eBay-first CTA", () => {
  // small hero
  assert.equal(auditFrameDensity({ derivative: { family: "asking_vs_sold", density: { content_ratio: 0.7, hero_fraction: 0.16, largest_gap: 0.1, target_lo: 0.58, target_hi: 0.84 } } }).state, "UNDERCOMPOSED_FRAME_FAIL");
  // eBay-first CTA
  const { d, tl } = build("asking_vs_sold", SEM_ASK);
  const bad = runProfessionalVideoQa({ derivative: d, timeline: tl, endScreen: { end_screen: { primary_cta: { line1: "VIEW ON EBAY" }, domain: "pokemondealfinder.com", brand: { mark: "magnifier" }, value_points: ["a", "b"] } }, semanticManifest: SEM_ASK, captionHandoff: CH, cardAssets: [CARD("113669")] });
  assert.equal(bad.state, "VIDEO_EBAY_FIRST_CTA_FAIL");
});
test("SC4C6-28. no publishing / Buffer / upload / cron / RIGHTS / email / eBay-Browse in any 4C.6 module", () => {
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
test("SC4C6-29. still no new video-specific AI board generation; CTA background AI stays GATED + owner-review + max 2", () => {
  for (const f of ["professionalSocialLoop", "videoSafeDerivative", "professionalLoopDocument"].map((n) => `lib/newsroom/video/${n}.mjs`)) {
    assert.doesNotMatch(read(f), /images\/(generations|edits)|generateSceneBoards|runGenerativeVideoDirector/i, `${f}`);
  }
  const src = read("lib/newsroom/video/universalCtaEndScreen.mjs");
  assert.match(src, /SOCIAL_CTA_BRAND_ASSET_GENERATE/);
  assert.match(src, /owner_review_required/);
  assert.match(src, /max\s*=\s*2|Math\.min\(2/);
  assert.match(src, /NO cards|NO Poke Ball|never AI-invented|ai_invented: false/i);
});
test("SC4C6-30. value-point copy stays safe; real cards only through the pipeline", () => {
  assert.ok(CTA_VALUE_POINTS.every((v) => !/always|guarantee|profit|rich|moon/i.test(v)));
  const { d } = build("asking_vs_sold", SEM_ASK);
  for (const p of d.card_asset_paths) assert.match(p, /card-art-cache[\\/]\d+\.jpg$/);
});
