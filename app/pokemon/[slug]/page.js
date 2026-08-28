import Link from "next/link";
import { notFound } from "next/navigation";
import {
  resolveSpeciesSlug,
  fetchSpeciesDealsPage,
  fetchSpeciesPrints,
  fetchCardHubs,
} from "@/lib/deals";
import { slugifySet } from "@/lib/slugify";
import SiteHeader from "@/components/SiteHeader";
import RegionRedirect from "@/components/RegionRedirect";
import { detectedMarketplace } from "@/lib/geo";
import DealCard from "@/components/DealCard";
import FilterBar from "@/components/FilterBar";
import Pagination from "@/components/Pagination";
import Breadcrumbs from "@/components/Breadcrumbs";
import SiteFooter from "@/components/SiteFooter";

const SITE_URL = "https://pokemondealfinder.com";

export const revalidate = 900;

// Phase 5 - species entity page. Aggregates every active deal for one
// Pokemon across all its prints/sets - the "<pokemon> pokemon card" /
// "<pokemon> ex deals" search intent that /cards/[slug] (one exact print)
// and /sets/[slug] (one set) don't serve. See lib/deals.js's
// fetchSpeciesHubs for how the species list and its SPECIES_MIN_LISTINGS
// indexability threshold are derived - no fabricated content, just a
// species-scoped view of the same real active deals, plus a real index
// of that species' prints linking to their /cards/[slug] hubs.
export async function generateMetadata({ params, searchParams }) {
  const { slug } = await params;
  const sp = await searchParams;
  const resolved = await resolveSpeciesSlug(slug);
  if (!resolved) return { title: "Pokémon not found", robots: { index: false, follow: true } };

  const pageParam = typeof sp.page === "string" ? Number(sp.page) : 1;
  const page = Number.isInteger(pageParam) && pageParam > 1 ? pageParam : 1;

  const base = `${resolved.name} — Pokémon Card Prices & Deals`;
  const title = page > 1 ? `${resolved.name} Card Deals — Page ${page}` : base;
  const setsPhrase = resolved.setCount === 1 ? "1 set" : `${resolved.setCount} sets`;
  const description = `${resolved.count} active ${resolved.name} Pokémon card listings on eBay right now, across ${setsPhrase} — compared against real market pricing, cheapest first.`;
  const canonical = page > 1 ? `/pokemon/${slug}?page=${page}` : `/pokemon/${slug}`;

  // Explicit openGraph/twitter blocks - same site-wide fix as
  // /cards/[slug] and /sets/[slug]: without them a shared species link
  // falls back to the root layout's generic homepage preview. Image is
  // the species' cheapest active listing (real data), already pulled by
  // fetchSpeciesHubs.
  const image = resolved.image;

  return {
    title,
    description,
    alternates: { canonical },
    openGraph: {
      title,
      description,
      url: `${SITE_URL}${canonical}`,
      images: image ? [image] : undefined,
    },
    twitter: {
      card: image ? "summary_large_image" : "summary",
      title,
      description,
      images: image ? [image] : undefined,
    },
  };
}

