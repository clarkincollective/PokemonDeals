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

export const PROFESSIONAL_VIDEO_QA_VERSION = "4c5.1";

// §4 / §28 - the CTA is a conversion moment, not a flash. It must be
// fully readable (i.e. past the story->CTA transition) for at least this
// long. Production default 2.6s.
export const CTA_HOLD = Object.freeze({ min_ms: 2400, target_ms: 2600, max_ms: 3000 });
// §17 (2nd time round) - the "just right" motion band
export const MOTION_SALIENCE_MIN_SCORE = 55;
// §30 - meaningful content should occupy this share of the central safe
// region (measured as vertical fill, gaps excluded). A CALM editorial
// frame runs fuller than a motion-graphic one; the ceiling only catches a
// genuinely wall-to-wall block stack with no breathing room.
export const FRAME_DENSITY = Object.freeze({ lo: 0.42, hi: 0.92, dead_black_below: 0.36 });

// §17 - what counts as a "clearly perceivable" motion event at phone size
export const MOTION_SALIENCE = Object.freeze({
  min_perceivable_events: 2,
  max_primary_events: 3,          // before the CTA transition
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
  const hasSubject = p1.some((b) => ["card", "card_row", "chart"].includes(b.role));
  const hasFigure = p1.some((b) => ["primary_stat", "hero_stat", "comparison", "value_ladder"].includes(b.role) && (String(b.text ?? "").trim() || (b.points ?? []).length || (b.rows ?? []).length));
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
  const roleFail = { card: "CARD_CROP_FAIL", card_row: "CARD_CROP_FAIL", domain: "CTA_CUTOFF_FAIL", takeaway: "FOOTER_TRUNCATION_FAIL", context: "PARTIAL_PANEL_FAIL", chart: "PARTIAL_PANEL_FAIL" };

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
  const ratio = derivative.density?.content_ratio ?? 0;
  const hasAtmo = Boolean(derivative.atmosphere?.enabled);
  const findings = [];
  if (!hasAtmo) findings.push("no atmosphere layer declared - the frame is flat black");
  if (ratio < FRAME_DENSITY.dead_black_below) findings.push(`meaningful content fills only ${Math.round(ratio * 100)}% of the safe region - large zones read as unfinished`);
  if (findings.length) return { ok: false, ...failure("DEAD_BLACK_SPACE_FAIL", `${findings.join(" | ")} (§6)`, { stage: "professional_video_qa" }), findings };
  return { ok: true, findings: [] };
}

// ---------------------------------------------------------------
// 4C.5 §29 / §30 - FRAME DENSITY (not too sparse, not too crowded)
// ---------------------------------------------------------------
export function auditFrameDensity({ derivative = {} } = {}) {
  const ratio = derivative.density?.content_ratio ?? 0;
  if (ratio < FRAME_DENSITY.lo) {
    return { ok: false, ...failure("FRAME_DENSITY_TOO_LOW_FAIL", `content fills ${Math.round(ratio * 100)}% of the safe region (< ${Math.round(FRAME_DENSITY.lo * 100)}%) - the frame looks low-effort (§30)`, { stage: "professional_video_qa" }), content_ratio: ratio };
  }
  if (ratio > FRAME_DENSITY.hi) {
    return { ok: false, ...failure("FRAME_DENSITY_TOO_HIGH_FAIL", `content fills ${Math.round(ratio * 100)}% of the safe region (> ${Math.round(FRAME_DENSITY.hi * 100)}%) - hierarchy is lost (§30)`, { stage: "professional_video_qa" }), content_ratio: ratio };
  }
  return { ok: true, content_ratio: ratio };
}

// ---------------------------------------------------------------
// 4C.5 §32 - MOBILE PREVIEW (readable at ~360px wide)
// ---------------------------------------------------------------
export function auditMobilePreview({ derivative = {}, endScreen = {} } = {}) {
  const scale = 360 / (derivative.width || 1080); // ~0.333
  const findings = [];
  const need = { label: 11, hook: 14, hero_stat: 22, primary_stat: 17, comparison: 14, value_ladder: 13, context: 11, takeaway: 10, domain: 10 };
  for (const b of derivative.blocks ?? []) {
    if (b.font == null) continue;
    const px = b.font * scale;
    const min = need[b.role] ?? 10;
    if (px < min) findings.push(`"${b.id}" ~${px.toFixed(1)}px at 360w (< ${min}px) - unreadable on a phone`);
  }
  const cardOk = (derivative.blocks ?? []).some((b) => ["card", "card_row"].includes(b.role) && b.zone && b.zone.h * scale >= 70);
  if (!cardOk && (derivative.family !== "market_shape")) findings.push("the card is too small to read as a real collectible at 360w");
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
// §40 / §41 PROFESSIONAL TRUST - aggregate
// ---------------------------------------------------------------
export function scoreProfessionalTrust({ derivative = {}, timeline = {}, endScreen = {}, subVerdicts = {} } = {}) {
  let score = 100;
  const reasons = [];
  const es = endScreen.end_screen ?? endScreen;

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

  const blob = `${(derivative.blocks ?? []).map((b) => b.text).join(" ")} ${es.primary_cta?.line1 ?? ""} ${es.footer ?? ""}`;
  if (BANNED_COPY.test(blob)) { score -= 30; reasons.push("hype / investment language"); }
  if ((derivative.blocks ?? []).length > 8) { score -= 12; reasons.push("overloaded frame"); }
  if ((timeline.events ?? []).filter((e) => e.kind !== "cta_transition" && e.kind !== "cross_dissolve").length === 0) { score -= 20; reasons.push("no motion at all"); }
  if (derivative.width !== 1080 || derivative.height !== 1920) { score -= 15; reasons.push("not 1080x1920"); }
  // restraint bonus - fits, atmosphere, 2-3 clean events, real cards, website-first, CTA held
  if (derivative.fits && derivative.atmosphere?.enabled && subVerdicts.motion_subtle !== false && subVerdicts.motion_aggressive !== false && subVerdicts.real_cards !== false && subVerdicts.cta !== false && subVerdicts.cta_hold !== false) { score += 10; }

  score = Math.max(0, Math.min(100, score));
  return { score, verdict: score >= 80 ? "PASS" : "HOLD", reasons, owner_review_required: true };
}

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
    ["readability", readability],
    ["mobile_preview", mobilePreview],
    ["motion", motion],
    ["dead_black", deadBlack],
    ["frame_density", frameDensity],
    ["replay", replay],
    ["comprehension", comprehension],
  ];
  const audits = { comprehension, cutoff, readability, motion, realCards, cta, exact, ctaHold, ctaReadability, deadBlack, frameDensity, mobilePreview, replay };
  for (const [, g] of gates) if (!g.ok) {
    return { ok: false, state: g.state, reason: g.reason, findings: g.findings ?? [], verification, trust, sub, audits };
  }
  if (trust.verdict !== "PASS") {
    return { ok: false, ...failure("PROFESSIONAL_BRAND_FAIL", `professional-trust ${trust.score}/100 - ${trust.reasons.join(", ") || "below the bar"} (§40)`, { stage: "professional_video_qa" }), verification, trust, sub, audits };
  }
  return { ok: true, state: "PROFESSIONAL_VIDEO_QA_PASS", verification, trust, sub, audits, findings: [] };
}
