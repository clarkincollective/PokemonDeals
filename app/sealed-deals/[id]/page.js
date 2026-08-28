import { cache } from "react";
import { unstable_cache } from "next/cache";
import Image from "next/image";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { buildTcgplayerLink } from "@/lib/tcgplayer";
import { MARKETPLACES } from "@/lib/ebay";
import { formatMoney, viewerPricing, toViewerCurrency } from "@/lib/money";
import { viewerCurrency } from "@/lib/viewerCurrency";
import { getUsdRates } from "@/lib/fx";
import { getSealedPriceHistory } from "@/lib/pokemonPriceTracker";
import { shouldIndexDeal } from "@/lib/indexability";
import { timeAgo, timeUntil } from "@/lib/time";
import PriceHistoryChart from "@/components/PriceHistoryChart";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import CardImagePlaceholder from "@/components/CardImagePlaceholder";
import AffiliateLink from "@/components/AffiliateLink";
import ShareButton from "@/components/ShareButton";

const SITE_URL = "https://pokemondealfinder.com";

// See app/deals/[id]/page.js's identical reasoning - export const
// revalidate alone doesn't cache this route, since Next 15+ defaults
// every fetch() to uncached and the Supabase client's internal fetch
// calls carry no cache option, forcing the whole route dynamic
// regardless. Wrapping the actual data fetch in unstable_cache is what
// verified live to actually work. 60s (not price history's 300s below):
// this row's own is_active flag is what keeps a sold/expired deal from
// rendering as live and buyable, so it shouldn't sit stale as long.
const loadDealUncached = async (id) => {
  const { data } = await supabase
    .from("sealed_deals")
    .select("*, sealed_watchlist:sealed_watchlist_id (name, set, tcgplayer_id)")
    .eq("id", id)
    .single();
  return data;
};

const loadDealFromDataCache = unstable_cache(loadDealUncached, ["sealed-deal-detail"], { revalidate: 60 });

const loadDeal = cache(loadDealFromDataCache);

// Real, billed PokemonPriceTracker API call, keyed on the product's own
// id (not the deal row) - every deal for the same sealed product shares
// one cache entry, same reasoning as loadPriceAnalysis in
// app/deals/[id]/page.js. 300s: reference pricing, not this deal's own
// live/sold state.
const loadSealedHistoryUncached = async (tcgplayerId) => {
  try {
    return await getSealedPriceHistory(tcgplayerId);
  } catch (err) {
    console.error("Sealed price history lookup failed:", err.message);
    return [];
  }
};

const loadSealedHistory = unstable_cache(loadSealedHistoryUncached, ["sealed-price-history"], {
  revalidate: 300,
});

export async function generateMetadata({ params }) {
  const { id } = await params;
  const deal = await loadDeal(id);
  // Same real bug and same fix as app/deals/[id]/page.js: an inactive
  // deal is as good as not found for anyone landing here - don't
  // generate a title/description repeating pricing/discount claims that
  // are no longer real (a link shared or indexed before the deal
  // expired), even in a link-preview card, which never hits the page
  // component's own is_active check below.
  if (!shouldIndexDeal(deal)) return { title: "Deal not found", robots: { index: false, follow: true } };

  const productName = deal.sealed_watchlist?.name ?? deal.title;
  const productSet = deal.sealed_watchlist?.set;
  const discountPct = Math.round(deal.discount_pct * 100);
  // Length-aware, same approach as the card hub: keep the real product
  // (and set) name intact and drop the "- N% below market" suffix rather
  // than let the title run long once the site-name template is appended.
  const titleBase = `${productName}${productSet ? ` (${productSet})` : ""}`;
  const titleSuffix = ` - ${discountPct}% below market`;
  const title = titleBase.length + titleSuffix.length <= 58 ? `${titleBase}${titleSuffix}` : titleBase;
  // Real product/set context up front, not just bare price numbers - see
  // app/deals/[id]/page.js's identical reasoning.
  const description = `${productName}${productSet ? ` (${productSet})` : ""} for $${Number(
    deal.total_price
  ).toFixed(2)} - ${discountPct}% below the $${Number(deal.market_price).toFixed(2)} real market price on eBay.`;

  return {
    title,
    description,
    alternates: { canonical: `/sealed-deals/${id}` },
    openGraph: {
      title,
      description,
      images: deal.image_url ? [deal.image_url] : undefined,
    },
    twitter: {
      card: deal.image_url ? "summary_large_image" : "summary",
      title,
      description,
      images: deal.image_url ? [deal.image_url] : undefined,
    },
    // Always active here - the inactive case returns early above.
  };
}

