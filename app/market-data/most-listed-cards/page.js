import Link from "next/link";
import { fetchMostListedCards } from "@/lib/deals";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import JsonLd from "@/components/JsonLd";
import { breadcrumbList, collectionPage, itemList } from "@/lib/jsonLd";
import { formatScanTime } from "@/lib/time";

export const revalidate = 900;

const TITLE = "Most-Listed Pokemon Cards";
const DESCRIPTION =
  "Pokemon cards with the most currently displayable eBay listings in the listings Pokemon Deal Finder tracks - a live snapshot of listing availability. Not distinct sellers, and not how often a card is searched or sold.";

export const metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/market-data/most-listed-cards" },
  openGraph: { title: TITLE, description: DESCRIPTION, url: "https://pokemondealfinder.com/market-data/most-listed-cards" },
  twitter: { card: "summary", title: TITLE, description: DESCRIPTION },
};

export default async function MostListedCardsPage() {
  const { cards, snapshotAt } = await fetchMostListedCards({ language: "english" });
  const top = cards.slice(0, 100);
  const updated = formatScanTime(snapshotAt);

  return (
    <div className="flex min-h-screen flex-col bg-paper">
      <JsonLd
        data={[
          breadcrumbList([
            { name: "Deals", href: "/" },
            { name: "Market data", href: "/market-data" },
            { name: "Most-listed cards" },
          ]),
          collectionPage({
            name: TITLE,
            description: DESCRIPTION,
            url: "/market-data/most-listed-cards",
            dateModified: snapshotAt,
          }),
          itemList(top.map((c) => ({ name: `${c.name} (${c.set})`, url: `/cards/${c.slug}` }))),
        ]}
      />
      <SiteHeader />

      <header className="border-b border-zinc-200 dark:border-zinc-800">
        <div className="mx-auto max-w-4xl px-6 py-10">
          <Link href="/market-data" className="text-sm font-medium text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300">
            ← Market Data
          </Link>
          <h1 className="mt-3 max-w-2xl text-3xl font-bold tracking-tight text-black dark:text-zinc-50 sm:text-4xl">
            Most-Listed Pokemon Cards
          </h1>
          <p className="mt-3 max-w-2xl text-base text-zinc-600 dark:text-zinc-400">
            The {top.length} cards with the most <strong>currently displayable</strong> eBay listings
            in the listings we track. Every listing counted here passes the same quality checks the
            rest of the site uses before a listing is shown - so a card ranks on availability we&apos;d
            actually put in front of you, not raw scan volume. More listings usually means more price
            competition.
          </p>
          <p className="mt-2 max-w-2xl text-xs text-zinc-500">
            A live snapshot of single-card listings our scanner tracks across six marketplaces - not
            the whole eBay market, not distinct sellers, and not a measure of how often a card is
            searched for or sold.{" "}
            <Link href="/methodology" className="font-medium text-red-600 hover:underline dark:text-red-500">
              Methodology
            </Link>
            .
          </p>
          {updated && (
            <p className="mt-2 text-xs text-zinc-500">
              Listing counts as of <time dateTime={new Date(snapshotAt).toISOString()}>{updated}</time>.
            </p>
          )}
        </div>
      </header>

      <main className="mx-auto w-full max-w-4xl flex-1 px-6 py-10">
        <ol className="divide-y divide-zinc-100 dark:divide-zinc-900">
          {top.map((card, i) => (
            <li key={card.id}>
              <Link
                href={`/cards/${card.slug}`}
                className="flex items-center justify-between gap-4 py-3 hover:bg-zinc-50 dark:hover:bg-zinc-950"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span className="w-6 shrink-0 text-right text-sm font-semibold text-zinc-400">{i + 1}</span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-black dark:text-zinc-50">{card.name}</p>
                    <p className="truncate text-xs text-zinc-500">{card.set}</p>
                  </div>
                </div>
                <span className="shrink-0 rounded-md bg-zinc-100 px-2 py-0.5 text-xs font-semibold text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                  {card.count} listings
                </span>
              </Link>
            </li>
          ))}
        </ol>
      </main>

      <SiteFooter />
    </div>
  );
}
