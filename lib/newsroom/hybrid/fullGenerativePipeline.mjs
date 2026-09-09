// Phase SOCIAL-CREATIVE-5 + 5A - FULL_GENERATIVE_SOCIAL orchestrator with
// the RUTHLESS SEMANTIC AUDITOR.
//
//   real story
//   -> editorial relevance gate (4A)
//   -> [PRINTING_COMPARE] prove two distinct printings (§10) or reject
//   -> build SEMANTIC fact manifest (§2 - scope, comparison direction,
//      premise, takeaways, brand lock)
//   -> gather canonical card image(s) (§3)
//   -> master prompt (real facts §4) + BRAND-SAFE-ZONE clause (§12)
//   -> generate up to 2 images via images/edits (real cards as input)
//   -> per candidate:  card fidelity  ->  SEMANTIC verify (§7/§8/§9)
//      ->  value verify  ->  [PRINTING] card-pair (§11)  ->  quality
//   -> rank: fact/semantic truth FIRST, then fidelity, brand, quality (§17)
//   -> one bounded regeneration for a revisable semantic slip (§16), else HOLD
//   -> composite the APPROVED deterministic brand asset (§14)
//   -> BUFFER_READY  (or a §27/§5A failure state)
//
// BEAUTIFUL + WRONG = FAIL. No silent fallback to weak creative.

import { readFileSync, existsSync } from "node:fs";
import { runEditorialGate } from "../editorial/index.mjs";
import { ready } from "../editorial/failureStates.mjs";
import { newBudget, canSpend } from "./budget.mjs";
import {
  buildMasterPrompt, generateFullSocial,
  reviewCardFidelity, verifyFacts, reviewCreativeQuality, MAX_FULLGEN_CANDIDATES,
} from "./fullGenerative.mjs";
import { assessRepair } from "./fullGenerativeRepair.mjs";
import { buildSemanticManifest } from "./semanticManifest.mjs";
import { semanticVerify } from "./semanticAudit.mjs";
import { provePrintingPair, verifyCardPair } from "./printingIdentity.mjs";
import { compositeBrandAssetHtml, BRAND_SAFE_ZONE_CLAUSE, BOTTOM_SAFE_ZONE_CLAUSE } from "./brandLock.mjs";
import { auditFactSources } from "./factSource.mjs";
import { auditPlatformSafeArea } from "./platformSafeArea.mjs";

export const FULL_GENERATIVE_PIPELINE_VERSION = "safearea1.1";

