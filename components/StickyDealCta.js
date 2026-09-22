"use client";

import { useEffect, useState } from "react";
import AffiliateLink from "@/components/AffiliateLink";
import { hasPrice } from "@/lib/money";
import Price from "@/components/Price";

// A price + buy CTA pinned to the bottom of the viewport on long deal
// pages, so the action is always reachable without scrolling back up.
// Appears only after the user has scrolled past the main CTA (~500px),
// and only on narrower viewports where the in-page button is off-screen.
// Pass priceUsd + priceNative ({ amount, currency }) so the price
// localises to the viewer's currency after hydration like everywhere else.
// `ctaSubLabel` (2026-09-22) is the second line - the marketplace, as on
// the accepted deal card ("Buy this deal →" / "on eBay UK"). It keeps
// the bar naming eBay now that the first line carries the accepted
// action wording rather than "View on eBay". Omitted -> single line, so
// the default below is unchanged for any other caller.
export default function StickyDealCta({ href, priceUsd, priceNative, priceLabel, priceNote, ctaLabel = "View on eBay →", ctaSubLabel = null, eventData }) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const onScroll = () => setShow(window.scrollY > 480);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  if (!href) return null;
  const priceAvailable = hasPrice(priceNative?.amount);

  return (
    <div
      inert={!show}
      className={`fixed inset-x-0 bottom-0 z-40 border-t border-zinc-200 bg-white/95 shadow-[0_-1px_12px_rgba(0,0,0,0.06)] backdrop-blur transition-transform duration-200 lg:hidden dark:border-zinc-800 dark:bg-zinc-950/95 dark:shadow-[0_-1px_12px_rgba(0,0,0,0.4)] ${
        show ? "translate-y-0" : "translate-y-full"
      }`}
    >
      <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-2.5">
        <span className="flex min-w-0 shrink flex-col leading-tight">
          {priceAvailable && priceLabel && (
            <span className="text-[11px] font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              {priceLabel}
            </span>
          )}
          {priceAvailable ? <Price
            usd={priceUsd}
            native={priceNative}
            className="truncate text-lg font-bold text-black dark:text-zinc-50"
          /> : <span className="text-sm font-semibold">Price unavailable</span>}
          {priceAvailable && priceNote && <span className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">{priceNote}</span>}
        </span>
        <AffiliateLink
          href={href}
          eventName="eBay Click"
          eventData={{ ...eventData, page: "sticky_cta" }}
          className="flex min-h-12 flex-1 basis-3/5 flex-col items-center justify-center gap-0.5 rounded-lg bg-red-600 px-4 py-2 text-center text-white transition-colors hover:bg-red-700 active:bg-red-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600"
        >
          <span className="text-sm font-bold leading-none">{ctaLabel}</span>
          {ctaSubLabel && <span className="text-[11px] font-medium leading-none opacity-80">{ctaSubLabel}</span>}
        </AffiliateLink>
      </div>
    </div>
  );
}
