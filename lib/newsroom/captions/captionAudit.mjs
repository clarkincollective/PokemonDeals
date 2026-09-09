// Phase SOCIAL-CREATIVE-5B - CAPTION CLAIM EXTRACTION + DETERMINISTIC AUDIT
// (§4, §12-§18, §22, §26, §27).
//
// The caption model is a WRITER, not an analyst. It may invent wording,
// structure, tone and hook style. It may NOT invent prices, percentages,
// card metadata, grades, variants, dates, timeframes, source claims,
// market movement, rarity, urgency, scarcity, investment advice or
// buyer/seller behaviour. After generation this module extracts the
// caption's structured claims and compares them - deterministically -
// against the SAME source of truth the approved image was audited against
// (the semantic manifest + fact trace + fact-source locks).
//
// Pure. No I/O, no OpenAI. `failure()` refuses a stateless reason.

import { failure } from "../editorial/failureStates.mjs";
import { DIRECTION_WORDS } from "../hybrid/semanticManifest.mjs";
import { isEbayFirstCta } from "../hybrid/cta.mjs";
// SOCIAL-CAPTION-5B.1 - two new deterministic checks, composed into the
// same findings/ORDER/verification pipeline every other check here uses.
import { auditCaptionEntityLock } from "./captionEntityLock.mjs";
import { auditPlaceholders } from "./captionPlaceholderAudit.mjs";

export const CAPTION_AUDIT_VERSION = "5b1.1";

const norm = (s) => String(s ?? "").toLowerCase().replace(/[‐-―]/g, "-").replace(/\s+/g, " ").trim();
const collapse = (s) => norm(s).replace(/[^a-z0-9]+/g, " ").trim();

// ---- §12 / §26 RAW SERIES / ENUM LABELS ------------------------
// A caption must never be (or closely resemble) a raw series / enum name.
export const RAW_SERIES_LABELS = Object.freeze([
  "EXACT_PRINTING_MATTERS", "MARKET_SNAPSHOT", "WHY_SOLD_PRICES_MATTER", "DEAL_DROP",
  "THREE_UNDER_25", "MARKET_REFERENCE_EXPLAINER", "DEAL_OF_THE_DAY", "NEW_LISTING_ALERT",
  "PRINTING_COMPARE", "ASKING_VS_SOLD", "BIGGEST_MOVERS", "AUCTION_BID_VS_TOTAL",
]);
const RAW_SERIES_COLLAPSED = RAW_SERIES_LABELS.map((s) => collapse(s.replace(/_/g, " ")));

// ---- §15 INVESTMENT LANGUAGE ---------------------------------
const INVESTMENT_RE =
  /\binvest(ment|ing|or)?\b|\bguaranteed\s+return|\breturn\s+on\s+investment\b|\broi\b|\bportfolio\b|\bappreciat(e|ion|ing)\b|\bbuy\s+(before|now)\s+it\s+(rises|goes\s+up|moons)|\bunder\s?valued\b|\beasy\s+(profit|money|flip)\b|\bmoney[\s-]?maker\b|\bwill\s+(go|keep\s+going)\s+up\b|\bprice\s+(will|is\s+going\s+to)\s+(rise|increase|climb|explode|moon)\b|\bload\s+up\b|\bstock\s+up\s+before\b|\bflip\s+(it|this)\s+for\b|\bprint(s|ing)?\s+money\b|\bto\s+the\s+moon\b|\bcan'?t\s+lose\b/i;

// ---- §16 FAKE URGENCY ---------------------------------------
const URGENCY_RE =
  /\bhurry\b|\bact\s+(fast|now|quick)|\bdon'?t\s+(miss|wait|sleep)\b|\bbefore\s+it'?s\s+gone\b|\bselling\s+(fast|out)\b|\bend(s|ing)\s+soon\b|\blimited\s+time\b|\blast\s+chance\b|\bwhile\s+(stocks|supplies)\s+last\b|\bmove\s+fast\b|\bgrab\s+it\s+(now|before)\b|\btime\s+is\s+running\s+out\b|\bgoing\s+quick\b/i;