export default async function SealedDealDetailPage({ params, searchParams }) {
  const { id } = await params;
  const sp = (await searchParams) ?? {};
  const deal = await loadDeal(id);

  // Same real bug and fix as app/deals/[id]/page.js: without the
  // is_active check, a deactivated deal (expired, corrected for bad
  // data, or superseded) kept rendering indefinitely as a live, fully
  // buyable page with real-looking pricing/CTAs to anyone who still had
  // the link - a genuine correctness and trust problem, not just an SEO
  // one, but it also means Google would keep re-crawling stale content
  // instead of a clear "gone" signal.
  if (!shouldIndexDeal(deal)) {
    return (
      <div className="min-h-screen bg-paper">
        <SiteHeader />
        <div className="mx-auto max-w-2xl px-6 py-16 text-center">
          <p className="text-zinc-500">Couldn&apos;t find that deal - it may have expired.</p>
          <Link href="/sealed-deals" className="mt-4 inline-block text-sm font-medium underline">
            Back to sealed product deals
          </Link>
        </div>
      </div>
    );
  }

  const watchlist = deal.sealed_watchlist;
  const productName = watchlist?.name ?? deal.title;
  const productSet = watchlist?.set;
  const discountPct = Math.round(deal.discount_pct * 100);
  // Prices in the viewer's currency where detectable (converted from the
  // stored USD figures), else the listing's own currency, as before.
  const [viewerCcy, rates] = await Promise.all([viewerCurrency(sp), getUsdRates()]);
  const price = viewerPricing(deal, viewerCcy, rates);
  const showRef = price.market != null && price.saved > 0;
  const isAuction = deal.listing_type === "AUCTION";
  const marketInfo = MARKETPLACES[deal.marketplace];
  const tcgplayerLink = buildTcgplayerLink(productName, watchlist?.tcgplayer_id);

  let history = [];
  if (watchlist?.tcgplayer_id) {
    history = await loadSealedHistory(watchlist.tcgplayer_id);
  }

  // brand/shippingDetails are real data (see app/deals/[id]/page.js's
  // identical reasoning) - deliberately no hasMerchantReturnPolicy, since
  // the real return policy is set by whichever eBay seller has the
  // listing and varies per one.
  const productJsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: `${productName}${productSet ? ` - ${productSet}` : ""}`,
    image: deal.image_url ?? undefined,
    description: deal.title,
    brand: { "@type": "Brand", name: "Pokémon" },
    offers: {
      "@type": "Offer",
      url: deal.listing_url,
      priceCurrency: marketInfo?.currency ?? "USD",
      price: Number(deal.total_price).toFixed(2),
      availability: deal.is_active ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
      itemCondition: "https://schema.org/NewCondition",
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

  return (
    <div className="min-h-screen bg-paper">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(productJsonLd) }} />
      <SiteHeader />
      <div className="mx-auto max-w-5xl px-6 py-10">
        <Link
          href="/sealed-deals"
          className="block text-sm font-medium text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
        >
          ← All sealed product deals
        </Link>

        <div className="mt-4 flex flex-col gap-6 rounded-xl border border-zinc-200 bg-white p-6 shadow-card sm:flex-row dark:border-zinc-800 dark:bg-zinc-950">
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
              <span className="rounded-md bg-zinc-100 px-2.5 py-0.5 text-xs font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                Sealed
              </span>
              <span className="rounded-md bg-zinc-100 px-2.5 py-0.5 text-xs font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                {isAuction ? "Auction" : "Buy It Now"}
              </span>
              {marketInfo && <span title={marketInfo.label}>{marketInfo.flag}</span>}
            </div>

            {/* Real deal context folded into the H1 - see
                app/deals/[id]/page.js's identical reasoning. */}
            <h1 className="mt-3 text-xl font-bold text-black dark:text-zinc-50">
              {productName}
              <span className="font-medium text-zinc-500"> - {discountPct}% Below Market</span>
            </h1>
            {productSet && <p className="text-zinc-500">{productSet}</p>}
            <p className="mt-1 line-clamp-2 text-sm text-zinc-400">{deal.title}</p>

            <div className="mt-4">
              <div className="flex items-baseline gap-3">
                <span className="text-2xl font-bold text-black dark:text-zinc-50">
                  {price.approx ? "≈ " : ""}
                  {formatMoney(price.listing, price.currency)}
                </span>
                {showRef && (
                  <span className="text-lg text-zinc-400 line-through">
                    {formatMoney(price.market, price.currency)}
                  </span>
                )}
              </div>
              {showRef ? (
                <p className="mt-1 text-sm font-medium text-emerald-600 dark:text-emerald-500">
                  You save {formatMoney(price.saved, price.currency)} · {discountPct}% below market
                </p>
              ) : (
                <p className="mt-1 text-sm font-medium text-emerald-600 dark:text-emerald-500">
                  {discountPct}% below market
                </p>
              )}
            </div>
            {isAuction && (
              <p className="mt-1 text-xs font-medium text-amber-600 dark:text-amber-400">
                Current bid{deal.bid_count != null ? ` · ${deal.bid_count} bids` : ""}
                {deal.auction_end_at && ` · ${timeUntil(deal.auction_end_at)}`} - may rise before the
                auction ends
              </p>
            )}
            {deal.seller_feedback_pct != null && (
              <p className="mt-1 text-xs text-zinc-400">
                {Number(deal.seller_feedback_pct).toFixed(1)}% seller feedback
              </p>
            )}
            <p className="mt-1 text-xs text-zinc-400">Found {timeAgo(deal.first_seen_at)}</p>

            <div className="mt-5 flex flex-wrap gap-3">
              <AffiliateLink
                href={deal.affiliate_url}
                eventName="eBay Click"
                eventData={{
                  product: productName,
                  marketplace: deal.marketplace,
                  discountPct,
                  listingType: deal.listing_type,
                  page: "sealed_detail",
                }}
                className="rounded-lg bg-black px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-zinc-800 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
              >
                {isAuction ? "Bid Now →" : "View Deal →"}
              </AffiliateLink>
              <AffiliateLink
                href={tcgplayerLink}
                eventName="TCGPlayer Click"
                eventData={{ product: productName, page: "sealed_detail" }}
                className="rounded-lg border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-600 hover:border-zinc-300 dark:border-zinc-800 dark:text-zinc-300"
              >
                Check on TCGPlayer
              </AffiliateLink>
              <ShareButton
                url={`${SITE_URL}/sealed-deals/${deal.id}`}
                title={`${productName} - ${discountPct}% below market`}
                text={`${productName}${productSet ? ` (${productSet})` : ""} - $${Number(deal.total_price).toFixed(2)}, ${discountPct}% below market on Pokémon Deal Finder`}
                label="Share"
                className="rounded-lg px-4 py-2"
              />
            </div>
          </div>
        </div>

        <div className="mt-6 rounded-xl border border-zinc-200 bg-white p-6 shadow-card dark:border-zinc-800 dark:bg-zinc-950">
          <h2 className="text-sm font-semibold text-black dark:text-zinc-50">Price history</h2>
          {history.length >= 2 ? (
            <div className="mt-4">
              <PriceHistoryChart points={history} />
            </div>
          ) : (
            <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-300">
              Not enough dated sales to plot a trend yet. Current market value is{" "}
              <span className="font-semibold text-black dark:text-zinc-50">
                {price.approx ? "≈ " : ""}
                {formatMoney(
                  price.market ?? toViewerCurrency(deal.market_price, price.currency, rates),
                  price.currency
                )}
              </span>
              {" "}
              — this listing is{" "}
              <span className="font-semibold text-emerald-600 dark:text-emerald-500">
                {discountPct}% below
              </span>{" "}
              it.
            </p>
          )}
        </div>
      </div>

      <SiteFooter note="Listing-to-product matching is automated and not perfect - always double-check a listing's photos and description (and that it's genuinely factory sealed) before buying." />
    </div>
  );
}
