import Image from "next/image";
import Link from "next/link";
import {
  fetchBestFinds,
  fetchAuctionsEndingSoon,
  fetchDealsPool,
  fetchDealsPage,
  fetchFreshFinds,
  fetchLastScanTime,
  fetchCardHubs,
  fetchHubCounts,
  fetchMarketDataSummary,
} from "@/lib/deals";
import { GUIDES } from "@/lib/guides";
import { timeAgo } from "@/lib/time";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import DealCard from "@/components/DealCard";
import FilterBar from "@/components/FilterBar";
import Pagination, { pageHref } from "@/components/Pagination";
import CardImagePlaceholder from "@/components/CardImagePlaceholder";

const SITE_URL = "https://pokemondealfinder.com";

export const revalidate = 60;

export async function generateMetadata({ searchParams }) {
  const params = await searchParams;
  const pageParam = typeof params.page === "string" ? Number(params.page) : 1;
  const page = Number.isInteger(pageParam) && pageParam > 1 ? pageParam : 1;
  const canonical = page > 1 ? `/?page=${page}` : "/";
  // Page 1 must omit `title` entirely so the root layout's default
  // applies - `title: undefined` makes Next 16 render no <title> at all.
  return page > 1
    ? { title: { absolute: `Pokémon Deal Finder - Page ${page}` }, alternates: { canonical } }
    : { alternates: { canonical } };
}

// Single source of truth for the FAQ section AND its FAQPage JSON-LD -
// Google requires the two to match.
const FAQ_ITEMS = [
  {
    question: "Is this free to use?",
    answer:
      "Yes, always. We earn a small commission if you buy through one of our links - it doesn't change the price you pay.",
  },
  {
    question: "How often do listings update?",
    answer:
      "New listings are discovered continuously - every 15 minutes in the US and every few hours in the other countries. Existing deals are reconfirmed on a rolling schedule so a sold or ended listing drops off shortly after.",
  },
  {
    question: "How do you know it's below market?",
    answer:
      "Each listing is compared to the card's real market price for its condition, backed by recent eBay sold listings - not a guess. The full method is on our methodology page.",
  },
  {
    question: "Is the card-to-listing match always right?",
    answer:
      "Matching is automated. We filter out obviously wrong matches, but always double-check a listing's photos and description before buying.",
  },
];

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

const START_HERE = [
  { href: "/?maxPrice=25", label: "Under $25" },
  { href: "/?maxPrice=50", label: "Under $50" },
  { href: "/?minPrice=100", label: "$100+" },
  { href: "/sealed-deals", label: "Sealed" },
  { href: "/?type=graded", label: "Graded" },
  { href: "/japanese-cards", label: "Japanese" },
];

