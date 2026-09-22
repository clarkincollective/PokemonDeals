import SkipToContent from "@/components/SkipToContent";
import Link from "next/link";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import JsonLd from "@/components/JsonLd";
import ScrollableTable from "@/components/ScrollableTable";
import { breadcrumbList, collectionPage, publisherNode } from "@/lib/jsonLd";
import { organizationSameAs } from "@/lib/socialProfiles";
import { STUDY } from "@/lib/studies/shippingCost202609";

// A FIXED, DATED SNAPSHOT. Every figure comes from the generated artifact
// (lib/studies/shippingCost202609, built by
// scripts/studies/buildShippingCostStudy.mjs) - no provider request, no
// database read and no refresh happens on this route, so the published
// numbers cannot drift from the analysis they were computed from.
// `revalidate` matches the other market-data pages so the shell
// re-renders on the same cadence; the data itself is static.
export const revalidate = 21600;

const SITE_URL = "https://pokemondealfinder.com";
const PATH = "/market-data/pokemon-shipping-cost-study";

const TITLE = "How Much Shipping Adds to a Pokemon Card Listing";
const DESCRIPTION =
  "A dated study of 440 retained fixed-price Pokemon card listings with a recorded shipping charge: what shipping adds as a share of the item price, reported separately per marketplace and currency, and how often the cheapest item price is not the cheapest delivered.";

export const metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: PATH },
  openGraph: { title: TITLE, description: DESCRIPTION, url: `${SITE_URL}${PATH}` },
  twitter: { card: "summary", title: TITLE, description: DESCRIPTION },
};

const human = (iso) =>
  new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

