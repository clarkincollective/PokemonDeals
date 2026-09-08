// Phase SOCIAL-CREATIVE-5A - SEMANTIC VISION REVIEW + DETERMINISTIC AUDIT
// (§3, §4, §7, §8, §9, §13).
//
// "All the numbers are present" is NEVER a PASS. The vision model EXTRACTS
// structured claims / comparisons / takeaways / logos from the finished
// image; then this module compares that extraction deterministically to
// the semantic manifest:
//   * claim scope (§3)      - the stat's subject must be the population,
//     not the example card.
//   * comparison direction (§4) - "premium" only when ABOVE_MARKET, etc.
//   * math (§8)             - recompute every derived number.
//   * contradiction (§9)    - headline vs table, arrow vs sign, lesson vs
//     direction, "same card" vs distinct ids, ...
//   * takeaways (§6)        - required present, prohibited absent.
//   * brand risk (§13)      - a Poke Ball-like / official-looking mark.
//
// Vision boundary = visualReview.mjs. No key -> the post is NOT cleared.

import { failure } from "../editorial/failureStates.mjs";
import { comparisonDirection, recomputeDerivedFacts, DIRECTION_WORDS } from "./semanticManifest.mjs";
import { isEbayFirstCta } from "./cta.mjs";
import { recordCall } from "./budget.mjs";

const ENDPOINT = "https://api.openai.com/v1/chat/completions";
const MODEL = process.env.SOCIAL_VISUAL_REVIEW_MODEL || "gpt-4o";

// ---- §7 STRUCTURED CLAIM EXTRACTION -----------------------
export async function extractImageClaims({ b64, layout, env = process.env, fetchImpl = fetch, budget = null } = {}) {
  const key = env.SOCIAL_VISUAL_REVIEW_API_KEY || env.OPENAI_API_KEY;
  if (!key) return { ok: false, availability: "no_key" };
  const t0 = Date.now();
  const prompt =
    `Read this finished social post (${layout}) EXACTLY as written. Do NOT infer or correct anything - report what the image literally says.\n\n` +
    `Extract, as one JSON object:\n` +
    `- claims: [{ "subject": "what the statement is about (the exact noun phrase)", "predicate": "...", "value": "the number/string stated", "qualifier": "...", "scope": "the population the claim is about, verbatim" }]\n` +
    `- comparisons: [{ "left": "left label + value", "right": "right label + value", "stated_relation": "one of: premium | discount | above market | below market | equal | none", "stated_pct": "the % shown for the comparison, or null", "arrow_direction": "up | down | none", "colour_of_main_number": "green | red | white | other | none" }]\n` +
    `- takeaways: ["every lesson / advice / call-to-action sentence, verbatim"]\n` +
    `- headline: "the biggest text line, verbatim"\n` +
    `- all_numbers: ["every number, %, or price shown, verbatim"]\n` +
    `- logos_detected: ["describe every logo / brand mark / icon that reads as a brand - especially any ball-shaped, red-and-white, or official-Pokemon-style mark"]\n` +
    `- brand_wordmark_text: "the brand name text as shown, or null"\n` +
    `- two_cards_look_identical: <bool, only for a two-card comparison - true if the two card images look like the same card>\n` +
    `Respond with ONLY that one JSON object.`;
  try {
    const res = await fetchImpl(ENDPOINT, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: MODEL, temperature: 0, max_tokens: 900, response_format: { type: "json_object" }, messages: [{ role: "user", content: [{ type: "text", text: prompt }, { type: "image_url", image_url: { url: `data:image/png;base64,${b64}`, detail: "high" } }] }] }),
      signal: AbortSignal.timeout(60000),
    });
    if (budget) recordCall(budget, "visual_review_call", { ok: res.ok, latencyMs: Date.now() - t0, detail: "claim_extract" });
    if (!res.ok) return { ok: false, availability: `http_${res.status}` };
    const body = await res.json();
    const m = (body?.choices?.[0]?.message?.content ?? "").match(/\{[\s\S]*\}/);
    return m ? { ok: true, extraction: JSON.parse(m[0]) } : { ok: false, availability: "unparseable" };
  } catch (e) {
    if (budget) recordCall(budget, "visual_review_call", { ok: false, latencyMs: Date.now() - t0, detail: "claim_extract_error" });
    return { ok: false, availability: `error:${String(e?.message ?? e).slice(0, 80)}` };
  }
}

