// Phase SOCIAL-CREATIVE-3 / -3B / -3C - CARD-FORWARD LAYOUT / SERIES
// CLASSIFICATION (SS23, SS31; 3C SS2/SS21).
//
// The single source of truth for how a card-forward series may reach the
// autonomous newsroom queue. Consumed by scripts/social* review packs,
// the SOCIAL-CREATIVE tests, and (later) the NEWSROOM-3 planner. No I/O.
//
// SOCIAL-CREATIVE-3C separates FAMILY_STATUS from ARTIFACT_ELIGIBILITY:
//
//   FAMILY_STATUS
//     AUTONOMOUS_SAFE  representative reliability is strong; the planner
//                      may schedule it like any editorial family.
//     CONDITIONAL      visually strong + clears every deterministic /
//                      factual / collectible gate, but Layer-5 is not
//                      reliably PASS at the family level - so EACH exact
//                      artifact must clear the visual-consensus policy
//                      (lib/newsroom/visualConsensus) before BUFFER_READY.
//     MANUAL_ONLY      renderable for human review only; never autonomous.
//     WITHHELD         insufficient data / quality to render at all.
//
//   ARTIFACT_ELIGIBILITY (per exact artifact_sha256, decided at queue time)
//     ELIGIBLE  every exact-artifact gate + visual consensus PASS
//     HELD      a soft gate (consensus HELD, thumbnail, feed) not passed
//     BLOCKED   any FACT / RIGHTS / deterministic / Layer-5 FAIL

import { VISUAL_REVIEW_POLICY_VERSION } from "../../newsroom/visualConsensus.mjs";

export const FAMILY_STATUSES = Object.freeze(["AUTONOMOUS_SAFE", "CONDITIONAL", "MANUAL_ONLY", "WITHHELD"]);
export const ARTIFACT_ELIGIBILITIES = Object.freeze(["ELIGIBLE", "HELD", "BLOCKED"]);

export const CARD_LAYOUT_STATUS = Object.freeze({
  // series -> { layout, category, family_status, note }
  MARKET_SNAPSHOT: {
    layout: "market_shape", category: "MARKET", family_status: "AUTONOMOUS_SAFE",
    note: "Hook headline + one dominant % + distribution bar + real featured deal card. SOCIAL-CREATIVE-3C stability benchmark: 15/15 Layer-5 PASS, 0% same-artifact flip rate, consensus 3/3, 0 blocked - the most stable card-forward family.",
  },
  EXACT_PRINTING_MATTERS: {
    layout: "printing_compare", category: "EDUCATION_MULTI_CARD", family_status: "AUTONOMOUS_SAFE",
    note: "Two real canonical printings of one species, real market prices, Nx multiple, accent borders. 3C benchmark: 13/15 Layer-5 PASS, 33% flip rate (one stray WATCH, corrected by consensus), consensus 3/3, 0 blocked.",
  },
  WHY_SOLD_PRICES_MATTER: {
    layout: "asking_vs_sold", category: "EDUCATION", family_status: "CONDITIONAL",
    note: "Real card + asking vs recent-sold contrast + one-line takeaway. Was 5/5 in the SOCIAL-CREATIVE-3 packs, but the rigorous 3C stability benchmark caught real Layer-5 instability: 100% same-artifact PASS<->WATCH flip rate, consensus 0/3 in that run (all genuinely split, 0 FAIL). All deterministic gates pass. -> CONDITIONAL: strong, but each exact artifact must clear the visual-consensus policy before it can autonomously queue.",
  },
  THREE_UNDER_25: {
    layout: "three_up", category: "BUDGET_MULTI_CARD", family_status: "CONDITIONAL",
    note: "SOCIAL-CREATIVE-3C: hardened to 'three real deals under $25' - three strong canonical cards, sans price numbers with -0.03em tracking, per-card saving badge, accent borders, one CTA. + threeUpChecks (3 distinct real printings, all <= cap, real market ref, real saving, card variety, budget cap <=$30, no fake urgency). Representative harness: 12/12 stories pass every deterministic gate; staged visual consensus = 8/12 ELIGIBLE (67%), 4 HELD (genuinely split), 0 BLOCKED; 75% same-artifact flip rate. Below the >=75% AUTONOMOUS_SAFE bar -> CONDITIONAL: each exact 3-card artifact must clear consensus.",
  },
  DEAL_DROP: {
    layout: "deal_hero", category: "DEAL", family_status: "CONDITIONAL",
    note: "The quality FLOOR (SS25). Clears every deterministic / factual / collectible gate + the SS8 commercial-pull gate on every eligible real sample, 0 Layer-5 FAIL across 100+ reviews. Layer-5 is nondeterministic at the family level (3B: 44%<->73% worst-case between runs; 3C benchmark: 57% same-artifact flip rate). SOCIAL-CREATIVE-3C -> CONDITIONAL: an exact deal_hero artifact autonomously queues only when it also clears the visual-consensus policy (>= 4/5 independent PASS, 0 FAIL, core score >= 76). 3C benchmark: 4/7 deal_hero artifacts cleared consensus - a specific strong artifact CAN qualify. No family-wide blind approval.",
  },
  AUCTION_BID_VS_TOTAL: {
    layout: "bid_vs_total", category: "PROCESS_STORY", family_status: "MANUAL_ONLY",
    note: "SOCIAL-CREATIVE-3C: RETIRED from the autonomous target. Redesigned to a literal CURRENT BID + SHIPPING = YOU PAY equation with a full SS17 deterministic contract (all gates PASS on 12/12 real US-auction samples), but Layer-5 5-sample worst-case = 0/12 PASS across TWO full runs - a genuine, consistent scroll-stop ceiling after 3 bounded design iterations. Useful education; kept available for HUMAN-CURATED content only. No further autonomous-hardening cycles unless future evidence changes.",
  },
  BIGGEST_MOVERS: {
    layout: "movers_countdown", category: "MARKET", family_status: "MANUAL_ONLY",
    note: "Three real printings + a confident from->to move via the sanctioned price-movement confidence gate (no direct price_history access, SS11). Renders only when >= 3 printings clear the gate, else WITHHELD (VISUALLY_UNDERPOWERED_DATA, SS22). WATCH-prone at Layer-5. Manual review only.",
  },
});