export default function Page() {
  const s = STUDY;
  const observed = human(s.observationCutoff);
  const characterised = s.marketplaces.filter((m) => m.characterised);
  const small = s.marketplaces.filter((m) => !m.characterised);

  return (
    <div className="flex min-h-screen flex-col bg-paper">
      <JsonLd
        data={[
          breadcrumbList([
            { name: "Deals", href: "/" },
            { name: "Market Data", href: "/market-data" },
            { name: "Shipping cost study", href: PATH },
          ]),
          collectionPage({ name: TITLE, description: DESCRIPTION, url: PATH }),
          publisherNode({ sameAs: organizationSameAs() }),
        ]}
      />
      <SkipToContent />
      <SiteHeader />

      <header className="border-b border-zinc-200 dark:border-zinc-800">
        <div className="mx-auto max-w-3xl px-6 py-6 sm:py-8">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-600 dark:text-zinc-400">
            Research &amp; historical studies
          </p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-black dark:text-zinc-50 sm:text-4xl">
            How much shipping adds to a Pokemon card listing
          </h1>
          <p className="mt-3 text-base text-zinc-600 dark:text-zinc-400">
            A snapshot of <strong>{s.population.usable}</strong> retained fixed-price listings that
            carried a recorded shipping charge, observed on <strong>{observed}</strong>. Figures are
            fixed at publication and are not updated.
          </p>
        </div>
      </header>

      <main id="main-content" tabIndex={-1} className="scroll-mt-6 mx-auto w-full max-w-3xl flex-1 px-6 py-6 sm:py-8">
        <section aria-labelledby="finding">
          <h2 id="finding" className="text-xl font-bold text-black dark:text-zinc-50">
            The finding
          </h2>
          <p className="mt-3 text-base leading-relaxed text-zinc-700 dark:text-zinc-300">
            Shipping is not a rounding error on a card listing, and how much it matters depends
            almost entirely on which marketplace the listing is on. On the two largest groups in this
            sample the median shipping charge was{" "}
            <strong>
              {characterised[0]?.medianShippingPctOfItem}% of the item price on{" "}
              {characterised[0]?.label}
            </strong>{" "}
            and{" "}
            <strong>
              {characterised[1]?.medianShippingPctOfItem}% on {characterised[1]?.label}
            </strong>
            .
          </p>
          <p className="mt-3 text-base leading-relaxed text-zinc-700 dark:text-zinc-300">
            The consequence for a buyer is direct. Among{" "}
            <strong>{s.comparableGroups.groups}</strong> groups of genuinely comparable listings —
            same card, same marketplace, same recorded condition, two or more listings — the cheapest
            item price was <strong>not</strong> the cheapest delivered total in{" "}
            <strong>
              {s.comparableGroups.rankFlips} of them ({s.comparableGroups.rankFlipPct}%)
            </strong>
            . Sorting by item price picks the wrong listing about a quarter of the time.
          </p>
        </section>

        <section aria-labelledby="by-market" className="mt-10">
          <h2 id="by-market" className="text-xl font-bold text-black dark:text-zinc-50">
            By marketplace
          </h2>
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
            Each marketplace is reported in its own currency and never pooled with another — adding a
            GBP figure to an AUD figure would be arithmetic on incompatible units. Percentages are
            within-listing ratios, so they are comparable across rows even though the money is not.
          </p>
          <ScrollableTable>
            <table className="mt-4 w-full min-w-[40rem] border-collapse text-sm">
              <thead>
                <tr className="border-b border-zinc-300 text-left dark:border-zinc-700">
                  <th className="py-2 pr-4 font-semibold">Marketplace</th>
                  <th className="py-2 pr-4 font-semibold">Listings</th>
                  <th className="py-2 pr-4 font-semibold">Currency</th>
                  <th className="py-2 pr-4 font-semibold">Median item</th>
                  <th className="py-2 pr-4 font-semibold">Median shipping</th>
                  <th className="py-2 pr-4 font-semibold">Shipping as % of item</th>
                  <th className="py-2 font-semibold">Share ≥ 20%</th>
                </tr>
              </thead>
              <tbody>
                {s.marketplaces.map((m) => (
                  <tr key={m.marketplace} className="border-b border-zinc-200 dark:border-zinc-800">
                    <td className="py-2 pr-4 font-medium">
                      {m.label}
                      {!m.characterised && (
                        <span className="ml-2 text-xs font-normal text-zinc-500">too few to characterise</span>
                      )}
                    </td>
                    <td className="tnum py-2 pr-4">{m.n}</td>
                    <td className="py-2 pr-4">{m.currency}</td>
                    <td className="tnum py-2 pr-4">{m.medianItem.toFixed(2)}</td>
                    <td className="tnum py-2 pr-4">{m.medianShipping.toFixed(2)}</td>
                    <td className="tnum py-2 pr-4">{m.medianShippingPctOfItem}%</td>
                    <td className="tnum py-2">{m.shareAtLeast20Pct}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ScrollableTable>
          {small.length > 0 && (
            <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">
              {small.map((m) => m.label).join(", ")} had fewer than {s.minimumNForCharacterisation}{" "}
              usable listings. The rows are shown for completeness; they are too small to describe a
              marketplace and should not be read as one.
            </p>
          )}
        </section>

        <section aria-labelledby="method" className="mt-10">
          <h2 id="method" className="text-xl font-bold text-black dark:text-zinc-50">
            How the population was defined
          </h2>
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
            Decided before any figure was calculated, and applied in this order:
          </p>
          <ol className="mt-3 list-decimal space-y-2 pl-5 text-base leading-relaxed text-zinc-700 dark:text-zinc-300">
            <li>
              Retained listing records marked active at the observation cutoff:{" "}
              <strong>{s.population.activeRows}</strong>.
            </li>
            <li>
              Fixed-price only: <strong>{s.population.fixedPrice}</strong>. Auctions are excluded
              because their figure is a current bid, not a price.
            </li>
            <li>
              Deduplicated by listing id: <strong>{s.population.afterDeduplication}</strong>, so one
              listing counts once.
            </li>
            <li>
              A <strong>recorded shipping charge</strong> only:{" "}
              <strong>{s.population.usable}</strong> usable.{" "}
              {s.population.byShippingState.unconfirmed} listings recorded shipping as unconfirmed
              and were <strong>excluded, not counted as zero</strong>.
            </li>
          </ol>
          <p className="mt-3 text-base leading-relaxed text-zinc-700 dark:text-zinc-300">
            That last exclusion is the most important one. Treating an unknown shipping charge as
            free would have inflated the sample by roughly 60% and pulled every figure below toward
            zero — it would have manufactured the opposite of the finding.
          </p>
          <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">
            The calculation is reproducible from{" "}
            <code className="rounded bg-zinc-100 px-1 py-0.5 text-[13px] dark:bg-zinc-900">
              scripts/studies/buildShippingCostStudy.mjs
            </code>
            , which reads retained records only and writes the frozen figures this page renders.
          </p>
        </section>

        <section aria-labelledby="limits" className="mt-10">
          <h2 id="limits" className="text-xl font-bold text-black dark:text-zinc-50">
            What this does not show
          </h2>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-base leading-relaxed text-zinc-700 dark:text-zinc-300">
            <li>
              <strong>These are listings, not sales.</strong> Nothing here says anything about what
              anyone paid, or whether these listings sold at all.
            </li>
            <li>
              <strong>It is a snapshot, not a history.</strong> One observation cutoff, one set of
              retained records. It does not describe a trend and cannot.
            </li>
            <li>
              <strong>It is not a sample of the market.</strong> It is a sample of what we had
              retained and eligible at that moment, which reflects what we scan.
            </li>
            <li>
              <strong>Delivery destination is not normalised.</strong> Each listing&apos;s shipping
              figure is whatever that listing recorded for its own offer. This is not a
              like-for-like international comparison.
            </li>
            <li>
              <strong>Currencies are never combined.</strong> No conversion happens anywhere in the
              study.
            </li>
          </ul>
        </section>

        <section aria-labelledby="next" className="mt-10 border-t border-zinc-200 pt-8 dark:border-zinc-800">
          <h2 id="next" className="text-xl font-bold text-black dark:text-zinc-50">
            Why we compare delivered totals
          </h2>
          <p className="mt-3 text-base leading-relaxed text-zinc-700 dark:text-zinc-300">
            The 26% figure above is the reason our listings are compared on the delivered total
            rather than the item price, and the reason a listing whose shipping breakdown was never
            recorded shows no savings claim at all rather than a flattering one computed from an
            assumed zero.
          </p>
          <ul className="mt-4 space-y-2 text-base">
            <li>
              <Link href="/guides/how-to-read-a-pokemon-card-listing" className="font-semibold text-red-600 hover:underline dark:text-red-500">
                How to read a listing →
              </Link>{" "}
              <span className="text-zinc-600 dark:text-zinc-400">— where the shipping line sits and what it means.</span>
            </li>
            <li>
              <Link href="/methodology" className="font-semibold text-red-600 hover:underline dark:text-red-500">
                Our methodology →
              </Link>{" "}
              <span className="text-zinc-600 dark:text-zinc-400">— the full comparison rules.</span>
            </li>
            <li>
              <Link href="/market-data" className="font-semibold text-red-600 hover:underline dark:text-red-500">
                Market Data &amp; Research →
              </Link>{" "}
              <span className="text-zinc-600 dark:text-zinc-400">— the other rankings and studies.</span>
            </li>
          </ul>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
