import SkipToContent from "@/components/SkipToContent";
import Link from "next/link";
import Image from "next/image";
import { catalogImageUrl } from "@/lib/cardImage";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import { newsSorted, formatNewsDate, newsImageUrl } from "@/lib/news";
import { serializeJsonLd, collectionPage } from "@/lib/jsonLd";

const SITE_URL = "https://pokemondealfinder.com";
const PATH = "/news";

const TITLE = "Pokemon Card News: Sets, Cards & Prices";
const DESCRIPTION =
  "Dated news on Pokemon TCG releases, new cards and price movements: what happened, when, and what it means for buyers, with sources.";

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

// The 30th Celebration cluster. These live in /guides because they are
// reference and editorial rather than dated news; the hub links them so a
// reader arriving for the release finds the depth without the same article
// existing under two URLs.
// Each carries the catalogue id of a real card from the article, so the
// cluster reads visually rather than as ten lines of text.
const C30_COVERAGE = [
  {
    href: "/guides/pokemon-30th-celebration-guide",
    title: "30th Celebration collector's guide",
    description: "The overview: what the set is, how it differs from Celebrations (2021), and every announced product.",
    image: "696688",
  },
  {
    href: "/guides/pokemon-30th-celebration-pikachu-checklist",
    title: "All 30 Pikachu cards: visual checklist",
    description: "Every Pikachu rare from 023/128 to 052/128 in printed order, and which Pikachu cards do not count.",
    image: "712934",
  },
  {
    href: "/guides/best-pokemon-30th-celebration-pikachu-cards",
    title: "Best Pikachu artwork: our picks",
    description: "Our editorial selection from the thirty, with the criteria we used. Not a value or rarity ranking.",
    image: "712953",
  },
  {
    href: "/guides/pokemon-30th-celebration-classic-collection",
    title: "Classic Collection: reprint or original?",
    description: "A 2026 reprint and a 1999 card can both read 4/102. How to tell them apart before you buy.",
    image: "714372",
  },
  {
    href: "/guides/pokemon-30th-celebration-elite-trainer-box",
    title: "Elite Trainer Box vs Pokemon Center ETB",
    description: "Two extra packs and a second Nidorina promo. The two boxes compared from their official contents lists.",
    image: "716465",
  },
  {
    href: "/guides/pokemon-30th-celebration-promo-cards",
    title: "Promo cards: which product has which",
    description: "Every guaranteed promo and the product it ships in — and why you cannot pull a promo from a pack.",
    image: "696687",
  },
  {
    href: "/guides/pokemon-30th-celebration-release-dates",
    title: "Release dates: UK and US schedules",
    description: "The products arrive in waves, and the official UK and US pages disagree on two of them.",
    image: "716232",
  },
  {
    href: "/guides/pokemon-30th-celebration-mew-mewtwo",
    title: "Mew and Mewtwo, and the Futuristic rares",
    description: "The set's brand-new rarity, and all six Mew and Mewtwo cards — four of which share a name.",
    image: "716463",
  },
  {
    href: "/guides/best-pokemon-30th-celebration-cards",
    title: "The best cards beyond Pikachu",
    description: "Our editorial picks from the illustration rares, special illustration rares and ex cards.",
    image: "696683",
  },
  {
    href: "/guides/organise-pokemon-30th-celebration-collection",
    title: "Organising a 30th Celebration collection",
    description: "Five groups that need handling differently, and how to decide what “complete” means.",
    image: "716231",
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
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(breadcrumbJsonLd) }} />
      {/* Every other index on the site (deals, cards, sets, pokemon,
          market-data) types itself as a CollectionPage; these two carried
          only the ItemList, so the PAGE itself had no type. Accurate -
          this is a collection of editorial items (2026-09-21 audit). */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(collectionPage({ name: TITLE, description: DESCRIPTION, url: "/news" })) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(itemListJsonLd) }} />
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
                  className="flex gap-4 rounded-xl border border-zinc-200 bg-white p-5 transition-colors hover:border-red-300 dark:border-zinc-800 dark:bg-zinc-950 dark:hover:border-zinc-600"
                >
                  {newsImageUrl(n) && (
                    <Image
                      src={newsImageUrl(n)}
                      alt=""
                      aria-hidden="true"
                      width={72}
                      height={100}
                      sizes="72px"
                      className="h-[100px] w-[72px] shrink-0 self-start rounded-md object-cover shadow-sm"
                    />
                  )}
                  <span className="block">
                    <time dateTime={n.published} className="block text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                      {formatNewsDate(n.published)}
                    </time>
                    <span className="mt-1 block text-lg font-semibold text-black dark:text-zinc-50">{n.title}</span>
                    <span className="mt-2 block text-base leading-relaxed text-zinc-600 dark:text-zinc-400">{n.blurb}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>

        {/* 2026-09-22: THESE ARE GUIDES, NOT NEWS. They render at
            /guides/* and are evergreen; only their subject overlaps with
            a news story. Presented as large bordered cards with artwork
            they were visually indistinguishable from the dated stories
            above, so the section read as ten extra news items.
            It is now a compact, clearly labelled cross-link list: no
            artwork, no dates (they have none to show), an explicit
            "Guide" tag on each, and a route to the full Guides index.
            No URL, body or date changed - presentation only. */}
        <section aria-labelledby="c30-heading" className="mt-12 border-t border-zinc-200 pt-8 dark:border-zinc-800">
          <h2 id="c30-heading" className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-600 dark:text-zinc-400">
            Explore 30th Celebration guides
          </h2>
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
            Evergreen background on the anniversary expansion - not news. The collector&apos;s guide is
            the overview; each companion answers one question.
          </p>
          <ul className="mt-4 grid gap-x-6 gap-y-1 sm:grid-cols-2">
            {C30_COVERAGE.map((c) => (
              <li key={c.href}>
                <Link
                  href={c.href}
                  className="flex min-h-11 items-center gap-2 rounded-md py-1.5 text-sm text-zinc-700 underline-offset-2 hover:text-red-600 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600 dark:text-zinc-300 dark:hover:text-red-500"
                >
                  <span className="shrink-0 rounded border border-zinc-300 px-1.5 py-px text-[11px] font-medium uppercase tracking-wide text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
                    Guide
                  </span>
                  <span className="min-w-0">{c.title}</span>
                </Link>
              </li>
            ))}
          </ul>
          <p className="mt-5 text-sm">
            <Link href="/guides" className="font-semibold text-red-600 hover:underline dark:text-red-500">
              All buying &amp; collecting guides →
            </Link>
          </p>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