export default async function PokemonSpeciesPage({ params, searchParams }) {
  const { slug } = await params;
  const sp = await searchParams;
  const detectedRegion = await detectedMarketplace();

  // Kick off the card-hubs scan now so it runs concurrently with the
  // species-hubs scan below (resolveSpeciesSlug) instead of after it -
  // fetchSpeciesPrints needs it and would otherwise await it serially,
  // roughly doubling a cold render. Both are 900s-cached full scans of
  // the active `deals` table.
  const cardHubsWarm = fetchCardHubs({ language: "english" });

  const resolved = await resolveSpeciesSlug(slug);
  if (!resolved) {
    // don't leave the prefetch as an unhandled rejection
    cardHubsWarm.catch(() => {});
    notFound();
  }

  const country = typeof sp.country === "string" ? sp.country : null;
  const cardType = typeof sp.type === "string" ? sp.type : null;
  const listingType = typeof sp.listing === "string" ? sp.listing : null;
  const maxPriceParam = typeof sp.maxPrice === "string" ? Number(sp.maxPrice) : null;
  const maxPrice = Number.isFinite(maxPriceParam) && maxPriceParam > 0 ? maxPriceParam : null;
  const minPriceParam = typeof sp.minPrice === "string" ? Number(sp.minPrice) : null;
  const minPrice = Number.isFinite(minPriceParam) && minPriceParam > 0 ? minPriceParam : null;
  const sort = typeof sp.sort === "string" ? sp.sort : null;
  const pageParam = typeof sp.page === "string" ? Number(sp.page) : 1;
  const page = Number.isInteger(pageParam) && pageParam > 1 ? pageParam : 1;

  const [{ deals, totalPages, error }, { prints }] = await Promise.all([
    fetchSpeciesDealsPage({
      speciesName: resolved.name,
      language: "english",
      country,
      cardType,
      listingType,
      maxPrice,
      minPrice,
      sort: sort ?? "newest",
      page,
      pageSize: 20,
    }),
    fetchSpeciesPrints(resolved.name),
    cardHubsWarm,
  ]);

  // The "N sellers" line on each DealCard - derived from `prints` (which
  // already carries per-print hub slug + active count for this species)
  // rather than a separate full card-hubs scan.
  const hubCounts = Object.fromEntries(
    prints
      .filter((p) => p.hubSlug && p.count >= 2)
      .map((p) => [p.watchlistId, { count: p.count, slug: p.hubSlug }])
  );

  const basePath = `/pokemon/${slug}`;

  const priceRange =
    resolved.minPrice != null && resolved.maxPrice != null && resolved.maxPrice !== resolved.minPrice
      ? `$${Number(resolved.minPrice).toFixed(2)} – $${Number(resolved.maxPrice).toFixed(2)}`
      : resolved.minPrice != null
        ? `$${Number(resolved.minPrice).toFixed(2)}`
        : null;

  // Home → Pokémon → <Species>. Position 1 is "Deals" → "/" to match the
  // existing BreadcrumbList on /cards/[slug], /sets/[slug] and /deals/[id].
  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Deals", item: `${SITE_URL}/` },
      { "@type": "ListItem", position: 2, name: "Pokémon", item: `${SITE_URL}/pokemon` },
      { "@type": "ListItem", position: 3, name: resolved.name, item: `${SITE_URL}${basePath}` },
    ],
  };

  // ItemList of this species' real prints (not Product - a species spans
  // many differently-priced prints, so it isn't a single item). Points at
  // each print's /cards/[slug] hub, or its /sets/[slug] when the print has
  // no hub (fewer than 2 simultaneous listings).
  const itemListJsonLd =
    prints.length > 0
      ? {
          "@context": "https://schema.org",
          "@type": "ItemList",
          name: `${resolved.name} Pokémon card prints with active deals`,
          numberOfItems: prints.length,
          itemListElement: prints.map((p, i) => ({
            "@type": "ListItem",
            position: i + 1,
            name: `${p.name} (${p.set})`,
            url: p.hubSlug
              ? `${SITE_URL}/cards/${p.hubSlug}`
              : `${SITE_URL}/sets/${slugifySet(p.set)}`,
          })),
        }
      : null;

  return (
    <div className="flex min-h-screen flex-col bg-paper">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }} />
      {itemListJsonLd && (
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListJsonLd) }} />
      )}
      <SiteHeader />
      <RegionRedirect detected={detectedRegion} />

      <header className="border-b border-zinc-200 dark:border-zinc-800">
        <div className="mx-auto max-w-7xl px-6 py-10">
          <Breadcrumbs
            items={[
              { name: "Deals", href: "/" },
              { name: "Pokémon", href: "/pokemon" },
              { name: resolved.name },
            ]}
          />
          <Link
            href="/pokemon"
            className="mt-4 inline-flex items-center gap-1.5 rounded-lg border border-zinc-300 bg-white px-3.5 py-2 text-sm font-semibold text-black transition-colors hover:border-zinc-400 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50 dark:hover:bg-zinc-800"
          >
            ← Back to Pokémon
          </Link>
          <h1 className="mt-3 max-w-2xl text-3xl font-bold tracking-tight text-black dark:text-zinc-50 sm:text-4xl">
            {resolved.name} — Pokémon Card Prices &amp; Deals
          </h1>
          <p className="mt-3 max-w-xl text-base text-zinc-600 dark:text-zinc-400">
            Every real below-market {resolved.name} listing on eBay right now, across{" "}
            {resolved.printCount} {resolved.printCount === 1 ? "print" : "prints"} and{" "}
            {resolved.setCount} {resolved.setCount === 1 ? "set" : "sets"}, checked against real
            market pricing and real sold-listing data.
          </p>
          {priceRange && (
            <p className="mt-4 text-sm font-semibold text-zinc-500 dark:text-zinc-400">
              {resolved.count} active listings · {priceRange}
            </p>
          )}

          <div className="mt-8 border-t border-zinc-200 pt-6 dark:border-zinc-800">
            <FilterBar
              params={sp}
              country={country}
              cardType={cardType}
              listingType={listingType}
              maxPrice={maxPrice}
              minPrice={minPrice}
              sort={sort}
              basePath={basePath}
            />
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl flex-1 px-6 py-10">
        <h2 className="mb-5 text-sm font-semibold uppercase tracking-wide text-zinc-400">
          {resolved.name} Deals{page > 1 ? ` — Page ${page}` : ""}
        </h2>

        {error && <p className="rounded-lg bg-red-50 p-4 text-red-700">Couldn&apos;t load deals: {error}</p>}

        {!error && deals.length === 0 && (
          <p className="text-zinc-500">
            No {resolved.name} deals match these filters right now. Try clearing a filter, or check
            back after the next scheduled scan.
          </p>
        )}

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {deals.map((deal) => (
            <DealCard key={deal.id} deal={deal} hub={hubCounts[deal.watchlist_id]} pageName="species_detail" />
          ))}
        </div>

        <Pagination page={page} totalPages={totalPages} params={sp} basePath={basePath} />

        {prints.length > 0 && (
          <section className="mt-12 border-t border-zinc-200 pt-8 dark:border-zinc-800">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-400">
              Every {resolved.name} print with a live deal
            </h2>
            <p className="mt-1 text-xs text-zinc-400">
              Each exact print, most-listed first — open one to compare every current listing of it
              side by side.
            </p>
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {prints.map((p) => (
                <Link
                  key={p.watchlistId}
                  href={p.hubSlug ? `/cards/${p.hubSlug}` : `/sets/${slugifySet(p.set)}`}
                  className="flex items-center justify-between gap-3 rounded-lg border border-zinc-200 bg-white px-4 py-3 text-sm transition-colors hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-950 dark:hover:border-zinc-700"
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium text-black dark:text-zinc-50">{p.name}</span>
                    <span className="block truncate text-xs text-zinc-500 dark:text-zinc-400">{p.set}</span>
                  </span>
                  <span className="shrink-0 rounded-md bg-zinc-100 px-2 py-0.5 text-xs font-semibold text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                    {p.count}
                  </span>
                </Link>
              ))}
            </div>
          </section>
        )}

        <div className="mt-8 flex justify-center">
          <Link
            href="/pokemon"
            className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-300 bg-white px-3.5 py-2 text-sm font-semibold text-black transition-colors hover:border-zinc-400 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50 dark:hover:bg-zinc-800"
          >
            ← Back to Pokémon
          </Link>
        </div>
      </main>

      <SiteFooter note="Card-to-listing matching is automated and not perfect - always double-check a listing's photos and description before buying." />
    </div>
  );
}
