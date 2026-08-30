import { fetchSealedDealsPool, fetchSealedCatalog, fetchLastScanTime } from "@/lib/deals";
import { dealScore } from "@/lib/dealScore";
import { timeAgo } from "@/lib/time";
import { SEALED_PRODUCT_TYPES } from "@/lib/sealedCatalog";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import SealedDealCard from "@/components/SealedDealCard";
import SealedProductBrowser from "@/components/SealedProductBrowser";
import JsonLd from "@/components/JsonLd";
import { breadcrumbList, collectionPage } from "@/lib/jsonLd";

export const revalidate = 300;

export async function generateMetadata() {
  const title = "Sealed Pokemon Products — Deals & Prices";
  const description =
    "Every sealed Pokemon product — booster boxes, elite trainer boxes, bundles, blisters, tins — browsable by set and type, with real below-market eBay deals surfaced and PokemonPriceTracker reference prices for the rest.";
  return {
    title,
    description,
    alternates: { canonical: "/sealed-deals" },
    openGraph: { title, description, url: "https://pokemondealfinder.com/sealed-deals" },
    twitter: { card: "summary", title, description },
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

export default async function SealedDealsPage() {
  const [{ data: pool, error: poolError }, catalog, lastRefreshed] = await Promise.all([
    fetchSealedDealsPool({}),
    fetchSealedCatalog({ language: "english" }),
    fetchLastScanTime({ table: "sealed_deals" }),
  ]);

  // Live-deal strip: a handful of current below-market listings, deduped
  // to one per product (the same rotation the page has always led with).
  const seen = new Set();
  const liveDeals = [];
  for (const deal of pool ?? []) {
    if (seen.has(deal.sealed_watchlist_id)) continue;
    seen.add(deal.sealed_watchlist_id);
    liveDeals.push(deal);
  }
  const featuredDeals = shuffled(liveDeals.slice(0, 60)).slice(0, 8);

  // Product types actually present in the catalogue, in canonical order.
  const typesPresent = new Set();
  for (const g of catalog.groups) for (const p of g.products) if (p.productType) typesPresent.add(p.productType);
  const types = SEALED_PRODUCT_TYPES.filter((t) => typesPresent.has(t));

  return (
    <div className="flex min-h-screen flex-col bg-paper">
      <JsonLd
        data={[
          breadcrumbList([{ name: "Deals", href: "/" }, { name: "Sealed products" }]),
          collectionPage({
            name: "Sealed Pokemon Products",
            description:
              "Browse every sealed Pokemon product by set and type - booster boxes, ETBs, bundles, blisters, tins - with live below-market eBay deals surfaced.",
            url: "/sealed-deals",
          }),
        ]}
      />
      <SiteHeader />

      <header className="border-b border-zinc-200 dark:border-zinc-800">
        <div className="mx-auto max-w-7xl px-6 py-10">
          <span className="inline-flex items-center gap-1.5 rounded-md bg-zinc-900 px-3 py-1 text-xs font-bold text-white dark:bg-white dark:text-black">
            📦 Sealed Product
          </span>
          <h1 className="mt-3 max-w-2xl text-3xl font-bold tracking-tight text-black dark:text-zinc-50 sm:text-4xl">
            Sealed Pokemon Products
          </h1>
          <p className="mt-3 max-w-xl text-base text-zinc-600 dark:text-zinc-400">
            Every booster box, elite trainer box, bundle, blister and tin we track — search or filter
            by set and type. Genuine below-market eBay deals are flagged in green; everything else
            shows its PokemonPriceTracker sealed reference price and a live eBay search.
          </p>

          {lastRefreshed && (
            <p className="mt-4 inline-flex items-center gap-2 text-sm text-zinc-500">
              <span className="h-2 w-2 rounded-full bg-red-500" />
              {isRecentlyRefreshed(lastRefreshed)
                ? `Deals last refreshed ${timeAgo(lastRefreshed)}`
                : "Deals checked once daily - refresh automatically"}
            </p>
          )}
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl flex-1 px-6 py-10">
        {(poolError || catalog.error) && (
          <p className="mb-6 rounded-lg bg-red-50 p-4 text-red-700">
            Couldn&apos;t load some data: {poolError || catalog.error}
          </p>
        )}

        {featuredDeals.length > 0 && (
          <section className="mb-12">
            <h2 className="mb-5 text-sm font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-500">
              Live sealed deals right now
            </h2>
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {featuredDeals.map((deal) => (
                <SealedDealCard key={deal.id} deal={deal} scoreBadge={dealScore(deal.discount_pct)} />
              ))}
            </div>
          </section>
        )}

        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-400">
          Browse every sealed product
        </h2>

        {catalog.groups.length > 0 ? (
          <SealedProductBrowser groups={catalog.groups} types={types} />
        ) : (
          <p className="text-zinc-500">
            The sealed-product catalogue is still syncing. Live deals above are unaffected — check
            back shortly for the full browsable list.
          </p>
        )}
      </main>

      <SiteFooter note="Listing-to-product matching is automated and not perfect - always double-check a listing's photos and description (and that it's genuinely factory sealed) before buying." />
    </div>
  );
}
