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
]);

export { EVENTS, HOMEPAGE_SECTIONS, SECTION_CLICK_EVENT, QUALIFIED_ACTION_EVENTS, CARD_IMPRESSION_SECTIONS };
