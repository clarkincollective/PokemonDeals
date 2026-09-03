import { MARKETPLACES } from "@/lib/ebay";
import FilterToggle from "@/components/FilterToggle";
import { GRADER_CHOICES, GRADE_CHOICES } from "@/lib/dealFilters";

// Builds a link that changes one filter while keeping the others intact,
// or removes it entirely if the same value is clicked again (toggle).
// basePath lets this be reused on any grid page (homepage "/",
// "/japanese-cards", ...) without duplicating the component.
export function filterHref(currentParams, key, value, basePath = "/") {
  const params = new URLSearchParams(currentParams);
  if (params.get(key) === value) params.delete(key);
  else params.set(key, value);
  // Changing a filter always returns to page 1 - otherwise a stale
  // ?page=N carries onto a now-shorter result set and the range request
  // lands past the end.
  params.delete("page");
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
  params.delete("page"); // see filterHref - reset to page 1 on any filter change
  const qs = params.toString();
  return qs ? `${basePath}?${qs}` : basePath;
}

// 13B.3 - a grader/grade pill implies graded: it sets type=graded as well
// as its own key, so the state can never be "PSA + raw". Toggling it off
// leaves type=graded in place (use the Graded pill to leave graded).
export function gradedFilterHref(currentParams, key, value, basePath) {
  const params = new URLSearchParams(currentParams);
  if (params.get(key) === value) params.delete(key);
  else params.set(key, value);
  params.set("type", "graded");
  params.delete("page");
  const qs = params.toString();
  return qs ? `${basePath}?${qs}` : basePath;
}

// Toggling the Graded pill OFF must also drop grader + grade (they depend
// on it); toggling it ON just sets type=graded.
export function typeFilterHref(currentParams, value, basePath) {
  const params = new URLSearchParams(currentParams);
  if (params.get("type") === value) {
    params.delete("type");
    if (value === "graded") {
      params.delete("grader");
      params.delete("grade");
    }
  } else {
    params.set("type", value);
    if (value === "raw") {
      params.delete("grader");
      params.delete("grade");
    }
  }
  params.delete("page");
  const qs = params.toString();
  return qs ? `${basePath}?${qs}` : basePath;
}

function FilterPill({ href, active, children }) {
  return (
    <a
      href={href}
      // Filter / sort permutations all canonicalise back to the base URL -
      // no reason for Google to spend a new site's small crawl budget
      // fetching thousands of them. Pagination links stay followable.
      rel="nofollow"
      className={`shrink-0 whitespace-nowrap rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
        active
          ? "border-zinc-900 bg-zinc-900 text-white dark:border-zinc-50 dark:bg-zinc-50 dark:text-zinc-900"
          : "border-zinc-200 bg-white text-zinc-600 hover:border-red-300 hover:text-red-600 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300 dark:hover:text-red-500"
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

// 13B.3 - grader + grade pills, shown only when Graded is the active card
// type (section 7: when Raw is selected these disappear). Each pill also
// forces type=graded so the combination is always coherent.
export function GradingFilterRow({ params, cardType, grader, grade, basePath = "/" }) {
  const gradedActive = cardType === "graded" || grader != null || grade != null;
  if (!gradedActive) return null;
  return (
    <div>
      <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-zinc-400">
        Grading
      </span>
      <ScrollRow>
        {GRADER_CHOICES.map((g) => (
          <FilterPill key={g} href={gradedFilterHref(params, "grader", g, basePath)} active={grader === g}>
            {g}
          </FilterPill>
        ))}
        <span className="mx-1 w-px shrink-0 self-stretch bg-zinc-200 dark:bg-zinc-800" aria-hidden="true" />
        {GRADE_CHOICES.map((g) => (
          <FilterPill key={g} href={gradedFilterHref(params, "grade", g, basePath)} active={String(grade) === g}>
            {`Grade ${g}`}
          </FilterPill>
        ))}
      </ScrollRow>
    </div>
  );
}

const SORT_OPTIONS = [
  { value: "discount", label: "Biggest discount" },
  { value: "price_asc", label: "Price: low to high" },
  { value: "price_desc", label: "Price: high to low" },
  { value: "newest", label: "Newest" },
  { value: "ending", label: "Ending soon" },
];

// Sort pills - plain <a> links so this needs no client JS. `defaultValue`
// is the effective sort when no ?sort= is set (the grid pages default to
// a shuffled/newest view, so nothing is "active" until the user picks).
export function SortRow({ params, sort, basePath = "/", defaultValue }) {
  return (
    <div>
      <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-zinc-400">Sort</span>
      <ScrollRow>
        {SORT_OPTIONS.map((o) => (
          <FilterPill
            key={o.value}
            href={filterHref(params, "sort", o.value, basePath)}
            active={sort === o.value || (!sort && o.value === defaultValue)}
          >
            {o.label}
          </FilterPill>
        ))}
      </ScrollRow>
    </div>
  );
}

export default function FilterBar({
  params,
  country,
  cardType,
  grader,
  grade,
  showGrading = false,
  listingType,
  maxPrice,
  minPrice,
  sort,
  basePath = "/",
}) {
  const activeCount = [
    country,
    cardType,
    showGrading ? grader : null,
    showGrading ? grade : null,
    listingType,
    maxPrice,
    minPrice,
    sort,
  ].filter((v) => v != null).length;

  // Older links / other grids emit ?listing=FIXED_PRICE; the Pokemon page
  // also accepts ?listing=BIN. Treat either as the same active state.
  const binActive = listingType === "FIXED_PRICE" || listingType === "BIN";

  return (
    <div className="mb-8 lg:rounded-xl lg:border lg:border-zinc-200 lg:bg-white lg:p-4 lg:shadow-card dark:lg:border-zinc-800 dark:lg:bg-zinc-950">
      <FilterToggle defaultOpen={activeCount > 0} activeCount={activeCount}>
        <div className="flex flex-col gap-4">
          <SortRow params={params} sort={sort} basePath={basePath} defaultValue="newest" />

          <CountryFilterRow params={params} country={country} basePath={basePath} />

          <div>
            <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-zinc-400">
              Card &amp; listing
            </span>
            <ScrollRow>
              <FilterPill
                href={showGrading ? typeFilterHref(params, "raw", basePath) : filterHref(params, "type", "raw", basePath)}
                active={cardType === "raw"}
              >
                Raw
              </FilterPill>
              <FilterPill
                href={showGrading ? typeFilterHref(params, "graded", basePath) : filterHref(params, "type", "graded", basePath)}
                active={cardType === "graded"}
              >
                Graded
              </FilterPill>
              <FilterPill
                href={filterHref(params, "listing", showGrading ? "BIN" : "FIXED_PRICE", basePath)}
                active={binActive}
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

          {showGrading && (
            <GradingFilterRow
              params={params}
              cardType={cardType}
              grader={grader}
              grade={grade}
              basePath={basePath}
            />
          )}

          <PriceFilterRow params={params} maxPrice={maxPrice} minPrice={minPrice} basePath={basePath} />
        </div>
      </FilterToggle>
    </div>
  );
}
