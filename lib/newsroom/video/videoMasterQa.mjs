// Phase SOCIAL-CREATIVE-4C.2 - MASTER-LAYERED-MOTION QUALITY GATE
// (§19, §20, §21).
//
// The master creative is already owner-approved for premium look. This
// gate judges the MOTION: does the video feel like premium short-form
// brand content, or a cheap edit / animated infographic? Deterministic
// checks over the choreography spec + an exact-integer check over the
// numbers the master shows.
//
// Pure logic; `auditVideoDerivedExact` compares a supplied vision
// extraction to the manifest with ZERO tolerance.

import { failure } from "../editorial/failureStates.mjs";

export const VIDEO_MASTER_QA_VERSION = "4c2.1";

const norm = (s) => String(s ?? "").toLowerCase().replace(/\s+/g, " ").trim();
const finPct = (s) => [...String(s ?? "").matchAll(/(\d{1,3})\s?%/g)].map((m) => Number(m[1]));

// ---- §19 EXACT DERIVED-VALUE LOCK ------------------------
// No vision tolerance for a displayed integer %. 44% must stay 44%.
export function auditVideoDerivedExact({ extraction = {}, semanticManifest = {} } = {}) {
  const S = semanticManifest || {};
  const declared = new Set();
  const addPct = (v) => { const n = Number(v); if (Number.isFinite(n)) declared.add(Math.round(n)); };
  addPct(S.comparison_pct);
  addPct(S.claim_value);
  addPct(S.required_numeric_facts?.discount_pct);
  addPct(S.required_numeric_facts?.premium_pct != null ? Math.abs(S.required_numeric_facts.premium_pct) : null);
  for (const p of S.visualization_data_manifest?.allowed_points ?? []) addPct(p.value);
  if (!declared.size) return { ok: true, findings: [] };

  const shown = [
    ...finPct(extraction.headline),
    ...(extraction.all_numbers ?? []).flatMap(finPct),
    ...(extraction.comparisons ?? []).flatMap((c) => finPct(c.stated_pct) ),
    ...(extraction.chart_values ?? []).flatMap((c) => finPct(c.value)),
    ...finPct(extraction.primary_stat_text),
  ];
  const findings = [];
  for (const n of shown) {
    // a shown integer % that is close to a declared one but NOT exactly it
    const nearest = [...declared].reduce((best, d) => (Math.abs(d - n) < Math.abs(best - n) ? d : best), [...declared][0]);
    if (Math.abs(nearest - n) >= 1 && Math.abs(nearest - n) <= 3) {
      findings.push({ code: "VIDEO_DERIVED_VALUE_EXACT_FAIL", detail: `the master shows ${n}% where the declared derived value is exactly ${nearest}% - no rounding drift allowed (§19)` });
    }
  }
  if (!findings.length) return { ok: true, findings: [] };
  return { ok: false, ...failure("VIDEO_DERIVED_VALUE_EXACT_FAIL", findings.map((f) => f.detail).join(" | "), { stage: "video_derived_exact" }), findings };
}

