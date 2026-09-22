import SkipToContent from "@/components/SkipToContent";
import Link from "next/link";
import { fetchMarketDataSummary, fetchLastScanTime, fetchCatalogComposition } from "@/lib/deals";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import JsonLd from "@/components/JsonLd";
import { breadcrumbList, collectionPage, itemList } from "@/lib/jsonLd";
import { formatScanTime, formatDate } from "@/lib/time";

export const revalidate = 21600;

const TITLE = "Pokemon Card Market Data & Research";
const DESCRIPTION =
  "First-party Pokemon card market data: the most valuable raw references, the most-listed cards on eBay right now, and how card values are distributed.";

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

  // 2026-09-22 content organisation. One flat list mixed three different
  // kinds of page: live catalogue rankings, a FIXED dated study, and two
  // browsing destinations that are not research at all. Side by side and
  // undated, the 30-day study read as a current snapshot.
  //
  // Three labelled groups now, each saying what kind of thing it is. No
  // calculation, fetch, cache or provider call changed - this is the
  // index's own grouping and wording.
  const groups = [
    {
      title: "Market rankings & snapshots",
      blurb: "Numerical summaries of the catalogue and of live listings. These move as the catalogue and the listings move.",
      pages: [
        {
          href: "/market-data/most-expensive-cards",
          title: "Most Valuable Cards",
          description: "The highest raw, ungraded market references across every set we track.",
          meta: updated ? `Catalogue references as of ${updated}` : "Live from the current catalogue",
        },
        {
          href: "/market-data/most-listed-cards",
          title: "Most-Listed Cards",
          description: "Cards with the most active eBay listings we're tracking right now.",
          meta: "Live listing counts",
        },
        {
          // Previously reachable only from a conditional block further up
          // this page, so it vanished from the index whenever the
          // composition query returned nothing. It is a primary
          // market-data page and now has a permanent home here.
          href: "/market-data/pokemon-card-value-distribution",
          title: "Card Value Distribution",
          description: "How card values are spread across the catalogue, from the long tail of low-value cards to the top end.",
          meta: snapshot ? `Catalogue snapshot ${snapshot}` : "From the current catalogue",
        },
      ],
    },
    {
      title: "Research & historical studies",
      blurb: "Bounded, dated analyses. Each is a fixed snapshot of the window it names - not a description of today's market.",
      pages: [
        {
          href: "/market-data/pokemon-shipping-cost-study",
          title: "How Much Shipping Adds to a Listing",
          description:
            "A dated snapshot of 440 retained fixed-price listings with a recorded shipping charge: what shipping adds as a share of item price per marketplace, and how often the cheapest item price is not the cheapest delivered.",
          meta: "Observed 22 September 2026 · figures fixed at publication",
        },
        {
          href: "/market-data/pokemon-reference-price-changes",
          title: "30-Day Reference-Price Changes",
          description:
            "A dated study of 150 sampled product records: how many moved, and why a product summary differs from its individual condition and printing variants.",
          meta: "Study period 12 August - 11 September 2026 · figures fixed at publication",
        },
      ],
    },
    {
      title: "Related tools & browsing",
      blurb: "Live deal and catalogue destinations, not research articles.",
      pages: [
        {
          href: "/best-finds",
          title: "Today's Best Finds",
          description: "The biggest real discounts below market price right now. Lives in Deals; listed here as an onward link.",
        },
        {
          href: "/sets",
          title: "Browse by Set",
          description: "Every set with an active deal, browsable one at a time.",
        },
        {
          href: "/price-checker",
          title: "Price Checker",
          description: "Look up what a single card is currently referenced at.",
        },
      ],
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
          // Same set of destinations as before the regrouping, flattened
          // back out so the ItemList keeps listing every page this index
          // links to (structured data unchanged in shape and coverage).
          itemList(groups.flatMap((g) => g.pages).map((p) => ({ name: p.title, url: p.href }))),
        ]}
      />
      <SkipToContent />
      <SiteHeader />

      <header className="border-b border-zinc-200 dark:border-zinc-800">
        <div className="mx-auto max-w-5xl px-6 py-6 sm:py-8">
          <h1 className="max-w-2xl text-3xl font-bold tracking-tight text-black dark:text-zinc-50 sm:text-4xl">
            Market Data &amp; Research
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

      <main id="main-content" tabIndex={-1} className="scroll-mt-6 mx-auto w-full max-w-5xl flex-1 px-6 py-6 sm:py-8">
        {comp && (
          <section className="mb-10 rounded-xl border border-zinc-200 bg-white p-6 shadow-card dark:border-zinc-800 dark:bg-zinc-950">
            <h2 className="text-lg font-semibold text-black dark:text-zinc-50">
              What a tracked Pokemon card is actually worth
            </h2>
            <p className="mt-2 max-w-3xl text-base leading-relaxed text-zinc-600 dark:text-zinc-400">
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

            <p className="mt-4 text-base leading-relaxed text-zinc-600 dark:text-zinc-400">
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
            <p className="mt-4">
              <Link
                href="/market-data/pokemon-card-value-distribution"
                className="text-sm font-semibold text-red-600 hover:underline dark:text-red-500"
              >
                See the full Pokemon card value-distribution analysis →
              </Link>
            </p>
          </section>
        )}

        {groups.map((group) => {
          const id = `md-${group.title.replace(/[^a-z]+/gi, "-").toLowerCase()}`;
          return (
            <section key={group.title} aria-labelledby={id} className="mt-10">
              <h2 id={id} className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-600 dark:text-zinc-400">
                {group.title}
              </h2>
              <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">{group.blurb}</p>
              <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                {group.pages.map((p) => (
                  <Link
                    key={p.href}
                    href={p.href}
                    className="rounded-xl border border-zinc-200 bg-white p-5 shadow-card transition-shadow hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600 dark:border-zinc-800 dark:bg-zinc-950"
                  >
                    <h3 className="font-semibold text-black dark:text-zinc-50">{p.title} &rarr;</h3>
                    <p className="mt-1 text-base leading-relaxed text-zinc-500">{p.description}</p>
                    {/* The OBSERVATION date or study period, kept apart
                        from any publication date, so a fixed study cannot
                        read as today's market. */}
                    {p.meta && <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-500">{p.meta}</p>}
                  </Link>
                ))}
              </div>
            </section>
          );
        })}
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
