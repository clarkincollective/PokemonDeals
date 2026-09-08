// Phase SOCIAL-CREATIVE-4C - VIDEO FACT + SEMANTIC AUDITOR (§21, §22).
//
// Every frame that carries a fact must be auditable. This module walks
// the director's `video_fact_timeline` and scene plan and checks each
// against the SAME source of truth the image + caption were audited
// against (the semantic manifest, the fact-source locks, the caption
// audit's deterministic gates). BEAUTIFUL + WRONG = FAIL.
//
// Detects (§22): wrong above/below direction, scope migration across
// scenes, wrong card-to-stat association, invented statistic, invented
// card metadata, a contradictory final lesson, a duplicated printing
// card, unsupported urgency, generated brand risk.
//
// Pure. No I/O, no OpenAI.

import { failure } from "../editorial/failureStates.mjs";
import { DIRECTION_WORDS } from "../hybrid/semanticManifest.mjs";
import { allowedFactsFor, extractCaptionClaims } from "../captions/captionAudit.mjs";

export const VIDEO_SEMANTIC_AUDIT_VERSION = "4c.1";

const norm = (s) => String(s ?? "").toLowerCase().replace(/[‐-―]/g, "-").replace(/\s+/g, " ").trim();
const neareq = (a, b, tol) => Math.abs(Number(a) - Number(b)) <= tol;

const URGENCY_RE = /\bhurry\b|\bact\s+(fast|now)|\bdon'?t\s+(miss|wait)\b|\bbefore\s+it'?s\s+gone\b|\bselling\s+(fast|out)\b|\bend(s|ing)\s+soon\b|\blimited\s+time\b|\blast\s+chance\b|\bwhile\s+(stocks|supplies)\s+last\b/i;
const BRAND_RISK_RE = /pok[eé]\s*ball|red[\s-]?(and[\s-]?)?white\s*(ball|circle)|official[\s-]?looking|nintendo[\s-]?style\s*(logo|mark)/i;

// ---- §21 fact timeline audit ----------------------------
export function auditVideoFactTimeline({ plan = {}, semanticManifest = {}, factTrace = [] } = {}) {
  const S = semanticManifest || {};
  const allowed = allowedFactsFor({ semanticManifest: S, factTrace, cardMetadataLock: S.card_metadata_lock ?? null });
  const findings = [];
  const timeline = plan.video_fact_timeline ?? [];

  // every scene that shows a $ / % / big number must appear on the timeline
  const onTimeline = new Set(timeline.map((r) => r.scene_id));
  for (const sc of plan.scenes ?? []) {
    const txt = (sc.text?.lines ?? []).join(" ");
    if (/(\$\d|\d+(\.\d+)?\s?%|\d{1,3}(,\d{3})+)/.test(txt) && !onTimeline.has(sc.id)) {
      findings.push({ code: "VIDEO_FACT_FAIL", detail: `scene ${sc.id} shows a number ("${txt.trim().slice(0, 60)}") but is missing from video_fact_timeline` });
    }
  }

  const okP = (n) => allowed.prices.some((v) => neareq(v, n, Math.max(0.5, v * 0.01))) || allowed.safe_prices.includes(Math.round(n));
  const okPct = (n) => allowed.percentages.some((v) => neareq(v, n, 1));
  const okC = (n) => allowed.counts.some((v) => neareq(v, n, Math.max(1, v * 0.001))) || allowed.safe_counts.includes(n);

  for (const row of timeline) {
    const cx = extractCaptionClaims(row.visible_claim);
    for (const p of cx.prices) if (!okP(p)) findings.push({ code: "VIDEO_FACT_FAIL", detail: `${row.scene_id}: price $${p} ("${row.visible_claim}") is not in the source of truth` });
    for (const pc of cx.percentages) if (!okPct(pc)) findings.push({ code: "VIDEO_FACT_FAIL", detail: `${row.scene_id}: ${pc}% ("${row.visible_claim}") is not in the source of truth` });
    for (const bn of cx.big_numbers) if (!okC(bn)) findings.push({ code: "VIDEO_FACT_FAIL", detail: `${row.scene_id}: figure ${bn.toLocaleString("en-US")} ("${row.visible_claim}") is not in the source of truth` });
    if (row.verification && row.verification !== "PASS") findings.push({ code: "VIDEO_FACT_FAIL", detail: `${row.scene_id}: timeline row not verified (${row.verification})` });
  }
  return findings;
}

