import Link from "next/link";
import { fetchCatalogComposition } from "@/lib/deals";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import JsonLd from "@/components/JsonLd";
import { breadcrumbList, collectionPage } from "@/lib/jsonLd";
import { formatDate } from "@/lib/time";

// Matches the fetchCatalogComposition cache (6h) - this page has no
// per-request data of its own, just the shared aggregate.
export const revalidate = 21600;

const SITE_URL = "https://pokemondealfinder.com";
const PATH = "/market-data/pokemon-card-value-distribution";

// Stable, number-free title/description (SEO Phase 10B). The distinctive
// finding (a volatile %) is rendered dynamically in the body, never in
// metadata.
const TITLE = "Pokemon Card Value Distribution";
const DESCRIPTION =
  "How raw, ungraded Pokemon card values are distributed across the priced English cards in our tracked catalogue - price bands, median value, and a dated, methodology-backed snapshot.";

export const metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: PATH },
  openGraph: { title: TITLE, description: DESCRIPTION, url: `${SITE_URL}${PATH}` },
  twitter: { card: "summary", title: TITLE, description: DESCRIPTION },
};

const nf = (n) => Number(n).toLocaleString("en-US");
const money = (n) => `$${Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default async function ValueDistributionPage() {
  const composition = await fetchCatalogComposition();
  const comp = composition && !composition.error ? composition : null;

  // Graceful, honest fallback if the aggregate is unavailable - no faked
  // numbers, page still 200s and stays indexable (structure is real).
  if (!comp) {
    return (
      <div className="flex min-h-screen flex-col bg-paper">
        <JsonLd
          data={[
            breadcrumbList([
              { name: "Deals", href: "/" },
              { name: "Market data", href: "/market-data" },
              { name: "Pokemon card value distribution" },
            ]),
            collectionPage({ name: TITLE, description: DESCRIPTION, url: PATH }),
          ]}
        />
        <SiteHeader />
        <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-16">
          <h1 className="text-3xl font-bold tracking-tight text-black dark:text-zinc-50">{TITLE}</h1>
          <p className="mt-4 text-zinc-600 dark:text-zinc-400">
            The catalogue snapshot is being refreshed. Please check back shortly, or see the{" "}
            <Link href="/market-data" className="font-medium text-red-600 hover:underline dark:text-red-500">
              market data overview
            </Link>
            .
          </p>
        </main>
        <SiteFooter />
      </div>
    );
  }

  const bandOf = (k) => comp.bands.find((b) => b.key === k) ?? { pct: 0, count: 0, label: k };
  const under5 = bandOf("under5");
  const b5to25 = bandOf("5to25");
  const b25to100 = bandOf("25to100");
  const over100 = bandOf("over100");
  const under25Pct = Math.round((under5.pct + b5to25.pct) * 10) / 10;
  const snapshotHuman = formatDate(comp.snapshotAt);
  const snapshotIso = comp.snapshotAt ? new Date(comp.snapshotAt).toISOString() : null;
  const snapshotDay = snapshotIso ? snapshotIso.slice(0, 10) : null;

  const citation = `Pokemon Deal Finder, "Pokemon Card Value Distribution", catalogue snapshot ${snapshotHuman ?? "n/a"}. ${SITE_URL}${PATH}`;

  const findings = [
    `${under5.pct}% of the analysed cards have a raw market reference under $5 (${nf(under5.count)} cards).`,
    `${under25Pct}% are under $25.`,
    `${b25to100.pct}% fall between $25 and $100 (${nf(b25to100.count)} cards).`,
    `${over100.pct}% have a raw market reference of $100 or more (${nf(over100.count)} cards).`,
    `The median raw market reference is ${money(comp.medianReference)} USD.`,
    `The analysed catalogue spans ${nf(comp.setCount)} sets and ${nf(comp.speciesCount)} Pokemon.`,
  ];

  return (
    <div className="flex min-h-screen flex-col bg-paper">
      <JsonLd
        data={[
          breadcrumbList([
            { name: "Deals", href: "/" },
            { name: "Market data", href: "/market-data" },
            { name: "Pokemon card value distribution" },
          ]),
          collectionPage({
            name: TITLE,
            description: DESCRIPTION,
            url: PATH,
            // The catalogue snapshot is real data-freshness. It is NOT a
            // publication date - see the report on why this is
            // CollectionPage (dateModified) rather than Article.
            dateModified: comp.snapshotAt,
          }),
        ]}
      />
      <SiteHeader />

      <article className="mx-auto w-full max-w-3xl flex-1 px-6 py-10">
        <nav className="text-sm text-zinc-500">
          <Link href="/market-data" className="hover:text-zinc-700 dark:hover:text-zinc-300">
            ← Market Data
          </Link>
        </nav>

        {/* --- above the fold: finding first --- */}
        <header className="mt-3">
          <h1 className="text-3xl font-bold tracking-tight text-black dark:text-zinc-50 sm:text-4xl">
            {TITLE}
          </h1>
          <p className="mt-4 text-lg text-zinc-800 dark:text-zinc-200">
            <strong className="text-black dark:text-zinc-50">{under5.pct}%</strong> of the{" "}
            <strong className="text-black dark:text-zinc-50">{nf(comp.pricedCards)}</strong> priced
            English Pokemon cards in our current analysed catalogue have a raw market reference{" "}
            <strong className="text-black dark:text-zinc-50">under $5</strong>.
          </p>
          {snapshotHuman && (
            <p className="mt-2 text-sm text-zinc-500">
              Catalogue snapshot: <time dateTime={snapshotDay}>{snapshotHuman}</time>. Raw, ungraded
              market references only.
            </p>
          )}
          <p className="mt-1 text-sm text-zinc-500">
            Analysed population: individually-catalogued, priced, English, non-specialty Pokemon cards
            with a usable raw market reference.
          </p>
        </header>

        {/* --- chart --- */}
        <section className="mt-8" aria-labelledby="chart-heading">
          <h2 id="chart-heading" className="text-xl font-semibold text-black dark:text-zinc-50">
            Pokemon card value distribution
          </h2>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            Share of the {nf(comp.pricedCards)} analysed cards in each raw-market-reference band.
          </p>

          <table className="mt-4 w-full border-collapse text-sm">
            <caption className="sr-only">
              Raw market reference distribution of {nf(comp.pricedCards)} priced English non-specialty
              Pokemon cards, catalogue snapshot {snapshotHuman}. Under $5: {under5.pct}% ({nf(under5.count)}{" "}
              cards). $5 to $25: {b5to25.pct}% ({nf(b5to25.count)} cards). $25 to $100: {b25to100.pct}% (
              {nf(b25to100.count)} cards). $100 or more: {over100.pct}% ({nf(over100.count)} cards).
            </caption>
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-zinc-400">
                <th scope="col" className="w-28 py-1 font-medium">Raw value</th>
                <th scope="col" className="py-1 font-medium">Share of catalogue</th>
                <th scope="col" className="w-16 py-1 text-right font-medium">Share</th>
                <th scope="col" className="w-20 py-1 text-right font-medium">Cards</th>
              </tr>
            </thead>
            <tbody>
              {comp.bands.map((b) => (
                <tr key={b.key} className="border-t border-zinc-100 dark:border-zinc-900">
                  <th scope="row" className="py-2 pr-2 text-left font-medium text-black dark:text-zinc-50">
                    {b.label}
                  </th>
                  <td className="py-2 pr-3">
                    <span className="flex items-center gap-2">
                      <span
                        className="inline-block h-3 rounded-sm bg-red-500 dark:bg-red-500"
                        style={{ width: `${Math.max(b.pct, 0.6)}%` }}
                        aria-hidden="true"
                      />
                      <span className="text-xs text-zinc-400">{b.pct}%</span>
                    </span>
                  </td>
                  <td className="py-2 text-right font-semibold tabular-nums text-black dark:text-zinc-50">
                    {b.pct}%
                  </td>
                  <td className="py-2 text-right tabular-nums text-zinc-500">{nf(b.count)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <p className="mt-3 text-xs text-zinc-400">
            Pokemon Deal Finder &middot; pokemondealfinder.com &middot; snapshot {snapshotHuman}
          </p>
        </section>

        {/* --- core statistics --- */}
        <section className="mt-10" aria-labelledby="stats-heading">
          <h2 id="stats-heading" className="sr-only">Core statistics</h2>
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Stat label="Analysed cards" value={nf(comp.pricedCards)} />
            <Stat label="Sets represented" value={nf(comp.setCount)} />
            <Stat label="Pokemon represented" value={nf(comp.speciesCount)} />
            <Stat label="Median raw reference" value={`${money(comp.medianReference)} USD`} />
            <Stat label="Under $5" value={`${under5.pct}%`} />
            <Stat label="Under $25" value={`${under25Pct}%`} />
            <Stat label="$100 or more" value={`${over100.pct}%`} />
          </dl>
        </section>

        {/* --- key findings --- */}
        <section className="mt-10" aria-labelledby="findings-heading">
          <h2 id="findings-heading" className="text-xl font-semibold text-black dark:text-zinc-50">
            Key findings
          </h2>
          <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm text-zinc-700 dark:text-zinc-300">
            {findings.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
          <p className="mt-4 text-sm text-zinc-600 dark:text-zinc-400">
            The distribution shows how unusual high-value cards are within the priced catalogue we
            track: the large majority of individually-catalogued, priced cards carry a raw reference
            of only a few dollars, while cards at $100 or more are a small minority - even though
            record-setting cards dominate news coverage of the hobby.
          </p>
        </section>

        {/* --- definitions --- */}
        <section className="mt-10" aria-labelledby="defs-heading">
          <h2 id="defs-heading" className="text-xl font-semibold text-black dark:text-zinc-50">
            What these numbers are (and are not)
          </h2>
          <ul className="mt-3 space-y-2 text-sm text-zinc-700 dark:text-zinc-300">
            <li>
              <strong className="text-black dark:text-zinc-50">Raw market reference</strong> is an
              estimate of recent ungraded sold value. It is <strong>not</strong> a PSA 10 / BGS / CGC
              graded price, and <strong>not</strong> a confirmed auction-record sale.
            </li>
            <li>
              The <strong className="text-black dark:text-zinc-50">tracked, priced catalogue</strong>{" "}
              is the set of English cards we hold a usable raw reference for. It is{" "}
              <strong>not</strong> every Pokemon card ever printed.
            </li>
            <li>
              <strong className="text-black dark:text-zinc-50">Non-specialty</strong> excludes the
              formats the site&apos;s shared classification treats as specialty - oversized
              &ldquo;Jumbo&rdquo; cards and World Championship deck reprints - so a single $10,000
              jumbo cannot distort the bands.
            </li>
          </ul>
        </section>

        {/* --- methodology --- */}
        <section className="mt-10" aria-labelledby="method-heading">
          <h2 id="method-heading" className="text-xl font-semibold text-black dark:text-zinc-50">
            How this analysis was calculated
          </h2>
          <p className="mt-3 text-sm text-zinc-700 dark:text-zinc-300">
            We scan the English cards in our catalogue and keep each one that is an individually
            identifiable card with an image, a stable catalogue id, and a usable (non-placeholder)
            raw market reference. From that set we exclude specialty formats (oversized / Jumbo and
            World Championship deck reprints). Every surviving card is placed in one raw-value band by
            its market reference, and the median is taken over the same set. Market references come
            from our pricing provider, <span className="font-medium">PokemonPriceTracker</span>, and
            are held in USD; a reference is an estimate of recent ungraded sold value, not a
            guaranteed price. The snapshot date is the newest catalogue sync time, not the date this
            page was published. Full detail:{" "}
            <Link href="/methodology" className="font-medium text-red-600 hover:underline dark:text-red-500">
              methodology
            </Link>
            .
          </p>
        </section>

        {/* --- citation --- */}
        <section className="mt-10" aria-labelledby="cite-heading">
          <h2 id="cite-heading" className="text-xl font-semibold text-black dark:text-zinc-50">
            Citing this analysis
          </h2>
          <p className="mt-3 text-sm text-zinc-700 dark:text-zinc-300">
            If you reference these figures, please identify them as Pokemon Deal Finder&apos;s analysis
            of the priced English non-specialty cards in its tracked catalogue, and include the
            snapshot date. A link back to this page is appreciated but not required.
          </p>
          <p className="mt-3 rounded-lg border border-zinc-200 bg-white p-3 text-xs text-zinc-600 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-400">
            {citation}
          </p>
        </section>

        {/* --- related --- */}
        <section className="mt-10 border-t border-zinc-200 pt-6 dark:border-zinc-800">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-400">Related</h2>
          <ul className="mt-2 space-y-1 text-sm">
            <li>
              <Link href="/market-data/most-expensive-cards" className="text-red-600 hover:underline dark:text-red-500">
                Most valuable cards by raw market value
              </Link>
            </li>
            <li>
              <Link href="/market-data/most-listed-cards" className="text-red-600 hover:underline dark:text-red-500">
                Cards with the most current eBay listings
              </Link>
            </li>
            <li>
              <Link href="/cards" className="text-red-600 hover:underline dark:text-red-500">
                Browse the full card catalogue
              </Link>
            </li>
            <li>
              <Link href="/search" className="text-red-600 hover:underline dark:text-red-500">
                Check a specific card&apos;s price
              </Link>
            </li>
          </ul>
        </section>
      </article>

      <SiteFooter />
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
      <dt className="text-xs text-zinc-500">{label}</dt>
      <dd className="mt-0.5 text-xl font-bold tabular-nums text-black dark:text-zinc-50">{value}</dd>
    </div>
  );
}
