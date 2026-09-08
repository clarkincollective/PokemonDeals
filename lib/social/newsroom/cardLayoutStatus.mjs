// Phase SOCIAL-CREATIVE-3 - CARD-FORWARD LAYOUT / SERIES CLASSIFICATION
// (SS23, SS31).
//
// The single source of truth for which redesigned card-forward series are
// cleared for UNATTENDED scheduling vs. human-review-only vs. withheld.
// Consumed by scripts/socialCreativePack.mjs, the SOCIAL-CREATIVE-3 tests,
// and (later) the NEWSROOM-3 renderer. Nothing here does I/O.
//
// Grades come from the 2026-09-08 real review pack (real DB data + real
// canonical TCGplayer art, 5-sample worst-case Layer-5 at temperature 0,
// plus deterministic editorialCreativeQa + collectibleAppeal):
//
//   VISUALLY_STRONG_NOW        5/5 Layer-5 PASS + both deterministic gates
//                              PASS -> AUTONOMOUS_SAFE.
//   VISUALLY_STRONG_WITH_REDESIGN
//                              deterministic gates PASS, Layer-5 mostly
//                              PASS (3-4/5) but the conservative
//                              worst-case gate intermittently holds it ->
//                              MANUAL_ONLY (renders, never auto-queued).
//   DATA_NOT_READY             resolver returns VISUALLY_UNDERPOWERED_DATA
//                              -> WITHHELD until the data exists.
//   TOO_THIN_FOR_SOCIAL        no card-forward treatment is worth building.

export const CARD_LAYOUT_STATUS = Object.freeze({
  // series -> { layout, category, grade, autonomous_safe, note }
  MARKET_SNAPSHOT: {
    layout: "market_shape", category: "MARKET", grade: "VISUALLY_STRONG_NOW",
    autonomous_safe: true,
    note: "Hook headline + one dominant % + distribution bar + real featured deal card. 5/5 Layer-5 PASS.",
  },
  WHY_SOLD_PRICES_MATTER: {
    layout: "asking_vs_sold", category: "EDUCATION", grade: "VISUALLY_STRONG_NOW",
    autonomous_safe: true,
    note: "Real card + asking vs recent-sold contrast. 5/5 Layer-5 PASS.",
  },
  EXACT_PRINTING_MATTERS: {
    layout: "printing_compare", category: "EDUCATION_MULTI_CARD", grade: "VISUALLY_STRONG_NOW",
    autonomous_safe: true,
    note: "Two real canonical printings of one species, real market prices, Nx multiple. 5/5 Layer-5 PASS.",
  },
  AUCTION_BID_VS_TOTAL: {
    layout: "bid_vs_total", category: "PROCESS_STORY", grade: "VISUALLY_STRONG_WITH_REDESIGN",
    autonomous_safe: false,
    note: "Real auction card + bid -> +ship -> landed-total block. 4/5 Layer-5 PASS; worst-case gate holds it. Manual review only.",
  },
  DEAL_DROP: {
    layout: "deal_hero", category: "DEAL", grade: "VISUALLY_STRONG_WITH_REDESIGN",
    autonomous_safe: false,
    note: "The quality FLOOR (SS25): large real card + giant price contrast + % pill. 4/5 Layer-5 PASS; not yet bulletproof. Manual review only.",
  },
  THREE_UNDER_25: {
    layout: "three_up", category: "DEAL_MULTI_CARD", grade: "VISUALLY_STRONG_WITH_REDESIGN",
    autonomous_safe: false,
    note: "Three real deal cards + prices + aggregate 'up to N% off' line. 3/5 Layer-5 PASS. Manual review only.",
  },
  BIGGEST_MOVERS: {
    layout: "movers_countdown", category: "MARKET", grade: "VISUALLY_STRONG_WITH_REDESIGN",
    autonomous_safe: false,
    note: "Three real printings + confident from->to move via the sanctioned price-movement confidence gate (no direct price_history access, SS11). Renders only when >=3 printings clear the gate, else WITHHELD (VISUALLY_UNDERPOWERED_DATA, SS22). Manual review only until it proves a reliable 5/5 Layer-5 PASS.",
  },
});

export const AUTONOMOUS_SAFE_CARD_LAYOUTS = Object.freeze(
  [...new Set(Object.values(CARD_LAYOUT_STATUS).filter((s) => s.autonomous_safe).map((s) => s.layout))]
);

export const MANUAL_ONLY_CARD_LAYOUTS = Object.freeze(
  [...new Set(Object.values(CARD_LAYOUT_STATUS).filter((s) => !s.autonomous_safe && s.grade === "VISUALLY_STRONG_WITH_REDESIGN").map((s) => s.layout))]
);

export function cardLayoutStatusFor(series) {
  return CARD_LAYOUT_STATUS[String(series || "").toUpperCase()] ?? null;
}

export function cardForwardAutonomousSafe(series) {
  return Boolean(cardLayoutStatusFor(series)?.autonomous_safe);
}
