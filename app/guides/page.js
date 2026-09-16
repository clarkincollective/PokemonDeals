import SkipToContent from "@/components/SkipToContent";
import Link from "next/link";
import Image from "next/image";
import { catalogImageUrl } from "@/lib/cardImage";
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

const GUIDE_GROUPS = [
  {
    title: "New releases",
    slugs: [
      "pokemon-30th-celebration-guide",
      "pokemon-30th-celebration-pikachu-checklist",
      "best-pokemon-30th-celebration-pikachu-cards",
      "pokemon-30th-celebration-classic-collection",
      "pokemon-30th-celebration-elite-trainer-box",
      "pokemon-30th-celebration-promo-cards",
      "pokemon-30th-celebration-release-dates",
      "pokemon-30th-celebration-mew-mewtwo",
      "best-pokemon-30th-celebration-cards",
      "organise-pokemon-30th-celebration-collection",
    ],
  },
  { title: "Identify your card", slugs: ["how-to-find-pokemon-card-set-and-number", "base-set-shadowless-unlimited-first-edition", "vintage-vs-modern-pokemon-cards"] },
  { title: "Understand its price", slugs: ["how-much-is-my-pokemon-card-worth", "how-pokemon-card-prices-work", "raw-vs-graded-pokemon-cards"] },
  { title: "Check condition and grade", slugs: ["card-condition-grading", "how-to-check-pokemon-card-condition", "pokemon-card-grading-scale"] },
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
      <SkipToContent />
      <SiteHeader />

      <header className="border-b border-zinc-200 dark:border-zinc-800">
        <div className="mx-auto max-w-3xl px-6 py-6 sm:py-8">
          <h1 className="text-3xl font-bold tracking-tight text-black dark:text-zinc-50 sm:text-4xl">
            Guides &amp; Research
          </h1>
          <p className="mt-3 text-base text-zinc-600 dark:text-zinc-400">
            Short, evergreen explainers — the background worth having before you buy — and the dated
            research behind how we read the market. For dated items on new sets, new cards and price
            movements, see{" "}
            <Link href="/news" className="text-red-600 hover:underline dark:text-red-500">
              latest news
            </Link>
            ; for how this site finds and prices deals, see{" "}
            <Link href="/methodology" className="text-red-600 hover:underline dark:text-red-500">
              our methodology
            </Link>
            .
          </p>
        </div>
      </header>

      <main id="main-content" tabIndex={-1} className="scroll-mt-6 mx-auto w-full max-w-3xl flex-1 px-6 py-6 sm:py-8">
        <section aria-labelledby="guides-heading">
          <h2
            id="guides-heading"
            className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-600 dark:text-zinc-400"
          >
            Guides
          </h2>
          {GUIDE_GROUPS.map(group => (
            <section key={group.title} className="mt-6">
              <h3 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">{group.title}</h3>
              <ul className="mt-3 grid gap-3 sm:grid-cols-2">
            {group.slugs.map(slug => GUIDES.find(g => g.slug === slug)).map((g) => (
              <li key={g.slug}>
                <Link
                  href={`/guides/${g.slug}`}
                  className="flex h-full gap-4 rounded-xl border border-zinc-200 bg-white p-5 transition-colors hover:border-red-300 dark:border-zinc-800 dark:bg-zinc-950 dark:hover:border-zinc-600"
                >
                  {/* A guide with a registry `image` shows that card as its
                      thumbnail - a real catalogue scan, the same source the
                      card pages use. Fixed 717:1000 box so the row never
                      shifts as the lazy image arrives. */}
                  {g.image && (
                    <Image
                      src={catalogImageUrl(g.image)}
                      alt=""
                      aria-hidden="true"
                      width={64}
                      height={89}
                      sizes="64px"
                      className="h-auto w-16 shrink-0 self-start rounded-md shadow-sm"
                    />
                  )}
                  <span className="block">
                    <span className="block font-semibold text-black dark:text-zinc-50">{g.title}</span>
                    <span className="mt-2 block text-base leading-relaxed text-zinc-600 dark:text-zinc-400">{g.blurb}</span>
                  </span>
                </Link>
              </li>
            ))}
              </ul>
            </section>
          ))}
        </section>

        <section aria-labelledby="research-heading" className="mt-12">
          <h2
            id="research-heading"
            className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-600 dark:text-zinc-400"
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
