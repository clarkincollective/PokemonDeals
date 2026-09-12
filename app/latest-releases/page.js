import Link from "next/link";
import Image from "next/image";
import { fetchDealsPage, fetchSealedDealsPool, fetchSetSlugs, fetchHubCounts } from "@/lib/deals";
import { slugifySet } from "@/lib/slugify";
import { setImage } from "@/lib/setImages";
import { RELEASE_STATUS_MAX_REVALIDATE } from "@/lib/pokemonSets";
import {
  latestReleaseLineup,
  featuredRelease,
  featuredReleaseLine,
  HUB_SECTIONS,
  COVERAGE_NOTE,
  setHref,
} from "@/lib/latestReleases";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import SectionHeader from "@/components/SectionHeader";
import DealCard from "@/components/DealCard";
import SealedDealCard from "@/components/SealedDealCard";
import Breadcrumbs from "@/components/Breadcrumbs";
import JsonLd from "@/components/JsonLd";
import { breadcrumbList, collectionPage } from "@/lib/jsonLd";

// Release status is rendered here, so this route must re-render at least
// as often as lib/pokemonSets RELEASE_STATUS_MAX_REVALIDATE (17C.7) - a
// cached page then crosses a release-day boundary within the hour.
export const revalidate = 900;

const TITLE = "Latest Pokemon TCG Releases";
const DESCRIPTION =
  "The newest Pokemon TCG expansions with official release dates - single cards, sealed product and graded listings we can currently show for them, plus the set checklists for everything else.";

export async function generateMetadata() {
  return {
    title: TITLE,
    description: DESCRIPTION,
    alternates: { canonical: "/latest-releases" },
    openGraph: { title: TITLE, description: DESCRIPTION, url: "https://pokemondealfinder.com/latest-releases" },
    twitter: { card: "summary", title: TITLE, description: DESCRIPTION },
  };
}

// One group of listings, or an honest empty state pointing at the
// catalogue. Ordering is newest-first only; each card decides its own
// presentation (plain when its reference is unevidenced).
function ListingGroup({ section, children, count, emptyExtra }) {
  return (
    <section data-analytics-section={section.analyticsSection} className="mt-10 scroll-mt-24" id={section.key}>
      <SectionHeader
        kicker="Latest releases"
        title={section.title}
        actionLabel={section.emptyLabel}
        actionHref={section.emptyHref}
        id={`${section.key}-heading`}
      />
      {count > 0 ? (
        children
      ) : (
        <div className="mt-4 rounded-xl border border-dashed border-zinc-300 bg-white p-6 text-sm text-zinc-600 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-300">
          <p>{section.empty}</p>
          {emptyExtra}
          <Link
            href={section.emptyHref}
            data-analytics-click="latest_releases_empty_link_clicked"
            data-analytics-props={JSON.stringify({ section: section.analyticsSection, destination: section.emptyHref })}
            className="mt-3 inline-block font-medium text-red-600 hover:underline dark:text-red-500"
          >
            {section.emptyLabel} →
          </Link>
        </div>
      )}
    </section>
  );
}

