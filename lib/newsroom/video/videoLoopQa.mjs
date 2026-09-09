// Phase SOCIAL-CREATIVE-4C.3 - 5-SECOND PREMIUM LOOP QUALITY GATE
// (§16, §17, §26, §27).
//
// SIMPLE + POLISHED + TRUSTWORTHY > COMPLEX + CHEAP-LOOKING.
//
// The approved static master is already premium and fact-clean. This gate
// checks that the 5-second loop ENHANCES it and never damages it:
//   * no camera tour of the poster (§16) -> CAMERA_TOUR_FAIL
//   * seamless replay - the 0.0s and 5.0s states match (§27) -> LOOP_SEAM_FAIL
//   * <= 3 motion events, all inside the permitted range (§7, §9)
//   * no duplicate / new large text over the master's typography (§15) -> DUPLICATE_TEXT_FAIL
//   * "would a serious collectibles company post this?" (§17) -> BRAND_TRUST_HOLD
//
// Pure logic. Reuses auditVideoDerivedExact for the §19 exact-fact lock.

import { failure } from "../editorial/failureStates.mjs";
export { auditVideoDerivedExact } from "./videoMasterQa.mjs";

export const VIDEO_LOOP_QA_VERSION = "4c3.1";

// §7/§9 - the hard motion caps
export const LOOP_MOTION_CAPS = Object.freeze({
  max_motion_events: 3,
  max_push_pct: 2.5,          // slow push-in
  max_parallax_pct: 2.0,
  max_stat_scale: 1.04,       // stat emphasis pulse
  max_total_translate_pct: 4, // any element's peak offset, as % of the shorter frame edge
  min_duration_ms: 4500,
  max_duration_ms: 6000,
  default_duration_ms: 5000,
  seam_epsilon_scale: 0.004,  // 0.4%
  seam_epsilon_opacity: 0.06,
  min_master_visible_ratio: 0.9, // the whole creative visible for >=90% of the loop
});

const near = (a, b, eps) => Math.abs(Number(a) - Number(b)) <= eps;

/**
 * auditPremiumLoop({ loopPlan, layers, master })
 *  -> { ok, findings, verification } | { ok:false, ...failure(state) }
 * loopPlan = { duration_ms, motion_events:[{ id, kind, target, at_ms, end_ms,
 *   push_pct?, parallax_pct?, scale?, translate_pct?, text_overlay? }],
 *   seam:{ start_state, end_state }, camera:{ frames_whole_creative:bool } }
 */
