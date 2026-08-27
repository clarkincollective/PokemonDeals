import { fetchBestFinds, fetchAuctionsEndingSoon, fetchDealsPool, fetchDealsPage, fetchLastScanTime } from "@/lib/deals";
import { dealScore } from "@/lib/dealScore";
import { timeAgo } from "@/lib/time";
import SiteHeader from "@/components/SiteHeader";
import DealCard from "@/components/DealCard";
import BestFindsBanner from "@/components/BestFindsBanner";
import FilterBar from "@/components/FilterBar";
import Pagination, { pageHref } from "@/components/Pagination";

const SITE_URL = "https://pokemondealfinder.com";

// Re-check for new deals at most once a minute, so the page reflects the
// latest scan quickly without hitting the database on every single visit.
export const revalidate = 60;

// Real pagination (see the "page" handling in the component below) needs
// its own canonical per page rather than every page pointing back at "/"
// - a shared canonical would tell Google pages 2+ are duplicates of page
// 1 and their real, different deals would never get indexed under their
// own URL.
export async function generateMetadata({ searchParams }) {
  const params = await searchParams;
  const pageParam = typeof params.page === "string" ? Number(params.page) : 1;
  const page = Number.isInteger(pageParam) && pageParam > 1 ? pageParam : 1;
  const canonical = page > 1 ? `/?page=${page}` : "/";
  return {
    title: page > 1 ? `Pokémon Deal Finder - Page ${page}` : undefined,
    alternates: { canonical },
  };
}

// Single source of truth for the FAQ section below AND its FAQPage
// structured data - rendering both from one array means they can't drift
// out of sync the way the old hardcoded JSX + (nonexistent) schema would
// have. Google requires FAQ schema to match visible on-page content, so
// this isn't optional if the JSON-LD is going to stay honest.
const FAQ_ITEMS = [
  {
    question: "Is this free to use?",
    answer:
      "Yes, always. We earn a small commission if you buy through one of our links - it doesn't change the price you pay.",
  },
  {
    question: "How often do listings update?",
    answer:
      "New listings are discovered continuously - every 15 minutes in the US, hourly in other countries. Existing deals are reconfirmed on a tiered schedule: hand-picked cards every 4 hours across all countries, the wider catalog roughly every 10 days per country.",
  },
  {
    question: "Is the card-to-listing match always right?",
    answer:
      "Matching is automated. We filter out obviously wrong matches, but always double-check a listing's photos and description before buying.",
  },
];

// Above this age, "Last refreshed" stops showing a specific elapsed time
// (see the header markup below) - the sweep runs every 15 min in the US,
// so anything within this window is genuinely fresh; older than that
// means scanning is delayed or rate-limited, and showing the literal
// growing number there just reads as broken.
const SCAN_FRESH_THRESHOLD_MS = 30 * 60 * 1000;

// Fisher-Yates, in its own top-level function rather than inline in the
// component - React's purity rule flags Math.random called directly in a
// component body, even in a Server Component like this one where it's
// actually safe (no client-side re-render/reconciliation to destabilize).
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

