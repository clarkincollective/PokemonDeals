"use client";

import { track } from "@vercel/analytics";

// A normal affiliate link that also fires a Vercel Analytics event on
// click - lets you see actual click-throughs on the links that make
// money, not just raw pageviews. Navigation itself is unaffected; this
// only adds tracking.
export default function AffiliateLink({ href, eventName, eventData, className, children }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="sponsored noopener noreferrer"
      className={className}
      onClick={() => track(eventName, eventData)}
    >
      {children}
    </a>
  );
}
