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
  "A dated study of retained fixed-price Pokemon card listings that charge for shipping: what the charge adds as a share of the item price, reported separately per marketplace and currency, and how often the cheapest item price was not the cheapest delivered total within the groups assessed.";

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
            carried a recorded shipping charge above zero, observed on <strong>{observed}</strong>.
            Figures are fixed at publication and are not updated.
          </p>
          {/* A reader who saw the first version of this page is entitled
              to know the numbers moved and why. The correction is stated
              here rather than left to a changelog nobody opens. */}
          <p className="mt-3 rounded-lg border border-zinc-200 bg-white p-3 text-sm text-zinc-600 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-400">
            <strong className="text-black dark:text-zinc-50">Corrected 22 September 2026.</strong>{" "}
            Earlier versions of this page compared listings that were not comparable. They did not
            separate graded from raw, or a domestic offer from a cross-border one; they counted a
            ranking reversal whenever an arbitrary tie-break put a different listing first; they
            reported an exclusion share as though it were a growth figure; and — the substantive one
            — they assumed a catalogue product id fixed a card&apos;s <em>printing</em>, which it
            does not. All four are fixed below. The study was re-run from scratch at a new
            observation, under method revision {s.methodRevision}, with its inputs frozen before any
            figure was calculated. Every number on this page comes from that run; none is carried
            over from an earlier one.
          </p>
        </div>
      </header>

      <main id="main-content" tabIndex={-1} className="scroll-mt-6 mx-auto w-full max-w-3xl flex-1 px-6 py-6 sm:py-8">
        <section aria-labelledby="finding">
          <h2 id="finding" className="text-xl font-bold text-black dark:text-zinc-50">
            The finding
          </h2>
          <p className="mt-3 text-base leading-relaxed text-zinc-700 dark:text-zinc-300">
            Where a Pokemon card listing charges for shipping, the charge is not a rounding error.
            Among the listings in this sample the median charge was{" "}
            <strong>
              {characterised[0]?.medianShippingPctOfItem}% of the item price on{" "}
              {characterised[0]?.label}
            </strong>{" "}
            and{" "}
            <strong>
              {characterised[1]?.medianShippingPctOfItem}% on {characterised[1]?.label}
            </strong>
            , and the per-marketplace figures below differ widely from one another.
          </p>
          <p className="mt-3 text-base leading-relaxed text-zinc-700 dark:text-zinc-300">
            Those rows are grouped by marketplace, so they describe the listings we retained on each
            marketplace. They do not establish that the marketplace <em>causes</em> the difference:
            item mix, seller mix, typical parcel weight and how far a parcel travels all vary between
            them too, and nothing here separates those.
          </p>
          <p className="mt-3 text-base leading-relaxed text-zinc-700 dark:text-zinc-300">
            The consequence for a buyer shows up when two listings can actually be compared. Among
            the <strong>{s.comparableGroups.groups}</strong> groups in this sample that matched on
            every identity field below — and held two or more listings — the listing with the
            cheapest item price was <strong>not</strong> the one with the cheapest recorded
            delivered total in{" "}
            <strong>
              {s.comparableGroups.rankFlips} of them ({s.comparableGroups.rankFlipPct}%)
            </strong>
            . That is a result about these {s.comparableGroups.groups} groups, at this observation
            cutoff, and about the totals those listings recorded. It is not a rate for Pokemon
            listings in general, and it is not a claim about what any particular reader would pay at
            checkout.
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
              A <strong>recorded shipping charge above zero</strong> only:{" "}
              <strong>{s.population.usable}</strong> usable.{" "}
              {s.population.excludedNotConfirmed} listings did not record one and were{" "}
              <strong>excluded, not counted as zero</strong>.
            </li>
          </ol>
          <p className="mt-3 text-base leading-relaxed text-zinc-700 dark:text-zinc-300">
            That last exclusion is the most important one, and it cuts two ways. The excluded
            listings are <strong>{s.population.excludedShareOfDeduplicatedPct}%</strong> of the{" "}
            {s.population.afterDeduplication} deduplicated listings. Folding them in as free
            shipping would have taken the analysed sample from {s.population.usable} to{" "}
            {s.population.afterDeduplication} listings — an increase of{" "}
            <strong>{s.population.sampleGrowthIfIncludedPct}%</strong> — and pulled every figure
            below toward zero.
          </p>
          <p className="mt-3 text-base leading-relaxed text-zinc-700 dark:text-zinc-300">
            The cost of excluding them is a real limit on what this page can say. Every listing
            counted here <em>charges</em> for shipping, so these figures describe listings that
            charge. They are not an average over all listings, and they say nothing about how common
            free or included shipping is.
          </p>

          <h3 className="mt-8 text-base font-bold text-black dark:text-zinc-50">
            What &ldquo;comparable&rdquo; was made to mean
          </h3>
          <p className="mt-2 text-base leading-relaxed text-zinc-700 dark:text-zinc-300">
            Two listings sit in the same group only when every field below matches. Some of these
            are settled by a single identifier and some had to be added explicitly.
          </p>
          <ScrollableTable>
            <table className="mt-4 w-full min-w-[34rem] border-collapse text-sm">
              <thead>
                <tr className="border-b border-zinc-300 text-left dark:border-zinc-700">
                  <th className="py-2 pr-4 font-semibold">Identity</th>
                  <th className="py-2 font-semibold">How it is guaranteed</th>
                </tr>
              </thead>
              <tbody>
                {[
                  [
                    "Exact card",
                    "By the catalogue product id. Some printings do hold separate ids — the three Prismatic Umbreon cards numbered 059/131 are three ids, not one — but that is a fact about those cards, not a property of the identifier.",
                  ],
                  [
                    "Physical printing",
                    "Resolved per listing from the seller's own words, and excluded where it cannot be. The product id does NOT settle this, which is the correction at the centre of this revision — see below.",
                  ],
                  [
                    "Language",
                    "By that id: our card catalogue holds one language per record, and the listing's own language field is carried in the key so the property is enforced rather than assumed.",
                  ],
                  [
                    "Raw condition, or grading company and grade",
                    "Added explicitly. A raw Near Mint copy and a slabbed copy are separate offers; an earlier version keyed on condition alone and could group them together.",
                  ],
                  ["Marketplace and currency", "By marketplace, which fixes the currency. No group ever spans two currencies."],
                  [
                    "Recorded delivery basis",
                    "Added explicitly, as a domestic / cross-border split. It is a coarse proxy and nothing more: we record where the item is, not where it is going, so a group is listings on a consistent recorded basis — never listings shipping to the same address.",
                  ],
                ].map(([k, v]) => (
                  <tr key={k} className="border-b border-zinc-200 align-top dark:border-zinc-800">
                    <td className="py-2 pr-4 font-medium">{k}</td>
                    <td className="py-2 leading-relaxed">{v}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ScrollableTable>
          <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">
            Every usable listing carried a card id and a recorded condition, so{" "}
            {s.comparableGroups.droppedForMissingIdentity} were dropped from this stage for missing
            identity. Deduplication is by listing id, which on eBay carries the variation, so two
            variations of one listing count as the two separate offers they are.
          </p>

          <h3 className="mt-8 text-base font-bold text-black dark:text-zinc-50">
            Why a product id does not settle the printing
          </h3>
          <p className="mt-2 text-base leading-relaxed text-zinc-700 dark:text-zinc-300">
            Earlier versions of this page said the catalogue product id settled the exact card{" "}
            <em>and its printing</em> on its own. Our own retained listings disprove that. At this
            observation, <strong>{s.printingIdentity.productIdsCoveringMultipleFinishes}</strong>{" "}
            product ids in the sample were shown by their own listings to cover more than one
            finish. The clearest case carried nine listings under a single id: one titled
            &ldquo;Non Holo&rdquo;, one &ldquo;Reverse Holo&rdquo;, and the rest simply
            &ldquo;Holo&rdquo;. The catalogue records one printing per id — the printing its market
            price is quoted for — and that is not a promise about what every listing under it is
            selling.
          </p>
          <p className="mt-3 text-base leading-relaxed text-zinc-700 dark:text-zinc-300">
            That matters here because a reverse holo and a plain copy of the same card are different
            products at different prices. Comparing them and calling the gap a shipping effect would
            be measuring the wrong thing.
          </p>
          <p className="mt-3 text-base leading-relaxed text-zinc-700 dark:text-zinc-300">
            So each listing&apos;s printing is now resolved individually, using the same rules the
            rest of the site uses to decide whether a reference may price a listing at all. Only the
            seller&apos;s own words count as evidence: the catalogue entry cannot settle it, because
            the catalogue entry is the thing in doubt. Where the printing cannot be established —
            because the listing is silent on an id already shown to carry several finishes, because
            it rules out the only printing we hold, or because its title claims two at once — the
            listing is <strong>excluded</strong> rather than assigned a likely answer. That removed{" "}
            <strong>{s.comparableGroups.droppedForUnresolvedPrinting}</strong> of{" "}
            {s.population.usable} listings ({s.printingIdentity.unresolvedSharePct}%) before any
            group was formed.
          </p>

          <h3 className="mt-8 text-base font-bold text-black dark:text-zinc-50">
            How a ranking reversal is counted
          </h3>
          <p className="mt-2 text-base leading-relaxed text-zinc-700 dark:text-zinc-300">
            A group counts as reversed only when <em>no</em> listing tied for the lowest item price
            also achieves the lowest delivered total — that is, when choosing on item price cannot
            reach the cheapest delivered total however the tie is broken. This matters:{" "}
            {s.comparableGroups.groupsWithItemPriceTie} of the {s.comparableGroups.groups} groups
            contain a tie at the lowest item price, and in{" "}
            {s.comparableGroups.tiesNotCountedAsReversals} of them a naive &ldquo;sort and take the
            first&rdquo; would have recorded a reversal that is only an artefact of which tied row
            happened to sort first.
          </p>
        </section>

        <section aria-labelledby="repro" className="mt-10">
          <h2 id="repro" className="text-xl font-bold text-black dark:text-zinc-50">
            How this snapshot can be re-checked
          </h2>
          <p className="mt-3 text-base leading-relaxed text-zinc-700 dark:text-zinc-300">
            A figure is only reproducible if the rows behind it still exist. Freezing the totals is
            not the same thing — it just fixes a number nobody can re-derive. Earlier versions of
            this study computed from live listing records, which are overwritten as prices move, so
            their inputs were gone the moment the run finished and the published result could not be
            re-checked by anyone, us included.
          </p>
          <p className="mt-3 text-base leading-relaxed text-zinc-700 dark:text-zinc-300">
            This revision runs in two steps. The rows are captured and hashed{" "}
            <strong>before any figure is calculated</strong>, and the calculation then reads only
            that captured file — no database, no provider, no network. Re-running it on the same
            input reproduces this page&apos;s artifact byte for byte.
          </p>
          <dl className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {[
              ["Observation cutoff", observed],
              ["Method revision", String(s.methodRevision)],
              ["Listings captured", String(s.reproducibility.inputCount)],
              ["Input digest (SHA-256)", s.reproducibility.inputDigest],
            ].map(([k, v]) => (
              <div key={k} className="rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950">
                <dt className="text-xs text-zinc-500">{k}</dt>
                <dd className="tnum mt-0.5 break-all text-sm font-semibold text-black dark:text-zinc-50">{v}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-4 text-sm text-zinc-600 dark:text-zinc-400">
            The captured rows are kept as private project evidence and are not published here. They
            carry only what the calculation needs — prices, shipping, marketplace, condition,
            grading, delivery basis and the listing title the printing rules read — and no seller
            identity, no listing or affiliate links and no raw listing ids. Publishing the digest
            rather than the rows is what lets a figure be tied to a specific input set without
            republishing other people&apos;s listings.
          </p>
          <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">
            The two steps are{" "}
            <code className="rounded bg-zinc-100 px-1 py-0.5 text-[13px] dark:bg-zinc-900">
              scripts/studies/freezeShippingCostInput.mjs
            </code>{" "}
            and{" "}
            <code className="rounded bg-zinc-100 px-1 py-0.5 text-[13px] dark:bg-zinc-900">
              scripts/studies/buildShippingCostStudy.mjs
            </code>
            .
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
              figure is whatever that listing recorded for its own offer. The domestic /
              cross-border split keeps a group on a consistent recorded basis; it does{" "}
              <em>not</em> establish that two listings ship to the same place, and it is not a
              like-for-like international comparison.
            </li>
            <li>
              <strong>These are recorded totals, not checkout prices.</strong> What you would
              actually pay depends on where you are, which delivery option you choose, and any tax
              or import charge that applies to you. Nothing here models that.
            </li>
            <li>
              <strong>Listings whose printing could not be established are excluded</strong>, so the
              comparison covers the subset we could show to be genuinely like-for-like — not every
              listing in the sample.
            </li>
            <li>
              <strong>Currencies are never combined.</strong> No conversion happens anywhere in the
              study.
            </li>
            <li>
              <strong>Only listings that charge for shipping are counted.</strong> A listing with no
              separate charge recorded is excluded throughout, so nothing here is an average over
              all listings.
            </li>
            <li>
              <strong>The reversal figure is about {s.comparableGroups.groups} groups</strong>, not
              about listings in general. It is not a rate, and it should not be read as one.
            </li>
            <li>
              <strong>The marketplace rows are descriptive.</strong> Nothing here isolates a cause,
              so no row explains <em>why</em> one marketplace&apos;s charges sit where they do.
            </li>
          </ul>
        </section>

        <section aria-labelledby="next" className="mt-10 border-t border-zinc-200 pt-8 dark:border-zinc-800">
          <h2 id="next" className="text-xl font-bold text-black dark:text-zinc-50">
            Why we compare delivered totals
          </h2>
          <p className="mt-3 text-base leading-relaxed text-zinc-700 dark:text-zinc-300">
            A reversal that happens even once in a group a buyer could plausibly be looking at is
            reason enough to compare on the delivered total rather than the item price, which is
            what we do. It is also why a listing whose shipping breakdown was never recorded shows
            no savings claim at all, rather than a flattering one computed from an assumed zero.
            Neither rule depends on how often the reversal turns out to happen.
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
