"use client";

import { useEffect } from "react";
import { capture } from "@/lib/analytics/client";
import { EVENTS } from "@/lib/analytics/events";
import { analyticsEnabled } from "@/lib/analytics/config";
import { createDwellTimer } from "@/lib/analytics/observer";

const ANALYTICS_ACTIVE = analyticsEnabled();

// Mounted on /cards/[slug] and /deals/[id]. If the visitor arrived from
// the homepage or search (established WITHOUT any stored hint - only the
// product-functional "?from=" param that DealCard already adds for its
// back-link, plus a same-host referrer), fires <kind>_viewed_from_home
// once, then fires qualified_detail_view after ~10s of *visible* time
// (Page Visibility API - a backgrounded tab does not accrue).
//
// Which specific homepage LANE the click came from is no longer passed
// through the client (that needed sessionStorage). It is recoverable in
// PostHog by sequencing the preceding same-session lane click event.
//
//   kind:       "card" | "deal"
//   contentId:  deal id or card slug (allowed as content_id / card_slug)
export default function DetailViewAnalytics({ kind, contentId }) {
  useEffect(() => {
    if (!ANALYTICS_ACTIVE) return;
    let originSection = null;
    let cameFromInternal = false;

    // the product-functional "?from=" hint DealCard adds for DealBackLink
    // (read client-side; this route never reads searchParams on the server)
    let fromParam = null;
    try {
      fromParam = new URLSearchParams(window.location.search).get("from");
    } catch {
      fromParam = null;
    }
    if (typeof fromParam === "string" && fromParam.startsWith("/")) {
      cameFromInternal = true;
      if (fromParam === "/" || fromParam.startsWith("/?")) originSection = "homepage";
      else if (fromParam.startsWith("/search")) originSection = "search";
      else originSection = "internal";
    }
    if (!cameFromInternal) {
      try {
        const ref = document.referrer ? new URL(document.referrer) : null;
        if (ref && ref.hostname === window.location.hostname) {
          cameFromInternal = true;
          originSection =
            ref.pathname === "/" ? "homepage" : ref.pathname.startsWith("/search") ? "search" : "internal";
        }
      } catch {
        /* ignore */
      }
    }

    const baseProps = {
      content_id: contentId != null ? String(contentId) : undefined,
      [kind === "card" ? "card_slug" : "deal_id"]: contentId != null ? String(contentId) : undefined,
      origin_section: originSection || "unknown",
    };

    if (cameFromInternal) {
      capture(kind === "card" ? EVENTS.CARD_VIEWED_FROM_HOME : EVENTS.DEAL_VIEWED_FROM_HOME, baseProps);
    }

    // qualified dwell - counts for any detail view reached from
    // home/search; if we can't establish origin we still measure it but
    // tag origin_section:"unknown" so reporting can include or exclude.
    const dwell = createDwellTimer({
      thresholdMs: 10000,
      onQualified: () =>
        capture(EVENTS.QUALIFIED_DETAIL_VIEW, {
          ...baseProps,
          kind,
          from_internal: cameFromInternal,
        }),
    });

    const onVisibility = () => dwell.setVisible(document.visibilityState === "visible");
    dwell.setVisible(document.visibilityState === "visible");
    dwell.start();
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      dwell.stop();
    };
  }, [kind, contentId]);

  return null;
}
