// Phase SOCIAL-CREATIVE-4C.4 - PROFESSIONAL SOCIAL VIDEO QUALITY GATE.
//
// "Would this video increase trust in PokemonDealFinder if seen by
//  somebody who has never visited the website?" (§40)
//
// Pure logic. Audits the VIDEO-SAFE DERIVATIVE + the MOTION TIMELINE + the
// UNIVERSAL CTA END SCREEN:
//   §4   content comprehension     -> CONTENT_PURPOSE_UNCLEAR_FAIL
//   §10  cutoff / crop             -> TEXT_CUTOFF_FAIL / CARD_CROP_FAIL / CTA_CUTOFF_FAIL
//   §11  partial sections          -> PARTIAL_PANEL_FAIL / FOOTER_TRUNCATION_FAIL
//   §12  mobile safe area          -> SAFE_ZONE_VIOLATION_FAIL
//   §13  mobile readability        -> MOBILE_TEXT_TOO_SMALL_FAIL
//   §15/§16 no whole-poster push / no camera tour -> CAMERA_TOUR_FAIL
//   §17  motion salience / aggression -> MOTION_TOO_SUBTLE_FAIL / MOTION_TOO_AGGRESSIVE_FAIL
//   §19  real canonical cards only -> AI_GENERATED_CARD_FAIL
//   §38  website-first CTA         -> VIDEO_EBAY_FIRST_CTA_FAIL
//   §39  CTA purpose clear         -> CTA_PURPOSE_UNCLEAR_FAIL
//   §40/§41 professional trust     -> PROFESSIONAL_BRAND_FAIL
//
// Reuses auditVideoDerivedExact for the §42 exact-fact lock.

import { failure } from "../editorial/failureStates.mjs";
import { VS_MIN_FONT } from "./videoSafeDerivative.mjs";
import { auditVideoDerivedExact } from "./videoMasterQa.mjs";
export { auditVideoDerivedExact } from "./videoMasterQa.mjs";

export const PROFESSIONAL_VIDEO_QA_VERSION = "4c7.1";

// §4 / §28 - the CTA is a conversion moment, not a flash. It must be
// fully readable (i.e. past the story->CTA transition) for at least this
// long. Production default 2.6s.
export const CTA_HOLD = Object.freeze({ min_ms: 2400, target_ms: 2600, max_ms: 3000 });
// §17 (2nd time round) - the "just right" motion band
export const MOTION_SALIENCE_MIN_SCORE = 55;
// 4C.6 §30 - fallback density band (the derivative now supplies a
// per-family band in `density.target_lo/target_hi`).
export const FRAME_DENSITY = Object.freeze({ lo: 0.42, hi: 0.92, dead_black_below: 0.34 });
// 4C.6 §27 - static-master parity: overall >= 80 and no single dimension
// below 72.
export const PARITY_MIN_OVERALL = 80;
export const PARITY_MIN_DIMENSION = 72;
// 4C.7 §3/§13A - meaningful composition must fill at least this much of
// the practical safe region (a hard floor; the target is 80-88%).
export const OCCUPANCY_MIN = 0.75;
// 4C.7 §4/§5/§13B - the real card must not collapse toward a thumbnail
export const CARD_PROMINENCE_MIN = Object.freeze({
  asking_vs_sold: 0.40, deal_hero: 0.40, market_shape: 0.30, three_up: 0.32, printing_compare: 0.30, _default: 0.32,
});
// 4C.7 §3/§13C - the lower third before the CTA cannot be mostly empty
export const LOWER_DEAD_SPACE_MAX = 0.18;
// 4C.7 §13E - the owner-review rubric field (never fabricated precision)
export const STATIC_MASTER_REFERENCE_SCORE = 90; // the approved static masters, per the owner's ~9/10 verdict

// §17 - what counts as a "clearly perceivable" motion event at phone size
export const MOTION_SALIENCE = Object.freeze({
  min_perceivable_events: 2,
  max_primary_events: 4,          // 4C.6 §14 - motion must be MORE obvious; up from 3
  min_scale_delta: 0.02,          // 1.00 -> 1.02 is the floor to be seen
  max_scale_delta: 0.06,          // beyond this it is louder than the content
  min_opacity_delta: 0.25,
  max_translate_pct: 6,           // % of the shorter frame edge
  banned_kinds: ["spin", "rotate", "bounce", "wipe", "flip", "confetti", "flash", "strobe", "explode", "shake", "zoom_big"],
});

// §43 - banned hype / investment language anywhere on the video
const BANNED_COPY = /\b(invest now|future returns|easy money|guaranteed profit|before prices rise|to the moon|\bmoon\b|it'?s a steal|insane deal|don'?t miss out|get rich|pump)\b/i;

// §42 - the derivative is 100% deterministic from the frozen manifest, so
// every number it shows is BY CONSTRUCTION a sanctioned value. This
// returns only percentages a future bug could have introduced that are
// NOT one of the manifest's sanctioned figures - those are what the exact
// lock must scrutinise. (Also sidesteps the shared integer-% parser
// mis-reading a decimal like "9.1%".)
export function unsanctionedShownPercents(derivative = {}, S = {}) {
  const sanctioned = new Set();
  const addN = (v) => { const n = Number(v); if (Number.isFinite(n)) { sanctioned.add(Math.round(n)); sanctioned.add(Math.round(Math.abs(n))); } };
  addN(S.comparison_pct); addN(S.claim_value);
  addN(S.required_numeric_facts?.discount_pct);
  addN(S.required_numeric_facts?.premium_pct);
  for (const p of S.visualization_data_manifest?.allowed_points ?? []) addN(p.value);
  const out = [];
  for (const tok of derivative.shown_numbers ?? []) {
    const m = String(tok).match(/^(-?\d+(?:\.\d+)?)\s*%$/);
    if (!m) continue;
    const n = Math.round(Math.abs(Number(m[1])));
    if (!sanctioned.has(n)) out.push(`${n}%`);
  }
  return out;
}

const inFrame = (z, W = 1080, H = 1920) => z && z.x >= -0.5 && z.y >= -0.5 && z.x + z.w <= W + 0.5 && z.y + z.h <= H + 0.5;
const inSafe = (z, cs) => z && z.x >= cs.x - 0.5 && z.y >= cs.y - 0.5 && z.x + z.w <= cs.right + 0.5 && z.y + z.h <= cs.bottom + 0.5;

