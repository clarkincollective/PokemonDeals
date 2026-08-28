import Image from "next/image";
import { MARKETPLACES } from "@/lib/ebay";
import { buildTcgplayerLink } from "@/lib/tcgplayer";
import { formatMoney, viewerPricing } from "@/lib/money";
import { timeAgo, timeUntil } from "@/lib/time";
import AffiliateLink from "@/components/AffiliateLink";
import DealScoreBadge from "@/components/DealScoreBadge";
import CardImagePlaceholder from "@/components/CardImagePlaceholder";
import ShareButton from "@/components/ShareButton";

const SITE_URL = "https://pokemondealfinder.com";

// Same visual language as DealCard, minus condition/grading (sealed
// product has neither) - deal is a sealed_deals row joined to
// sealed_watchlist (see app/sealed-deals/page.js).
export default function SealedDealCard({ deal, rank, scoreBadge, pageName = "sealed", viewerCurrency, rates }) {
  const productName = deal.sealed_watchlist?.name ?? deal.title;
  const productSet = deal.sealed_watchlist?.set;
  const discountPct = Math.round(deal.discount_pct * 100);
  const price = viewerPricing(deal, viewerCurrency, rates);
  const currency = price.currency;
  const showRef = price.market != null && price.saved > 0;
  const approxPrefix = price.approx ? "≈ " : "";
  const tcgplayerLink = buildTcgplayerLink(productName, deal.sealed_watchlist?.tcgplayer_id);
  const isAuction = deal.listing_type === "AUCTION";
  const marketInfo = MARKETPLACES[deal.marketplace];

  return (
    <div className="group flex h-full flex-col overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-card transition-all duration-200 hover:-translate-y-0.5 hover:shadow-card-hover dark:border-zinc-800 dark:bg-zinc-950">
      <a href={`/sealed-deals/${deal.id}`} className="relative block aspect-square w-full bg-zinc-50 dark:bg-zinc-900">
        {deal.image_url ? (
          <Image
            src={deal.image_url}
            alt={deal.title}
            fill
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
            className="object-contain p-3 transition-transform duration-200 group-hover:scale-[1.03]"
          />
        ) : (
          <CardImagePlaceholder />
        )}
        {rank != null && (
          <span className="absolute left-2 top-2 flex h-6 w-6 items-center justify-center rounded-md bg-black/80 text-xs font-bold text-white">
            {rank}
          </span>
        )}
        <span className="absolute right-2 top-2 flex flex-col items-center rounded-md bg-emerald-600 px-2 py-1 leading-none text-white shadow-sm">
          <span className="text-sm font-extrabold">{discountPct}%</span>
          <span className="mt-0.5 text-[8px] font-bold uppercase tracking-wide">below market</span>
        </span>
        {marketInfo && (
          <span
            className={`absolute left-2 ${rank != null ? "top-10" : "top-2"} rounded-md bg-white/90 px-2 py-1 text-xs shadow-sm dark:bg-zinc-950/90`}
            title={marketInfo.label}
          >
            {marketInfo.flag}
          </span>
        )}
      </a>

      <div className="flex flex-1 flex-col gap-2 p-4">
        <div className="flex flex-wrap items-center gap-1.5">
          <DealScoreBadge score={scoreBadge} />
          <span className="rounded-md bg-zinc-100 px-2 py-0.5 text-[11px] font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
            Sealed
          </span>
          <span className="rounded-md bg-zinc-100 px-2 py-0.5 text-[11px] font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
            {isAuction ? "Auction" : "Buy It Now"}
          </span>
        </div>

        <a
          href={`/sealed-deals/${deal.id}`}
          className="line-clamp-2 font-semibold leading-snug text-black hover:underline dark:text-zinc-50"
        >
          {productName}
        </a>
        {productSet && <p className="line-clamp-1 text-xs text-zinc-500">{productSet}</p>}

        <div className="mt-1">
          <div className="flex items-baseline gap-2">
            <span className="text-lg font-bold text-black dark:text-zinc-50">
              {approxPrefix}
              {formatMoney(price.listing, currency)}
            </span>
            {showRef && (
              <span className="text-sm text-zinc-400 line-through">
                {formatMoney(price.market, currency)}
              </span>
            )}
          </div>
          {showRef ? (
            <p className="text-xs font-medium text-emerald-600 dark:text-emerald-500">
              You save {formatMoney(price.saved, currency)} · {discountPct}% below market
            </p>
          ) : (
            <p className="text-xs font-medium text-emerald-600 dark:text-emerald-500">
              {discountPct}% below market
            </p>
          )}
        </div>
        {isAuction && (
          <div className="-mt-1 text-xs font-medium text-amber-600 dark:text-amber-400">
            Current bid{deal.bid_count != null ? ` · ${deal.bid_count} bids` : ""}
            {deal.auction_end_at && ` · ${timeUntil(deal.auction_end_at)}`}
          </div>
        )}

        <p className="text-[11px] text-zinc-400">
          Found {timeAgo(deal.first_seen_at)}
          {deal.seller_feedback_pct != null && ` · ${Number(deal.seller_feedback_pct).toFixed(1)}% seller feedback`}
        </p>

        <div className="mt-auto flex gap-1.5 pt-2">
          <ShareButton
            url={`${SITE_URL}/sealed-deals/${deal.id}`}
            title={`${productName} - ${discountPct}% below market`}
            text={`${productName}${productSet ? ` (${productSet})` : ""} - $${Number(deal.total_price).toFixed(2)}, ${discountPct}% below market on Pokémon Deal Finder`}
            className="rounded-md px-2.5"
          />
          <AffiliateLink
            href={deal.affiliate_url}
            eventName="eBay Click"
            eventData={{
              product: productName,
              marketplace: deal.marketplace,
              discountPct,
              listingType: deal.listing_type,
              page: pageName,
            }}
            className="block flex-1 rounded-md bg-black px-4 py-2 text-center text-sm font-semibold text-white transition-colors hover:bg-zinc-800 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
          >
            {isAuction ? "Bid Now →" : "View Deal →"}
          </AffiliateLink>
        </div>
        <AffiliateLink
          href={tcgplayerLink}
          eventName="TCGPlayer Click"
          eventData={{ product: productName, page: pageName }}
          className="mt-1.5 text-center text-xs font-medium text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
        >
          Check on TCGPlayer
        </AffiliateLink>
      </div>
    </div>
  );
}