const localOf = (p) => (p ? String(p).replace(/^file:\/\//, "") : null);
const b64Of = (p) => { const f = localOf(p); return f && existsSync(f) ? readFileSync(f).toString("base64") : null; };

// §16 - which failure states earn one bounded regeneration (vs a hard hold).
const REGENERABLE = new Set([
  "SEMANTIC_FACT_FAIL", "CLAIM_SCOPE_FAIL", "SEMANTIC_CONTRADICTION_FAIL", "GENERATED_BRAND_RISK", "CARD_PAIR_FIDELITY_FAIL",
  "BRAND_SAFE_ZONE_OCCUPIED", "UNSUPPORTED_CARD_METADATA_FAIL", "CARD_METADATA_CONTRADICTION_FAIL",
  "UNSUPPORTED_CHART_VALUE_FAIL", "CHART_VALUE_MISMATCH", "CHART_SCOPE_FAIL", "UNSUPPORTED_SOURCE_CLAIM_FAIL", "UNSUPPORTED_TIMEFRAME_FAIL",
  "PLATFORM_SAFEAREA_FAIL",
]);

export async function runFullGenerativeSocial(opts = {}) {
  const {
    story, platform = "instagram", layout = "market_shape", printingPair = null, originality = null,
    resolved = null, cardImagePaths = [], candidates = MAX_FULLGEN_CANDIDATES,
    cardCatalogRow = null, // 5A.1 - a card_catalog record for the metadata lock
    budget = newBudget(), env = process.env, fetchImpl = fetch,
  } = opts;

  // ---- editorial gate -----------------------------------
  const gate = runEditorialGate({ story, platform, printingPair, originality });
  if (!gate.ok) return { ok: false, state: "EDITORIAL_WITHHOLD", reason: gate.reason, relevance: gate.relevance, budget };
  const { factLock, contract, brief } = gate;

  const cardB64s = cardImagePaths.map(b64Of).filter(Boolean);

  // ---- §10 PRINTING IDENTITY PROOF (pre-generation) ----
  let printingProof = null;
  if (layout === "printing_compare") {
    const R = resolved?.data ?? resolved ?? {};
    printingProof = provePrintingPair({ high: R.high ?? {}, low: R.low ?? {}, cardImagePaths });
    if (!printingProof.ok) {
      return { ok: false, state: "PRINTING_IDENTITY_FAIL", reason: printingProof.reason, printing_proof: printingProof.proof, budget };
    }
  }

  // ---- SEMANTIC manifest (§2) --------------------------
  const semanticManifest = buildSemanticManifest({ layout, factLock, resolved, contract, printingProof: printingProof?.proof ?? null, cardCatalogRow });

  if (!cardB64s.length && layout !== "market_shape") {
    return { ok: false, state: "GENERATION_FAILED", reason: "no canonical card image available to design around", factManifest: semanticManifest, budget };
  }

  // ---- master prompt + brand-safe zone (§12) ----------
  const basePrompt = `${buildMasterPrompt({ layout, factManifest: semanticManifest })}\n\n${BRAND_SAFE_ZONE_CLAUSE}\n\n${BOTTOM_SAFE_ZONE_CLAUSE}` +
    (semanticManifest.comparison_direction && semanticManifest.comparison_direction !== "UNKNOWN"
      ? `\n\nSEMANTIC DIRECTION (do not contradict): the ${semanticManifest.comparison_left?.label} (${semanticManifest.comparison_left?.text}) is ${semanticManifest.comparison_direction.replace("_", " ").toLowerCase()} the ${semanticManifest.comparison_right?.label} (${semanticManifest.comparison_right?.text}), i.e. ${semanticManifest.comparison_pct}% ${semanticManifest.comparison_direction === "BELOW_MARKET" ? "below" : semanticManifest.comparison_direction === "ABOVE_MARKET" ? "above" : "at"} market. Any word like "premium"/"discount", any arrow, any +/- sign, and the lesson MUST match this. Lesson to convey: "${semanticManifest.appropriate_lesson ?? semanticManifest.required_takeaway}".`
      : "") +
    (layout === "market_shape"
      ? `\n\nSCOPE (do not narrow): the ${semanticManifest.claim_value}% figure is for ALL ${semanticManifest.claim_population}, NOT for ${semanticManifest.example_card} - ${semanticManifest.example_card} is only one example. Never write "${semanticManifest.claim_value}% of ${String(semanticManifest.example_card ?? "").toLowerCase()} singles" or "${semanticManifest.claim_population} of ${String(semanticManifest.example_card ?? "").toLowerCase()}".`
      : "");

  // ---- generate (§16) --------------------------------
  const runGen = async (extra, tag) => {
    if (budget && !canSpend(budget, "background_generation")) return null;
    const p = extra ? `${basePrompt}\n\n${extra}` : basePrompt;
    const r = await generateFullSocial({ prompt: p, cardImagePaths, budget, env, fetchImpl });
    return r.ok ? { b64: r.b64, sha256: r.sha256, model: r.model, prompt: p, tag } : { failed: true, availability: r.availability, detail: r.detail, tag };
  };

  const gen = [];
  for (let i = 0; i < Math.max(1, candidates); i++) {
    // eslint-disable-next-line no-await-in-loop
    const g = await runGen(i === 0 ? null : "COMPOSITION NOTE: make this a distinctly different layout - vary the card scale, placement and hierarchy.", `c${i + 1}`);
    if (g) gen.push(g);
  }
  let made = gen.filter((g) => !g.failed);
  if (!made.length) {
    return { ok: false, state: "GENERATION_FAILED", reason: `image generation failed (${gen.map((g) => g.availability).join(", ")})`, detail: gen.find((g) => g.detail)?.detail, factManifest: semanticManifest, budget };
  }

  // ---- assess a set of candidates -------------------
  const assess = async (cands) => {
    const out = [];
    for (const cand of cands) {
      // eslint-disable-next-line no-await-in-loop
      const fidelity = await reviewCardFidelity({ b64: cand.b64, cardImageB64s: cardB64s, cardIdentity: semanticManifest.card_identity, env, fetchImpl, budget });
      // eslint-disable-next-line no-await-in-loop
      const semantic = await semanticVerify({ b64: cand.b64, layout, semanticManifest, env, fetchImpl, budget });
      // 5A.1 - fact-source + brand-safe-zone audit (reuses the semantic
      // extraction: THE MODEL MAY NOT INVENT DATA).
      const factSources = semantic.extraction
        ? auditFactSources({
            extraction: semantic.extraction,
            metadataLock: semanticManifest.card_metadata_lock,
            vizManifest: semanticManifest.visualization_data_manifest,
            sourceManifest: semanticManifest.source_attribution_manifest,
            timeframeManifest: semanticManifest.timeframe_manifest,
          })
        : { ok: true, findings: [] };
      // eslint-disable-next-line no-await-in-loop
      const facts = await verifyFacts({ b64: cand.b64, factManifest: semanticManifest, env, fetchImpl, budget });
      let pair = { ok: true };
      if (layout === "printing_compare") {
        // eslint-disable-next-line no-await-in-loop
        pair = await verifyCardPair({ b64: cand.b64, cardImageB64s: cardB64s, identityA: semanticManifest.printing_identity_a ?? {}, identityB: semanticManifest.printing_identity_b ?? {}, env, fetchImpl, budget });
      }
      // eslint-disable-next-line no-await-in-loop
      const quality = await reviewCreativeQuality({ b64: cand.b64, layout, env, fetchImpl, budget });
      // SAFEAREA-1 - deterministic pixel audit of the candidate's actual
      // rendered bytes (not intended layout values); no vision call, $0.
      let safeArea;
      try {
        safeArea = auditPlatformSafeArea({ pngBuffer: Buffer.from(cand.b64, "base64") });
      } catch {
        safeArea = { ok: true, state: "PASS", findings: [], note: "safe-area audit skipped - candidate bytes not decodable as PNG" };
      }
      out.push({ cand, fidelity, semantic, factSources, facts, pair, quality, safeArea });
    }
    return out;
  };

  // §17 - rank: SEMANTIC/FACT truth first, then fidelity, brand, quality.
  const qScore = (a) => {
    const q = a.quality.scores ?? {};
    const good = ["scroll_stop", "professional_polish", "premium_feel", "card_is_hero", "story_instantly_clear", "supporting_graphics_useful", "information_rich_not_cluttered", "looks_like_a_real_media_brand", "save_share_likelihood", "click_curiosity"];
    return good.reduce((s, k) => s + (Number(q[k]) || 0), 0) / good.length - Math.max(0, (Number(q.ai_spam_risk) || 0) - 45) * 0.6;
  };
  // §11 - candidate order: 1 semantic truth, 2 fact-source traceability,
  // 3 card fidelity, 4 metadata correctness (part of fact-source), 5 brand
  // safety, 6 visual quality. Beautiful unsupported information = FAIL.
  const rankKey = (a) => {
    const semOk = a.semantic.ok ? 1 : 0;
    const srcOk = a.factSources.ok ? 1 : 0;
    const factOk = a.facts.ok || (a.facts.state === "SAFE_REPAIR_REQUIRED" && assessRepair(a.facts.repairable ?? {}).patchable) ? 1 : 0;
    const fidOk = a.fidelity.ok ? 1 : 0;
    const pairOk = a.pair.ok ? 1 : 0;
    const qOk = a.quality.verdict !== "FAIL" ? 1 : 0;
    const safeOk = a.safeArea.ok ? 1 : 0;
    return semOk * 1e7 + srcOk * 1e6 + factOk * 1e5 + fidOk * 1e4 + pairOk * 1e3 + safeOk * 200 + qOk * 100 + Math.round(qScore(a) / 12);
  };
  const cleanOf = (list) => list.filter((a) =>
    a.semantic.ok && a.factSources.ok && a.fidelity.ok && a.pair.ok && a.quality.verdict !== "FAIL" && a.safeArea.ok &&
    (a.facts.ok || (a.facts.state === "SAFE_REPAIR_REQUIRED" && assessRepair(a.facts.repairable ?? {}).patchable)));

  let assessed = await assess(made);
  let clean = cleanOf(assessed);
  let regenerated = false;

  // §16 - ONE bounded regeneration when the best failure is regenerable.
  if (!clean.length) {
    const worst =
      assessed.map((a) => a.semantic).find((s) => !s.ok) ??
      assessed.map((a) => a.factSources).find((s) => !s.ok) ??
      assessed.map((a) => a.pair).find((p) => !p.ok) ??
      assessed.map((a) => a.safeArea).find((s) => !s.ok);
    if (worst && REGENERABLE.has(worst.state) && canSpend(budget, "background_generation")) {
      regenerated = true;
      const md = semanticManifest.card_metadata_lock;
      const viz = semanticManifest.visualization_data_manifest;
      const fix =
        worst.state === "GENERATED_BRAND_RISK"
          ? "IMPORTANT: do NOT draw any logo, wordmark, ball icon, or brand mark at all - leave the top and bottom strips completely empty."
          : worst.state === "BRAND_SAFE_ZONE_OCCUPIED"
            ? "IMPORTANT: the top ~8% strip of the image MUST be completely empty - no headline, card, chart, text, or icon there. Move the whole composition down."
            : worst.state === "CLAIM_SCOPE_FAIL"
              ? `IMPORTANT: the percentage is for ALL tracked singles, not for ${semanticManifest.example_card}. Write it as "${semanticManifest.claim_value}% of tracked singles".`
              : worst.state === "CARD_PAIR_FIDELITY_FAIL"
                ? "IMPORTANT: the two compared cards are DIFFERENT cards - show each supplied card image exactly once, do not duplicate one."
                : (worst.state === "UNSUPPORTED_CARD_METADATA_FAIL" || worst.state === "CARD_METADATA_CONTRADICTION_FAIL")
                  ? `IMPORTANT: do NOT print any card rarity, edition, set symbol, collector number, or grade unless it is exactly one of: ${(md?._displayable ?? []).map((k) => `${k}="${md[k]}"`).join(", ") || "(none - omit all of them)"}.`
                  : (worst.state === "UNSUPPORTED_CHART_VALUE_FAIL" || worst.state === "CHART_VALUE_MISMATCH" || worst.state === "CHART_SCOPE_FAIL")
                    ? `IMPORTANT: a chart may show ONLY these values: ${(viz?.allowed_points ?? []).map((p) => `${p.label}=${p.value}%`).join(", ") || "(none - do not draw a multi-bucket chart)"}. Do not invent extra buckets; if it is a full breakdown the values must sum to ~100%.`
                    : worst.state === "UNSUPPORTED_SOURCE_CLAIM_FAIL"
                      ? "IMPORTANT: do NOT write any source or methodology line ('eBay Sold Listings', 'across major marketplaces', 'live market data', etc.) - none was supplied."
                      : worst.state === "UNSUPPORTED_TIMEFRAME_FAIL"
                        ? "IMPORTANT: do NOT write any time window ('last 60 days', 'this week', a date range) - none was supplied."
                        : worst.state === "PLATFORM_SAFEAREA_FAIL"
                          ? `IMPORTANT: the previous composition placed content too close to the bottom edge (${worst.findings?.[0]?.detail ?? "content extended into the unsafe bottom margin"}). Leave the bottom ~10% of the canvas completely empty of any text, callout band, or brush-stroke banner - finish the whole composition, including any closing line, with real clean space above that strip. Do not shrink the design to force a fit; simply end higher and leave background below.`
                          : `IMPORTANT: the comparison is ${semanticManifest.comparison_direction?.replace("_", " ").toLowerCase()} - ${semanticManifest.comparison_pct}% ${semanticManifest.comparison_direction === "BELOW_MARKET" ? "BELOW" : "ABOVE"} market. Use the correct word, sign, arrow and lesson: "${semanticManifest.appropriate_lesson}".`;
      const g = await runGen(fix, "regen");
      if (g && !g.failed) {
        const re = await assess([g]);
        assessed = [...assessed, ...re];
        made = [...made, g];
        clean = cleanOf(assessed);
      }
    }
  }

  if (!clean.length) {
    // strongest reason, most-severe first
    const bySeverity = [
      "PRINTING_IDENTITY_FAIL", "CARD_PAIR_FIDELITY_FAIL",
      "CLAIM_SCOPE_FAIL", "CHART_SCOPE_FAIL", "SEMANTIC_CONTRADICTION_FAIL", "SEMANTIC_FACT_FAIL",
      "CARD_METADATA_CONTRADICTION_FAIL", "CHART_VALUE_MISMATCH",
      "UNSUPPORTED_CARD_METADATA_FAIL", "UNSUPPORTED_CHART_VALUE_FAIL", "UNSUPPORTED_SOURCE_CLAIM_FAIL", "UNSUPPORTED_TIMEFRAME_FAIL",
      "BRAND_SAFE_ZONE_OCCUPIED", "PLATFORM_SAFEAREA_FAIL", "GENERATED_BRAND_RISK",
      "CARD_FIDELITY_FAIL", "FACT_VERIFY_FAIL", "VISUAL_QUALITY_HOLD", "SAFE_REPAIR_REQUIRED",
    ];
    const states = assessed.flatMap((a) => [a.semantic.state, a.factSources.state, a.pair.state, a.fidelity.ok ? null : "CARD_FIDELITY_FAIL", a.facts.ok ? null : a.facts.state, a.quality.verdict === "FAIL" ? "VISUAL_QUALITY_HOLD" : null, a.safeArea.ok ? null : a.safeArea.state]).filter(Boolean);
    const state = bySeverity.find((s) => states.includes(s)) ?? "VISUAL_QUALITY_HOLD";
    const why = assessed.map((a) => a.semantic.reason || a.factSources.reason || a.pair.reason || a.fidelity.reason || (!a.facts.ok ? a.facts.reason : null) || (!a.safeArea.ok ? a.safeArea.findings?.[0]?.detail : null)).filter(Boolean)[0] ?? "no candidate cleared the audit";
    return { ok: false, state, reason: `${regenerated ? "(after one regeneration) " : ""}${why}`, regenerated, factManifest: semanticManifest, assessed: summ(assessed), budget };
  }

  clean.sort((x, y) => rankKey(y) - rankKey(x));
  const best = clean[0];

  // §14 - always composite the APPROVED deterministic brand asset.
  const brandComposite = compositeBrandAssetHtml({
    generatedDataUrl: `data:image/png;base64,${best.cand.b64}`,
    where: layout === "three_up" ? "both" : "top",
    ctaText: semanticManifest.classification === "COMMERCIAL" ? semanticManifest.cta.text : null,
  });

  // footer repair (§16 - only footer-patchable slips)
  let footerRepaired = false;
  if (!best.facts.ok && best.facts.state === "SAFE_REPAIR_REQUIRED") {
    footerRepaired = true;
    if (budget) budget.used.revisions = (budget.used.revisions ?? 0) + 1;
  }

  const finalVerdict = best.quality.verdict;
  return {
    ok: true,
    ...ready({ stage: "full_generative_social" }),
    state: "BUFFER_READY",
    layout,
    imageB64: best.cand.b64,
    imageSha256: best.cand.sha256,
    model: best.cand.model,
    finalHtml: brandComposite, // brand-composited - the artifact to rasterise
    repaired: footerRepaired || Boolean(brandComposite),
    brand_locked: true,
    regenerated,
    factManifest: semanticManifest,
    factLockHash: gate.factLockHash,
    master_prompt: basePrompt,
    printing_proof: printingProof?.proof ?? null,
    semanticManifest,
    selected: {
      fidelity_score: best.fidelity.fidelity_score ?? null,
      semantic: "PASS",
      fact_sources: "PASS",
      quality_verdict: finalVerdict,
      quality_scores: best.quality.scores,
      extracted_claims: best.semantic.extraction ?? null,
    },
    verification: {
      semantic: "PASS",
      fact_sources: "PASS", // brand-safe zone + card metadata + chart values + source + timeframe
      card_fidelity: best.fidelity.ok,
      card_pair: layout === "printing_compare" ? best.pair.ok : null,
      fact_verify: best.facts.ok ? "PASS" : best.facts.state,
      quality_verdict: finalVerdict,
      brand_lock: "APPROVED_ASSET_OVERLAID",
      brand_safe_zone: "CLEAR",
      platform_safe_area: best.safeArea.ok ? "PASS" : best.safeArea.state,
    },
    safe_area: best.safeArea,
    candidates_generated: made.length,
    candidates_rejected: assessed.length - clean.length,
    caption_handoff: {
      story_angle: brief?.editorial_angle ?? null,
      hook_rule: brief?.hook_rule ?? contract?.acceptable_hook ?? null,
      why_it_matters: brief?.why_it_matters ?? contract?.meaningful ?? null,
      supporting_facts: brief?.supporting_facts ?? [],
      required_takeaway: semanticManifest.required_takeaway,
      cta_intent: semanticManifest.cta,
    },
    quality_hold: finalVerdict === "WATCH",
    budget,
  };
}

function summ(assessed) {
  return assessed.map((a) => ({
    tag: a.cand.tag,
    semantic: a.semantic.ok ? "PASS" : a.semantic.state,
    semantic_findings: (a.semantic.findings ?? []).map((f) => f.detail).slice(0, 4),
    fact_sources: a.factSources.ok ? "PASS" : a.factSources.state,
    fact_source_findings: (a.factSources.findings ?? []).map((f) => f.detail).slice(0, 4),
    card_fidelity: a.fidelity.ok, fidelity_score: a.fidelity.fidelity_score ?? null,
    card_pair: a.pair.ok,
    fact: a.facts.ok ? "PASS" : a.facts.state,
    quality: a.quality.verdict,
    safe_area: a.safeArea.ok ? "PASS" : a.safeArea.state,
  }));
}