// ---- §17 UNSUPPORTED SCARCITY ------------------------------
const SCARCITY_RE =
  /\b(rare|scarce)\s+opportunity\b|\bimpossible\s+to\s+find\b|\bhard\s+to\s+(find|come\s+by)\b|\bfew\s+(left|remain)|\bonly\s+\d+\s+left\b|\bnever\s+see\s+(this|these)\s+again\b|\bone\s+of\s+a\s+kind\b|\bwon'?t\s+last\b|\bextremely\s+rare\b|\bvery\s+hard\s+to\s+find\b/i;

// ---- §14 SOURCE / TIMEFRAME (mirrors factSource.mjs) --------
const INVENTED_SOURCE_RE =
  /\bebay\s+sold\s+listings?\b|\bcompleted\s+listings?\b|\bacross\s+(major\s+)?marketplaces?\b|\blive\s+market\s+data\b|\breal[\s-]?time\s+(pricing|data)\b|\bscraped\s+from\b|\bdata\s+from\s+(ebay|tcgplayer|pricecharting)\b|\brecent\s+sold\s+data\b/i;
const TIMEFRAME_RE =
  /\b(today|right\s+now|as\s+of\s+today)\b|\bthis\s+(week|month|year)\b|\blast\s+\d+\s+(day|week|month)s?\b|\bpast\s+\d+\s+(day|week|month)s?\b|\bcurrent\s+market\b|\b\d{1,2}\s*[-\/]\s*\d{1,2}\s+\w+\b|\b(ytd|30d|60d|90d)\b|\bover\s+the\s+last\s+\w+\b/i;

// ---- §13 STRUCTURED CLAIM EXTRACTION -----------------------
// Deterministic - no model call. Pulls every asserted number, the
// direction words, the CTAs and the banned-language classes out of the
// finished caption text.
export function extractCaptionClaims(text) {
  const t = norm(text);
  const prices = [...String(text).matchAll(/\$\s?\d[\d,]*(?:\.\d+)?/g)].map((m) => Number(m[0].replace(/[^\d.]/g, "")));
  const percentages = [...String(text).matchAll(/\d[\d,]*(?:\.\d+)?\s?%/g)].map((m) => Number(m[0].replace(/[^\d.]/g, "")));
  // 4+ digit integers (populations / sample sizes / counts)
  const bigNumbers = [...String(text).matchAll(/(?<![.\d$])\b\d{1,3}(?:,\d{3})+\b|\b\d{4,}\b/g)].map((m) => Number(m[0].replace(/[^\d]/g, "")));
  const directionWords = Object.keys(DIRECTION_WORDS).filter((w) => t.includes(w));
  return {
    text: String(text ?? ""),
    prices, percentages, big_numbers: bigNumbers,
    direction_words: directionWords,
    urgency_language: URGENCY_RE.test(text) ? (text.match(URGENCY_RE) || []).slice(0, 1) : [],
    investment_language: INVESTMENT_RE.test(text) ? (text.match(INVESTMENT_RE) || []).slice(0, 1) : [],
    scarcity_language: SCARCITY_RE.test(text) ? (text.match(SCARCITY_RE) || []).slice(0, 1) : [],
    source_language: INVENTED_SOURCE_RE.test(text) ? (text.match(INVENTED_SOURCE_RE) || []).slice(0, 1) : [],
    timeframe_language: TIMEFRAME_RE.test(text) ? (text.match(TIMEFRAME_RE) || []).slice(0, 1) : [],
    calls_to_action: [...String(text).split(/\n+/)].filter((l) => /\b(see|find|browse|explore|check|view|shop|get)\b/i.test(l)).map((l) => l.trim()).slice(0, 4),
  };
}

