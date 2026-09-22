import SkipToContent from "@/components/SkipToContent";
import Link from "next/link";
import Image from "next/image";
import { catalogImageUrl } from "@/lib/cardImage";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import { GUIDES } from "@/lib/guides";
import { serializeJsonLd, collectionPage } from "@/lib/jsonLd";

const SITE_URL = "https://pokemondealfinder.com";

// SEO-2 named the actual guide content (pricing, condition, grading)
// instead of the bare section label. The page now also carries the
// market-data research, so the title names that too - the old title
// described only half of what is on the page.
const TITLE = "Pokemon Card Buying & Collecting Guides";
const DESCRIPTION =
  "Factual guides to buying Pokemon cards: how prices are set, condition and grading, raw vs graded, vintage vs modern, buying safely on eBay.";

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
const GUIDE_GROUPS = [
  // 2026-09-22 content organisation. The old "New releases" bucket held
  // 13 of the 28 guides and mixed four different jobs - release-date
  // references, product comparisons, checklists, sealed-product
  // explainers - under a label that described WHEN they were written
  // rather than what they help a reader do. It also aged badly: a
  // "new release" grouping is wrong the moment the set is old.
  //
  // These five groups describe the READER'S TASK, so a guide's home does
  // not change as its subject ages. Every one of the 28 guides sits in
  // exactly one group (asserted in tests/scanner/content-organisation).
  //
  // What did NOT move: no URL, no canonical, no article body, no
  // published date. This is index grouping only.
  {
    title: "Identify your card",
    blurb: "Work out exactly which card and printing you are holding, before you price it.",
    slugs: [
      "how-to-find-pokemon-card-set-and-number",
      "base-set-shadowless-unlimited-first-edition",
      "pokemon-promo-card-numbers",
      "vintage-vs-modern-pokemon-cards",
      // Its principal job is telling a Classic Collection reprint from the
      // original card it reprints - an identification question, not a
      // sealed-product one. URL, content and canonical unchanged.
      "pokemon-30th-celebration-classic-collection",
      "holo-vs-reverse-holo-pokemon-cards",
    ],
  },
  {
    title: "Prices, condition & grading",
    blurb: "What a card is worth, what condition means, and what a grade number actually says.",
    slugs: [
      "how-much-is-my-pokemon-card-worth",
      "how-pokemon-card-prices-work",
      "raw-vs-graded-pokemon-cards",
      "card-condition-grading",
      "how-to-check-pokemon-card-condition",
      "pokemon-card-grading-scale",
    ],
  },
  {
    title: "Buying safely",
    blurb: "Reading a listing, spotting a fake, and knowing what a below-market price does and does not tell you.",
    slugs: [
      "buying-pokemon-cards-on-ebay-safely",
      "how-to-read-a-pokemon-card-listing",
      "spotting-fake-pokemon-cards-in-listings",
      "vintage-pokemon-cards-worth-buying",
      "check-graded-pokemon-card-certificate",
    ],
  },
  {
    title: "Sealed products",
    blurb: "Boxes and sealed sets: how they are priced, and what to check before paying.",
    slugs: [
      "pokemon-booster-box-prices",
      "booster-box-vs-etb-vs-booster-bundle",
      "pokemon-30th-celebration-elite-trainer-box",
    ],
  },
  {
    title: "Set & collecting guides",
    blurb: "Individual sets in depth - what is in them, what is confirmed, and how to collect them.",
    slugs: [
      "pokemon-30th-celebration-guide",
      "pokemon-30th-celebration-release-dates",
      "pokemon-30th-celebration-pikachu-checklist",
      "pokemon-30th-celebration-promo-cards",
      "pokemon-30th-celebration-mew-mewtwo",
      "organise-pokemon-30th-celebration-collection",
      "best-pokemon-30th-celebration-cards",
      "best-pokemon-30th-celebration-pikachu-cards",
      "pokemon-delta-reign-release-date-what-is-official",
      "storm-emeralda-vs-delta-reign-japanese-or-english",
      "delta-reign-preorders-and-prerelease-what-to-know",
      "pokemon-151-buying-guide",
      "prismatic-evolutions-buying-guide",
      "crown-zenith-galarian-gallery-guide",
      "surging-sparks-which-pikachu",
      "japanese-vs-english-pokemon-cards",
      "complete-set-vs-master-set",
    ],
  },
];

// Editorial picks are opinion, not reference, and are labelled as such
// so a "best cards" selection is never read as a ranking we measured.
const EDITORIAL_PICKS = new Set(["best-pokemon-30th-celebration-cards", "best-pokemon-30th-celebration-pikachu-cards"]);

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
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(breadcrumbJsonLd) }} />
      {/* Every other index on the site (deals, cards, sets, pokemon,
          market-data) types itself as a CollectionPage; these two carried
          only the ItemList, so the PAGE itself had no type. Accurate -
          this is a collection of editorial items (2026-09-21 audit). */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(collectionPage({ name: TITLE, description: DESCRIPTION, url: "/guides" })) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(itemListJsonLd) }} />
      <SkipToContent />
      <SiteHeader />

      <header className="border-b border-zinc-200 dark:border-zinc-800">
        <div className="mx-auto max-w-3xl px-6 py-6 sm:py-8">
          <h1 className="text-3xl font-bold tracking-tight text-black dark:text-zinc-50 sm:text-4xl">
            Buying &amp; Collecting Guides
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
              {/* The group's one-line purpose, OUTSIDE the grid: as a
                  child of the <ul> it took a card cell and read as an
                  untitled guide. */}
              {group.blurb && (
                <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{group.blurb}</p>
              )}
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
                    <span className="block font-semibold text-black dark:text-zinc-50">
                      {g.title}
                      {EDITORIAL_PICKS.has(g.slug) && (
                        <span className="ml-2 inline-block rounded border border-zinc-300 px-1.5 py-px align-middle text-[11px] font-medium uppercase tracking-wide text-zinc-600 dark:border-zinc-700 dark:text-zinc-400">
                          Editorial pick
                        </span>
                      )}
                    </span>
                    <span className="mt-2 block text-base leading-relaxed text-zinc-600 dark:text-zinc-400">{g.blurb}</span>
                  </span>
                </Link>
              </li>
            ))}
              </ul>
            </section>
          ))}
        </section>

        {/* RESEARCH IS NOT A GUIDES CATEGORY. The dated studies and the
            live market summaries have their own canonical home at
            /market-data; listing them here as a peer of the five reader
            tasks implied they were guides, and a dated study sitting in
            an evergreen index reads as current. This is now one
            cross-link, clearly labelled as a different kind of page. */}
        <aside aria-labelledby="research-heading" className="mt-12 rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
          <h2
            id="research-heading"
            className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-600 dark:text-zinc-400"
          >
            Looking for numbers?
          </h2>
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
            Rankings, catalogue snapshots and dated studies are not guides - they live in{" "}
            <Link href="/market-data" className="font-semibold text-red-600 hover:underline dark:text-red-500">
              Market Data &amp; Research
            </Link>
            , where each one states its own observation date, sample and limits.
          </p>
        </aside>
      </main>

      <SiteFooter />
    </div>
  );
}
