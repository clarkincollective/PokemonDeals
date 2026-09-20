import SkipToContent from "@/components/SkipToContent";
import { fetchSets, fetchCatalogSets, fetchSetCatalog } from "@/lib/deals";
import { checklistEligible, isChecklistSet } from "@/lib/setChecklist";
import { SET_CATALOG_MIN_CARDS } from "@/lib/setHub";
import { setImage } from "@/lib/setImages";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import SetsFilterList from "@/components/SetsFilterList";
import JsonLd from "@/components/JsonLd";
import { breadcrumbList, collectionPage } from "@/lib/jsonLd";

export const revalidate = 3600;

const TAB_CLASS =
  "inline-flex min-h-11 items-center rounded-full px-4 text-sm font-semibold text-zinc-700 hover:text-black focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600 dark:text-zinc-300 dark:hover:text-white";

// 2026-09-21 audit: "pokemon set list" is 4,400/mo in the US at
// difficulty 2 (DataForSEO keyword_overview), and this page already is
// that list - every set we hold, each with its checklist. The phrase was
// never used. Once in the title, once in the H1, once in the lead.
const TITLE = "Pokemon Set List: Every Set & Checklist";
const DESCRIPTION =
  "The Pokemon set list: every TCG set we hold, with its card checklist, market-reference prices, the Pokemon in it, and any live below-market deals.";

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

  // Collection checklists: only sets whose page renders the interactive
  // ownership checklist. Candidates are the allowlisted sets listed here;
  // each is confirmed with the page's own rule on the same cached catalogue
  // payload (lib/setChecklist checklistEligible). The minimum-card check
  // mirrors the page's showCatalog gate, so a set is never advertised as a
  // checklist its page would not show.
  const eligibility = await Promise.all(
    sets
      .filter((s) => isChecklistSet(s.set))
      .map(async (s) => {
        const { cards, truncated } = await fetchSetCatalog(s.set, "english");
        return checklistEligible({ setName: s.set, cards, truncated }) && (cards?.length ?? 0) >= SET_CATALOG_MIN_CARDS ? s.slug : null;
      })
  );
  const checklistSlugs = eligibility.filter(Boolean);
  const checklistSets = sets.filter((s) => checklistSlugs.includes(s.slug));

  return (
    <div className="flex min-h-screen flex-col bg-paper">
      <JsonLd
        data={[
          breadcrumbList([{ name: "Deals", href: "/" }, { name: "Sets" }]),
          collectionPage({ name: TITLE, description: DESCRIPTION, url: "/sets" }),
        ]}
      />
      <SkipToContent />
      <SiteHeader />

      <header className="border-b border-zinc-200 dark:border-zinc-800">
        <div className="mx-auto max-w-7xl px-6 py-6 sm:py-8">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-600 dark:text-zinc-400">Browse</p>
          <h1 className="mt-1 max-w-2xl text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50 sm:text-4xl">
            Pokemon Set List: Checklists, Prices &amp; Values
          </h1>
          <p className="mt-3 max-w-2xl text-base text-zinc-600 dark:text-zinc-400">
            The full Pokemon set list. Open a set for its card checklist, the market-reference price of each card, the
            Pokemon that appear in it, and any listings currently below reference. Sets with a collection checklist let
            you tick off the cards you already own.
          </p>
        </div>
      </header>

      <main id="main-content" tabIndex={-1} className="scroll-mt-6 mx-auto w-full max-w-7xl flex-1 px-6 py-6 sm:py-8">
        {error && <p className="rounded-lg bg-red-50 p-4 text-red-700">Couldn&apos;t load sets: {error}</p>}

        {!error && sets.length === 0 && <p className="text-zinc-500">No set hubs available right now.</p>}

        {!error && sets.length > 0 && (
          // Two views switched by the URL hash with CSS :target (app/globals.css),
          // so they work without JavaScript and /sets stays statically rendered.
          // Menu, header and footer links are plain <a>, which updates :target.
          <div data-sets-views>
            <nav aria-label="Set directory views" className="mb-5 inline-flex rounded-full border border-zinc-300 bg-white p-1 dark:border-zinc-700 dark:bg-zinc-900">
              <a href="#all-sets" data-sets-tab="all" className={TAB_CLASS}>All sets</a>
              <a href="#collection-checklists" data-sets-tab="checklists" className={TAB_CLASS}>Collection checklists</a>
            </nav>
            <section id="all-sets" data-sets-pane="all" aria-label="All sets" className="scroll-mt-36">
              <SetsFilterList sets={sets} checklistSlugs={checklistSlugs} />
            </section>
            <section id="collection-checklists" data-sets-pane="checklists" aria-labelledby="collection-checklists-heading" className="scroll-mt-36">
              <h2 id="collection-checklists-heading" className="text-lg font-bold text-zinc-900 dark:text-zinc-50">
                Collection checklists ({checklistSets.length})
              </h2>
              <p className="mt-1 mb-4 max-w-xl text-sm text-zinc-600 dark:text-zinc-400">
                Mark what you own, see what’s missing and print your checklist. Progress is saved on this device.
              </p>
              <SetsFilterList sets={checklistSets} checklistSlugs={checklistSlugs} filter={false} />
            </section>
          </div>
        )}
      </main>

      <SiteFooter />
    </div>
  );
}