// ---- allowed-fact set from the manifest + fact trace --------
const neareq = (a, b, tol) => Math.abs(Number(a) - Number(b)) <= tol;

export function allowedFactsFor({ semanticManifest = {}, factTrace = [], cardMetadataLock = null } = {}) {
  const S = semanticManifest || {};
  const prices = new Set();
  const pcts = new Set();
  const counts = new Set();
  const addP = (v) => { const n = Number(v); if (Number.isFinite(n) && n > 0) prices.add(Math.round(n * 100) / 100); };
  const addPct = (v) => { const n = Number(v); if (Number.isFinite(n)) pcts.add(Math.round(n * 10) / 10); };
  const addC = (v) => { const n = Number(v); if (Number.isFinite(n)) counts.add(Math.round(n)); };

  addP(S.comparison_left?.value); addP(S.comparison_right?.value);
  addPct(S.comparison_pct); addPct(S.claim_value);
  const rn = S.required_numeric_facts || {};
  for (const k of Object.keys(rn)) {
    const v = rn[k];
    if (/price|asking|market|listed|usd/i.test(k)) addP(v);
    else if (/pct|percent|multiple/i.test(k)) addPct(v);
    else addC(v);
  }
  for (const p of S.visualization_data_manifest?.allowed_points ?? []) addPct(p.value);
  addC(S.visualization_data_manifest?.source_population);
  for (const it of S.item_identities ?? []) addP(it.price);
  // tracked-population count out of "24,545 tracked singles"
  const popM = String(S.claim_population ?? "").match(/[\d,]{2,}/);
  if (popM) addC(Number(popM[0].replace(/,/g, "")));
  // numbers already proven in the fact trace
  for (const row of factTrace ?? []) {
    const s = String(row?.expected_value ?? "");
    const m = s.match(/-?\d[\d,]*(?:\.\d+)?/);
    if (!m) continue;
    const n = Number(m[0].replace(/,/g, ""));
    if (/%/.test(s)) addPct(Math.abs(n));
    else if (/\$/.test(s)) addP(Math.abs(n));
    else addC(Math.abs(n));
  }
  return {
    prices: [...prices], percentages: [...pcts], counts: [...counts],
    // "$25" the cap and small list integers are always safe
    safe_prices: [25], safe_counts: [1, 2, 3],
  };
}

// ---- individual gates -------------------------------------
export function checkRawSeries({ hook = "", body = "", cta = "", family = "" } = {}) {
  const findings = [];
  for (const part of [["hook", hook], ["body", body], ["cta", cta]]) {
    const c = collapse(part[1]);
    if (!c) continue;
    if (RAW_SERIES_COLLAPSED.some((lbl) => lbl && (c === lbl || (c.length <= lbl.length + 4 && c.includes(lbl))))) {
      findings.push({ code: "RAW_SERIES_CAPTION_FAIL", detail: `${part[0]} "${part[1]}" is (or resembles) a raw series label` });
    }
  }
  // also a bare shout of the family constant
  if (family && collapse(hook) === collapse(String(family).replace(/_/g, " "))) {
    findings.push({ code: "RAW_SERIES_CAPTION_FAIL", detail: `hook equals the family constant "${family}"` });
  }
  return findings;
}

export function checkBannedLanguage(text, { timeSensitiveFact = null, scarcityEvidence = null } = {}) {
  const ex = extractCaptionClaims(text);
  const findings = [];
  if (ex.investment_language.length) findings.push({ code: "INVESTMENT_LANGUAGE_FAIL", detail: `investment / financial framing: "${ex.investment_language[0]}"` });
  if (ex.urgency_language.length && !timeSensitiveFact) findings.push({ code: "FAKE_URGENCY_FAIL", detail: `manufactured urgency: "${ex.urgency_language[0]}" (no supported time-sensitive fact)` });
  if (ex.scarcity_language.length && !scarcityEvidence) findings.push({ code: "UNSUPPORTED_SCARCITY_FAIL", detail: `unsupported scarcity: "${ex.scarcity_language[0]}"` });
  return findings;
}

