"use client";

import { useEffect, useState } from "react";
import AffiliateLink from "@/components/AffiliateLink";
import Price from "@/components/Price";

// A price + buy CTA pinned to the bottom of the viewport on long deal
// pages, so the action is always reachable without scrolling back up.
// Appears only after the user has scrolled past the main CTA (~500px),
// and only on narrower viewports where the in-page button is off-screen.
// Pass priceUsd + priceNative ({ amount, currency }) so the price
// localises to the viewer's currency after hydration like everywhere else.
export default function StickyDealCta({ href, priceUsd, priceNative, priceLabel, ctaLabel = "Check on eBay →", eventData }) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const onScroll = () => setShow(window.scrollY > 480);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  if (!href) return null;

  return (
    <div
      className={`fixed inset-x-0 bottom-0 z-40 border-t border-zinc-200 bg-white/95 backdrop-blur transition-transform duration-200 lg:hidden dark:border-zinc-800 dark:bg-zinc-950/95 ${
        show ? "translate-y-0" : "translate-y-full"
      }`}
    >
      <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-3">
        <span className="flex flex-col leading-tight">
          {priceLabel && (
            <span className="text-[10px] font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              {priceLabel}
            </span>
          )}
          <Price
            usd={priceUsd}
            native={priceNative}
            className="text-lg font-bold text-black dark:text-zinc-50"
          />
        </span>
        <AffiliateLink
          href={href}
          eventName="eBay Click"
          eventData={{ ...eventData, page: "sticky_cta" }}
          className="flex-1 rounded-md bg-black px-4 py-2.5 text-center text-sm font-semibold text-white transition-colors hover:bg-zinc-800 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
        >
          {ctaLabel}
        </AffiliateLink>
      </div>
    </div>
  );
}