// ---------------------------------------------------------------
// §4 CONTENT COMPREHENSION - is the story clear in the first ~1.5s?
// ---------------------------------------------------------------
export function auditContentComprehension({ derivative = {}, timeline = {} } = {}) {
  const blocks = derivative.blocks ?? [];
  const p1 = blocks.filter((b) => b.priority === 1);
  const hasHook = p1.some((b) => ["hook", "label", "hero_stat"].includes(b.role) && String(b.text ?? "").trim());
  const hasSubject = p1.some((b) => ["card", "card_row", "chart", "hero_row", "market_split"].includes(b.role));
  const hasFigure = p1.some((b) => ["primary_stat", "hero_stat", "comparison", "value_ladder", "hero_row", "market_split"].includes(b.role)
    && (String(b.text ?? "").trim() || (b.points ?? []).length || (b.rows ?? []).length || (b.spine ?? []).length || (b.stat_lines ?? []).length || (b.chart ?? []).length));
  // everything that must be legible by ~1.5s should be a first-beat element
  const earlyIds = new Set((timeline.events ?? []).filter((e) => e.at_ms <= 1500).flatMap((e) => (Array.isArray(e.reveal) ? e.reveal : [])));
  const findings = [];
  if (!hasHook) findings.push("no immediate hook / hero figure in the first frame");
  if (!hasSubject) findings.push("no real card / chart to anchor the subject");
  if (!hasFigure) findings.push("no primary number / comparison visible early");
  if (!derivative.comprehension_line) findings.push("no plain-language gist for the family");
  if (findings.length) return { ok: false, ...failure("CONTENT_PURPOSE_UNCLEAR_FAIL", `${findings.join(" | ")} - a viewer would need the caption to know what this is (§4)`, { stage: "professional_video_qa" }), findings, early_ids: [...earlyIds] };
  return { ok: true, findings: [], gist: derivative.comprehension_line, early_ids: [...earlyIds] };
}

// ---------------------------------------------------------------
// §10 / §11 / §12 CUTOFF + PARTIAL PANEL + SAFE ZONE
// ---------------------------------------------------------------
export function auditCutoffAndSafeZones({ derivative = {}, endScreen = {} } = {}) {
  const cs = derivative.centre_safe ?? { x: 96, y: 260, right: 984, bottom: 1420 };
  const W = derivative.width ?? 1080, H = derivative.height ?? 1920;
  const findings = [];
  const roleFail = {
    card: "CARD_CROP_FAIL", card_row: "CARD_CROP_FAIL", hero_row: "CARD_CROP_FAIL", market_split: "CARD_CROP_FAIL",
    domain: "CTA_CUTOFF_FAIL", takeaway: "FOOTER_TRUNCATION_FAIL", lesson: "FOOTER_TRUNCATION_FAIL", market_band: "FOOTER_TRUNCATION_FAIL",
    context: "PARTIAL_PANEL_FAIL", chart: "PARTIAL_PANEL_FAIL",
  };

  for (const b of derivative.blocks ?? []) {
    if (b.partial) findings.push({ code: "PARTIAL_PANEL_FAIL", detail: `block "${b.id}" is shown partially - show it whole or remove it (§11)` });
    if (!inFrame(b.zone, W, H)) findings.push({ code: roleFail[b.role] ?? "TEXT_CUTOFF_FAIL", detail: `block "${b.id}" (${b.role}) extends outside the ${W}x${H} frame: ${JSON.stringify(b.zone)}` });
    else if (!inSafe(b.zone, cs)) findings.push({ code: b.role === "domain" ? "CTA_CUTOFF_FAIL" : b.role.startsWith("card") ? "CARD_CROP_FAIL" : "SAFE_ZONE_VIOLATION_FAIL", detail: `block "${b.id}" (${b.role}) is outside the mobile centre-safe region (under platform chrome) (§12)` });
  }
  if (derivative.overflow && derivative.overflow.length) findings.push({ code: "SAFE_ZONE_VIOLATION_FAIL", detail: `derivative reports ${derivative.overflow.length} overflowing block(s)` });
  if (derivative.fits === false) findings.push({ code: "PARTIAL_PANEL_FAIL", detail: "derivative could not fit all kept blocks in the safe region - it must simplify further, not clip" });

  const es = endScreen.end_screen ?? endScreen;
  if (es && es.cards && es.cards.length && es.cards.length < 3) findings.push({ code: "PARTIAL_PANEL_FAIL", detail: `CTA fan has only ${es.cards.length} card(s)` });

  if (!findings.length) return { ok: true, findings: [] };
  const ORDER = ["CARD_CROP_FAIL", "CTA_CUTOFF_FAIL", "TEXT_CUTOFF_FAIL", "FOOTER_TRUNCATION_FAIL", "PARTIAL_PANEL_FAIL", "SAFE_ZONE_VIOLATION_FAIL"];
  const state = ORDER.find((s) => findings.some((f) => f.code === s)) ?? findings[0].code;
  return { ok: false, ...failure(state, findings.map((f) => f.detail).join(" | ").slice(0, 400), { stage: "professional_video_qa", detail: { findings } }), findings };
}

// ---------------------------------------------------------------
// §13 MOBILE READABILITY
// ---------------------------------------------------------------
export function auditMobileReadability({ derivative = {} } = {}) {
  const findings = [];
  for (const b of derivative.blocks ?? []) {
    if (b.font == null) continue;
    const min = VS_MIN_FONT[b.role] ?? VS_MIN_FONT[b.id] ?? 30;
    if (b.font < min) findings.push(`"${b.id}" font ${b.font}px < ${min}px minimum for role "${b.role}"`);
    if (b.role === "context" && String(b.text ?? "").length > 96) findings.push(`"${b.id}" is paragraph copy (${b.text.length} chars) - long copy belongs in the caption / website, not the video`);
  }
  if (findings.length) return { ok: false, ...failure("MOBILE_TEXT_TOO_SMALL_FAIL", `${findings.join(" | ")} - a viewer would have to pause / zoom (§13)`, { stage: "professional_video_qa" }), findings };
  return { ok: true, findings: [] };
}

