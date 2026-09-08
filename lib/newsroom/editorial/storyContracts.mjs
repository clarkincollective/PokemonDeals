// Phase SOCIAL-CREATIVE-4A - STORY TYPE CONTRACTS (§3).
//
// Each contract declares what makes a story of that type MEANINGFUL, the
// real facts it must carry, the visual evidence it must show, an
// acceptable hook shape, the cases it must never make, its shelf-life
// class, and whether it is commercial or editorial. The relevance gate
// (§2) and the creative brief (§5) both read these - a story that cannot
// satisfy its contract is EDITORIAL_WITHHOLD, never rendered thin.
//
// Pure data. No I/O.

// shelf_life: LIVE (hours) | SHORT (1-2 days, facts frozen) |
//             EDITORIAL (~2 weeks) | EVERGREEN
// classification: COMMERCIAL (drives a click to a listing/deal) |
//                 EDITORIAL (authority / education / brand)

const C = (id, o) =>
  Object.freeze({
    id,
    meaningful: o.meaningful,
    required_facts: Object.freeze(o.required_facts),
    required_visual_evidence: Object.freeze(o.required_visual_evidence),
    acceptable_hook: o.acceptable_hook,
    must_not_do: Object.freeze(o.must_not_do),
    shelf_life: o.shelf_life,
    classification: o.classification,
    // the card-forward layout family this contract renders through, when
    // it has one (lib/social/newsroom/cardLayoutStatus)
    layout_family: o.layout_family ?? null,
    // the internal SERIES id(s) this contract maps onto (series.mjs)
    series: Object.freeze(o.series ?? [id]),
  });

