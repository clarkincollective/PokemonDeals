import { cache } from "react";
import { unstable_cache } from "next/cache";
import Image from "next/image";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { buildTcgplayerLink } from "@/lib/tcgplayer";
import { MARKETPLACES, wrapEbayAffiliateUrl } from "@/lib/ebay";
import { currencyForDeal, refInListingCurrency, dealTotalUsd } from "@/lib/money";
import Price from "@/components/Price";
import AuctionPrice from "@/components/AuctionPrice";
import { getSealedPriceHistory } from "@/lib/pokemonPriceTracker";
import { shouldIndexDeal } from "@/lib/indexability";
import { isExactEbayDealDestination, auctionEnded } from "@/lib/dealQuality";
import { timeAgo, timeUntil } from "@/lib/time";
import PriceHistoryChart from "@/components/PriceHistoryChart";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import CardImagePlaceholder from "@/components/CardImagePlaceholder";
import { normalizePublicText } from "@/lib/publicText";
import AffiliateLink from "@/components/AffiliateLink";
import ShareButton from "@/components/ShareButton";
import Breadcrumbs from "@/components/Breadcrumbs";

const SITE_URL = "https://pokemondealfinder.com";

// See app/deals/[id]/page.js's identical reasoning - export const
// revalidate alone doesn't cache this route, since Next 15+ defaults
// every fetch() to uncached and the Supabase client's internal fetch
// calls carry no cache option, forcing the whole route dynamic
// regardless. Wrapping the actual data fetch in unstable_cache is what
// verified live to actually work. 60s (not price history's 300s below):
// this row's own is_active flag is what keeps a sold/expired deal from
// rendering as live and buyable, so it shouldn't sit stale as long.
// No request-time APIs on this route (currency/region are client-side
// now), so an empty generateStaticParams + a revalidate window flips it
// from fully-dynamic to ISR (edge-cached, background-revalidated). Sealed
// deals are few but still churn, so nothing is prerendered at build.
export const revalidate = 120;
export async function generateStaticParams() {
  return [];
}

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
  if (!shouldIndexDeal(deal) || auctionEnded(deal) || !isExactEbayDealDestination(deal))
    return { title: "Deal not found", robots: { index: false, follow: true } };

  const productName = normalizePublicText(deal.sealed_watchlist?.name ?? deal.title);
  const productSet = deal.sealed_watchlist?.set;
  const discountPct = Math.round(deal.discount_pct * 100);
  // Length-aware, same approach as the card hub: keep the real product
  // (and set) name intact and drop the "- N% below market" suffix rather
  // than let the title run long once the site-name template is appended.
  const titleBase = `${productName}${productSet ? ` (${productSet})` : ""}`;
  const titleSuffix = ` - ${discountPct}% below market`;
  const title = titleBase.length + titleSuffix.length <= 58 ? `${titleBase}${titleSuffix}` : titleBase;
  // Real product/set context up front, not just bare price numbers - see
  // app/deals/[id]/page.js's identical reasoning. Both figures are USD
  // (dealTotalUsd + the USD market_price) so a non-USD listing isn't
  // rendered as "$685" beside a "$558" USD market price.
  const listingUsd = dealTotalUsd(deal);
  const marketUsd = Number(deal.market_price);
  const forClause = listingUsd ? ` for $${listingUsd.toFixed(2)}` : "";
  const description = `${productName}${productSet ? ` (${productSet})` : ""}${forClause} - ${discountPct}% below the $${marketUsd.toFixed(2)} real market price on eBay.`;

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

