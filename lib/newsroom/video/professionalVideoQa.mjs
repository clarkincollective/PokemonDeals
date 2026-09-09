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

export const PROFESSIONAL_VIDEO_QA_VERSION = "4c4.1";

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
  const hasHook = p1.some((b) => ["hook", "hero_stat"].includes(b.role) && String(b.text ?? "").trim());
  const hasSubject = p1.some((b) => ["card", "card_row", "chart"].includes(b.role));
  const hasFigure = p1.some((b) => ["primary_stat", "hero_stat", "comparison"].includes(b.role) && (String(b.text ?? "").trim() || (b.points ?? []).length));
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
  if (perceivable.length < C.min_perceivable_events) {
    findings.push({ code: "MOTION_TOO_SUBTLE_FAIL", detail: `${perceivable.length} clearly-perceivable motion event(s) - need >= ${C.min_perceivable_events} plus the CTA transition (§17); the 4C.3 loop read as a static JPEG` });
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

  if (!findings.length) return { ok: true, findings: [], perceivable: perceivable.length, primary };
  const ORDER = ["CAMERA_TOUR_FAIL", "MOTION_TOO_AGGRESSIVE_FAIL", "MOTION_TOO_SUBTLE_FAIL"];
  const state = ORDER.find((s) => findings.some((f) => f.code === s)) ?? findings[0].code;
  return { ok: false, ...failure(state, findings.map((f) => f.detail).join(" | ").slice(0, 400), { stage: "professional_video_qa", detail: { findings } }), findings, perceivable: perceivable.length, primary };
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

  const blob = `${(derivative.blocks ?? []).map((b) => b.text).join(" ")} ${es.primary_cta?.line1 ?? ""} ${es.footer ?? ""}`;
  if (BANNED_COPY.test(blob)) { score -= 30; reasons.push("hype / investment language"); }
  if ((derivative.blocks ?? []).length > 7) { score -= 12; reasons.push("overloaded frame"); }
  if ((timeline.events ?? []).filter((e) => e.kind !== "cta_transition" && e.kind !== "cross_dissolve").length === 0) { score -= 20; reasons.push("no motion at all"); }
  if (derivative.width !== 1080 || derivative.height !== 1920) { score -= 15; reasons.push("not 1080x1920"); }
  // restraint bonus - fits, 2-3 clean events, real cards, website-first
  if (derivative.fits && subVerdicts.motion_subtle !== false && subVerdicts.motion_aggressive !== false && subVerdicts.real_cards !== false && subVerdicts.cta !== false) { score += 8; }

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
  };
  const trust = scoreProfessionalTrust({ derivative, timeline, endScreen, subVerdicts: sub });

  const verification = {
    content_comprehension: comprehension.ok ? "PASS" : "FAIL",
    cutoff_safe_zone: cutoff.ok ? "PASS" : cutoff.state,
    mobile_readability: readability.ok ? "PASS" : "FAIL",
    motion: motion.ok ? "PASS" : motion.state,
    perceivable_events: motion.perceivable ?? null,
    real_cards: realCards.ok ? "PASS" : "FAIL",
    website_first_cta: cta.ok ? "PASS" : cta.state,
    exact_facts: exact.ok ? "PASS" : "VIDEO_DERIVED_VALUE_EXACT_FAIL",
    professional_trust: trust.verdict,
    trust_score: trust.score,
  };

  // hard order - the most damaging fault wins the terminal state
  const gates = [
    ["exact_facts", exact],
    ["real_cards", realCards],
    ["cutoff", cutoff],
    ["cta", cta],
    ["readability", readability],
    ["motion", motion],
    ["comprehension", comprehension],
  ];
  for (const [, g] of gates) if (!g.ok) {
    return { ok: false, state: g.state, reason: g.reason, findings: g.findings ?? [], verification, trust, sub };
  }
  if (trust.verdict !== "PASS") {
    return { ok: false, ...failure("PROFESSIONAL_BRAND_FAIL", `professional-trust ${trust.score}/100 - ${trust.reasons.join(", ") || "below the bar"} (§40)`, { stage: "professional_video_qa" }), verification, trust, sub };
  }
  return { ok: true, state: "PROFESSIONAL_VIDEO_QA_PASS", verification, trust, sub, findings: [] };
}
