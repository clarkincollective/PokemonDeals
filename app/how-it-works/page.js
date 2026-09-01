import Link from "next/link";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import { TRUST_CONTENT_UPDATED, TRUST_CONTENT_UPDATED_DISPLAY } from "@/lib/trustContent";

const SITE_URL = "https://pokemondealfinder.com";

const TITLE = "How It Works";
const DESCRIPTION =
  "How Pokemon Deal Finder discovers eBay listings, matches each one to the exact card, compares it against real sold-market pricing, filters bad and wrong listings, image-screens higher-risk ones, and drops stale listings.";

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

const webPageJsonLd = {
  "@context": "https://schema.org",
  "@type": "WebPage",
  name: "How Pokemon Deal Finder Works",
  url: `${SITE_URL}/how-it-works`,
  description: DESCRIPTION,
  isPartOf: { "@id": `${SITE_URL}/#website` },
  publisher: { "@id": `${SITE_URL}/#organization` },
  dateModified: TRUST_CONTENT_UPDATED,
  lastReviewed: TRUST_CONTENT_UPDATED,
};

const h2 = "mt-10 text-lg font-bold text-black dark:text-zinc-50";
const p = "mt-3 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400";

export default function HowItWorksPage() {
  return (
    <div className="flex min-h-screen flex-col bg-paper">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(webPageJsonLd) }} />
      <SiteHeader />

      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-12">
        <h1 className="text-3xl font-bold tracking-tight text-black dark:text-zinc-50">
          How Pokemon Deal Finder Works
        </h1>
        <p className="mt-2 text-xs text-zinc-400">Last updated {TRUST_CONTENT_UPDATED_DISPLAY}</p>
        <p className="mt-4 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
          The site runs the same steps around the clock: find new eBay listings, work out which exact
          card each one is, compare the price against real sold-market data, filter out the bad and
          wrong ones, run an extra image check on the riskier ones, and drop anything that has gone
          stale. Here is that journey in order.
        </p>

        <h2 className={h2}>1. Listings are discovered</h2>
        <p className={p}>
          New listings are pulled continuously from the eBay Browse API, in the Pokemon single-cards
          category, across six marketplaces — the United States, United Kingdom, Australia, Canada,
          Germany and Italy. Listings already on the site are re-checked on a rolling schedule to
          confirm they are still active and still a deal. The card catalogue and sealed products are
          re-synced daily.
        </p>

        <h2 className={h2}>2. Each listing is matched to the exact card</h2>
        <p className={p}>
          eBay search returns loosely related results, so every listing is matched to one exact
          catalogue printing before it is trusted. The name and set have to be present, and identity
          conflicts — a different collector number, a different card form such as Mega versus non-Mega,
          an ex / EX / GX distinction, or a different language — cause the listing to be dropped rather
          than forced onto the closest card. English and Japanese printings are always kept separate.
        </p>

        <h2 className={h2}>3. The price is compared against real data</h2>
        <p className={p}>
          The total a buyer actually pays — item price plus shipping — is compared against a
          recent-sold market reference for that card in its condition, from PokemonPriceTracker. Raw
          cards are priced against the condition the seller describes; graded cards are priced only
          against sold comps for that exact grading company and grade. A market reference is an
          estimate of recent sold value, not a guaranteed price, and it moves.
        </p>

        <h2 className={h2}>4. Bad and wrong listings are filtered out</h2>
        <p className={p}>
          A listing only makes the site if it is meaningfully below its market reference and the seller
          passes trust checks. Listings that look like the wrong card or wrong printing, priced far
          below market, damaged, in an unverifiable condition, or not actually a single card at all —
          empty wrappers, sealed product, merchandise, proxies — are excluded rather than shown.
        </p>

        <h2 className={h2}>5. Higher-risk listings get an extra image check</h2>
        <p className={p}>
          Selected higher-risk listings receive an additional automated check that compares the
          listing photo with the card&apos;s expected official printing. It can catch a photo that
          shows an obvious physical counterfeit, and a photo that shows a genuine card of a different
          printing than the listing claims; both are hidden. The site&apos;s most prominent
          recommendations require a high-value, deeply discounted non-graded listing to have passed
          this check first. This is automated screening, not card authentication or grading.
        </p>

        <h2 className={h2}>6. Stale and ended listings are removed from promotion</h2>
        <p className={p}>
          Auctions known to have ended are removed automatically. A listing that goes too long without
          being re-seen in a scan stops being shown as a live deal, sooner for higher-value cards, and
          a separate bounded process re-checks individual eBay items and retires ones that have ended
          or sold. Every figure on the site is accurate only as of the last time the listing was seen.
        </p>

        <h2 className={h2}>7. You click through to the exact eBay listing</h2>
        <p className={p}>
          Each deal links straight to the one eBay listing it was priced from — not a search or an
          eBay catalogue page. Purchases, payment, shipping, returns and support are handled entirely
          by eBay and the seller. Always check the listing&apos;s own photos and description before
          buying.
        </p>

        <p className="mt-10 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
          For the exact data sources and rules, see the{" "}
          <Link href="/methodology" className="text-red-600 hover:underline dark:text-red-500">
            methodology
          </Link>
          . For how the site is funded, see the{" "}
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
