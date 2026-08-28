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
import RegionRedirect from "@/components/RegionRedirect";
import SectionHeader from "@/components/SectionHeader";
import DealCard from "@/components/DealCard";
import FilterBar from "@/components/FilterBar";
import Pagination, { pageHref } from "@/components/Pagination";
import CardImagePlaceholder from "@/components/CardImagePlaceholder";
import CardMemoryStrip from "@/components/CardMemoryStrip";

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

  // Promo sections make sense on the default page-1 view. A `country`
  // filter alone is allowed to keep them - a region-set visitor still
  // gets the curated "Best deals right now / Just added / Ending soon"
  // homepage, just scoped to deals they can actually buy.
  const anyFilter = Boolean(country || cardType || listingType || sort || maxPrice || minPrice);
  const showPromo = page === 1 && !cardType && !listingType && !sort && !maxPrice && !minPrice;

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
    showPromo ? fetchBestFinds({ limit: 4, country }) : Promise.resolve({ deals: [] }),
    showPromo ? fetchAuctionsEndingSoon({ limit: 6, country }) : Promise.resolve({ deals: [] }),
    showPromo ? fetchFreshFinds({ limit: 6, country }) : Promise.resolve({ deals: [] }),
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
    <div className="flex min-h-screen flex-col bg-paper">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }} />
      {showPromo && (
        <>
          <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteJsonLd) }} />
          <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationJsonLd) }} />
        </>
      )}
      <SiteHeader />
      <RegionRedirect />

      {/* HERO - name the job, big search, entry chips, live proof */}
      <header className="border-b border-zinc-200 dark:border-zinc-800">
        <div className="mx-auto max-w-7xl px-6 py-10 lg:py-14">
          <h1 className="max-w-2xl text-4xl font-bold tracking-tight text-zinc-900 sm:text-5xl dark:text-zinc-50">
            Find underpriced Pokémon cards on eBay
          </h1>
          <p className="mt-3 max-w-xl text-base text-zinc-600 dark:text-zinc-400">
            Every listing checked against real sold prices. The junk filtered out. Free.
          </p>

          <form action="/search" className="mt-6 flex max-w-2xl gap-2">
            <div className="relative flex-1">
              <svg
                aria-hidden
                viewBox="0 0 20 20"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-zinc-400"
              >
                <circle cx="8.5" cy="8.5" r="5.5" />
                <line x1="16" y1="16" x2="12.5" y2="12.5" />
              </svg>
              <input
                type="text"
                name="q"
                placeholder="Search a card, a set, or &quot;booster box&quot;…"
                className="w-full rounded-xl border border-zinc-300 bg-white py-3.5 pl-11 pr-4 text-base text-zinc-900 shadow-card outline-none transition-colors focus:border-red-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
              />
            </div>
            <button
              type="submit"
              className="shrink-0 whitespace-nowrap rounded-xl bg-red-600 px-6 py-3.5 text-sm font-semibold text-white shadow-card transition-colors hover:bg-red-700"
            >
              Search
            </button>
          </form>

          <div className="mt-4 flex flex-wrap gap-2">
            {START_HERE.map((t) => (
              <Link
                key={t.href}
                href={t.href}
                className="rounded-full border border-zinc-200 bg-white px-3.5 py-1.5 text-[13px] font-medium text-zinc-700 transition-colors hover:border-red-300 hover:text-red-600 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:text-red-500"
              >
                {t.label}
              </Link>
            ))}
          </div>

          {lastRefreshed && (
            <p className="mt-5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-zinc-600 dark:text-zinc-300">
              <span className="inline-flex h-2 w-2 rounded-full bg-live" />
              {liveCount != null && (
                <span className="tnum font-semibold">{liveCount.toLocaleString()} live deals</span>
              )}
              {liveCount != null && <span className="text-zinc-300 dark:text-zinc-700">·</span>}
              <span>
                {isRecentlyRefreshed(lastRefreshed) ? `checked ${timeAgo(lastRefreshed)}` : "refreshing automatically"}
              </span>
              <span className="text-zinc-300 dark:text-zinc-700">·</span>
              <Link href="/methodology" className="hover:text-red-600 hover:underline dark:hover:text-red-500">
                how we price this →
              </Link>
            </p>
          )}
        </div>
      </header>

      {/* The viewer's own locally-saved / recently-viewed cards. Renders
          nothing for first-time visitors and on the server. */}
      {showPromo && <CardMemoryStrip />}

      {/* BEST DEALS RIGHT NOW - the proof, first thing after the hero */}
      {showPromo && bestFinds.length > 0 && (
        <section className="border-b border-zinc-200 dark:border-zinc-800">
          <div className="mx-auto max-w-7xl px-6 py-10">
            <SectionHeader
              kicker="The find"
              title="Best deals right now"
              actionLabel="See top 10"
              actionHref="/best-finds"
            />
            <div className="mt-5 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {bestFinds.map((deal, i) => (
                <DealCard key={deal.id} deal={deal} rank={i + 1} hub={hubCounts[deal.watchlist_id]} pageName="home_best" />
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Slim trust strip - keeps the disclosure near the deals, not only
          buried in the footer. */}
      {showPromo && (
        <div className="border-b border-zinc-200 bg-sunk dark:border-zinc-800">
          <p className="mx-auto max-w-7xl px-6 py-2.5 text-center text-xs text-zinc-500 dark:text-zinc-400">
            Every price checked against real eBay sold listings · updated continuously · we may earn a
            commission on purchases, at no cost to you
          </p>
        </div>
      )}

      {/* ENDING SOON */}
      {showPromo && endingSoon.length > 0 && (
        <section className="border-b border-zinc-200 bg-sunk dark:border-zinc-800">
          <div className="mx-auto max-w-7xl px-6 py-10">
            <SectionHeader
              kicker="Real urgency"
              title="Auctions ending soon"
              actionLabel="See all"
              actionHref="/?listing=AUCTION&sort=ending"
            />
            <div className="mt-5 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
              {endingSoon.map((deal) => (
                <DealCard key={deal.id} deal={deal} hub={hubCounts[deal.watchlist_id]} pageName="home_ending" />
              ))}
            </div>
          </div>
        </section>
      )}

      {/* JUST ADDED */}
      {showPromo && freshFinds.length > 0 && (
        <section className="border-b border-zinc-200 dark:border-zinc-800">
          <div className="mx-auto max-w-7xl px-6 py-10">
            <SectionHeader
              kicker="Fresh"
              title="Just added"
              actionLabel="Browse newest"
              actionHref="/?sort=newest"
            />
            <div className="mt-5 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
              {freshFinds.map((deal) => (
                <DealCard key={deal.id} deal={deal} hub={hubCounts[deal.watchlist_id]} pageName="home_fresh" />
              ))}
            </div>
          </div>
        </section>
      )}

      {/* MOST SELLERS COMPETING */}
      {showPromo && topHubs.length > 0 && (
        <section className="border-b border-zinc-200 bg-sunk dark:border-zinc-800">
          <div className="mx-auto max-w-7xl px-6 py-10">
            <SectionHeader
              kicker="Compare prices"
              title="Most sellers competing"
              actionLabel="Compare all"
              actionHref="/market-data/most-listed-cards"
            />
            <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
              {topHubs.map((hub) => (
                <Link
                  key={hub.id}
                  href={`/cards/${hub.slug}`}
                  className="group flex flex-col overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-card transition-all duration-200 hover:-translate-y-0.5 hover:shadow-card-hover dark:border-zinc-800 dark:bg-zinc-950"
                >
                  <div className="relative aspect-square w-full bg-gradient-to-b from-zinc-50 to-zinc-100 dark:from-zinc-900 dark:to-zinc-950">
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
                    <span className="absolute right-1.5 top-1.5 rounded-md bg-zinc-900/85 px-1.5 py-0.5 text-[10px] font-bold text-white">
                      {hub.count} sellers
                    </span>
                  </div>
                  <div className="p-2.5">
                    <p className="line-clamp-1 text-xs font-semibold text-zinc-900 dark:text-zinc-50">{hub.name}</p>
                    <p className="line-clamp-1 text-[11px] text-zinc-500">{hub.set}</p>
                    <p className="tnum mt-1 text-xs font-bold text-zinc-900 dark:text-zinc-50">
                      from ${hub.cheapestPrice.toFixed(2)}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* BROWSE - two big category entry tiles */}
      {showPromo && (
        <section className="border-b border-zinc-200 dark:border-zinc-800">
          <div className="mx-auto max-w-7xl px-6 py-10">
            <SectionHeader kicker="Know what you want" title="Browse the catalogue" />
            <div className="mt-5 grid gap-5 sm:grid-cols-2">
              {[
                { href: "/sets", title: "Browse by set", copy: "Every set with an active below-market deal, one set at a time." },
                { href: "/pokemon", title: "Browse by Pokémon", copy: "Every deal for a species, across all its prints and sets." },
              ].map((t) => (
                <Link
                  key={t.href}
                  href={t.href}
                  className="group flex items-center justify-between gap-4 rounded-xl border border-zinc-200 bg-white p-6 shadow-card transition-all duration-200 hover:-translate-y-0.5 hover:shadow-card-hover dark:border-zinc-800 dark:bg-zinc-950"
                >
                  <div>
                    <p className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">{t.title}</p>
                    <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">{t.copy}</p>
                  </div>
                  <span className="text-xl text-zinc-300 transition-colors group-hover:text-red-600 dark:text-zinc-600">
                    →
                  </span>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ALL DEALS grid + sort/filter toolbar */}
      <main className="mx-auto w-full max-w-7xl flex-1 px-6 py-12">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-2">
          <SectionHeader
            kicker={anyFilter ? "Filtered" : "Everything"}
            title={anyFilter ? "Filtered deals" : "All deals"}
          />
          {(useStableList || page > 1) && (
            <Link href="/" className="text-sm font-medium text-zinc-500 hover:text-red-600 dark:hover:text-red-500">
              Clear filters
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
                className="rounded-full border border-zinc-200 bg-white px-5 py-2 text-sm font-medium text-zinc-600 transition-colors hover:border-red-300 hover:text-red-600 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300"
              >
                Browse all deals →
              </a>
            </div>
          )
        ) : (
          <Pagination page={page} totalPages={totalPages} params={params} basePath="/" />
        )}
      </main>

      {/* HOW IT WORKS + FAQ - two balanced columns on the tinted ground */}
      <section id="how-it-works" className="border-t border-zinc-200 bg-sunk dark:border-zinc-800">
        <div className="mx-auto grid max-w-7xl gap-12 px-6 py-14 lg:grid-cols-2">
          <div>
            <SectionHeader
              kicker="No guesswork"
              title="How it works"
              actionLabel="Full methodology"
              actionHref="/methodology"
            />
            <ol className="mt-5 flex flex-col gap-5">
              <li>
                <p className="font-semibold text-zinc-900 dark:text-zinc-50">1. We scan eBay around the clock</p>
                <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                  Every watched card is checked against live eBay listings, continuously.
                </p>
              </li>
              <li>
                <p className="font-semibold text-zinc-900 dark:text-zinc-50">2. We check real pricing</p>
                <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                  Each listing is compared against the card&apos;s real market price for its condition, backed by
                  recent eBay sold listings - not guesses.
                </p>
              </li>
              <li>
                <p className="font-semibold text-zinc-900 dark:text-zinc-50">3. We only show genuine deals</p>
                <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                  A listing only makes the list if it&apos;s meaningfully below market and the seller passes our
                  trust checks.
                </p>
              </li>
            </ol>
          </div>

          <div id="faq">
            <SectionHeader kicker="Good to know" title="FAQ" />
            <div className="mt-5 grid gap-5 sm:grid-cols-2">
              {FAQ_ITEMS.map((item) => (
                <div key={item.question}>
                  <p className="font-semibold text-zinc-900 dark:text-zinc-50">{item.question}</p>
                  <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{item.answer}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* GUIDES */}
      <section className="border-t border-zinc-200 dark:border-zinc-800">
        <div className="mx-auto max-w-7xl px-6 py-14">
          <SectionHeader kicker="Learn the market" title="Buying guides" actionLabel="All guides" actionHref="/guides" />
          <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {GUIDES.map((g) => (
              <Link
                key={g.slug}
                href={`/guides/${g.slug}`}
                className="rounded-xl border border-zinc-200 bg-white p-5 text-sm font-semibold text-zinc-900 shadow-card transition-all duration-200 hover:-translate-y-0.5 hover:text-red-600 hover:shadow-card-hover dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-50 dark:hover:text-red-500"
              >
                {g.title}
              </Link>
            ))}
          </div>
        </div>
      </section>

      <SiteFooter note="Card-to-listing matching is automated and not perfect - always double-check a listing's photos and description before buying." />
    </div>
  );
}
