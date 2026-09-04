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
  // 13C.5 - the once-gate lives in a ref, NOT inside the effect: a
  // StrictMode / future remount tore down the IntersectionObserver in the
  // cleanup and then `started.current` (its old job) made the whole effect
  // bail on the re-mount, so impressions + scroll depth were never rebuilt.
  // Now the effect always (re)builds the observers per mount, while the
  // ref-held gate keeps every impression firing exactly once for the page.
  const gateRef = useRef(null);
  if (gateRef.current === null) gateRef.current = makeOnceGate();

  useEffect(() => {
    if (!ANALYTICS_ACTIVE) return;
    const gate = gateRef.current;

    // homepage_view: exactly once per page, independent of remounts.
    if (!started.current) {
      started.current = true;
      capture(EVENTS.HOMEPAGE_VIEW, {
        variant, // "promo" | "filtered" | "paged"
        page,
        has_filters: Boolean(hasFilters),
      });
    }

    // --- impressions ---
    let io = null;
    if (typeof IntersectionObserver === "function") {
      io = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (!entry.isIntersecting) continue;
            const el = entry.target;
            // A section wrapper is often much TALLER than the viewport
            // (best_deals ~2300px, all_deals ~5000px on mobile), so its
            // intersectionRatio (visible area / element area) can never
            // reach 0.4 - the impression would never fire. For sections,
            // count it as seen once ~half of MIN(section height, screen
            // height) is visible; deal cards / filter bar are small, so
            // the plain 0.4 ratio still works for them.
            const isSection = el.hasAttribute("data-analytics-section");
            const seen = isSection
              ? entry.intersectionRect.height >=
                0.5 * Math.min(entry.boundingClientRect.height || 0, window.innerHeight || 1)
              : entry.intersectionRatio >= 0.4;
            if (!seen) continue;

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
        // dense thresholds so the callback re-fires as more of a tall
        // section scrolls in (its ratio may never reach 0.4) and the
        // viewport-relative `seen` check above gets a chance to pass.
        { threshold: [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.75, 0.9, 1] }
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
