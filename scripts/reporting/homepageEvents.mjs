// Phase 13C.6.0 - the ONE place this reporting tool names events. Every
// name is imported from the real Phase 13A/13C taxonomy
// (lib/analytics/events.js) - this file never redeclares an event name,
// so the reporting tool and the site can never drift into two competing
// taxonomies.
//
// This module (and everything under scripts/reporting/) is admin/local
// tooling only: nothing under app/* or components/* imports it, it is
// never bundled by Next.js, and it makes no network calls itself.

import { EVENTS, HOMEPAGE_SECTIONS, SECTION_CLICK_EVENT, QUALIFIED_ACTION_EVENTS, CARD_IMPRESSION_SECTIONS } from "../../lib/analytics/events.js";

// Every event this report ever asks PostHog for. Adding a metric to the
// report means adding its event here - nothing is queried "just in case".
export const REPORT_EVENTS = Object.freeze([
  // 17C.0: the site-wide pageview. Pageview counts come from this event
  // ONLY - homepage_view is the homepage-module event and is never added
  // to it (see pageViewsFrom in aggregate.mjs).
  EVENTS.PAGE_VIEW,
  EVENTS.HOMEPAGE_VIEW,
  EVENTS.DISCOVER_DEALS_CLICKED,
  EVENTS.HERO_SEARCH_FOCUS,
  EVENTS.SEARCH_STARTED,
  EVENTS.SEARCH_SUBMITTED,
  EVENTS.HOMEPAGE_SECTION_IMPRESSION,
  EVENTS.DEAL_CARD_IMPRESSION,
  EVENTS.FILTER_BAR_IMPRESSION,
  EVENTS.FILTER_APPLIED,
  EVENTS.FILTER_CLEARED,
  EVENTS.SORT_CHANGED,
  EVENTS.COUNTRY_CHANGED,
  EVENTS.BEST_DEAL_CLICKED,
  EVENTS.ENDING_SOON_CLICKED,
  EVENTS.JUST_ADDED_CLICKED,
  EVENTS.MOST_ACTIVE_CLICKED,
  EVENTS.BROWSE_CATALOGUE_CLICKED,
  EVENTS.BROWSE_SETS_CLICKED,
  EVENTS.BROWSE_POKEMON_CLICKED,
  EVENTS.AFFILIATE_CLICK,
  EVENTS.SEARCH_RESULT_CLICKED,
  EVENTS.QUALIFIED_DETAIL_VIEW,
  EVENTS.CARD_VIEWED_FROM_HOME,
  EVENTS.DEAL_VIEWED_FROM_HOME,
]);

// The ONLY structural properties this report ever pulls. Deliberately
// excludes deal_id/content_id/card_slug/rank/price_band_usd/discount_band
// /query* /$ip /distinct_id /person.* - this report never needs them and
// never asks for them.
export const REPORT_PROPERTIES = Object.freeze([
  "section",
  "source",
  "origin_section",
  "listing_type",
  "device_class",
  "traffic_source",
  // 17C.0: page_view's coarse page family (a fixed enum - never a path)
  "page_type",
]);

// Columns the query DERIVES (never a raw property value):
//   day_flag - "suspected_test" for a day listed in SUSPECTED_TEST_TRAFFIC,
//              else "normal". Used ONLY for the sensitivity comparison;
//              nothing is ever excluded from the main figures by it.
export const REPORT_DERIVED_COLUMNS = Object.freeze(["day_flag"]);

// Days whose traffic looks like owner / QA testing, with the evidence.
// Reported as a SENSITIVITY comparison (main figures include everything;
// a second column shows the same figures without these days) - never an
// automatic exclusion. UTC calendar days.
export const SUSPECTED_TEST_TRAFFIC = Object.freeze([
  Object.freeze({
    day: "2026-09-04",
    reason:
      "2,501 events (4x any other day); 1,020 search events vs 3-90 on other days; 61 of 67 all-time " +
      "search_no_result events share one structural query shape; dominated by a few AU / unresolved-country " +
      "visitors; also the P0.2 deploy + recovery day (17C audit, 2026-09-11)",
  }),
]);

// Historical reclassification applied IN THE REPORT QUERY (no data is
// rewritten): before 17C.0 the site's own UTM sanitiser rejected
// "chatgpt.com" (it ends in ".com"), and ChatGPT usually sends no
// referrer, so AI-assistant clicks were stored as traffic_source "direct"
// (or "referral"). The query maps those back to "ai_assistant" using the
// SDK's own utm_source / referring-domain properties, compared against
// this fixed allowlist - no raw value is ever selected. "internal" rows
// (full-load continuations) are left as they are.
export const AI_ASSISTANT_UTM_SOURCES = Object.freeze([
  "chatgpt.com", "chatgpt", "openai", "chat.openai.com", "perplexity", "perplexity.ai",
  "copilot", "copilot.microsoft.com", "gemini", "gemini.google.com", "claude", "claude.ai",
]);
export const AI_ASSISTANT_REFERRING_DOMAINS = Object.freeze([
  "chatgpt.com", "www.chatgpt.com", "chat.openai.com", "perplexity.ai", "www.perplexity.ai",
  "gemini.google.com", "copilot.microsoft.com", "claude.ai",
]);

// Measurement-continuity facts every report must state (17C.0 finding 4).
//
// VERIFIED 2026-09-11 against production (2026-09-03 .. 09-11, 6,880
// events): with cookieless_mode "always" posthog-js runs NO client session
// manager - $session_id is assigned server-side from PostHog's cookieless
// hash. Of consecutive same-visitor events, $session_id changed 99 times,
// every one after a >= 30-minute gap, and never across any shorter gap
// (6,552 pairs); 108 sessions contain 2+ homepage_view events, i.e. they
// span full page loads. So sessions do NOT reset on full page loads; the
// earlier 17C audit said they did, which was wrong. What does reset on a
// full page load is the site's own in-memory context (landing attribution,
// the page_view chain) - persistence "memory", no storage, by design.
export const CONTINUITY_NOTES = Object.freeze([
  "A session is assigned by PostHog's cookieless server hash (no browser storage): events from one daily visitor hash stay in one session until 30+ minutes of inactivity, INCLUDING across full page loads (verified on production data). Because the hash is built from network/browser traits and rotates daily, a session can merge people behind one IP and cannot cross the daily rotation.",
  "A 'visitor' is that same daily-rotating hash - not a person. Across days nothing can be joined: no retention or return-visit figure is measurable.",
  "The site's own landing attribution (traffic_source / utm_*) is held in page memory: it survives client-side navigation (page_view attribution_scope \"carried\") but NOT a full page load, where the event reads \"internal\" (attribution_scope \"internal_full_load\") and is not a new acquisition. The original source of such a page load can only be recovered in analysis from the first event of its server-side session.",
]);

export { EVENTS, HOMEPAGE_SECTIONS, SECTION_CLICK_EVENT, QUALIFIED_ACTION_EVENTS, CARD_IMPRESSION_SECTIONS };
