import { MARKETPLACES } from "@/lib/ebay";

// Builds a link that changes one filter while keeping the others intact,
// or removes it entirely if the same value is clicked again (toggle).
// basePath lets this be reused on any grid page (homepage "/",
// "/japanese-cards", ...) without duplicating the component.
export function filterHref(currentParams, key, value, basePath = "/") {
  const params = new URLSearchParams(currentParams);
  if (params.get(key) === value) params.delete(key);
  else params.set(key, value);
  const qs = params.toString();
  return qs ? `${basePath}?${qs}` : basePath;
}

// Same toggle behavior as filterHref, but also clears the opposite price
// bound - "Under $50" and "$100+" are mutually exclusive budget choices,
// and leaving both set would silently produce a contradictory (always
// empty) filter.
export function priceFilterHref(currentParams, key, value, basePath) {
  const params = new URLSearchParams(currentParams);
  const otherKey = key === "maxPrice" ? "minPrice" : "maxPrice";
  if (params.get(key) === value) {
    params.delete(key);
  } else {
    params.set(key, value);
    params.delete(otherKey);
  }
  const qs = params.toString();
  return qs ? `${basePath}?${qs}` : basePath;
}

function FilterPill({ href, active, children }) {
  return (
    <a
      href={href}
      className={`shrink-0 whitespace-nowrap rounded-md border px-3 py-1 text-xs font-medium transition-colors ${
        active
          ? "border-black bg-black text-white dark:border-white dark:bg-white dark:text-black"
          : "border-zinc-200 bg-white text-zinc-600 hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300"
      }`}
    >
      {children}
    </a>
  );
}

// A horizontally scrolling strip instead of wrapping pills onto a second
// line - bleeds past the page's own side padding (-mx-6/px-6) so it can
// scroll edge-to-edge, and hides the scrollbar for a cleaner look.
function ScrollRow({ children }) {
  return (
    <div className="-mx-6 flex gap-2 overflow-x-auto px-6 pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {children}
    </div>
  );
}

// Standalone, so pages without a raw/graded distinction (e.g.
// /sealed-deals - a booster box has no "condition" the way a card does)
// can still offer country filtering without pulling in Card & listing.
export function CountryFilterRow({ params, country, basePath = "/" }) {
  return (
    <div>
      <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-zinc-400">Country</span>
      <ScrollRow>
        {Object.entries(MARKETPLACES).map(([id, info]) => (
          <FilterPill key={id} href={filterHref(params, "country", id, basePath)} active={country === id}>
            {info.flag} {info.label}
          </FilterPill>
        ))}
      </ScrollRow>
    </div>
  );
}

// Standalone for the same reason - "Buy It Now"/"Auction" applies to
// sealed listings too, "Raw"/"Graded" doesn't.
export function ListingTypeFilterRow({ params, listingType, basePath = "/" }) {
  return (
    <div>
      <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-zinc-400">Listing</span>
      <ScrollRow>
        <FilterPill href={filterHref(params, "listing", "FIXED_PRICE", basePath)} active={listingType === "FIXED_PRICE"}>
          Buy It Now
        </FilterPill>
        <FilterPill href={filterHref(params, "listing", "AUCTION", basePath)} active={listingType === "AUCTION"}>
          Auction
        </FilterPill>
      </ScrollRow>
    </div>
  );
}

// Standalone, so pages that don't want the full filter set (e.g.
// /best-finds, which already has its own raw/graded toggle) can still
// offer the same price pills without pulling in Country/Card & listing.
export function PriceFilterRow({ params, maxPrice, minPrice, basePath = "/" }) {
  return (
    <div>
      <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-zinc-400">Price</span>
      <ScrollRow>
        <FilterPill href={priceFilterHref(params, "maxPrice", "25", basePath)} active={maxPrice === 25}>
          Under $25
        </FilterPill>
        <FilterPill href={priceFilterHref(params, "maxPrice", "50", basePath)} active={maxPrice === 50}>
          Under $50
        </FilterPill>
        <FilterPill href={priceFilterHref(params, "maxPrice", "100", basePath)} active={maxPrice === 100}>
          Under $100
        </FilterPill>
        <FilterPill href={priceFilterHref(params, "minPrice", "100", basePath)} active={minPrice === 100}>
          $100+
        </FilterPill>
        <FilterPill href={priceFilterHref(params, "minPrice", "500", basePath)} active={minPrice === 500}>
          $500+
        </FilterPill>
      </ScrollRow>
    </div>
  );
}

export default function FilterBar({ params, country, cardType, listingType, maxPrice, minPrice, basePath = "/" }) {
  return (
    <div className="mb-8 flex flex-col gap-4">
      <CountryFilterRow params={params} country={country} basePath={basePath} />

      <div>
        <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-zinc-400">
          Card &amp; listing
        </span>
        <ScrollRow>
          <FilterPill href={filterHref(params, "type", "raw", basePath)} active={cardType === "raw"}>
            Raw
          </FilterPill>
          <FilterPill href={filterHref(params, "type", "graded", basePath)} active={cardType === "graded"}>
            Graded
          </FilterPill>
          <FilterPill
            href={filterHref(params, "listing", "FIXED_PRICE", basePath)}
            active={listingType === "FIXED_PRICE"}
          >
            Buy It Now
          </FilterPill>
          <FilterPill
            href={filterHref(params, "listing", "AUCTION", basePath)}
            active={listingType === "AUCTION"}
          >
            Auction
          </FilterPill>
        </ScrollRow>
      </div>

      <PriceFilterRow params={params} maxPrice={maxPrice} minPrice={minPrice} basePath={basePath} />
    </div>
  );
}