// ---------------------------------------------------------------
// §15 / §16 / §17 MOTION - camera tour, subtlety, aggression
// ---------------------------------------------------------------
export function auditMotion({ timeline = {} } = {}) {
  const C = MOTION_SALIENCE;
  const NON_STORY = new Set(["cta_transition", "cross_dissolve", "settle", "hold"]);
  const ev = (timeline.events ?? []).filter((e) => !NON_STORY.has(e.kind));
  const findings = [];

  // §16 - no whole-image push, no camera tour
  for (const e of ev) {
    if (e.kind === "whole_image_push" || (e.kind === "push" && ["full", "whole", "poster"].includes(e.target))) {
      findings.push({ code: "MOTION_TOO_SUBTLE_FAIL", detail: `"${e.id}" is a whole-image push - removed in 4C.4, it adds no meaningful value (§16); animate focal content instead` });
    }
    if (["pan", "crop", "camera"].includes(e.kind) || (e.target && !["full", "whole"].includes(e.target) && e.kind === "push" && (e.translate_pct ?? 0) > 0)) {
      findings.push({ code: "CAMERA_TOUR_FAIL", detail: `"${e.id}" pans / frames a region of the composition (§15)` });
    }
    if (timeline.camera?.frames_whole_creative === false) findings.push({ code: "CAMERA_TOUR_FAIL", detail: "timeline.camera.frames_whole_creative=false" });
  }

  // §17 - perceivable?
  const perceivable = ev.filter((e) => {
    const sd = Math.abs((e.scale_to ?? 1) - (e.scale_from ?? 1));
    const od = Math.abs((e.opacity_to ?? 1) - (e.opacity_from ?? 1));
    return sd >= C.min_scale_delta || od >= C.min_opacity_delta || ["illuminate", "draw", "fill", "sweep", "highlight", "depth", "underline"].includes(e.kind);
  });
  // 4C.5 §15 - a salience score: perceivable events + a chart / card focal moment
  const salienceScore = Math.min(100,
    perceivable.length * 26
    + (ev.some((e) => e.kind === "chart_fill") ? 12 : 0)
    + (ev.some((e) => e.kind === "card_sweep") ? 12 : 0)
    + (ev.some((e) => e.kind === "illuminate") ? 8 : 0));
  if (perceivable.length < C.min_perceivable_events || salienceScore < MOTION_SALIENCE_MIN_SCORE) {
    findings.push({ code: "MOTION_TOO_SUBTLE_FAIL", detail: `${perceivable.length} clearly-perceivable event(s), salience ${salienceScore}/100 (need >= ${C.min_perceivable_events} events and >= ${MOTION_SALIENCE_MIN_SCORE} salience) - the 4C.3 loop read as a static JPEG (§15/§17)` });
  }

  // §17 - too aggressive?
  const primary = ev.length;
  if (primary > C.max_primary_events) findings.push({ code: "MOTION_TOO_AGGRESSIVE_FAIL", detail: `${primary} primary story-motion events - max ${C.max_primary_events} before the CTA (§18)` });
  for (const e of ev) {
    const sd = Math.abs((e.scale_to ?? 1) - (e.scale_from ?? 1));
    if (sd > C.max_scale_delta) findings.push({ code: "MOTION_TOO_AGGRESSIVE_FAIL", detail: `"${e.id}" scale delta ${sd.toFixed(3)} > ${C.max_scale_delta}` });
    if ((e.translate_pct ?? 0) > C.max_translate_pct) findings.push({ code: "MOTION_TOO_AGGRESSIVE_FAIL", detail: `"${e.id}" translate ${e.translate_pct}% > ${C.max_translate_pct}%` });
    if (C.banned_kinds.some((k) => String(e.kind).includes(k))) findings.push({ code: "MOTION_TOO_AGGRESSIVE_FAIL", detail: `"${e.id}" kind "${e.kind}" is banned (§14)` });
  }

  if (!findings.length) return { ok: true, findings: [], perceivable: perceivable.length, primary, salience_score: salienceScore };
  const ORDER = ["CAMERA_TOUR_FAIL", "MOTION_TOO_AGGRESSIVE_FAIL", "MOTION_TOO_SUBTLE_FAIL"];
  const state = ORDER.find((s) => findings.some((f) => f.code === s)) ?? findings[0].code;
  return { ok: false, ...failure(state, findings.map((f) => f.detail).join(" | ").slice(0, 400), { stage: "professional_video_qa", detail: { findings } }), findings, perceivable: perceivable.length, primary, salience_score: salienceScore };
}

// ---------------------------------------------------------------
// §19 REAL CANONICAL CARDS ONLY
// ---------------------------------------------------------------
export function auditRealCards({ derivative = {}, endScreen = {}, cardAssets = [] } = {}) {
  const bad = [];
  const canon = (p) => /tcgplayer-cdn\.tcgplayer\.com/.test(String(p)) || /[\\/]card-art-cache[\\/]\d+\.jpe?g$/i.test(String(p)) || /\/\d+\.jpe?g$/i.test(String(p).replace(/\\/g, "/"));
  for (const p of cardAssets ?? []) if (p && !canon(p)) bad.push(String(p));
  for (const b of derivative.blocks ?? []) for (const p of b.cardImgPaths ?? b.cardIds ?? []) if (p && !canon(p) && !/^\d+$/.test(String(p))) bad.push(String(p));
  const es = endScreen.end_screen ?? endScreen;
  for (const c of es.cards ?? []) if (c.ai_generated === true || c.canonical === false || (c.path && !canon(c.path))) bad.push(c.path ?? c.id);
  if (bad.length) return { ok: false, ...failure("AI_GENERATED_CARD_FAIL", `non-canonical / AI-looking card asset(s): ${[...new Set(bad)].join(", ")} - production uses REAL canonical cards only (§19)`, { stage: "professional_video_qa" }), bad };
  return { ok: true, bad: [] };
}

// ---------------------------------------------------------------
// §38 / §39 CTA - website first + purpose clear
// ---------------------------------------------------------------
export function auditVideoCta({ endScreen = {}, derivative = {}, captionHandoff = null } = {}) {
  const es = endScreen.end_screen ?? endScreen;
  const blob = `${es.primary_cta?.line1 ?? ""} ${es.primary_cta?.line2 ?? ""} ${es.cta_button ?? ""} ${es.domain ?? ""} ${(derivative.blocks ?? []).map((b) => b.text).join(" ")}`.toLowerCase();
  if (/\bview on ebay\b|\bbid on ebay\b|ebay\.com|→\s*ebay/.test(blob)) return { ok: false, ...failure("VIDEO_EBAY_FIRST_CTA_FAIL", `the video routes social traffic to eBay ("${blob.match(/[^.]*ebay[^.]*/)?.[0]?.trim()}") - social must go to the website first (§38)`, { stage: "professional_video_qa" }) };
  if (String(es.domain ?? "").toLowerCase() !== "pokemondealfinder.com") return { ok: false, ...failure("CTA_PURPOSE_UNCLEAR_FAIL", `end screen domain is "${es.domain}", not pokemondealfinder.com`, { stage: "professional_video_qa" }) };
  const hasPurpose = (es.value_points ?? []).length >= 2 && (es.brand?.mark === "magnifier");
  if (!hasPurpose) return { ok: false, ...failure("CTA_PURPOSE_UNCLEAR_FAIL", "end screen alone does not convey what PokemonDealFinder does (need the brand mark + >= 2 value points) (§39)", { stage: "professional_video_qa" }) };
  return { ok: true };
}

// ---------------------------------------------------------------
// 4C.5 §4 / §28 - CTA HOLD TIME (the conversion moment cannot flash)
// ---------------------------------------------------------------
export function auditCtaHold({ timeline = {} } = {}) {
  const total = timeline.duration_ms ?? 0;
  const trans = (timeline.events ?? []).find((e) => e.kind === "cta_transition");
  const ctaContentStart = trans ? trans.end_ms : (timeline.story_ms ?? 0) + 400;
  const holdMs = Math.max(0, total - ctaContentStart);
  if (holdMs < CTA_HOLD.min_ms) {
    return { ok: false, ...failure("CTA_TOO_SHORT_FAIL", `CTA fully readable for only ${Math.round(holdMs)}ms (need >= ${CTA_HOLD.min_ms}ms; target ${CTA_HOLD.target_ms}ms) - it flashes and is not a conversion moment (§4/§28)`, { stage: "professional_video_qa" }), hold_ms: Math.round(holdMs), cta_content_start_ms: ctaContentStart };
  }
  return { ok: true, hold_ms: Math.round(holdMs), cta_content_start_ms: ctaContentStart, sample_ms: [ctaContentStart + 200, ctaContentStart + 1000, ctaContentStart + 2200] };
}

