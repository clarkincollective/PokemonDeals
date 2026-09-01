"use client";

import { useSyncExternalStore } from "react";
import Link from "next/link";
import { EBAY_DOMAIN } from "@/lib/ebaySearch";
import { safeReturnPath, returnLabel, returnHref } from "@/lib/returnContext";

// A "return to where I was browsing" link for /deals/[id].
//
// The origin is read from a `?from=` (+ optional `?country=`) hint that
// DealCard attaches when a card is clicked from an internal browsing
// page. It is STRICTLY WHITELISTED here - route families only, never an
// arbitrary/external URL - and only ever used to build an internal <Link>.
//
// SSR renders the deterministic fallback (species / set / all-deals,
// computed on the server from the deal's own data), so the crawler never
// sees a `?from=` variant - /deals/[id] canonical is unchanged and no
// duplicate URL is exposed. After hydration, a valid `?from=` upgrades
// the link to the exact page (and country) the user came from.
//
// Not history.back(): deals open in new tabs, get shared, and are landed
// on directly - none of which have useful back history.

const KNOWN_COUNTRY = new Set(Object.keys(EBAY_DOMAIN)); // EBAY_US, EBAY_GB, ...

const subscribe = (cb) => {
  window.addEventListener("popstate", cb);
  return () => window.removeEventListener("popstate", cb);
};
const getSnapshot = () => window.location.search;
const getServerSnapshot = () => "";

export default function DealBackLink({ fallbackHref, fallbackLabel, className = "" }) {
  const search = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const sp = new URLSearchParams(search);
  const from = safeReturnPath(sp.get("from"));
  const rawCountry = sp.get("country");
  const country = rawCountry && KNOWN_COUNTRY.has(rawCountry) ? rawCountry : null;

  let href = fallbackHref;
  let text = fallbackLabel;

  if (from) {
    const sameAsFallback = from === String(fallbackHref || "").split("?")[0];
    text = sameAsFallback ? fallbackLabel : returnLabel(from);
    href = returnHref(from, country);
  }

  if (!href) return null;

  return (
    <Link
      href={href}
      className={`inline-flex items-center gap-1.5 text-sm font-medium text-zinc-600 transition-colors hover:text-red-600 dark:text-zinc-400 dark:hover:text-red-500 ${className}`}
    >
      <span aria-hidden="true">←</span> Back to {text}
    </Link>
  );
}