export default async function Home({ searchParams }) {
  const params = await searchParams;
  const country = typeof params.country === "string" ? params.country : null;
  const cardType = typeof params.type === "string" ? params.type : null; // "raw" | "graded"
  const listingType = typeof params.listing === "string" ? params.listing : null; // FIXED_PRICE | AUCTION
  const maxPriceParam = typeof params.maxPrice === "string" ? Number(params.maxPrice) : null;
  const maxPrice = Number.isFinite(maxPriceParam) && maxPriceParam > 0 ? maxPriceParam : null;
  const minPriceParam = typeof params.minPrice === "string" ? Number(params.minPrice) : null;
  const minPrice = Number.isFinite(minPriceParam) && minPriceParam > 0 ? minPriceParam : null;

  const PAGE_SIZE = 24;
  const pageParam = typeof params.page === "string" ? Number(params.page) : 1;
  const page = Number.isInteger(pageParam) && pageParam > 1 ? pageParam : 1;

  // Every filter selected on this page must apply to every section shown
  // on it, not just the main "All Deals" grid below - previously Best
  // Finds/Auctions Ending Soon ignored country/type/listing entirely
  // (only maxPrice/minPrice were threaded through), so e.g. selecting
  // "Graded" still showed an ungraded card in "Top Raw" and in Auctions
  // Ending Soon. Skip a row/section outright when the active filter rules
  // it out completely, rather than silently ignoring the filter for it.
  // These only apply to page 1 - pages 2+ are a plain paginated listing
  // with no room for promo sections above it (see below).
  const showRawFinds = page === 1 && cardType !== "graded";
  const showGradedFinds = page === 1 && cardType !== "raw";
  const showAuctions = page === 1 && listingType !== "FIXED_PRICE";
  const gradedForAuctions = cardType === "graded" ? true : cardType === "raw" ? false : undefined;

  // !inner + the watchlist.language filter (inside fetchDealsPool/
  // fetchDealsPage) keeps Japanese-print deals off the main English
  // browsing experience entirely - they get their own dedicated
  // /japanese-cards page instead.
  const filters = { language: "english", country, cardType, listingType, maxPrice, minPrice };

  // Page 1 (the default, no ?page=) keeps its existing shuffled-variety
  // pool - real deals, just a different genuine subset each time the page
  // regenerates, so repeat visitors don't see a frozen list (see
  // fetchDealsPool in lib/deals.js). Page 2+ switches to real, stable,
  // offset-based pagination (fetchDealsPage) - once a visitor or crawler
  // is paging through the catalog, a shuffled result set would make pages
  // overlap/skip unpredictably, and a stable order is exactly what makes
  // these pages worth linking to and indexing on their own URL.
  const [{ data: pool, error: poolError }, dealsPageResult, { deals: bestFindsRaw }, { deals: bestFindsGraded }, { deals: endingSoon }, lastRefreshed] =
    await Promise.all([
      page === 1 ? fetchDealsPool(filters) : Promise.resolve({ data: null, error: null }),
      page > 1 ? fetchDealsPage({ table: "deals", ...filters, page }) : Promise.resolve(null),
      showRawFinds
        ? fetchBestFinds({ limit: 3, graded: false, maxPrice, minPrice, country, listingType })
        : Promise.resolve({ deals: [] }),
      showGradedFinds
        ? fetchBestFinds({ limit: 3, graded: true, maxPrice, minPrice, country, listingType })
        : Promise.resolve({ deals: [] }),
      showAuctions
        ? fetchAuctionsEndingSoon({ limit: 6, maxPrice, minPrice, country, graded: gradedForAuctions })
        : Promise.resolve({ deals: [] }),
      fetchLastScanTime({ table: "deals", language: "english" }),
    ]);

  const error = poolError || dealsPageResult?.error;

  let deals;
  let totalPages = 1;
  if (page > 1) {
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
    // Shuffle a wider recency window instead of always showing the
    // literal newest 24 - when scanning briefly stalls (e.g. an eBay
    // rate-limit day), the pool stops growing and the exact same 24
    // deals would otherwise show on every single visit until a new scan
    // lands. This never shows anything fake - every deal here is real
    // and still active - it just resurfaces a different genuine subset
    // each time the page regenerates, so repeat visitors see real
    // variety instead of a frozen list.
    const ROTATION_POOL_SIZE = 100;
    deals = shuffled(dedupedPool.slice(0, ROTATION_POOL_SIZE)).slice(0, PAGE_SIZE);
  }

  const faqJsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: FAQ_ITEMS.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: { "@type": "Answer", text: item.answer },
    })),
  };

  // Site-wide identity, not per-page content - only emitted on page 1 (the
  // real canonical homepage), not every paginated variant. SearchAction's
  // target is real, existing behavior: the search form right below on
  // this same page already posts to /search?q=... (see its action="
  // /search" below) - this doesn't add any new capability, just describes
  // the one that's already there so Google can offer a sitelinks search
  // box. No `logo` field: the only raster image on the site is the
  // 1200x630 landscape OG image, and Google's Logo guidance wants
  // something closer to square - asserting the wrong shape is worse than
  // omitting the field.
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

  const organizationJsonLd = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "Pokémon Deal Finder",
    url: SITE_URL,
  };

  return (
    <div className="flex min-h-screen flex-col bg-zinc-50 dark:bg-black">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }} />
      {page === 1 && (
        <>
          <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteJsonLd) }} />
          <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationJsonLd) }}
          />
        </>
      )}
      <SiteHeader />

      <header className="border-b border-zinc-200 dark:border-zinc-800">
        <div className="mx-auto max-w-7xl px-6 py-10">
          {/* A real, page-describing H1 - the logo above is branding, not
              a heading for this page's actual content, which is what H1
              should describe. */}
          <h1 className="max-w-2xl text-3xl font-bold tracking-tight text-black dark:text-zinc-50 sm:text-4xl">
            Find Pokémon Cards Below Market Price
          </h1>
          <p className="mt-3 max-w-xl text-base text-zinc-600 dark:text-zinc-400">
            We scan eBay listings around the clock and compare them against real market pricing and real
            sold-listing data to uncover Pokémon cards genuinely worth buying.
          </p>

          <form action="/search" className="mt-6 flex max-w-xl gap-2">
            <input
              type="text"
              name="q"
              placeholder="Search Charizard, Pikachu, Umbreon..."
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
            <p className="mt-4 inline-flex items-center gap-2 text-sm text-zinc-500">
              <span className="h-2 w-2 rounded-full bg-red-500" />
              {/* A raw "2h ago" reads as broken even when the site is
                  working fine - the deals shown are still real and active,
                  eBay just hasn't handed us anything new to find in a
                  while (a slow scan cycle, or a rate-limited day like the
                  one that prompted this). Past a threshold, say something
                  true and reassuring instead of a growing, alarming
                  number. */}
              {isRecentlyRefreshed(lastRefreshed)
                ? `Last refreshed ${timeAgo(lastRefreshed)}`
                : "Live - deals refresh automatically"}
            </p>
          )}

          <TrustBadges />

          {/* Filters sit directly below the trust badges, right next to
              the "All Deals" grid they control, rather than having Today's
              Best Finds (a separate, unrelated promo section) sandwiched
              in between - that was making the two sections feel jammed
              together and confusing to tell apart. */}
          <div className="mt-8 border-t border-zinc-200 pt-6 dark:border-zinc-800">
            <FilterBar
              params={params}
              country={country}
              cardType={cardType}
              listingType={listingType}
              maxPrice={maxPrice}
              minPrice={minPrice}
            />
          </div>
        </div>
      </header>

      <BestFindsBanner rawFinds={bestFindsRaw} gradedFinds={bestFindsGraded} />

      {endingSoon.length > 0 && (
        <section className="border-b border-zinc-200 dark:border-zinc-800">
          <div className="mx-auto max-w-7xl px-6 py-8">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-400">
              ⏰ Auctions Ending Soon
            </h2>
            <div className="mt-4 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
              {endingSoon.map((deal) => (
                <DealCard key={deal.id} deal={deal} scoreBadge={dealScore(deal.discount_pct)} pageName="ending_soon" />
              ))}
            </div>
          </div>
        </section>
      )}

      <main className="mx-auto w-full max-w-7xl flex-1 px-6 py-10">
        <h2 className="mb-5 text-sm font-semibold uppercase tracking-wide text-zinc-400">
          All Deals{page > 1 ? ` - Page ${page}` : ""}
        </h2>

        {error && <p className="rounded-lg bg-red-50 p-4 text-red-700">Couldn&apos;t load deals: {error}</p>}

        {!error && deals?.length === 0 && (
          <p className="text-zinc-500">
            No deals match these filters right now. Try clearing a filter, or
            check back after the next scheduled scan.
          </p>
        )}

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {deals?.map((deal) => (
            <DealCard key={deal.id} deal={deal} scoreBadge={dealScore(deal.discount_pct)} />
          ))}
        </div>

        {/* Real, crawlable pagination - see components/Pagination.js for
            why this matters for SEO. Page 1's grid is a shuffled variety
            pool, not a stable numbered list, so it gets one plain link
            forward instead of the full numbered control; from page 2 on,
            fetchDealsPage's real, stable count drives the full pager. */}
        {page === 1 ? (
          deals?.length > 0 && (
            <div className="mt-10 flex justify-center">
              <a
                href={pageHref(params, 2, "/")}
                className="rounded-md border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-600 hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300"
              >
                Browse more deals →
              </a>
            </div>
          )
        ) : (
          <Pagination page={page} totalPages={totalPages} params={params} basePath="/" />
        )}
      </main>

      <section id="how-it-works" className="border-t border-zinc-200 dark:border-zinc-800">
        <div className="mx-auto max-w-7xl px-6 py-12">
          <h2 className="text-lg font-bold text-black dark:text-zinc-50">How it works</h2>
          <ol className="mt-5 grid gap-6 sm:grid-cols-3">
            <li>
              <p className="font-semibold text-black dark:text-zinc-50">1. We scan eBay</p>
              <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                Every watched card is checked against live eBay listings, several times a day.
              </p>
            </li>
            <li>
              <p className="font-semibold text-black dark:text-zinc-50">2. We check real pricing</p>
              <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                Each listing is compared against real market pricing and recent eBay sold listings - not
                guesses.
              </p>
            </li>
            <li>
              <p className="font-semibold text-black dark:text-zinc-50">3. We only show genuine deals</p>
              <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                A listing only makes the list if it&apos;s meaningfully below market and the seller passes
                our trust checks.
              </p>
            </li>
          </ol>
        </div>
      </section>

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

      <footer className="border-t border-zinc-200 px-6 py-8 text-center text-xs text-zinc-500 dark:border-zinc-800">
        As an eBay and TCGPlayer affiliate, we earn a commission on qualifying
        purchases made through links on this site. Prices and availability are
        subject to change and were accurate as of the listing&apos;s last scan.
        Card-to-listing matching is automated and not perfect - always
        double-check a listing&apos;s photos and description before buying.
      </footer>
    </div>
  );
}