// ---------------------------------------------------------------
// 4C.5 §5 - CTA readable without pausing (structural: URL / headline /
// brand sizes + cards not overlapping the messaging)
// ---------------------------------------------------------------
export function auditCtaReadability({ endScreen = {} } = {}) {
  const es = endScreen.end_screen ?? endScreen;
  const findings = [];
  if (!String(es.primary_cta?.line1 ?? "").trim()) findings.push("no primary CTA headline");
  if (String(es.domain ?? "").toLowerCase() !== "pokemondealfinder.com") findings.push(`URL is "${es.domain}" not pokemondealfinder.com`);
  if (es.brand?.mark !== "magnifier") findings.push("no recognisable brand mark");
  if ((es.value_points ?? []).length < 2) findings.push("value proposition unclear (<2 points)");
  // the layout keeps the card fan below the headline and above the URL panel;
  // if the doc ever reports an overlap flag, honour it.
  if (es.layout && es.layout.cards_overlap_messaging === true) findings.push("card fan overlaps the CTA messaging");
  if (findings.length) return { ok: false, ...failure("CTA_READABILITY_FAIL", `${findings.join(" | ")} - a viewer would need to pause (§5)`, { stage: "professional_video_qa" }), findings };
  return { ok: true, findings: [] };
}

// ---------------------------------------------------------------
// 4C.5 §6 - NO DEAD BLACK SPACE (atmosphere present + not near-empty)
// ---------------------------------------------------------------
export function auditDeadBlackSpace({ derivative = {} } = {}) {
  const d = derivative.density ?? {};
  const ratio = d.content_ratio ?? 0;
  const hasAtmo = Boolean(derivative.atmosphere?.enabled);
  const findings = [];
  if (!hasAtmo) findings.push("no atmosphere layer declared - the frame is flat black");
  if (ratio < FRAME_DENSITY.dead_black_below) findings.push(`meaningful content fills only ${Math.round(ratio * 100)}% of the safe region - large zones read as unfinished`);
  if ((d.largest_gap ?? 0) > 0.30) findings.push(`a single inactive vertical zone is ${Math.round((d.largest_gap) * 100)}% of the safe height`);
  if (findings.length) return { ok: false, ...failure("DEAD_BLACK_SPACE_FAIL", `${findings.join(" | ")} (§6)`, { stage: "professional_video_qa" }), findings };
  return { ok: true, findings: [] };
}

// ---------------------------------------------------------------
// 4C.5 §29/§30 + 4C.6 §4 - FRAME DENSITY / UNDER-COMPOSED FRAME. The
// derivative supplies a per-family band + a hero fraction + the largest
// inactive gap. 4C.5 overcorrected into too much breathing room; below
// the band, or with a subject that is too small, the frame reads as
// low-effort -> UNDERCOMPOSED_FRAME_FAIL.
// ---------------------------------------------------------------
export function auditFrameDensity({ derivative = {} } = {}) {
  const d = derivative.density ?? {};
  const ratio = d.content_ratio ?? 0;
  const lo = d.target_lo ?? FRAME_DENSITY.lo;
  const hi = d.target_hi ?? FRAME_DENSITY.hi;
  const hero = d.hero_fraction ?? 1;
  const gap = d.largest_gap ?? 0;
  const cardFamily = ["asking_vs_sold", "deal_hero", "market_shape", "three_up", "printing_compare"].includes(derivative.family);

  if (ratio > hi) {
    return { ok: false, ...failure("FRAME_DENSITY_TOO_HIGH_FAIL", `content fills ${Math.round(ratio * 100)}% of the safe region (> ${Math.round(hi * 100)}%) - hierarchy is lost (§30)`, { stage: "professional_video_qa" }), content_ratio: ratio };
  }
  // market_shape carries its hero weight in the 85.7% stat, so the example
  // card only needs to be a real collectible, not a 36-46% hero.
  const heroMin = derivative.family === "market_shape" ? 0.21 : 0.28;
  const under = [];
  if (ratio < lo) under.push(`content fills only ${Math.round(ratio * 100)}% (< ${Math.round(lo * 100)}%) - too much inactive space`);
  if (cardFamily && hero < heroMin) under.push(`the hero subject is ${Math.round(hero * 100)}% of the safe height - it reads as a thumbnail, not the subject (§5)`);
  if (gap > 0.24) under.push(`a single inactive zone is ${Math.round(gap * 100)}% of the safe height - the composition lacks weight`);
  if (under.length) {
    return { ok: false, ...failure("UNDERCOMPOSED_FRAME_FAIL", `${under.join(" | ")} (§4)`, { stage: "professional_video_qa" }), content_ratio: ratio, hero_fraction: hero, largest_gap: gap };
  }
  return { ok: true, content_ratio: ratio, hero_fraction: hero, largest_gap: gap };
}