// ---- §20 MASTER-MOTION AUDIT ----------------------------
export function auditMasterMotion({ choreography = {}, layers = {}, plan = {} } = {}) {
  const beats = choreography.beats ?? [];
  const dur = choreography.duration_ms ?? plan.duration ?? (beats.at(-1)?.end_ms ?? 0);
  const findings = [];
  if (!beats.length) return { ok: false, ...failure("CHEAP_EDIT_FAIL", "no choreography beats"), findings: [{ code: "CHEAP_EDIT_FAIL", detail: "empty choreography" }] };

  // §9 DEAD_OPENING / WEAK_HOOK - the first meaningful content by <=350ms
  const b0 = beats[0];
  const firstContentMs = beats.find((b) => (b.reveals ?? []).some((r) => r !== "brand" && r !== "background" && r !== "decorative_accents") || (b.text?.lines ?? []).length)?.at_ms ?? 99999;
  if (firstContentMs > 350) findings.push({ code: "DEAD_OPENING_FAIL", detail: `first meaningful content at ${firstContentMs}ms (must be <=350ms)` });
  if (norm(b0?.visual ?? "").match(/black frame|empty|logo only|brand only/) || (b0 && (b0.reveals ?? []).every((r) => r === "brand"))) {
    findings.push({ code: "DEAD_OPENING_FAIL", detail: "opening beat is empty / logo-only / a dead frame" });
  }
  const hookText = norm((b0?.text?.lines ?? []).join(" "));
  const hookHasFigure = /\$\d|\d+\s?%|\d+ vs \d+/.test(hookText) || (b0?.reveals ?? []).includes("primary_stat") || (b0?.reveals ?? []).includes("hero_card");
  if (!hookHasFigure) findings.push({ code: "WEAK_HOOK_FAIL", detail: `the hook beat carries no memorable figure ("${hookText || "(none)"}")` });

  // §7/§8 WHOLE_POSTER_MOTION / POSTER_DRIFT - real localized reveals, not
  // just a whole-image zoom/crossfade
  const localizedReveals = beats.filter((b) => b.camera?.crop_to && b.camera.crop_to !== "full").length;
  const wholeImageOnly = beats.filter((b) => (!b.camera || b.camera.crop_to === "full") && (b.motion === "scale" || b.motion === "crossfade" || b.motion === "zoom")).length;
  if (localizedReveals < 2) findings.push({ code: "POSTER_DRIFT_FAIL", detail: `only ${localizedReveals} localized reveals - the master is just held / crossfaded` });
  if (beats.length && wholeImageOnly / beats.length > 0.6) findings.push({ code: "WHOLE_POSTER_MOTION_FAIL", detail: `${Math.round((wholeImageOnly / beats.length) * 100)}% of beats are a whole-image zoom/crossfade` });

  // §20 EXCESSIVE_STATIC_HOLD - a non-final beat holding static too long
  for (let i = 0; i < beats.length; i++) {
    const b = beats[i];
    const len = (b.end_ms ?? b.at_ms + (b.dur_ms ?? 0)) - b.at_ms;
    const isFinalHold = i === beats.length - 1;
    const hasMotion = b.motion && b.motion !== "hold" && b.motion !== "none";
    if (!isFinalHold && !hasMotion && len > 2500) findings.push({ code: "EXCESSIVE_STATIC_HOLD_FAIL", detail: `beat ${b.id} holds static for ${len}ms` });
    if (isFinalHold && len > 2000) findings.push({ code: "EXCESSIVE_STATIC_HOLD_FAIL", detail: `the closing hold is ${len}ms - trim the dead outro` });
  }

  // §17 CTA_BANNER_AD - the CTA must be editorial, not a giant banner
  const ctaZone = layers.layers?.cta?.zone;
  if (ctaZone && ctaZone.h > 0.16) findings.push({ code: "CTA_BANNER_AD_FAIL", detail: `the CTA zone is ${Math.round(ctaZone.h * 100)}% of the frame height - keep it editorial` });
  const ctaBeat = beats.find((b) => (b.reveals ?? []).includes("cta") || b.dominant === "cta");
  if (ctaBeat && ctaBeat.camera?.crop_to === "cta" && (ctaBeat.camera.scale ?? 1) >= 1.4) {
    findings.push({ code: "CTA_BANNER_AD_FAIL", detail: "the CTA beat blows the CTA up to fill the frame" });
  }

  // §21 LOW_MOTION_HIERARCHY - distinct primitives + changing dominant layer
  const primitives = new Set(beats.map((b) => b.motion).filter(Boolean));
  const dominants = beats.map((b) => b.dominant).filter(Boolean);
  const distinctDominants = new Set(dominants).size;
  if (primitives.size < 3) findings.push({ code: "LOW_MOTION_HIERARCHY_FAIL", detail: `only ${primitives.size} distinct motion primitives` });
  if (distinctDominants < 3) findings.push({ code: "LOW_MOTION_HIERARCHY_FAIL", detail: `only ${distinctDominants} distinct dominant layers across the piece` });

  // §16 text density - <= 2 lines / <= 7 words per beat
  for (const b of beats) {
    const lines = b.text?.lines ?? [];
    if (lines.length > 2) findings.push({ code: "CHEAP_EDIT_FAIL", detail: `beat ${b.id} has ${lines.length} text lines (max 2)` });
    if (lines.some((l) => norm(l).split(" ").filter(Boolean).length > 7)) findings.push({ code: "CHEAP_EDIT_FAIL", detail: `beat ${b.id} text exceeds 7 words` });
  }

  // §20 CHEAP_EDIT - rhythm too even (every beat identical length) or too many soft fails
  const lens = beats.map((b) => (b.end_ms ?? b.at_ms + (b.dur_ms ?? 0)) - b.at_ms);
  const evenRhythm = lens.length > 3 && new Set(lens.map((l) => Math.round(l / 200))).size <= 1;
  if (evenRhythm) findings.push({ code: "CHEAP_EDIT_FAIL", detail: "every beat is the same length - slideshow rhythm" });
  const softFails = new Set(findings.map((f) => f.code));
  if (softFails.size >= 3 && !softFails.has("CHEAP_EDIT_FAIL")) findings.push({ code: "CHEAP_EDIT_FAIL", detail: `multiple motion faults (${[...softFails].join(", ")}) - reads as a cheap edit` });

  const verification = {
    dead_opening: findings.some((f) => f.code === "DEAD_OPENING_FAIL") ? "FAIL" : "PASS",
    weak_hook: findings.some((f) => f.code === "WEAK_HOOK_FAIL") ? "FAIL" : "PASS",
    whole_poster_motion: findings.some((f) => f.code === "WHOLE_POSTER_MOTION_FAIL") ? "FAIL" : "PASS",
    poster_drift: findings.some((f) => f.code === "POSTER_DRIFT_FAIL") ? "FAIL" : "PASS",
    static_hold: findings.some((f) => f.code === "EXCESSIVE_STATIC_HOLD_FAIL") ? "FAIL" : "PASS",
    cta_banner: findings.some((f) => f.code === "CTA_BANNER_AD_FAIL") ? "FAIL" : "PASS",
    motion_hierarchy: findings.some((f) => f.code === "LOW_MOTION_HIERARCHY_FAIL") ? "FAIL" : "PASS",
    cheap_edit: findings.some((f) => f.code === "CHEAP_EDIT_FAIL") ? "FAIL" : "PASS",
    localized_reveals: localizedReveals,
    distinct_motions: primitives.size,
  };
  if (!findings.length) return { ok: true, findings: [], verification };

  const ORDER = ["DEAD_OPENING_FAIL", "WEAK_HOOK_FAIL", "VIDEO_DERIVED_VALUE_EXACT_FAIL", "WHOLE_POSTER_MOTION_FAIL", "POSTER_DRIFT_FAIL", "CTA_BANNER_AD_FAIL", "EXCESSIVE_STATIC_HOLD_FAIL", "LOW_MOTION_HIERARCHY_FAIL", "CHEAP_EDIT_FAIL"];
  const state = ORDER.find((s) => findings.some((f) => f.code === s)) ?? findings[0].code;
  return { ok: false, ...failure(state, findings.map((f) => f.detail).join(" | ").slice(0, 400), { stage: "master_motion_qa", detail: { findings } }), findings, verification };
}