export const STORY_CONTRACTS = Object.freeze({
  DEAL_DROP: C("DEAL_DROP", {
    meaningful: "A real, currently-live BIN listing is priced clearly below a real market reference, and the saving is large enough to act on.",
    required_facts: ["card_name", "card_set", "card_tcgplayer_id", "listed_price", "market_price", "discount_pct", "url"],
    required_visual_evidence: ["canonical card art", "listed price", "market reference", "saving amount or %"],
    acceptable_hook: "State the card and how far under a real reference it is - no hype, no fake scarcity.",
    must_not_do: ["invent or round the market reference", "imply urgency the data does not support", "show a sold-out or expired listing", "call a normal price a deal"],
    shelf_life: "LIVE",
    classification: "COMMERCIAL",
    layout_family: "deal_hero",
    series: ["DEAL_DROP", "DEAL_OF_THE_DAY", "NEW_LISTING_ALERT"],
  }),
  THREE_UNDER_25: C("THREE_UNDER_25", {
    meaningful: "Three DISTINCT real cards, each a genuine live BIN under $25, each below its own market reference - a budget shelf a collector could actually buy today.",
    required_facts: ["3x card_name", "3x card_tcgplayer_id", "3x listed_price (<=25)", "3x market_price", "3x discount_pct"],
    required_visual_evidence: ["three canonical card arts balanced", "each price readable at thumbnail size", "one headline"],
    acceptable_hook: "Name the budget ($25) and the count (3) plainly.",
    must_not_do: ["repeat a card / species across the three", "include anything over the cap", "fake a discount", "use manufactured urgency"],
    shelf_life: "SHORT",
    classification: "COMMERCIAL",
    layout_family: "three_up",
    series: ["THREE_UNDER_25", "WHAT_25_BUYS"],
  }),
  MARKET_SNAPSHOT: C("MARKET_SNAPSHOT", {
    meaningful: "A real distribution figure from the live catalogue (e.g. share of cards under $25) that tells a collector something non-obvious about the market, anchored by one real example card.",
    required_facts: ["priced_card_count", "under_25_pct or comparable distribution stat", "one real featured card with a real price"],
    required_visual_evidence: ["one dominant stat", "a distribution bar / shape", "one real canonical card example"],
    acceptable_hook: "Lead with the single number and what it means.",
    must_not_do: ["editorialise a trend the data does not show", "invent a percentage", "show a stat with no example card"],
    shelf_life: "EDITORIAL",
    classification: "EDITORIAL",
    layout_family: "market_shape",
    series: ["MARKET_SNAPSHOT"],
  }),
  EXACT_PRINTING_MATTERS: C("EXACT_PRINTING_MATTERS", {
    meaningful: "Two printings of the SAME card that differ on a genuine printing/variant axis (1st Ed vs Unlimited, shadowless, holo vs non-holo, reverse vs regular, stamped, promo-vs-set) where the value gap follows from the printing - a lesson a collector can reuse.",
    required_facts: ["shared base card", "printing/variant axis", "both real market_price values", "the multiple between them"],
    required_visual_evidence: ["two canonical arts of the same card", "the distinguishing feature labelled", "both prices", "the multiple"],
    acceptable_hook: "Name the card and the one feature that changes the price.",
    must_not_do: ["pair unrelated cards of the same Pokemon", "pair different artwork", "pair different eras with no shared printing axis", "present a pure price gap as a printing lesson"],
    shelf_life: "EVERGREEN",
    classification: "EDITORIAL",
    layout_family: "printing_compare",
    series: ["EXACT_PRINTING_MATTERS"],
    // hard gate: printingComparisonRelevance() must return MEANINGFUL
  }),
  WHY_SOLD_PRICES_MATTER: C("WHY_SOLD_PRICES_MATTER", {
    meaningful: "A real case where an asking price sits well above recent SOLD prices for the same card - shows why 'sold, not listed' is the reference that matters.",
    required_facts: ["card_name", "asking_price", "3x recent sold reference points", "market_price"],
    required_visual_evidence: ["one real card", "asking vs sold contrast", "one-line takeaway"],
    acceptable_hook: "Contrast the asking number with what the card actually sells for.",
    must_not_do: ["use a listed price as a 'sold' point", "invent sold data", "name/shame a seller"],
    shelf_life: "EVERGREEN",
    classification: "EDITORIAL",
    layout_family: "asking_vs_sold",
    series: ["WHY_SOLD_PRICES_MATTER", "MARKET_REFERENCE_EXPLAINER"],
  }),
  ASKING_VS_SOLD: C("ASKING_VS_SOLD", {
    meaningful: "A live BIN whose asking price is materially below the recent sold reference - the data-backed instance of WHY_SOLD_PRICES_MATTER, tied to a card a collector can buy now.",
    required_facts: ["card_name", "card_tcgplayer_id", "asking_price", "sold/market reference", "gap_pct"],
    required_visual_evidence: ["one real card", "asking number", "sold reference", "the gap"],
    acceptable_hook: "State the asking price and the sold reference side by side.",
    must_not_do: ["conflate listed with sold", "fabricate the reference", "overclaim the gap"],
    shelf_life: "SHORT",
    classification: "COMMERCIAL",
    layout_family: "asking_vs_sold",
    series: ["WHY_SOLD_PRICES_MATTER"],
  }),
  RAW_VS_GRADED: C("RAW_VS_GRADED", {
    meaningful: "For ONE card, comparable real references for the raw copy and a specific graded tier, so the grading premium is shown concretely - not a generic 'get it graded' take.",
    required_facts: ["card_name", "raw market reference", "graded tier + its reference", "the delta"],
    required_visual_evidence: ["one real card", "raw price", "graded price at a named grade", "the premium"],
    acceptable_hook: "Name the card and the raw-to-graded jump at a specific grade.",
    must_not_do: ["compare across different cards", "use a grade with no real reference", "imply a guaranteed grade outcome"],
    shelf_life: "EDITORIAL",
    classification: "EDITORIAL",
    layout_family: null,
    series: ["RAW_VS_GRADED", "RAW_VS_GRADED_EXPLAINER"],
  }),
  SET_SNAPSHOT: C("SET_SNAPSHOT", {
    meaningful: "A real, current price observation for one set (chase-card floor, median, or notable mover) that helps a collector gauge that set - backed by real catalogue rows.",
    required_facts: ["set name", "1+ real per-set price observations", "example card(s) with real prices"],
    required_visual_evidence: ["set identity", "the observation stat", "1-3 real cards from the set"],
    acceptable_hook: "Name the set and the one figure worth knowing.",
    must_not_do: ["aggregate sets with too few priced rows", "invent a set median", "imply a forecast"],
    shelf_life: "EDITORIAL",
    classification: "EDITORIAL",
    layout_family: null,
    series: ["SET_WATCH", "SET_DEAL_HUNT"],
  }),
  PRICE_DROP: C("PRICE_DROP", {
    meaningful: "A specific listing whose price has genuinely fallen (a real observed decrease for that listing/card), not just a card that is cheap.",
    required_facts: ["card_name", "card_tcgplayer_id", "prior price point", "current price", "observed drop"],
    required_visual_evidence: ["one real card", "from-price", "to-price", "the drop"],
    acceptable_hook: "State the from/to and the size of the drop.",
    must_not_do: ["infer a drop from a single snapshot", "use market drift as a listing 'price drop'", "manufacture a baseline"],
    shelf_life: "LIVE",
    classification: "COMMERCIAL",
    layout_family: null,
    series: ["PRICE_DROP"],
  }),
  QUIET_CLIMBER: C("QUIET_CLIMBER", {
    meaningful: "A real card in a confident, low-volatility uptrend over a stated window (via the sanctioned price-movement confidence gate) - a mover that is not obvious.",
    required_facts: ["card_name", "card_tcgplayer_id", "from->to price", "window label", "confidence gate PASS"],
    required_visual_evidence: ["one real card", "from/to", "the % move", "the window"],
    acceptable_hook: "Name the card and the quiet move over the window.",
    must_not_do: ["touch price_history directly (must go through priceMovement)", "call a spike a 'quiet' climb", "predict the future"],
    shelf_life: "EDITORIAL",
    classification: "EDITORIAL",
    layout_family: "movers_countdown",
    series: ["QUIET_CLIMBERS", "BIGGEST_MOVERS"],
  }),
  BIGGEST_FIND: C("BIGGEST_FIND", {
    meaningful: "The single strongest genuine deal the finder surfaced in a stated window (day/week) - a real listing, real reference, real saving, worth a recap.",
    required_facts: ["card_name", "card_tcgplayer_id", "listed_price", "market_price", "discount_pct", "window"],
    required_visual_evidence: ["canonical card art", "the saving", "the window label"],
    acceptable_hook: "State the window and the size of the find.",
    must_not_do: ["recap an expired listing as if live", "inflate the saving", "pick a marginal deal as 'biggest'"],
    shelf_life: "SHORT",
    classification: "COMMERCIAL",
    layout_family: "deal_hero",
    series: ["BIGGEST_FIND_WEEK"],
  }),
  SAME_CARD_DIFFERENT_PRICE: C("SAME_CARD_DIFFERENT_PRICE", {
    meaningful: "Two or more CURRENT live listings for the EXACT same printing at materially different totals - shows price dispersion for one card right now.",
    required_facts: ["2+ live listings of the same tcgplayer_id", "each total (price + shipping)", "the spread"],
    required_visual_evidence: ["one real card", "2+ listing totals", "the spread"],
    acceptable_hook: "One card, and the gap between the cheapest and dearest live listing.",
    must_not_do: ["compare different printings", "compare a live listing to a historical price", "ignore shipping in the total"],
    shelf_life: "SHORT",
    classification: "EDITORIAL",
    layout_family: null,
    series: ["SAME_CARD_DIFFERENT_PRICES", "THREE_SELLERS_ONE_CARD"],
  }),
  AUCTION_LANDED_TOTAL: C("AUCTION_LANDED_TOTAL", {
    meaningful: "A real auction where CURRENT BID + SHIPPING = the true 'you pay' total, making the point that the bid is not the price.",
    required_facts: ["card_name", "current_bid", "shipping", "landed_total", "auction_end", "bid_count"],
    required_visual_evidence: ["one real card", "bid figure", "+ shipping", "= landed total"],
    acceptable_hook: "Show the bid, the shipping, and the real total.",
    must_not_do: ["treat the bid as the final price", "omit shipping", "show an ended auction as live"],
    shelf_life: "LIVE",
    classification: "EDITORIAL",
    layout_family: "bid_vs_total",
    series: ["AUCTION_BID_VS_TOTAL"],
  }),
  BEHIND_THE_FINDER: C("BEHIND_THE_FINDER", {
    meaningful: "A concrete look at how the finder actually works - matching, lot detection, image verification, or a real (non-defamatory) rejection example.",
    required_facts: ["a real mechanism or a safe rejection example (no fraud accusation)"],
    required_visual_evidence: ["a clear diagram / before-after / criterion list - no fabricated UI"],
    acceptable_hook: "State the one thing the reader will understand about how deals are found.",
    must_not_do: ["accuse a real seller of fraud", "show fake product UI", "overstate coverage"],
    shelf_life: "EVERGREEN",
    classification: "EDITORIAL",
    layout_family: null,
    series: ["HOW_WE_FIND_DEALS", "HOW_MATCHING_WORKS", "LOT_DETECTION_EXPLAINER", "IMAGE_VERIFICATION_EXPLAINER", "WHY_WE_REJECTED_IT"],
  }),
  METHODOLOGY: C("METHODOLOGY", {
    meaningful: "The definition the whole site runs on - what counts as a deal, what a 'market reference' is - stated plainly so the brand's claims are legible.",
    required_facts: ["the real definition / threshold used in code"],
    required_visual_evidence: ["a clean statement of the rule - no card needed, no fake numbers"],
    acceptable_hook: "State the rule in one line.",
    must_not_do: ["describe a rule the system does not actually apply", "imply precision the data lacks"],
    shelf_life: "EVERGREEN",
    classification: "EDITORIAL",
    layout_family: null,
    series: ["METHODOLOGY", "PRODUCT_EXPLAINER"],
  }),
  BUYER_EDUCATION: C("BUYER_EDUCATION", {
    meaningful: "One reusable buying lesson (shipping flips the maths, condition tiers, marketplace fees, how to read a comp) tied to a real example where possible.",
    required_facts: ["the lesson", "a real supporting example when the format is data-backed"],
    required_visual_evidence: ["the lesson stated", "a real example where the series is data-backed"],
    acceptable_hook: "State the mistake and the fix.",
    must_not_do: ["give the lesson with a fabricated example", "over-generalise from one case"],
    shelf_life: "EVERGREEN",
    classification: "EDITORIAL",
    layout_family: null,
    series: ["SHIPPING_CHANGES_DEAL", "WHY_SOLD_PRICES_MATTER", "MARKET_REFERENCE_EXPLAINER"],
  }),
});

export const STORY_CONTRACT_IDS = Object.freeze(Object.keys(STORY_CONTRACTS));

// series id -> contract id
const SERIES_TO_CONTRACT = (() => {
  const m = {};
  for (const [cid, c] of Object.entries(STORY_CONTRACTS)) for (const s of c.series) if (!m[s]) m[s] = cid;
  return Object.freeze(m);
})();

export function contractFor(idOrSeries) {
  const key = String(idOrSeries || "").toUpperCase();
  if (STORY_CONTRACTS[key]) return STORY_CONTRACTS[key];
  const cid = SERIES_TO_CONTRACT[key];
  return cid ? STORY_CONTRACTS[cid] : null;
}

export function contractIdForSeries(series) {
  return SERIES_TO_CONTRACT[String(series || "").toUpperCase()] ?? null;
}

export function isCommercial(idOrSeries) {
  return contractFor(idOrSeries)?.classification === "COMMERCIAL";
}

// Which contracts still have no mapped series (coverage report for tests
// / docs). Should be empty.
export function unmappedContracts() {
  return STORY_CONTRACT_IDS.filter((cid) => STORY_CONTRACTS[cid].series.every((s) => !s));
}
