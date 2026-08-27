import { supabase } from "@/lib/supabaseClient";
import { dealScore } from "@/lib/dealScore";
import { timeAgo } from "@/lib/time";
import SiteHeader from "@/components/SiteHeader";
import DealCard from "@/components/DealCard";
import FilterBar from "@/components/FilterBar";

// Re-check for new deals at most once a minute - same as the homepage.
export const revalidate = 60;

export const metadata = {
  title: "Japanese Pokémon Cards",
  description:
    "Real Japanese-print Pokémon card deals on eBay, priced against real Japanese-catalog market data - not converted from English pricing.",
  alternates: { canonical: "/japanese-cards" },
};

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

  const PAGE_SIZE = 24;

  // Same pool-then-shuffle approach as the homepage (see app/page.js) -
  // shows real variety across visits instead of a frozen top-N, without
  // ever fabricating a listing.
  let query = supabase
    .from("deals")
    .select("*, watchlist:watchlist_id!inner (name, set, justtcg_tcgplayer_id, language)")
    .eq("is_active", true)
    .eq("watchlist.language", "japanese")
    .order("first_seen_at", { ascending: false })
    .limit(500);

  if (country) query = query.eq("marketplace", country);
  if (cardType === "raw") query = query.eq("is_graded", false);
  if (cardType === "graded") query = query.eq("is_graded", true);
  if (listingType) query = query.eq("listing_type", listingType);
  if (maxPrice) query = query.lte("total_price", maxPrice);
  if (minPrice) query = query.gte("total_price", minPrice);

  const { data: pool, error } = await query;

  const seenCards = new Set();
  const dedupedPool = [];
  for (const deal of pool ?? []) {
    if (seenCards.has(deal.watchlist_id)) continue;
    seenCards.add(deal.watchlist_id);
    dedupedPool.push(deal);
  }

  const ROTATION_POOL_SIZE = 100;
  const deals = shuffled(dedupedPool.slice(0, ROTATION_POOL_SIZE)).slice(0, PAGE_SIZE);

  const { data: lastScan } = await supabase
    .from("deals")
    .select("last_seen_at, watchlist:watchlist_id!inner(language)")
    .eq("watchlist.language", "japanese")
    .order("last_seen_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const lastRefreshed = lastScan?.last_seen_at ?? null;

  return (
    <div className="flex min-h-screen flex-col bg-zinc-50 dark:bg-black">
      <SiteHeader />

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
              basePath="/japanese-cards"
            />
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl flex-1 px-6 py-10">
        <h2 className="mb-5 text-sm font-semibold uppercase tracking-wide text-zinc-400">
          Japanese Card Deals
        </h2>

        {error && (
          <p className="rounded-lg bg-red-50 p-4 text-red-700">
            Couldn&apos;t load deals: {error.message}
          </p>
        )}

        {!error && deals?.length === 0 && (
          <p className="text-zinc-500">
            No Japanese-print deals match these filters right now. Try clearing a filter, or check back
            after the next scheduled scan.
          </p>
        )}

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {deals?.map((deal) => (
            <DealCard key={deal.id} deal={deal} scoreBadge={dealScore(deal.discount_pct)} pageName="japanese_cards" />
          ))}
        </div>
      </main>

      <footer className="border-t border-zinc-200 px-6 py-8 text-center text-xs text-zinc-500 dark:border-zinc-800">
        As an eBay and TCGPlayer affiliate, we earn a commission on qualifying purchases made through
        links on this site. Prices and availability are subject to change and were accurate as of the
        listing&apos;s last scan. Card-to-listing matching is automated and not perfect - always
        double-check a listing&apos;s photos and description (and that it&apos;s genuinely the Japanese
        print) before buying.
      </footer>
    </div>
  );
}