export default async function SealedDealDetailPage({ params }) {
  const { id } = await params;
  const deal = await loadDeal(id);

  // Same real bug and fix as app/deals/[id]/page.js: without the
  // is_active check, a deactivated deal (expired, corrected for bad
  // data, or superseded) kept rendering indefinitely as a live, fully
  // buyable page with real-looking pricing/CTAs to anyone who still had
  // the link - a genuine correctness and trust problem, not just an SEO
  // one, but it also means Google would keep re-crawling stale content
  // instead of a clear "gone" signal.
  if (!shouldIndexDeal(deal) || auctionEnded(deal) || !isExactEbayDealDestination(deal)) {
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
  const productName = normalizePublicText(watchlist?.name ?? deal.title);
  const productSet = watchlist?.set;
  const discountPct = Math.round(deal.discount_pct * 100);
  // Native currency on the server (keeps this page cacheable); <Price>
  // localises after hydration. market_price / "saved" are USD.
  const nativeCurrency = currencyForDeal(deal);
  const total = Number(deal.total_price);
  const usdTotal = Number(deal.total_price_usd ?? deal.total_price);
  const marketUsd = Number(deal.market_price);
  const savedUsd = marketUsd - usdTotal;
  // USD reference / savings in the listing's own currency so a comparison
  // block never mixes AUD/USD before <Price> localises both together
  // after hydration (lib/money.refInListingCurrency).
  const marketNative = refInListingCurrency(marketUsd, total, usdTotal, nativeCurrency);
  const savedNative = marketNative != null ? marketNative - total : null;
  const showRef = Number.isFinite(marketUsd) && savedUsd > 0 && marketNative != null;
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
    description: normalizePublicText(deal.title),
    brand: { "@type": "Brand", name: "Pokemon" },
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

  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Deals", item: `${SITE_URL}/` },
      { "@type": "ListItem", position: 2, name: "Sealed product", item: `${SITE_URL}/sealed-deals` },
      {
        "@type": "ListItem",
        position: 3,
        name: `${productName}${productSet ? ` (${productSet})` : ""}`,
        item: `${SITE_URL}/sealed-deals/${deal.id}`,
      },
    ],
  };

  return (
    <div className="min-h-screen bg-paper">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(productJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }} />
      <SiteHeader />
      <div className="mx-auto max-w-5xl px-6 py-10">
        <Breadcrumbs
          items={[
            { name: "Deals", href: "/" },
            { name: "Sealed product", href: "/sealed-deals" },
            { name: productName },
          ]}
        />

        <div className="mt-4 flex flex-col gap-6 rounded-xl border border-zinc-200 bg-white p-6 shadow-card sm:flex-row dark:border-zinc-800 dark:bg-zinc-950">
          <div className="relative h-56 w-56 shrink-0 self-center overflow-hidden rounded-lg bg-zinc-50 sm:self-auto dark:bg-zinc-900">
            {deal.image_url ? (
              <Image src={deal.image_url} alt={normalizePublicText(deal.title)} fill sizes="224px" className="object-contain p-3" />
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
            <p className="mt-1 line-clamp-2 text-sm text-zinc-400">{normalizePublicText(deal.title)}</p>

            <div className="mt-4">
              {isAuction ? (
                // P0 auction-price-integrity: headline = CURRENT BID, with
                // shipping + estimated landed total on their own lines.
                <AuctionPrice
                  deal={deal}
                  marketUsd={marketUsd}
                  marketNative={marketNative}
                  discountPct={discountPct}
                  variant="detail"
                />
              ) : (
                <>
                  <div className="flex items-baseline gap-3">
                    <Price
                      usd={usdTotal}
                      native={{ amount: total, currency: nativeCurrency }}
                      className="text-2xl font-bold text-black dark:text-zinc-50"
                    />
                    {showRef && (
                      <span className="text-lg text-zinc-400 line-through">
                        <Price
                          usd={marketUsd}
                          native={{ amount: marketNative, currency: nativeCurrency }}
                          approxPrefix=""
                        />
                      </span>
                    )}
                  </div>
                  {showRef ? (
                    <p className="mt-1 text-sm font-medium text-emerald-600 dark:text-emerald-500">
                      You save{" "}
                      <Price usd={savedUsd} native={{ amount: savedNative, currency: nativeCurrency }} /> ·{" "}
                      {discountPct}% below market
                    </p>
                  ) : (
                    <p className="mt-1 text-sm font-medium text-emerald-600 dark:text-emerald-500">
                      {discountPct}% below market
                    </p>
                  )}
                </>
              )}
            </div>
            {isAuction && deal.auction_end_at && (
              <p className="mt-1 text-xs font-medium text-amber-600 dark:text-amber-400">
                Auction ends {timeUntil(deal.auction_end_at)}
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
                href={wrapEbayAffiliateUrl(deal.affiliate_url, { surface: "deal_page" })}
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
                {isAuction ? "Bid on eBay →" : "View on eBay →"}
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
                text={`${productName}${productSet ? ` (${productSet})` : ""}${dealTotalUsd(deal) ? ` - $${dealTotalUsd(deal).toFixed(2)},` : " -"} ${discountPct}% below market on Pokemon Deal Finder`}
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
                <Price
                  usd={marketUsd}
                  native={{ amount: marketNative ?? marketUsd, currency: marketNative != null ? nativeCurrency : "USD" }}
                  approxPrefix=""
                />
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
