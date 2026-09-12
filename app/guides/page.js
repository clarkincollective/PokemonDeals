import Link from "next/link";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import { GUIDES } from "@/lib/guides";

const SITE_URL = "https://pokemondealfinder.com";

// SEO-2 named the actual guide content (pricing, condition, grading)
// instead of the bare section label. The page now also carries the
// market-data research, so the title names that too - the old title
// described only half of what is on the page.
const TITLE = "Pokemon Card Guides & Research: Prices, Condition & Market Data";
const DESCRIPTION =
  "Short, factual guides to buying Pokemon cards - how prices are set, condition and grading scales, raw vs. graded, vintage vs. modern - plus our dated market-data research.";

export const metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/guides" },
  openGraph: { title: TITLE, description: DESCRIPTION, url: `${SITE_URL}/guides` },
  twitter: { card: "summary", title: TITLE, description: DESCRIPTION },
};

// The research already lives at its own canonical URLs under /market-data;
// this section is a signpost to them, not a second home. Nothing here is
// newly published - the study is a fixed, dated snapshot, and its sample
// window is stated so the listing can't read as fresh.
const RESEARCH = [
  {
    href: "/market-data/pokemon-reference-price-changes",
    title: "30-Day Reference-Price Changes",
    description:
      "A dated study of 150 sampled product records: how many moved, and why a product summary differs from its individual condition and printing variants.",
    meta: "Sample window 12 August - 11 September 2026",
  },
  {
    href: "/market-data",
    title: "Market Data",
    description:
      "The live market pages: most valuable cards, the most-listed cards we are tracking, and how card values are distributed across the catalogue.",
    meta: "Updated from the current catalogue",
  },
];

const breadcrumbJsonLd = {
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: [
    { "@type": "ListItem", position: 1, name: "Deals", item: `${SITE_URL}/` },
    { "@type": "ListItem", position: 2, name: "Guides", item: `${SITE_URL}/guides` },
  ],
};

const itemListJsonLd = {
  "@context": "https://schema.org",
  "@type": "ItemList",
  name: "Pokemon card buying guides",
  numberOfItems: GUIDES.length,
  itemListElement: GUIDES.map((g, i) => ({
    "@type": "ListItem",
    position: i + 1,
    name: g.title,
    url: `${SITE_URL}/guides/${g.slug}`,
  })),
};

export default function GuidesIndexPage() {
  return (
    <div className="flex min-h-screen flex-col bg-paper">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListJsonLd) }} />
      <SiteHeader />

      <header className="border-b border-zinc-200 dark:border-zinc-800">
        <div className="mx-auto max-w-3xl px-6 py-10">
          <h1 className="text-3xl font-bold tracking-tight text-black dark:text-zinc-50 sm:text-4xl">
            Guides &amp; Research
          </h1>
          <p className="mt-3 text-base text-zinc-600 dark:text-zinc-400">
            Short, evergreen explainers — the background worth having before you buy — and the dated
            research behind how we read the market. For how this site finds and prices deals, see{" "}
            <Link href="/methodology" className="text-red-600 hover:underline dark:text-red-500">
              our methodology
            </Link>
            .
          </p>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-10">
        <section aria-labelledby="guides-heading">
          <h2
            id="guides-heading"
            className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-400"
          >
            Guides
          </h2>
          <ul className="mt-4 flex flex-col gap-4">
            {GUIDES.map((g) => (
              <li key={g.slug}>
                <Link
                  href={`/guides/${g.slug}`}
                  className="block rounded-lg border border-zinc-200 bg-white p-5 transition-colors hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-950 dark:hover:border-zinc-700"
                >
                  <span className="block font-semibold text-black dark:text-zinc-50">{g.title}</span>
                  <span className="mt-1 block text-sm text-zinc-600 dark:text-zinc-400">{g.blurb}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="research-heading" className="mt-12">
          <h2
            id="research-heading"
            className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-400"
          >
            Research
          </h2>
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
            Dated studies and market summaries. Each states its own sample and limits.
          </p>
          <ul className="mt-4 flex flex-col gap-4">
            {RESEARCH.map((r) => (
              <li key={r.href}>
                <Link
                  href={r.href}
                  className="block rounded-lg border border-zinc-200 bg-white p-5 transition-colors hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-950 dark:hover:border-zinc-700"
                >
                  <span className="block font-semibold text-black dark:text-zinc-50">{r.title}</span>
                  <span className="mt-1 block text-sm text-zinc-600 dark:text-zinc-400">
                    {r.description}
                  </span>
                  <span className="mt-2 block text-xs text-zinc-500 dark:text-zinc-500">{r.meta}</span>
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
