import Link from "next/link";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import { TRUST_CONTENT_UPDATED, TRUST_CONTENT_UPDATED_DISPLAY } from "@/lib/trustContent";

const SITE_URL = "https://pokemondealfinder.com";

const TITLE = "Methodology";
const DESCRIPTION =
  "The data sources, pricing rules, card-identity matching, non-card filtering, image-based authenticity screening, freshness handling, and known limitations behind every listing shown on Pokemon Deal Finder.";

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

// Generic WebPage node carrying a real editorial modification date. Not a
// rich-result type (no stars, no price) - just a machine-readable
// "this explainer was last revised on..." signal. dateModified is a fixed
// constant (lib/trustContent.js), never a render-time timestamp.
const webPageJsonLd = {
  "@context": "https://schema.org",
  "@type": "WebPage",
  name: "Pricing & Deal-Detection Methodology",
  url: `${SITE_URL}/methodology`,
  description: DESCRIPTION,
  isPartOf: { "@id": `${SITE_URL}/#website` },
  publisher: { "@id": `${SITE_URL}/#organization` },
  dateModified: TRUST_CONTENT_UPDATED,
  lastReviewed: TRUST_CONTENT_UPDATED,
};

const h2 = "mt-10 text-lg font-bold text-black dark:text-zinc-50";
const h3 = "mt-6 text-sm font-bold text-black dark:text-zinc-50";
const p = "mt-3 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400";
const ul = "mt-3 flex list-disc flex-col gap-2 pl-5 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400";

