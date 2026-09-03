"use client";

import { useEffect } from "react";
import { useCurrency } from "@/components/CurrencyProvider";
import { capture, initAnalytics, setCommonContext } from "@/lib/analytics/client";
import { EVENTS, SECTION_CLICK_EVENT } from "@/lib/analytics/events";
import { analyticsEnabled } from "@/lib/analytics/config";
import { deriveFilterEvent } from "@/lib/analytics/filterEvent";
import { readLandingAttribution, deviceClass, isDoNotTrackEnabled } from "@/lib/analytics/session";
import { viewerCountryFromMarketplace } from "@/lib/analytics/props";

// Nothing in this component touches browser storage. When analytics is
// off (no key) or the visitor opted out, it does nothing at all.
const ANALYTICS_ACTIVE = analyticsEnabled();

// Mounted once, globally, inside CurrencyProvider (app/layout.js).
//   1. starts the deferred analytics init (no-op without a key / with DNT)
//   2. seeds the in-memory common-property bundle (device, country,
//      landing-scoped attribution) - never persisted to the browser
//   3. runs ONE global click-delegation listener for every
//      [data-analytics-click] / [data-analytics-deal] element on any page,
//      so individual server components only need data-attributes.
export default function AnalyticsBootstrap() {
  const { marketplace, viewer } = useCurrency();

  // Deferred init + landing-scoped context (derived from the CURRENT
  // url/referrer, held only in memory for this page's event stream).
  useEffect(() => {
    if (!ANALYTICS_ACTIVE || isDoNotTrackEnabled()) return;
    const attribution = readLandingAttribution();
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

  // Country / currency arrive after /api/rates resolves.
  useEffect(() => {
    if (!ANALYTICS_ACTIVE) return;
    setCommonContext({
      viewer_country: viewerCountryFromMarketplace(marketplace),
      viewer_currency: viewer || "USD",
    });
  }, [marketplace, viewer]);

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
