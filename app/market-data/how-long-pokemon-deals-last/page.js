import SkipToContent from "@/components/SkipToContent";
import Link from "next/link";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import JsonLd from "@/components/JsonLd";
import ScrollableTable from "@/components/ScrollableTable";
import { breadcrumbList, collectionPage, dataset, FIGURES_LICENSE, publisherNode, dataDownload } from "@/lib/jsonLd";
import { organizationSameAs } from "@/lib/socialProfiles";
import { LISTING_DISAPPEARANCE as D } from "@/lib/studies/listingDisappearance";

// A FIXED, DATED SNAPSHOT. Every figure comes from the generated
// aggregate (lib/studies/listingDisappearance, built by
// scripts/seo/buildSurvivalAggregate). No runtime database read, no
// refresh - the published numbers can never drift from the analysis they
// were computed from. `revalidate` only re-renders the shell.
export const revalidate = 21600;

const SITE_URL = "https://pokemondealfinder.com";
const PATH = "/market-data/how-long-pokemon-deals-last";
// The machine-readable copy of the figures below (Dataset.distribution).
const CSV_PATH = "/market-data/how-long-pokemon-deals-last.csv";

const TITLE = "How Long Does a Below-Market Pokemon Listing Last?";
const DESCRIPTION =
  "We tracked 15,147 below-market eBay Pokemon card listings for 25 days. Most were gone the next time we checked the search that found them - and dearer cards lasted longer.";

export const metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: PATH },
  openGraph: { title: TITLE, description: DESCRIPTION, url: `${SITE_URL}${PATH}` },
  twitter: { card: "summary", title: TITLE, description: DESCRIPTION },
};

const nf = (n) => Number(n).toLocaleString("en-US");
const human = (iso) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

const BANDS = ["under $25", "$25 to $100", "$100 or more"];