function Badge({ icon, bold, label }) {
  return (
    <div className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400">
      <span className="text-zinc-400 dark:text-zinc-500">{icon}</span>
      <span>
        <span className="font-semibold text-black dark:text-zinc-50">{bold}</span> {label}
      </span>
    </div>
  );
}

// Deliberately real, verifiable claims only - see conversation with the
// user about why "AI-Powered" / "40K+ tracked" / "6M+ sales records"
// (numbers from a reference site) don't hold up for this project's actual
// scope and were replaced with what's actually true.
function TrustBadges() {
  const iconProps = {
    viewBox: "0 0 20 20",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.5,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    className: "h-5 w-5",
  };

  return (
    <div className="mt-5 flex flex-wrap items-center gap-x-8 gap-y-3">
      <Badge
        icon={
          <svg {...iconProps}>
            <circle cx="8.5" cy="8.5" r="5.5" />
            <line x1="16" y1="16" x2="12.5" y2="12.5" />
          </svg>
        }
        bold="Automated"
        label="market matching"
      />
      <Badge
        icon={
          <svg {...iconProps}>
            <rect x="2.5" y="6.5" width="12" height="9" rx="1.5" />
            <path d="M6 6.5V4.5A1.5 1.5 0 0 1 7.5 3H16A1.5 1.5 0 0 1 17.5 4.5V12A1.5 1.5 0 0 1 16 13.5H15" />
          </svg>
        }
        bold="50,000+"
        label="card pricing database"
      />
      <Badge
        icon={
          <svg {...iconProps}>
            <path d="M5 3h10a1 1 0 0 1 1 1v12l-2-1.3-2 1.3-2-1.3-2 1.3-2-1.3-2 1.3V4a1 1 0 0 1 1-1Z" />
            <line x1="7" y1="7" x2="13" y2="7" />
            <line x1="7" y1="10" x2="13" y2="10" />
          </svg>
        }
        bold="Real"
        label="eBay sold-listing data"
      />
      <Badge
        icon={
          <svg {...iconProps}>
            <path d="M11 3.5 17 9.5a1.4 1.4 0 0 1 0 2L11.5 17a1.4 1.4 0 0 1-2 0L3 10.5V4.5A1 1 0 0 1 4 3.5h7Z" />
            <circle cx="7.5" cy="7.5" r="1" />
          </svg>
        }
        bold="Free"
        label="to browse, always"
      />
    </div>
  );
}

