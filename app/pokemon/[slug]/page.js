import Link from "next/link";
import { notFound } from "next/navigation";
import {
  resolveSpeciesSlug,
  fetchSpeciesDealsPage,
  fetchSpeciesPrints,
  fetchSpeciesCatalog,
  fetchCardHubs,
  fetchSetSlugs,
} from "@/lib/deals";
import { speciesForSlug } from "@/lib/pokemonSpecies";
import { slugifySet } from "@/lib/slugify";
import SiteHeader from "@/components/SiteHeader";
import RegionRedirect from "@/components/RegionRedirect";
import DealGrid from "@/components/DealGrid";
import Breadcrumbs from "@/components/Breadcrumbs";
import SpeciesCatalog from "@/components/SpeciesCatalog";
import SpeciesCardsBySet, { buildCatalogueItems } from "@/components/SpeciesCardsBySet";
import FeaturedValueCards from "@/components/FeaturedValueCards";
import SpeciesFactStrip from "@/components/SpeciesFactStrip";
import SpeciesPriceSummary from "@/components/SpeciesPriceSummary";
import SpeciesBySet from "@/components/SpeciesBySet";
import SpeciesQuickAnswers from "@/components/SpeciesQuickAnswers";
import ShoppingContext, { RegionSuffix } from "@/components/ShoppingContext";
import SiteFooter from "@/components/SiteFooter";
import { hasPrice } from "@/lib/money";
import { cardTier } from "@/lib/catalogueView";
import { speciesPriceSnapshot, speciesBySet } from "@/lib/speciesSummary";

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
      // P1: a species with enough real, priced, imaged catalog cards gets
      // a durable indexable "prices & values" hub; a thinner one keeps the
      // lean noindex fallback.
      const { stats, indexable } = await fetchSpeciesCatalog(speciesName);
      const canonical = `/pokemon/${slug}`;
      if (indexable && stats) {
        // Stable, species-specific - no volatile price range in the
        // description (it moves with the market + every catalogue sync).
        // The visible page carries the real counts and range.
        const t = `${speciesName} Card Prices & Value`;
        const description = `Every ${speciesName} Pokemon card we track, with real recent-sold market references grouped by set. Compare ${speciesName} card prices and values across sets and printings.`;
        return {
          title: t,
          description,
          alternates: { canonical },
          openGraph: { title: t, description, url: `${SITE_URL}${canonical}`, type: "website" },
          twitter: { card: "summary", title: t, description },
        };
      }
      const t = `${speciesName} Pokemon Cards`;
      return {
        title: t,
        description: `${speciesName} Pokemon card catalogue and market prices, plus a live eBay search. No active below-market ${speciesName} deal right now.`,
        alternates: { canonical },
        robots: { index: false, follow: true },
        openGraph: { title: t, description: `Browse ${speciesName} Pokemon cards and prices.`, url: `${SITE_URL}${canonical}` },
        twitter: { card: "summary", title: t, description: `Browse ${speciesName} Pokemon cards and prices.` },
      };
    }
    return { title: "Pokemon not found", robots: { index: false, follow: true } };
  }

  // Stable, species-specific metadata - no volatile live-listing count or
  // price range (those churn every scan / sync). Counts and ranges live
  // in the visible page body instead.
  const title = `${resolved.name} Card Prices & Deals`;
  const description = `Every ${resolved.name} Pokemon card we track, with real recent-sold market references by set, plus current eBay listings we've identified below market. Compare ${resolved.name} card prices, values and deals.`;
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
    const [{ cards, stats, indexable }, validSetSlugs] = await Promise.all([
      fetchSpeciesCatalog(speciesName),
      fetchSetSlugs("english"),
    ]);
    return (
      <SpeciesCatalog
        speciesName={speciesName}
        slug={slug}
        cards={cards}
        stats={stats}
        indexable={indexable}
        validSetSlugs={validSetSlugs}
      />
    );
  }

  const [{ deals, totalPages, error }, { prints }, { cards: allCards }, validSetSlugs] =
    await Promise.all([
      fetchSpeciesDealsPage({
        speciesName: resolved.name,
        language: "english",
        // Best-deals section: biggest genuine savings first (verified-only
        // via the deal-quality gate), not just newest.
        sort: "discount",
        page: 1,
        pageSize: 8,
      }),
      fetchSpeciesPrints(resolved.name),
      fetchSpeciesCatalog(resolved.name),
      fetchSetSlugs("english"),
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

  // Species-level price snapshot + by-set coverage, computed once from the
  // catalogue cards we already have in hand (no extra query). Shared by
  // the price summary, the by-set table and the quick-answers block.
  const priceSnapshot = speciesPriceSnapshot(allCards);
  const bySetRows = speciesBySet(allCards, validSetSlugs);

  // Discovery shortcut: the highest recent-sold-value cards we track for
  // this species, ranked ONLY by trustworthy reference price - never by
  // anything we'd earn on. Standard collectible cards fill these prime
  // slots first; Jumbo / oversized / WCD specialty cards only appear here
  // if there aren't 12 standard priced cards. Live-deal cards and
  // price-unavailable cards are excluded.
  const featuredItems = buildCatalogueItems(
    [...allCards]
      .filter((c) => !c.deal && hasPrice(c.refPrice))
      .sort((a, b) => cardTier(a) - cardTier(b) || Number(b.refPrice) - Number(a.refPrice))
      .slice(0, 12),
    validSetSlugs
  );

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
            // its own hub if it has one; else the set page if that exists;
            // else this species page (which lists the print) - never a
            // /sets/<slug> that 404s.
            url: p.hubSlug
              ? `${SITE_URL}/cards/${p.hubSlug}`
              : validSetSlugs.includes(slugifySet(p.set))
                ? `${SITE_URL}/sets/${slugifySet(p.set)}`
                : `${SITE_URL}${basePath}`,
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
            {resolved.name} Card Prices &amp; Deals
          </h1>
          <p className="mt-3 max-w-xl text-base text-zinc-600 dark:text-zinc-400">
            Browse every {resolved.name} card we track across {resolved.setCount}{" "}
            {resolved.setCount === 1 ? "set" : "sets"}, compare current market references, and check the
            qualifying below-market eBay listings identified below.
          </p>
          <SpeciesFactStrip speciesName={resolved.name} />
          <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1.5">
            <p className="text-sm font-semibold text-zinc-500 dark:text-zinc-400">
              {allCards.length} cards · {resolved.setCount}{" "}
              {resolved.setCount === 1 ? "set" : "sets"}
              {deals.length > 0 ? ` · ${resolved.count} live listing${resolved.count === 1 ? "" : "s"}` : ""}
            </p>
            <ShoppingContext />
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl flex-1 px-6 py-10">
        {/* SECTION 2 - best verified deals (biggest genuine savings first) */}
        <section>
          <h2 id="deals" className="mb-1 scroll-mt-24 text-lg font-bold text-black dark:text-zinc-50">
            Best {resolved.name} deals
            <RegionSuffix />
          </h2>
          <p className="mb-5 text-sm text-zinc-500 dark:text-zinc-400">
            Live eBay listings below their real market value — condition, language and variant checked.
          </p>

          {error && <p className="rounded-lg bg-red-50 p-4 text-red-700">Couldn&apos;t load deals: {error}</p>}

          {deals.length === 0 && !error ? (
            <p className="rounded-lg border border-zinc-200 bg-white p-4 text-sm text-zinc-500 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-400">
              No verified below-market {resolved.name} deal right now. Browse the full catalogue below,
              or use a card&apos;s <span className="font-semibold">Find on eBay</span> button.
            </p>
          ) : (
            <DealGrid
              kind="species"
              slug={slug}
              basePath={basePath}
              initial={{ deals, totalPages }}
              hubCounts={hubCounts}
              defaultSort="discount"
              emptyLabel={`No ${resolved.name} deals match these filters right now. Try clearing a filter, or check back after the next scheduled scan.`}
              validSetSlugs={validSetSlugs}
            />
          )}
        </section>

        {/* Species-level price snapshot (real catalogue references, never
            a single "the Pokemon is worth $X"). */}
        <div className="mt-12 border-t border-zinc-200 pt-8 dark:border-zinc-800">
          <SpeciesPriceSummary speciesName={resolved.name} snapshot={priceSnapshot} />
        </div>

        {/* Most valuable cards - ranked purely by trustworthy market
            reference; specialty (Jumbo / WCD) demoted (cardTier). */}
        {featuredItems.length >= 4 && (
          <section className="mt-12 border-t border-zinc-200 pt-8 dark:border-zinc-800">
            <h2 className="text-lg font-bold text-black dark:text-zinc-50">
              Most valuable {resolved.name} cards we track
            </h2>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              The highest market references currently in our catalogue — not an all-time ranking. Open
              a card for full pricing, graded values and any live deal.
            </p>
            <FeaturedValueCards speciesName={resolved.name} items={featuredItems} />
          </section>
        )}

        {/* By-set coverage summary (compact, above the full grid). */}
        <SpeciesBySet speciesName={resolved.name} rows={bySetRows} />

        {/* SECTION 5 - the complete catalogue, by set, with search + progressive disclosure */}
        {allCards.length > 0 && (
          <section className="mt-14 border-t border-zinc-200 pt-8 dark:border-zinc-800">
            <h2 className="text-lg font-bold text-black dark:text-zinc-50">
              Every {resolved.name} card, by set ({allCards.length})
            </h2>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              Search, filter or sort — or browse by set. Market prices are recent-sold references, not
              guaranteed values.
            </p>
            <SpeciesCardsBySet
              speciesName={resolved.name}
              cards={allCards}
              validSetSlugs={validSetSlugs}
            />
          </section>
        )}

        <SpeciesQuickAnswers
          speciesName={resolved.name}
          snapshot={priceSnapshot}
          setRows={bySetRows}
          hasDeals={deals.length > 0}
        />

        <div className="mt-10 flex justify-center">
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