const norm = (s) => String(s ?? "").toLowerCase().replace(/[\s,]+/g, " ").trim();

// ---- §13 BRAND RISK ------------------------------------
// A GENERATED brand mark / logo that is ball-shaped or official-Pokemon-
// style. NOT the card's own printed copyright line (© ... Nintendo /
// Creatures / GAMEFREAK), which legitimately appears on the real canonical
// card art.
const BALL_RE = /pok[eé]\s*ball|red[\s-]?(and[\s-]?)?white\s*(ball|circle|sphere|disc)|red\/white\s*(ball|circle)|official[\s-]?looking\s*(pok[eé]mon|brand)|\bofficial\s*pok[eé]mon\b|the\s*pok[eé]mon\s*company\s*(logo|mark)|split\s*circle\s*(logo|icon|mark|button)|ball[\s-]?(shaped|like|style)\s*(logo|icon|mark|button|brand)|nintendo[\s-]?style\s*(logo|mark|brand)/i;
// phrases that mean "this is text/detail ON the real card", not a generated logo
const CARD_OWN_TEXT_RE = /\bon the (real |canonical |trading )?card\b|copyright|©|\(c\)|gamefreak|game\s*freak|creatures\s*inc|\billus\b|card'?s? (own|printed|bottom)|part of the card art|within the card|inside the card frame/i;
export function detectGeneratedBrandRisk(extraction = {}) {
  const logos = [extraction.brand_wordmark_text, ...(extraction.logos_detected ?? [])].filter(Boolean).map(String);
  const hits = logos.filter((l) => BALL_RE.test(l) && !CARD_OWN_TEXT_RE.test(l));
  // a plain "circle + handle" magnifier is the APPROVED mark - not a risk
  const magnifierOnly = (l) => /magnif|search\s*(glass|icon)|circle\s*(and|with)\s*(a\s*)?(handle|line|diagonal)/i.test(l) && !/ball|split circle/i.test(l);
  const risky = hits.filter((l) => !magnifierOnly(l));
  return { risk: risky.length > 0, hits: risky };
}

// ---- MAIN AUDIT -------------------------------------
/**
 * auditSemantics({ extraction, semanticManifest }) - pure deterministic.
 * Returns { ok, state?, reason?, findings:[...] }.
 */
