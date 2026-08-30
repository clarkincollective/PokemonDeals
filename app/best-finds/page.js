import Link from "next/link";
import { fetchBestFinds, fetchHubCounts } from "@/lib/deals";
import SiteHeader from "@/components/SiteHeader";
import RegionRedirect from "@/components/RegionRedirect";
import SiteFooter from "@/components/SiteFooter";
import DealCard from "@/components/DealCard";
import JsonLd from "@/components/JsonLd";
import { breadcrumbList, collectionPage, itemList } from "@/lib/jsonLd";
import { filterHref, PriceFilterRow, CountryFilterRow } from "@/components/FilterBar";

export const revalidate = 60;

const TITLE = "Today's Best Finds";
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
    `rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors ${
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
  const country = typeof params.country === "string" ? params.country : null;
  const maxPriceParam = typeof params.maxPrice === "string" ? Number(params.maxPrice) : null;
  const maxPrice = Number.isFinite(maxPriceParam) && maxPriceParam > 0 ? maxPriceParam : null;
  const minPriceParam = typeof params.minPrice === "string" ? Number(params.minPrice) : null;
  const minPrice = Number.isFinite(minPriceParam) && minPriceParam > 0 ? minPriceParam : null;
  const [{ deals, error }, hubCounts] = await Promise.all([
    fetchBestFinds({ limit: 10, graded: type === "graded", maxPrice, minPrice, country }),
    fetchHubCounts({ language: "english" }),
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
          <h1 className="mt-3 text-2xl font-bold text-black dark:text-zinc-50">
            Top 10 {type === "graded" ? "graded" : "raw"} deals right now
          </h1>
          <p className="mt-2 max-w-xl text-sm text-zinc-600 dark:text-zinc-400">
            Higher-value cards with the biggest real discounts below market price, ranked highest
            discount first. Each stays on this list until a better deal replaces it.
          </p>

          <TypeToggle params={params} type={type} />

          <div className="mt-6 flex flex-col gap-4 border-t border-zinc-200 pt-5 dark:border-zinc-800">
            <CountryFilterRow params={params} country={country} basePath="/best-finds" />
            <PriceFilterRow params={params} maxPrice={maxPrice} minPrice={minPrice} basePath="/best-finds" />
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl flex-1 px-6 py-10">
        {error && (
          <p className="rounded-lg bg-red-50 p-4 text-red-700">Couldn&apos;t load deals: {error.message}</p>
        )}

        {!error && deals.length === 0 && (
          <p className="text-zinc-500">
            No standout {type} deals right now - check back after the next scheduled scan, or browse{" "}
            <Link href="/" className="underline">
              all deals
            </Link>
            .
          </p>
        )}

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {deals.map((deal, i) => (
            <DealCard key={deal.id} deal={deal} rank={i + 1} hub={hubCounts[deal.watchlist_id]} pageName="best_finds" />
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
