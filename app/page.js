import Image from "next/image";
import Link from "next/link";
import {
  fetchHomepageLanes,
  fetchDealsPool,
  fetchDealsPage,
  fetchLastScanTime,
  fetchCardHubs,
  fetchHubCounts,
  fetchMarketDataSummary,
  fetchSetSlugs,
} from "@/lib/deals";
import { buildHomepageLanes, rotationBucket, rotateForBucket, selectDiverseLane } from "@/lib/homepageVariety";
import { GUIDES } from "@/lib/guides";
import { timeAgo } from "@/lib/time";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import RegionRedirect from "@/components/RegionRedirect";
import Price from "@/components/Price";
import HeroSearch from "@/components/HeroSearch";
import MobileStickySearch from "@/components/MobileStickySearch";
import SectionHeader from "@/components/SectionHeader";
import DealCard from "@/components/DealCard";
import HomeBrowseLinks from "@/components/HomeBrowseLinks";
import FilterBar from "@/components/FilterBar";
import { EmptyStateEscapes } from "@/components/DealFilterChips";
import Pagination, { pageHref } from "@/components/Pagination";
import CardImagePlaceholder from "@/components/CardImagePlaceholder";
import CardMemoryStrip from "@/components/CardMemoryStrip";
import HomepageAnalytics from "@/components/analytics/HomepageAnalytics";
import EmailCapture from "@/components/EmailCapture";
import { emailEnabled } from "@/lib/email";
import { catalogImageUrl } from "@/lib/cardImage";

const SITE_URL = "https://pokemondealfinder.com";

const guideBy = (slug) => GUIDES.find((g) => g.slug === slug);

// Three editorial cards for the homepage "Guides & research" section.
// The dated research leads - it is the content readers could not find,
// being two levels down under Browse > Market Data.
//
// `image` is set ONLY where the card pictured is that piece's own worked
// example: the study's example is Cubone (Jungle, tcgplayer 45153, from
// lib/studies STUDY.example) and the pricing guide cites Base Set
// Charizard (42382). The condition guide cites no single card, so it
// falls through to the shared CardImagePlaceholder rather than borrowing
// unrelated artwork. Nothing here is newly published - the study carries
// its sample window so the row cannot read as fresh.
const EDITORIAL_CARDS = [
  {
    href: "/market-data/pokemon-reference-price-changes",
    contentId: "reference-price-changes-30d",
    kicker: "Research",
    title: "30-Day Reference-Price Changes",
    description:
      "A dated study of 150 sampled product records: how many moved, and why a product summary differs from its individual condition and printing variants.",
    meta: "Sample window 12 Aug - 11 Sep 2026",
    image: catalogImageUrl("45153"),
    imageAlt: "Cubone (Jungle) - the worked example used in the study",
  },
  {
    href: "/guides/how-pokemon-card-prices-work",
    contentId: "how-pokemon-card-prices-work",
    kicker: "Guide",
    title: guideBy("how-pokemon-card-prices-work").title,
    description: guideBy("how-pokemon-card-prices-work").blurb,
    image: catalogImageUrl("42382"),
    imageAlt: "Charizard (Base Set) - an example used in the guide",
  },
  {
    href: "/guides/how-to-check-pokemon-card-condition",
    contentId: "how-to-check-pokemon-card-condition",
    kicker: "Guide",
    title: guideBy("how-to-check-pokemon-card-condition").title,
    description: guideBy("how-to-check-pokemon-card-condition").blurb,
    image: null,
    imageAlt: "",
  },
];

export const revalidate = 180;

