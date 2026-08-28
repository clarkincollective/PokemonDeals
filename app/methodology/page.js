import Link from "next/link";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";

const SITE_URL = "https://pokemondealfinder.com";

const TITLE = "Methodology";
const DESCRIPTION =
  "The exact data sources, pricing rules, card-matching logic, seller trust checks, and known limitations behind every deal shown on Pokémon Deal Finder.";

export const metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/methodology" },
  openGraph: { title: TITLE, description: DESCRIPTION, url: `${SITE_URL}/methodology` },
  twitter: { card: "summary", title: TITLE, description: DESCRIPTION },
};

const breadcrumbJsonLd = {
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: [
    { "@type": "ListItem", position: 1, name: "Deals", item: `${SITE_URL}/` },
    { "@type": "ListItem", position: 2, name: "Methodology", item: `${SITE_URL}/methodology` },
  ],
};

const h2 = "mt-10 text-lg font-bold text-black dark:text-zinc-50";
const p = "mt-3 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400";
const ul = "mt-3 flex list-disc flex-col gap-2 pl-5 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400";

export default function MethodologyPage() {
  return (
    <div className="flex min-h-screen flex-col bg-zinc-50 dark:bg-black">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }} />
      <SiteHeader />

      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-12">
        <h1 className="text-3xl font-bold tracking-tight text-black dark:text-zinc-50">
          Pricing &amp; Deal-Detection Methodology
        </h1>
        <p className="mt-4 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
          Every deal on this site is a real, currently-active eBay listing that has cleared the rules
          below. No prices, sellers, sales, or statistics are invented.
        </p>

        <h2 className={h2}>Data sources</h2>
        <ul className={ul}>
          <li>
            <span className="font-semibold text-black dark:text-zinc-50">eBay Browse API</span> — live
            listings from the Pokémon individual-cards category across five marketplaces (US, UK,
            Australia, Canada, Germany), including the listing price, shipping cost, listing type
            (Buy It Now or auction), seller feedback, and photos.
          </li>
          <li>
            <span className="font-semibold text-black dark:text-zinc-50">PokémonPriceTracker</span> —
            real market price per condition for raw cards, real sold-comp prices for graded cards,
            sealed-product prices, price history, and the underlying catalogue of 50,000+ cards.
          </li>
        </ul>

        <h2 className={h2}>What &ldquo;market price&rdquo; means</h2>
        <p className={p}>
          For a raw card it is the current market price for that card&apos;s condition (Near Mint
          unless the listing says otherwise — see below), taken from PokémonPriceTracker and grounded
          in recent eBay sold listings. Where a card has both a 1st Edition and an Unlimited printing,
          the price is adjusted so an Unlimited card isn&apos;t compared against an inflated 1st
          Edition figure. For a graded card, market price is the real sold-comp price for that exact
          grading company and grade — never a raw price with a multiplier.
        </p>

        <h2 className={h2}>What counts as a deal</h2>
        <ul className={ul}>
          <li>
            The price compared is what a buyer actually pays:{" "}
            <span className="font-semibold text-black dark:text-zinc-50">item price + shipping</span>,
            using the real figures eBay returns.
          </li>
          <li>
            Discount = (market price − total price) ÷ market price. A listing must be at least{" "}
            <span className="font-semibold text-black dark:text-zinc-50">10% below market</span> to be
            shown.
          </li>
          <li>
            A listing priced{" "}
            <span className="font-semibold text-black dark:text-zinc-50">more than ~75% below market</span>{" "}
            is excluded, not shown as a huge discount — at that level it is far more likely to be the
            wrong card, a proxy, a damaged item, or a scam than a real bargain.
          </li>
        </ul>

        <h2 className={h2}>Matching a listing to a card</h2>
        <p className={p}>
          eBay search is relevance-based, so a search for one card routinely returns others. Before a
          listing is trusted, every significant word of the card&apos;s name and its set must appear
          as a whole word in the listing title. Listings that name a different set or printing are
          rejected. English and Japanese printings are priced and shown separately — a listing that
          says it is the Japanese print is never matched to an English card, and vice versa. Matching
          is still automated and not perfect, which is why every listing links straight to eBay for
          you to check the photos and description yourself.
        </p>

        <h2 className={h2}>Condition and grading</h2>
        <ul className={ul}>
          <li>
            eBay&apos;s condition field only distinguishes &ldquo;Graded&rdquo; from
            &ldquo;Ungraded&rdquo; for cards, so a raw card&apos;s wear is read from the seller&apos;s
            own title wording (Near Mint, Lightly Played, Moderately Played, Heavily Played, Damaged)
            and priced against that condition — never against a better one.
          </li>
          <li>
            Graded cards are priced against sold comps for the specific grade from PSA, CGC, BGS, SGC,
            ACE, or TAG.
          </li>
        </ul>

        <h2 className={h2}>Seller and listing trust checks</h2>
        <ul className={ul}>
          <li>
            Seller has at least{" "}
            <span className="font-semibold text-black dark:text-zinc-50">95% positive feedback</span>{" "}
            and a feedback score of at least{" "}
            <span className="font-semibold text-black dark:text-zinc-50">10</span>.
          </li>
          <li>
            Excluded outright: card lots and bundles, playsets, proxies and custom or hand-drawn
            &ldquo;art&rdquo; cards, repacks, &ldquo;choose your card&rdquo; / &ldquo;pick your
            card&rdquo; listings, digital or code-only items, display cases, and trading-service
            listings.
          </li>
          <li>
            For sealed products, a listing that carries a numeric third-party grade is rejected — a
            grade only ever applies to a single card, not to factory-sealed product.
          </li>
        </ul>

        <h2 className={h2}>Which pages get published</h2>
        <p className={p}>
          A card page is published only when there is a real card identity and genuine listing data
          behind it. A card hub (one page consolidating every current listing of an exact printing)
          exists only when two or more listings of that printing are active at once. A{" "}
          <Link href="/pokemon" className="text-red-600 hover:underline dark:text-red-500">
            Pokémon
          </Link>{" "}
          page exists only when that Pokémon has at least five active listings across its printings. A{" "}
          <Link href="/sets" className="text-red-600 hover:underline dark:text-red-500">
            set
          </Link>{" "}
          page exists only when that set has an active deal. Empty and near-duplicate pages are not
          generated.
        </p>

        <h2 className={h2}>Limitations</h2>
        <ul className={ul}>
          <li>Card-to-listing matching is automated and will occasionally be wrong.</li>
          <li>
            Prices and availability change constantly; every figure is accurate only as of its last
            scan.
          </li>
          <li>
            When a listing sells or ends, it is removed and its page is no longer indexed — but there
            can be a lag between the sale and the next scan.
          </li>
          <li>
            Market pricing depends on a third party (PokémonPriceTracker); for very obscure or very
            new cards the underlying data can be thin.
          </li>
        </ul>

        <p className="mt-10 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
          Spotted a wrong match or a pricing problem?{" "}
          <Link href="/contact" className="text-red-600 hover:underline dark:text-red-500">
            Tell us
          </Link>{" "}
          and we&apos;ll correct it.
        </p>
      </main>

      <SiteFooter />
    </div>
  );
}
