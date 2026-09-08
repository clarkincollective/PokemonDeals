// Phase SOCIAL-CREATIVE-4B - STORY-SPECIFIC VISUAL CONTRACTS (§14-§19).
//
// The 5 key image families, each with a DISTINCT editorial structure:
// what it must show, what is optional, and what to avoid. Layered on the
// 4A composition-occupancy contracts (lib/newsroom/editorial/brandSystem).
//
// Pure data.

import { COMPOSITION_CONTRACTS } from "../editorial/brandSystem.mjs";

export const VISUAL_CONTRACTS = Object.freeze({
  // §15
  deal_hero: {
    family: "DEAL_HERO",
    target: "premium deal-discovery post",
    must_show: ["real card prominently", "listed price", "market reference", "real gap / saving", "restrained CTA"],
    optional: ["set / era", "grade", "market range bar", "seller / listing type when useful"],
    avoid: ["fake urgency", "giant BUY NOW", "duplicate savings message", "clutter"],
    dominant: "the saving (one number)",
    occupancy: COMPOSITION_CONTRACTS.deal_hero,
  },
  // §16
  market_shape: {
    family: "MARKET_SNAPSHOT",
    target: "data-driven collector-media infographic",
    must_show: ["one dominant market statistic", "useful supporting breakdown", "sample / tracked count", "one real card example"],
    optional: ["contextual chart / bar if helpful"],
    avoid: ["generic SaaS dashboard look", "KPI tiles", "chart chrome", "invented percentages"],
    dominant: "the one statistic",
    occupancy: COMPOSITION_CONTRACTS.market_shape,
  },
  // §17
  printing_compare: {
    family: "PRINTING_COMPARE",
    target: "collector printing/variant lesson",
    gate: "PRINTING_COMPARISON_RELEVANCE_CHECK must be MEANINGFUL",
    must_show: ["two real cards of the SAME card", "what is visually / structurally different (labelled)", "why the difference matters", "real value difference"],
    optional: ["callout arrows", "variant / edition badge", "deterministic close-up crop cue", "same-card lineage labels", "short collector lesson"],
    avoid: ["two cards + two prices side by side with no explanation", "unrelated-era pairs (blocked upstream)"],
    dominant: "the distinguishing feature",
    occupancy: COMPOSITION_CONTRACTS.printing_compare,
  },
  // §18
  three_up: {
    family: "THREE_UNDER_25",
    target: "budget collector shortlist (high save/share value)",
    must_show: ["exactly 3 real cards", "all under the cap", "readable price on each", "clear grouping", "card diversity"],
    optional: ["real market / saving context per card"],
    avoid: ["a grid dump", "more or fewer than 3", "a repeated species", "fake urgency"],
    dominant: "the curated set of three",
    occupancy: COMPOSITION_CONTRACTS.three_up,
  },
  // §19
  asking_vs_sold: {
    family: "ASKING_VS_SOLD",
    target: "educational pricing reality-check",
    must_show: ["asking price", "actual sold / market reference", "the difference", "real card", "short takeaway"],
    optional: ["recent-sold range bar"],
    avoid: ["conflating listed with sold", "naming / shaming a seller", "a fabricated reference"],
    dominant: "asking vs sold contrast",
    occupancy: COMPOSITION_CONTRACTS.asking_vs_sold,
  },
});

export const VISUAL_CONTRACT_LAYOUTS = Object.freeze(Object.keys(VISUAL_CONTRACTS));

export function visualContractFor(layout) {
  return VISUAL_CONTRACTS[String(layout || "")] ?? null;
}

// Check a planned asset against its family's visual contract.
//   plan = { shows: [..], enrichments: [{kind}], cardCount, hasCta }
// Returns { ok, missing, warnings }.
export function checkVisualContract(layout, plan = {}) {
  const c = VISUAL_CONTRACTS[layout];
  if (!c) return { ok: true, missing: [], warnings: [`no visual contract for layout "${layout}" - not one of the 5 key families`] };
  const shows = new Set((plan.shows ?? []).map((s) => String(s).toLowerCase()));
  const missing = c.must_show.filter((m) => {
    const key = m.toLowerCase();
    if (/3 real cards|three real cards|exactly 3/.test(key)) return Number(plan.cardCount) !== 3;
    if (/two real cards/.test(key)) return Number(plan.cardCount) < 2;
    if (/real card/.test(key)) return Number(plan.cardCount) < 1 && !shows.has("real card");
    if (/cta/.test(key)) return plan.hasCta === false;
    return ![...shows].some((s) => s.includes(key.split(" ")[0]) || key.includes(s));
  });
  const warnings = [];
  if (layout === "three_up" && Number(plan.cardCount) !== 3) warnings.push("three_up must have exactly 3 cards");
  if (layout === "printing_compare" && !plan.relevanceMeaningful) warnings.push("printing_compare requires PRINTING_COMPARISON_RELEVANCE_CHECK = MEANINGFUL");
  return { ok: missing.length === 0, missing, warnings, contract: c };
}

export const VISUAL_CONTRACTS_VERSION = "4b.1";