export function auditPremiumLoop({ loopPlan = {}, layers = {}, master = {} } = {}) {
  const C = LOOP_MOTION_CAPS;
  const findings = [];
  const ev = loopPlan.motion_events ?? [];
  const dur = loopPlan.duration_ms ?? 0;

  // ---- §4 duration ----
  if (dur < C.min_duration_ms || dur > C.max_duration_ms) {
    findings.push({ code: "BRAND_TRUST_HOLD", detail: `duration ${dur}ms outside ${C.min_duration_ms}-${C.max_duration_ms}ms` });
  }

  // ---- §7 motion count ----
  if (ev.length > C.max_motion_events) {
    findings.push({ code: "BRAND_TRUST_HOLD", detail: `${ev.length} motion events - max ${C.max_motion_events} (restraint = premium)` });
  }
  if (!ev.length) findings.push({ code: "BRAND_TRUST_HOLD", detail: "no motion - a static export, not a loop" });

  // ---- §16 camera tour ----
  const tourish = ev.filter((e) => (e.target && e.target !== "full" && e.target !== "whole" && (e.kind === "push" || e.kind === "pan" || e.kind === "camera")) || e.kind === "pan" || e.kind === "crop");
  if (tourish.length || loopPlan.camera?.frames_whole_creative === false) {
    findings.push({ code: "CAMERA_TOUR_FAIL", detail: `the loop pans / frames individual regions (${tourish.map((e) => e.id).join(", ") || "camera.frames_whole_creative=false"}) - keep the whole creative visible` });
  }

  // ---- §9 motion caps ----
  for (const e of ev) {
    if (e.push_pct != null && e.push_pct > C.max_push_pct) findings.push({ code: "BRAND_TRUST_HOLD", detail: `${e.id}: push ${e.push_pct}% > ${C.max_push_pct}%` });
    if (e.parallax_pct != null && e.parallax_pct > C.max_parallax_pct) findings.push({ code: "BRAND_TRUST_HOLD", detail: `${e.id}: parallax ${e.parallax_pct}% > ${C.max_parallax_pct}%` });
    if (e.scale != null && e.scale > C.max_stat_scale) findings.push({ code: "BRAND_TRUST_HOLD", detail: `${e.id}: scale ${e.scale} > ${C.max_stat_scale}` });
    if (e.translate_pct != null && e.translate_pct > C.max_total_translate_pct) findings.push({ code: "CAMERA_TOUR_FAIL", detail: `${e.id}: translate ${e.translate_pct}% of the frame - too far` });
    for (const banned of ["spin", "rotate", "bounce", "wipe", "flip", "zoom_big", "cut"]) {
      if (String(e.kind).includes(banned)) findings.push({ code: "BRAND_TRUST_HOLD", detail: `${e.id}: "${e.kind}" is a banned motion (§9)` });
    }
  }

  // ---- §15 no new / duplicate text ----
  const textEvents = ev.filter((e) => e.text_overlay && String(e.text_overlay).trim());
  for (const e of textEvents) {
    const t = String(e.text_overlay).toLowerCase();
    const allowedMissing = /pokemondealfinder\.com|see the live deal|find more/.test(t) && (master.cta_present === false || master.domain_present === false);
    if (!allowedMissing) findings.push({ code: "DUPLICATE_TEXT_FAIL", detail: `${e.id} adds text "${e.text_overlay}" over the master's own typography` });
  }
  if (loopPlan.new_large_caption) findings.push({ code: "DUPLICATE_TEXT_FAIL", detail: "a large kinetic caption over the design (§9/§15)" });

  // ---- §27 loop seam ----
  const s = loopPlan.seam?.start_state ?? {};
  const e2 = loopPlan.seam?.end_state ?? {};
  const seamOk =
    near(s.cam_scale ?? 1, e2.cam_scale ?? 1, C.seam_epsilon_scale) &&
    near(s.cam_tx ?? 0, e2.cam_tx ?? 0, 6) && near(s.cam_ty ?? 0, e2.cam_ty ?? 0, 6) &&
    near(s.max_overlay_opacity ?? 0, e2.max_overlay_opacity ?? 0, C.seam_epsilon_opacity);
  if (!seamOk) findings.push({ code: "LOOP_SEAM_FAIL", detail: `the 0.0s and ${(dur / 1000).toFixed(1)}s states differ - replay will jump (${JSON.stringify(s)} vs ${JSON.stringify(e2)})` });

  // ---- §26 dead opening / whole creative visible ----
  const firstEvt = [...ev].sort((a, b) => a.at_ms - b.at_ms)[0];
  if (loopPlan.opening_blank || (firstEvt && firstEvt.at_ms < 0)) findings.push({ code: "DEAD_OPENING_FAIL", detail: "the loop opens blank / with a logo intro" });
  if ((loopPlan.master_visible_ratio ?? 1) < C.min_master_visible_ratio) {
    findings.push({ code: "CAMERA_TOUR_FAIL", detail: `the whole creative is visible only ${Math.round((loopPlan.master_visible_ratio ?? 1) * 100)}% of the loop (want >= ${Math.round(C.min_master_visible_ratio * 100)}%)` });
  }

  // ---- §17 brand-trust heuristic ----
  const trust = scoreLoopTrust({ loopPlan, findings });
  if (trust.verdict !== "PASS") findings.push({ code: "BRAND_TRUST_HOLD", detail: `brand-trust ${trust.score}/100 - ${trust.reason}` });

  const verification = {
    camera_tour: findings.some((f) => f.code === "CAMERA_TOUR_FAIL") ? "FAIL" : "PASS",
    loop_seam: findings.some((f) => f.code === "LOOP_SEAM_FAIL") ? "FAIL" : "PASS",
    duplicate_text: findings.some((f) => f.code === "DUPLICATE_TEXT_FAIL") ? "FAIL" : "PASS",
    dead_opening: findings.some((f) => f.code === "DEAD_OPENING_FAIL") ? "FAIL" : "PASS",
    brand_trust: findings.some((f) => f.code === "BRAND_TRUST_HOLD") ? "HOLD" : "PASS",
    motion_events: ev.length,
    trust_score: trust.score,
  };
  if (!findings.length) return { ok: true, findings: [], verification, trust };

  const ORDER = ["DEAD_OPENING_FAIL", "LOOP_SEAM_FAIL", "CAMERA_TOUR_FAIL", "DUPLICATE_TEXT_FAIL", "VIDEO_DERIVED_VALUE_EXACT_FAIL", "BRAND_TRUST_HOLD"];
  const state = ORDER.find((st) => findings.some((f) => f.code === st)) ?? findings[0].code;
  return { ok: false, ...failure(state, findings.map((f) => f.detail).join(" | ").slice(0, 400), { stage: "premium_loop_qa", detail: { findings } }), findings, verification, trust };
}

// §17 - "would this look appropriate if a serious established collectibles
// company posted it?" A restrained loop over an already-premium master
// scores high; over-animation / gimmickry / an off-format frame lose points.
export function scoreLoopTrust({ loopPlan = {}, findings = [] } = {}) {
  const ev = loopPlan.motion_events ?? [];
  let score = 100;
  const kinds = new Set(ev.map((e) => e.kind));
  if (ev.length > 3) score -= 25;
  if (ev.length === 0) score -= 40;
  const bigMove = ev.some((e) => (e.push_pct ?? 0) > 2.5 || (e.parallax_pct ?? 0) > 2 || (e.scale ?? 1) > 1.04);
  if (bigMove) score -= 25;
  if (kinds.has("pan") || kinds.has("crop") || loopPlan.camera?.frames_whole_creative === false) score -= 30;
  if ((loopPlan.master_visible_ratio ?? 1) < 0.9) score -= 20;
  if (findings.some((f) => f.code === "DUPLICATE_TEXT_FAIL")) score -= 25;
  if (loopPlan.width !== 1080 || loopPlan.height !== 1920) score -= 20;
  if ((loopPlan.duration_ms ?? 5000) < 4500 || (loopPlan.duration_ms ?? 5000) > 6000) score -= 10;
  // restraint bonus: exactly 2-3 gentle events, seam declared, whole creative held
  if (ev.length >= 1 && ev.length <= 3 && !bigMove && loopPlan.seam && (loopPlan.master_visible_ratio ?? 1) >= 0.95) score += 8;
  score = Math.max(0, Math.min(100, score));
  const reason = ev.length > 3 ? "too many motion events" : bigMove ? "motion exceeds the premium caps" : kinds.has("pan") ? "camera tour" : "restrained and on-brand";
  return { score, verdict: score >= 78 ? "PASS" : "HOLD", reason, owner_review_required: true };
}