export default async function LatestReleasesPage() {
  const lineup = latestReleaseLineup();
  const featured = featuredRelease();
  const sets = lineup.sets;

  const [singlesRes, gradedRes, sealedPool, validSetSlugs, hubCounts] = await Promise.all([
    fetchDealsPage({ table: "deals", language: "english", sets, sort: "newest", page: 1 }),
    fetchDealsPage({ table: "deals", language: "english", sets, cardType: "graded", sort: "newest", page: 1 }),
    fetchSealedDealsPool({}),
    fetchSetSlugs("english"),
    fetchHubCounts({ language: "english" }),
  ]);

  const gradedIds = new Set((gradedRes?.deals ?? []).map((d) => d.id));
  const singles = (singlesRes?.deals ?? []).filter((d) => !gradedIds.has(d.id)).slice(0, 8);
  const graded = (gradedRes?.deals ?? []).slice(0, 4);
  // Sealed: real sealed_deals rows for the lineup's sets, already through
  // the sealed display gate (identity + early-availability), one per
  // watched product. SealedDealCard renders each one plainly unless its
  // own reference is evidenced.
  const seenSealed = new Set();
  const sealedRows = (sealedPool?.data ?? [])
    .filter((r) => sets.includes(r.sealed_watchlist?.set))
    .filter((r) => {
      if (seenSealed.has(r.sealed_watchlist_id)) return false;
      seenSealed.add(r.sealed_watchlist_id);
      return true;
    })
    .slice(0, 4);

  const lineupEntries = [...lineup.upcoming, ...lineup.released];
  const jsonLd = [
    breadcrumbList([{ name: "Deals", href: "/" }, { name: "Latest releases" }]),
    collectionPage({ name: TITLE, description: DESCRIPTION, url: "/latest-releases" }),
  ];

  return (
    <div className="flex min-h-screen flex-col bg-paper">
      <JsonLd data={jsonLd} />
      <SiteHeader />

      <header className="border-b border-zinc-200 dark:border-zinc-800">
        <div className="mx-auto w-full max-w-7xl px-6 py-10">
          <Breadcrumbs items={[{ name: "Deals", href: "/" }, { name: "Latest releases" }]} />
          <p className="mt-4 text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-400">Browse</p>
          <h1 className="mt-1 max-w-3xl text-3xl font-bold tracking-tight text-zinc-900 sm:text-4xl dark:text-zinc-50">
            Latest Pokemon TCG Releases
          </h1>
          <p className="mt-3 max-w-2xl text-base text-zinc-600 dark:text-zinc-400">
            The newest expansions, with official English release dates. {COVERAGE_NOTE}
          </p>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl flex-1 px-6 py-10">
        {/* Featured release - the soonest upcoming set (or the newest one
            out), with its confirmed official date. */}
        {featured && (
          <section data-analytics-section="latest_featured" className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-card dark:border-zinc-800 dark:bg-zinc-950">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
              {setImage(featured.set)?.logo && (
                <div className="relative h-24 w-44 shrink-0">
                  <Image src={setImage(featured.set).logo} alt={`${featured.officialName} logo`} fill sizes="176px" className="object-contain" />
                </div>
              )}
              <div className="flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-md bg-zinc-900 px-2.5 py-0.5 text-xs font-semibold text-white dark:bg-zinc-100 dark:text-zinc-900">
                    {featured.status === "upcoming" ? "Upcoming" : "Just released"}
                  </span>
                  {featured.series && (
                    <span className="rounded-md bg-zinc-100 px-2.5 py-0.5 text-xs font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                      {featured.series}
                    </span>
                  )}
                </div>
                <h2 className="mt-2 text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
                  {featured.officialName}
                </h2>
                <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">{featuredReleaseLine(featured)}</p>
                <div className="mt-4 flex flex-wrap gap-3">
                  {setHref(featured.set, validSetSlugs, slugifySet) && (
                    <Link
                      href={setHref(featured.set, validSetSlugs, slugifySet)}
                      data-analytics-click="latest_releases_set_clicked"
                      data-analytics-props={JSON.stringify({ section: "latest_featured", set_slug: slugifySet(featured.set) })}
                      className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-600 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-red-600 dark:hover:text-white"
                    >
                      See the {featured.officialName} checklist →
                    </Link>
                  )}
                  <Link
                    href="/sealed-deals"
                    data-analytics-click="latest_releases_empty_link_clicked"
                    data-analytics-props={JSON.stringify({ section: "latest_featured", destination: "/sealed-deals" })}
                    className="rounded-lg border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-600 hover:border-zinc-300 dark:border-zinc-800 dark:text-zinc-300"
                  >
                    Sealed product
                  </Link>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* Two sets share almost the same name, and their sealed products
            are routinely confused in listing titles: a standard Elite
            Trainer Box, a Pokemon Center Elite Trainer Box and an ETB CASE
            exist in BOTH the 2026 "30th Celebration" set and the 2021
            "Celebrations" set. This note is rendered ONLY while 30th
            Celebration is the featured release, so it never dominates an
            unrelated future one. Both links go through setHref, so a set
            page is linked only when it really exists. */}
        {featured?.set === "ME: 30th Celebration" && (
          <section data-analytics-section="latest_identify" className="mt-10 rounded-2xl border border-zinc-200 bg-white p-5 shadow-card sm:p-6 dark:border-zinc-800 dark:bg-zinc-950">
            <h2 className="text-base font-semibold text-zinc-900 sm:text-lg dark:text-zinc-50">
              Two different &ldquo;Celebrations&rdquo; sets
            </h2>
            <p className="mt-2 max-w-2xl text-sm text-zinc-600 dark:text-zinc-300">
              Two Pokemon TCG sets share almost the same name, and their sealed products are easy to mix up
              when you&apos;re searching. <strong className="font-semibold text-zinc-900 dark:text-zinc-100">30th Celebration</strong>{" "}
              is the 2026 expansion. Release date: 16 September 2026.{" "}
              <strong className="font-semibold text-zinc-900 dark:text-zinc-100">Celebrations</strong> is the 2021
              25th-anniversary set. They are separate releases with separate cards and separate products.
            </p>
            <ul className="mt-4 space-y-3 text-sm text-zinc-600 dark:text-zinc-300">
              <li>
                <strong className="font-semibold text-zinc-900 dark:text-zinc-100">The anniversary.</strong>{" "}
                30th Celebration listings usually say &ldquo;30th&rdquo; or &ldquo;30th Anniversary&rdquo;. The 2021 set is
                often listed as &ldquo;25th&rdquo; or just &ldquo;Celebrations&rdquo;. If the edition is unclear, check the
                listing description and packaging photos; don&apos;t identify it from price alone.
              </li>
              <li>
                <strong className="font-semibold text-zinc-900 dark:text-zinc-100">Standard vs Pokemon Center.</strong>{" "}
                Both sets have a standard Elite Trainer Box and a separate Pokemon Center Elite Trainer Box.
                These are distinct products; compare the exact edition and box type.
              </li>
              <li>
                <strong className="font-semibold text-zinc-900 dark:text-zinc-100">Single box, case, or a seller&apos;s lot.</strong>{" "}
                Both sets also have an Elite Trainer Box case, which is one factory-sealed product containing
                several boxes. A seller offering multiple boxes together is not automatically a factory-sealed
                case - check what the listing actually describes.
              </li>
            </ul>
            <div className="mt-5 flex flex-wrap gap-3">
              {setHref("ME: 30th Celebration", validSetSlugs, slugifySet) && (
                <Link
                  href={setHref("ME: 30th Celebration", validSetSlugs, slugifySet)}
                  data-analytics-click="latest_releases_set_clicked"
                  data-analytics-props={JSON.stringify({ section: "latest_identify", set_slug: slugifySet("ME: 30th Celebration") })}
                  className="rounded-lg border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-700 hover:border-zinc-300 dark:border-zinc-800 dark:text-zinc-200"
                >
                  30th Celebration checklist →
                </Link>
              )}
              {setHref("Celebrations", validSetSlugs, slugifySet) && (
                <Link
                  href={setHref("Celebrations", validSetSlugs, slugifySet)}
                  data-analytics-click="latest_releases_set_clicked"
                  data-analytics-props={JSON.stringify({ section: "latest_identify", set_slug: slugifySet("Celebrations") })}
                  className="rounded-lg border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-700 hover:border-zinc-300 dark:border-zinc-800 dark:text-zinc-200"
                >
                  Celebrations (2021) checklist →
                </Link>
              )}
            </div>
          </section>
        )}

        {/* The lineup itself: official name, date and status, each linking
            to its EXISTING set page - never a second set page of our own. */}
        <section data-analytics-section="latest_lineup" className="mt-10">
          <SectionHeader kicker="Officially dated" title="Recent and upcoming expansions" actionLabel="All sets" actionHref="/sets" id="lineup-heading" />
          <ul className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {lineupEntries.map((e) => {
              const href = setHref(e.set, validSetSlugs, slugifySet);
              const body = (
                <>
                  <span className="block text-sm font-semibold text-zinc-900 dark:text-zinc-50">{e.officialName}</span>
                  <span className="mt-0.5 block text-xs text-zinc-500 dark:text-zinc-400">
                    {e.status === "upcoming" ? `Releases ${e.releaseDateText}` : `Released ${e.releaseDateText}`}
                  </span>
                </>
              );
              return (
                <li key={e.set} className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
                  {href ? (
                    <Link
                      href={href}
                      data-analytics-click="latest_releases_set_clicked"
                      data-analytics-props={JSON.stringify({ section: "latest_lineup", set_slug: slugifySet(e.set) })}
                      className="block hover:underline"
                    >
                      {body}
                    </Link>
                  ) : (
                    body
                  )}
                </li>
              );
            })}
          </ul>
        </section>

        <ListingGroup section={HUB_SECTIONS[0]} count={singles.length}>
          <div className="mt-5 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {singles.map((deal, i) => (
              <DealCard
                key={deal.id}
                deal={deal}
                hub={hubCounts[deal.watchlist_id]}
                pageName="latest_releases"
                validSetSlugs={validSetSlugs}
                analytics={{ section: "latest_singles", rank: i + 1 }}
              />
            ))}
          </div>
        </ListingGroup>

        <ListingGroup section={HUB_SECTIONS[1]} count={sealedRows.length}>
          <div className="mt-5 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {sealedRows.map((row) => (
              <SealedDealCard key={row.id} deal={row} pageName="latest_releases" />
            ))}
          </div>
        </ListingGroup>

        <ListingGroup section={HUB_SECTIONS[2]} count={graded.length}>
          <div className="mt-5 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {graded.map((deal, i) => (
              <DealCard
                key={deal.id}
                deal={deal}
                hub={hubCounts[deal.watchlist_id]}
                pageName="latest_releases"
                validSetSlugs={validSetSlugs}
                analytics={{ section: "latest_graded", rank: i + 1 }}
              />
            ))}
          </div>
        </ListingGroup>

        <p className="mt-10 text-xs text-zinc-400">
          Release dates come from The Pokemon Company&apos;s own announcements. {COVERAGE_NOTE}
        </p>
      </main>

      <SiteFooter />
    </div>
  );
}
