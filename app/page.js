import Image from "next/image";
import Link from "next/link";
import {
  fetchHomepageFlagshipDeals,
  fetchAuctionsEndingSoon,
  fetchDealsPool,
  fetchDealsPage,
  fetchFreshFinds,
  fetchLastScanTime,
  fetchCardHubs,
  fetchHubCounts,
  fetchMarketDataSummary,
  fetchSetSlugs,
} from "@/lib/deals";
import { GUIDES } from "@/lib/guides";
import { timeAgo } from "@/lib/time";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import RegionRedirect from "@/components/RegionRedirect";
import Price from "@/components/Price";
import HeroSearch from "@/components/HeroSearch";
import MobileStickySearch from "@/components/MobileStickySearch";
import NewSinceVisit from "@/components/NewSinceVisit";
import SectionHeader from "@/components/SectionHeader";
import DealCard from "@/components/DealCard";
import HomeBrowseLinks from "@/components/HomeBrowseLinks";
import FilterBar from "@/components/FilterBar";
import Pagination, { pageHref } from "@/components/Pagination";
import CardImagePlaceholder from "@/components/CardImagePlaceholder";
import CardMemoryStrip from "@/components/CardMemoryStrip";
import HomepageAnalytics from "@/components/analytics/HomepageAnalytics";

const SITE_URL = "https://pokemondealfinder.com";

export const revalidate = 60;

