import { unstable_cache } from "next/cache";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { resolveCardSlug, fetchCardOffers } from "@/lib/deals";
import { slugifySet } from "@/lib/slugify";
import { buildTcgplayerLink } from "@/lib/tcgplayer";
import { MARKETPLACES } from "@/lib/ebay";
import { getFullPriceAnalysis } from "@/lib/pokemonPriceTracker";
import { dealScore } from "@/lib/dealScore";
import SiteHeader from "@/components/SiteHeader";
import DealCard from "@/components/DealCard";
import PriceHistoryChart from "@/components/PriceHistoryChart";
import VariantPriceGrid from "@/components/VariantPriceGrid";
import CardImagePlaceholder from "@/components/CardImagePlaceholder";
import AffiliateLink from "@/components/AffiliateLink";

// How many of the cheapest offers get the full visual DealCard treatment
// (image, badges, CTA) right at the top - real feedback: landing on a
// page of plain text rows after clicking "N active listings" read as
// confusing/broken, since every other page on the site shows deals as
// image cards. The rest of the offers still get the complete plain list
// further down for anyone comparing all of them, not just the top few.
const FEATURED_OFFER_COUNT = 4;

const SITE_URL = "https://pokemondealfinder.com";

export const revalidate = 900;

// Real per-card hub page - see lib/deals.js's fetchCardHubs for the full
// reasoning: consolidates every currently active listing of one exact
// print into one strong page instead of leaving them as several
// near-identical /deals/[id] pages competing with each other.
//
// Reference market data, cached separately from the live offers list
// (which changes as listings sell/expire) - same 300s window and
// primitive-keyed cache as app/deals/[id]/page.js's loadPriceAnalysis,
// reused here rather than duplicated.
const loadPriceAnalysisUncached = async (tcgplayerId) => {
  if (!tcgplayerId) return null;
  try {
    return await getFullPriceAnalysis(tcgplayerId, {});
  } catch (err) {
    console.error("Price analysis lookup failed:", err.message);
    return null;
  }
};

const loadPriceAnalysis = unstable_cache(loadPriceAnalysisUncached, ["card-hub-price-analysis"], {
  revalidate: 300,
});

export async function generateMetadata({ params }) {
  const { slug } = await params;
  const hub = await resolveCardSlug(slug);
  if (!hub) return { title: "Card not found", robots: { index: false, follow: true } };

  // Real gap found live: without an explicit openGraph/twitter block,
  // Next falls back to the root layout's generic site-wide preview
  // (title "Pokémon Deal Finder", generic description, generic image,
  // og:url pointing at the bare homepage) for every single card hub -
  // meaning sharing a specific card's link in Discord/Reddit/etc showed
  // no sign it was that card at all. fetchCardOffers is already
  // unstable_cache'd, so calling it again here just reuses that same
  // cached result rather than costing a second real query.
  const { deals: offers } = await fetchCardOffers(hub.id);
  const image = offers[0]?.image_url;

  // Real gap found live: some watched cards have genuinely long real
  // names (tournament/championship promo prints, e.g. "Buddy-Buddy
  // Poffin - 144/162 (North America International Championship)
  // [Staff]") - Google reliably shows only ~55-60 characters of a title
  // before truncating or replacing it with its own rewrite, and the base
  // "Compare N Deals" template pushed some of these past 120 characters.
  // Never truncates the real name itself (that risks cutting off the
  // card number or other identifying info) - just drops the promotional
  // suffix when there's no room for it, rather than fighting a losing
  // battle against a genuinely long real title.
  const base = `${hub.name} (${hub.set})`;
  const suffix = ` - Compare ${hub.count} Deals`;
  const title = base.length + suffix.length <= 60 ? `${base}${suffix}` : base;
  const description = `${hub.count} active ${hub.name} (${hub.set}) listings on eBay right now, compared side by side against real market pricing - cheapest first.`;

  return {
    title,
    description,
    alternates: { canonical: `/cards/${slug}` },
    openGraph: {
      title,
      description,
      url: `${SITE_URL}/cards/${slug}`,
      images: image ? [image] : undefined,
    },
    twitter: {
      card: image ? "summary_large_image" : "summary",
      title,
      description,
      images: image ? [image] : undefined,
    },
  };
}

