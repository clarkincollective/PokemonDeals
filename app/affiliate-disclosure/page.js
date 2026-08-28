import Link from "next/link";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";

const SITE_URL = "https://pokemondealfinder.com";

const TITLE = "Affiliate Disclosure";
const DESCRIPTION =
  "Pokémon Deal Finder earns a commission through the eBay Partner Network and the TCGPlayer affiliate program. It doesn't change the price you pay, and there is no paid placement.";

export const metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/affiliate-disclosure" },
  openGraph: { title: TITLE, description: DESCRIPTION, url: `${SITE_URL}/affiliate-disclosure` },
  twitter: { card: "summary", title: TITLE, description: DESCRIPTION },
};

const breadcrumbJsonLd = {
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: [
    { "@type": "ListItem", position: 1, name: "Deals", item: `${SITE_URL}/` },
    { "@type": "ListItem", position: 2, name: "Affiliate Disclosure", item: `${SITE_URL}/affiliate-disclosure` },
  ],
};

const h2 = "mt-10 text-lg font-bold text-black dark:text-zinc-50";
const p = "mt-3 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400";

export default function AffiliateDisclosurePage() {
  return (
    <div className="flex min-h-screen flex-col bg-zinc-50 dark:bg-black">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }} />
      <SiteHeader />

      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-12">
        <h1 className="text-3xl font-bold tracking-tight text-black dark:text-zinc-50">
          Affiliate Disclosure
        </h1>

        <p className="mt-4 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
          Pokémon Deal Finder participates in the eBay Partner Network and the TCGPlayer affiliate
          program (administered through Impact.com). When you click a listing or price link on this
          site and go on to make a purchase, we may earn a commission from eBay or TCGPlayer.
        </p>

        <h2 className={h2}>It doesn&apos;t change your price</h2>
        <p className={p}>
          The commission is paid by the retailer out of their own margin. You pay exactly the same
          price you would if you had found the listing yourself.
        </p>

        <h2 className={h2}>No paid placement</h2>
        <p className={p}>
          No seller, retailer, or third party can pay to appear on this site or to rank higher.
          Whether a listing is shown, and where it sits, depends only on how far below market its total
          price is and on the seller and listing trust checks described in the{" "}
          <Link href="/methodology" className="text-red-600 hover:underline dark:text-red-500">
            methodology
          </Link>
          . Affiliate links are marked as sponsored in the page code and open in a new tab.
        </p>

        <h2 className={h2}>Accuracy</h2>
        <p className={p}>
          Prices, shipping, availability, and seller details shown on this site were accurate as of the
          listing&apos;s last scan and can change at any time. Always confirm the current details on
          eBay or TCGPlayer before buying. Purchases, payment, shipping, returns, and support are
          handled entirely by eBay and the individual seller — this site is not a party to the
          transaction.
        </p>

        <p className="mt-10 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
          Questions about this disclosure?{" "}
          <Link href="/contact" className="text-red-600 hover:underline dark:text-red-500">
            Contact us
          </Link>
          .
        </p>
      </main>

      <SiteFooter />
    </div>
  );
}
