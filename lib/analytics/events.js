// Phase 13A - the single source of truth for every analytics event name
// and the one place event names are allowed to be defined.
//
// Rules (enforced by tests/scanner/analytics-*.test.mjs):
//   * every capture() call anywhere in the app passes one of EVENTS.*
//   * nothing calls posthog.capture() directly outside lib/analytics/
//   * ALLOWED_EVENTS is the allowlist the before_send sanitizer uses to
//     hard-drop anything not declared here (defence in depth)
//
// Names are snake_case, stable, and must not change once shipped -
// dashboards and 13B/13C comparisons key off them.

export const EVENTS = Object.freeze({
  // --- homepage ---------------------------------------------------------
  HOMEPAGE_VIEW: "homepage_view",
  HOMEPAGE_SECTION_IMPRESSION: "homepage_section_impression",
  DEAL_CARD_IMPRESSION: "deal_card_impression",
  FILTER_BAR_IMPRESSION: "filter_bar_impression",
  HOMEPAGE_SCROLL_DEPTH: "homepage_scroll_depth", // diagnostic only, not a success metric

  // --- hero / search entry --------------------------------------------
  HERO_SEARCH_FOCUS: "hero_search_focus",
  HERO_SUGGESTION_CLICKED: "hero_suggestion_clicked",

  // --- search interaction (see SEARCH EVENT SEMANTICS in the brief) ---
  SEARCH_STARTED: "search_started", // first meaningful input in an interaction
  SEARCH_REQUEST: "search_request", // a request was actually sent
  SEARCH_SUBMITTED: "search_submitted", // explicit Enter / button only
  SEARCH_RESULTS_SHOWN: "search_results_shown",
  SEARCH_NO_RESULT: "search_no_result",
  SEARCH_RESULT_CLICKED: "search_result_clicked",

  // --- homepage discovery lanes -------------------------------------
  BEST_DEAL_CLICKED: "best_deal_clicked",
  ENDING_SOON_CLICKED: "ending_soon_clicked",
  JUST_ADDED_CLICKED: "just_added_clicked",
  MOST_ACTIVE_CLICKED: "most_active_clicked",

  // --- entry points / navigation ----------------------------------
  START_HERE_CLICKED: "start_here_clicked",
  BROWSE_CATALOGUE_CLICKED: "browse_catalogue_clicked",
  BROWSE_SETS_CLICKED: "browse_sets_clicked",
  BROWSE_POKEMON_CLICKED: "browse_pokemon_clicked",
  GRADED_CLICKED: "graded_clicked",

  // --- filter bar ------------------------------------------------
  FILTER_OPENED: "filter_opened",
  FILTER_APPLIED: "filter_applied",
  FILTER_CLEARED: "filter_cleared",
  SORT_CHANGED: "sort_changed",
  COUNTRY_CHANGED: "country_changed",

  // --- detail views reached from home / search ------------------
  CARD_VIEWED_FROM_HOME: "card_viewed_from_home",
  DEAL_VIEWED_FROM_HOME: "deal_viewed_from_home",
  QUALIFIED_DETAIL_VIEW: "qualified_detail_view", // ~10s active dwell on a card/deal detail

  // --- commercial-intent outbound ------------------------------
  AFFILIATE_CLICK: "affiliate_click",
});

export const ALLOWED_EVENTS = Object.freeze(new Set(Object.values(EVENTS)));

// Events that count as a QUALIFIED COLLECTOR ACTION (see the brief).
// Used for reporting "homepage -> first qualified action"; kept here so
// the definition lives with the taxonomy.
export const QUALIFIED_ACTION_EVENTS = Object.freeze([
  EVENTS.AFFILIATE_CLICK,
  EVENTS.SEARCH_RESULT_CLICKED,
  EVENTS.QUALIFIED_DETAIL_VIEW,
]);

// Section ids used by homepage_section_impression + the lane click events.
export const HOMEPAGE_SECTIONS = Object.freeze([
  "best_deals",
  "ending_soon",
  "just_added",
  "most_active",
  "browse",
  "all_deals",
  "how_it_works",
  "guides",
]);

// Lanes we also track at the individual-card level (small, high-value).
export const CARD_IMPRESSION_SECTIONS = Object.freeze(["best_deals", "ending_soon", "just_added"]);

// section id -> the click event fired when a card in that lane is opened.
export const SECTION_CLICK_EVENT = Object.freeze({
  best_deals: EVENTS.BEST_DEAL_CLICKED,
  ending_soon: EVENTS.ENDING_SOON_CLICKED,
  just_added: EVENTS.JUST_ADDED_CLICKED,
  most_active: EVENTS.MOST_ACTIVE_CLICKED,
});