export default function MethodologyPage() {
  return (
    <div className="flex min-h-screen flex-col bg-paper">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(webPageJsonLd) }} />
      <SiteHeader />

      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-12">
        <h1 className="text-3xl font-bold tracking-tight text-black dark:text-zinc-50">
          Pricing &amp; Deal-Detection Methodology
        </h1>
        <p className="mt-2 text-xs text-zinc-400">Last updated {TRUST_CONTENT_UPDATED_DISPLAY}</p>
        <p className="mt-4 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
          Every listing presented as a deal on this site is a real, currently-active eBay listing that
          has cleared the checks below. No prices, sellers, sales, or statistics are invented, and a
          card in the catalogue is not the same thing as a deal.
        </p>

        <h2 className={h2}>What Pokemon Deal Finder does</h2>
        <p className={p}>
          Pokemon Deal Finder tracks Pokemon card and sealed-product listings on eBay and compares
          each one against recent-sold market-reference pricing to identify listings priced below
          market. It also maintains catalogue-backed pages for Pokemon, individual cards and sets that
          show reference prices and let you browse, even when there is no live deal. Those catalogue
          pages are not deals and are never presented as deals — they are a price and identity
          reference.
        </p>

        <h2 className={h2}>Where listings come from</h2>
        <ul className={ul}>
          <li>
            <span className="font-semibold text-black dark:text-zinc-50">eBay Browse API</span> — live
            listings from the Pokemon single-cards category across six marketplaces: the United States,
            United Kingdom, Australia, Canada, Germany and Italy. New listings are discovered
            continuously and existing ones are re-checked on a rolling schedule.
          </li>
          <li>
            Every deal links straight to the exact eBay listing it was priced from. The link is
            checked to make sure it opens that specific item rather than a search result or an eBay
            catalogue page.
          </li>
          <li>
            The site earns a commission through the eBay Partner Network and the TCGPlayer affiliate
            program when you click through and buy. This does not change your price and does not affect
            whether a listing is shown or where it ranks. See the{" "}
            <Link href="/affiliate-disclosure" className="text-red-600 hover:underline dark:text-red-500">
              affiliate disclosure
            </Link>
            .
          </li>
        </ul>
        <p className={p}>
          Pokemon Deal Finder is an independent tool. It is not affiliated with, endorsed by, or
          operated by Nintendo, The Pokemon Company, Creatures Inc., Game Freak, or eBay beyond the
          affiliate relationship described above.
        </p>

        <h2 className={h2}>Market reference and pricing</h2>
        <p className={p}>
          Reference prices come from{" "}
          <span className="font-semibold text-black dark:text-zinc-50">PokemonPriceTracker</span>,
          which provides per-condition market prices for raw cards, sold-comp prices for graded cards
          by grading company and grade, sealed-product prices, price history, and the underlying card
          catalogue.
        </p>
        <ul className={ul}>
          <li>
            A market reference is an estimate of recent sold value — it is not a guaranteed sale price,
            and it moves over time. Every figure on the site is accurate only as of the listing&apos;s
            last scan.
          </li>
          <li>
            Reference prices are sourced in US dollars. When a listing is priced in another currency,
            or you have selected a country, prices are converted for display using recent exchange
            rates so every figure in a comparison shows the same currency. The percentage below market
            is unaffected by conversion.
          </li>
          <li>
            Raw and graded values are never mixed. A graded card is compared only against sold comps
            for that exact grading company and grade, never a raw price with a multiplier applied.
          </li>
          <li>
            Where a card has both a 1st Edition and an Unlimited printing, the reference is taken for
            the correct printing so an Unlimited card is not measured against an inflated 1st Edition
            figure.
          </li>
          <li>
            If a card has several trustworthy listings and every one of them sits far below the
            reference, the reference is treated as unreliable and none of those listings are shown as
            a discount.
          </li>
        </ul>

        <h2 className={h2}>How a listing is matched to the correct card</h2>
        <p className={p}>
          eBay search is relevance-based, so a search for one card routinely returns others. Before a
          listing is trusted, it is matched to one exact catalogue printing. The match looks at
          identity evidence including:
        </p>
        <ul className={ul}>
          <li>the Pokemon and card name, and the set;</li>
          <li>the collector number;</li>
          <li>
            the card form or variant — for example Mega versus non-Mega, and ex / EX / GX / LV.X
            distinctions;
          </li>
          <li>the language of the printing;</li>
          <li>any other conflicting identity signals in the title.</li>
        </ul>
        <p className={p}>
          When strong identity evidence conflicts — a different collector number, a different form, a
          different language — the listing is excluded rather than forced onto the closest-looking
          card. English and Japanese printings are priced and shown separately; a listing that says it
          is the Japanese print is never matched to an English card, and vice versa. Matching is
          automated and will occasionally be wrong, which is why every deal links straight to eBay for
          you to check the photos and description yourself.
        </p>

        <h2 className={h2}>Non-card and non-matching product filtering</h2>
        <p className={p}>
          Listings that are not actually the tracked trading card are filtered out. This includes
          empty wrappers and packaging, sealed product mistaken for a single card, obvious novelty
          merchandise, and proxies or custom reproductions where they can be detected. Card lots and
          bundles, playsets, &ldquo;pick your card&rdquo; listings, repacks, digital or code-only
          items, display cases, and trading-service listings are also excluded. For sealed products, a
          listing carrying a numeric third-party card grade is rejected, because a grade only applies
          to a single card and not to factory-sealed product.
        </p>

        <h2 className={h2}>Image-based authenticity screening</h2>
        <p className={p}>
          Selected higher-risk listings can receive an additional image-based check that compares the
          listing photo with the card&apos;s expected official printing. This is not card
          authentication, not grading, and not a guarantee that any card is genuine. It runs only on a
          subset of listings and is fully automated.
        </p>
        <ul className={ul}>
          <li>
            A <span className="font-semibold text-black dark:text-zinc-50">counterfeit result</span>{" "}
            means the photo shows an obvious physical fake or novelty reproduction — for example a
            metal or resin &ldquo;card&rdquo; — rather than a genuine printed card. These listings are
            hidden.
          </li>
          <li>
            A{" "}
            <span className="font-semibold text-black dark:text-zinc-50">wrong-printing result</span>{" "}
            means the card in the photo looks genuine but is a different printing than the listing
            describes. These listings are also hidden, but this is a matching error, not a counterfeit
            accusation.
          </li>
          <li>
            When the check cannot reach a confident answer, the listing is simply treated as not
            screened. It is not accused of anything and, in ordinary browsing, is not hidden on that
            basis.
          </li>
        </ul>
        <p className={p}>
          Automated image screening has real limits: photo quality, angle, lighting and sleeve glare
          all affect it, and it can miss a well-made fake or misjudge a genuine card. It is one
          safeguard, not a verdict.
        </p>

        <h2 className={h2}>Promotional placement</h2>
        <p className={p}>
          The site&apos;s most prominent recommendations — the homepage promotional modules and the
          curated best-deals lists — use a stricter standard than ordinary browsing. A sufficiently
          high-value and deeply discounted non-graded listing must have passed the image check
          described above before it can appear in those placements. A listing that has not been
          screened yet can still appear in normal browsing; it just does not get top billing until it
          has.
        </p>

        <h2 className={h2}>What counts as a deal</h2>
        <ul className={ul}>
          <li>
            The price compared is what a buyer actually pays:{" "}
            <span className="font-semibold text-black dark:text-zinc-50">item price plus shipping</span>
            , using the real figures eBay returns.
          </li>
          <li>
            A listing has to be meaningfully below its market reference to be shown — a modest, genuine
            discount, not a rounding difference.
          </li>
          <li>
            A listing priced far below market — roughly the level where it is much more likely to be
            the wrong card, a proxy, a damaged item, or a scam than a real bargain — is excluded, not
            shown as a huge discount.
          </li>
        </ul>

        <h2 className={h2}>Condition and grading</h2>
        <ul className={ul}>
          <li>
            eBay&apos;s condition field only distinguishes &ldquo;Graded&rdquo; from
            &ldquo;Ungraded&rdquo; for cards, so a raw card&apos;s wear is read from the seller&apos;s
            own wording (Near Mint, Lightly Played, Moderately Played, Heavily Played, Damaged) and
            priced against that condition — never against a better one. A listing whose condition
            cannot be established is not shown as a verified deal.
          </li>
          <li>
            Graded cards are priced against sold comps for the specific grade from PSA, CGC, BGS, SGC,
            ACE, or TAG.
          </li>
          <li>
            Sellers shown must clear a positive-feedback percentage and a minimum feedback-score
            threshold.
          </li>
        </ul>

        <h2 className={h2}>Freshness and ended listings</h2>
        <ul className={ul}>
          <li>Auctions known to have ended are removed automatically.</li>
          <li>
            A listing that has gone too long without being re-seen in an eBay scan stops being shown
            as a live deal. That window is shorter for higher-value and more deeply discounted cards.
          </li>
          <li>
            A separate, bounded process re-checks individual eBay items directly and retires ones that
            have ended or sold.
          </li>
          <li>
            The site records when each listing was last seen in a scan. That is not the same as
            confirming the exact item on eBay at that moment — prices and availability can change
            between scans.
          </li>
          <li>
            Historical database rows may be kept for internal history after a listing stops being
            displayed as a live deal.
          </li>
        </ul>

        <h2 className={h2}>Which pages exist, and which are meant for search</h2>
        <p className={p}>
          Every supported National Pokedex Pokemon resolves to a page on this site. Individual real
          cards have a permanent page. Beyond that, a page is only intended to appear in search results
          when it meets the site&apos;s current useful-content standard:
        </p>
        <ul className={ul}>
          <li>
            A <Link href="/pokemon" className="text-red-600 hover:underline dark:text-red-500">Pokemon</Link>{" "}
            page can exist from catalogue data alone, with no live deal. It is intended for indexing
            when it has enough real, priced, catalogued cards to be a useful price and identity
            reference, or when it has enough simultaneous live listings; thinner Pokemon keep a page
            but it is not indexed.
          </li>
          <li>
            A <Link href="/sets" className="text-red-600 hover:underline dark:text-red-500">set</Link>{" "}
            page can also exist from catalogue data alone, with no live deal. It is intended for
            indexing when the set has enough real, priced, catalogued cards to be a useful card
            checklist and price reference, or when it has enough active below-market listings to
            browse; a set below both bars keeps no page.
          </li>
          <li>
            An individual card page exists permanently even with no current deal. If there is no
            trustworthy market price for it, the page stays available but is not indexed until a real
            price returns.
          </li>
          <li>
            A card hub — one page consolidating every current listing of one exact printing — exists
            when two or more listings of that printing are active at once. Empty and near-duplicate
            pages are not generated.
          </li>
        </ul>

        <h2 className={h2}>Limitations</h2>
        <ul className={ul}>
          <li>Card-to-listing matching and image screening are automated and will occasionally be wrong.</li>
          <li>
            Prices and availability change constantly; every figure is accurate only as of its last
            scan, and there can be a lag between a sale and the next scan.
          </li>
          <li>
            Market pricing depends on a third party (PokemonPriceTracker); for very obscure or very
            new cards the underlying data can be thin.
          </li>
          <li>
            None of the checks here is a guarantee that a card is genuine or accurately described.
            Always open the eBay listing and review its photos and description before buying.
          </li>
        </ul>

        <p className="mt-10 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
          Spotted a wrong match or a pricing problem?{" "}
          <Link href="/contact" className="text-red-600 hover:underline dark:text-red-500">
            Tell us
          </Link>{" "}
          and we&apos;ll correct it. For a plain-language walk-through, see{" "}
          <Link href="/how-it-works" className="text-red-600 hover:underline dark:text-red-500">
            how it works
          </Link>
          .
        </p>
      </main>

      <SiteFooter />
    </div>
  );
}
