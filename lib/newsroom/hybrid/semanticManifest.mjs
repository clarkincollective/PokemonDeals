// Phase SOCIAL-CREATIVE-5A - SEMANTIC FACT MANIFEST (§2, §4, §5, §6).
//
// SOCIAL-CREATIVE-5's manifest checked VALUES. This one describes MEANING:
// the claim subject / scope / population, the comparison relationship and
// its true direction, the story premise, the required + prohibited
// takeaways, the printing identity, and the brand-lock policy. The auditor
// (semanticAudit.mjs) reasons over this - "all the numbers are present" is
// never a PASS.
//
// Deterministic. No I/O, no OpenAI.

import { buildFactManifest } from "./fullGenerative.mjs";

export const SEMANTIC_MANIFEST_VERSION = "5a.1";

const money = (n) => (n == null ? null : `$${Number(n).toLocaleString("en-US", { maximumFractionDigits: Number(n) < 100 ? 2 : 0 })}`);
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : null);

// ---- §4 COMPARISON-DIRECTION ENGINE ------------------------
// Deterministic truth for "left vs right". `tolerance` is the fraction
// within which the two are treated as equal (rounding slack).
export function comparisonDirection(left, right, { tolerance = 0.03 } = {}) {
  const a = num(left);
  const b = num(right);
  if (a == null || b == null || b === 0) return { relation: "UNKNOWN", pct: null };
  const ratio = a / b;
  if (Math.abs(ratio - 1) <= tolerance) return { relation: "NEAR_MARKET", pct: 0, delta: Math.round((a - b) * 100) / 100 };
  if (a > b) return { relation: "ABOVE_MARKET", premium_pct: Math.round((ratio - 1) * 100), pct: Math.round((ratio - 1) * 100), delta: Math.round((a - b) * 100) / 100, sign: "+" };
  return { relation: "BELOW_MARKET", discount_pct: Math.round((1 - ratio) * 100), pct: Math.round((1 - ratio) * 100), delta: Math.round((a - b) * 100) / 100, sign: "-" };
}

// Words that assert a direction, and which relation each is only valid for.
export const DIRECTION_WORDS = Object.freeze({
  premium: "ABOVE_MARKET", "above market": "ABOVE_MARKET", overpriced: "ABOVE_MARKET", "over market": "ABOVE_MARKET", markup: "ABOVE_MARKET",
  discount: "BELOW_MARKET", "below market": "BELOW_MARKET", "under market": "BELOW_MARKET", bargain: "BELOW_MARKET", underpriced: "BELOW_MARKET", "under-market": "BELOW_MARKET",
});

// ---- §5/§6 STORY PREMISES + TAKEAWAYS ---------------------
export const STORY_PREMISES = Object.freeze({
  deal_hero: {
    premise: "a real live listed price is materially below a valid market reference",
    required_takeaway: "the listed price is genuinely below the real market reference",
    prohibited_takeaways: ["any 'was' price framing", "fake urgency", "a buy recommendation not supported by the gap"],
  },
  market_shape: {
    premise: "a distribution statistic about the WHOLE tracked-single population, illustrated by ONE example card",
    required_takeaway: "the stat applies to the tracked population, not to the example card",
    prohibited_takeaways: ["the stat scoped to the example card / species", "a per-card claim from a population stat"],
  },
  asking_vs_sold: {
    premise: "an asking price and the real market value can differ - the example decides which way",
    required_takeaway: "asking price and market value can differ (in whichever direction the numbers show)",
    prohibited_takeaways: [
      "advice implying the ask is too high when ask < market",
      "advice implying the ask is a bargain when ask > market",
      "calling a below-market ask a 'premium'",
      "calling an above-market ask a 'discount'",
      "an unsupported buying recommendation",
    ],
  },
  printing_compare: {
    premise: "two genuinely distinct, related printings of the same card differ in value because of a real printing axis",
    required_takeaway: "the value difference follows from a real, provable printing/variant difference",
    prohibited_takeaways: ["'same card' when the canonical ids differ", "'different printing' when the two are the same record/image", "an invented variant name"],
  },
  three_up: {
    premise: "three genuinely distinct real cards, each a real live listing under the cap",
    required_takeaway: "each card is a real listing below its own market reference",
    prohibited_takeaways: ["a repeated card / species", "a card over the cap"],
  },
});

