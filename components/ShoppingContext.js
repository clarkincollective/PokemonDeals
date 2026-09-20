"use client";

import { useRegion, regionMeta } from "@/lib/useRegion";
import MarketplaceMark from "@/components/MarketplaceMark";

// "eBay marketplace: 🇦🇺 eBay Australia" - makes the marketplace the live CTAs use
// visible without duplicating the header RegionControl. Renders nothing
// until the client knows the region (SSR / "All countries" -> nothing),
// so the static shell isn't tied to one country.
export default function ShoppingContext({ className = "" }) {
  const region = useRegion();
  const meta = regionMeta(region);
  if (!meta) return null;
  return (
    <p className={`text-sm font-medium text-zinc-600 dark:text-zinc-300 ${className}`}>
      eBay marketplace: <span className="font-semibold"><MarketplaceMark code={meta.short} className="mr-1.5 align-[-2px]" />eBay {meta.label}</span>
    </p>
  );
}

// The marketplace label for a heading, e.g. "Best Charizard deals on eBay Australia".
// "" -> "".
export function RegionSuffix() {
  const region = useRegion();
  const meta = regionMeta(region);
  return meta ? <> on eBay {meta.label}</> : null;
}