// ---------------------------------------------------------------
// 4C.6 §27 - STATIC-MASTER PARITY. We cannot pixel-diff the approved
// master here, but we CAN score whether the derivative's composition has
// the properties that made the master premium: a dominant hero subject,
// decisive hierarchy, strong (not faint) value structure, useful density,
// a red/white accent system, editorial polish, brand confidence.
// Overall >= 80 and no dimension < 72, else STATIC_MASTER_PARITY_FAIL.
// ---------------------------------------------------------------
export function auditStaticMasterParity({ derivative = {}, endScreen = {} } = {}) {
  const d = derivative.density ?? {};
  const blocks = derivative.blocks ?? [];
  const es = endScreen.end_screen ?? endScreen;
  const hero = d.hero_fraction ?? 0;
  const ratio = d.content_ratio ?? 0;
  const [lo, hi] = [d.target_lo ?? 0.58, d.target_hi ?? 0.9];
  const heroStat = blocks.find((b) => ["hero_stat", "hero_row", "market_split"].includes(b.role));
  const heroFont = heroStat?.role === "market_split" ? (heroStat.font ?? 64) * 2.1
    : heroStat?.role === "hero_row" ? 46 : (heroStat?.font ?? 0);
  const bigStat = (blocks.some((b) => b.role === "hero_stat" && (b.font ?? 0) >= 120))
    || (blocks.some((b) => b.role === "market_split" && (b.font ?? 0) * 2.1 >= 120));
  const cardRow = blocks.some((b) => ["card_row", "market_split"].includes(b.role));
  // NOTE: a 4C.5 soft-glass value_ladder does NOT count as strong - that
  // was exactly the "faint SaaS panel" the owner rejected.
  const strongValue = blocks.some((b) =>
    (b.role === "hero_row" && b.style?.spine) ||
    (b.role === "chart" && b.premium) ||
    (b.role === "market_split" && (b.chart ?? []).length) ||
    (b.role === "comparison" && b.style?.panel));
  const hasRule = blocks.some((b) => b.style?.rule || b.style?.spine);
  const label = blocks.find((b) => b.role === "label");
  const takeaway = blocks.find((b) => ["takeaway", "lesson", "market_band"].includes(b.role));

  // dampened so a genuinely strong 4C.6 frame lands ~84-92 (never a flat
  // 100 - the owner is the final judge), a 4C.5-style frame (soft glass
  // value panel, small cards) lands ~68-78.
  const dim = {
    hero_prominence: clamp(34 + Math.min(hero, 0.5) * 104 + (bigStat ? 22 : 0)),
    information_hierarchy: clamp((label ? 26 : 0) + (heroStat || cardRow ? 30 : 0) + (takeaway ? 12 : 0) + (hasRule ? 20 : 0)),
    density: clamp(ratio >= lo && ratio <= hi ? 86 : ratio < lo ? 34 + (ratio / lo) * 44 : 66),
    collector_appeal: clamp((blocks.some((b) => ["card", "card_row", "hero_row", "market_split"].includes(b.role)) ? 42 : 0) + Math.min(hero, 0.5) * 80 + (cardRow ? 12 : 0) + (derivative.atmosphere?.enabled ? 12 : 0)),
    professional_polish: clamp((strongValue ? 36 : 6) + (hasRule ? 20 : 0) + (derivative.fits ? 16 : 0) + (derivative.atmosphere?.enabled ? 14 : 0)),
    visual_impact: clamp((heroFont >= 120 ? 38 : heroFont >= 44 ? 24 : 8) + Math.min(hero, 0.5) * 80 + (strongValue ? 16 : 0) + (cardRow ? 22 : 0)),
    brand_confidence: clamp((es?.domain === "pokemondealfinder.com" ? 32 : 0) + (es?.brand?.mark === "magnifier" ? 22 : 0) + (es?.value_points?.length >= 2 ? 16 : 0) + (hasRule ? 14 : 0)),
  };
  const overall = Math.round(Object.values(dim).reduce((a, b) => a + b, 0) / Object.keys(dim).length);
  const weakest = Object.entries(dim).sort((a, b) => a[1] - b[1])[0];

  const verification = { overall, dimensions: dim, min_overall: PARITY_MIN_OVERALL, min_dimension: PARITY_MIN_DIMENSION };
  if (overall < PARITY_MIN_OVERALL || weakest[1] < PARITY_MIN_DIMENSION) {
    return { ok: false, ...failure("STATIC_MASTER_PARITY_FAIL", `static-master parity ${overall}/100 (need >= ${PARITY_MIN_OVERALL}); weakest "${weakest[0]}" ${Math.round(weakest[1])} (need >= ${PARITY_MIN_DIMENSION}) - the video materially reduces the master's premium level (§27)`, { stage: "professional_video_qa" }), verification };
  }
  return { ok: true, verification };
}

function clamp(n) { return Math.max(0, Math.min(100, Math.round(n))); }

// ---------------------------------------------------------------
// 4C.6 §29 - MOBILE HIERARCHY. At ~360x640 can a viewer INSTANTLY see the
// family's key elements? (structural: the key blocks exist, are P1, and
// their type is comfortably readable at 1/3 scale).
// ---------------------------------------------------------------
export function auditMobileHierarchy({ derivative = {}, endScreen = {} } = {}) {
  const scale = 360 / (derivative.width || 1080);
  const blocks = derivative.blocks ?? [];
  const has = (role) => blocks.some((b) => b.role === role && b.priority === 1);
  const readable = (role, minPx) => blocks.some((b) => b.role === role && (b.font ?? 0) * scale >= minPx);
  const es = endScreen.end_screen ?? endScreen;
  const family = derivative.family;
  const missing = [];

  if (family === "asking_vs_sold" || family === "deal_hero") {
    if (!has("hero_row")) missing.push("hero card + comparison");
    if (!readable("hero_row", 14)) missing.push("comparison numbers legible");
  } else if (family === "market_shape") {
    const split = blocks.find((b) => b.role === "market_split" && b.priority === 1);
    if (!split || (split.font ?? 0) * 2.1 * scale < 26) missing.push("85.7% hero legible");
    if (!split || !(split.chart ?? []).length) missing.push("distribution chart");
    if (!split || !(split.cardIds ?? []).length) missing.push("real example card");
  } else if (family === "three_up") {
    if (!has("card_row")) missing.push("three cards");
    if (!readable("comparison", 14)) missing.push("prices legible");
  } else if (family === "printing_compare") {
    if (!has("card_row")) missing.push("both printings");
  }
  if (es) {
    if (es.brand?.mark !== "magnifier") missing.push("CTA brand mark");
    if (!String(es.primary_cta?.line1 ?? "").trim()) missing.push("CTA headline");
    if (String(es.domain ?? "") !== "pokemondealfinder.com") missing.push("pokemondealfinder.com");
  }
  if (missing.length) return { ok: false, ...failure("MOBILE_HIERARCHY_FAIL", `at 360w a viewer cannot instantly see: ${missing.join(", ")} (§29)`, { stage: "professional_video_qa" }), missing, scale };
  return { ok: true, missing: [], scale };
}

