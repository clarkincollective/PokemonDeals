import Link from "next/link";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import { TRUST_CONTENT_UPDATED, TRUST_CONTENT_UPDATED_DISPLAY } from "@/lib/trustContent";

const SITE_URL = "https://pokemondealfinder.com";

const TITLE = "About";
const DESCRIPTION =
  "What Pokemon Deal Finder is: a free, independent tool that scans eBay for Pokemon cards priced below real sold-market value, with automated checks that filter out wrong, fake and stale listings. Funded by affiliate commissions that don't change your price.";

export const metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/about" },
  openGraph: { title: TITLE, description: DESCRIPTION, url: `${SITE_URL}/about` },
  twitter: { card: "summary", title: TITLE, description: DESCRIPTION },
};

const breadcrumbJsonLd = {
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: [
    { "@type": "ListItem", position: 1, name: "Deals", item: `${SITE_URL}/` },
    { "@type": "ListItem", position: 2, name: "About", item: `${SITE_URL}/about` },
  ],
};

const aboutPageJsonLd = {
  "@context": "https://schema.org",
  "@type": "AboutPage",
  name: "About Pokemon Deal Finder",
  url: `${SITE_URL}/about`,
  publisher: { "@id": `${SITE_URL}/#organization` },
  isPartOf: { "@id": `${SITE_URL}/#website` },
  dateModified: TRUST_CONTENT_UPDATED,
  lastReviewed: TRUST_CONTENT_UPDATED,
};

export default function AboutPage() {
  return (
    <div className="flex min-h-screen flex-col bg-paper">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(aboutPageJsonLd) }} />
      <SiteHeader />

      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-12">
        <h1 className="text-3xl font-bold tracking-tight text-black dark:text-zinc-50">
          About Pokemon Deal Finder
        </h1>
        <p className="mt-2 text-xs text-zinc-400">Last updated {TRUST_CONTENT_UPDATED_DISPLAY}</p>

        <p className="mt-4 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
          Pokemon Deal Finder is a free, independent tool that continuously scans eBay for Pokemon
          Trading Card Game listings priced below their recent sold-market value. Every card shown as a
          deal is a real, currently-active listing that has been matched to an exact card and checked
          against real market pricing — nothing is fabricated.
        </p>

        <h2 className="mt-10 text-lg font-bold text-black dark:text-zinc-50">What the site does</h2>
        <ul className="mt-3 flex list-disc flex-col gap-2 pl-5 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
          <li>
            Scans live eBay listings across six marketplaces (US, UK, Australia, Canada, Germany,
            Italy) for single cards, graded cards, Japanese cards, and sealed products.
          </li>
          <li>
            Matches each listing to one exact catalogue printing — name, set, collector number, card
            form and language — and compares its total price against a recent-sold market reference.
          </li>
          <li>
            Runs automated safeguards that try to remove wrong-card and wrong-printing matches,
            non-card products, obvious counterfeits in listing photos, and listings that have gone
            stale or ended.
          </li>
          <li>
            Consolidates every current listing of the same card onto one page, and aggregates by{" "}
            <Link href="/sets" className="text-red-600 hover:underline dark:text-red-500">set</Link>{" "}
            and{" "}
            <Link href="/pokemon" className="text-red-600 hover:underline dark:text-red-500">Pokemon</Link>
            . Pokemon and card pages also work as a price reference when there is no live deal.
          </li>
        </ul>
        <p className="mt-3 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
          The exact data sources, matching logic, authenticity screening and limitations are on the{" "}
          <Link href="/methodology" className="text-red-600 hover:underline dark:text-red-500">
            methodology
          </Link>{" "}
          page. The step-by-step flow is on{" "}
          <Link href="/how-it-works" className="text-red-600 hover:underline dark:text-red-500">
            how it works
          </Link>
          .
        </p>

        <h2 className="mt-10 text-lg font-bold text-black dark:text-zinc-50">Why it exists</h2>
        <p className="mt-3 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
          Pricing a Pokemon card well means knowing what the exact printing in the exact condition
          actually sells for, then finding the listings that sit below that. Doing it by hand across
          six eBay marketplaces is slow and error-prone. This site does the comparison continuously and
          only surfaces the listings worth a look.
        </p>

        <h2 className="mt-10 text-lg font-bold text-black dark:text-zinc-50">How it stays free</h2>
        <p className="mt-3 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
          The site participates in the eBay Partner Network and the TCGPlayer affiliate program. If you
          click through to a listing and buy, we may earn a commission — it does not change the price
          you pay, and there is no paid placement. Whether a listing is shown, and where it ranks,
          depends only on how far below market it is and on the automated trust and identity checks
          described in the{" "}
          <Link href="/methodology" className="text-red-600 hover:underline dark:text-red-500">
            methodology
          </Link>
          . Full details are on the{" "}
          <Link href="/affiliate-disclosure" className="text-red-600 hover:underline dark:text-red-500">
            affiliate disclosure
          </Link>{" "}
          page.
        </p>

        <h2 className="mt-10 text-lg font-bold text-black dark:text-zinc-50">What the site is not</h2>
        <p className="mt-3 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
          It is not a marketplace — every purchase happens on eBay, with the eBay seller. It does not
          hold inventory, take payment, or ship anything. It is not a card authentication or grading
          service. Card-to-listing matching and image screening are automated and not perfect, so
          always check a listing&apos;s own photos and description before buying. Prices and
          availability change constantly; figures shown were accurate as of the last scan.
        </p>

        <p className="mt-10 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
          Questions or a wrong match to report?{" "}
          <Link href="/contact" className="text-red-600 hover:underline dark:text-red-500">
            Get in touch
          </Link>
          .
        </p>
      </main>

      <SiteFooter />
    </div>
  );
}
