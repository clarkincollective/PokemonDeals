import Link from "next/link";
import { MARKETPLACES } from "@/lib/ebay";
import { slugifySet } from "@/lib/slugify";
import { currencyForDeal, refInListingCurrency } from "@/lib/money";
import { timeAgo, timeUntil, isWithin } from "@/lib/time";
import { conditionLabel } from "@/lib/dealQuality";
import { normalizePublicText } from "@/lib/publicText";
import { cardDisplayName } from "@/lib/cardName";
import AffiliateLink from "@/components/AffiliateLink";
import DealImage from "@/components/DealImage";
import SaveCardButton from "@/components/SaveCardButton";
import Price from "@/components/Price";

const JUST_FOUND_MS = 2 * 60 * 60 * 1000;

// The discount badge is tiered by how good the deal actually is (real
// discount_pct) so a 65%-under card doesn't look identical to a 12%-under
// one - the whole point of the site is "we found you a deal", so deal
// quality has to be visible at a glance.
function discountBadgeClass(pct) {
  if (pct >= 40) return "bg-emerald-600 text-white";
  if (pct >= 20) return "border border-emerald-600/40 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300";
  return "border border-zinc-200 bg-white/90 text-zinc-500 dark:border-zinc-700 dark:bg-zinc-950/90 dark:text-zinc-400";
}

