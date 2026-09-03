"use client";

import { useEffect, useRef } from "react";
import { capture } from "@/lib/analytics/client";
import { EVENTS } from "@/lib/analytics/events";
import { analyticsEnabled } from "@/lib/analytics/config";
import { makeOnceGate, scrollDepthBucket } from "@/lib/analytics/observer";

const ANALYTICS_ACTIVE = analyticsEnabled();

// Mounted once in app/page.js. Owns homepage-only measurement:
//   * homepage_view (with the promo/filter variant)
//   * homepage_section_impression   for [data-analytics-section]
//   * deal_card_impression          for [data-analytics-deal-impression]
//   * filter_bar_impression         for [data-analytics-filter-bar]
//   * homepage_scroll_depth         (diagnostic only, 25/50/75/100)
// Lane CLICKS are handled globally by AnalyticsBootstrap via delegation.
export default function HomepageAnalytics({ variant = "promo", page = 1, hasFilters = false }) {
  const started = useRef(false);

  useEffect(() => {
    if (!ANALYTICS_ACTIVE || started.current) return;
    started.current = true;

    capture(EVENTS.HOMEPAGE_VIEW, {
      variant, // "promo" | "filtered" | "paged"
      page,
      has_filters: Boolean(hasFilters),
    });

    const gate = makeOnceGate();

    // --- impressions ---
    let io = null;
    if (typeof IntersectionObserver === "function") {
      io = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (!entry.isIntersecting || entry.intersectionRatio < 0.4) continue;
            const el = entry.target;

            const section = el.getAttribute("data-analytics-section");
            if (section && gate.take(`section:${section}`)) {
              capture(EVENTS.HOMEPAGE_SECTION_IMPRESSION, { section });
            }

            const filterBar = el.getAttribute("data-analytics-filter-bar");
            if (filterBar != null && gate.take("filter_bar")) {
              capture(EVENTS.FILTER_BAR_IMPRESSION, {});
            }

            const dealRaw = el.getAttribute("data-analytics-deal-impression");
            if (dealRaw && gate.take(`deal:${dealRaw}`)) {
              let props = {};
              try {
                props = JSON.parse(dealRaw);
              } catch {
                props = {};
              }
              capture(EVENTS.DEAL_CARD_IMPRESSION, props);
            }

            io.unobserve(el);
          }
        },
        { threshold: [0, 0.4, 0.75] }
      );

      const targets = document.querySelectorAll(
        "[data-analytics-section],[data-analytics-deal-impression],[data-analytics-filter-bar]"
      );
      targets.forEach((t) => io.observe(t));
    }

    // --- scroll depth (diagnostic) ---
    let lastBucket = 0;
    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        ticking = false;
        const bucket = scrollDepthBucket(
          window.scrollY,
          window.innerHeight,
          document.documentElement.scrollHeight
        );
        if (bucket > lastBucket && gate.take(`scroll:${bucket}`)) {
          lastBucket = bucket;
          capture(EVENTS.HOMEPAGE_SCROLL_DEPTH, { depth: bucket });
        }
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });

    return () => {
      if (io) io.disconnect();
      window.removeEventListener("scroll", onScroll);
    };
  }, [variant, page, hasFilters]);

  return null;
}