export async function generateMetadata({ searchParams }) {
  const params = await searchParams;
  const pageParam = typeof params.page === "string" ? Number(params.page) : 1;
  const page = Number.isInteger(pageParam) && pageParam > 1 ? pageParam : 1;
  const canonical = page > 1 ? `/?page=${page}` : "/";
  if (page > 1) {
    return { title: { absolute: `Pokemon Deal Finder - Page ${page}` }, alternates: { canonical } };
  }
  // Page 1: a real head-term title + description rather than the root
  // layout's bare "Pokemon Deal Finder" brand default. Leads with the
  // phrase the homepage is the primary candidate for, keeps the
  // below-market value framing, no stuffing. `absolute` bypasses the
  // "%s | Pokemon Deal Finder" template (the brand is already inside).
  return {
    title: {
      absolute: "Pokemon Card Deals — Cards Priced Below Market on eBay | Pokemon Deal Finder",
    },
    description:
      "Live Pokemon card deals updated continuously: every eBay listing priced below its real market value, checked against recent sold data. Covers the US, UK, Australia, Canada, Germany and Italy.",
    alternates: { canonical },
  };
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

// The under-$X / graded chips point at the dedicated /deals/<category>/
// landing routes now that those exist (same live results, a real
// crawlable page + descriptive anchor text) rather than the
// renderer-nofollowed `/?maxPrice=` filter URLs. $100+ has no dedicated
// route - it stays a plain filter link.
const START_HERE = [
  { href: "/deals/under-25", label: "Under $25", chip: "under_25" },
  { href: "/deals/under-50", label: "Under $50", chip: "under_50" },
  { href: "/?minPrice=100", label: "$100+", chip: "over_100" },
  { href: "/sealed-deals", label: "Sealed", chip: "sealed" },
  { href: "/deals/graded", label: "Graded", chip: "graded", graded: true },
  { href: "/japanese-cards", label: "Japanese", chip: "japanese" },
];

// 13C.1 - concrete example queries under the hero search. These teach the
// search grammar (species, collector number, set + Pokemon, graded
// intent) by example rather than with instructional prose, and each is a
// real /search deep link.
const SEARCH_EXAMPLES = [
  "PSA 10 Pikachu",
  "Charizard 4/102",
  "Evolving Skies Umbreon",
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

  // 13C.3 - the homepage's unfiltered page-1 grid is a PREVIEW of the
  // broader deal pool, not the full browser: 9 cards then a "Browse all
  // deals" link into the paginated list. Filtered / sorted / page-2+
  // views (useStableList) keep the full LIST_PAGE_SIZE from fetchDealsPage.
  const HOME_PREVIEW_SIZE = 9;
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
    { deals: flagshipDeals },
    { deals: endingSoon },
    { deals: freshFinds },
    lastRefreshed,
    cardHubsResult,
    hubCounts,
    summary,
    validSetSlugs,
  ] = await Promise.all([
    useStableList ? Promise.resolve({ data: null, error: null }) : fetchDealsPool(filters),
    useStableList ? fetchDealsPage({ table: "deals", ...filters, sort: sort ?? "newest", page }) : Promise.resolve(null),
    showPromo ? fetchHomepageFlagshipDeals({ limit: 4, country }) : Promise.resolve({ deals: [] }),
    showPromo ? fetchAuctionsEndingSoon({ limit: 3, country }) : Promise.resolve({ deals: [] }),
    showPromo ? fetchFreshFinds({ limit: 3, country }) : Promise.resolve({ deals: [] }),
    fetchLastScanTime({ table: "deals", language: "english" }),
    showPromo ? fetchCardHubs({ language: "english" }) : Promise.resolve({ hubs: [] }),
    fetchHubCounts({ language: "english" }),
    showPromo ? fetchMarketDataSummary() : Promise.resolve(null),
    fetchSetSlugs("english"),
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
    deals = shuffled(deduped.slice(0, 400)).slice(0, HOME_PREVIEW_SIZE);
  }

  const topHubs = cardHubsResult.hubs.slice(0, 6);
  const popularSearches = cardHubsResult.hubs.slice(0, 5).map((h) => ({ name: h.name, slug: h.slug }));
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

  // The site-wide Organization + WebSite entities live in the root layout
  // (app/layout.js) and carry stable @ids. The homepage adds only a
  // CollectionPage that names the same WebSite and, crucially, exposes the
  // real data-freshness timestamp - the SAME `lastRefreshed` value the
  // visible "checked X ago" line below uses (MAX(deals.last_seen_at) via
  // fetchLastScanTime). Not new Date(), not a hardcoded date. Only on the
  // canonical promo view; filtered / page-2+ views canonicalise to "/".
  const homeCollectionJsonLd = showPromo
    ? {
        "@context": "https://schema.org",
        "@type": "CollectionPage",
        name: "Pokemon Deal Finder - below-market Pokemon card listings",
        description:
          liveCount != null
            ? `Approximately ${liveCount.toLocaleString()} active below-market Pokemon card listings from eBay's US, UK, Australia, Canada, Germany and Italy marketplaces, each compared against real market prices and recent sold-listing data.`
            : "Active below-market Pokemon card listings from eBay's US, UK, Australia, Canada, Germany and Italy marketplaces, each compared against real market prices and recent sold-listing data.",
        url: `${SITE_URL}/`,
        isPartOf: { "@id": `${SITE_URL}/#website` },
        ...(lastRefreshed ? { dateModified: new Date(lastRefreshed).toISOString() } : {}),
      }
    : null;

  return (
    <div className="flex min-h-screen flex-col bg-paper">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }} />
      {homeCollectionJsonLd && (
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(homeCollectionJsonLd) }} />
      )}
      <SiteHeader />
      <MobileStickySearch />
      <RegionRedirect />
      <HomepageAnalytics
        variant={showPromo ? "promo" : page > 1 ? "paged" : "filtered"}
        page={page}
        hasFilters={anyFilter}
      />

      {/* HERO - name the job, big search, entry chips, live proof */}
      <header className="border-b border-zinc-200 dark:border-zinc-800">
        <div className="mx-auto max-w-7xl px-6 py-8 lg:py-12">
          <h1 className="max-w-2xl text-3xl font-bold tracking-tight text-zinc-900 sm:text-5xl dark:text-zinc-50">
            Pokemon Card Deals — Underpriced Cards on eBay
          </h1>
          <p className="mt-3 max-w-xl text-base text-zinc-600 dark:text-zinc-400">
            Every listing checked against real sold prices. The junk filtered out. Free.
          </p>

          {/* 13C.1 - the two homepage jobs, side by side and immediate:
              SEARCH a specific card (the big box below) or DISCOVER what
              we've already found (the button). The longer "what is this"
              explanation now lives lower on the page, near How it works,
              so it never gates the first action. */}
          <div className="mt-6">
            <HeroSearch popular={popularSearches} />
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
            <a
              href="#best-deals"
              data-analytics-click="discover_deals_clicked"
              data-analytics-props={JSON.stringify({ section: "hero" })}
              className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
            >
              Browse today&apos;s deals
              <span aria-hidden="true">↓</span>
            </a>
            <p className="text-[13px] text-zinc-500 dark:text-zinc-400">
              or try a search:{" "}
              {SEARCH_EXAMPLES.map((q, i) => (
                <span key={q}>
                  <Link
                    href={`/search?q=${encodeURIComponent(q)}`}
                    data-analytics-click="hero_example_clicked"
                    data-analytics-props={JSON.stringify({ section: "hero", rank: i + 1 })}
                    className="font-medium text-zinc-600 underline-offset-2 hover:text-red-600 hover:underline dark:text-zinc-300 dark:hover:text-red-500"
                  >
                    {q}
                  </Link>
                  {i < SEARCH_EXAMPLES.length - 1 && (
                    <span className="mx-1.5 text-zinc-300 dark:text-zinc-700">·</span>
                  )}
                </span>
              ))}
            </p>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {START_HERE.map((t) => (
              <Link
                key={t.href}
                href={t.href}
                rel={t.href.includes("?") ? "nofollow" : undefined}
                data-analytics-click="start_here_clicked"
                data-analytics-props={JSON.stringify({ section: "hero", chip: t.chip, ...(t.graded ? { graded_entry: true, source: "start_here" } : {}) })}
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

      {/* BEST DEALS RIGHT NOW - the proof, first thing after the hero.
          13C.1 - `id`/`scroll-mt` so the hero "Browse today's deals ↓"
          jump lands with the heading clear of the sticky header. */}
      {showPromo && flagshipDeals.length > 0 && (
        <section id="best-deals" data-analytics-section="best_deals" className="scroll-mt-24 border-b border-zinc-200 dark:border-zinc-800">
          <div className="mx-auto max-w-7xl px-6 py-10">
            {/* 13C.2 - flagship lane is Buy It Now only (auctions have
                their own lane below); the kicker states that plainly. */}
            <SectionHeader
              kicker="Buy it now · below market"
              title="Best deals right now"
              actionLabel="See top 10"
              actionHref="/best-finds"
            />
            <div className="mt-5 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {flagshipDeals.map((deal, i) => (
                <DealCard key={deal.id} deal={deal} rank={i + 1} hub={hubCounts[deal.watchlist_id]} pageName="home_best" validSetSlugs={validSetSlugs} analytics={{ section: "best_deals", rank: i + 1 }} />
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

      {/* The viewer's own locally-saved / recently-viewed cards. Renders
          nothing for first-time visitors and on the server. 13C.1 - moved
          below the first deal lane so a returning visitor's private strip
          never sits between a new visitor and the first real deal. */}
      {showPromo && <CardMemoryStrip />}

      {/* ENDING SOON */}
      {showPromo && endingSoon.length > 0 && (
        <section data-analytics-section="ending_soon" className="border-b border-zinc-200 bg-sunk dark:border-zinc-800">
          <div className="mx-auto max-w-7xl px-6 py-10">
            <SectionHeader
              kicker="Real urgency"
              title="Auctions ending soon"
              actionLabel="See all auctions"
              actionHref="/?listing=AUCTION&sort=ending"
            />
            <div className="mt-5 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {endingSoon.map((deal, i) => (
                <DealCard key={deal.id} deal={deal} hub={hubCounts[deal.watchlist_id]} pageName="home_ending" validSetSlugs={validSetSlugs} analytics={{ section: "ending_soon", rank: i + 1 }} />
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ALL DEALS grid + sort/filter toolbar. 13C.3 - moved up to right
          after Best Deals + Auctions so the main filterable browse is not
          buried behind catalogue sections; the unfiltered page-1 grid is
          a 9-card PREVIEW into the paginated list, not 24 cards. */}
      <main data-analytics-section="all_deals" className="mx-auto w-full max-w-7xl flex-1 px-6 py-12">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-2">
          <SectionHeader
            kicker={anyFilter ? "Filtered" : "Everything"}
            title={anyFilter ? "Filtered deals" : "All deals"}
          />
          {(useStableList || page > 1) && (
            <Link
              href="/"
              data-analytics-click="filter_cleared"
              data-analytics-props={JSON.stringify({ facet: "all", context: "all_deals" })}
              className="text-sm font-medium text-zinc-500 hover:text-red-600 dark:hover:text-red-500"
            >
              Clear filters
            </Link>
          )}
        </div>

        <div data-analytics-filter-bar="all_deals">
          <FilterBar
            params={params}
            country={country}
            cardType={cardType}
            listingType={listingType}
            maxPrice={maxPrice}
            minPrice={minPrice}
            sort={sort}
          />
        </div>

        {error && <p className="rounded-lg bg-red-50 p-4 text-red-700">Couldn&apos;t load deals: {error}</p>}

        {!error && deals?.length === 0 && (
          <p className="text-zinc-500">
            No deals match these filters right now. Try clearing a filter, or check back after the next scheduled scan.
          </p>
        )}

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {deals?.map((deal) => (
            // 13C.5 - `home_all_deals` so an affiliate_click from this grid
            // is attributable to the homepage All Deals lane, not the
            // bare "home" catch-all shared with /cards, /sets, /deals grids.
            <DealCard key={deal.id} deal={deal} hub={hubCounts[deal.watchlist_id]} validSetSlugs={validSetSlugs} pageName="home_all_deals" />
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

      {/* JUST ADDED - 13C.3: a compact 3-card freshness preview, moved
          below All Deals (it is a "what's new" footnote to browsing, not
          a headline lane). "N new since your last visit" is a
          returning-visitor hook; "Browse newest" uses the existing
          ?sort=newest, no new route. */}
      {showPromo && freshFinds.length > 0 && (
        <section data-analytics-section="just_added" className="border-b border-zinc-200 bg-sunk dark:border-zinc-800">
          <div className="mx-auto max-w-7xl px-6 py-10">
            <SectionHeader
              kicker="Fresh"
              title="Just added"
              actionLabel="Browse newest"
              actionHref="/?sort=newest"
            />
            <div className="mt-2">
              <NewSinceVisit timestamps={freshFinds.map((d) => d.first_seen_at)} />
            </div>
            <div className="mt-4 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {freshFinds.map((deal, i) => (
                <DealCard key={deal.id} deal={deal} hub={hubCounts[deal.watchlist_id]} pageName="home_fresh" validSetSlugs={validSetSlugs} analytics={{ section: "just_added", rank: i + 1 }} />
              ))}
            </div>
          </div>
        </section>
      )}

      {/* EXPLORE POKEMON CARDS - 13C.3: one catalogue/discovery surface
          that merges the old "Cards with the most active listings" and
          "Browse the catalogue" lanes (adjacent sections doing
          overlapping jobs). Every internal link and click event from both
          is preserved; only the standalone section + its impression event
          (`most_active`) is folded into `browse`. */}
      {showPromo && (
        <section data-analytics-section="browse" className="border-b border-zinc-200 dark:border-zinc-800">
          <div className="mx-auto max-w-7xl px-6 py-10">
            <SectionHeader kicker="Know what you want" title="Explore Pokemon cards" />

            <div className="mt-5 grid gap-5 sm:grid-cols-3">
              {[
                { href: "/cards", event: "browse_catalogue_clicked", title: "Card database", copy: "Every card we track, with a permanent page and real market-reference prices." },
                { href: "/sets", event: "browse_sets_clicked", title: "Browse by set", copy: "Set checklists with market-reference prices and the set's most valuable cards — plus any current below-market deals." },
                { href: "/pokemon", event: "browse_pokemon_clicked", title: "Browse by Pokemon", copy: "Card prices and values for a species across all its prints and sets — plus any current below-market deals." },
              ].map((t) => (
                <Link
                  key={t.href}
                  href={t.href}
                  data-analytics-click={t.event}
                  data-analytics-props={JSON.stringify({ section: "browse" })}
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

            {topHubs.length > 0 && (
              <div className="mt-8">
                <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
                  <h3 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-400">
                    Cards with the most active listings
                  </h3>
                  <Link
                    href="/market-data/most-listed-cards"
                    className="rounded-full border border-zinc-200 px-3 py-1 text-xs font-medium text-zinc-600 transition-colors hover:border-red-300 hover:text-red-600 dark:border-zinc-800 dark:text-zinc-300 dark:hover:border-red-800 dark:hover:text-red-500"
                  >
                    Compare all →
                  </Link>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
                  {topHubs.map((hub, i) => (
                    <Link
                      key={hub.id}
                      href={`/cards/${hub.slug}`}
                      data-analytics-click="most_active_clicked"
                      data-analytics-props={JSON.stringify({ section: "most_active", card_slug: hub.slug, content_id: hub.slug, rank: i + 1 })}
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
                          {hub.count} {hub.count === 1 ? "listing" : "listings"}
                        </span>
                      </div>
                      <div className="p-2.5">
                        <p className="line-clamp-1 text-xs font-semibold text-zinc-900 dark:text-zinc-50">{hub.name}</p>
                        <p className="line-clamp-1 text-[11px] text-zinc-500">{hub.set}</p>
                        <p className="tnum mt-1 text-xs font-bold text-zinc-900 dark:text-zinc-50">
                          from{" "}
                          <Price
                            usd={hub.cheapestPrice}
                            native={{ amount: hub.cheapestPrice, currency: "USD" }}
                          />
                        </p>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            )}

            <HomeBrowseLinks />
          </div>
        </section>
      )}

      {/* Plain-language summary for text-only crawlers: what the tool does
          and which marketplaces it covers. 13C.1 - moved here from the
          hero so it no longer sits between the visitor and the first
          action; still server-rendered and visible, and it reads
          naturally as the lead-in to "How it works". Facts match
          /how-it-works and /methodology exactly. */}
      {showPromo && (
        <section className="border-t border-zinc-200 dark:border-zinc-800">
          <div className="mx-auto max-w-3xl px-6 py-10">
            <p className="text-sm leading-relaxed text-zinc-500 dark:text-zinc-400">
              Pokemon Deal Finder scans eBay listings for Pokemon TCG cards across the US, UK,
              Australia, Canada, Germany and Italy marketplaces and compares each one against its real
              market price and recent sold listings, surfacing only the genuine deals — the listings
              meaningfully below market. It&apos;s an independent price comparison, not a shop — you
              buy from the eBay seller.{" "}
              <Link href="/methodology" className="underline hover:text-red-600 dark:hover:text-red-500">
                How we find deals
              </Link>
              .
            </p>
          </div>
        </section>
      )}

      {/* HOW IT WORKS + FAQ - two balanced columns on the tinted ground */}
      <section id="how-it-works" data-analytics-section="how_it_works" className="border-t border-zinc-200 bg-sunk dark:border-zinc-800">
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
      <section data-analytics-section="guides" className="border-t border-zinc-200 dark:border-zinc-800">
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
