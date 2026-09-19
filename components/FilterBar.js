import { MARKETPLACES } from "@/lib/ebayLinks";
import { allMarketplacesHref, isAllMarketplaces, marketplaceName } from "@/lib/marketplaceScope";
import FilterToggle from "@/components/FilterToggle";
import { GRADER_CHOICES, GRADE_CHOICES, ENDING_VALUES, ENDING_LABELS, endingHref } from "@/lib/dealFilters";

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

// 2026-09-19 - the auction ending-window pill href lives in lib/dealFilters
// (pure, unit-tested); re-exported here beside the other href helpers.
export { endingHref };

function withoutParams(currentParams, keys, basePath) {
  const params = new URLSearchParams(currentParams);
  for (const k of keys) params.delete(k);
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

function FilterPill({ href, active, children, ...rest }) {
  return (
    <a
      {...rest}
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
//
// Labelled "Listing marketplace", not "Country": this filters by which
// eBay site (?country=) a listing was scanned from - it is the `country`
// param's real, only meaning (an exact eq on the stored `marketplace`
// column). It is a DIFFERENT axis from the header's "Shipping to…"
// control (delivery/currency region for the viewer) - reusing the same
// flags for both risked a visitor reading this as "ships to Australia"
// when it means "listed on ebay.com.au", a US-marketplace listing can
// still ship to Australia and vice versa.
// "All marketplaces" is always offered (marketplace-broaden-r1). It keeps
// every other filter, resets ?page and sets the explicit ?country=all, which
// a stored or geo-detected region never overrides; the click also saves the
// choice (data-marketplace-choice, handled by the header RegionControl).
// allOption: "All deals" (/deals) browses every marketplace by default, so
// there the default state (no ?country) is itself that choice, shows the
// pill as active, and the pill links to the clean URL.
export function CountryFilterRow({ params, country, basePath = "/", allOption = false }) {
  const allActive = isAllMarketplaces(country) || (allOption && !country);
  return (
    <div>
      <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-zinc-400">
        Listing marketplace
      </span>
      <p className="mb-2 text-[11px] text-zinc-400">
        Which eBay site the listing is on - not where it ships or where the seller is. Check
        delivery to you on the eBay listing.
      </p>
      <ScrollRow>
        <FilterPill
          href={allOption ? withoutParams(params, ["country"], basePath) : allMarketplacesHref(params, basePath)}
          active={allActive}
          data-marketplace-choice="all"
        >
          All marketplaces
        </FilterPill>
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

// Graded browsing pilot - search WITHIN this page's already-tracked
// inventory only (an ILIKE on the stored listing title, no provider call
// - see /api/deals-page's `q` handling). A plain GET form: submitting it
// needs no client JS (a real navigation to `basePath?q=...`), but the
// *result* of that navigation is still 100% client-fetched, same as
// every other filter on this page (DealGrid's own SSR-always-renders-
// page-1 contract) - so without JS the visitor lands on a page that
// looks identical to the unfiltered default, with no signal anything
// happened. Review finding (2026-09-14): showing the form unconditionally
// there was actively misleading, not just incomplete - it looks like a
// working search that silently does nothing. `<noscript>` swaps it for
// a plain statement instead, the same pattern used nowhere else in this
// codebase but the smallest correct fix here: CSS inside <noscript> only
// applies when JS is unavailable, so a scripted browser is completely
// unaffected and renders exactly as before.
//
// The hidden inputs below correctly carry every other active param once
// this component is hydrated (params comes from the real URL then) - the
// gap this replaces was specific to a visitor who never hydrates at all,
// for whom the JS-only wrapper below now hides the form entirely.
export function SearchWithinRow({ params, q, basePath = "/" }) {
  const carried = Object.entries(params).filter(([k]) => k !== "q" && k !== "page");
  return (
    <div>
      <noscript>
        <style>{".pdf-search-within{display:none!important}"}</style>
      </noscript>
      <noscript>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Searching within these results requires JavaScript. Use the filters above, or browse the full list below.
        </p>
      </noscript>
      <div className="pdf-search-within">
        <label htmlFor="deal-search-within" className="mb-2 block text-xs font-semibold uppercase tracking-wide text-zinc-400">
          Search within these results
        </label>
        <form method="get" action={basePath} className="flex gap-2">
          {carried.map(([k, v]) => (
            <input key={k} type="hidden" name={k} value={v} />
          ))}
          <input
            id="deal-search-within"
            type="search"
            name="q"
            defaultValue={q ?? ""}
            placeholder="Card or set name…"
            className="min-w-0 flex-1 rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
          />
          <button
            type="submit"
            className="shrink-0 rounded-lg bg-zinc-900 px-3.5 py-2 text-sm font-semibold text-white transition-colors hover:bg-zinc-800 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            Search
          </button>
        </form>
      </div>
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
  // 2026-09-19 - auction ending window (1h | 6h | 24h). Offered only where
  // the grid's loader honours it (showEnding); never silently dropped.
  ending = null,
  showEnding = false,
  maxPrice,
  minPrice,
  sort,
  basePath = "/",
  // Graded browsing pilot: the page's own category preset already fixes
  // cardType (e.g. "graded" on /deals/graded) - offering the Raw/Graded
  // toggle here would be contradictory (clicking Raw would silently show
  // raw cards under a page titled Graded). When set, that toggle is
  // replaced with a plain, non-interactive label instead.
  lockedCardType = null,
  // audit-r1: a country landing page (/deals/uk, ...) fixes the marketplace
  // the same way - the country row becomes a plain label, never a pill
  // that would contradict the page (the preset wins server-side).
  lockedCountry = null,
  // Pilot scope only (currently just the graded category) - renders
  // SearchWithinRow when true.
  searchable = false,
  q,
  // Deal-first R2 (homepage feed): the whole bar sits behind a "More
  // filters" button at every width; the rows stay in the DOM.
  collapsible = false,
  // "All deals": offer an explicit, default-active "All marketplaces" pill.
  allMarketplaces = false,
}) {
  const activeCount = [
    lockedCountry ? null : country,
    // A locked cardType is the page's own identity, not a visitor choice -
    // it must not inflate the "N filters active" badge or force the panel
    // open on a page where nothing has actually been picked yet.
    lockedCardType ? null : cardType,
    showGrading ? grader : null,
    showGrading ? grade : null,
    listingType,
    showEnding ? ending : null,
    maxPrice,
    minPrice,
    sort,
    searchable ? q : null,
  ].filter((v) => v != null).length;

  // Older links / other grids emit ?listing=FIXED_PRICE; the Pokemon page
  // also accepts ?listing=BIN. Treat either as the same active state.
  const binActive = listingType === "FIXED_PRICE" || listingType === "BIN";

  return (
    <div className={collapsible ? "mb-6" : "mb-8 lg:rounded-xl lg:border lg:border-zinc-200 lg:bg-white lg:p-4 lg:shadow-card dark:lg:border-zinc-800 dark:lg:bg-zinc-950"}>
      <FilterToggle
        defaultOpen={activeCount > 0}
        activeCount={activeCount}
        collapsible={collapsible}
        label={collapsible ? "More filters" : "Filters"}
        // the sheet's Reset: every visitor-chosen key dropped, the page's
        // own locked identity (category / country preset) untouched
        resetHref={withoutParams(params, ["country", "type", "grader", "grade", "listing", "ending", "maxPrice", "minPrice", "sort", "q"], basePath)}
      >
        <div className="flex flex-col gap-4">
          <SortRow params={params} sort={sort} basePath={basePath} defaultValue="newest" />

          {lockedCountry ? (
            <div>
              <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-zinc-400">Marketplace</span>
              <span className="inline-block whitespace-nowrap rounded-full border border-zinc-300 bg-zinc-50 px-3 py-1 text-xs font-medium text-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400">
                {marketplaceName(lockedCountry) ?? lockedCountry} listings only
              </span>
            </div>
          ) : (
            <CountryFilterRow params={params} country={country} basePath={basePath} allOption={allMarketplaces} />
          )}

          <div>
            <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-zinc-400">
              Card &amp; listing
            </span>
            <ScrollRow>
              {lockedCardType ? (
                // Not a control - this page's identity, stated plainly
                // instead of offering a Raw pill that would silently
                // contradict it (the category preset always wins server-
                // side; the visible toggle must not promise otherwise).
                // Switching category is the "More deal categories" nav
                // already on this page, not a pill here.
                <span className="shrink-0 whitespace-nowrap rounded-full border border-zinc-300 bg-zinc-50 px-3 py-1 text-xs font-medium text-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400">
                  {lockedCardType === "graded" ? "Graded cards only" : "Raw cards only"}
                </span>
              ) : (
                <>
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
                </>
              )}
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
              {/* ending windows - restrained amber only for the active one;
                  each is a real narrowing of live auctions by stored end
                  time (lib/dealFilters), never a countdown gimmick */}
              {showEnding &&
                ENDING_VALUES.map((v) => (
                  <FilterPill
                    key={v}
                    href={endingHref(params, v, basePath)}
                    active={listingType === "AUCTION" && ending === v}
                    aria-label={ENDING_LABELS[v]}
                  >
                    Ends ≤{v}
                  </FilterPill>
                ))}
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

          {searchable && <SearchWithinRow params={params} q={q} basePath={basePath} />}
        </div>
      </FilterToggle>
    </div>
  );
}
