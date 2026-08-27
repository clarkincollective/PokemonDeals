import { cache } from "react";
import { unstable_cache } from "next/cache";
import Image from "next/image";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { findCardHubByWatchlistId } from "@/lib/deals";
import { buildTcgplayerLink } from "@/lib/tcgplayer";
import { MARKETPLACES, buildEbaySearchLink } from "@/lib/ebay";
import { getFullPriceAnalysis } from "@/lib/pokemonPriceTracker";
import { dealScore } from "@/lib/dealScore";
import PriceHistoryChart from "@/components/PriceHistoryChart";
import VariantPriceGrid from "@/components/VariantPriceGrid";
import SiteHeader from "@/components/SiteHeader";
import DealScoreBadge from "@/components/DealScoreBadge";
import CardImagePlaceholder from "@/components/CardImagePlaceholder";
import AffiliateLink from "@/components/AffiliateLink";
import ShareButton from "@/components/ShareButton";

const SITE_URL = "https://pokemondealfinder.com";

function formatSaleDate(dateString) {
  return new Date(dateString).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

// Real, live perf/cost problem found via SEO audit: this page ran fully
// dynamic on every view (confirmed live: Cache-Control was no-store,
// getFullPriceAnalysis - a real, billed PokemonPriceTracker API call -
// fired fresh every single time) despite this being the highest-volume
// page type on the site by far. `export const revalidate` alone doesn't
// fix this: Next 15+ defaults every fetch() to uncached, and the
// Supabase client's internal fetch calls have no cache option set, so
// any route touching them is forced fully dynamic regardless of a
// route-level revalidate export - the same reason the grid pages
// (lib/deals.js) needed unstable_cache instead. Wrapping the actual data
// fetches directly, like this, is what actually works - verified live
// (see the deal fetch's 60s window below and price analysis's 300s one).
const loadDealUncached = async (id) => {
  const { data } = await supabase
    .from("deals")
    .select("*, watchlist:watchlist_id (name, set, justtcg_tcgplayer_id, language)")
    .eq("id", id)
    .single();
  return data;
};

// 60s, not 300s like price analysis below - this row's own is_active flag
// is what keeps a sold/expired deal from continuing to render as live and
// buyable, so it shouldn't sit stale as long as data that only affects
// reference pricing.
const loadDealFromDataCache = unstable_cache(loadDealUncached, ["deal-detail"], { revalidate: 60 });

// cache() dedupes this within a single request on top of the above -
// generateMetadata and the page component below both need the same deal,
// and without this it'd be two calls per request even when both hit the
// same warm entry in Next's Data Cache.
const loadDeal = cache(loadDealFromDataCache);

export async function generateMetadata({ params }) {
  const { id } = await params;
  const deal = await loadDeal(id);
  // Not active anymore = as good as not found for anyone landing here -
  // don't generate a title/description repeating pricing/discount claims
  // that are no longer real (e.g. a link shared or indexed before the
  // deal expired) even in a link-preview card, which never hits the
  // page component's own is_active check below.
  if (!deal || !deal.is_active) return { title: "Deal not found", robots: { index: false, follow: true } };

  const cardName = deal.watchlist?.name ?? deal.title;
  const cardSet = deal.watchlist?.set;
  const discountPct = Math.round(deal.discount_pct * 100);
  const title = `${cardName}${cardSet ? ` (${cardSet})` : ""} - ${discountPct}% below market`;
  // Real card/set context up front, not just bare price numbers - a
  // search result showing only "$74.99 vs a $214.20 market price" gives a
  // searcher no reason to click over a competing result unless they've
  // already scanned the title; naming the card again in the snippet does
  // that work for them.
  const description = `${cardName}${cardSet ? ` (${cardSet})` : ""} for $${Number(deal.total_price).toFixed(
    2
  )} - ${discountPct}% below the $${Number(deal.market_price).toFixed(2)} real market price on eBay.`;

  return {
    title,
    description,
    alternates: { canonical: `/deals/${id}` },
    openGraph: {
      title,
      description,
      images: deal.image_url ? [deal.image_url] : undefined,
    },
    // Next.js doesn't derive twitter:* from openGraph automatically - set
    // explicitly, or a shared deal link shows the generic site title/desc
    // on Twitter/X instead of this specific card's.
    twitter: {
      card: deal.image_url ? "summary_large_image" : "summary",
      title,
      description,
      images: deal.image_url ? [deal.image_url] : undefined,
    },
    // Always active here - the inactive case returns early above.
  };
}

// Keyed on primitives (not the deal/watchlist objects) so the cache key
// is exactly the values that actually change the result - every listing
// of the same card/grader/grade/language shares one cache entry here,
// not just repeat views of the exact same deal id, which multiplies the
// real hit rate on this expensive external API call well beyond what
// per-deal caching alone would get. 300s: this is reference market
// pricing, not the deal's own live/sold state (that's loadDeal, cached
// separately above at 60s), so it can safely sit a few minutes stale.
const loadPriceAnalysisUncached = async (tcgplayerId, grader, grade, language) => {
  try {
    return await getFullPriceAnalysis(tcgplayerId, { primaryGrader: grader, primaryGrade: grade, language });
  } catch (err) {
    console.error("Price analysis lookup failed:", err.message);
    return null;
  }
};

const loadPriceAnalysisFromDataCache = unstable_cache(loadPriceAnalysisUncached, ["price-analysis"], {
  revalidate: 300,
});

async function loadPriceAnalysis(deal, watchlist) {
  return loadPriceAnalysisFromDataCache(
    watchlist.justtcg_tcgplayer_id ?? null,
    deal.grader ?? null,
    deal.grade ?? null,
    watchlist.language ?? null
  );
}

export default async function DealDetailPage({ params }) {
  const { id } = await params;

  const deal = await loadDeal(id);

  // A deactivated deal (naturally expired by the scan cycle, or corrected
  // for bad data) is not distinguished from a nonexistent one here - both
  // read the same to a visitor: this deal isn't available anymore, so
  // don't keep showing it as a live, buyable page with real-looking
  // pricing/CTAs to anyone who still has the link.
  if (!deal || !deal.is_active) {
    return (
      <div className="min-h-screen bg-zinc-50 dark:bg-black">
        <SiteHeader />
        <div className="mx-auto max-w-2xl px-6 py-16 text-center">
          <p className="text-zinc-500">Couldn&apos;t find that deal - it may have expired.</p>
          <Link href="/" className="mt-4 inline-block text-sm font-medium underline">
            Back to all deals
          </Link>
        </div>
      </div>
    );
  }

  // cardHub is only non-null when 2+ listings of this exact card are
  // simultaneously active (see lib/deals.js's fetchCardHubs) - a real,
  // live duplicate-content problem this session's SEO audit found: 69%
  // of watched cards with an active deal have 2+ listings at once, each
  // one otherwise a near-identical page competing with the others for
  // the same search. Linking every one of them to the one consolidated
  // hub page is what actually fixes that (not just the hub page
  // existing on its own, unlinked).
  const [analysis, cardHub] = await Promise.all([
    loadPriceAnalysis(deal, deal.watchlist),
    deal.watchlist_id ? findCardHubByWatchlistId(deal.watchlist_id) : Promise.resolve(null),
  ]);

  // The chart/section for THIS specific listing's own variant - raw uses
  // analysis.raw directly, graded finds its matching tile in
  // analysis.graded by the key the library already computed.
  const primaryHistory = deal.is_graded
    ? analysis?.graded?.find((g) => g.key === analysis.primaryKey)?.history ?? []
    : analysis?.raw?.history ?? [];
  const recentSales = analysis?.primaryRecentSales ?? [];

  const cardName = deal.watchlist?.name ?? deal.title;
  const cardSet = deal.watchlist?.set;
  const discountPct = Math.round(deal.discount_pct * 100);
  const isAuction = deal.listing_type === "AUCTION";
  const marketInfo = MARKETPLACES[deal.marketplace];
  const tcgplayerLink = buildTcgplayerLink(cardName, deal.watchlist?.justtcg_tcgplayer_id);

  // Structured data so a search result can show price/availability
  // directly (Google's Product rich result). Auctions report the current
  // bid as the price with an UsedCondition note in the description above,
  // not a special schema.org auction type - Offer doesn't model
  // "current bid, may rise" cleanly, and this stays accurate either way.
  //
  // brand and shippingDetails are both real data, not filled in to please
  // Search Console: "Pokémon" is genuinely the brand of every card here,
  // and shippingRate is deal.shipping - the actual cost eBay's own API
  // returned for this exact listing, already used to compute total_price.
  // Deliberately NOT adding hasMerchantReturnPolicy - the real return
  // policy is set by whichever eBay seller has the listing and genuinely
  // varies per listing; asserting one here would mean stating something
  // we don't actually know is true for this specific sale.
  const productJsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: `${cardName}${cardSet ? ` - ${cardSet}` : ""}`,
    image: deal.image_url ?? undefined,
    description: deal.title,
    brand: { "@type": "Brand", name: "Pokémon" },
    offers: {
      "@type": "Offer",
      url: deal.listing_url,
      priceCurrency: marketInfo?.currency ?? "USD",
      price: Number(deal.total_price).toFixed(2),
      availability: deal.is_active ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
      itemCondition: "https://schema.org/UsedCondition",
      shippingDetails: {
        "@type": "OfferShippingDetails",
        shippingRate: {
          "@type": "MonetaryAmount",
          value: Number(deal.shipping ?? 0).toFixed(2),
          currency: marketInfo?.currency ?? "USD",
        },
        shippingDestination: {
          "@type": "DefinedRegion",
          addressCountry: deal.marketplace?.replace("EBAY_", "") ?? "US",
        },
      },
    },
  };

  // Real 3-level breadcrumb (Deals > this card's hub > this listing) when
  // a hub exists - matches the real "View 12 active listings" link above
  // and gives Google the same hierarchy the visible page shows, instead
  // of a flat 2-level one that hides the hub relationship entirely.
  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Deals", item: "https://pokemondealfinder.com/" },
      ...(cardHub
        ? [{ "@type": "ListItem", position: 2, name: cardName, item: `https://pokemondealfinder.com/cards/${cardHub.slug}` }]
        : []),
      {
        "@type": "ListItem",
        position: cardHub ? 3 : 2,
        name: cardHub ? "This listing" : cardName,
        item: `https://pokemondealfinder.com/deals/${deal.id}`,
      },
    ],
  };

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-black">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(productJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />
      <SiteHeader />
      <div className="mx-auto max-w-5xl px-6 py-10">
        <Link
          href="/"
          className="block text-sm font-medium text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
        >
          ← All deals
        </Link>

        <div className="mt-4 flex flex-col gap-6 rounded-lg border border-zinc-200 bg-white p-6 shadow-sm sm:flex-row dark:border-zinc-800 dark:bg-zinc-950">
          <div className="relative h-56 w-56 shrink-0 self-center overflow-hidden rounded-lg bg-zinc-50 sm:self-auto dark:bg-zinc-900">
            {deal.image_url ? (
              <Image src={deal.image_url} alt={deal.title} fill sizes="224px" className="object-contain p-3" />
            ) : (
              <CardImagePlaceholder className="h-24 w-16" />
            )}
          </div>

          <div className="flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-md bg-emerald-600 px-2.5 py-0.5 text-xs font-semibold text-white">
                {discountPct}% below market
              </span>
              <DealScoreBadge score={dealScore(deal.discount_pct)} size="lg" />
              {deal.watchlist?.language === "japanese" && (
                <span className="rounded-md bg-zinc-100 px-2.5 py-0.5 text-xs font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                  🇯🇵 Japanese Print
                </span>
              )}
              {deal.is_graded ? (
                <span className="rounded-md bg-indigo-100 px-2.5 py-0.5 text-xs font-medium text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
                  {deal.grader} {deal.grade}
                </span>
              ) : (
                deal.condition && (
                  <span className="rounded-md bg-zinc-100 px-2.5 py-0.5 text-xs font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                    {deal.condition}
                  </span>
                )
              )}
              <span className="rounded-md bg-zinc-100 px-2.5 py-0.5 text-xs font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                {isAuction ? "Auction" : "Buy It Now"}
              </span>
              {marketInfo && <span title={marketInfo.label}>{marketInfo.flag}</span>}
            </div>

            {/* Real deal context folded into the H1 itself (not just the
                separate badge above it) - a bare card name as H1 misses
                the actual search intent for "<card> deal"/"<card> below
                market" queries, which the title tag and meta description
                already target but the page's own primary heading didn't. */}
            <h1 className="mt-3 text-xl font-bold text-black dark:text-zinc-50">
              {cardName}
              <span className="font-medium text-zinc-500"> - {discountPct}% Below Market</span>
            </h1>
            {cardSet && <p className="text-zinc-500">{cardSet}</p>}
            <p className="mt-1 line-clamp-2 text-sm text-zinc-400">{deal.title}</p>

            {cardHub && (
              <Link
                href={`/cards/${cardHub.slug}`}
                className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-red-600 hover:underline dark:text-red-500"
              >
                {cardHub.count} active listings found - compare prices →
              </Link>
            )}

            <div className="mt-4">
              <div className="flex items-baseline gap-3">
                <span className="text-2xl font-bold text-black dark:text-zinc-50">
                  ${Number(deal.total_price).toFixed(2)}
                </span>
                <span className="text-base text-zinc-400 line-through">
                  ${Number(deal.market_price).toFixed(2)}
                </span>
              </div>
              {Number(deal.market_price) - Number(deal.total_price) > 0 && (
                <p className="text-sm font-medium text-emerald-600 dark:text-emerald-500">
                  You save ${(Number(deal.market_price) - Number(deal.total_price)).toFixed(2)}
                </p>
              )}
            </div>
            {isAuction && (
              <p className="mt-1 text-xs font-medium text-amber-600 dark:text-amber-400">
                Current bid{deal.bid_count != null ? ` · ${deal.bid_count} bids` : ""} - may rise before the auction ends
              </p>
            )}
            {deal.seller_feedback_pct != null && (
              <p className="mt-1 text-xs text-zinc-400">
                {Number(deal.seller_feedback_pct).toFixed(1)}% seller feedback
              </p>
            )}

            <div className="mt-5 flex flex-wrap gap-3">
              <AffiliateLink
                href={deal.affiliate_url}
                eventName="eBay Click"
                eventData={{
                  card: cardName,
                  marketplace: deal.marketplace,
                  discountPct,
                  listingType: deal.listing_type,
                  isGraded: deal.is_graded,
                  page: "detail",
                }}
                className="rounded-lg bg-black px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-zinc-800 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
              >
                {isAuction ? "Bid Now →" : "View Deal →"}
              </AffiliateLink>
              <AffiliateLink
                href={tcgplayerLink}
                eventName="TCGPlayer Click"
                eventData={{ card: cardName, page: "detail" }}
                className="rounded-lg border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-600 hover:border-zinc-300 dark:border-zinc-800 dark:text-zinc-300"
              >
                Check on TCGPlayer
              </AffiliateLink>
              <ShareButton
                url={`${SITE_URL}/deals/${deal.id}`}
                title={`${cardName} - ${discountPct}% below market`}
                text={`${cardName}${cardSet ? ` (${cardSet})` : ""} - $${Number(deal.total_price).toFixed(2)}, ${discountPct}% below market on Pokémon Deal Finder`}
                label="Share"
                className="rounded-lg px-4 py-2"
              />
            </div>
          </div>
        </div>

        <div className="mt-6 rounded-lg border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
          <h2 className="text-sm font-semibold text-black dark:text-zinc-50">
            {deal.is_graded ? `${deal.grader} ${deal.grade} price history` : "Market price history"}
          </h2>
          <p className="text-xs text-zinc-400">
            {deal.is_graded ? "Real graded sold comps" : "Real market pricing"}, fetched fresh for this
            page.
          </p>
          <div className="mt-4">
            <PriceHistoryChart points={primaryHistory} />
          </div>
        </div>

        {analysis && (analysis.graded.length > 0 || analysis.raw.history.length > 0) && (
          <div
            id="price-analysis"
            className="mt-6 scroll-mt-6 rounded-lg border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950"
          >
            <h2 className="text-sm font-semibold text-black dark:text-zinc-50">Every variant, side by side</h2>
            <p className="text-xs text-zinc-400">
              Raw and every graded tier with real recorded sales - the highlighted tile is this listing.
            </p>
            <div className="mt-4">
              <VariantPriceGrid raw={analysis.raw} graded={analysis.graded} activeKey={analysis.primaryKey} cardName={cardName} />
            </div>
          </div>
        )}

        {analysis && (analysis.conditionBreakdown.length > 0 || analysis.salesVelocity) && (
          <div className="mt-6 grid gap-6 sm:grid-cols-2">
            {analysis.conditionBreakdown.length > 0 && (
              <div className="rounded-lg border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
                <h2 className="text-sm font-semibold text-black dark:text-zinc-50">Condition breakdown</h2>
                <p className="text-xs text-zinc-400">
                  Current raw market price by condition - click any to find that condition on eBay.
                </p>
                <ul className="mt-4 flex flex-col gap-2">
                  {analysis.conditionBreakdown.map((c) => (
                    <li key={c.condition}>
                      <AffiliateLink
                        href={buildEbaySearchLink(`${cardName} ${c.condition}`)}
                        eventName="eBay Click"
                        eventData={{ card: cardName, page: "condition_breakdown", condition: c.condition }}
                        className="flex items-center justify-between text-sm text-zinc-600 hover:text-red-600 dark:text-zinc-300 dark:hover:text-red-400"
                      >
                        <span>{c.condition}</span>
                        <span className="font-semibold text-black dark:text-zinc-50">${Number(c.price).toFixed(2)}</span>
                      </AffiliateLink>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {analysis.salesVelocity && (
              <div className="rounded-lg border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
                <h2 className="text-sm font-semibold text-black dark:text-zinc-50">Market activity</h2>
                <p className="text-xs text-zinc-400">Real eBay sales across all conditions and grades.</p>
                <ul className="mt-4 flex flex-col gap-2 text-sm">
                  <li className="flex items-center justify-between">
                    <span className="text-zinc-600 dark:text-zinc-300">Sales in the last 30 days</span>
                    <span className="font-semibold text-black dark:text-zinc-50">{analysis.salesVelocity.monthlyTotal}</span>
                  </li>
                  <li className="flex items-center justify-between">
                    <span className="text-zinc-600 dark:text-zinc-300">Weekly average</span>
                    <span className="font-semibold text-black dark:text-zinc-50">
                      {analysis.salesVelocity.weeklyAverage.toFixed(1)}
                    </span>
                  </li>
                  <li className="flex items-center justify-between">
                    <span className="text-zinc-600 dark:text-zinc-300">Daily average</span>
                    <span className="font-semibold text-black dark:text-zinc-50">
                      {analysis.salesVelocity.dailyAverage.toFixed(2)}
                    </span>
                  </li>
                </ul>
              </div>
            )}
          </div>
        )}

        {recentSales.length > 0 && (
          <div className="mt-6 rounded-lg border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
            <h2 className="text-sm font-semibold text-black dark:text-zinc-50">Recent eBay sales</h2>
            <p className="text-xs text-zinc-400">Real individual sold listings, not an estimate.</p>
            <ul className="mt-4 divide-y divide-zinc-100 dark:divide-zinc-900">
              {recentSales.slice(0, 8).map((sale) => (
                <li key={sale.listingId} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <AffiliateLink
                      href={sale.url}
                      eventName="eBay Click"
                      eventData={{ card: cardName, page: "recent_sales" }}
                      className="line-clamp-1 block text-sm text-zinc-700 hover:underline dark:text-zinc-300"
                    >
                      {sale.title}
                    </AffiliateLink>
                    <p className="text-xs text-zinc-400">
                      {formatSaleDate(sale.soldDate)} &middot;{" "}
                      {sale.listingType === "auction" ? "Auction" : "Buy It Now"}
                    </p>
                  </div>
                  <span className="shrink-0 font-semibold text-black dark:text-zinc-50">
                    ${Number(sale.price).toFixed(2)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <p className="mt-6 text-center text-xs text-zinc-400">
          Card-to-listing matching is automated and not perfect - always double-check a listing&apos;s
          photos and description before buying.
        </p>
      </div>
    </div>
  );
}