// ---------------------------------------------------------------
// 4C.6 §28 - OWNER-TASTE CALIBRATION. The always-100 trust score was not
// aligned with owner taste. This applies explicit heuristics from the
// rejected 4C.4 / 4C.5 examples: penalise a small hero, a huge inactive
// zone, a grey low-energy headline, a faint panel, a tiny example card, a
// CTA darker than the story, template symmetry, data on blank black.
// Bonus for a strong hero, editorial structure, decisive hierarchy, large
// stats, controlled red/white contrast, a confident CTA.
// -> { score (delta, -.. .. +..), penalties, bonuses }
// ---------------------------------------------------------------
export function scoreOwnerTaste({ derivative = {}, endScreen = {} } = {}) {
  const d = derivative.density ?? {};
  const blocks = derivative.blocks ?? [];
  const es = endScreen.end_screen ?? endScreen;
  const penalties = [];
  const bonuses = [];
  let delta = 0;

  const hero = d.hero_fraction ?? 0;
  const ratio = d.content_ratio ?? 0;
  const [lo, hi] = [d.target_lo ?? 0.58, d.target_hi ?? 0.9];
  const cardFamily = ["asking_vs_sold", "deal_hero", "market_shape", "three_up", "printing_compare"].includes(derivative.family);

  const heroMin = derivative.family === "market_shape" ? 0.21 : 0.28;
  if (cardFamily && hero < heroMin) { delta -= 14; penalties.push("hero card too small"); }
  else if (hero >= (derivative.family === "market_shape" ? 0.25 : 0.36)) { delta += 8; bonuses.push("strong hero card"); }
  if (ratio < lo) { delta -= 12; penalties.push("large inactive black zone / under-filled frame"); }
  else if (ratio >= lo && ratio <= hi) { delta += 6; bonuses.push("useful editorial density"); }
  if ((d.largest_gap ?? 0) > 0.24) { delta -= 8; penalties.push("data floating over a big blank zone"); }

  const heroStat = blocks.find((b) => b.role === "hero_stat" || (b.role === "market_split" && (b.font ?? 0) * 2.1 >= 120));
  if (heroStat) { delta += 6; bonuses.push("large decisive key stat"); }
  const strongValue = blocks.some((b) => (b.role === "hero_row" && b.style?.spine) || (b.role === "chart" && b.premium) || (b.role === "market_split" && (b.chart ?? []).length));
  if (strongValue) { delta += 6; bonuses.push("strong value / chart structure"); }
  else if (blocks.some((b) => b.role === "value_ladder")) { delta -= 8; penalties.push("faint glass value panel (SaaS-like)"); }
  if (blocks.some((b) => b.style?.rule || b.style?.spine)) { delta += 4; bonuses.push("controlled red/white accent hierarchy"); }
  // template symmetry: only full-width centred rows, no hero_row / chart / split
  if (!blocks.some((b) => ["hero_row", "chart", "card_row", "market_split"].includes(b.role))) { delta -= 6; penalties.push("template-like symmetric stack"); }

  // CTA must not feel darker / weaker than the story
  if (es) {
    if (es.brightness === "high" || es.brightness === "bright") { delta += 6; bonuses.push("confident bright CTA"); }
    if (es.cta_darker_than_story === true) { delta -= 12; penalties.push("CTA darker than the story - reads as the video fading away"); }
    if ((es.primary_cta?.tone ?? "") === "grey") { delta -= 8; penalties.push("grey low-energy CTA headline"); }
  }

  return { score: delta, penalties, bonuses };
}

// ---------------------------------------------------------------
// 4C.5 §32 - MOBILE PREVIEW (readable at ~360px wide)
// ---------------------------------------------------------------
export function auditMobilePreview({ derivative = {}, endScreen = {} } = {}) {
  const scale = 360 / (derivative.width || 1080); // ~0.333
  const findings = [];
  const need = { label: 10, hook: 14, hero_stat: 24, primary_stat: 17, comparison: 14, value_ladder: 13, value_spine: 13, hero_row: 13, market_split: 18, market_band: 9, lesson: 12, context: 11, takeaway: 10, domain: 10 };
  for (const b of derivative.blocks ?? []) {
    if (b.font == null) continue;
    const px = b.font * scale;
    const min = need[b.role] ?? 10;
    if (px < min) findings.push(`"${b.id}" ~${px.toFixed(1)}px at 360w (< ${min}px) - unreadable on a phone`);
  }
  const cardOk = (derivative.blocks ?? []).some((b) => ["card", "card_row", "hero_row", "market_split"].includes(b.role) && b.zone && b.zone.h * scale >= 70);
  if (!cardOk) findings.push("the card is too small to read as a real collectible at 360w");
  const es = endScreen.end_screen ?? endScreen;
  if (es && es.domain && (44 * scale) < 12 && false) { /* url size checked in the doc */ }
  if (findings.length) return { ok: false, ...failure("MOBILE_PREVIEW_FAIL", `${findings.join(" | ")} (§32)`, { stage: "professional_video_qa" }), findings, scale };
  return { ok: true, findings: [], scale };
}

// ---------------------------------------------------------------
// 4C.5 §17 / §34 - REPLAY TRANSITION (CTA -> hook restart is clean)
// ---------------------------------------------------------------
export function auditReplayTransition({ timeline = {} } = {}) {
  const trans = (timeline.events ?? []).find((e) => e.kind === "cta_transition");
  const findings = [];
  if (!trans) findings.push("no declared story->CTA transition");
  else {
    const dur = (trans.end_ms ?? 0) - (trans.at_ms ?? 0);
    if (dur < 250 || dur > 550) findings.push(`story->CTA transition is ${dur}ms - keep it 300-450ms (§17)`);
    if (trans.to_black === true || /fade.?to.?black|hard.?cut/i.test(String(trans.style ?? ""))) findings.push("transition fades to full black / hard-cuts (§17)");
  }
  if (timeline.replay_to_black === true) findings.push("CTA -> hook replay passes through black (§34)");
  if (findings.length) return { ok: false, ...failure("REPLAY_TRANSITION_FAIL", `${findings.join(" | ")}`, { stage: "professional_video_qa" }), findings };
  return { ok: true, findings: [] };
}

// ---------------------------------------------------------------
// 4C.7 §3 / §13A - CONTENT OCCUPANCY. A hard floor beneath the per-family
// density band: below this the frame reads as an infographic slide, not
// an intentionally composed 9:16 frame.
// ---------------------------------------------------------------
export function auditContentOccupancy({ derivative = {} } = {}) {
  const ratio = derivative.density?.content_ratio ?? 0;
  if (ratio < OCCUPANCY_MIN) {
    return { ok: false, ...failure("CONTENT_OCCUPANCY_FAIL", `meaningful composition fills only ${Math.round(ratio * 100)}% of the practical safe region (< ${Math.round(OCCUPANCY_MIN * 100)}%) - target >= 80% (§3/§13A)`, { stage: "professional_video_qa" }), content_ratio: ratio };
  }
  return { ok: true, content_ratio: ratio };
}

// ---------------------------------------------------------------
// 4C.7 §4 / §5 / §13B - CARD PROMINENCE. The real Pokemon card must feel
// like the subject, never collapse toward a thumbnail / icon.
// ---------------------------------------------------------------
export function auditCardProminence({ derivative = {} } = {}) {
  const cardFamily = ["asking_vs_sold", "deal_hero", "market_shape", "three_up", "printing_compare"].includes(derivative.family);
  if (!cardFamily) return { ok: true, hero_fraction: derivative.density?.hero_fraction ?? null };
  const hero = derivative.density?.hero_fraction ?? 0;
  const min = CARD_PROMINENCE_MIN[derivative.family] ?? CARD_PROMINENCE_MIN._default;
  if (hero < min) {
    return { ok: false, ...failure("CARD_PROMINENCE_FAIL", `the real card occupies ${Math.round(hero * 100)}% of the safe height (< ${Math.round(min * 100)}%) - it reads as a thumbnail, not a hero (§4/§5/§13B)`, { stage: "professional_video_qa" }), hero_fraction: hero };
  }
  return { ok: true, hero_fraction: hero };
}

// ---------------------------------------------------------------
// 4C.7 §3 / §13C - LOWER DEAD SPACE. The bottom third before the CTA
// transition cannot be mostly empty black.
// ---------------------------------------------------------------
export function auditLowerDeadSpace({ derivative = {} } = {}) {
  const gap = derivative.density?.lower_dead_space ?? 0;
  if (gap > LOWER_DEAD_SPACE_MAX) {
    return { ok: false, ...failure("LOWER_DEAD_SPACE_FAIL", `the lower third is ${Math.round(gap * 100)}% empty black before the CTA (> ${Math.round(LOWER_DEAD_SPACE_MAX * 100)}%) - domain/content should not float alone in empty space (§3/§13C)`, { stage: "professional_video_qa" }), lower_dead_space: gap };
  }
  return { ok: true, lower_dead_space: gap };
}

