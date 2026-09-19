import { marketplaceFilterValue } from "@/lib/marketplaceScope";
import Link from "next/link";
import { fetchBestFinds, fetchHubCounts, fetchSetSlugs } from "@/lib/deals";
import SiteHeader from "@/components/SiteHeader";
import SkipToContent from "@/components/SkipToContent";
import RegionRedirect from "@/components/RegionRedirect";
import SiteFooter from "@/components/SiteFooter";
import DealCard from "@/components/DealCard";
import JsonLd from "@/components/JsonLd";
import { breadcrumbList, collectionPage, itemList } from "@/lib/jsonLd";
import { filterHref, PriceFilterRow, CountryFilterRow } from "@/components/FilterBar";
import MarketplaceScopeNote from "@/components/MarketplaceScopeNote";
import { EmptyStateEscapes } from "@/components/DealFilterChips";

// The same URL with both price bounds removed (the empty state's "one
// filter relaxed" action). Keeps type / country; pagination does not exist
// on this page.
function withoutPriceHref(params) {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params ?? {})) {
    if (k === "minPrice" || k === "maxPrice" || typeof v !== "string") continue;
    sp.set(k, v);
  }
  const qs = sp.toString();
  return qs ? `/best-finds?${qs}` : "/best-finds";
}

export const revalidate = 300;

// SEO-2: the page is a Top 10 of the biggest genuine below-market
// discounts (raw or graded); the title now says so.
const TITLE = "Best Pokemon Card Deals Today: Top 10";
const DESCRIPTION = "The biggest real discounts on higher-value Pokemon cards, found on eBay right now.";

// See app/sets/page.js's identical fix - was falling back to the root
// layout's generic preview when shared.
export const metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/best-finds" },
  openGraph: { title: TITLE, description: DESCRIPTION, url: "https://pokemondealfinder.com/best-finds" },
  twitter: { card: "summary", title: TITLE, description: DESCRIPTION },
};

// A single bordered track with two tabs inside, rather than two separate
// pill buttons - reads as one control (raw vs. graded) instead of two
// unrelated buttons. Built on filterHref (not a hardcoded href) so
// switching raw/graded preserves an active price filter instead of
// silently resetting it.
function TypeToggle({ params, type }) {
  const tabClass = (active) =>
    `inline-flex min-h-11 items-center rounded-full px-3.5 py-1.5 text-sm font-semibold transition-colors ${
      active
        ? "bg-zinc-900 text-white dark:bg-zinc-50 dark:text-zinc-900"
        : "text-zinc-600 hover:text-red-600 dark:text-zinc-300 dark:hover:text-red-500"
    }`;

  return (
    <div className="mt-4 inline-flex gap-0.5 rounded-full border border-zinc-200 p-0.5 dark:border-zinc-800">
      <a rel="nofollow" href={filterHref(params, "type", "raw", "/best-finds")} className={tabClass(type === "raw")}>
        Raw
      </a>
      <a rel="nofollow" href={filterHref(params, "type", "graded", "/best-finds")} className={tabClass(type === "graded")}>
        Graded
      </a>
    </div>
  );
}