// ---- §22 semantic auditor ------------------------------
export function auditVideoSemantics({ plan = {}, semanticManifest = {} } = {}) {
  const S = semanticManifest || {};
  const findings = [];
  const allText = (plan.scenes ?? []).flatMap((s) => s.text?.lines ?? []).map(norm);
  const flat = allText.join(" | ");
  const trueRel = S.comparison_direction;

  // direction across every scene
  if (trueRel && trueRel !== "UNKNOWN") {
    for (const [word, needRel] of Object.entries(DIRECTION_WORDS)) {
      if (flat.includes(word) && needRel !== trueRel) {
        findings.push({ code: "VIDEO_SEMANTIC_FAIL", detail: `a scene says "${word}" (implies ${needRel.replace("_", " ").toLowerCase()}) but the story is ${trueRel.replace("_", " ").toLowerCase()}` });
      }
    }
    // the direction stat asset must match
    const d = plan.stat_assets?.direction;
    if (d && typeof d.unit === "string") {
      const unitBelow = /_below_market/.test(d.unit);
      const unitAbove = /_above_market/.test(d.unit);
      if ((unitBelow && trueRel === "ABOVE_MARKET") || (unitAbove && trueRel === "BELOW_MARKET")) {
        findings.push({ code: "VIDEO_SEMANTIC_FAIL", detail: `the direction stat asset is "${d.unit}" but the story is ${trueRel}` });
      }
    }
  }

  // scope migration - the population stat must never be bound to the example card
  if (S.example_card_is_not_population) {
    const ex = norm(S.example_card ?? "");
    const val = String(S.claim_value ?? "");
    for (const bad of S.forbidden_scope_phrases ?? []) {
      if (bad && flat.includes(norm(bad))) findings.push({ code: "VIDEO_SEMANTIC_FAIL", detail: `a scene scopes the stat to the example card: "${bad}"` });
    }
    if (ex && val) {
      const re = new RegExp(`(${val}\\s?%|[\\d,]{3,})[^|]{0,24}\\b${ex}\\b[^|]{0,12}\\b(singles?|cards?)\\b`, "i");
      const hit = flat.match(re);
      if (hit && !/\btracked\b|\bexample\b|\ball\b/i.test(hit[0])) {
        findings.push({ code: "VIDEO_SEMANTIC_FAIL", detail: `scope migration: "${hit[0].trim()}" binds the whole-set figure to ${S.example_card}` });
      }
    }
    // the example-card scene must be tagged as an example
    const exScene = (plan.scenes ?? []).find((s) => norm((s.text?.lines ?? []).join(" ")).includes(ex) && s.purpose !== "cta");
    if (ex && exScene && !/example|one of|not the whole/i.test((exScene.text?.lines ?? []).join(" "))) {
      findings.push({ code: "VIDEO_SEMANTIC_FAIL", detail: `the ${S.example_card} scene (${exScene.id}) is not labelled as an example` });
    }
  }

  // wrong card-to-stat association: a scene that carries the population /
  // distribution stat must NOT also be the sole card-hero scene without an
  // "example" tag (covered above), and a deal/asking stat scene must show
  // the hero card, not a different index.
  for (const sc of plan.scenes ?? []) {
    if (sc.stat_asset && ["price_gap", "discount", "direction", "gap"].includes(sc.stat_asset) && sc.card_asset != null && sc.card_asset !== 0) {
      findings.push({ code: "VIDEO_SEMANTIC_FAIL", detail: `scene ${sc.id} pairs the deal stat with card index ${sc.card_asset}, not the hero card` });
    }
  }

  // invented statistic: a stat asset whose value has no manifest anchor
  const anchors = new Set();
  if (S.comparison_pct != null) anchors.add(Math.round(S.comparison_pct));
  if (S.claim_value != null) anchors.add(Math.round(S.claim_value));
  if (S.required_numeric_facts?.discount_pct != null) anchors.add(Math.round(S.required_numeric_facts.discount_pct));
  for (const [k, a] of Object.entries(plan.stat_assets ?? {})) {
    if (a.kind === "number_count_up" && a.to != null && /%/.test(String(a.unit ?? "")) && !anchors.has(Math.round(a.to)) && ![...anchors].some((x) => Math.abs(x - a.to) <= 1)) {
      findings.push({ code: "VIDEO_SEMANTIC_FAIL", detail: `stat asset "${k}" counts up to ${a.to} which is not a manifest figure (${[...anchors].join(", ") || "none"})` });
    }
  }

  // contradictory final lesson
  const lastNonCta = [...(plan.scenes ?? [])].reverse().find((s) => s.purpose === "why_it_matters" || s.purpose === "explanation");
  if (lastNonCta && trueRel === "BELOW_MARKET" && /\bdon'?t pay the ask|ask(ing)? is too high|overpay/i.test((lastNonCta.text?.lines ?? []).join(" "))) {
    findings.push({ code: "VIDEO_SEMANTIC_FAIL", detail: `the closing lesson contradicts a below-market ask` });
  }

  // duplicated printing card
  if (plan.family === "printing_compare") {
    const idxUsed = new Set((plan.scenes ?? []).map((s) => s.card_asset).filter((i) => i != null));
    if ((plan.card_assets ?? []).length < 2 || idxUsed.size < 2) {
      findings.push({ code: "VIDEO_SEMANTIC_FAIL", detail: `printing_compare must show TWO distinct real cards - only ${(plan.card_assets ?? []).length} asset(s) / ${idxUsed.size} index(es) used` });
    }
  }

  // unsupported urgency
  if (URGENCY_RE.test(flat)) findings.push({ code: "VIDEO_SEMANTIC_FAIL", detail: `a scene manufactures urgency the story does not support` });

  // generated brand risk
  const brandText = norm([plan.brand_plan?.wordmark_text, ...(plan.on_screen_text ?? []).flatMap((b) => b.lines)].join(" "));
  if (BRAND_RISK_RE.test(brandText)) findings.push({ code: "VIDEO_SEMANTIC_FAIL", detail: `brand risk: a Poke Ball-like / official-looking mark is described` });
  if (plan.brand_plan && plan.brand_plan.no_generated_mark !== true) findings.push({ code: "VIDEO_SEMANTIC_FAIL", detail: `brand plan does not forbid a generated mark` });

  return findings;
}