// ---- MANIFEST BUILD --------------------------------------
/**
 * buildSemanticManifest({ layout, factLock, resolved, contract, printingProof })
 * -> the value manifest (§5-5 fields) PLUS the semantic structure.
 */
export function buildSemanticManifest({ layout, factLock = {}, resolved = null, contract = null, printingProof = null } = {}) {
  const base = buildFactManifest({ layout, factLock, resolved, contract });
  const F = factLock || {};
  const R = resolved?.data ?? resolved ?? {};
  const prem = STORY_PREMISES[layout] ?? STORY_PREMISES.market_shape;

  const sem = {
    ...base,
    semantic_manifest_version: SEMANTIC_MANIFEST_VERSION,
    story_premise: prem.premise,
    required_takeaway: prem.required_takeaway,
    prohibited_takeaways: [...prem.prohibited_takeaways],
    brand_asset_required: true,
    generated_logo_forbidden: true,
    // §13 - the specific visual brand risks the auditor must flag
    forbidden_brand_shapes: ["Poke Ball / red-and-white split circle", "any red/white ball icon", "an official Pokemon-style or Nintendo/TPC-style mark", "any circular ball-like logo"],
  };

  if (layout === "market_shape") {
    const u25 = num(R.under25Pct ?? R.under_25_pct ?? (Array.isArray(F.percentages) ? F.percentages[0] : null));
    const tracked = num(F.tracked_count ?? R.pricedCards ?? R.priced_cards);
    Object.assign(sem, {
      claim_subject: "tracked Pokemon single cards",
      claim_scope: "ALL_TRACKED_SINGLES",
      claim_population: tracked != null ? `${tracked.toLocaleString("en-US")} tracked singles` : "the whole tracked-single population",
      claim_timeframe: "current market",
      claim_metric: "share selling under $25",
      claim_value: u25,
      claim_unit: "percent",
      example_card_is_not_population: true,
      example_card: R.featured?.card_name ?? base.card_identity.name ?? null,
      // phrases that wrongly bind the stat to the example card
      forbidden_scope_phrases: [
        `${u25}% of ${(R.featured?.card_name ?? base.card_identity.name ?? "").toLowerCase()} singles`,
        `${tracked?.toLocaleString?.("en-US") ?? ""} ${(R.featured?.card_name ?? base.card_identity.name ?? "").toLowerCase()} singles`,
        `${u25}% of this ${(R.featured?.card_name ?? base.card_identity.name ?? "").toLowerCase()}`,
        `of ${(R.featured?.card_name ?? base.card_identity.name ?? "").toLowerCase()} singles`,
      ].filter((s) => s && !/^\s*of\s+singles\s*$/.test(s)),
      allowed_scope_phrases: [
        `${u25}% of tracked singles`,
        `${u25}% of ${tracked?.toLocaleString?.("en-US") ?? "tracked"} tracked singles`,
        "one example",
      ],
    });
  }

  if (layout === "asking_vs_sold" || layout === "deal_hero") {
    const ask = num(F.listed_price ?? R.askingUsd ?? R.priceUsd);
    const market = num(F.market_price ?? R.marketRefUsd ?? R.marketUsd);
    const dir = comparisonDirection(ask, market);
    Object.assign(sem, {
      comparison_type: layout === "deal_hero" ? "listed_price_vs_market" : "asking_price_vs_market",
      comparison_left: { label: layout === "deal_hero" ? "listed price" : "asking price", value: ask, text: money(ask) },
      comparison_right: { label: "market reference", value: market, text: money(market) },
      comparison_direction: dir.relation, // ABOVE_MARKET | BELOW_MARKET | NEAR_MARKET
      comparison_delta: dir.delta ?? null,
      comparison_pct: dir.pct ?? null,
      comparison_sign: dir.sign ?? (dir.relation === "NEAR_MARKET" ? "" : null),
      relationship_expected: dir.relation === "ABOVE_MARKET" ? "the ask is a premium over market" : dir.relation === "BELOW_MARKET" ? "the ask sits below market" : "the ask is roughly at market",
      // the ONLY direction words allowed for this comparison
      allowed_direction_words: Object.entries(DIRECTION_WORDS).filter(([, rel]) => rel === dir.relation).map(([w]) => w),
      forbidden_direction_words: Object.entries(DIRECTION_WORDS).filter(([, rel]) => rel !== dir.relation).map(([w]) => w),
      // §5 - a data-appropriate lesson
      appropriate_lesson:
        dir.relation === "ABOVE_MARKET"
          ? "Don't assume the asking price is fair - it can sit well above market."
          : dir.relation === "BELOW_MARKET"
            ? "An asking price can also sit well below market - compare before you judge."
            : "Asking prices and market value move independently - always compare.",
    });
  }

  if (layout === "printing_compare") {
    Object.assign(sem, {
      printing_identity_a: printingProof?.a ?? null,
      printing_identity_b: printingProof?.b ?? null,
      printing_axis: printingProof?.axis ?? R.relevance?.axis ?? null,
      printing_difference_proof: printingProof?.evidence ?? R.printing_lesson ?? null,
      printing_proof_ok: Boolean(printingProof?.ok),
      comparison_left: { label: R.high?.set ?? "A", value: num(R.high?.price_usd), text: money(R.high?.price_usd) },
      comparison_right: { label: R.low?.set ?? "B", value: num(R.low?.price_usd), text: money(R.low?.price_usd) },
      comparison_pct: R.multiple != null ? Math.round((num(R.multiple) - 1) * 100) : null,
    });
  }

  if (layout === "three_up") {
    const items = Array.isArray(R.items) ? R.items : [];
    Object.assign(sem, {
      claim_subject: "three distinct real listings under the cap",
      claim_population: `${items.length} listings`,
      item_identities: items.slice(0, 3).map((it) => ({ name: it.card_name, tcgplayer_id: it.tcgplayerId, price: num(it.price_usd) })),
    });
  }

  return Object.freeze(sem);
}

