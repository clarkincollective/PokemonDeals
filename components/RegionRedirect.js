"use client";

import { useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { REGION_KEY } from "@/components/RegionControl";
import { useCurrency } from "@/components/CurrencyProvider";

// Renders nothing. On a listing page with no explicit ?country=, sends
// the visitor to deals they can actually buy:
//   1. an explicit ?country= in the URL always wins (do nothing);
//   2. else a stored preference (RegionControl) wins - including the
//      empty string, which means "All countries" (do nothing);
//   3. else the geo-detected marketplace (from /api/rates via the
//      currency context), used only as a default - it is NOT written to
//      storage, so the visitor can still override it and that persists.
//
// The geo default now arrives client-side (after hydration) rather than
// as a server prop, so the host page never reads the geo header and stays
// cacheable.
export default function RegionRedirect() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { marketplace: detected } = useCurrency();

  useEffect(() => {
    if (searchParams.has("country")) return;

    let stored = null;
    try {
      stored = window.localStorage.getItem(REGION_KEY);
    } catch {
      stored = null;
    }

    // stored: "EBAY_XX" = a choice, "" = explicit All, null = no choice.
    // With no stored choice we fall back to the geo default, which only
    // arrives once /api/rates resolves - wait for it rather than doing
    // nothing permanently.
    if (stored === null && !detected) return;
    const target = stored === null ? detected : stored;
    if (!target) return;

    const next = new URLSearchParams(searchParams);
    next.set("country", target);
    next.delete("page");
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
    // Let the header control re-read the now-applied region.
    window.dispatchEvent(new Event("pdf:region"));
  }, [pathname, searchParams, router, detected]);

  return null;
}
