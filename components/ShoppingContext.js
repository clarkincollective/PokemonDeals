"use client";

import { useRegion, regionMeta } from "@/lib/useRegion";

// "Shopping in: 🇦🇺 Australia" - makes the marketplace the live CTAs use
// visible without duplicating the header RegionControl. Renders nothing
// until the client knows the region (SSR / "All countries" -> nothing),
// so the static shell isn't tied to one country.
export default function ShoppingContext({ className = "" }) {
  const region = useRegion();
  const meta = regionMeta(region);
  if (!meta) return null;
  return (
    <p className={`text-sm font-medium text-zinc-600 dark:text-zinc-300 ${className}`}>
      Shopping in: <span className="font-semibold">{meta.flag} {meta.label}</span>
    </p>
  );
}

// The region label for a heading, e.g. "Best Charizard deals in Australia".
// "" -> "".
export function RegionSuffix() {
  const region = useRegion();
  const meta = regionMeta(region);
  return meta ? <> in {meta.label}</> : null;
}
