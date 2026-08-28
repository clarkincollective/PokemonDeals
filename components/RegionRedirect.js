"use client";

import { useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { REGION_KEY } from "@/components/RegionControl";

// Renders nothing. On a listing page with no explicit ?country=, sends
// the visitor to deals they can actually buy:
//   1. an explicit ?country= in the URL always wins (do nothing);
//   2. else a stored preference (RegionControl) wins - including the
//      empty string, which means "All countries" (do nothing);
//   3. else the geo-detected marketplace (`detected` prop), used only as
//      a default - it is NOT written to storage, so the visitor can
//      still override it and that choice persists.
export default function RegionRedirect({ detected = null }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();

  useEffect(() => {
    if (searchParams.has("country")) return;

    let stored = null;
    try {
      stored = window.localStorage.getItem(REGION_KEY);
    } catch {
      stored = null;
    }

    // stored: "EBAY_XX" = a choice, "" = explicit All, null = no choice.
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