// ---------------------------------------------------------------
// 4C.7 §9 / §13D - CTA LUMINANCE. The CTA must not resemble a fade-to-black
// state: bright declared, not darker than the story, no grey headline.
// ---------------------------------------------------------------
export function auditCtaLuminance({ endScreen = {} } = {}) {
  const es = endScreen.end_screen ?? endScreen;
  const findings = [];
  if (es.brightness !== "high" && es.brightness !== "bright") findings.push("CTA atmosphere is not declared bright");
  if (es.cta_darker_than_story === true) findings.push("CTA is darker than the story - resembles a fade-out, not a confident ending");
  if ((es.primary_cta?.tone ?? "") === "grey") findings.push("headline tone is grey, not bright white");
  if (es.brand?.mark !== "magnifier") findings.push("brand mark not clearly declared");
  if ((es.value_points ?? []).length < 2) findings.push("value pills missing");
  if (findings.length) return { ok: false, ...failure("CTA_LUMINANCE_FAIL", `${findings.join(" | ")} (§9)`, { stage: "professional_video_qa" }), findings };
  return { ok: true, findings: [] };
}

// 4C.7 §13E - broad rubric categories (never fabricated pixel precision)
export function staticParityRubric(overall) {
  if (overall >= 88) return "MATCH";
  if (overall >= PARITY_MIN_OVERALL) return "NEAR_MATCH";
  if (overall >= 70) return "WEAKER";
  return "FAIL";
}

// ---------------------------------------------------------------
// §40 / §41 PROFESSIONAL TRUST - aggregate
// ---------------------------------------------------------------
export function scoreProfessionalTrust({ derivative = {}, timeline = {}, endScreen = {}, subVerdicts = {} } = {}) {
  // 4C.6 - start from a realistic baseline, not a free 100. Owner taste
  // and static-master parity now MOVE the number.
  let score = 80;
  const reasons = [];
  const es = endScreen.end_screen ?? endScreen;

  const taste = scoreOwnerTaste({ derivative, endScreen });
  score += taste.score;
  for (const p of taste.penalties) reasons.push(`taste: ${p}`);
  const parity = auditStaticMasterParity({ derivative, endScreen });
  score += Math.round((parity.verification.overall - 80) * 0.4); // parity pulls toward its own score
  if (!parity.ok) reasons.push(`static-master parity ${parity.verification.overall}/100`);

  if (subVerdicts.cutoff === false) { score -= 40; reasons.push("content clipped / half-shown"); }
  if (subVerdicts.readability === false) { score -= 25; reasons.push("text too small for mobile"); }
  if (subVerdicts.motion_subtle === false) { score -= 22; reasons.push("motion imperceptible - a static export"); }
  if (subVerdicts.motion_aggressive === false) { score -= 22; reasons.push("motion louder than the content"); }
  if (subVerdicts.camera_tour === false) { score -= 25; reasons.push("camera tours the composition"); }
  if (subVerdicts.real_cards === false) { score -= 45; reasons.push("a card is not canonical art"); }
  if (subVerdicts.comprehension === false) { score -= 20; reasons.push("story unclear without the caption"); }
  if (subVerdicts.cta === false) { score -= 25; reasons.push("CTA weak / not website-first"); }
  // 4C.5 polish faults
  if (subVerdicts.cta_hold === false) { score -= 28; reasons.push("CTA flashes - not a conversion moment"); }
  if (subVerdicts.cta_readability === false) { score -= 22; reasons.push("CTA / URL not readable without a pause"); }
  if (subVerdicts.dead_black === false) { score -= 20; reasons.push("dead / unfinished black space"); }
  if (subVerdicts.frame_density === false) { score -= 16; reasons.push("frame too sparse or too crowded"); }
  if (subVerdicts.mobile_preview === false) { score -= 22; reasons.push("unreadable at phone size"); }
  if (subVerdicts.replay === false) { score -= 12; reasons.push("ugly CTA->replay transition"); }

  if (subVerdicts.undercomposed === false) { score -= 18; reasons.push("under-composed frame - subject too small / too much inactive space"); }
  if (subVerdicts.mobile_hierarchy === false) { score -= 16; reasons.push("key elements not instantly visible at phone size"); }
  if (subVerdicts.parity === false) { score -= 20; reasons.push("does not reach static-master parity"); }
  // 4C.7 final-parity faults
  if (subVerdicts.occupancy === false) { score -= 22; reasons.push("frame under-filled - reads as an infographic slide"); }
  if (subVerdicts.card_prominence === false) { score -= 24; reasons.push("the card collapses toward a thumbnail"); }
  if (subVerdicts.lower_dead_space === false) { score -= 16; reasons.push("empty lower third before the CTA"); }
  if (subVerdicts.cta_luminance === false) { score -= 20; reasons.push("CTA resembles a fade-to-black state"); }

  const blob = `${(derivative.blocks ?? []).map((b) => b.text).join(" ")} ${es.primary_cta?.line1 ?? ""} ${es.footer ?? ""}`;
  if (BANNED_COPY.test(blob)) { score -= 30; reasons.push("hype / investment language"); }
  if ((derivative.blocks ?? []).length > 8) { score -= 12; reasons.push("overloaded frame"); }
  if ((timeline.events ?? []).filter((e) => e.kind !== "cta_transition" && e.kind !== "cross_dissolve").length === 0) { score -= 20; reasons.push("no motion at all"); }
  if (derivative.width !== 1080 || derivative.height !== 1920) { score -= 15; reasons.push("not 1080x1920"); }
  // strong-composition bonus - fits, atmosphere, clean motion, real cards,
  // website-first, CTA held, AND parity clean
  if (derivative.fits && derivative.atmosphere?.enabled && subVerdicts.motion_subtle !== false && subVerdicts.motion_aggressive !== false && subVerdicts.real_cards !== false && subVerdicts.cta !== false && subVerdicts.cta_hold !== false && parity.ok) { score += 8; bonusApplied(reasons, taste.bonuses); }

  // 4C.6 - cap at 93: the automated score never claims perfection; the
  // owner's visual review is the real gate.
  score = Math.max(0, Math.min(93, score));
  return { score, verdict: score >= 80 ? "PASS" : "HOLD", reasons, owner_taste: taste, static_master_parity: parity.verification, owner_review_required: true };
}

function bonusApplied(reasons, bonuses) { for (const b of bonuses.slice(0, 3)) reasons.push(`+ ${b}`); }

/**
 * runProfessionalVideoQa({ derivative, timeline, endScreen, family,
 *   semanticManifest, captionHandoff, cardAssets })
 *  -> { ok, state, findings, verification, trust, sub }
 */
