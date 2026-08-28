import Image from "next/image";
import Link from "next/link";
import { MARKETPLACES } from "@/lib/ebay";
import { slugifySet } from "@/lib/slugify";
import { timeAgo, timeUntil } from "@/lib/time";
import AffiliateLink from "@/components/AffiliateLink";
import CardImagePlaceholder from "@/components/CardImagePlaceholder";
import SaveCardButton from "@/components/SaveCardButton";

// One deal in a grid. Deliberately answers four questions fast and with
// ONE action:
//   what is it        -> image + name + set + condition
//   is it a good deal -> the discount % badge + price / typical / saved
//   can I trust it    -> "N sellers" (real hub count) + recency
//   what if I click   -> a single full-width "Check deal on eBay ->" CTA
//
// `rank` shows a number badge only on ranked lists (Top 10, "Biggest
// discounts"). `hub` is `{ count, slug }` from fetchHubCounts when this
// card has 2+ active listings, optional.
export default function DealCard({ deal, rank, hub, pageName = "home" }) {
  const cardName = deal.watchlist?.name ?? deal.title;
  const cardSet = deal.watchlist?.set;
  const discountPct = Math.round(deal.discount_pct * 100);
  const total = Number(deal.total_price);
  const market = Number(deal.market_price);
  const saved = market - total;
  const isAuction = deal.listing_type === "AUCTION";
  const isJapanese = deal.watchlist?.language === "japanese";
  const marketInfo = MARKETPLACES[deal.marketplace];
  const setSlug = cardSet && !isJapanese ? slugifySet(cardSet) : null;

  const conditionText = deal.is_graded
    ? `${deal.grader ?? "Graded"} ${deal.grade ?? ""}`.trim()
    : deal.condition || "Near Mint";

  return (
    <div className="group flex h-full flex-col overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-sm transition-shadow hover:shadow-md dark:border-zinc-800 dark:bg-zinc-950">
     <div className="relative">
      <div className="absolute bottom-2 right-2 z-10">
        <SaveCardButton
          compact
          card={{
            slug: hub?.slug ?? null,
            dealId: deal.id,
            name: cardName,
            set: cardSet,
            image: deal.image_url,
            price: deal.total_price,
          }}
        />
      </div>
      <a href={`/deals/${deal.id}`} className="relative block aspect-square w-full bg-zinc-50 dark:bg-zinc-900">
        {deal.image_url ? (
          <Image
            src={deal.image_url}
            alt={deal.title}
            fill
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
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
        {marketInfo && (
          <span
            className={`absolute left-2 ${rank != null ? "top-10" : "top-2"} rounded-md bg-white/90 px-1.5 py-0.5 text-xs shadow-sm dark:bg-zinc-950/90`}
            title={marketInfo.label}
          >
            {marketInfo.flag}
          </span>
        )}

        <span className="absolute right-2 top-2 flex items-center gap-1 rounded-md bg-emerald-600 px-2 py-1 text-sm font-extrabold leading-none text-white shadow-sm">
          <svg viewBox="0 0 12 12" fill="currentColor" aria-hidden className="h-3 w-3">
            <path d="M6 9 1.5 3.5h9z" />
          </svg>
          {discountPct}%
        </span>
      </a>
     </div>

      <div className="flex flex-1 flex-col gap-1.5 p-4">
        <a
          href={`/deals/${deal.id}`}
          className="truncate text-[15px] font-semibold leading-snug text-black hover:underline dark:text-zinc-50"
        >
          {cardName}
        </a>

        <p className="truncate text-xs text-zinc-500 dark:text-zinc-400">
          {isJapanese && "🇯🇵 "}
          {setSlug ? (
            <Link href={`/sets/${setSlug}`} className="hover:text-red-600 hover:underline dark:hover:text-red-500">
              {cardSet}
            </Link>
          ) : (
            cardSet
          )}
          {cardSet && " · "}
          {conditionText}
        </p>

        <div className="mt-1 flex items-baseline gap-2">
          <span className="text-lg font-bold text-black dark:text-zinc-50">${total.toFixed(2)}</span>
          <span className="text-xs text-zinc-400 line-through">typical ${market.toFixed(2)}</span>
        </div>
        {saved > 0 && (
          <p className="text-xs font-semibold text-emerald-600 dark:text-emerald-500">Save ${saved.toFixed(2)}</p>
        )}

        <p className="text-[11px] text-zinc-400">
          {isAuction ? (
            <>
              Auction · ends {deal.auction_end_at ? timeUntil(deal.auction_end_at) : "soon"}
              {deal.bid_count != null && ` · ${deal.bid_count} bids`}
            </>
          ) : (
            <>
              {hub?.count >= 2 && (
                <>
                  <Link
                    href={`/cards/${hub.slug}`}
                    className="font-semibold text-zinc-500 hover:text-red-600 hover:underline dark:text-zinc-400 dark:hover:text-red-500"
                  >
                    {hub.count} sellers
                  </Link>
                  {" · "}
                </>
              )}
              found {timeAgo(deal.first_seen_at)}
            </>
          )}
        </p>

        <div className="mt-auto pt-2">
          <AffiliateLink
            href={deal.affiliate_url}
            eventName="eBay Click"
            eventData={{
              card: cardName,
              marketplace: deal.marketplace,
              discountPct,
              listingType: deal.listing_type,
              isGraded: deal.is_graded,
              page: pageName,
            }}
            className="block rounded-md bg-black px-4 py-2 text-center text-sm font-semibold text-white transition-colors hover:bg-zinc-800 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
          >
            {isAuction ? "Bid on eBay →" : "Check deal on eBay →"}
          </AffiliateLink>
        </div>
      </div>
    </div>
  );
}
