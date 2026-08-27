import { fetchSealedDealsPool, fetchDealsPage, fetchLastScanTime } from "@/lib/deals";
import { dealScore } from "@/lib/dealScore";
import { timeAgo } from "@/lib/time";
import SiteHeader from "@/components/SiteHeader";
import SealedDealCard from "@/components/SealedDealCard";
import { CountryFilterRow, ListingTypeFilterRow, PriceFilterRow } from "@/components/FilterBar";
import FilterToggle from "@/components/FilterToggle";
import Pagination, { pageHref } from "@/components/Pagination";

export const revalidate = 60;

// See app/page.js's identical generateMetadata for why paginated pages
// need their own canonical instead of all pointing back at the base URL.
export async function generateMetadata({ searchParams }) {
  const params = await searchParams;
  const pageParam = typeof params.page === "string" ? Number(params.page) : 1;
  const page = Number.isInteger(pageParam) && pageParam > 1 ? pageParam : 1;
  return {
    title: page > 1 ? `Sealed Product Deals - Page ${page}` : "Sealed Product Deals",
    description:
      "Real below-market booster box, elite trainer box, and other sealed Pokémon product deals on eBay, priced against real PokemonPriceTracker market data.",
    alternates: { canonical: page > 1 ? `/sealed-deals?page=${page}` : "/sealed-deals" },
  };
}

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

export default async function SealedDealsPage({ searchParams }) {
  const params = await searchParams;
  const country = typeof params.country === "string" ? params.country : null;
  const listingType = typeof params.listing === "string" ? params.listing : null;
  const maxPriceParam = typeof params.maxPrice === "string" ? Number(params.maxPrice) : null;
  const maxPrice = Number.isFinite(maxPriceParam) && maxPriceParam > 0 ? maxPriceParam : null;
  const minPriceParam = typeof params.minPrice === "string" ? Number(params.minPrice) : null;
  const minPrice = Number.isFinite(minPriceParam) && minPriceParam > 0 ? minPriceParam : null;

  const PAGE_SIZE = 24;
  const pageParam = typeof params.page === "string" ? Number(params.page) : 1;
  const page = Number.isInteger(pageParam) && pageParam > 1 ? pageParam : 1;
  const filters = { country, listingType, maxPrice, minPrice };

  const [{ data: pool, error: poolError }, dealsPageResult, lastRefreshed] = await Promise.all([
    page === 1 ? fetchSealedDealsPool(filters) : Promise.resolve({ data: null, error: null }),
    page > 1 ? fetchDealsPage({ table: "sealed_deals", ...filters, page }) : Promise.resolve(null),
    fetchLastScanTime({ table: "sealed_deals" }),
  ]);
  const error = poolError || dealsPageResult?.error;

  let deals;
  let totalPages = 1;
  if (page > 1) {
    deals = dealsPageResult?.deals ?? [];
    totalPages = dealsPageResult?.totalPages ?? 1;
  } else {
    const seenProducts = new Set();
    const dedupedPool = [];
    for (const deal of pool ?? []) {
      if (seenProducts.has(deal.sealed_watchlist_id)) continue;
      seenProducts.add(deal.sealed_watchlist_id);
      dedupedPool.push(deal);
    }
    const ROTATION_POOL_SIZE = 100;
    deals = shuffled(dedupedPool.slice(0, ROTATION_POOL_SIZE)).slice(0, PAGE_SIZE);
  }

  return (
    <div className="flex min-h-screen flex-col bg-zinc-50 dark:bg-black">
      <SiteHeader />

      <header className="border-b border-zinc-200 dark:border-zinc-800">
        <div className="mx-auto max-w-7xl px-6 py-10">
          <span className="inline-flex items-center gap-1.5 rounded-md bg-zinc-900 px-3 py-1 text-xs font-bold text-white dark:bg-white dark:text-black">
            📦 Sealed Product
          </span>
          <h1 className="mt-3 max-w-2xl text-3xl font-bold tracking-tight text-black dark:text-zinc-50 sm:text-4xl">
            Sealed Product Deals
          </h1>
          <p className="mt-3 max-w-xl text-base text-zinc-600 dark:text-zinc-400">
            Booster boxes, elite trainer boxes, and other factory-sealed product genuinely below
            market price, checked against real PokemonPriceTracker pricing - not converted or
            estimated from singles.
          </p>

          {lastRefreshed && (
            <p className="mt-4 inline-flex items-center gap-2 text-sm text-zinc-500">
              <span className="h-2 w-2 rounded-full bg-red-500" />
              {isRecentlyRefreshed(lastRefreshed)
                ? `Last refreshed ${timeAgo(lastRefreshed)}`
                : "Checked once daily - deals refresh automatically"}
            </p>
          )}

          <div className="mt-8 border-t border-zinc-200 pt-6 dark:border-zinc-800">
            <FilterToggle
              defaultOpen={[country, listingType, maxPrice, minPrice].filter((v) => v != null).length > 0}
              activeCount={[country, listingType, maxPrice, minPrice].filter((v) => v != null).length}
            >
              <div className="flex flex-col gap-4">
                <CountryFilterRow params={params} country={country} basePath="/sealed-deals" />
                <ListingTypeFilterRow params={params} listingType={listingType} basePath="/sealed-deals" />
                <PriceFilterRow params={params} maxPrice={maxPrice} minPrice={minPrice} basePath="/sealed-deals" />
              </div>
            </FilterToggle>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl flex-1 px-6 py-10">
        <h2 className="mb-5 text-sm font-semibold uppercase tracking-wide text-zinc-400">
          Sealed Product Deals{page > 1 ? ` - Page ${page}` : ""}
        </h2>

        {error && <p className="rounded-lg bg-red-50 p-4 text-red-700">Couldn&apos;t load deals: {error}</p>}

        {!error && deals?.length === 0 && (
          <p className="text-zinc-500">
            No sealed product deals match these filters right now - this is a small, hand-picked
            watchlist (~30-50 products) checked once a day, so genuine deals show up less often than
            the full card catalog. Try clearing a filter, or check back tomorrow.
          </p>
        )}

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {deals?.map((deal) => (
            <SealedDealCard key={deal.id} deal={deal} scoreBadge={dealScore(deal.discount_pct)} />
          ))}
        </div>

        {page === 1 ? (
          deals?.length >= 24 && (
            <div className="mt-10 flex justify-center">
              <a
                href={pageHref(params, 2, "/sealed-deals")}
                className="rounded-md border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-600 hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300"
              >
                Browse more deals →
              </a>
            </div>
          )
        ) : (
          <Pagination page={page} totalPages={totalPages} params={params} basePath="/sealed-deals" />
        )}
      </main>

      <footer className="border-t border-zinc-200 px-6 py-8 text-center text-xs text-zinc-500 dark:border-zinc-800">
        As an eBay and TCGPlayer affiliate, we earn a commission on qualifying purchases made through
        links on this site. Prices and availability are subject to change and were accurate as of the
        listing&apos;s last scan. Listing-to-product matching is automated and not perfect - always
        double-check a listing&apos;s photos and description (and that it&apos;s genuinely factory
        sealed) before buying.
      </footer>
    </div>
  );
}
