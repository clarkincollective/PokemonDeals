"use client";

import { track } from "@vercel/analytics";
import { useRegion, localizeEbaySearchUrl } from "@/lib/useRegion";

// The catalogue "Find on eBay" CTA. `href` is the server-built,
// campaign-wrapped US search url (crawler-visible, always valid); on the
// client it's re-pointed at the visitor's marketplace domain
// (ebay.com.au for AU mode, etc.) with every tracking param intact.
// Fires one Vercel Analytics event with placement/CTA context.
export default function EbaySearchLink({ href, event = {}, className, children }) {
  const region = useRegion();
  const finalHref = localizeEbaySearchUrl(href, region);
  return (
    <a
      href={finalHref}
      target="_blank"
      rel="sponsored noopener noreferrer"
      className={className}
      onClick={() => track("eBay Click", { ...event, marketplace: region || "unknown" })}
    >
      {children}
    </a>
  );
}
