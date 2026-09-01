import { fetchSets, fetchCatalogSets } from "@/lib/deals";
import { setImage } from "@/lib/setImages";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import SetsFilterList from "@/components/SetsFilterList";
import JsonLd from "@/components/JsonLd";
import { breadcrumbList, collectionPage } from "@/lib/jsonLd";

export const revalidate = 900;

const TITLE = "Browse Pokemon Cards by Set";
const DESCRIPTION =
  "Every Pokemon TCG set with an indexable hub on Pokemon Deal Finder — card checklists, market-reference prices, the Pokemon in each set, and any live below-market deals.";

export const metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/sets" },
  openGraph: { title: TITLE, description: DESCRIPTION, url: "https://pokemondealfinder.com/sets" },
  twitter: { card: "summary", title: TITLE, description: DESCRIPTION },
};

export default async function SetsIndexPage() {
  // Both indexable set paths: SET_MIN_LISTINGS deal-backed + SEO Phase 4A
  // catalogue-backed. De-dupe by slug (a deal-backed set keeps its deal
  // count badge). Every entry here has a real /sets/[slug] page.
  const [{ sets: dealSets, error }, { sets: catSets }] = await Promise.all([
    fetchSets({ language: "english" }),
    fetchCatalogSets(),
  ]);

  const bySlug = new Map();
  for (const s of dealSets ?? []) bySlug.set(s.slug, { set: s.set, slug: s.slug, count: s.count });
  for (const s of catSets ?? []) if (!bySlug.has(s.slug)) bySlug.set(s.slug, { set: s.set, slug: s.slug, count: 0 });

  const sets = [...bySlug.values()]
    .map((s) => ({ ...s, logo: setImage(s.set)?.logo ?? null }))
    .sort((a, b) => b.count - a.count || a.set.localeCompare(b.set));

  return (
    <div className="flex min-h-screen flex-col bg-paper">
      <JsonLd
        data={[
          breadcrumbList([{ name: "Deals", href: "/" }, { name: "Sets" }]),
          collectionPage({ name: TITLE, description: DESCRIPTION, url: "/sets" }),
        ]}
      />
      <SiteHeader />

      <header className="border-b border-zinc-200 dark:border-zinc-800">
        <div className="mx-auto max-w-7xl px-6 py-10">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-400">Browse</p>
          <h1 className="mt-1 max-w-2xl text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50 sm:text-4xl">
            Browse by set
          </h1>
          <p className="mt-3 max-w-xl text-base text-zinc-600 dark:text-zinc-400">
            Pick a set for its card checklist, market-reference prices, the Pokemon in it, and any
            live below-market deals. A green count shows how many qualifying deals a set has right now.
          </p>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl flex-1 px-6 py-10">
        {error && <p className="rounded-lg bg-red-50 p-4 text-red-700">Couldn&apos;t load sets: {error}</p>}

        {!error && sets.length === 0 && <p className="text-zinc-500">No set hubs available right now.</p>}

        {!error && sets.length > 0 && <SetsFilterList sets={sets} />}
      </main>

      <SiteFooter />
    </div>
  );
}
