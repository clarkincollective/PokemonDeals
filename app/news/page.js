import SkipToContent from "@/components/SkipToContent";
import Link from "next/link";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import { newsSorted, formatNewsDate } from "@/lib/news";

const SITE_URL = "https://pokemondealfinder.com";
const PATH = "/news";

const TITLE = "Pokemon Card News: New Sets, New Cards & Price Movements";
const DESCRIPTION =
  "Dated news on Pokemon TCG releases, new cards and card price movements - what happened, when, and what it means for buyers. Every fact carries its official source.";

export const metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: PATH },
  openGraph: { title: TITLE, description: DESCRIPTION, url: `${SITE_URL}${PATH}`, type: "website" },
  twitter: { card: "summary", title: TITLE, description: DESCRIPTION },
};

// The hub re-renders on the same cadence as the other editorial surfaces.
// Its content is the static registry, so this only refreshes the shell.
export const revalidate = 21600;

const breadcrumbJsonLd = {
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: [
    { "@type": "ListItem", position: 1, name: "Deals", item: `${SITE_URL}/` },
    { "@type": "ListItem", position: 2, name: "News", item: `${SITE_URL}${PATH}` },
  ],
};

// Where the neighbouring surfaces live. News is the dated layer on top of
// them; these links exist so a reader (and a crawler) can reach the
// standing pages instead of the hub trying to be all of them at once.
const ELSEWHERE = [
  {
    href: "/latest-releases",
    title: "Latest releases",
    description: "The newest expansions, their official release dates and whatever listings are eligible to show for them.",
  },
  {
    href: "/market-data",
    title: "Market data",
    description: "The live market pages: most valuable cards, the most-listed cards we track, and how values are distributed.",
  },
  {
    href: "/guides",
    title: "Guides & research",
    description: "Evergreen explainers on prices, condition and grading, plus the dated studies behind how we read the market.",
  },
];

export default function NewsIndexPage() {
  const items = newsSorted();
  const itemListJsonLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "Pokemon card news",
    numberOfItems: items.length,
    itemListElement: items.map((n, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: n.title,
      url: `${SITE_URL}/news/${n.slug}`,
    })),
  };

  return (
    <div className="flex min-h-screen flex-col bg-paper">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListJsonLd) }} />
      <SkipToContent />
      <SiteHeader />

      <header className="border-b border-zinc-200 dark:border-zinc-800">
        <div className="mx-auto max-w-3xl px-6 py-6 sm:py-8">
          <h1 className="text-3xl font-bold tracking-tight text-black dark:text-zinc-50 sm:text-4xl">Latest news</h1>
          <p className="mt-3 text-base text-zinc-600 dark:text-zinc-400">
            New sets, new cards and card price movements, dated so you can see how current each item is.
            Release facts come from the official Pokemon pages and are linked to them; price figures come from
            this site&apos;s own catalogue and are described with the sample they are drawn from. For the
            standing lists rather than the news, see{" "}
            <Link href="/latest-releases" className="text-red-600 hover:underline dark:text-red-500">
              latest releases
            </Link>{" "}
            and{" "}
            <Link href="/market-data" className="text-red-600 hover:underline dark:text-red-500">
              market data
            </Link>
            .
          </p>
        </div>
      </header>

      <main id="main-content" tabIndex={-1} className="scroll-mt-6 mx-auto w-full max-w-3xl flex-1 px-6 py-6 sm:py-8">
        <section aria-labelledby="news-heading">
          <h2 id="news-heading" className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-600 dark:text-zinc-400">
            Latest
          </h2>
          <ul className="mt-4 flex flex-col gap-4">
            {items.map((n) => (
              <li key={n.slug}>
                <Link
                  href={`/news/${n.slug}`}
                  className="block rounded-xl border border-zinc-200 bg-white p-5 transition-colors hover:border-red-300 dark:border-zinc-800 dark:bg-zinc-950 dark:hover:border-zinc-600"
                >
                  <time dateTime={n.published} className="block text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                    {formatNewsDate(n.published)}
                  </time>
                  <span className="mt-1 block text-lg font-semibold text-black dark:text-zinc-50">{n.title}</span>
                  <span className="mt-2 block text-base leading-relaxed text-zinc-600 dark:text-zinc-400">{n.blurb}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="elsewhere-heading" className="mt-12">
          <h2 id="elsewhere-heading" className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-600 dark:text-zinc-400">
            Elsewhere on the site
          </h2>
          <ul className="mt-4 grid gap-3 sm:grid-cols-2">
            {ELSEWHERE.map((e) => (
              <li key={e.href}>
                <Link
                  href={e.href}
                  className="block h-full rounded-xl border border-zinc-200 bg-white p-5 transition-colors hover:border-red-300 dark:border-zinc-800 dark:bg-zinc-950 dark:hover:border-zinc-600"
                >
                  <span className="block font-semibold text-black dark:text-zinc-50">{e.title}</span>
                  <span className="mt-2 block text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">{e.description}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
