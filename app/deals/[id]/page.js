import Image from "next/image";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { buildTcgplayerLink } from "@/lib/tcgplayer";
import { MARKETPLACES } from "@/lib/ebay";
import { getRawPriceHistory, getRawSoldComps, getGradedPrice } from "@/lib/pokemonPriceTracker";
import PriceHistoryChart from "@/components/PriceHistoryChart";
import Logo from "@/components/Logo";
import AffiliateLink from "@/components/AffiliateLink";

// Always fresh - this only runs when someone actually opens a deal, so an
// on-demand price-history fetch here doesn't multiply the scheduled scan's
// request budget the way adding it to every watchlist item would.
export const dynamic = "force-dynamic";

function formatSaleDate(dateString) {
  return new Date(dateString).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

async function loadHistory(deal, watchlist) {
  try {
    if (deal.is_graded) {
      const graded = await getGradedPrice(watchlist.justtcg_tcgplayer_id, deal.grader, deal.grade);
      return { history: graded?.history ?? [], recentSales: graded?.recentSales ?? [] };
    }
    const [history, comps] = await Promise.all([
      getRawPriceHistory(watchlist.justtcg_tcgplayer_id, deal.condition ?? "Near Mint"),
      getRawSoldComps(watchlist.justtcg_tcgplayer_id),
    ]);
    return { history, recentSales: comps.recentSales };
  } catch (err) {
    console.error("Price history lookup failed:", err.message);
    return { history: [], recentSales: [] };
  }
}

export default async function DealDetailPage({ params }) {
  const { id } = await params;

  const { data: deal, error } = await supabase
    .from("deals")
    .select("*, watchlist:watchlist_id (name, set, justtcg_tcgplayer_id)")
    .eq("id", id)
    .single();

  if (error || !deal) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-16 text-center">
        <p className="text-zinc-500">Couldn&apos;t find that deal - it may have expired.</p>
        <Link href="/" className="mt-4 inline-block text-sm font-medium underline">
          Back to all deals
        </Link>
      </div>
    );
  }

  const { history, recentSales } = await loadHistory(deal, deal.watchlist);

  const cardName = deal.watchlist?.name ?? deal.title;
  const cardSet = deal.watchlist?.set;
  const isAuction = deal.listing_type === "AUCTION";
  const marketInfo = MARKETPLACES[deal.marketplace];
  const tcgplayerLink = buildTcgplayerLink(cardName);

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-black">
      <div className="mx-auto max-w-3xl px-6 py-10">
        <Link href="/" className="inline-block">
          <Logo size="small" />
        </Link>
        <Link
          href="/"
          className="mt-4 block text-sm font-medium text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
        >
          ← All deals
        </Link>

        <div className="mt-6 flex flex-col gap-6 rounded-xl border border-zinc-200 bg-white p-6 shadow-sm sm:flex-row dark:border-zinc-800 dark:bg-zinc-950">
          <div className="relative h-48 w-48 shrink-0 self-center overflow-hidden rounded-lg bg-zinc-100 sm:self-auto dark:bg-zinc-900">
            {deal.image_url ? (
              <Image src={deal.image_url} alt={deal.title} fill sizes="192px" className="object-contain p-3" />
            ) : (
              <div className="flex h-full items-center justify-center text-xs text-zinc-400">No image</div>
            )}
          </div>

          <div className="flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-emerald-600 px-2.5 py-0.5 text-xs font-semibold text-white">
                {Math.round(deal.discount_pct * 100)}% off
              </span>
              {deal.is_graded ? (
                <span className="rounded-full bg-indigo-100 px-2.5 py-0.5 text-xs font-medium text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
                  {deal.grader} {deal.grade}
                </span>
              ) : (
                deal.condition && (
                  <span className="rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                    {deal.condition}
                  </span>
                )
              )}
              <span className="rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                {isAuction ? "Auction" : "Buy It Now"}
              </span>
              {marketInfo && <span title={marketInfo.label}>{marketInfo.flag}</span>}
            </div>

            <h1 className="mt-3 text-xl font-bold text-black dark:text-zinc-50">{cardName}</h1>
            {cardSet && <p className="text-zinc-500">{cardSet}</p>}
            <p className="mt-1 line-clamp-2 text-sm text-zinc-400">{deal.title}</p>

            <div className="mt-4 flex items-baseline gap-3">
              <span className="text-2xl font-bold text-black dark:text-zinc-50">
                ${Number(deal.total_price).toFixed(2)}
              </span>
              <span className="text-base text-zinc-400 line-through">
                ${Number(deal.market_price).toFixed(2)}
              </span>
            </div>
            {isAuction && (
              <p className="mt-1 text-xs font-medium text-amber-600 dark:text-amber-400">
                Current bid{deal.bid_count != null ? ` · ${deal.bid_count} bids` : ""} - may rise before the auction ends
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

        <div className="mt-6 rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
          <h2 className="text-sm font-semibold text-black dark:text-zinc-50">
            {deal.is_graded ? `${deal.grader} ${deal.grade} price history` : "Market price history"}
          </h2>
          <p className="text-xs text-zinc-400">
            {deal.is_graded ? "Real graded sold comps" : "Real market pricing"}, fetched fresh for this
            page.
          </p>
          <div className="mt-4">
            <PriceHistoryChart points={history} />
          </div>
        </div>

        {recentSales.length > 0 && (
          <div className="mt-6 rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
            <h2 className="text-sm font-semibold text-black dark:text-zinc-50">Recent eBay sales</h2>
            <p className="text-xs text-zinc-400">Real individual sold listings, not an estimate.</p>
            <ul className="mt-4 divide-y divide-zinc-100 dark:divide-zinc-900">
              {recentSales.slice(0, 8).map((sale) => (
                <li key={sale.listingId} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <a
                      href={sale.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="line-clamp-1 text-sm text-zinc-700 hover:underline dark:text-zinc-300"
                    >
                      {sale.title}
                    </a>
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