export async function generateMetadata({ searchParams }) {
  const params = await searchParams;
  const pageParam = typeof params.page === "string" ? Number(params.page) : 1;
  const page = Number.isInteger(pageParam) && pageParam > 1 ? pageParam : 1;
  const canonical = page > 1 ? `/?page=${page}` : "/";
  if (page > 1) {
    // SEO-2: page 2+ of the rolling deal list is a low-value pagination
    // variant - keep it self-canonical (it IS distinct paginated content,
    // not a copy of page 1) but out of the index; follow so the deal /
    // card links on it still pass equity.
    return {
      title: { absolute: `Pokemon Deal Finder - Page ${page}` },
      alternates: { canonical },
      robots: { index: false, follow: true },
    };
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

// Deal-first R2 - the feed's MODE row. Every mode is an existing
// destination with its own route and meaning (the dedicated /deals/<cat>
// landing pages, the sealed / Japanese hubs, the existing ?listing= and
// ?sort= filters), never a new URL tree. The default homepage feed is
// "Featured": the flagship row is Buy It Now only, but the diverse grid
// under it is MIXED (auctions included - each card says which), so the
// default is not labelled "Buy it now"; that chip is the existing
// FIXED_PRICE filter. Analytics markers are the ones these chips already
// carried (start_here_clicked with the chip id; the graded chip keeps its
// graded_entry flag). Filter-style URLs are nofollow'd.
const FEED_MODES = [
  { href: "/", label: "Featured", chip: "featured", home: true },
  { href: "/?listing=FIXED_PRICE", label: "Buy it now", chip: "buy_it_now" },
  { href: "/deals/auctions", label: "Auctions", chip: "auctions" },
  { href: "/deals/graded", label: "Graded", chip: "graded", graded: true },
  { href: "/deals/under-25", label: "Under $25", chip: "under_25" },
  { href: "/deals/under-50", label: "Under $50", chip: "under_50" },
  { href: "/sealed-deals", label: "Sealed", chip: "sealed" },
  { href: "/japanese-cards", label: "Japanese", chip: "japanese" },
  { href: "/?sort=newest", label: "Newest", chip: "newest" },
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
  // gets the curated homepage feed, just scoped to deals they can
  // actually buy.
  const anyFilter = Boolean(country || cardType || listingType || sort || maxPrice || minPrice);
  const showPromo = page === 1 && !cardType && !listingType && !sort && !maxPrice && !minPrice;

  const filters = { language: "english", country, cardType, listingType, maxPrice, minPrice };

  // Page 1, no sort -> curated + diverse rotating lanes. Any sort, or
  // page 2+ -> deterministic, stable pagination.
  const useStableList = page > 1 || sort;
  // P0.4.1 - deterministic 3-hour rotation bucket. Every render inside one
  // bucket is byte-identical (cache-safe, no hydration drift, no SEO
  // churn); a new bucket rotates the visible curated inventory.
  const bucket = rotationBucket();

  const [
    homeLanesResult,
    { data: filteredPool, error: poolError },
    dealsPageResult,
    lastRefreshed,
    cardHubsResult,
    hubCounts,
    summary,
    validSetSlugs,
  ] = await Promise.all([
    showPromo ? fetchHomepageLanes({ country }) : Promise.resolve(null),
    !showPromo && !useStableList ? fetchDealsPool(filters) : Promise.resolve({ data: null, error: null }),
    useStableList ? fetchDealsPage({ table: "deals", ...filters, sort: sort ?? "newest", page }) : Promise.resolve(null),
    fetchLastScanTime({ table: "deals", language: "english" }),
    showPromo ? fetchCardHubs({ language: "english" }) : Promise.resolve({ hubs: [] }),
    fetchHubCounts({ language: "english" }),
    showPromo ? fetchMarketDataSummary() : Promise.resolve(null),
    fetchSetSlugs("english"),
  ]);

  const error = poolError || dealsPageResult?.error;

  let flagshipDeals = [];
  let deals = [];
  let totalPages = 1;

  if (useStableList) {
    deals = dealsPageResult?.deals ?? [];
    totalPages = dealsPageResult?.totalPages ?? 1;
  } else if (showPromo) {
    // One pass builds every curated lane with real cross-lane dedupe +
    // the deterministic diversity selector + 3-hour rotation. Deal-first
    // R2 renders ONE feed from it: the premium-gated flagship row first,
    // then the diverse grid. The auction / just-added / under-$25 lanes
    // the selector still computes are reached through the feed's mode
    // row (their existing routes) instead of three more grids.
    // `lanes`: only the two lanes this page renders take part in the
    // cross-lane dedupe, so the folded lanes no longer reserve printings a
    // visitor never sees (review fix P3). Same pools, same gates, same
    // selector, same rotation.
    const lanes = buildHomepageLanes(homeLanesResult?.pools ?? {}, { bucket, lanes: ["flagship", "grid"] });
    flagshipDeals = lanes.flagship;
    deals = lanes.grid;
  } else {
    // Filtered page-1 grid (no curated lanes): a deterministic per-bucket
    // diverse slice of the WHOLE filtered pool - no per-request shuffle,
    // no "newest 400 only" cap.
    const ordered = rotateForBucket(filteredPool ?? [], {
      bucket,
      laneId: "grid_filtered",
      mode: "bucketPermute",
    });
    deals = selectDiverseLane(ordered, { limit: HOME_PREVIEW_SIZE, speciesCap: 3 });
  }

  const topHubs = cardHubsResult.hubs.slice(0, 6);
  const popularSearches = cardHubsResult.hubs.slice(0, 5).map((h) => ({ name: h.name, slug: h.slug }));
  const liveCount = summary?.activeDeals ?? null;
  const feedEmpty = !error && flagshipDeals.length === 0 && (deals?.length ?? 0) === 0;

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

  const chip = (active) =>
    `inline-flex min-h-10 items-center rounded-lg border px-3.5 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600 ${
      active
        ? "border-red-600 bg-red-600 text-white"
        : "border-zinc-300 bg-white text-zinc-800 hover:border-zinc-400 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
    }`;

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

      {/* HERO - deal-first R2: compact. One offer-led heading, one line
          of supporting copy, the exact-card search as a shortcut (with
          its example queries), and the live-count line. No CTA that
          only scrolls a few pixels - the first offers are already in
          view below. */}
      <header className="border-b border-zinc-200 bg-sunk dark:border-zinc-800">
        <div className="mx-auto max-w-7xl px-6 py-7 lg:py-9">
          <h1 className="max-w-2xl text-3xl font-bold tracking-tight text-zinc-900 sm:text-4xl dark:text-zinc-50">
            Find your next Pokemon card deal.
          </h1>
          <p className="mt-2 max-w-xl text-base text-zinc-600 dark:text-zinc-400">
            Below-market eBay listings, each compared against a real recent-sold market reference for
            its exact printing and condition. Check the details, then buy on eBay.
          </p>
          <div className="mt-5">
            <HeroSearch popular={popularSearches} />
          </div>
          <p className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-zinc-500 dark:text-zinc-400">
            {/* Phase 17B - the value-intent entry path (-> the price
                checker), kept measurable as a plain text link beside the
                search examples rather than a second hero button. */}
            <Link
              href="/search"
              data-analytics-click="price_checker_entry_clicked"
              data-analytics-props={JSON.stringify({ section: "hero" })}
              className="font-medium text-zinc-700 underline-offset-2 hover:text-red-600 hover:underline dark:text-zinc-300 dark:hover:text-red-500"
            >
              Check a card&apos;s price →
            </Link>
            <span className="hidden text-zinc-300 sm:inline dark:text-zinc-700">·</span>
            <span>
            or try a search:{" "}
            {SEARCH_EXAMPLES.map((q, i) => (
              <span key={q}>
                <Link
                  href={`/search?q=${encodeURIComponent(q)}`}
                  data-analytics-click="hero_example_clicked"
                  data-analytics-props={JSON.stringify({ section: "hero", rank: i + 1 })}
                  className="font-medium text-zinc-700 underline-offset-2 hover:text-red-600 hover:underline dark:text-zinc-300 dark:hover:text-red-500"
                >
                  {q}
                </Link>
                {i < SEARCH_EXAMPLES.length - 1 && <span className="mx-1.5 text-zinc-300 dark:text-zinc-700">·</span>}
              </span>
            ))}
            </span>
          </p>
          {lastRefreshed && (
            <p className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-zinc-600 dark:text-zinc-300">
              <span className="inline-flex h-2 w-2 rounded-full bg-live" />
              {liveCount != null && <span className="tnum font-semibold">{liveCount.toLocaleString()} live deals</span>}
              {liveCount != null && <span className="text-zinc-300 dark:text-zinc-700">·</span>}
              <span>{isRecentlyRefreshed(lastRefreshed) ? `checked ${timeAgo(lastRefreshed)}` : "refreshing automatically"}</span>
              <span className="text-zinc-300 dark:text-zinc-700">·</span>
              <Link href="/methodology" className="hover:text-red-600 hover:underline dark:hover:text-red-500">
                how we price this →
              </Link>
            </p>
          )}
        </div>
      </header>

      {/* THE FEED - one dominant deal feed: the premium-gated flagship
          row (best_deals) then the diverse preview grid (all_deals), the
          mode row above it, "More filters" for the full filter set, and
          the paginated / filtered list on any non-default view. Section
          ids keep their established analytics meaning. */}
      <main id="deals" className="mx-auto w-full max-w-7xl flex-1 px-6 py-8 lg:py-10">
        <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
          {/* the default feed mixes Buy It Now (the flagship row is BIN only)
              and auctions in the grid - every card names its own kind, so
              the kicker says "featured", not "buy it now" */}
          <SectionHeader
            kicker={anyFilter ? "Filtered" : "Featured · below market · buy it now and auctions"}
            title={anyFilter ? "Filtered deals" : page > 1 ? `All deals - page ${page}` : "Deals to explore"}
          />
          <a href="#how-it-works" className="text-sm font-medium text-zinc-600 underline-offset-2 hover:text-red-600 hover:underline dark:text-zinc-300 dark:hover:text-red-500">
            How comparisons work →
          </a>
        </div>

        <nav aria-label="Deal modes" className="mt-4 flex flex-wrap items-center gap-2">
          {FEED_MODES.map((m) => (
            <Link
              key={m.href}
              href={m.href}
              rel={m.href.includes("?") ? "nofollow" : undefined}
              aria-current={m.home && showPromo ? "page" : undefined}
              data-analytics-click="start_here_clicked"
              data-analytics-props={JSON.stringify({ section: "feed_modes", chip: m.chip, ...(m.graded ? { graded_entry: true, source: "start_here" } : {}) })}
              className={chip(m.home && showPromo)}
            >
              {m.label}
            </Link>
          ))}
          {(useStableList || page > 1 || (anyFilter && !showPromo)) && (
            <Link
              href="/"
              data-analytics-click="filter_cleared"
              data-analytics-props={JSON.stringify({ facet: "all", context: "all_deals" })}
              className="text-sm font-medium text-zinc-600 underline-offset-2 hover:text-red-600 hover:underline dark:text-zinc-300 dark:hover:text-red-500"
            >
              Clear filters
            </Link>
          )}
        </nav>

        <div className="mt-3" data-analytics-filter-bar="all_deals">
          <FilterBar
            params={params}
            country={country}
            cardType={cardType}
            listingType={listingType}
            maxPrice={maxPrice}
            minPrice={minPrice}
            sort={sort}
            collapsible
          />
        </div>

        {/* Slim trust line - the disclosure sits next to the offers, not
            only in the footer. */}
        <p className="mb-5 text-xs text-zinc-500 dark:text-zinc-400">
          Independent comparisons · every price checked against real eBay sold listings · we may earn a
          commission on purchases, at no cost to you
        </p>

        {error && <p className="rounded-lg bg-red-50 p-4 text-red-700">Couldn&apos;t load deals: {error}</p>}

        {feedEmpty && (
          <div className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950">
            <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
              {anyFilter
                ? "No live deals match these filters right now."
                : "No deals to show right now — the next scheduled scan will refresh this."}
            </p>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              {anyFilter
                ? "These filters run against real, currently-active listings — nothing was broadened."
                : "Every deal is a live listing checked against real market data."}
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs font-medium">
              {anyFilter && (
                <Link
                  href="/"
                  data-analytics-click="filter_cleared"
                  data-analytics-props={JSON.stringify({ facet: "all", context: "empty_state" })}
                  className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 font-semibold text-black hover:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
                >
                  Clear filters
                </Link>
              )}
              <EmptyStateEscapes />
            </div>
          </div>
        )}

        {/* flagship row: the four strongest offers (premium gate, Buy It
            Now only, tile 1 = the single best deal), above-the-fold on
            desktop so their images load eagerly */}
        {showPromo && flagshipDeals.length > 0 && (
          <section id="best-deals" data-analytics-section="best_deals" aria-label="Best deals right now" className="scroll-mt-24">
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {flagshipDeals.map((deal, i) => (
                <DealCard key={deal.id} deal={deal} rank={i + 1} hub={hubCounts[deal.watchlist_id]} pageName="home_best" validSetSlugs={validSetSlugs} priority={i < 2} analytics={{ section: "best_deals", rank: i + 1 }} />
              ))}
            </div>
          </section>
        )}

        <section data-analytics-section="all_deals" aria-label={anyFilter ? "Filtered deals" : "More deals"} className={showPromo && flagshipDeals.length > 0 ? "mt-5" : ""}>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {deals?.map((deal) => (
              // 13C.5 - `home_all_deals` so an affiliate_click from this grid
              // is attributable to the homepage All Deals lane, not the
              // bare "home" catch-all shared with /cards, /sets, /deals grids.
              <DealCard key={deal.id} deal={deal} hub={hubCounts[deal.watchlist_id]} validSetSlugs={validSetSlugs} pageName="home_all_deals" />
            ))}
          </div>

          {!useStableList ? (
            deals?.length > 0 && (
              <div className="mt-8 flex flex-col items-center gap-2">
                <Link
                  href="/deals"
                  data-analytics-click="browse_all_deals_clicked"
                  data-analytics-props={JSON.stringify({ section: "all_deals" })}
                  className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-zinc-300 bg-white px-6 text-sm font-semibold text-zinc-900 transition-colors hover:border-zinc-400 hover:bg-zinc-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50 dark:hover:bg-zinc-800"
                >
                  Browse all live deals
                  {liveCount != null && (
                    <span className="tnum rounded-md bg-zinc-100 px-1.5 py-0.5 text-xs font-bold text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200">
                      {liveCount.toLocaleString()}
                    </span>
                  )}
                  <span aria-hidden="true">→</span>
                </Link>
                <a
                  href={pageHref(params, 2, "/")}
                  className="text-xs font-medium text-zinc-500 underline-offset-2 hover:text-red-600 hover:underline dark:text-zinc-400 dark:hover:text-red-500"
                >
                  or keep scrolling this page
                </a>
              </div>
            )
          ) : (
            <Pagination page={page} totalPages={totalPages} params={params} basePath="/" />
          )}
        </section>

        {/* The viewer's own locally-saved / recently-viewed cards. Renders
            nothing for first-time visitors and on the server; sits below
            the first offers so it never stands between a new visitor and
            a real deal. */}
        {showPromo && <CardMemoryStrip />}

        {/* CRM-1 - inline email capture AFTER the offers. Not a popup.
            Rendered only when server-side email capture is enabled
            (RESEND_API_KEY + ALERT_FROM_EMAIL); double opt-in, nothing sent
            here. */}
        {showPromo && emailEnabled() && (
          <EmailCapture placement="homepage" pageType="homepage" className="mt-10" />
        )}
      </main>

      {/* EXPLORE - compact catalogue / collecting entry points: the three
          hubs, the six cards with the most active listings (real counts),
          and the static Popular Pokemon / Key sets rows. Every link and
          click event from the previous "Explore Pokemon cards" section is
          preserved. */}
      {showPromo && (
        <section data-analytics-section="browse" className="border-t border-zinc-200 dark:border-zinc-800">
          <div className="mx-auto max-w-7xl px-6 py-10">
            <SectionHeader kicker="Know what you want" title="Explore more ways to collect" />

            <div className="mt-5 grid gap-4 sm:grid-cols-3">
              {[
                { href: "/sets", event: "browse_sets_clicked", title: "Sets & checklists", copy: "Set checklists with market-reference prices - track a set and mark what you own." },
                { href: "/pokemon", event: "browse_pokemon_clicked", title: "Pokemon cards", copy: "Card prices and values for a species across all its prints and sets - plus any current deal." },
                { href: "/cards", event: "browse_catalogue_clicked", title: "Card database", copy: "Find an exact printing - a permanent page and a real market reference for every card we track." },
              ].map((t) => (
                <Link
                  key={t.href}
                  href={t.href}
                  data-analytics-click={t.event}
                  data-analytics-props={JSON.stringify({ section: "browse" })}
                  className="group flex items-center justify-between gap-4 rounded-xl border border-zinc-200 bg-white p-5 transition-colors hover:border-zinc-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600 dark:border-zinc-800 dark:bg-zinc-950 dark:hover:border-zinc-600"
                >
                  <div>
                    <p className="text-base font-semibold text-zinc-900 dark:text-zinc-50">{t.title}</p>
                    <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">{t.copy}</p>
                  </div>
                  <span className="text-xl text-zinc-300 transition-colors group-hover:text-red-600 dark:text-zinc-600">→</span>
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
                    className="text-xs font-medium text-zinc-600 underline-offset-2 hover:text-red-600 hover:underline dark:text-zinc-300 dark:hover:text-red-500"
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
                      className="group flex flex-col overflow-hidden rounded-xl border border-zinc-200 bg-white transition-colors hover:border-zinc-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600 dark:border-zinc-800 dark:bg-zinc-950 dark:hover:border-zinc-600"
                    >
                      <div className="relative aspect-square w-full bg-zinc-50 dark:bg-zinc-900">
                        {hub.image ? (
                          <Image
                            src={hub.image}
                            alt={`${hub.name} - ${hub.set}`}
                            fill
                            sizes="(max-width: 640px) 50vw, 16vw"
                            className="object-contain p-2"
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
                          from <Price usd={hub.cheapestPrice} native={{ amount: hub.cheapestPrice, currency: "USD" }} />
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

      {/* GUIDES & RESEARCH - three editorial cards (section id pinned by
          homepage-hierarchy.test). Artwork only where the card is the
          piece's own worked example. */}
      <section data-analytics-section="guides" className="border-t border-zinc-200 bg-sunk dark:border-zinc-800">
        <div className="mx-auto max-w-7xl px-6 py-10">
          <SectionHeader kicker="Learn the market" title="Guides & research" actionLabel="All guides & research" actionHref="/guides" />
          <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {EDITORIAL_CARDS.map((c) => (
              <Link
                key={c.href}
                href={c.href}
                data-analytics-click="guides_research_clicked"
                data-analytics-props={JSON.stringify({ section: "guides", content_id: c.contentId, placement: "homepage" })}
                className="group flex items-start gap-4 rounded-xl border border-zinc-200 bg-white p-4 transition-colors hover:border-zinc-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600 dark:border-zinc-800 dark:bg-zinc-950 dark:hover:border-zinc-600"
              >
                <div className="relative aspect-[5/7] w-14 shrink-0 overflow-hidden rounded-md bg-zinc-50 dark:bg-zinc-900">
                  {c.image ? (
                    <Image src={c.image} alt={c.imageAlt} fill sizes="56px" className="object-contain p-1" />
                  ) : (
                    <CardImagePlaceholder />
                  )}
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-400">{c.kicker}</p>
                  <p className="mt-1 text-sm font-semibold text-zinc-900 transition-colors group-hover:text-red-600 dark:text-zinc-50 dark:group-hover:text-red-500">
                    {c.title}
                  </p>
                  <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-zinc-600 dark:text-zinc-400">{c.description}</p>
                  {c.meta && <p className="mt-1.5 text-[11px] text-zinc-500">{c.meta}</p>}
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* HOW COMPARISONS WORK + FAQ. The plain-language summary (what the
          tool does, which marketplaces) leads in - server-rendered and
          visible, matching /how-it-works and /methodology exactly - then
          the three steps and the FAQ whose items feed the FAQPage JSON-LD. */}
      <section data-analytics-section="how_it_works" className="border-t border-zinc-200 dark:border-zinc-800">
        <div className="mx-auto max-w-7xl px-6 py-12">
          <p className="max-w-3xl text-sm leading-relaxed text-zinc-500 dark:text-zinc-400">
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
          <div id="how-it-works" className="mt-8 grid gap-12 scroll-mt-24 lg:grid-cols-2">
            <div>
              <SectionHeader kicker="No guesswork" title="How comparisons work" actionLabel="Full methodology" actionHref="/methodology" />
              <ol className="mt-5 flex flex-col gap-5">
                <li>
                  <p className="font-semibold text-zinc-900 dark:text-zinc-50">1. We scan eBay around the clock</p>
                  <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">Every watched card is checked against live eBay listings, continuously.</p>
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
            <div id="faq" className="scroll-mt-24">
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
        </div>
      </section>

      <SiteFooter note="Card-to-listing matching is automated and not perfect - always double-check a listing's photos and description before buying." />
    </div>
  );
}
