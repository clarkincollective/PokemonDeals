import SkipToContent from "@/components/SkipToContent";
import { fetchSealedDealsPool, fetchSealedCatalog, fetchLastScanTime, slimSealedProduct } from "@/lib/deals";

// the sets SealedProductBrowser opens by default; only these ship products
const INITIAL_OPEN_SETS = 6;
import { dealScore } from "@/lib/dealScore";
import { timeAgo } from "@/lib/time";
import { SEALED_PRODUCT_TYPES } from "@/lib/sealedCatalog";
import { setImage } from "@/lib/setImages";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import SealedDealCard from "@/components/SealedDealCard";
import SealedProductBrowser from "@/components/SealedProductBrowser";
import JsonLd from "@/components/JsonLd";
import { breadcrumbList, collectionPage } from "@/lib/jsonLd";

export const revalidate = 600;

export async function generateMetadata() {
  const title = "Sealed Pokemon Products — Deals & Prices";
  const description =
    "Tracked sealed Pokemon products — booster boxes, elite trainer boxes, bundles, blisters, tins — browsable by set and type, with real below-market eBay deals surfaced and PokemonPriceTracker reference prices for the rest.";
  return {
    title,
    description,
    alternates: { canonical: "/sealed-deals" },
    openGraph: { title, description, url: "https://pokemondealfinder.com/sealed-deals" },
    twitter: { card: "summary", title, description },
  };
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

  // Attach the pokemontcg.io set logo (same assets as /sets) to each
  // group; null when that set has no catalogued logo -> text-only header.
  // audit-r1 (page-weight): only the sets the browser opens by default carry
  // their products in the page (slimmed to the tile's fields); every other
  // set is a header with counts, and the browser loads its products from
  // /api/sealed-catalog when it is opened or when a filter is applied.
  // Before: all 2,344 products travelled as client props (1.8 MB).
  const groupsWithLogos = catalog.groups.map((g, i) => ({
    set: g.set,
    slug: g.slug,
    logo: setImage(g.set)?.logo ?? null,
    dealCount: g.dealCount,
    productCount: g.products.length,
    products: i < INITIAL_OPEN_SETS ? g.products.map(slimSealedProduct) : null,
  }));
  const catalogTotals = { products: catalog.productCount, deals: catalog.dealCount };

  return (
    <div className="flex min-h-screen flex-col bg-paper">
      <JsonLd
        data={[
          breadcrumbList([{ name: "Deals", href: "/" }, { name: "Sealed products" }]),
          collectionPage({
            name: "Sealed Pokemon Products",
            description:
              "Browse tracked sealed Pokemon products by set and type - booster boxes, ETBs, bundles, blisters, tins - with live below-market eBay deals surfaced.",
            url: "/sealed-deals",
          }),
        ]}
      />
      <SkipToContent />
      <SiteHeader />

      <header className="border-b border-zinc-200 dark:border-zinc-800">
        <div className="mx-auto max-w-7xl px-6 py-6 sm:py-8">
          <span className="inline-flex items-center gap-1.5 rounded-md bg-zinc-900 px-3 py-1 text-xs font-bold text-white dark:bg-white dark:text-black">
            📦 Sealed Product
          </span>
          <h1 className="mt-3 max-w-2xl text-3xl font-bold tracking-tight text-black dark:text-zinc-50 sm:text-4xl">
            Sealed Pokemon Products
          </h1>
          <p className="mt-3 max-w-xl text-base text-zinc-600 dark:text-zinc-400">
            Compare qualifying sealed deals, or browse boxes, packs and tins by set and type.
            Match the exact product and edition before buying.
          </p>

          {lastRefreshed && (
            <p className="mt-4 inline-flex items-center gap-2 text-sm text-zinc-500">
              <span className="h-2 w-2 rounded-full bg-red-500" />
              {`Deals last refreshed ${timeAgo(lastRefreshed)}`}
            </p>
          )}
        </div>
      </header>

      <main id="main-content" tabIndex={-1} className="scroll-mt-6 mx-auto w-full max-w-7xl flex-1 px-6 py-6 sm:py-8">
        {(poolError || catalog.error) && (
          <p className="mb-6 rounded-lg bg-danger/10 p-4 text-danger">
            Couldn&apos;t load some data: {poolError || catalog.error}
          </p>
        )}

        {/* finding 4: a rotation of UNRELATED products. When a reader
            arrives with an exact product selected, SealedProductBrowser
            hides this strip for the duration, so the selected product's own
            offer is never read as part of an unrelated featured feed. */}
        {featuredDeals.length > 0 && (
          <section className="mb-12" data-featured-sealed-strip>
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

        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-600 dark:text-zinc-400">
          Browse every sealed product
        </h2>
        <p className="mb-4 max-w-2xl text-sm text-zinc-600 dark:text-zinc-400">
          Every booster box, elite trainer box, bundle, blister and tin we track — search or filter
          by set and type. Qualifying below-market eBay deals are flagged in green; other products
          show their available PokemonPriceTracker sealed reference and an eBay search.
        </p>

        {catalog.groups.length > 0 ? (
          <SealedProductBrowser groups={groupsWithLogos} types={types} totals={catalogTotals} />
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
