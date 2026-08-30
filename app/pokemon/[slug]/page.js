import Link from "next/link";
import { notFound } from "next/navigation";
import {
  resolveSpeciesSlug,
  fetchSpeciesDealsPage,
  fetchSpeciesPrints,
  fetchSpeciesCatalog,
  fetchCardHubs,
} from "@/lib/deals";
import { speciesForSlug } from "@/lib/pokemonSpecies";
import { slugifySet } from "@/lib/slugify";
import SiteHeader from "@/components/SiteHeader";
import RegionRedirect from "@/components/RegionRedirect";
import DealGrid from "@/components/DealGrid";
import Breadcrumbs from "@/components/Breadcrumbs";
import SpeciesCatalog from "@/components/SpeciesCatalog";
import SpeciesCardList from "@/components/SpeciesCardList";
import SiteFooter from "@/components/SiteFooter";

const SITE_URL = "https://pokemondealfinder.com";

export const revalidate = 900;

// Page 1 renders server-side; pagination + filters are client-side (see
// <DealGrid> / /api/deals-page), so this route reads no request-time APIs
// and, with an empty generateStaticParams, is ISR-cacheable at the edge.
export async function generateStaticParams() {
  return [];
}

// Phase 5 - species entity page. Aggregates every active deal for one
// Pokemon across all its prints/sets - the "<pokemon> pokemon card" /
// "<pokemon> ex deals" search intent that /cards/[slug] (one exact print)
// and /sets/[slug] (one set) don't serve. See lib/deals.js's
// fetchSpeciesHubs for how the species list and its SPECIES_MIN_LISTINGS
// indexability threshold are derived - no fabricated content, just a
// species-scoped view of the same real active deals, plus a real index
// of that species' prints linking to their /cards/[slug] hubs.
export async function generateMetadata({ params }) {
  const { slug } = await params;
  const resolved = await resolveSpeciesSlug(slug);
  if (!resolved) {
    // No active deal for this species - if it's still a real dex species,
    // it gets the catalogue + eBay-search fallback page (noindex,follow);
    // only a slug that isn't a species at all is a genuine 404.
    const speciesName = speciesForSlug(slug);
    if (speciesName) {
      const t = `${speciesName} Pokemon Cards`;
      return {
        title: t,
        description: `${speciesName} Pokemon card catalogue and market prices, plus a live eBay search. No active below-market ${speciesName} deal right now.`,
        alternates: { canonical: `/pokemon/${slug}` },
        robots: { index: false, follow: true },
        openGraph: { title: t, description: `Browse ${speciesName} Pokemon cards and prices.`, url: `${SITE_URL}/pokemon/${slug}` },
        twitter: { card: "summary", title: t, description: `Browse ${speciesName} Pokemon cards and prices.` },
      };
    }
    return { title: "Pokemon not found", robots: { index: false, follow: true } };
  }

  const title = `${resolved.name} — Pokemon Card Prices & Deals`;
  const setsPhrase = resolved.setCount === 1 ? "1 set" : `${resolved.setCount} sets`;
  const description = `${resolved.count} active ${resolved.name} Pokemon card listings on eBay right now, across ${setsPhrase} — compared against real market pricing, cheapest first.`;
  const canonical = `/pokemon/${slug}`;

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

export default async function PokemonSpeciesPage({ params }) {
  const { slug } = await params;

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
    // Real dex species with no active deal -> catalogue + eBay-search
    // fallback (noindex). Not a species at all -> 404.
    const speciesName = speciesForSlug(slug);
    if (!speciesName) notFound();
    const { cards } = await fetchSpeciesCatalog(speciesName);
    return <SpeciesCatalog speciesName={speciesName} slug={slug} cards={cards} />;
  }

  const [{ deals, totalPages, error }, { prints }, { cards: allCards }] =
    await Promise.all([
      fetchSpeciesDealsPage({
        speciesName: resolved.name,
        language: "english",
        sort: "newest",
        page: 1,
        pageSize: 20,
      }),
      fetchSpeciesPrints(resolved.name),
      fetchSpeciesCatalog(resolved.name),
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

  // Home → Pokemon → <Species>. Position 1 is "Deals" → "/" to match the
  // existing BreadcrumbList on /cards/[slug], /sets/[slug] and /deals/[id].
  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Deals", item: `${SITE_URL}/` },
      { "@type": "ListItem", position: 2, name: "Pokemon", item: `${SITE_URL}/pokemon` },
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
          name: `${resolved.name} Pokemon card prints with active deals`,
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
      <RegionRedirect />

      <header className="border-b border-zinc-200 dark:border-zinc-800">
        <div className="mx-auto max-w-7xl px-6 py-10">
          <Breadcrumbs
            items={[
              { name: "Deals", href: "/" },
              { name: "Pokemon", href: "/pokemon" },
              { name: resolved.name },
            ]}
          />
          <Link
            href="/pokemon"
            className="mt-4 inline-flex items-center gap-1.5 rounded-lg border border-zinc-300 bg-white px-3.5 py-2 text-sm font-semibold text-black transition-colors hover:border-zinc-400 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50 dark:hover:bg-zinc-800"
          >
            ← Back to Pokemon
          </Link>
          <h1 className="mt-3 max-w-2xl text-3xl font-bold tracking-tight text-black dark:text-zinc-50 sm:text-4xl">
            {resolved.name} — Pokemon Card Prices &amp; Deals
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
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl flex-1 px-6 py-10">
        <h2 id="deals" className="mb-5 scroll-mt-24 text-sm font-semibold uppercase tracking-wide text-zinc-400">
          {resolved.name} Deals
        </h2>

        {error && <p className="rounded-lg bg-red-50 p-4 text-red-700">Couldn&apos;t load deals: {error}</p>}

        <DealGrid
          kind="species"
          slug={slug}
          basePath={basePath}
          initial={{ deals, totalPages }}
          hubCounts={hubCounts}
          emptyLabel={`No ${resolved.name} deals match these filters right now. Try clearing a filter, or check back after the next scheduled scan.`}
        />

        {allCards.length > 0 && (
          <section className="mt-12 border-t border-zinc-200 pt-8 dark:border-zinc-800">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-400">
              Every {resolved.name} card ({allCards.length})
            </h2>
            <p className="mt-1 text-xs text-zinc-400">
              Deals first (green), then the rest of the catalogue with its reference price and a live
              eBay search. Reference prices from PokemonPriceTracker&apos;s recent sold data — not a
              guaranteed value.
            </p>
            <SpeciesCardList speciesName={resolved.name} cards={allCards} dealsHref="#deals" />
          </section>
        )}

        <div className="mt-8 flex justify-center">
          <Link
            href="/pokemon"
            className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-300 bg-white px-3.5 py-2 text-sm font-semibold text-black transition-colors hover:border-zinc-400 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50 dark:hover:bg-zinc-800"
          >
            ← Back to Pokemon
          </Link>
        </div>
      </main>

      <SiteFooter note="Card-to-listing matching is automated and not perfect - always double-check a listing's photos and description before buying." />
    </div>
  );
}