// ---- combined -----------------------------------------
export function auditVideo({ plan = {}, semanticManifest = {}, factTrace = [] } = {}) {
  const findings = [
    ...auditVideoFactTimeline({ plan, semanticManifest, factTrace }),
    ...auditVideoSemantics({ plan, semanticManifest }),
  ];
  const verification = {
    fact_timeline: findings.some((f) => f.code === "VIDEO_FACT_FAIL") ? "FAIL" : "PASS",
    semantic: findings.some((f) => f.code === "VIDEO_SEMANTIC_FAIL") ? "FAIL" : "PASS",
    direction: "PASS", scope: "PASS", card_stat_pairing: "PASS", brand: "PASS",
  };
  for (const f of findings) {
    if (/direction|above market|below market|premium|discount|implies|arrow/i.test(f.detail)) verification.direction = "FAIL";
    if (/scope|whole-set|population|example card/i.test(f.detail)) verification.scope = "FAIL";
    if (/pairs the deal stat|card-to-stat|card index|hero card/i.test(f.detail)) verification.card_stat_pairing = "FAIL";
    if (/brand|poke ball|logo|mark/i.test(f.detail)) verification.brand = "FAIL";
  }
  if (!findings.length) return { ok: true, findings: [], verification };
  const state = findings.some((f) => f.code === "VIDEO_SEMANTIC_FAIL") ? "VIDEO_SEMANTIC_FAIL" : "VIDEO_FACT_FAIL";
  return { ok: false, ...failure(state, findings.map((f) => f.detail).join(" | ").slice(0, 400), { stage: "video_audit", detail: { findings } }), findings, verification };
}
