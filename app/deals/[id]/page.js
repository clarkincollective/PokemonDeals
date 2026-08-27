import { cache } from "react";
import Image from "next/image";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { buildTcgplayerLink } from "@/lib/tcgplayer";
import { MARKETPLACES } from "@/lib/ebay";
import { getFullPriceAnalysis } from "@/lib/pokemonPriceTracker";
import { dealScore } from "@/lib/dealScore";
import PriceHistoryChart from "@/components/PriceHistoryChart";
import VariantPriceGrid from "@/components/VariantPriceGrid";
import SiteHeader from "@/components/SiteHeader";
import DealScoreBadge from "@/components/DealScoreBadge";
import CardImagePlaceholder from "@/components/CardImagePlaceholder";
import AffiliateLink from "@/components/AffiliateLink";

// Always fresh - this only runs when someone actually opens a deal, so an
// on-demand price-history fetch here doesn't multiply the scheduled scan's
// request budget the way adding it to every watchlist item would.
export const dynamic = "force-dynamic";

function formatSaleDate(dateString) {
  return new Date(dateString).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

// cache() dedupes this within a single request - generateMetadata and the
// page component below both need the same deal, and without this it'd be
// two round-trips to the database per page view instead of one.
const loadDeal = cache(async (id) => {
  const { data } = await supabase
    .from("deals")
    .select("*, watchlist:watchlist_id (name, set, justtcg_tcgplayer_id)")
    .eq("id", id)
    .single();
  return data;
});

export async function generateMetadata({ params }) {
  const { id } = await params;
  const deal = await loadDeal(id);
  if (!deal) return { title: "Deal not found" };

  const cardName = deal.watchlist?.name ?? deal.title;
  const cardSet = deal.watchlist?.set;
  const discountPct = Math.round(deal.discount_pct * 100);
  const title = `${cardName}${cardSet ? ` (${cardSet})` : ""} - ${discountPct}% below market`;
  const description = `$${Number(deal.total_price).toFixed(2)} vs a $${Number(deal.market_price).toFixed(
    2
  )} market price - ${discountPct}% below market on eBay.`;

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
    // A deal that's sold/expired shouldn't rank for searches about a live
    // discount that no longer exists - only actively-listed deals are
    // worth indexing.
    robots: deal.is_active ? undefined : { index: false, follow: true },
  };
}

async function loadPriceAnalysis(deal, watchlist) {
  try {
    return await getFullPriceAnalysis(watchlist.justtcg_tcgplayer_id, {
      primaryGrader: deal.grader,
      primaryGrade: deal.grade,
    });
  } catch (err) {
    console.error("Price analysis lookup failed:", err.message);
    return null;
  }
}

export default async function DealDetailPage({ params }) {
  const { id } = await params;

  const deal = await loadDeal(id);

  if (!deal) {
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

  const analysis = await loadPriceAnalysis(deal, deal.watchlist);

  // The chart/section for THIS specific listing's own variant - raw uses
  // analysis.raw directly, graded finds its matching tile in
  // analysis.graded by the key the library already computed.
  const primaryHistory = deal.is_graded
    ? analysis?.graded?.find((g) => g.key === analysis.primaryKey)?.history ?? []
    : analysis?.raw?.history ?? [];
  const recentSales = analysis?.primaryRecentSales ?? [];

  const cardName = deal.watchlist?.name ?? deal.title;
  const cardSet = deal.watchlist?.set;
  const isAuction = deal.listing_type === "AUCTION";
  const marketInfo = MARKETPLACES[deal.marketplace];
  const tcgplayerLink = buildTcgplayerLink(cardName, deal.watchlist?.justtcg_tcgplayer_id);

  // Structured data so a search result can show price/availability
  // directly (Google's Product rich result). Auctions report the current
  // bid as the price with an UsedCondition note in the description above,
  // not a special schema.org auction type - Offer doesn't model
  // "current bid, may rise" cleanly, and this stays accurate either way.
  const productJsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: `${cardName}${cardSet ? ` - ${cardSet}` : ""}`,
    image: deal.image_url ?? undefined,
    description: deal.title,
    offers: {
      "@type": "Offer",
      url: deal.listing_url,
      priceCurrency: marketInfo?.currency ?? "USD",
      price: Number(deal.total_price).toFixed(2),
      availability: deal.is_active ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
      itemCondition: "https://schema.org/UsedCondition",
    },
  };

  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Deals", item: "https://pokemondealfinder.com/" },
      { "@type": "ListItem", position: 2, name: cardName, item: `https://pokemondealfinder.com/deals/${deal.id}` },
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
                {Math.round(deal.discount_pct * 100)}% below market
              </span>
              <DealScoreBadge score={dealScore(deal.discount_pct)} size="lg" />
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

            <h1 className="mt-3 text-xl font-bold text-black dark:text-zinc-50">{cardName}</h1>
            {cardSet && <p className="text-zinc-500">{cardSet}</p>}
            <p className="mt-1 line-clamp-2 text-sm text-zinc-400">{deal.title}</p>

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
                  discountPct: Math.round(deal.discount_pct * 100),
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
                <p className="text-xs text-zinc-400">Current raw market price by condition.</p>
                <ul className="mt-4 flex flex-col gap-2">
                  {analysis.conditionBreakdown.map((c) => (
                    <li key={c.condition} className="flex items-center justify-between text-sm">
                      <span className="text-zinc-600 dark:text-zinc-300">{c.condition}</span>
                      <span className="font-semibold text-black dark:text-zinc-50">${Number(c.price).toFixed(2)}</span>
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