export function checkSourceTimeframe(text, { sourceManifest = null, timeframeManifest = null } = {}) {
  const ex = extractCaptionClaims(text);
  const findings = [];
  const allowedSrc = (sourceManifest?.allowed_statements ?? []).map(norm).filter(Boolean);
  const allowedTf = (timeframeManifest?.allowed_timeframes ?? []).map(norm).filter(Boolean);
  // the MATCHED phrase itself must be one that was supplied - a story
  // that legitimately mentions "market reference" does not license an
  // unrelated "eBay sold listings" claim in the same caption.
  const covered = (phrase, allow) => allow.some((a) => norm(phrase).includes(a) || a.includes(norm(phrase)));
  if (ex.source_language.length && !covered(ex.source_language[0], allowedSrc)) {
    findings.push({ code: "UNSUPPORTED_SOURCE_CLAIM_FAIL", detail: `invented source / methodology: "${ex.source_language[0]}"` });
  }
  if (ex.timeframe_language.length && !covered(ex.timeframe_language[0], allowedTf)) {
    findings.push({ code: "UNSUPPORTED_TIMEFRAME_FAIL", detail: `invented timeframe: "${ex.timeframe_language[0]}"` });
  }
  return findings;
}

export function checkCta({ cta = "", text = "" } = {}) {
  const findings = [];
  if (isEbayFirstCta(cta) || isEbayFirstCta(text)) {
    findings.push({ code: "EBAY_FIRST_CAPTION_FAIL", detail: `an eBay-first call to action ("${cta || text}")` });
  }
  return findings;
}

export function checkFactClaims(text, allowed) {
  const ex = extractCaptionClaims(text);
  const findings = [];
  const okP = (n) => allowed.prices.some((v) => neareq(v, n, Math.max(0.5, v * 0.01))) || allowed.safe_prices.includes(Math.round(n));
  const okPct = (n) => allowed.percentages.some((v) => neareq(v, n, 1));
  const okC = (n) => allowed.counts.some((v) => neareq(v, n, Math.max(1, v * 0.001))) || allowed.safe_counts.includes(n);
  for (const p of ex.prices) if (!okP(p)) findings.push({ code: "CAPTION_FACT_FAIL", detail: `price $${p} is not in the source of truth (allowed: ${allowed.prices.map((v) => `$${v}`).join(", ") || "none"})` });
  for (const pc of ex.percentages) if (!okPct(pc)) findings.push({ code: "CAPTION_FACT_FAIL", detail: `${pc}% is not in the source of truth (allowed: ${allowed.percentages.map((v) => `${v}%`).join(", ") || "none"})` });
  for (const bn of ex.big_numbers) if (!okC(bn)) findings.push({ code: "CAPTION_FACT_FAIL", detail: `the figure ${bn.toLocaleString("en-US")} is not in the source of truth` });
  return findings;
}

export function checkScope(text, semanticManifest = {}) {
  const S = semanticManifest || {};
  const findings = [];
  if (!S.example_card_is_not_population) return findings;
  const t = norm(text);
  for (const bad of S.forbidden_scope_phrases ?? []) {
    if (bad && t.includes(norm(bad))) findings.push({ code: "CAPTION_SCOPE_FAIL", detail: `stat wrongly scoped to the example card: "${bad}"` });
  }
  const ex = norm(S.example_card ?? "");
  const val = String(S.claim_value ?? "");
  // "<value>% of <species> singles" / "<population> <species> singles"
  if (ex && val) {
    const re = new RegExp(`(${val}\\s?%|[\\d,]{3,})[^.\\n]{0,24}\\b${ex}\\b[^.\\n]{0,12}\\b(singles?|cards?)\\b`, "i");
    if (re.test(text) && !/\btracked\b|\bexample\b|\ball\b/i.test(text.match(re)?.[0] ?? "")) {
      findings.push({ code: "CAPTION_SCOPE_FAIL", detail: `the population stat reads as "${text.match(re)[0].trim()}" - ${S.example_card} is only an example` });
    }
  }
  return findings;
}

