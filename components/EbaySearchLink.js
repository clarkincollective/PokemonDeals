"use client";

import { track } from "@vercel/analytics";
import { capture } from "@/lib/analytics/client";
import { EVENTS } from "@/lib/analytics/events";
import { pageTypeFromPath } from "@/lib/analytics/pageType";
import { useRegion, localizeEbaySearchUrl } from "@/lib/useRegion";

// The catalogue "Find on eBay" CTA. `href` is the server-built,
// campaign-wrapped US search url (crawler-visible, always valid); on the
// client it's re-pointed at the visitor's marketplace domain
// (ebay.com.au for AU mode, etc.) with every tracking param intact.
//
// One click records exactly two things, one per system, and never blocks
// or delays the outbound navigation:
//   * the existing Vercel Analytics event "eBay Click" (kept unchanged)
//   * PostHog affiliate_click (2026-09-20): until now this control - the
//     no-deal card page's only route to eBay - was invisible to the growth
//     report, which reads PostHog only. Same structural payload shape as
//     AffiliateLink: placement / origin_section from the caller's
//     `event.placement`, page_type from the path, network "ebay", country
//     from the visitor's marketplace. No card name, no free text.
export default function EbaySearchLink({ href, event = {}, className, children }) {
  const region = useRegion();
  const finalHref = localizeEbaySearchUrl(href, region);
  function onClick() {
    try {
      track("eBay Click", { ...event, marketplace: region || "unknown" });
    } catch {
      /* ignore */
    }
    try {
      const placement = event.placement ?? "ebay_search";
      capture(EVENTS.AFFILIATE_CLICK, {
        origin_section: placement,
        placement,
        page_type: typeof window !== "undefined" ? pageTypeFromPath(window.location.pathname) : undefined,
        network: "ebay",
        country: region ? String(region).replace("EBAY_", "") : undefined,
      });
    } catch {
      /* analytics must never block an affiliate click */
    }
  }
  return (
    <a
      href={finalHref}
      target="_blank"
      rel="sponsored noopener noreferrer"
      className={className}
      onClick={onClick}
    >
      {children}
    </a>
  );
}
