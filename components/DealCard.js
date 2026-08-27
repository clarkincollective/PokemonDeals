import Image from "next/image";
import Link from "next/link";
import { MARKETPLACES } from "@/lib/ebay";
import { buildTcgplayerLink } from "@/lib/tcgplayer";
import { slugifySet } from "@/lib/slugify";
import { timeAgo, timeUntil } from "@/lib/time";
import AffiliateLink from "@/components/AffiliateLink";
import DealScoreBadge from "@/components/DealScoreBadge";
import CardImagePlaceholder from "@/components/CardImagePlaceholder";
import ShareButton from "@/components/ShareButton";

const SITE_URL = "https://pokemondealfinder.com";

// rank (e.g. 1-10) and scoreBadge ({label, className}, from lib/dealScore.js)
// are optional - always passed from Best Finds and search, and now also
// from the homepage grid so every card shows a Deal Score consistently.
export default function DealCard({ deal, rank, scoreBadge, pageName = "home" }) {
  const cardName = deal.watchlist?.name ?? deal.title;
  const cardSet = deal.watchlist?.set;
  const discountPct = Math.round(deal.discount_pct * 100);
  const amountSaved = Number(deal.market_price) - Number(deal.total_price);
  const tcgplayerLink = buildTcgplayerLink(cardName, deal.watchlist?.justtcg_tcgplayer_id);
  const isAuction = deal.listing_type === "AUCTION";
  const marketInfo = MARKETPLACES[deal.marketplace];
  // /sets/[slug] only exists for English cards (see app/sets/page.js -
  // its index is only ever built with language: "english") - Japanese
  // sets have no hub page yet, so this only links when it's real.
  const setSlug = cardSet && deal.watchlist?.language !== "japanese" ? slugifySet(cardSet) : null;

  return (
    <div className="group flex h-full flex-col overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-sm transition-shadow hover:shadow-md dark:border-zinc-800 dark:bg-zinc-950">
      {/* Image */}
      <a href={`/deals/${deal.id}`} className="relative block aspect-square w-full bg-zinc-50 dark:bg-zinc-900">
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

      {/* Details */}
      <div className="flex flex-1 flex-col gap-2 p-4">
        <div className="flex flex-wrap items-center gap-1.5">
          <DealScoreBadge score={scoreBadge} />
          {deal.watchlist?.language === "japanese" && (
            <span className="rounded-md bg-zinc-100 px-2 py-0.5 text-[11px] font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
              🇯🇵 Japanese
            </span>
          )}
          {deal.is_graded ? (
            <span className="rounded-md bg-indigo-100 px-2 py-0.5 text-[11px] font-medium text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
              {deal.grader} {deal.grade}
            </span>
          ) : (
            deal.condition && (
              <span className="rounded-md bg-zinc-100 px-2 py-0.5 text-[11px] font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                {deal.condition}
              </span>
            )
          )}
          <span className="rounded-md bg-zinc-100 px-2 py-0.5 text-[11px] font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
            {isAuction ? "Auction" : "Buy It Now"}
          </span>
        </div>

        <a
          href={`/deals/${deal.id}`}
          className="line-clamp-2 font-semibold leading-snug text-black hover:underline dark:text-zinc-50"
        >
          {cardName}
        </a>
        {cardSet && (
          setSlug ? (
            <Link
              href={`/sets/${setSlug}`}
              className="line-clamp-1 text-xs text-zinc-500 hover:text-red-600 hover:underline dark:hover:text-red-500"
            >
              {cardSet}
            </Link>
          ) : (
            <p className="line-clamp-1 text-xs text-zinc-500">{cardSet}</p>
          )
        )}

        <div className="mt-1">
          <div className="flex items-baseline gap-2">
            <span className="text-lg font-bold text-black dark:text-zinc-50">
              ${Number(deal.total_price).toFixed(2)}
            </span>
            <span className="text-sm text-zinc-400 line-through">
              ${Number(deal.market_price).toFixed(2)}
            </span>
          </div>
          {amountSaved > 0 && (
            <p className="text-xs font-medium text-emerald-600 dark:text-emerald-500">
              You save ${amountSaved.toFixed(2)}
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

        <div className="mt-auto flex flex-col gap-1.5 pt-2">
          <div className="flex gap-1.5">
            <a
              href={`/deals/${deal.id}#price-analysis`}
              title="View price history and every graded tier"
              aria-label="View price history"
              className="flex shrink-0 items-center justify-center rounded-md border border-zinc-200 px-2.5 text-zinc-500 transition-colors hover:border-zinc-300 hover:text-zinc-700 dark:border-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200"
            >
              <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                <path d="M3 15.5 7.5 9l3 3.5L16.5 5" />
                <path d="M12 5h4.5v4.5" />
              </svg>
            </a>
            <ShareButton
              url={`${SITE_URL}/deals/${deal.id}`}
              title={`${cardName} - ${discountPct}% below market`}
              text={`${cardName}${cardSet ? ` (${cardSet})` : ""} - $${Number(deal.total_price).toFixed(2)}, ${discountPct}% below market on Pokémon Deal Finder`}
              className="rounded-md px-2.5"
            />
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
              className="block flex-1 rounded-md bg-black px-4 py-2 text-center text-sm font-semibold text-white transition-colors hover:bg-zinc-800 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
            >
              {isAuction ? "Bid Now →" : "View Deal →"}
            </AffiliateLink>
          </div>
          <AffiliateLink
            href={tcgplayerLink}
            eventName="TCGPlayer Click"
            eventData={{ card: cardName, page: pageName }}
            className="text-center text-xs font-medium text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
          >
            Check on TCGPlayer
          </AffiliateLink>
        </div>
      </div>
    </div>
  );
}