export function checkDirection(text, semanticManifest = {}) {
  const S = semanticManifest || {};
  const findings = [];
  const trueRel = S.comparison_direction;
  if (!trueRel || trueRel === "UNKNOWN") return findings;
  const t = norm(text);
  for (const [word, needRel] of Object.entries(DIRECTION_WORDS)) {
    if (t.includes(word) && needRel !== trueRel) {
      findings.push({ code: "CAPTION_SEMANTIC_FAIL", detail: `"${word}" implies ${needRel.replace("_", " ").toLowerCase()} but the ask is ${trueRel.replace("_", " ").toLowerCase()}` });
    }
  }
  // a prohibited takeaway surfacing verbatim-ish
  if (trueRel === "BELOW_MARKET" && /\bdon'?t\s+pay\s+the\s+ask|\bask(ing)?\s+(price\s+)?is\s+too\s+high|\byou'?re\s+overpaying\b/i.test(text)) {
    findings.push({ code: "CAPTION_SEMANTIC_FAIL", detail: `"don't pay the ask" contradicts a below-market ask` });
  }
  if (trueRel === "ABOVE_MARKET" && /\bbargain\b|\bsteal\b|\bgreat\s+deal\b|\bbelow\s+market\b/i.test(text)) {
    findings.push({ code: "CAPTION_SEMANTIC_FAIL", detail: `"bargain / steal / below market" contradicts an above-market ask` });
  }
  return findings;
}

// ---- §27 IMAGE <-> CAPTION CONSISTENCY -------------------
// The caption must not assert a value that the approved image / manifest
// contradicts: a flipped comparison direction, or the population count
// bound to the example species.
export function checkImageConsistency(text, semanticManifest = {}) {
  const S = semanticManifest || {};
  const findings = [];
  const t = norm(text);
  const trueRel = S.comparison_direction;
  if (trueRel === "BELOW_MARKET" && /\d+\s?%\s+(above|over)\s+market\b/.test(t)) {
    findings.push({ code: "IMAGE_CAPTION_CONTRADICTION_FAIL", detail: `caption says "% above market" but the approved image shows ${S.comparison_pct}% BELOW market` });
  }
  if (trueRel === "ABOVE_MARKET" && /\d+\s?%\s+(below|under)\s+market\b/.test(t)) {
    findings.push({ code: "IMAGE_CAPTION_CONTRADICTION_FAIL", detail: `caption says "% below market" but the approved image shows ${S.comparison_pct}% ABOVE market` });
  }
  // population bound to the example species
  const popM = String(S.claim_population ?? "").match(/[\d,]{3,}/);
  const ex = norm(S.example_card ?? "");
  if (popM && ex) {
    const re = new RegExp(`${popM[0].replace(/,/g, "[,]?")}\\s+${ex}\\b`, "i");
    if (re.test(text)) findings.push({ code: "IMAGE_CAPTION_CONTRADICTION_FAIL", detail: `caption binds the population count to "${S.example_card}" - the image scopes it to all tracked singles` });
  }
  return findings;
}

// ---- §22 QUALITY SCORE (deterministic heuristic) ---------
export const CAPTION_QUALITY_DIMS = Object.freeze([
  "hook_strength", "clarity", "factual_density", "platform_fit", "non_spam", "brand_voice",
]);
const GENERIC_RE = /\bcheck\s+out\s+this\s+pok[eé]mon\s+card\b|\bamazing\s+(card|deal|find)\b|\bawesome\b|\bepic\b|\binsane\b|\bmust[\s-]?have\b/i;