export function auditSemantics({ extraction = {}, semanticManifest: S = {} } = {}) {
  const findings = [];
  const flat = norm([extraction.headline, ...(extraction.takeaways ?? []), ...(extraction.all_numbers ?? []),
    ...(extraction.claims ?? []).flatMap((c) => [c.subject, c.predicate, c.value, c.qualifier, c.scope]),
    ...(extraction.comparisons ?? []).flatMap((c) => [c.left, c.right, c.stated_relation])].join(" | "));

  // ---- §3 CLAIM SCOPE -------------------------------
  if (S.example_card_is_not_population) {
    for (const bad of S.forbidden_scope_phrases ?? []) {
      if (bad && flat.includes(norm(bad))) findings.push({ code: "CLAIM_SCOPE_FAIL", detail: `stat wrongly scoped to the example card: "${bad}"` });
    }
    const ex = norm(S.example_card ?? "");
    // any claim whose subject/scope names the example card as the population
    for (const c of extraction.claims ?? []) {
      const subj = norm(c.subject);
      const scope = norm(c.scope);
      const looksLikeThePopulationStat = /%|percent|under \$?25|sell/.test(norm(`${c.predicate} ${c.value} ${c.qualifier}`)) || String(c.value ?? "").includes(String(S.claim_value ?? "###"));
      if (ex && looksLikeThePopulationStat && (subj.includes(ex) || scope.includes(ex)) && !subj.includes("tracked") && !scope.includes("tracked") && !scope.includes("example")) {
        findings.push({ code: "CLAIM_SCOPE_FAIL", detail: `the population stat is attributed to "${c.subject}" (an example card), not the tracked population` });
      }
      if (ex && /\bsingles?\b/.test(scope) && scope.includes(ex)) {
        findings.push({ code: "CLAIM_SCOPE_FAIL", detail: `scope says "${c.scope}" - "${S.example_card} singles" is not the population` });
      }
    }
  }

  // ---- §4 COMPARISON DIRECTION --------------------
  if (S.comparison_direction && S.comparison_direction !== "UNKNOWN") {
    const trueRel = S.comparison_direction; // ABOVE_MARKET | BELOW_MARKET | NEAR_MARKET
    for (const cmp of extraction.comparisons ?? []) {
      const stated = norm(cmp.stated_relation);
      for (const [word, needRel] of Object.entries(DIRECTION_WORDS)) {
        if (stated.includes(word) && needRel !== trueRel) {
          findings.push({ code: "SEMANTIC_FACT_FAIL", detail: `comparison says "${cmp.stated_relation}" but the ask is ${trueRel.replace("_", " ").toLowerCase()} (${S.comparison_left?.text} vs ${S.comparison_right?.text})` });
        }
      }
      // arrow vs sign
      if (cmp.arrow_direction === "up" && trueRel === "BELOW_MARKET") findings.push({ code: "SEMANTIC_CONTRADICTION_FAIL", detail: "an upward arrow on a below-market comparison" });
      if (cmp.arrow_direction === "down" && trueRel === "ABOVE_MARKET") findings.push({ code: "SEMANTIC_CONTRADICTION_FAIL", detail: "a downward arrow on an above-market comparison" });
      // §15 colour semantics on the main number
      if (cmp.colour_of_main_number === "green" && trueRel === "ABOVE_MARKET") findings.push({ code: "SEMANTIC_CONTRADICTION_FAIL", detail: "an above-market premium shown in value-positive green" });
      // stated pct sign / magnitude
      if (cmp.stated_pct != null) {
        const p = Number(String(cmp.stated_pct).replace(/[^\d.-]/g, ""));
        const negShown = /-/.test(String(cmp.stated_pct)) || /below|discount|off/.test(stated);
        if (Number.isFinite(p) && S.comparison_pct != null && Math.abs(Math.abs(p) - S.comparison_pct) > 2) {
          findings.push({ code: "SEMANTIC_FACT_FAIL", detail: `comparison % shown "${cmp.stated_pct}" but the true figure is ${S.comparison_pct}% ${trueRel === "BELOW_MARKET" ? "below" : "above"} market` });
        }
        // "PREMIUM -75%" style: a "premium" word with a negative/below sign
        if (/premium|above/.test(stated) && (negShown || /below/.test(flat))) {
          findings.push({ code: "SEMANTIC_CONTRADICTION_FAIL", detail: `"${cmp.stated_relation}" paired with a negative / below-market figure "${cmp.stated_pct}"` });
        }
      }
    }
    // headline direction word
    for (const [word, needRel] of Object.entries(DIRECTION_WORDS)) {
      if (norm(extraction.headline).includes(word) && needRel !== trueRel) {
        findings.push({ code: "SEMANTIC_FACT_FAIL", detail: `headline uses "${word}" but the relationship is ${trueRel}` });
      }
    }
  }

  // ---- §6 TAKEAWAYS -------------------------------
  const takeaways = (extraction.takeaways ?? []).map(norm);
  for (const bad of S.prohibited_takeaways ?? []) {
    const b = norm(bad);
    // heuristic phrase-match on the strongest tokens of the prohibited rule
    if (/below market when ask.*<.*market|ask is too high when ask.*<.*market|too high when ask.*<.*market/.test(b)) {
      if (S.comparison_direction === "BELOW_MARKET" && takeaways.some((t) => /don'?t pay the ask|ask is too high|overpaying|you'?re overpaying/.test(t))) {
        findings.push({ code: "SEMANTIC_FACT_FAIL", detail: `takeaway "${(extraction.takeaways ?? []).find((t) => /don'?t pay the ask|too high|overpay/i.test(t)) ?? "(don't pay the ask)"}" contradicts a below-market ask` });
      }
    }
    if (/bargain when ask.*>.*market|a bargain when ask.*>.*market/.test(b)) {
      if (S.comparison_direction === "ABOVE_MARKET" && takeaways.some((t) => /bargain|steal|great deal|below market/.test(t))) {
        findings.push({ code: "SEMANTIC_FACT_FAIL", detail: "takeaway calls an above-market ask a bargain" });
      }
    }
  }
  // §9 - "same card" vs distinct printing
  if (S.layout === "printing_compare") {
    if (extraction.two_cards_look_identical === true && S.printing_axis) {
      findings.push({ code: "PRINTING_IDENTITY_FAIL", detail: "the two compared card images look identical while a printing difference is claimed" });
    }
    if (takeaways.some((t) => /same card/.test(t)) && S.printing_axis) {
      findings.push({ code: "SEMANTIC_CONTRADICTION_FAIL", detail: `"same card" stated alongside a "${S.printing_axis}" printing claim` });
    }
  }

  // ---- §8 MATH -----------------------------------
  const math = recomputeDerivedFacts(S);
  for (const err of math.errors) findings.push({ code: "SEMANTIC_FACT_FAIL", detail: `derived ${err.field}: expected ${err.expected}, post shows ${err.got}` });

  // ---- CTA (still website-first) ------------------
  if (takeaways.some((t) => isEbayFirstCta(t)) || isEbayFirstCta(extraction.headline)) {
    findings.push({ code: "SEMANTIC_FACT_FAIL", detail: "an eBay-first call to action" });
  }

  // ---- §13 BRAND RISK ----------------------------
  const brand = detectGeneratedBrandRisk(extraction);
  if (brand.risk) findings.push({ code: "GENERATED_BRAND_RISK", detail: `generated brand mark risk: ${brand.hits.join("; ")}` });

  if (!findings.length) return { ok: true, findings: [] };
  // pick the most severe state (order matters)
  const ORDER = ["PRINTING_IDENTITY_FAIL", "CARD_PAIR_FIDELITY_FAIL", "CLAIM_SCOPE_FAIL", "SEMANTIC_CONTRADICTION_FAIL", "SEMANTIC_FACT_FAIL", "GENERATED_BRAND_RISK"];
  const state = ORDER.find((s) => findings.some((f) => f.code === s)) ?? "SEMANTIC_FACT_FAIL";
  return { ok: false, ...failure(state, findings.map((f) => f.detail).join(" | ").slice(0, 400), { stage: "semantic_audit", detail: { findings } }), findings };
}

// Convenience: extract + audit in one call.
export async function semanticVerify({ b64, layout, semanticManifest, env = process.env, fetchImpl = fetch, budget = null } = {}) {
  const key = env.SOCIAL_VISUAL_REVIEW_API_KEY || env.OPENAI_API_KEY;
  if (!key) return { ok: false, ...failure("SEMANTIC_FACT_FAIL", "no key to run the §7 semantic vision review") };
  const ex = await extractImageClaims({ b64, layout, env, fetchImpl, budget });
  if (!ex.ok) return { ok: false, ...failure("SEMANTIC_FACT_FAIL", `claim extraction unavailable (${ex.availability})`) };
  const audit = auditSemantics({ extraction: ex.extraction, semanticManifest });
  return { ...audit, extraction: ex.extraction };
}

export const SEMANTIC_AUDIT_VERSION = "5a.1";