// --- FAMILY_STATUS helpers ----------------------------------------
export function familyStatusFor(series) {
  return CARD_LAYOUT_STATUS[String(series || "").toUpperCase()]?.family_status ?? null;
}
export function cardLayoutStatusFor(series) {
  return CARD_LAYOUT_STATUS[String(series || "").toUpperCase()] ?? null;
}

// A family the planner may schedule WITHOUT a per-artifact consensus check.
export const AUTONOMOUS_SAFE_CARD_LAYOUTS = Object.freeze(
  [...new Set(Object.values(CARD_LAYOUT_STATUS).filter((s) => s.family_status === "AUTONOMOUS_SAFE").map((s) => s.layout))]
);
// A family the planner may schedule ONLY after the exact artifact clears
// the visual-consensus policy.
export const CONDITIONAL_CARD_LAYOUTS = Object.freeze(
  [...new Set(Object.values(CARD_LAYOUT_STATUS).filter((s) => s.family_status === "CONDITIONAL").map((s) => s.layout))]
);
// Never autonomous.
export const MANUAL_ONLY_CARD_LAYOUTS = Object.freeze(
  [...new Set(Object.values(CARD_LAYOUT_STATUS).filter((s) => s.family_status === "MANUAL_ONLY").map((s) => s.layout))]
);

// The planner's gate: may this SERIES be considered for the autonomous
// queue at all? AUTONOMOUS_SAFE -> yes; CONDITIONAL -> yes but the caller
// MUST then resolve artifact eligibility; MANUAL_ONLY / WITHHELD -> no.
export function seriesAutonomousConsiderable(series) {
  const st = familyStatusFor(series);
  return st === "AUTONOMOUS_SAFE" || st === "CONDITIONAL";
}
// Back-compat shim for callers that only cared about "blind" safety.
export function cardForwardAutonomousSafe(series) {
  return familyStatusFor(series) === "AUTONOMOUS_SAFE";
}

// Combine a CONDITIONAL family's per-artifact signals into an
// ARTIFACT_ELIGIBILITY. `gates` = { factOk, rightsOk, deterministicOk,
// collectibleOk, originalityOk, sequenceOk, thumbnailOk, feedOk,
// pullGateOk }, `consensus` = the visualConsensus result.
export function artifactEligibility({ familyStatus, gates = {}, consensus = null } = {}) {
  if (familyStatus === "MANUAL_ONLY" || familyStatus === "WITHHELD") {
    return { eligibility: "BLOCKED", reason: `family is ${familyStatus} - never autonomous` };
  }
  const hardFail = [];
  if (gates.factOk === false) hardFail.push("FACT");
  if (gates.rightsOk === false) hardFail.push("RIGHTS/IMAGE");
  if (gates.deterministicOk === false) hardFail.push("deterministic contract");
  if (gates.pullGateOk === false) hardFail.push("SS8 commercial-pull");
  if (consensus && consensus.result === "BLOCKED") hardFail.push("Layer-5 FAIL");
  if (hardFail.length) return { eligibility: "BLOCKED", reason: `hard fail: ${hardFail.join(", ")}` };

  const soft = [];
  if (gates.collectibleOk === false) soft.push("collectibleAppeal");
  if (gates.originalityOk === false) soft.push("originality");
  if (gates.sequenceOk === false) soft.push("sequence");
  if (gates.thumbnailOk === false) soft.push("thumbnail");
  if (gates.feedOk === false) soft.push("feed compatibility");
  if (familyStatus === "CONDITIONAL" && (!consensus || consensus.result !== "PASS")) soft.push(`visual consensus ${consensus?.result ?? "missing"}`);
  if (soft.length) return { eligibility: "HELD", reason: `held: ${soft.join(", ")}` };
  return { eligibility: "ELIGIBLE", reason: null };
}

// Where each card-forward layout places its closing element - used by the
// feed-level review so "identical CTA placement" reflects the real
// templates (cardEditorialTemplates.mjs), not a default.
export const CARD_LAYOUT_CTA_ZONE = Object.freeze({
  market_shape: "foot_panel",
  asking_vs_sold: "bottom_left",
  printing_compare: "foot_note",
  deal_hero: "bottom_right",
  bid_vs_total: "bottom_left",
  three_up: "bottom_right",
  movers_countdown: "foot_note",
});

export { VISUAL_REVIEW_POLICY_VERSION };