export function scoreCaption({ hook = "", body = "", whyItMatters = "", cta = "", hashtags = [], platform = "instagram", captionText = "", allowed = null } = {}) {
  const full = captionText || [hook, body, whyItMatters, cta].filter(Boolean).join("\n\n");
  const len = full.length;
  const dims = {};

  // hook strength
  const hlen = hook.trim().length;
  let hs = 0;
  if (hlen >= 16 && hlen <= 110) hs += 12;
  else if (hlen) hs += 5;
  if (/\d/.test(hook) || /\b(why|how|most|myth|mistake|actually|turns out|here's)\b/i.test(hook)) hs += 6;
  if (!/[!]{1,}$/.test(hook.trim()) && hook.trim() === hook.trim().replace(/\b[A-Z]{4,}\b/g, (m) => m)) hs += 2;
  dims.hook_strength = Math.min(20, hs);

  // clarity
  const sentences = body.split(/[.!?]\s+/).filter(Boolean);
  let cl = 0;
  if (sentences.length && sentences.length <= 4) cl += 9;
  if (sentences.every((s) => s.length <= 160)) cl += 6;
  dims.clarity = Math.min(15, cl);

  // factual density
  const cx = extractCaptionClaims(full);
  const hasFact = cx.prices.length + cx.percentages.length + cx.big_numbers.length > 0;
  dims.factual_density = hasFact ? 20 : 0;

  // platform fit
  let pf = 0;
  if (platform === "instagram") pf = len >= 240 && len <= 1000 ? 15 : len >= 140 && len <= 1400 ? 8 : 2;
  else pf = len >= 90 && len <= 280 ? 15 : len <= 320 ? 8 : 1;
  dims.platform_fit = pf;

  // non spam
  let ns = 15;
  const tags = hashtags.length;
  if (platform === "instagram" && tags > 8) ns -= 6;
  if (platform === "x" && tags > 2) ns -= 6;
  if ((full.match(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu) || []).length > 3) ns -= 5;
  if ((full.match(/\b[A-Z]{4,}\b/g) || []).length > 2) ns -= 5;
  if (URGENCY_RE.test(full) || SCARCITY_RE.test(full) || INVESTMENT_RE.test(full)) ns -= 10;
  dims.non_spam = Math.max(0, ns);

  // brand voice
  let bv = 15;
  if (GENERIC_RE.test(full)) bv -= 12;
  if (!/\b(because|so that|which means|the point|worth|useful|compare|reference|actually)\b/i.test(full)) bv -= 4;
  dims.brand_voice = Math.max(0, bv);

  const score = Math.round(Object.values(dims).reduce((a, b) => a + b, 0));
  const generic = GENERIC_RE.test(full) || body.trim().length < 40;
  const verdict = score >= 70 && dims.factual_density > 0 && dims.platform_fit > 0 && !generic ? "PASS" : "HOLD";
  return { score, verdict, dims, generic };
}

// ---- MAIN: audit one platform caption --------------------
/**
 * auditCaption({ parts, captionText, family, platform, semanticManifest,
 *                factTrace, cardMetadataLock, sourceManifest,
 *                timeframeManifest, storyFlags })
 * -> { ok, state?, reason?, findings:[...], quality, verification }
 */
export function auditCaption({
  parts = {}, captionText = "", family = "", platform = "instagram",
  semanticManifest = {}, factTrace = [], cardMetadataLock = null,
  sourceManifest = null, timeframeManifest = null, storyFlags = {},
} = {}) {
  const hook = parts.hook ?? "";
  const body = parts.body ?? "";
  const why = parts.why_it_matters ?? "";
  const cta = parts.cta ?? "";
  const hashtags = parts.hashtags ?? [];
  const full = captionText || [hook, body, why, cta, hashtags.join(" ")].filter(Boolean).join("\n\n");
  const allowed = allowedFactsFor({ semanticManifest, factTrace, cardMetadataLock });

  const findings = [
    ...checkRawSeries({ hook, body, cta, family }),
    ...checkBannedLanguage(full, storyFlags),
    ...checkSourceTimeframe(full, { sourceManifest: sourceManifest ?? semanticManifest.source_attribution_manifest, timeframeManifest: timeframeManifest ?? semanticManifest.timeframe_manifest }),
    ...checkCta({ cta, text: full }),
    ...checkFactClaims(full, allowed),
    ...checkScope(full, semanticManifest),
    ...checkDirection(full, semanticManifest),
    ...checkImageConsistency(full, semanticManifest),
    // SOCIAL-CAPTION-5B.1 §2/§5
    ...auditPlaceholders(full),
    ...auditCaptionEntityLock(full, semanticManifest),
  ];

  const quality = scoreCaption({ hook, body, whyItMatters: why, cta, hashtags, platform, captionText: full, allowed });

  const verification = {
    raw_series: findings.some((f) => f.code === "RAW_SERIES_CAPTION_FAIL") ? "FAIL" : "PASS",
    banned_language: findings.some((f) => ["INVESTMENT_LANGUAGE_FAIL", "FAKE_URGENCY_FAIL", "UNSUPPORTED_SCARCITY_FAIL"].includes(f.code)) ? "FAIL" : "PASS",
    source_timeframe: findings.some((f) => ["UNSUPPORTED_SOURCE_CLAIM_FAIL", "UNSUPPORTED_TIMEFRAME_FAIL"].includes(f.code)) ? "FAIL" : "PASS",
    cta: findings.some((f) => f.code === "EBAY_FIRST_CAPTION_FAIL") ? "FAIL" : "PASS",
    fact_claims: findings.some((f) => f.code === "CAPTION_FACT_FAIL") ? "FAIL" : "PASS",
    scope: findings.some((f) => f.code === "CAPTION_SCOPE_FAIL") ? "FAIL" : "PASS",
    direction: findings.some((f) => f.code === "CAPTION_SEMANTIC_FAIL") ? "FAIL" : "PASS",
    image_consistency: findings.some((f) => f.code === "IMAGE_CAPTION_CONTRADICTION_FAIL") ? "FAIL" : "PASS",
    entity_lock: findings.some((f) => f.code === "CAPTION_ENTITY_MISMATCH") ? "FAIL" : "PASS",
    placeholder: findings.some((f) => f.code === "CAPTION_PLACEHOLDER_FAIL") ? "FAIL" : "PASS",
    quality_verdict: quality.verdict,
    quality_score: quality.score,
  };

  if (findings.length) {
    const ORDER = [
      "RAW_SERIES_CAPTION_FAIL", "CAPTION_PLACEHOLDER_FAIL", "CAPTION_ENTITY_MISMATCH",
      "IMAGE_CAPTION_CONTRADICTION_FAIL", "CAPTION_SCOPE_FAIL",
      "CAPTION_SEMANTIC_FAIL", "CAPTION_FACT_FAIL", "INVESTMENT_LANGUAGE_FAIL",
      "FAKE_URGENCY_FAIL", "UNSUPPORTED_SCARCITY_FAIL", "UNSUPPORTED_SOURCE_CLAIM_FAIL",
      "UNSUPPORTED_TIMEFRAME_FAIL", "EBAY_FIRST_CAPTION_FAIL",
    ];
    const state = ORDER.find((s) => findings.some((f) => f.code === s)) ?? findings[0].code;
    return { ok: false, ...failure(state, findings.map((f) => f.detail).join(" | ").slice(0, 400), { stage: "caption_audit", detail: { findings } }), findings, quality, verification };
  }

  if (quality.verdict !== "PASS") {
    return { ok: false, ...failure("CAPTION_QUALITY_HOLD", `weak / generic caption (score ${quality.score}/100${quality.generic ? ", generic phrasing" : ""})`, { stage: "caption_quality" }), findings: [], quality, verification };
  }

  return { ok: true, findings: [], quality, verification };
}
