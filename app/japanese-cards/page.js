import { fetchDealsPool, fetchDealsPage, fetchLastScanTime, fetchHubCounts } from "@/lib/deals";
import { timeAgo } from "@/lib/time";
import SiteHeader from "@/components/SiteHeader";
import RegionRedirect from "@/components/RegionRedirect";
import SiteFooter from "@/components/SiteFooter";
import DealCard from "@/components/DealCard";
import FilterBar from "@/components/FilterBar";
import Pagination, { pageHref } from "@/components/Pagination";

// Re-check for new deals at most once a minute - same as the homepage.
export const revalidate = 60;

// See app/page.js's identical generateMetadata for why paginated pages
// need their own canonical instead of all pointing back at the base URL.
export async function generateMetadata({ searchParams }) {
  const params = await searchParams;
  const pageParam = typeof params.page === "string" ? Number(params.page) : 1;
  const page = Number.isInteger(pageParam) && pageParam > 1 ? pageParam : 1;
  const title = page > 1 ? `Japanese Pokémon Cards - Page ${page}` : "Japanese Pokémon Cards";
  const description =
    "Real Japanese-print Pokémon card deals on eBay, priced against real Japanese-catalog market data - not converted from English pricing.";
  const canonical = page > 1 ? `/japanese-cards?page=${page}` : "/japanese-cards";

  // See app/sets/page.js's identical fix - was falling back to the root
  // layout's generic preview when shared.
  return {
    title,
    description,
    alternates: { canonical },
    openGraph: { title, description, url: `https://pokemondealfinder.com${canonical}` },
    twitter: { card: "summary", title, description },
  };
}

// Same reasoning as app/page.js's identical helpers - kept local rather
// than shared, since a scan-freshness/shuffle-window pair this small
// isn't worth a shared module, and each page tunes its own thresholds.
const SCAN_FRESH_THRESHOLD_MS = 30 * 60 * 1000;

function isRecentlyRefreshed(dateString) {
  return Date.now() - new Date(dateString).getTime() <= SCAN_FRESH_THRESHOLD_MS;
}

