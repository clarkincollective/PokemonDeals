"use client";

import { Tile } from "@/components/CatalogueBrowser";

// A short, flat grid of the highest market-value cards for a species -
// truthful "highest-value we track" discovery, ranked purely by
// trustworthy reference price (never by anything we'd earn on). `items`
// is built server-side (same shape SpeciesCardsBySet builds, incl. the
// campaign-wrapped ebayHref).
export default function FeaturedValueCards({ speciesName, items }) {
  if (!items || items.length === 0) return null;
  return (
    <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
      {items.map((c) => (
        <Tile
          key={c.tcgplayerId ?? `${c.name}|${c.set}`}
          card={c}
          speciesName={speciesName}
          placement="species_featured_value"
        />
      ))}
    </div>
  );
}
