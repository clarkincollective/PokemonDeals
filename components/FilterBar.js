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

export default function FilterBar({ params, country, cardType, listingType, maxPrice, basePath = "/" }) {
  return (
    <div className="mb-8 flex flex-col gap-4">
      <div>
        <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-zinc-400">
          Country
        </span>
        <ScrollRow>
          {Object.entries(MARKETPLACES).map(([id, info]) => (
            <FilterPill key={id} href={filterHref(params, "country", id, basePath)} active={country === id}>
              {info.flag} {info.label}
            </FilterPill>
          ))}
        </ScrollRow>
      </div>

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

      <div>
        <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-zinc-400">
          Price
        </span>
        <ScrollRow>
          <FilterPill href={filterHref(params, "maxPrice", "25", basePath)} active={maxPrice === 25}>
            Under $25
          </FilterPill>
          <FilterPill href={filterHref(params, "maxPrice", "50", basePath)} active={maxPrice === 50}>
            Under $50
          </FilterPill>
          <FilterPill href={filterHref(params, "maxPrice", "100", basePath)} active={maxPrice === 100}>
            Under $100
          </FilterPill>
        </ScrollRow>
      </div>
    </div>
  );
}