function shuffled(array) {
  const copy = [...array];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export default async function JapaneseCardsPage({ searchParams }) {
  const params = await searchParams;
  const country = typeof params.country === "string" ? params.country : null;
  const cardType = typeof params.type === "string" ? params.type : null;
  const listingType = typeof params.listing === "string" ? params.listing : null;
  const maxPriceParam = typeof params.maxPrice === "string" ? Number(params.maxPrice) : null;
  const maxPrice = Number.isFinite(maxPriceParam) && maxPriceParam > 0 ? maxPriceParam : null;
  const minPriceParam = typeof params.minPrice === "string" ? Number(params.minPrice) : null;
  const minPrice = Number.isFinite(minPriceParam) && minPriceParam > 0 ? minPriceParam : null;
  const sort = typeof params.sort === "string" ? params.sort : null;

  const PAGE_SIZE = 24;
  const pageParam = typeof params.page === "string" ? Number(params.page) : 1;
  const page = Number.isInteger(pageParam) && pageParam > 1 ? pageParam : 1;
  const filters = { language: "japanese", country, cardType, listingType, maxPrice, minPrice };
  const useStableList = page > 1 || sort;

  // Same pool-then-shuffle-on-page-1/real-pagination-beyond-that approach
  // as the homepage (see app/page.js for the full reasoning). Any sort
  // forces the deterministic list too.
  const [{ data: pool, error: poolError }, dealsPageResult, lastRefreshed, hubCounts] = await Promise.all([
    useStableList ? Promise.resolve({ data: null, error: null }) : fetchDealsPool(filters),
    useStableList ? fetchDealsPage({ table: "deals", ...filters, sort: sort ?? "newest", page }) : Promise.resolve(null),
    fetchLastScanTime({ table: "deals", language: "japanese" }),
    fetchHubCounts({ language: "japanese" }),
  ]);
  const error = poolError || dealsPageResult?.error;

  let deals;
  let totalPages = 1;
  if (useStableList) {
    deals = dealsPageResult?.deals ?? [];
    totalPages = dealsPageResult?.totalPages ?? 1;
  } else {
    const seenCards = new Set();
    const dedupedPool = [];
    for (const deal of pool ?? []) {
      if (seenCards.has(deal.watchlist_id)) continue;
      seenCards.add(deal.watchlist_id);
      dedupedPool.push(deal);
    }
    // See app/page.js's identical reasoning - 400 covers more than half
    // of the entire active Japanese catalog (~750), so this window keeps
    // giving real variety even through an extended eBay rate-limit
    // stall.
    const ROTATION_POOL_SIZE = 400;
    deals = shuffled(dedupedPool.slice(0, ROTATION_POOL_SIZE)).slice(0, PAGE_SIZE);
  }

  return (
    <div className="flex min-h-screen flex-col bg-paper">
      <SiteHeader />
      <RegionRedirect />

      <header className="border-b border-zinc-200 dark:border-zinc-800">
        <div className="mx-auto max-w-7xl px-6 py-10">
          <span className="inline-flex items-center gap-1.5 rounded-md bg-zinc-900 px-3 py-1 text-xs font-bold text-white dark:bg-white dark:text-black">
            🇯🇵 Japanese Prints
          </span>
          <h1 className="mt-3 max-w-2xl text-3xl font-bold tracking-tight text-black dark:text-zinc-50 sm:text-4xl">
            Japanese Pokémon Card Deals
          </h1>
          <p className="mt-3 max-w-xl text-base text-zinc-600 dark:text-zinc-400">
            Genuine Japanese-print listings on eBay, priced against real Japanese-catalog market data -
            a separate pricing world from the English cards on the rest of this site, never converted
            or estimated from them.
          </p>

          {lastRefreshed && (
            <p className="mt-4 inline-flex items-center gap-2 text-sm text-zinc-500">
              <span className="h-2 w-2 rounded-full bg-red-500" />
              {isRecentlyRefreshed(lastRefreshed)
                ? `Last refreshed ${timeAgo(lastRefreshed)}`
                : "Live - deals refresh automatically"}
            </p>
          )}

          <div className="mt-8 border-t border-zinc-200 pt-6 dark:border-zinc-800">
            <FilterBar
              params={params}
              country={country}
              cardType={cardType}
              listingType={listingType}
              maxPrice={maxPrice}
              minPrice={minPrice}
              sort={sort}
              basePath="/japanese-cards"
            />
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl flex-1 px-6 py-10">
        <h2 className="mb-5 text-sm font-semibold uppercase tracking-wide text-zinc-400">
          Japanese Card Deals{page > 1 ? ` - Page ${page}` : ""}
        </h2>

        {error && <p className="rounded-lg bg-red-50 p-4 text-red-700">Couldn&apos;t load deals: {error}</p>}

        {!error && deals?.length === 0 && (
          <p className="text-zinc-500">
            No Japanese-print deals match these filters right now. Try clearing a filter, or check back
            after the next scheduled scan.
          </p>
        )}

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {deals?.map((deal) => (
            <DealCard key={deal.id} deal={deal} hub={hubCounts[deal.watchlist_id]} pageName="japanese_cards" />
          ))}
        </div>

        {!useStableList ? (
          deals?.length > 0 && (
            <div className="mt-10 flex justify-center">
              <a
                href={pageHref(params, 2, "/japanese-cards")}
                className="rounded-md border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-600 hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300"
              >
                Browse more deals →
              </a>
            </div>
          )
        ) : (
          <Pagination page={page} totalPages={totalPages} params={params} basePath="/japanese-cards" />
        )}
      </main>

      <SiteFooter note="Card-to-listing matching is automated and not perfect - always double-check a listing's photos and description (and that it's genuinely the Japanese print) before buying." />
    </div>
  );
}