// One deal in a grid. Answers four questions fast, with ONE action:
//   what is it        -> image + name + set + condition
//   is it a good deal -> tiered discount badge + price / typical / saved
//   can I trust it    -> "N listings" (real active-listing hub count - NOT
//                        distinct sellers, which eBay's data doesn't give us) + recency
//   what if I click   -> a single full-width "Check deal on eBay ->" CTA
//
// `rank` shows a number badge only on ranked lists (Top 10, "Best deals").
// `hub` is `{ count, slug }` from fetchHubCounts when this card has 2+
// active listings, optional.
export default function DealCard({ deal, rank, hub, pageName = "home", validSetSlugs, from, fromCountry }) {
  const cardName = cardDisplayName({ name: normalizePublicText(deal.watchlist?.name ?? deal.title) });

  // A "return to browsing" hint for /deals/[id]: the internal page this
  // card was clicked from (+ its country filter). Read + WHITELISTED on
  // the deal page (components/DealBackLink); a bad/absent value just
  // yields the deterministic species/set fallback there. /deals/[id]
  // canonical stays the bare URL, so this never creates a duplicate.
  const dealHref = (() => {
    if (typeof from !== "string" || !from.startsWith("/")) return `/deals/${deal.id}`;
    const qs = new URLSearchParams({ from });
    if (fromCountry) qs.set("country", fromCountry);
    return `/deals/${deal.id}?${qs.toString()}`;
  })();
  // SEO Phase 5: the `?from=` variant is a return-nav convenience only -
  // the deal page ignores it server-side and canonicalises to the bare
  // URL. nofollow it so crawlers don't spend budget fetching one
  // `?from=` permutation per internal page that links the deal; the bare
  // /deals/[id] is discovered from the sitemap and from /cards/[slug].
  // Same rule the header / filter bars already apply to internal
  // query-param links.
  const dealRel = dealHref.includes("?") ? "nofollow" : undefined;
  const cardSet = deal.watchlist?.set;
  const discountPct = Math.round(deal.discount_pct * 100);
  // Rendered in the listing's own currency on the server; <Price> swaps
  // each figure to the viewer's currency after hydration (see
  // components/Price.js / CurrencyProvider). market_price / the derived
  // "saved" are USD references.
  const nativeCurrency = currencyForDeal(deal);
  const total = Number(deal.total_price);
  const usdTotal = Number(deal.total_price_usd ?? deal.total_price);
  const marketUsd = Number(deal.market_price);
  const savedUsd = marketUsd - usdTotal;
  // The USD market reference / savings expressed in the LISTING's own
  // currency, so the server render + first paint show one currency (the
  // listing's) for both figures instead of "A$186 · market ref $237".
  // <Price> still localises both to the viewer's currency together after
  // hydration, from their USD values. The % is rate-invariant.
  const marketNative = refInListingCurrency(marketUsd, total, usdTotal, nativeCurrency);
  const savedNative = marketNative != null ? marketNative - total : null;
  const showRef = Number.isFinite(marketUsd) && savedUsd > 0 && marketNative != null;
  const isAuction = deal.listing_type === "AUCTION";
  const isJapanese = deal.watchlist?.language === "japanese";
  const marketInfo = MARKETPLACES[deal.marketplace];
  const setSlug = cardSet && !isJapanese ? slugifySet(cardSet) : null;
  // Only link to /sets/<slug> when that page actually exists right now
  // (same SET_MIN_LISTINGS list as fetchSets/resolveSetSlug, passed in via
  // validSetSlugs). A set that fell below the threshold has no page and a
  // link to it 404s. No list passed -> render the set as plain text.
  const setHasPage = setSlug != null && Array.isArray(validSetSlugs) && validSetSlugs.includes(setSlug);
  const justFound = !isAuction && isWithin(deal.first_seen_at, JUST_FOUND_MS);

  // Never default to "Near Mint". Unknown / grading-status -> "Condition
  // not verified" (see lib/dealQuality). Grading status stays separate
  // from physical condition.
  const conditionText = conditionLabel(deal);

  return (
    <div className="group flex h-full flex-col overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-card transition-all duration-200 hover:-translate-y-0.5 hover:shadow-card-hover dark:border-zinc-800 dark:bg-zinc-950">
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
              currency: currencyForDeal(deal),
            }}
          />
        </div>
        <a
          href={dealHref}
          rel={dealRel}
          className="relative block aspect-square w-full bg-gradient-to-b from-zinc-50 to-zinc-100 dark:from-zinc-900 dark:to-zinc-950"
        >
          <DealImage
            src={deal.image_url}
            cardTcgplayerId={deal.card_tcgplayer_id}
            alt={normalizePublicText(deal.title)}
            sizes="(max-width: 640px) 90vw, (max-width: 1024px) 46vw, 24vw"
            quality={85}
          />

          {rank != null && (
            <span className="absolute left-2 top-2 flex h-6 w-6 items-center justify-center rounded-md bg-zinc-900/85 text-xs font-bold text-white">
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
          {justFound && (
            <span
              className={`absolute left-2 ${rank != null ? "top-[4.5rem]" : "top-10"} rounded-md bg-live/95 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-zinc-900 shadow-sm`}
            >
              Just found
            </span>
          )}

          <span
            className={`absolute right-2 top-2 rounded-md px-2 py-1 text-sm font-extrabold leading-none shadow-sm ${discountBadgeClass(discountPct)}`}
          >
            −{discountPct}%
          </span>
        </a>
      </div>

      <div className="flex flex-1 flex-col gap-1 p-4">
        <a
          href={dealHref}
          rel={dealRel}
          className="truncate text-[15px] font-semibold leading-snug text-zinc-900 hover:underline dark:text-zinc-50"
        >
          {cardName}
        </a>

        <p className="truncate text-xs text-zinc-500 dark:text-zinc-400">
          {isJapanese && "🇯🇵 "}
          {setHasPage ? (
            <Link href={`/sets/${setSlug}`} className="hover:text-red-600 hover:underline dark:hover:text-red-500">
              {cardSet}
            </Link>
          ) : (
            cardSet
          )}
          {cardSet && " · "}
          {conditionText}
        </p>

        <div className="mt-1.5 flex items-baseline gap-2">
          <Price
            usd={usdTotal}
            native={{ amount: total, currency: nativeCurrency }}
            className="tnum text-lg font-bold text-zinc-900 dark:text-zinc-50"
          />
          {showRef && (
            // Fixed price: the market reference is a "typical" figure the
            // asking price sits below (struck through). Auction: it's a
            // plain reference to read the CURRENT BID against - never a
            // "was" price, since the final price can still rise.
            <span
              className={`tnum text-xs text-zinc-400 ${isAuction ? "" : "line-through"}`}
            >
              {isAuction ? "market ref " : "typical "}
              <Price
                usd={marketUsd}
                native={{ amount: marketNative, currency: nativeCurrency }}
                approxPrefix=""
              />
            </span>
          )}
        </div>
        {isAuction ? (
          <p className="tnum text-xs font-semibold text-amber-600 dark:text-amber-500">
            Current bid · {discountPct}% under market ref · can rise
          </p>
        ) : showRef ? (
          <p className="tnum text-xs font-semibold text-emerald-700 dark:text-emerald-500">
            Save{" "}
            <Price usd={savedUsd} native={{ amount: savedNative, currency: nativeCurrency }} /> ·{" "}
            {discountPct}% below market
          </p>
        ) : (
          <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-500">
            {discountPct}% below market
          </p>
        )}

        <p className="mt-0.5 text-[11px] text-zinc-400">
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
                    {hub.count} {hub.count === 1 ? "listing" : "listings"}
                  </Link>
                  {" · "}
                </>
              )}
              found {timeAgo(deal.first_seen_at)}
            </>
          )}
        </p>

        <div className="mt-auto pt-2.5">
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
            className="block rounded-lg bg-zinc-900 px-4 py-2 text-center text-sm font-semibold text-white transition-colors hover:bg-red-600 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-red-600 dark:hover:text-white"
          >
            {isAuction ? "Bid on eBay →" : "Check deal on eBay →"}
          </AffiliateLink>
        </div>
      </div>
    </div>
  );
}
