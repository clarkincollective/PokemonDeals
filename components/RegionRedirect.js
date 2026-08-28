"use client";

import { useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { REGION_KEY } from "@/components/RegionControl";

// Renders nothing. On a listing page with no explicit ?country=, if the
// viewer has picked a shipping region (see RegionControl), re-navigate to
// add ?country=<region> so they land on deals they can actually buy.
// An explicit ?country in the URL always wins; "All countries" and
// "no choice yet" both leave the page untouched (localStorage "" / null).
export default function RegionRedirect() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();

  useEffect(() => {
    if (searchParams.has("country")) return;
    let pref = null;
    try {
      pref = window.localStorage.getItem(REGION_KEY);
    } catch {
      return;
    }
    if (!pref) return; // no choice, or explicit "all"
    const next = new URLSearchParams(searchParams);
    next.set("country", pref);
    next.delete("page");
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  }, [pathname, searchParams, router]);

  return null;
}