// ---- §21 PREMIUM MOTION SCORE (heuristic) ---------------
export const PREMIUM_MOTION_DIMS = Object.freeze([
  "scroll_stop_first_half_second", "card_feels_collectible", "progressive_build",
  "every_motion_serves_story", "memorable_stat", "one_coherent_piece",
  "not_template_or_slideshow", "looks_more_expensive_than_it_costs",
  "watch_to_end", "native_to_shorts_tiktok",
]);

export function scorePremiumMotion({ choreography = {}, layers = {}, motionAudit = null } = {}) {
  const beats = choreography.beats ?? [];
  const a = motionAudit ?? auditMasterMotion({ choreography, layers });
  const dims = {};
  const firstContentMs = beats.find((b) => (b.text?.lines ?? []).length || (b.reveals ?? []).includes("hero_card") || (b.reveals ?? []).includes("primary_stat"))?.at_ms ?? 9999;
  dims.scroll_stop_first_half_second = firstContentMs <= 350 ? 10 : firstContentMs <= 600 ? 6 : 2;
  dims.card_feels_collectible = beats.some((b) => /parallax|crop|light sweep|depth/.test(String(b.motion))) ? 10 : 5;
  dims.progressive_build = a.verification?.poster_drift === "PASS" && a.verification?.localized_reveals >= 3 ? 10 : 5;
  dims.every_motion_serves_story = a.verification?.whole_poster_motion === "PASS" ? 10 : 4;
  dims.memorable_stat = beats.some((b) => b.emphasis && /stat/.test(String(b.emphasis))) ? 10 : 5;
  dims.one_coherent_piece = a.verification?.cheap_edit === "PASS" ? 10 : 3;
  dims.not_template_or_slideshow = a.verification?.cheap_edit === "PASS" && a.verification?.distinct_motions >= 3 ? 10 : 4;
  dims.looks_more_expensive_than_it_costs = a.ok ? 10 : 5;
  dims.watch_to_end = a.verification?.static_hold === "PASS" ? 9 : 4;
  dims.native_to_shorts_tiktok = choreography.width === 1080 && choreography.height === 1920 ? 9 : 3;
  const score = Math.round(Object.values(dims).reduce((x, y) => x + y, 0));
  return { score, verdict: score >= 74 ? "PASS" : "HOLD", dims, owner_review_required: true };
}