// ---- §8 MATH: recompute every derived number -------------
// Returns { ok, errors:[{ field, expected, tolerance }] }.
export function recomputeDerivedFacts(sem, { pctTolerance = 1 } = {}) {
  const errors = [];
  const nearlyEq = (a, b, tol) => Math.abs(Number(a) - Number(b)) <= tol;

  if (sem.comparison_left?.value != null && sem.comparison_right?.value != null) {
    const dir = comparisonDirection(sem.comparison_left.value, sem.comparison_right.value);
    if (dir.relation !== sem.comparison_direction && sem.comparison_direction) {
      errors.push({ field: "comparison_direction", expected: dir.relation, got: sem.comparison_direction });
    }
    if (sem.comparison_pct != null && dir.pct != null && !nearlyEq(sem.comparison_pct, dir.pct, pctTolerance)) {
      errors.push({ field: "comparison_pct", expected: dir.pct, got: sem.comparison_pct });
    }
    if (sem.comparison_delta != null && dir.delta != null && !nearlyEq(sem.comparison_delta, dir.delta, 0.5)) {
      errors.push({ field: "comparison_delta", expected: dir.delta, got: sem.comparison_delta });
    }
  }
  if (sem.layout === "deal_hero" && sem.required_numeric_facts?.listed_price != null && sem.required_numeric_facts?.market_price != null && sem.required_numeric_facts?.discount_pct != null) {
    const expect = Math.round((1 - sem.required_numeric_facts.listed_price / sem.required_numeric_facts.market_price) * 100);
    if (!nearlyEq(expect, sem.required_numeric_facts.discount_pct, pctTolerance)) errors.push({ field: "discount_pct", expected: expect, got: sem.required_numeric_facts.discount_pct });
  }
  let complementPct = null;
  if (sem.layout === "market_shape" && sem.claim_value != null) {
    complementPct = Math.round((100 - Number(sem.claim_value)) * 10) / 10;
  }
  return { ok: errors.length === 0, errors, complement_pct: complementPct };
}
