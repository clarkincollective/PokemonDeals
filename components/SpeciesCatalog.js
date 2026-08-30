import Link from "next/link";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import Breadcrumbs from "@/components/Breadcrumbs";
import AffiliateLink from "@/components/AffiliateLink";
import { buildEbaySearchLink } from "@/lib/ebay";

const SITE_URL = "https://pokemondealfinder.com";

// The /pokemon/<slug> page a species gets when it has NO active
// below-market deal right now: the catalogue we track for it (real
// PokemonPriceTracker market prices) plus an affiliate-wrapped live eBay
// search. Deliberately noindex,follow (set by the route's
// generateMetadata) - it's a useful browse/redirect surface for a
// visitor, not a page that should rank; a species only earns an
// indexable /pokemon page once it clears SPECIES_MIN_LISTINGS.
export default function SpeciesCatalog({ speciesName, slug, cards }) {
  const ebayHref = buildEbaySearchLink(`${speciesName} Pokemon card`);

  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Deals", item: `${SITE_URL}/` },
      { "@type": "ListItem", position: 2, name: "Pokemon", item: `${SITE_URL}/pokemon` },
      { "@type": "ListItem", position: 3, name: speciesName, item: `${SITE_URL}/pokemon/${slug}` },
    ],
  };

  return (
    <div className="flex min-h-screen flex-col bg-paper">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }} />
      <SiteHeader />

      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-10">
        <Breadcrumbs
          items={[
            { name: "Deals", href: "/" },
            { name: "Pokemon", href: "/pokemon" },
            { name: speciesName },
          ]}
        />

        <h1 className="mt-4 text-3xl font-bold tracking-tight text-black dark:text-zinc-50">
          {speciesName} Pokemon Cards
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
          No active below-market {speciesName} deal on eBay right now. Below is the {speciesName}{" "}
          catalogue we track, with its latest market price, plus a live eBay search you can run
          yourself.
        </p>

        <AffiliateLink
          href={ebayHref}
          eventName="eBay Click"
          eventData={{ species: speciesName, page: "species_catalog" }}
          className="mt-5 inline-flex items-center gap-1.5 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-600 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-red-600 dark:hover:text-white"
        >
          Search {speciesName} on eBay →
        </AffiliateLink>

        {cards.length > 0 ? (
          <>
            <h2 className="mt-10 text-sm font-semibold uppercase tracking-wide text-zinc-400">
              {speciesName} cards we track ({cards.length})
            </h2>
            <ul className="mt-3 divide-y divide-zinc-100 dark:divide-zinc-900">
              {cards.map((c) => (
                <li key={`${c.name}|${c.set}`} className="flex items-center justify-between gap-4 py-2.5 text-sm">
                  <div className="min-w-0">
                    {c.hubSlug ? (
                      <Link
                        href={`/cards/${c.hubSlug}`}
                        className="font-medium text-black hover:text-red-600 hover:underline dark:text-zinc-50 dark:hover:text-red-500"
                      >
                        {c.name}
                      </Link>
                    ) : (
                      <AffiliateLink
                        href={buildEbaySearchLink(`${c.name} ${c.set}`)}
                        eventName="eBay Click"
                        eventData={{ species: speciesName, card: c.name, page: "species_catalog" }}
                        className="font-medium text-black hover:text-red-600 hover:underline dark:text-zinc-50 dark:hover:text-red-500"
                      >
                        {c.name}
                      </AffiliateLink>
                    )}
                    <span className="block truncate text-xs text-zinc-400">{c.set}</span>
                  </div>
                  <div className="shrink-0 text-right">
                    {c.price != null && (
                      <span className="tnum font-semibold text-black dark:text-zinc-50">
                        ${c.price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                    )}
                    <span className="block text-[11px] text-zinc-400">
                      {c.hubSlug ? "compare listings" : "market price"}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-zinc-400">
              Market prices from PokemonPriceTracker, based on recent sold data.{" "}
              <Link href="/methodology" className="hover:text-red-600 hover:underline dark:hover:text-red-500">
                How we price this
              </Link>
              .
            </p>
          </>
        ) : (
          <p className="mt-8 text-sm text-zinc-500 dark:text-zinc-400">
            We don&apos;t track any priced {speciesName} cards yet - use the eBay search above to
            browse current listings directly.
          </p>
        )}

        <div className="mt-10">
          <Link
            href="/pokemon"
            className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-300 bg-white px-3.5 py-2 text-sm font-semibold text-black transition-colors hover:border-zinc-400 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50 dark:hover:bg-zinc-800"
          >
            ← All Pokemon
          </Link>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