export default async function BestFindsPage({ searchParams }) {
  const params = await searchParams;
  // Raw and graded are ranked as two separate lists (graded is a much
  // smaller pool - mixing them would let raw deals crowd out every
  // graded one) - default to raw since it's the far larger, more
  // frequently-updated list.
  const type = params.type === "graded" ? "graded" : "raw";
  const countryChoice = typeof params.country === "string" ? params.country : null;
  const country = marketplaceFilterValue(countryChoice); // "all" -> every marketplace
  const maxPriceParam = typeof params.maxPrice === "string" ? Number(params.maxPrice) : null;
  const maxPrice = Number.isFinite(maxPriceParam) && maxPriceParam > 0 ? maxPriceParam : null;
  const minPriceParam = typeof params.minPrice === "string" ? Number(params.minPrice) : null;
  const minPrice = Number.isFinite(minPriceParam) && minPriceParam > 0 ? minPriceParam : null;
  const [{ deals, error }, hubCounts, validSetSlugs] = await Promise.all([
    fetchBestFinds({ limit: 10, graded: type === "graded", maxPrice, minPrice, country }),
    fetchHubCounts({ language: "english" }),
    fetchSetSlugs("english"),
  ]);

  return (
    <div className="flex min-h-screen flex-col bg-paper">
      <JsonLd
        data={[
          breadcrumbList([
            { name: "Deals", href: "/" },
            { name: "Best finds" },
          ]),
          collectionPage({ name: TITLE, description: DESCRIPTION, url: "/best-finds" }),
          ...(deals.length
            ? [
                itemList(
                  deals.map((d) => ({
                    name: `${d.watchlist?.name ?? d.title} (${d.watchlist?.set ?? ""})`.trim(),
                    url: `/deals/${d.id}`,
                  }))
                ),
              ]
            : []),
        ]}
      />
      <SkipToContent />
      <SiteHeader />
      <RegionRedirect />

      <header className="border-b border-zinc-200 bg-gradient-to-b from-red-50 to-transparent dark:border-zinc-800 dark:from-red-950/20">
        <div className="mx-auto max-w-7xl px-6 py-8">
          <Link
            href="/"
            className="block text-sm font-medium text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
          >
            ← All deals
          </Link>
          <span className="mt-4 inline-flex items-center gap-1.5 rounded-md bg-red-600 px-3 py-1 text-xs font-bold text-white">
            🔥 Today&apos;s Best Finds
          </span>
          {/* Truthful count: the list is never padded with non-qualifying
              offers, so when fewer than ten qualify the heading says so. */}
          <h1 className="mt-3 text-2xl font-bold text-black dark:text-zinc-50">
            {deals.length >= 10 ? "Top 10" : deals.length > 0 ? `Top ${deals.length}` : "Top"} {type === "graded" ? "graded" : "raw"} Buy It Now deals right now
          </h1>
          {deals.length > 0 && deals.length < 10 && (
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              Only {deals.length} {type} {deals.length === 1 ? "offer clears" : "offers clear"} the standout bar right now — the list is never topped up with weaker ones.
            </p>
          )}
          <p className="mt-2 max-w-xl text-sm text-zinc-600 dark:text-zinc-400">
            Higher-value cards you can buy now for the most below a trustworthy market reference -
            ranked on how far below market and how much you actually save. Auctions have their own{" "}
            <Link href="/deals/auctions" className="underline hover:text-red-600 dark:hover:text-red-500">
              ending-soon list
            </Link>
            . Each card stays here until a better deal replaces it.
          </p>

          <TypeToggle params={params} type={type} />

          <div className="mt-6 flex flex-col gap-4 border-t border-zinc-200 pt-5 dark:border-zinc-800">
            <CountryFilterRow params={params} country={countryChoice} basePath="/best-finds" />
            <PriceFilterRow params={params} maxPrice={maxPrice} minPrice={minPrice} basePath="/best-finds" />
          </div>
        </div>
      </header>

      <main id="main-content" tabIndex={-1} className="mx-auto w-full max-w-7xl flex-1 scroll-mt-6 px-6 py-6 sm:py-8">
        {error && (
          <p className="rounded-lg bg-danger/10 p-4 text-danger">Couldn&apos;t load deals: {error.message}</p>
        )}

        {!error && <MarketplaceScopeNote params={params} basePath="/best-finds" thin={deals.length < 8} />}

        {!error && deals.length === 0 && (
          <div className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950">
            <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
              No standout {type} deals match these filters right now.
            </p>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              {countryChoice && countryChoice !== "all" ? "Only your selected marketplace is shown. " : ""}
              Try {type === "raw" ? "graded cards" : "raw cards"}, relax one filter, or browse other listings
              {countryChoice && countryChoice !== "all" ? " in your selected marketplace" : ""}.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Link href={filterHref(params, "type", type === "raw" ? "graded" : "raw", "/best-finds")} rel="nofollow" className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs font-semibold text-black hover:border-zinc-400 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50 dark:hover:bg-zinc-800">
                Show {type === "raw" ? "graded" : "raw"} instead
              </Link>
              {(maxPrice || minPrice) && (
                <Link href={withoutPriceHref(params)} rel="nofollow" className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs font-semibold text-black hover:border-zinc-400 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50 dark:hover:bg-zinc-800">
                  Remove the price limit
                </Link>
              )}
              {countryChoice && countryChoice !== "all" && (
                <Link href={filterHref(params, "country", "all", "/best-finds")} rel="nofollow" data-marketplace-choice="all" className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs font-semibold text-black hover:border-zinc-400 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50 dark:hover:bg-zinc-800">
                  Browse all marketplaces
                </Link>
              )}
            </div>
            <EmptyStateEscapes className="mt-3" />
          </div>
        )}

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {deals.map((deal, i) => (
            <DealCard key={deal.id} deal={deal} rank={i + 1} hub={hubCounts[deal.watchlist_id]} pageName="best_finds" validSetSlugs={validSetSlugs} from="/best-finds" />
          ))}
        </div>

        {deals.length > 0 && (
          <div className="mt-10 flex justify-center">
            <Link
              href="/"
              className="rounded-lg bg-zinc-900 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-red-600 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-red-600 dark:hover:text-white"
            >
              See Today&apos;s Other Listings →
            </Link>
          </div>
        )}
      </main>

      <SiteFooter note="Card-to-listing matching is automated and not perfect - always double-check a listing's photos and description before buying." />
    </div>
  );
}