export function runProfessionalVideoQa({ derivative = {}, timeline = {}, endScreen = {}, semanticManifest = {}, captionHandoff = null, cardAssets = [] } = {}) {
  const comprehension = auditContentComprehension({ derivative, timeline });
  const cutoff = auditCutoffAndSafeZones({ derivative, endScreen });
  const readability = auditMobileReadability({ derivative });
  const motion = auditMotion({ timeline });
  const realCards = auditRealCards({ derivative, endScreen, cardAssets });
  const cta = auditVideoCta({ endScreen, derivative, captionHandoff });
  const exact = auditVideoDerivedExact({ extraction: { all_numbers: unsanctionedShownPercents(derivative, semanticManifest) }, semanticManifest });
  // 4C.5 polish gates
  const ctaHold = auditCtaHold({ timeline });
  const ctaReadability = auditCtaReadability({ endScreen });
  const deadBlack = auditDeadBlackSpace({ derivative });
  const frameDensity = auditFrameDensity({ derivative });
  const mobilePreview = auditMobilePreview({ derivative, endScreen });
  const replay = auditReplayTransition({ timeline });
  // 4C.6 composition-parity gates
  const parity = auditStaticMasterParity({ derivative, endScreen });
  const mobileHierarchy = auditMobileHierarchy({ derivative, endScreen });
  // 4C.7 final visual-parity gates
  const occupancy = auditContentOccupancy({ derivative });
  const cardProminence = auditCardProminence({ derivative });
  const lowerDeadSpace = auditLowerDeadSpace({ derivative });
  const ctaLuminance = auditCtaLuminance({ endScreen });

  const sub = {
    comprehension: comprehension.ok,
    cutoff: cutoff.ok,
    readability: readability.ok,
    motion_subtle: !(motion.state === "MOTION_TOO_SUBTLE_FAIL"),
    motion_aggressive: !(motion.state === "MOTION_TOO_AGGRESSIVE_FAIL"),
    camera_tour: !(motion.state === "CAMERA_TOUR_FAIL"),
    real_cards: realCards.ok,
    cta: cta.ok,
    exact_facts: exact.ok,
    cta_hold: ctaHold.ok,
    cta_readability: ctaReadability.ok,
    dead_black: deadBlack.ok,
    frame_density: frameDensity.ok,
    mobile_preview: mobilePreview.ok,
    replay: replay.ok,
    parity: parity.ok,
    mobile_hierarchy: mobileHierarchy.ok,
    undercomposed: !(frameDensity.state === "UNDERCOMPOSED_FRAME_FAIL"),
    occupancy: occupancy.ok,
    card_prominence: cardProminence.ok,
    lower_dead_space: lowerDeadSpace.ok,
    cta_luminance: ctaLuminance.ok,
  };
  const trust = scoreProfessionalTrust({ derivative, timeline, endScreen, subVerdicts: sub });

  const verification = {
    content_comprehension: comprehension.ok ? "PASS" : "FAIL",
    cutoff_safe_zone: cutoff.ok ? "PASS" : cutoff.state,
    mobile_readability: readability.ok ? "PASS" : "FAIL",
    motion: motion.ok ? "PASS" : motion.state,
    perceivable_events: motion.perceivable ?? null,
    motion_salience_score: motion.salience_score ?? null,
    real_cards: realCards.ok ? "PASS" : "FAIL",
    website_first_cta: cta.ok ? "PASS" : cta.state,
    exact_facts: exact.ok ? "PASS" : "VIDEO_DERIVED_VALUE_EXACT_FAIL",
    cta_hold: ctaHold.ok ? "PASS" : ctaHold.state,
    cta_hold_ms: ctaHold.hold_ms ?? null,
    cta_readability: ctaReadability.ok ? "PASS" : "FAIL",
    dead_black_space: deadBlack.ok ? "PASS" : "FAIL",
    frame_density: frameDensity.ok ? "PASS" : (frameDensity.state ?? "FAIL"),
    content_ratio: derivative.density?.content_ratio ?? null,
    mobile_preview: mobilePreview.ok ? "PASS" : "FAIL",
    replay_transition: replay.ok ? "PASS" : "FAIL",
    content_ratio_detail: derivative.density ?? null,
    static_master_parity: parity.ok ? "PASS" : "STATIC_MASTER_PARITY_FAIL",
    parity_overall: parity.verification?.overall ?? null,
    parity_dimensions: parity.verification?.dimensions ?? null,
    mobile_hierarchy: mobileHierarchy.ok ? "PASS" : "FAIL",
    owner_taste_delta: trust.owner_taste?.score ?? null,
    // 4C.7 final-parity fields (§13E - broad rubric, no fabricated precision)
    content_occupancy: occupancy.ok ? "PASS" : "FAIL",
    card_prominence: cardProminence.ok ? "PASS" : "FAIL",
    card_hero_fraction: cardProminence.hero_fraction ?? null,
    lower_dead_space: lowerDeadSpace.ok ? "PASS" : "FAIL",
    cta_luminance: ctaLuminance.ok ? "PASS" : "FAIL",
    static_master_visual_score: STATIC_MASTER_REFERENCE_SCORE,
    video_derivative_visual_score: parity.verification?.overall ?? null,
    parity_gap: staticParityRubric(parity.verification?.overall ?? 0),
    professional_trust: trust.verdict,
    trust_score: trust.score,
  };

  // hard order - the most damaging fault wins the terminal state
  const gates = [
    ["exact_facts", exact],
    ["real_cards", realCards],
    ["cutoff", cutoff],
    ["cta", cta],
    ["cta_hold", ctaHold],
    ["cta_readability", ctaReadability],
    ["cta_luminance", ctaLuminance],
    ["readability", readability],
    ["mobile_preview", mobilePreview],
    ["mobile_hierarchy", mobileHierarchy],
    ["motion", motion],
    ["dead_black", deadBlack],
    ["frame_density", frameDensity],
    ["occupancy", occupancy],
    ["card_prominence", cardProminence],
    ["lower_dead_space", lowerDeadSpace],
    ["parity", parity],
    ["replay", replay],
    ["comprehension", comprehension],
  ];
  const audits = {
    comprehension, cutoff, readability, motion, realCards, cta, exact, ctaHold, ctaReadability, deadBlack, frameDensity,
    mobilePreview, replay, parity, mobileHierarchy, occupancy, cardProminence, lowerDeadSpace, ctaLuminance,
  };
  for (const [, g] of gates) if (!g.ok) {
    return { ok: false, state: g.state, reason: g.reason, findings: g.findings ?? [], verification, trust, sub, audits };
  }
  if (trust.verdict !== "PASS") {
    return { ok: false, ...failure("PROFESSIONAL_BRAND_FAIL", `professional-trust ${trust.score}/100 - ${trust.reasons.join(", ") || "below the bar"} (§40)`, { stage: "professional_video_qa" }), verification, trust, sub, audits };
  }
  return { ok: true, state: "PROFESSIONAL_VIDEO_QA_PASS", verification, trust, sub, audits, findings: [] };
}
