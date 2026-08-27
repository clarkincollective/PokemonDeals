import { cache } from "react";
import Image from "next/image";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { buildTcgplayerLink } from "@/lib/tcgplayer";
import { MARKETPLACES } from "@/lib/ebay";
import { getSealedPriceHistory } from "@/lib/pokemonPriceTracker";
import { dealScore } from "@/lib/dealScore";
import { timeAgo, timeUntil } from "@/lib/time";
import PriceHistoryChart from "@/components/PriceHistoryChart";
import SiteHeader from "@/components/SiteHeader";
import DealScoreBadge from "@/components/DealScoreBadge";
import CardImagePlaceholder from "@/components/CardImagePlaceholder";
import AffiliateLink from "@/components/AffiliateLink";
import ShareButton from "@/components/ShareButton";

const SITE_URL = "https://pokemondealfinder.com";

export const dynamic = "force-dynamic";

const loadDeal = cache(async (id) => {
  const { data } = await supabase
    .from("sealed_deals")
    .select("*, sealed_watchlist:sealed_watchlist_id (name, set, tcgplayer_id)")
    .eq("id", id)
    .single();
  return data;
});

export async function generateMetadata({ params }) {
  const { id } = await params;
  const deal = await loadDeal(id);
  if (!deal) return { title: "Deal not found" };

  const productName = deal.sealed_watchlist?.name ?? deal.title;
  const productSet = deal.sealed_watchlist?.set;
  const discountPct = Math.round(deal.discount_pct * 100);
  const title = `${productName}${productSet ? ` (${productSet})` : ""} - ${discountPct}% below market`;
  const description = `$${Number(deal.total_price).toFixed(2)} vs a $${Number(deal.market_price).toFixed(
    2
  )} market price - ${discountPct}% below market on eBay.`;

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
    robots: deal.is_active ? undefined : { index: false, follow: true },
  };
}

export default async function SealedDealDetailPage({ params }) {
  const { id } = await params;
  const deal = await loadDeal(id);

  if (!deal) {
    return (
      <div className="min-h-screen bg-zinc-50 dark:bg-black">
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
  const amountSaved = Number(deal.market_price) - Number(deal.total_price);
  const isAuction = deal.listing_type === "AUCTION";
  const marketInfo = MARKETPLACES[deal.marketplace];
  const tcgplayerLink = buildTcgplayerLink(productName, watchlist?.tcgplayer_id);

  let history = [];
  if (watchlist?.tcgplayer_id) {
    try {
      history = await getSealedPriceHistory(watchlist.tcgplayer_id);
    } catch (err) {
      console.error("Sealed price history lookup failed:", err.message);
    }
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
    <div className="min-h-screen bg-zinc-50 dark:bg-black">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(productJsonLd) }} />
      <SiteHeader />
      <div className="mx-auto max-w-5xl px-6 py-10">
        <Link
          href="/sealed-deals"
          className="block text-sm font-medium text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
        >
          ← All sealed product deals
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
              <span className="rounded-md bg-zinc-100 px-2.5 py-0.5 text-xs font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                Sealed
              </span>
              <span className="rounded-md bg-zinc-100 px-2.5 py-0.5 text-xs font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                {isAuction ? "Auction" : "Buy It Now"}
              </span>
              {marketInfo && <span title={marketInfo.label}>{marketInfo.flag}</span>}
            </div>

            <h1 className="mt-3 text-xl font-bold text-black dark:text-zinc-50">{productName}</h1>
            {productSet && <p className="text-zinc-500">{productSet}</p>}
            <p className="mt-1 line-clamp-2 text-sm text-zinc-400">{deal.title}</p>

            <div className="mt-4">
              <div className="flex items-baseline gap-3">
                <span className="text-2xl font-bold text-black dark:text-zinc-50">
                  ${Number(deal.total_price).toFixed(2)}
                </span>
                <span className="text-lg text-zinc-400 line-through">
                  ${Number(deal.market_price).toFixed(2)}
                </span>
              </div>
              {amountSaved > 0 && (
                <p className="mt-1 text-sm font-medium text-emerald-600 dark:text-emerald-500">
                  You save ${amountSaved.toFixed(2)}
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

        {history.length > 0 && (
          <div className="mt-6 rounded-lg border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
            <h2 className="text-sm font-semibold text-black dark:text-zinc-50">Price history</h2>
            <div className="mt-4">
              <PriceHistoryChart points={history} />
            </div>
          </div>
        )}
      </div>

      <footer className="border-t border-zinc-200 px-6 py-8 text-center text-xs text-zinc-500 dark:border-zinc-800">
        As an eBay and TCGPlayer affiliate, we earn a commission on qualifying purchases made through
        links on this site. Prices and availability are subject to change. Listing-to-product matching
        is automated and not perfect - always double-check a listing&apos;s photos and description
        (and that it&apos;s genuinely factory sealed) before buying.
      </footer>
    </div>
  );
}