export default function Page() {
  const citation = `Pokemon Deal Finder, "${TITLE}", ${human(D.window.start)} to ${human(D.window.end)}. ${SITE_URL}${PATH}`;
  const p = D.population;

  return (
    <div className="flex min-h-screen flex-col bg-paper">
      <JsonLd
        data={[
          publisherNode(organizationSameAs()),
          breadcrumbList([
            { name: "Deals", href: "/" },
            { name: "Market data", href: "/market-data" },
            { name: "How long deals last" },
          ]),
          collectionPage({ name: TITLE, description: DESCRIPTION, url: PATH, dateModified: `${D.window.end}T00:00:00.000Z` }),
          // A bounded, dated first-party observation set, with a real
          // downloadable copy of the same frozen figures.
          dataset({
            name: `${TITLE} (${D.window.start} to ${D.window.end})`,
            description: DESCRIPTION,
            url: PATH,
            dateModified: `${D.window.end}T00:00:00.000Z`,
            temporalCoverage: `${D.window.start}/${D.window.end}`,
            variableMeasured: [
              "below-market listings observed (count)",
              "share absent by the next run of the same search (%)",
              "gap to that next run (days)",
              "observed span of re-seen listings (days)",
            ],
            license: FIGURES_LICENSE,
            distribution: dataDownload({
              contentUrl: CSV_PATH,
              encodingFormat: "text/csv",
              name: `${TITLE} (CSV)`,
            }),
          }),
        ]}
      />
      <SkipToContent />
      <SiteHeader />

      <main id="main-content" tabIndex={-1} className="mx-auto w-full max-w-3xl flex-1 scroll-mt-6 px-6 py-8">
        <Link href="/market-data" className="text-sm font-semibold text-red-600 hover:underline dark:text-red-500">
          ← Market data
        </Link>

        <h1 className="mt-5 text-3xl font-bold tracking-tight text-black dark:text-zinc-50 sm:text-4xl">{TITLE}</h1>

        {/* The answer first, in one extractable sentence. */}
        <p className="mt-4 text-lg leading-relaxed text-zinc-700 dark:text-zinc-300">
          Between <time dateTime={D.window.start}>{human(D.window.start)}</time> and{" "}
          <time dateTime={D.window.end}>{human(D.window.end)}</time> we watched{" "}
          <strong className="text-black dark:text-zinc-50">{nf(p.measured)}</strong> below-market eBay Pokemon card
          listings. <strong className="text-black dark:text-zinc-50">{D.headline.goneByNextScanPct}%</strong> were no
          longer there the next time we ran the search that found them — a median of{" "}
          <strong className="text-black dark:text-zinc-50">{D.headline.medianGapToNextScanDays} days</strong> later.
        </p>

        <p className="mt-4 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm leading-relaxed text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
          <strong>This does not mean they sold.</strong> A listing also leaves a search when it ends, is cancelled, is
          relisted, or changes price enough to fall outside the below-market filter. We observe absence, not outcome —
          so nothing here is a sell-through rate or a time-to-sale.
        </p>

        {/* ---------- the gradient ---------- */}
        <h2 className="mt-10 text-xl font-semibold text-black dark:text-zinc-50">Dearer cards last longer</h2>
        <p className="mt-3 text-base leading-relaxed text-zinc-700 dark:text-zinc-300">
          Two separate measures agree, which is the main reason we trust the pattern. Cards with a higher market
          reference were both less likely to be gone by the next check, and stayed visible longer when we did see them
          again.
        </p>

        <ScrollableTable>
          <table className="mt-4 w-full border-collapse text-sm">
            <caption className="sr-only">
              Listing disappearance by market-reference band, {human(D.window.start)} to {human(D.window.end)}
            </caption>
            <thead>
              <tr className="border-b border-zinc-300 text-left dark:border-zinc-700">
                <th scope="col" className="px-3 py-2 font-medium">Market reference</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">Listings</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">Gone by next check</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">Median days if seen again</th>
              </tr>
            </thead>
            <tbody>
              {BANDS.map((b) => {
                const row = D.byReferenceBand[b];
                if (!row) return null;
                return (
                  <tr key={b} className="border-b border-zinc-200 dark:border-zinc-800">
                    <th scope="row" className="px-3 py-2.5 text-left font-medium text-black dark:text-zinc-50">{b}</th>
                    <td className="tnum px-3 py-2.5 text-right">{nf(row.records)}</td>
                    <td className="tnum px-3 py-2.5 text-right font-semibold text-black dark:text-zinc-50">{row.goneByNextScanPct}%</td>
                    <td className="tnum px-3 py-2.5 text-right">{row.reSeenMedianDays ?? "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </ScrollableTable>

        {/* ---------- method, including what we threw away ---------- */}
        <h2 className="mt-10 text-xl font-semibold text-black dark:text-zinc-50">How this was measured</h2>
        <p className="mt-3 text-base leading-relaxed text-zinc-700 dark:text-zinc-300">
          Every listing we find is recorded with the search that found it and every time we saw it again. The hard part
          is telling &ldquo;this listing is gone&rdquo; apart from &ldquo;we never looked again&rdquo;. We only count a
          listing as gone when we can show we re-ran <em>its own search</em> afterwards and did not find it. Where we
          cannot show that, the listing is excluded rather than assumed gone.
        </p>

        <ScrollableTable>
          <table className="mt-4 w-full border-collapse text-sm">
            <caption className="sr-only">What was excluded from the sample and why</caption>
            <thead>
              <tr className="border-b border-zinc-300 text-left dark:border-zinc-700">
                <th scope="col" className="px-3 py-2 font-medium">Step</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">Listings</th>
              </tr>
            </thead>
            <tbody>
              {[
                ["Recorded in the window", p.rowsConsidered],
                ["Less: withheld by our own checks", -p.excludedHeldByUs],
                ["Less: still live at the end of the window", -p.excludedStillActive],
                ["Less: first seen on day one (age unknown)", -p.excludedFirstDay],
                ["Less: search never re-run after discovery", -p.excludedNeverReSearched],
              ].map(([label, n]) => (
                <tr key={label} className="border-b border-zinc-200 dark:border-zinc-800">
                  <th scope="row" className="px-3 py-2.5 text-left font-normal">{label}</th>
                  <td className="tnum px-3 py-2.5 text-right">{n < 0 ? `−${nf(-n)}` : nf(n)}</td>
                </tr>
              ))}
              <tr className="border-b-2 border-zinc-400 dark:border-zinc-600">
                <th scope="row" className="px-3 py-2.5 text-left font-semibold text-black dark:text-zinc-50">Measured</th>
                <td className="tnum px-3 py-2.5 text-right font-bold text-black dark:text-zinc-50">{nf(p.measured)}</td>
              </tr>
            </tbody>
          </table>
        </ScrollableTable>

        <p className="mt-4 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
          That leaves {D.population.measuredShareOfCandidates}% of the listings that ended in the window. Of the
          measured set, {nf(D.headline.reSeenAtLeastOnce)} were seen more than once; their median visible span was{" "}
          {D.headline.reSeenMedianObservedDays} days.
        </p>

        {/* ---------- limits ---------- */}
        <h2 className="mt-10 text-xl font-semibold text-black dark:text-zinc-50">What this does not tell you</h2>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-base leading-relaxed text-zinc-700 dark:text-zinc-300">
          {D.limits.map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>

        {/* ---------- citation ---------- */}
        <h2 className="mt-10 text-xl font-semibold text-black dark:text-zinc-50">Citing this study</h2>
        <p className="mt-3 text-base leading-relaxed text-zinc-700 dark:text-zinc-300">
          A fixed, dated snapshot — these figures describe the window above and are not refreshed. Free to reuse with
          attribution (CC BY 4.0).
        </p>
        <p className="mt-3 rounded-lg border border-zinc-200 bg-white p-3 text-xs text-zinc-600 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-400">
          {citation}
        </p>
        <p className="mt-3 text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">
          Every figure on this page, including the exclusion ledger, is also available as a{" "}
          <a
            href={CSV_PATH}
            className="font-semibold text-red-600 hover:underline dark:text-red-500"
            data-analytics-click="study_csv_downloaded"
            data-analytics-props={JSON.stringify({ study: D.id, version: D.version })}
          >
            CSV file
          </a>{" "}
          — aggregates only, nothing per-listing and nothing about any seller.
        </p>
        <p className="mt-2 text-xs text-zinc-400">
          Version {D.version}. How we decide a listing is below market:{" "}
          <Link href="/methodology" className="font-medium text-red-600 hover:underline dark:text-red-500">
            methodology
          </Link>
          . What we withhold and why:{" "}
          <Link href="/integrity" className="font-medium text-red-600 hover:underline dark:text-red-500">
            listing integrity
          </Link>
          .
        </p>
      </main>

      <SiteFooter />
    </div>
  );
}
