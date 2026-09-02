import Link from "next/link";
import { fetchMarketDataSummary, fetchLastScanTime, fetchCatalogComposition } from "@/lib/deals";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import JsonLd from "@/components/JsonLd";
import { breadcrumbList, collectionPage, itemList } from "@/lib/jsonLd";
import { formatScanTime, formatDate } from "@/lib/time";

export const revalidate = 900;

const TITLE = "Pokemon Card Market Data";
const DESCRIPTION =
  "First-party Pokemon card market data from our own live-tracked catalogue and active eBay listings - catalogue price composition, the most valuable raw references, and the most-listed cards right now.";

export const metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/market-data" },
  openGraph: { title: TITLE, description: DESCRIPTION, url: "https://pokemondealfinder.com/market-data" },
  twitter: { card: "summary", title: TITLE, description: DESCRIPTION },
};

export default async function MarketDataPage() {
  const [summary, lastScan, composition] = await Promise.all([
    fetchMarketDataSummary(),
    fetchLastScanTime(),
    fetchCatalogComposition(),
  ]);
  const updated = formatScanTime(lastScan);
  const snapshot = formatDate(composition?.snapshotAt);
  const comp = composition && !composition.error ? composition : null;

  const pages = [
    {
      href: "/market-data/most-expensive-cards",
      title: "Most Valuable Cards",
      description: "The highest raw, ungraded market references across every set we track.",
    },
    {
      href: "/market-data/most-listed-cards",
      title: "Most-Listed Cards",
      description: "Cards with the most active eBay listings we're tracking right now.",
    },
    {
      href: "/best-finds",
      title: "Today's Best Finds",
      description: "The biggest real discounts below market price right now.",
    },
    {
      href: "/sets",
      title: "Browse by Set",
      description: "Every set with an active deal, browsable one at a time.",
    },
  ];

  return (
    <div className="flex min-h-screen flex-col bg-paper">
      <JsonLd
        data={[
          breadcrumbList([
            { name: "Deals", href: "/" },
            { name: "Market data" },
          ]),
          collectionPage({
            name: TITLE,
            description: DESCRIPTION,
            url: "/market-data",
            dateModified: lastScan,
          }),
          itemList(pages.map((p) => ({ name: p.title, url: p.href }))),
        ]}
      />
      <SiteHeader />

      <header className="border-b border-zinc-200 dark:border-zinc-800">
        <div className="mx-auto max-w-5xl px-6 py-10">
          <h1 className="max-w-2xl text-3xl font-bold tracking-tight text-black dark:text-zinc-50 sm:text-4xl">
            Pokemon Card Market Data
          </h1>
          <p className="mt-3 max-w-2xl text-base text-zinc-600 dark:text-zinc-400">
            First-party numbers from the catalogue we maintain and the eBay listings we actively
            track - not estimates or scraped third-party figures. Every ranking links through to the
            card, set or Pokemon page it describes.
          </p>
          {updated && (
            <p className="mt-2 text-xs text-zinc-500">
              Live listing data updated{" "}
              <time dateTime={new Date(lastScan).toISOString()}>{updated}</time>.
            </p>
          )}

          <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Stat label="Active card deals" value={summary.activeDeals} />
            <Stat label="Active sealed deals" value={summary.activeSealed} />
            <Stat label="Cards with 2+ listings" value={summary.cardsWithMultipleSellers} />
            <Stat label="Sets with a deal" value={summary.activeSets} />
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-10">
        {comp && (
          <section className="mb-10 rounded-xl border border-zinc-200 bg-white p-6 shadow-card dark:border-zinc-800 dark:bg-zinc-950">
            <h2 className="text-lg font-semibold text-black dark:text-zinc-50">
              What a tracked Pokemon card is actually worth
            </h2>
            <p className="mt-2 max-w-3xl text-sm text-zinc-600 dark:text-zinc-400">
              Of the{" "}
              <strong className="text-black dark:text-zinc-50">
                {comp.pricedCards.toLocaleString()}
              </strong>{" "}
              individually-catalogued, priced English Pokemon cards we track across{" "}
              {comp.setCount.toLocaleString()} sets and {comp.speciesCount.toLocaleString()} Pokemon
              (excluding sealed products and oversized / World Championship reprints), the raw,
              ungraded market reference breaks down as:
            </p>

            <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {comp.bands.map((b) => (
                <div
                  key={b.label}
                  className="rounded-lg border border-zinc-200 bg-paper p-3 dark:border-zinc-800"
                >
                  <dt className="text-xs text-zinc-500">{b.label}</dt>
                  <dd className="mt-0.5 text-xl font-bold text-black dark:text-zinc-50">{b.pct}%</dd>
                  <dd className="text-[11px] text-zinc-400">{b.count.toLocaleString()} cards</dd>
                </div>
              ))}
            </dl>

            <p className="mt-4 text-sm text-zinc-600 dark:text-zinc-400">
              Median raw market reference:{" "}
              <strong className="text-black dark:text-zinc-50">
                ${comp.medianReference.toLocaleString(undefined, { minimumFractionDigits: 2 })} USD
              </strong>
              . In other words, most Pokemon cards - even catalogued, tracked ones - are worth only a
              few dollars raw; the headline chase cards are a thin slice at the top.
            </p>
            <p className="mt-2 text-xs text-zinc-500">
              {snapshot && (
                <>
                  Catalogue snapshot:{" "}
                  <time dateTime={new Date(comp.snapshotAt).toISOString()}>{snapshot}</time>.{" "}
                </>
              )}
              Raw references only, ungraded, provider PokemonPriceTracker.{" "}
              <Link href="/methodology" className="font-medium text-red-600 hover:underline dark:text-red-500">
                Methodology
              </Link>
              .
            </p>
          </section>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {pages.map((p) => (
            <Link
              key={p.href}
              href={p.href}
              className="rounded-xl border border-zinc-200 bg-white p-5 shadow-card transition-shadow hover:shadow-md dark:border-zinc-800 dark:bg-zinc-950"
            >
              <h2 className="font-semibold text-black dark:text-zinc-50">{p.title} →</h2>
              <p className="mt-1 text-sm text-zinc-500">{p.description}</p>
            </Link>
          ))}
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
      <p className="text-2xl font-bold text-black dark:text-zinc-50">{value.toLocaleString()}</p>
      <p className="mt-0.5 text-xs text-zinc-500">{label}</p>
    </div>
  );
}
