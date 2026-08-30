import Link from "next/link";
import { notFound } from "next/navigation";
import { resolveSetSlug, fetchDealsPage, fetchHubCounts } from "@/lib/deals";
import SiteHeader from "@/components/SiteHeader";
import RegionRedirect from "@/components/RegionRedirect";
import DealGrid from "@/components/DealGrid";
import Breadcrumbs from "@/components/Breadcrumbs";
import SiteFooter from "@/components/SiteFooter";

const SITE_URL = "https://pokemondealfinder.com";

export const revalidate = 900;

// No request-time APIs on this route (page 1 is what renders server-side;
// pagination + filters are client-side via <DealGrid> / /api/deals-page),
// so this + an empty generateStaticParams makes it ISR-cacheable at the
// edge instead of a full render per crawler hit.
export async function generateStaticParams() {
  return [];
}

// Real category page targeting "<set name> deals / card values" search
// intent. See lib/deals.js's fetchSets/resolveSetSlug for how the slug
// maps back to a real set value - no fabricated content, just the real
// active deals for that set.
export async function generateMetadata({ params }) {
  const { slug } = await params;
  const resolved = await resolveSetSlug(slug);
  if (!resolved) return { title: "Set not found", robots: { index: false, follow: true } };

  const title = `${resolved.set} Card Deals`;
  const description = `Real below-market ${resolved.set} Pokemon card deals on eBay, checked against real market pricing - ${resolved.count} active right now.`;
  const canonical = `/sets/${slug}`;

  // One cheap extra row for a representative OG image - a real listing
  // from this set, not a fabricated one.
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

export default async function SetDetailPage({ params }) {
  const { slug } = await params;

  const resolved = await resolveSetSlug(slug);
  if (!resolved) notFound();

  const [{ deals, totalPages, error }, hubCounts] = await Promise.all([
    fetchDealsPage({
      table: "deals",
      language: "english",
      set: resolved.set,
      sort: "newest",
      page: 1,
      pageSize: 20,
    }),
    fetchHubCounts({ language: "english" }),
  ]);

  const basePath = `/sets/${slug}`;

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
    <div className="flex min-h-screen flex-col bg-paper">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }} />
      <SiteHeader />
      <RegionRedirect />

      <header className="border-b border-zinc-200 dark:border-zinc-800">
        <div className="mx-auto max-w-7xl px-6 py-10">
          <Breadcrumbs
            items={[
              { name: "Deals", href: "/" },
              { name: "Sets", href: "/sets" },
              { name: resolved.set },
            ]}
          />
          <Link
            href="/sets"
            className="mt-4 inline-flex items-center gap-1.5 rounded-lg border border-zinc-300 bg-white px-3.5 py-2 text-sm font-semibold text-black transition-colors hover:border-zinc-400 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50 dark:hover:bg-zinc-800"
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
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl flex-1 px-6 py-10">
        {error && <p className="rounded-lg bg-red-50 p-4 text-red-700">Couldn&apos;t load deals: {error}</p>}

        <DealGrid
          kind="set"
          slug={slug}
          basePath={basePath}
          initial={{ deals, totalPages }}
          hubCounts={hubCounts}
          emptyLabel={`No ${resolved.set} deals match these filters right now. Try clearing a filter, or check back after the next scheduled scan.`}
        />

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
