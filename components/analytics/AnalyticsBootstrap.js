"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { useCurrency } from "@/components/CurrencyProvider";
import { capture, initAnalytics, setCommonContext } from "@/lib/analytics/client";
import { EVENTS, SECTION_CLICK_EVENT } from "@/lib/analytics/events";
import { analyticsEnabled } from "@/lib/analytics/config";
import { deriveFilterEvent } from "@/lib/analytics/filterEvent";
import { readLandingAttribution, deviceClass, isDoNotTrackEnabled } from "@/lib/analytics/session";
import { viewerCountryFromMarketplace, geoCountryProp } from "@/lib/analytics/props";
import { pageTypeFromPath } from "@/lib/analytics/pageType";
import { createPageViewTracker, currentNavigationType } from "@/lib/analytics/pageview";

// Nothing in this component touches browser storage. When analytics is
// off (no key) or the visitor opted out, it does nothing at all.
const ANALYTICS_ACTIVE = analyticsEnabled();

// Module memory = one page-load chain. Survives client navigations (the
// layout never remounts), resets on a full page load. Module scope (not a
// ref) also makes a strict-mode double mount a no-op.
const pageViews = createPageViewTracker();
let landingTrafficSource = "unknown";

// Mounted once, globally, inside CurrencyProvider (app/layout.js).
//   1. starts the deferred analytics init (no-op without a key / with DNT)
//   2. seeds the in-memory common-property bundle (device, country,
//      landing-scoped attribution) - never persisted to the browser
//   3. runs ONE global click-delegation listener for every
//      [data-analytics-click] / [data-analytics-deal] element on any page,
//      so individual server components only need data-attributes.
export default function AnalyticsBootstrap() {
  const { marketplace, viewer, geoCountry } = useCurrency();
  const pathname = usePathname();

  // Deferred init + landing-scoped context (derived from the CURRENT
  // url/referrer, held only in memory for this page's event stream).
  // Set once per page-load chain: client navigations keep the ORIGINAL
  // landing attribution (they never re-read the url/referrer).
  useEffect(() => {
    if (!ANALYTICS_ACTIVE || isDoNotTrackEnabled()) return;
    const attribution = readLandingAttribution();
    landingTrafficSource = attribution.traffic_source;
    setCommonContext({
      device_class: deviceClass(),
      traffic_source: attribution.traffic_source,
      utm_source: attribution.utm_source,
      utm_medium: attribution.utm_medium,
      utm_campaign: attribution.utm_campaign,
      utm_content: attribution.utm_content,
    });
    initAnalytics();

    const onResize = () => setCommonContext({ device_class: deviceClass() });
    window.addEventListener("resize", onResize, { passive: true });
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // One page_view per distinct pathname (initial / reload / back_forward
  // / client) - declared AFTER the attribution effect so the first view
  // already carries the landing context. See lib/analytics/pageview.js.
  useEffect(() => {
    if (!ANALYTICS_ACTIVE || isDoNotTrackEnabled()) return;
    const view = pageViews.next(pathname, {
      navigationType: currentNavigationType(),
      trafficSource: landingTrafficSource,
    });
    if (!view) return;
    if (view.landingContext) setCommonContext(view.landingContext);
    capture(EVENTS.PAGE_VIEW, view.props);
  }, [pathname]);

  // Geography vs shopping context, kept separate:
  //   geo_country     - visitor's coarse country from the edge geo header
  //                     of THIS page load ("unknown" until /api/rates
  //                     answers, or when it can't say). Never inferred.
  //   viewer_currency - the display currency (a shopping context)
  //   viewer_country  - LEGACY marketplace bucket, kept for continuity
  //                     (see lib/analytics/props.js) - not geography.
  useEffect(() => {
    if (!ANALYTICS_ACTIVE) return;
    setCommonContext({
      geo_country: geoCountryProp(geoCountry),
      viewer_country: viewerCountryFromMarketplace(marketplace),
      viewer_currency: viewer || "USD",
    });
  }, [marketplace, viewer, geoCountry]);

  // Global click delegation.
  useEffect(() => {
    if (!ANALYTICS_ACTIVE) return;
    function onClick(e) {
      const target = e.target;
      if (!target || !target.closest) return;

      // 0. FilterBar pills - plain <a href> links inside the marked
      //    container; derive sort_changed / country_changed / filter_*
      //    from the querystring delta without touching FilterBar itself.
      const inFilterBar = target.closest("[data-analytics-filter-bar]");
      if (inFilterBar) {
        const anchor = target.closest("a[href]");
        if (anchor) {
          try {
            const derived = deriveFilterEvent(anchor.getAttribute("href"), window.location.search);
            if (derived) capture(derived.event, derived.props);
          } catch {
            /* ignore */
          }
          return;
        }
      }

      // 1. explicit simple click markers (nav, chips, tiles, CTAs)
      const explicit = target.closest("[data-analytics-click]");
      // 2. deal-card markers carrying a structural JSON payload
      const dealEl = target.closest("[data-analytics-deal]");

      let props = {};
      if (explicit) {
        const name = explicit.getAttribute("data-analytics-click");
        try {
          props = JSON.parse(explicit.getAttribute("data-analytics-props") || "{}");
        } catch {
          props = {};
        }
        // Phase 17B - a site-wide component (the footer follow row) can't
        // know its page; it marks page_type "auto" and the coarse type is
        // filled from the path here (lib/analytics/pageType - never the
        // path itself).
        if (props && props.page_type === "auto") {
          try {
            props = { ...props, page_type: pageTypeFromPath(window.location.pathname) };
          } catch {
            props = { ...props, page_type: "other" };
          }
        }
        if (name) {
          capture(name, props);
          // a "graded" entry point also fires the dedicated graded event
          // (unless the marker already IS graded_clicked)
          if (props && props.graded_entry && name !== EVENTS.GRADED_CLICKED) {
            capture(EVENTS.GRADED_CLICKED, { source: props.source || name });
          }
        }
        return;
      }

      if (dealEl) {
        // 13C.5 - the lane click event (best_deal_clicked / ending_soon_clicked
        // / just_added_clicked) means "opened the deal detail from lane X".
        // The affiliate CTA inside the same card fires its own
        // affiliate_click (with origin_section); without this guard a CTA
        // click bubbled to the card root and double-counted as a lane
        // click too, making "card click -> affiliate click" ratios
        // un-computable.
        if (target.closest('a[rel~="sponsored"]')) return;
        try {
          props = JSON.parse(dealEl.getAttribute("data-analytics-deal") || "{}");
        } catch {
          return;
        }
        const section = props.section;
        const name = SECTION_CLICK_EVENT[section];
        if (!name) return;
        capture(name, props);
      }
    }

    document.addEventListener("click", onClick, { capture: true });
    return () => document.removeEventListener("click", onClick, { capture: true });
  }, []);

  return null;
}
