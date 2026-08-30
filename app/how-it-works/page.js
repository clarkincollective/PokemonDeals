import Link from "next/link";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";

const SITE_URL = "https://pokemondealfinder.com";

const TITLE = "How It Works";
const DESCRIPTION =
  "How Pokemon Deal Finder scans eBay, checks each listing against real market and sold-listing pricing, and surfaces only genuine below-market deals — plus how often it updates.";

export const metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/how-it-works" },
  openGraph: { title: TITLE, description: DESCRIPTION, url: `${SITE_URL}/how-it-works` },
  twitter: { card: "summary", title: TITLE, description: DESCRIPTION },
};

const breadcrumbJsonLd = {
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: [
    { "@type": "ListItem", position: 1, name: "Deals", item: `${SITE_URL}/` },
    { "@type": "ListItem", position: 2, name: "How It Works", item: `${SITE_URL}/how-it-works` },
  ],
};

export default function HowItWorksPage() {
  return (
    <div className="flex min-h-screen flex-col bg-paper">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }} />
      <SiteHeader />

      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-12">
        <h1 className="text-3xl font-bold tracking-tight text-black dark:text-zinc-50">
          How Pokemon Deal Finder Works
        </h1>
        <p className="mt-4 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
          Three stages run on a schedule, around the clock: discovering new eBay listings, pricing them
          against real data, and filtering out everything that isn&apos;t a genuine below-market deal.
        </p>

        <h2 className="mt-10 text-lg font-bold text-black dark:text-zinc-50">1. Scanning eBay</h2>
        <p className="mt-3 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
          New listings are discovered continuously through the eBay Browse API, in the Pokemon
          individual-cards category — every 15 minutes on the US marketplace and every couple of
          hours on the UK, Australia, Canada, Germany, and Italy marketplaces. Separately, listings
          already on the site are re-checked to confirm they&apos;re still active and still a deal: a
          hand-picked priority set of cards every 6 hours across all six marketplaces, and the wider
          catalogue (tens of thousands of cards) one slice per marketplace per day, cycling through
          the whole list about once a month. The card catalogue itself is re-synced daily, and sealed products are
          re-scanned daily.
        </p>

        <h2 className="mt-10 text-lg font-bold text-black dark:text-zinc-50">2. Checking real pricing</h2>
        <p className="mt-3 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
          Each listing is compared against the card&apos;s real market price for its condition, drawn
          from PokemonPriceTracker&apos;s pricing data and backed by recent eBay sold listings — not a
          guess or a formula. Raw (ungraded) cards are priced against the market price for the
          condition the seller describes in the listing title. Graded cards are priced only against
          real sold comps for that exact grading company and grade. The price a buyer actually pays —
          item price plus shipping — is what gets compared.
        </p>

        <h2 className="mt-10 text-lg font-bold text-black dark:text-zinc-50">
          3. Showing only genuine deals
        </h2>
        <p className="mt-3 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
          A listing only makes the site if it is meaningfully below market (at least 10%) and the
          seller passes a set of trust checks, and if it doesn&apos;t look like a wrong-item match or a
          junk listing. Anything priced far below market — the level where it&apos;s much more likely to
          be the wrong card, a proxy, or a scam than a real bargain — is excluded rather than shown as
          a headline discount. The full set of thresholds and filters is on the{" "}
          <Link href="/methodology" className="text-red-600 hover:underline dark:text-red-500">
            methodology
          </Link>{" "}
          page.
        </p>

        <h2 className="mt-10 text-lg font-bold text-black dark:text-zinc-50">How current is it?</h2>
        <p className="mt-3 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
          Every price and listing is accurate as of its last scan. Because listings sell and expire
          between scans, a listing can occasionally be gone by the time you click through — when the
          site detects that, the listing is dropped and its page is no longer indexed. The homepage
          shows when the most recent scan completed.
        </p>

        <p className="mt-10 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
          More on the data sources and exact rules:{" "}
          <Link href="/methodology" className="text-red-600 hover:underline dark:text-red-500">
            methodology
          </Link>
          . More on how the site is funded:{" "}
          <Link href="/affiliate-disclosure" className="text-red-600 hover:underline dark:text-red-500">
            affiliate disclosure
          </Link>
          .
        </p>
      </main>

      <SiteFooter />
    </div>
  );
}