export default async function CardHubPage({ params }) {
  const { slug } = await params;
  const hub = await resolveCardSlug(slug);
  if (!hub) notFound();

  const [{ deals: offers, error }, analysis] = await Promise.all([
    fetchCardOffers(hub.id),
    loadPriceAnalysis(hub.tcgplayerId),
  ]);

  // The hub only exists (see fetchCardHubs) when there were 2+ active
  // listings as of the last 15-minute cache refresh - but listings sell/
  // expire between refreshes, so by the time this renders there could
  // legitimately be down to 1 or 0. 0 shouldn't happen (this cache
  // window is short) but isn't treated as an error if it does - just an
  // honest "nothing active right now" state, same as any other grid.
  const cheapest = offers[0];
  const priceRange =
    offers.length > 1 && offers[0].total_price !== offers[offers.length - 1].total_price
      ? `$${Number(offers[0].total_price).toFixed(2)} - $${Number(offers[offers.length - 1].total_price).toFixed(2)}`
      : offers[0]
        ? `$${Number(offers[0].total_price).toFixed(2)}`
        : null;

  const primaryHistory = analysis?.raw?.history ?? [];
  const tcgplayerLink = buildTcgplayerLink(hub.name, hub.tcgplayerId);

  // One real Offer per real active listing - the documented Google/
  // schema.org pattern for "multiple sellers, one product," and the
  // direct structured-data expression of why this page exists: real
  // current offers, not a fabricated aggregate.
  // Real gap found live: Google's Product structured data guidelines
  // treat `image` as required for the richer product-snippet result
  // types, and this was missing here even though every sibling Product
  // block on the site (deal detail, sealed detail) already sets it from
  // real data - just an oversight when this page was first built, not a
  // deliberate omission (unlike hasMerchantReturnPolicy elsewhere, which
  // stays deliberately unset because there's no single real answer for
  // it across multiple sellers).
  const productJsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: `${hub.name} - ${hub.set}`,
    image: cheapest?.image_url ?? undefined,
    description: `${hub.name} (${hub.set}) - ${offers.length} active eBay ${offers.length === 1 ? "listing" : "listings"}, compared against real market pricing.`,
    brand: { "@type": "Brand", name: "Pokémon" },
    offers: offers.map((deal) => ({
      "@type": "Offer",
      url: deal.listing_url,
      priceCurrency: MARKETPLACES[deal.marketplace]?.currency ?? "USD",
      price: Number(deal.total_price).toFixed(2),
      availability: "https://schema.org/InStock",
      itemCondition: "https://schema.org/UsedCondition",
    })),
  };

  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Deals", item: `${SITE_URL}/` },
      { "@type": "ListItem", position: 2, name: `${hub.name} (${hub.set})`, item: `${SITE_URL}/cards/${slug}` },
    ],
  };

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-black">
      {offers.length > 0 && (
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(productJsonLd) }} />
      )}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }} />
      <SiteHeader />

      <div className="mx-auto max-w-5xl px-6 py-10">
        {/* A real, visible button rather than a small muted text link -
            same reasoning as /sets/[slug]'s "Back to Sets" button. */}
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-300 bg-white px-3.5 py-2 text-sm font-semibold text-black transition-colors hover:border-zinc-400 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50 dark:hover:bg-zinc-800"
        >
          ← Back to All Deals
        </Link>

        <div className="mt-4 flex flex-col gap-6 rounded-lg border border-zinc-200 bg-white p-6 shadow-sm sm:flex-row dark:border-zinc-800 dark:bg-zinc-950">
          <div className="relative h-56 w-56 shrink-0 self-center overflow-hidden rounded-lg bg-zinc-50 sm:self-auto dark:bg-zinc-900">
            {cheapest?.image_url ? (
              <Image src={cheapest.image_url} alt={`${hub.name} - ${hub.set}`} fill sizes="224px" className="object-contain p-3" />
            ) : (
              <CardImagePlaceholder className="h-24 w-16" />
            )}
          </div>

          <div className="flex-1">
            <span className="rounded-md bg-zinc-100 px-2.5 py-0.5 text-xs font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
              {offers.length} active {offers.length === 1 ? "listing" : "listings"}
            </span>
            <h1 className="mt-3 text-xl font-bold text-black dark:text-zinc-50">{hub.name}</h1>
            <Link
              href={`/sets/${slugifySet(hub.set)}`}
              className="text-zinc-500 hover:text-red-600 hover:underline dark:hover:text-red-500"
            >
              {hub.set}
            </Link>

            {priceRange && (
              <p className="mt-4 text-2xl font-bold text-black dark:text-zinc-50">
                {offers.length > 1 ? "From " : ""}
                {priceRange}
              </p>
            )}

            <div className="mt-5 flex flex-wrap gap-3">
              {tcgplayerLink && (
                <AffiliateLink
                  href={tcgplayerLink}
                  eventName="TCGPlayer Click"
                  eventData={{ card: hub.name, page: "card_hub" }}
                  className="rounded-lg border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-600 hover:border-zinc-300 dark:border-zinc-800 dark:text-zinc-300"
                >
                  Check on TCGPlayer
                </AffiliateLink>
              )}
            </div>
          </div>
        </div>

        {offers.length > 0 && (
          <div className="mt-6">
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-zinc-400">
              {offers.length > FEATURED_OFFER_COUNT ? `Best ${FEATURED_OFFER_COUNT} Prices` : "Active Listings"}
            </h2>
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {offers.slice(0, FEATURED_OFFER_COUNT).map((deal, i) => (
                <DealCard key={deal.id} deal={deal} rank={i + 1} scoreBadge={dealScore(deal.discount_pct)} pageName="card_hub" />
              ))}
            </div>
          </div>
        )}

        {primaryHistory.length > 0 && (
          <div className="mt-6 rounded-lg border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
            <h2 className="text-sm font-semibold text-black dark:text-zinc-50">Market price history</h2>
            <p className="text-xs text-zinc-400">Real market pricing, fetched fresh for this page.</p>
            <div className="mt-4">
              <PriceHistoryChart points={primaryHistory} />
            </div>
          </div>
        )}

        {analysis && (analysis.graded.length > 0 || analysis.raw.history.length > 0) && (
          <div className="mt-6 rounded-lg border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
            <h2 className="text-sm font-semibold text-black dark:text-zinc-50">Every variant, side by side</h2>
            <p className="text-xs text-zinc-400">Raw and every graded tier with real recorded sales.</p>
            <div className="mt-4">
              <VariantPriceGrid raw={analysis.raw} graded={analysis.graded} cardName={hub.name} />
            </div>
          </div>
        )}

        {error && (
          <p className="mt-6 rounded-lg bg-red-50 p-4 text-red-700">Couldn&apos;t load listings: {error}</p>
        )}

        {!error && offers.length === 0 && (
          <p className="mt-6 text-zinc-500">No active listings right now - check back after the next scheduled scan.</p>
        )}

        {offers.length > FEATURED_OFFER_COUNT && (
        <div className="mt-6 rounded-lg border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
          <h2 className="text-sm font-semibold text-black dark:text-zinc-50">All {offers.length} active listings</h2>
          <p className="text-xs text-zinc-400">Every real, currently active eBay listing for this exact card - cheapest first.</p>

          <ul className="mt-4 divide-y divide-zinc-100 dark:divide-zinc-900">
            {offers.map((deal) => {
              const marketInfo = MARKETPLACES[deal.marketplace];
              return (
                <li key={deal.id} className="flex items-center justify-between gap-4 py-3">
                  <div className="min-w-0 flex-1">
                    <Link href={`/deals/${deal.id}`} className="line-clamp-1 block text-sm text-zinc-700 hover:underline dark:text-zinc-300">
                      {deal.title}
                    </Link>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-zinc-400">
                      {marketInfo && <span title={marketInfo.label}>{marketInfo.flag}</span>}
                      {deal.is_graded ? (
                        <span>
                          {deal.grader} {deal.grade}
                        </span>
                      ) : (
                        deal.condition && <span>{deal.condition}</span>
                      )}
                      <span>{deal.listing_type === "AUCTION" ? "Auction" : "Buy It Now"}</span>
                      {deal.seller_feedback_pct != null && <span>{Number(deal.seller_feedback_pct).toFixed(1)}% feedback</span>}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <span className="font-semibold text-black dark:text-zinc-50">${Number(deal.total_price).toFixed(2)}</span>
                    <AffiliateLink
                      href={deal.affiliate_url}
                      eventName="eBay Click"
                      eventData={{ card: hub.name, page: "card_hub" }}
                      className="rounded-lg bg-black px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-zinc-800 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
                    >
                      View →
                    </AffiliateLink>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
        )}

        <div className="mt-8 flex justify-center">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-300 bg-white px-3.5 py-2 text-sm font-semibold text-black transition-colors hover:border-zinc-400 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50 dark:hover:bg-zinc-800"
          >
            ← Back to All Deals
          </Link>
        </div>
      </div>

      <footer className="border-t border-zinc-200 px-6 py-8 text-center text-xs text-zinc-500 dark:border-zinc-800">
        As an eBay and TCGPlayer affiliate, we earn a commission on qualifying purchases made through
        links on this site. Prices and availability are subject to change and were accurate as of the
        listing&apos;s last scan. Card-to-listing matching is automated and not perfect - always
        double-check a listing&apos;s photos and description before buying.
      </footer>
    </div>
  );
}
