// Phase 17C.0 - the ONE site-wide, privacy-safe pageview.
//
// Before this, only the homepage emitted a view event (homepage_view), so
// a visitor who landed on a card / search / category page and left
// without clicking anything produced NO event at all - organic landing
// funnels had no denominator.
//
// page_view fires once per distinct PATHNAME in a page-load chain:
//   * initial load            nav_type "initial"
//   * reload of the same URL  nav_type "reload"       (PerformanceNavigation
//   * browser back / forward  nav_type "back_forward"  Timing - read-only)
//     into a fresh page load
//   * client (SPA) navigation nav_type "client"
// and never twice for the same pathname in a row, so a React re-render,
// a strict-mode double effect, or a querystring-only change (e.g. a new
// search on /search, a filter pill) does not emit a second view.
//
// Payload is structural only: the coarse page_type (lib/analytics/pageType
// - never the path, never an id, never a query), the navigation kind, the
// position in this page-load chain, and how the attribution on this event
// was obtained. Nothing is persisted: the tracker lives in module memory,
// so a full page load starts a new chain (see attribution_scope). That is
// the SITE's context only - PostHog's server-side cookieless session
// ($session_id) does continue across full page loads (verified 17C.0; see
// CONTINUITY_NOTES in scripts/reporting/homepageEvents.mjs).
//
// HOMEPAGE: page_view also fires on "/", as the consistent cross-family
// pageview. homepage_view is unchanged and stays the homepage-module
// event (variant / has_filters). Reports count pageviews from page_view
// ONLY - never page_view + homepage_view (scripts/reporting enforces it).

import { pageTypeFromPath } from "./pageType.js";

// attribution_scope - how the landing attribution (traffic_source / utm_*)
// on this page's events was obtained:
//   "landing"            first page of a page-load chain whose referrer is
//                        not this site: the real acquisition source
//   "carried"            client-side navigation: the ORIGINAL landing
//                        attribution, carried in memory
//   "internal_full_load" first page of a chain reached by a FULL page load
//                        from this site (new tab, reload of an internal
//                        page, a plain <a href>): the browser cannot carry
//                        the original source across the load without
//                        storage, so it is NOT a new acquisition; analysis
//                        recovers the source from the first event of the
//                        server-side session
export const ATTRIBUTION_SCOPES = Object.freeze(["landing", "carried", "internal_full_load"]);
export const NAV_TYPES = Object.freeze(["initial", "reload", "back_forward", "client"]);

const MAX_INDEX = 50;

function normalizePath(pathname) {
  if (typeof pathname !== "string" || !pathname) return null;
  const p = pathname.split(/[?#]/)[0].replace(/\/+$/, "") || "/";
  return p.startsWith("/") ? p : null;
}

// navigationType: PerformanceNavigationTiming.type for the current
// document ("navigate" | "reload" | "back_forward" | "prerender").
function initialNavType(navigationType) {
  if (navigationType === "reload") return "reload";
  if (navigationType === "back_forward") return "back_forward";
  return "initial";
}

export function createPageViewTracker() {
  let lastPath = null;
  let count = 0;
  let landingPageType = null;
  return {
    // -> null (nothing to emit) | { props, landingContext }
    next(pathname, { navigationType = "navigate", trafficSource = "unknown" } = {}) {
      const path = normalizePath(pathname);
      if (path == null) return null;
      if (path === lastPath) return null;
      const initial = count === 0;
      lastPath = path;
      count += 1;
      const pageType = pageTypeFromPath(path);
      if (initial) landingPageType = pageType;
      const props = {
        page_type: pageType,
        nav_type: initial ? initialNavType(navigationType) : "client",
        page_index: Math.min(count, MAX_INDEX),
        attribution_scope: !initial ? "carried" : trafficSource === "internal" ? "internal_full_load" : "landing",
        landing_page_type: landingPageType,
      };
      return { props, landingContext: initial ? { landing_page_type: landingPageType } : null };
    },
    // test / debug only
    state() {
      return { lastPath, count, landingPageType };
    },
  };
}

// Read-only navigation kind of the current document. No storage.
export function currentNavigationType() {
  try {
    if (typeof performance === "undefined" || typeof performance.getEntriesByType !== "function") return "navigate";
    const nav = performance.getEntriesByType("navigation")[0];
    return typeof nav?.type === "string" ? nav.type : "navigate";
  } catch {
    return "navigate";
  }
}
