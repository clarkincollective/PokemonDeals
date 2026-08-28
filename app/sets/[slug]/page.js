import Link from "next/link";
import { notFound } from "next/navigation";
import { resolveSetSlug, fetchDealsPage } from "@/lib/deals";
import { dealScore } from "@/lib/dealScore";
import SiteHeader from "@/components/SiteHeader";
import DealCard from "@/components/DealCard";
import FilterBar from "@/components/FilterBar";
import Pagination from "@/components/Pagination";
import SiteFooter from "@/components/SiteFooter";

const SITE_URL = "https://pokemondealfinder.com";

export const revalidate = 900;

// Real category page targeting "<set name> deals" search intent, which
// nothing else on the site directly serves - the homepage only exposes
// sets via a query-param filter buried behind the main grid, not a real
// indexable URL per set. See lib/deals.js's fetchSets/resolveSetSlug for
// how the slug maps back to a real set value - no fabricated content,
// just a filtered view of the same real active deals.
export async function generateMetadata({ params, searchParams }) {
  const { slug } = await params;
  const sp = await searchParams;
  const resolved = await resolveSetSlug(slug);
  if (!resolved) return { title: "Set not found", robots: { index: false, follow: true } };

  const pageParam = typeof sp.page === "string" ? Number(sp.page) : 1;
  const page = Number.isInteger(pageParam) && pageParam > 1 ? pageParam : 1;
  const title = page > 1 ? `${resolved.set} Card Deals - Page ${page}` : `${resolved.set} Card Deals`;
  const description = `Real below-market ${resolved.set} Pokémon card deals on eBay, checked against real market pricing - ${resolved.count} active right now.`;
  const canonical = page > 1 ? `/sets/${slug}?page=${page}` : `/sets/${slug}`;

  // Real gap found live: without this, every set page fell back to the
  // root layout's generic site-wide preview when shared (wrong title,
  // wrong image, og:url pointing at the bare homepage) - same issue
  // fixed on /cards/[slug]. One cheap extra row (pageSize: 1) for a
  // representative image - a real listing from this set, not a
  // fabricated one.
  const { deals: sample } = await fetchDealsPage({
    table: "deals",
    language: "english",
    set: resolved.set,
    page: 1,
    pageSize: 1,
  });
  const image = sample[0]?.image_url;

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

export default async function SetDetailPage({ params, searchParams }) {
  const { slug } = await params;
  const sp = await searchParams;

  const resolved = await resolveSetSlug(slug);
  if (!resolved) notFound();

  const country = typeof sp.country === "string" ? sp.country : null;
  const cardType = typeof sp.type === "string" ? sp.type : null;
  const listingType = typeof sp.listing === "string" ? sp.listing : null;
  const maxPriceParam = typeof sp.maxPrice === "string" ? Number(sp.maxPrice) : null;
  const maxPrice = Number.isFinite(maxPriceParam) && maxPriceParam > 0 ? maxPriceParam : null;
  const minPriceParam = typeof sp.minPrice === "string" ? Number(sp.minPrice) : null;
  const minPrice = Number.isFinite(minPriceParam) && minPriceParam > 0 ? minPriceParam : null;
  const pageParam = typeof sp.page === "string" ? Number(sp.page) : 1;
  const page = Number.isInteger(pageParam) && pageParam > 1 ? pageParam : 1;

  const { deals, totalPages, error } = await fetchDealsPage({
    table: "deals",
    language: "english",
    set: resolved.set,
    country,
    cardType,
    listingType,
    maxPrice,
    minPrice,
    page,
    // 20, not the other list pages' 24 - requested specifically for set
    // pages.
    pageSize: 20,
  });

  const basePath = `/sets/${slug}`;

  // Real gap found live: every other page type with a natural hierarchy
  // (deal detail, card hub) already has BreadcrumbList - this one didn't.
  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Deals", item: `${SITE_URL}/` },
      { "@type": "ListItem", position: 2, name: "Sets", item: `${SITE_URL}/sets` },
      { "@type": "ListItem", position: 3, name: resolved.set, item: `${SITE_URL}${basePath}` },
    ],
  };

  return (
    <div className="flex min-h-screen flex-col bg-zinc-50 dark:bg-black">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }} />
      <SiteHeader />

      <header className="border-b border-zinc-200 dark:border-zinc-800">
        <div className="mx-auto max-w-7xl px-6 py-10">
          {/* A real, visible button rather than a small muted text link -
              this is the way back to pick the next set to browse, so it
              needs to be easy to spot, not just technically present. */}
          <Link
            href="/sets"
            className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-300 bg-white px-3.5 py-2 text-sm font-semibold text-black transition-colors hover:border-zinc-400 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50 dark:hover:bg-zinc-800"
          >
            ← Back to Sets
          </Link>
          <h1 className="mt-3 max-w-2xl text-3xl font-bold tracking-tight text-black dark:text-zinc-50 sm:text-4xl">
            {resolved.set} Deals
          </h1>
          <p className="mt-3 max-w-xl text-base text-zinc-600 dark:text-zinc-400">
            Real below-market {resolved.set} listings on eBay, checked against real market pricing and
            real sold-listing data.
          </p>

          <div className="mt-8 border-t border-zinc-200 pt-6 dark:border-zinc-800">
            <FilterBar
              params={sp}
              country={country}
              cardType={cardType}
              listingType={listingType}
              maxPrice={maxPrice}
              minPrice={minPrice}
              basePath={basePath}
            />
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl flex-1 px-6 py-10">
        <h2 className="mb-5 text-sm font-semibold uppercase tracking-wide text-zinc-400">
          {resolved.set} Deals{page > 1 ? ` - Page ${page}` : ""}
        </h2>

        {error && <p className="rounded-lg bg-red-50 p-4 text-red-700">Couldn&apos;t load deals: {error}</p>}

        {!error && deals.length === 0 && (
          <p className="text-zinc-500">
            No {resolved.set} deals match these filters right now. Try clearing a filter, or check back
            after the next scheduled scan.
          </p>
        )}

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {deals.map((deal) => (
            <DealCard key={deal.id} deal={deal} scoreBadge={dealScore(deal.discount_pct)} pageName="set_detail" />
          ))}
        </div>

        <Pagination page={page} totalPages={totalPages} params={sp} basePath={basePath} />

        <div className="mt-8 flex justify-center">
          <Link
            href="/sets"
            className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-300 bg-white px-3.5 py-2 text-sm font-semibold text-black transition-colors hover:border-zinc-400 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50 dark:hover:bg-zinc-800"
          >
            ← Back to Sets
          </Link>
        </div>
      </main>

      <SiteFooter note="Card-to-listing matching is automated and not perfect - always double-check a listing's photos and description before buying." />
    </div>
  );
}
