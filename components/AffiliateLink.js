"use client";

import { track } from "@vercel/analytics";
import { capture } from "@/lib/analytics/client";
import { EVENTS } from "@/lib/analytics/events";
import { listingTypeProp, rawVsGraded, priceBandUsd, discountBand } from "@/lib/analytics/props";

// A normal affiliate link that also records the click. Navigation itself
// is never touched or delayed - both analytics calls are fire-and-forget
// and wrapped so a failure can't stop the outbound click (fail open to
// eBay). EPN / Impact parameters in `href` are passed through untouched.
//
//   eventName / eventData  -> existing Vercel Web Analytics event (kept)
//   analyticsProps          -> optional structural extras for PostHog
//                              (deal_id, origin_section, rank, price_band...)
export default function AffiliateLink({ href, eventName, eventData, analyticsProps, className, children }) {
  function onClick() {
    try {
      track(eventName, eventData);
    } catch {
      /* ignore */
    }
    try {
      const d = eventData || {};
      const p = analyticsProps || {};
      // Build a NON-PII structural payload. Never forward `card` (the card
      // name) or any free text from eventData.
      capture(EVENTS.AFFILIATE_CLICK, {
        origin_section: p.origin_section ?? d.page ?? "unknown",
        content_id: p.content_id ?? (p.deal_id != null ? String(p.deal_id) : undefined),
        deal_id: p.deal_id,
        card_slug: p.card_slug,
        rank: p.rank,
        listing_type: p.listing_type ?? listingTypeProp(d.listingType),
        raw_vs_graded: p.raw_vs_graded ?? rawVsGraded(d.isGraded),
        price_band_usd: p.price_band_usd ?? (d.usdTotal != null ? priceBandUsd(d.usdTotal) : undefined),
        discount_band: p.discount_band ?? (d.discountPct != null ? discountBand(d.discountPct) : undefined),
        country: p.country ?? (d.marketplace ? String(d.marketplace).replace("EBAY_", "") : undefined),
      });
    } catch {
      /* analytics must never block an affiliate click */
    }
  }

  return (
    <a
      href={href}
      target="_blank"
      rel="sponsored noopener noreferrer"
      className={className}
      onClick={onClick}
    >
      {children}
    </a>
  );
}
