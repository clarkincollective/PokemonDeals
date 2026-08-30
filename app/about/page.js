import Link from "next/link";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";

const SITE_URL = "https://pokemondealfinder.com";

const TITLE = "About";
const DESCRIPTION =
  "What Pokemon Deal Finder is: a free tool that continuously scans eBay for Pokemon cards priced below real market value, funded by affiliate commissions that don't change the price you pay.";

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
  publisher: { "@type": "Organization", name: "Pokemon Deal Finder", url: SITE_URL },
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

        <p className="mt-4 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
          Pokemon Deal Finder is a free tool that continuously scans eBay for Pokemon Trading Card Game
          listings priced below their real market value. Every card shown is a real, currently-active
          listing that has been checked against real market pricing and recent eBay sold-listing data —
          not an estimate, and nothing is fabricated.
        </p>

        <h2 className="mt-10 text-lg font-bold text-black dark:text-zinc-50">What the site does</h2>
        <ul className="mt-3 flex list-disc flex-col gap-2 pl-5 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
          <li>
            Scans live eBay listings across five marketplaces (US, UK, Australia, Canada, Germany) for
            single cards, graded cards, Japanese cards, and sealed products.
          </li>
          <li>
            Compares each listing to the card&apos;s real market price for its condition, and graded
            cards to real graded sold comps.
          </li>
          <li>
            Surfaces only listings that are meaningfully below market from sellers that pass a set of
            trust checks.
          </li>
          <li>
            Consolidates every current listing of the same card onto one page, and aggregates deals by{" "}
            <Link href="/sets" className="text-red-600 hover:underline dark:text-red-500">
              set
            </Link>{" "}
            and by{" "}
            <Link href="/pokemon" className="text-red-600 hover:underline dark:text-red-500">
              Pokemon
            </Link>
            .
          </li>
        </ul>
        <p className="mt-3 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
          The exact rules are documented on the{" "}
          <Link href="/methodology" className="text-red-600 hover:underline dark:text-red-500">
            methodology
          </Link>{" "}
          page, and the scanning and pricing flow is explained on{" "}
          <Link href="/how-it-works" className="text-red-600 hover:underline dark:text-red-500">
            how it works
          </Link>
          .
        </p>

        <h2 className="mt-10 text-lg font-bold text-black dark:text-zinc-50">How it stays free</h2>
        <p className="mt-3 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
          The site participates in the eBay Partner Network and the TCGPlayer affiliate program. If you
          click through to a listing and buy, we may earn a commission — it does not change the price
          you pay, and there is no paid placement: ranking is based only on how far below market a
          listing is and the trust checks described in the{" "}
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
          hold inventory, take payment, or ship anything. Card-to-listing matching is automated and not
          perfect, so always check a listing&apos;s own photos and description before buying. Prices and
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