export default async function Home({ searchParams }) {
  const params = await searchParams;
  const country = typeof params.country === "string" ? params.country : null;
  const cardType = typeof params.type === "string" ? params.type : null;
  const listingType = typeof params.listing === "string" ? params.listing : null;
  const sort = typeof params.sort === "string" ? params.sort : null;
  const maxPriceParam = typeof params.maxPrice === "string" ? Number(params.maxPrice) : null;
  const maxPrice = Number.isFinite(maxPriceParam) && maxPriceParam > 0 ? maxPriceParam : null;
  const minPriceParam = typeof params.minPrice === "string" ? Number(params.minPrice) : null;
  const minPrice = Number.isFinite(minPriceParam) && minPriceParam > 0 ? minPriceParam : null;

  const PAGE_SIZE = 24;
  const pageParam = typeof params.page === "string" ? Number(params.page) : 1;
  const page = Number.isInteger(pageParam) && pageParam > 1 ? pageParam : 1;

  // Promo sections only make sense on the default, unfiltered page-1 view.
  const anyFilter = Boolean(country || cardType || listingType || sort || maxPrice || minPrice);
  const showPromo = page === 1 && !anyFilter;

  const filters = { language: "english", country, cardType, listingType, maxPrice, minPrice };

  // Page 1, no sort -> the shuffled variety pool (rotates on repeat
  // visits). Any sort, or page 2+ -> deterministic, stable pagination.
  const useStableList = page > 1 || sort;

  const [
    { data: pool, error: poolError },
    dealsPageResult,
    { deals: bestFinds },
    { deals: endingSoon },
    { deals: freshFinds },
    lastRefreshed,
    cardHubsResult,
    hubCounts,
    summary,
  ] = await Promise.all([
    useStableList ? Promise.resolve({ data: null, error: null }) : fetchDealsPool(filters),
    useStableList ? fetchDealsPage({ table: "deals", ...filters, sort: sort ?? "newest", page }) : Promise.resolve(null),
    showPromo ? fetchBestFinds({ limit: 4 }) : Promise.resolve({ deals: [] }),
    showPromo ? fetchAuctionsEndingSoon({ limit: 6 }) : Promise.resolve({ deals: [] }),
    showPromo ? fetchFreshFinds({ limit: 6 }) : Promise.resolve({ deals: [] }),
    fetchLastScanTime({ table: "deals", language: "english" }),
    showPromo ? fetchCardHubs({ language: "english" }) : Promise.resolve({ hubs: [] }),
    fetchHubCounts({ language: "english" }),
    showPromo ? fetchMarketDataSummary() : Promise.resolve(null),
  ]);

  const error = poolError || dealsPageResult?.error;

  let deals;
  let totalPages = 1;
  if (useStableList) {
    deals = dealsPageResult?.deals ?? [];
    totalPages = dealsPageResult?.totalPages ?? 1;
  } else {
    const seen = new Set();
    const deduped = [];
    for (const d of pool ?? []) {
      if (seen.has(d.watchlist_id)) continue;
      seen.add(d.watchlist_id);
      deduped.push(d);
    }
    deals = shuffled(deduped.slice(0, 400)).slice(0, PAGE_SIZE);
  }

  const heroDeal = bestFinds[0] ?? null;
  const topHubs = cardHubsResult.hubs.slice(0, 6);
  const liveCount = summary?.activeDeals ?? null;

  const faqJsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: FAQ_ITEMS.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: { "@type": "Answer", text: item.answer },
    })),
  };
  const websiteJsonLd = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "Pokémon Deal Finder",
    url: SITE_URL,
    potentialAction: {
      "@type": "SearchAction",
      target: `${SITE_URL}/search?q={search_term_string}`,
      "query-input": "required name=search_term_string",
    },
  };
  const organizationJsonLd = { "@context": "https://schema.org", "@type": "Organization", name: "Pokémon Deal Finder", url: SITE_URL };

  return (
    <div className="flex min-h-screen flex-col bg-zinc-50 dark:bg-black">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }} />
      {showPromo && (
        <>
          <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteJsonLd) }} />
          <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationJsonLd) }} />
        </>
      )}
      <SiteHeader />

      {/* HERO - value prop + search on the left, one live "deal of the moment" on the right */}
      <header className="border-b border-zinc-200 dark:border-zinc-800">
        <div className="mx-auto grid max-w-7xl gap-8 px-6 py-8 lg:grid-cols-[1fr_320px] lg:py-10">
          <div>
            <h1 className="max-w-xl text-3xl font-bold tracking-tight text-black dark:text-zinc-50 sm:text-4xl">
              Pokémon cards below market price
            </h1>
            <p className="mt-3 max-w-lg text-base text-zinc-600 dark:text-zinc-400">
              Every eBay listing, checked against real sold prices. The junk filtered out. Free.
            </p>

            <form action="/search" className="mt-5 flex max-w-lg gap-2">
              <input
                type="text"
                name="q"
                placeholder="Search a card, a set, &quot;sealed&quot;…"
                className="flex-1 rounded-lg border border-zinc-300 bg-white px-4 py-3 text-base outline-none focus:border-red-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
              />
              <button
                type="submit"
                className="whitespace-nowrap rounded-lg bg-red-600 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-red-700"
              >
                Search
              </button>
            </form>

            {lastRefreshed && (
              <p className="mt-4 inline-flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-300">
                <span className="h-2 w-2 rounded-full bg-red-500" />
                {liveCount != null && <span className="font-semibold">{liveCount.toLocaleString()} live deals</span>}
                {liveCount != null && " · "}
                {isRecentlyRefreshed(lastRefreshed) ? `checked ${timeAgo(lastRefreshed)}` : "refreshing automatically"}
              </p>
            )}

            <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-zinc-500 dark:text-zinc-400">
              <span>✔ Checked against real eBay sold prices</span>
              <span>✔ Automated match, junk filtered out</span>
              <span>
                ✔{" "}
                <Link href="/methodology" className="hover:text-red-600 hover:underline dark:hover:text-red-500">
                  How we price this
                </Link>
              </span>
            </div>
          </div>

          {heroDeal && (
            <a
              href={`/deals/${heroDeal.id}`}
              className="hidden flex-col overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm transition-shadow hover:shadow-md lg:flex dark:border-zinc-800 dark:bg-zinc-950"
            >
              <div className="relative aspect-[4/3] w-full bg-zinc-50 dark:bg-zinc-900">
                {heroDeal.image_url ? (
                  <Image src={heroDeal.image_url} alt={heroDeal.title} fill sizes="320px" className="object-contain p-3" />
                ) : (
                  <CardImagePlaceholder />
                )}
                <span className="absolute right-2 top-2 rounded-md bg-emerald-600 px-2 py-1 text-sm font-extrabold text-white shadow-sm">
                  ▼ {Math.round(heroDeal.discount_pct * 100)}%
                </span>
              </div>
              <div className="p-4">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-400">Biggest discount right now</p>
                <p className="mt-1 line-clamp-1 font-semibold text-black dark:text-zinc-50">
                  {heroDeal.watchlist?.name ?? heroDeal.title}
                </p>
                <p className="mt-1 text-sm">
                  <span className="text-lg font-bold text-black dark:text-zinc-50">
                    ${Number(heroDeal.total_price).toFixed(2)}
                  </span>{" "}
                  <span className="text-xs text-zinc-400 line-through">
                    typical ${Number(heroDeal.market_price).toFixed(2)}
                  </span>
                </p>
                <span className="mt-3 inline-block rounded-md bg-black px-3 py-1.5 text-xs font-semibold text-white dark:bg-white dark:text-black">
                  See this deal →
                </span>
              </div>
            </a>
          )}
        </div>
      </header>

      {/* START HERE */}
      {showPromo && (
        <section className="border-b border-zinc-200 dark:border-zinc-800">
          <div className="mx-auto max-w-7xl px-6 py-6">
            <span className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Start here</span>
            <div className="mt-3 flex flex-wrap gap-2">
              {START_HERE.map((t) => (
                <Link
                  key={t.href}
                  href={t.href}
                  className="rounded-md border border-zinc-200 bg-white px-3.5 py-1.5 text-sm font-medium text-zinc-700 transition-colors hover:border-zinc-300 hover:text-red-600 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:text-red-500"
                >
                  {t.label}
                </Link>
              ))}
              <Link
                href="/sets"
                className="rounded-md border border-zinc-200 bg-white px-3.5 py-1.5 text-sm font-medium text-zinc-700 transition-colors hover:border-zinc-300 hover:text-red-600 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:text-red-500"
              >
                Browse by set →
              </Link>
              <Link
                href="/pokemon"
                className="rounded-md border border-zinc-200 bg-white px-3.5 py-1.5 text-sm font-medium text-zinc-700 transition-colors hover:border-zinc-300 hover:text-red-600 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:text-red-500"
              >
                Browse by Pokémon →
              </Link>
            </div>
          </div>
        </section>
      )}

      {/* BIGGEST DISCOUNTS */}
      {showPromo && bestFinds.length > 0 && (
        <section className="border-b border-zinc-200 dark:border-zinc-800">
          <div className="mx-auto max-w-7xl px-6 py-8">
            <div className="flex items-baseline justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-400">Biggest discounts right now</h2>
              <Link href="/best-finds" className="text-sm font-medium text-red-600 hover:underline dark:text-red-500">
                See Top 10 →
              </Link>
            </div>
            <div className="mt-4 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {bestFinds.map((deal, i) => (
                <DealCard key={deal.id} deal={deal} rank={i + 1} hub={hubCounts[deal.watchlist_id]} pageName="home_best" />
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ENDING SOON */}
      {showPromo && endingSoon.length > 0 && (
        <section className="border-b border-zinc-200 dark:border-zinc-800">
          <div className="mx-auto max-w-7xl px-6 py-8">
            <div className="flex items-baseline justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-400">⏰ Auctions ending soon</h2>
              <Link href="/?listing=AUCTION&sort=ending" className="text-sm font-medium text-red-600 hover:underline dark:text-red-500">
                See all →
              </Link>
            </div>
            <div className="mt-4 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
              {endingSoon.map((deal) => (
                <DealCard key={deal.id} deal={deal} hub={hubCounts[deal.watchlist_id]} pageName="home_ending" />
              ))}
            </div>
          </div>
        </section>
      )}

      {/* MOST SELLERS COMPETING */}
      {showPromo && topHubs.length > 0 && (
        <section className="border-b border-zinc-200 dark:border-zinc-800">
          <div className="mx-auto max-w-7xl px-6 py-8">
            <div className="flex items-baseline justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-400">
                Most sellers competing · cheapest wins
              </h2>
              <Link
                href="/market-data/most-listed-cards"
                className="text-sm font-medium text-red-600 hover:underline dark:text-red-500"
              >
                Compare all →
              </Link>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
              {topHubs.map((hub) => (
                <Link
                  key={hub.id}
                  href={`/cards/${hub.slug}`}
                  className="group flex flex-col overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-sm transition-shadow hover:shadow-md dark:border-zinc-800 dark:bg-zinc-950"
                >
                  <div className="relative aspect-square w-full bg-zinc-50 dark:bg-zinc-900">
                    {hub.image ? (
                      <Image
                        src={hub.image}
                        alt={`${hub.name} - ${hub.set}`}
                        fill
                        sizes="(max-width: 640px) 50vw, 16vw"
                        className="object-contain p-2 transition-transform duration-200 group-hover:scale-[1.03]"
                      />
                    ) : (
                      <CardImagePlaceholder />
                    )}
                    <span className="absolute right-1 top-1 rounded-md bg-black/80 px-1.5 py-0.5 text-[10px] font-bold text-white">
                      {hub.count} sellers
                    </span>
                  </div>
                  <div className="p-2.5">
                    <p className="line-clamp-1 text-xs font-semibold text-black dark:text-zinc-50">{hub.name}</p>
                    <p className="line-clamp-1 text-[11px] text-zinc-500">{hub.set}</p>
                    <p className="mt-1 text-xs font-bold text-black dark:text-zinc-50">
                      from ${hub.cheapestPrice.toFixed(2)}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* JUST ADDED */}
      {showPromo && freshFinds.length > 0 && (
        <section className="border-b border-zinc-200 dark:border-zinc-800">
          <div className="mx-auto max-w-7xl px-6 py-8">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-400">Just added</h2>
            <div className="mt-4 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
              {freshFinds.map((deal) => (
                <DealCard key={deal.id} deal={deal} hub={hubCounts[deal.watchlist_id]} pageName="home_fresh" />
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ALL DEALS grid + sort/filter toolbar */}
      <main className="mx-auto w-full max-w-7xl flex-1 px-6 py-10">
        <div className="mb-6 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-400">
            {anyFilter ? "Filtered deals" : "All deals"}
            {page > 1 ? ` · page ${page}` : ""}
          </h2>
          {(useStableList || page > 1) && (
            <Link href="/" className="text-sm font-medium text-zinc-500 hover:text-red-600 dark:hover:text-red-500">
              Clear
            </Link>
          )}
        </div>

        <FilterBar
          params={params}
          country={country}
          cardType={cardType}
          listingType={listingType}
          maxPrice={maxPrice}
          minPrice={minPrice}
          sort={sort}
        />

        {error && <p className="rounded-lg bg-red-50 p-4 text-red-700">Couldn&apos;t load deals: {error}</p>}

        {!error && deals?.length === 0 && (
          <p className="text-zinc-500">
            No deals match these filters right now. Try clearing a filter, or check back after the next scheduled scan.
          </p>
        )}

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {deals?.map((deal) => (
            <DealCard key={deal.id} deal={deal} hub={hubCounts[deal.watchlist_id]} />
          ))}
        </div>

        {!useStableList ? (
          deals?.length > 0 && (
            <div className="mt-10 flex justify-center">
              <a
                href={pageHref(params, 2, "/")}
                className="rounded-md border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-600 hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300"
              >
                Browse all deals →
              </a>
            </div>
          )
        ) : (
          <Pagination page={page} totalPages={totalPages} params={params} basePath="/" />
        )}
      </main>

      {/* HOW IT WORKS - moved up from the bottom */}
      <section id="how-it-works" className="border-t border-zinc-200 dark:border-zinc-800">
        <div className="mx-auto max-w-7xl px-6 py-12">
          <div className="flex items-baseline justify-between">
            <h2 className="text-lg font-bold text-black dark:text-zinc-50">How it works</h2>
            <Link href="/methodology" className="text-sm font-medium text-red-600 hover:underline dark:text-red-500">
              Full methodology →
            </Link>
          </div>
          <ol className="mt-5 grid gap-6 sm:grid-cols-3">
            <li>
              <p className="font-semibold text-black dark:text-zinc-50">1. We scan eBay</p>
              <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                Every watched card is checked against live eBay listings, around the clock.
              </p>
            </li>
            <li>
              <p className="font-semibold text-black dark:text-zinc-50">2. We check real pricing</p>
              <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                Each listing is compared against real market pricing and recent eBay sold listings - not guesses.
              </p>
            </li>
            <li>
              <p className="font-semibold text-black dark:text-zinc-50">3. We only show genuine deals</p>
              <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                A listing only makes the list if it&apos;s meaningfully below market and the seller passes our trust checks.
              </p>
            </li>
          </ol>
        </div>
      </section>

      {/* GUIDES */}
      <section className="border-t border-zinc-200 dark:border-zinc-800">
        <div className="mx-auto max-w-7xl px-6 py-12">
          <div className="flex items-baseline justify-between">
            <h2 className="text-lg font-bold text-black dark:text-zinc-50">Buying guides</h2>
            <Link href="/guides" className="text-sm font-medium text-red-600 hover:underline dark:text-red-500">
              All guides →
            </Link>
          </div>
          <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {GUIDES.map((g) => (
              <Link
                key={g.slug}
                href={`/guides/${g.slug}`}
                className="rounded-lg border border-zinc-200 bg-white p-4 text-sm font-semibold text-black transition-colors hover:border-zinc-300 hover:text-red-600 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-50 dark:hover:text-red-500"
              >
                {g.title}
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="border-t border-zinc-200 dark:border-zinc-800">
        <div className="mx-auto max-w-7xl px-6 py-12">
          <h2 className="text-lg font-bold text-black dark:text-zinc-50">FAQ</h2>
          <div className="mt-5 flex flex-col gap-5 sm:max-w-2xl">
            {FAQ_ITEMS.map((item) => (
              <div key={item.question}>
                <p className="font-semibold text-black dark:text-zinc-50">{item.question}</p>
                <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{item.answer}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <SiteFooter note="Card-to-listing matching is automated and not perfect - always double-check a listing's photos and description before buying." />
    </div>
  );
}
