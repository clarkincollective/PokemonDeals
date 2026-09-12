import Link from "next/link";
import { MARKETPLACES, wrapEbayAffiliateUrl } from "@/lib/ebayLinks";
import { surfaceForPageName } from "@/lib/affiliateSurfaces";
import { slugifySet } from "@/lib/slugify";
import { currencyForDeal, refInListingCurrency } from "@/lib/money";
import RelativeTime, { WithinWindow } from "@/components/RelativeTime";
import { conditionLabel, listingPresentation } from "@/lib/dealQuality";
import { normalizePublicText } from "@/lib/publicText";
import { cardDisplayName } from "@/lib/cardName";
import { priceBandUsd, discountBand, listingTypeProp, rawVsGraded } from "@/lib/analytics/props";
import AffiliateLink from "@/components/AffiliateLink";
import DealImage from "@/components/DealImage";
import { dealImageProps } from "@/lib/listingImage";
import SaveCardButton from "@/components/SaveCardButton";
import Price from "@/components/Price";
import AuctionPrice from "@/components/AuctionPrice";
import { offerShipping } from "@/lib/offerPresentation";

const JUST_FOUND_MS = 2 * 60 * 60 * 1000;

// The discount badge is tiered by how good the deal actually is (real
// discount_pct) so a 65%-under card doesn't look identical to a 12%-under
// one. Only rendered when the savings claim is TRUSTED (lib/dealQuality
// listingPresentation) - never on a plain listing.
function discountBadgeClass(pct) {
  if (pct >= 40) return "bg-emerald-700 text-white";
  if (pct >= 20) return "border border-emerald-600/40 bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300";
  return "border border-zinc-200 bg-white/95 text-zinc-600 dark:border-zinc-700 dark:bg-zinc-950/90 dark:text-zinc-300";
}

// Deal-first R1/R2 - one offer in a grid, laid out as the deal-card
// contract (docs: PokemonDealFinder-Deal-First-Overhaul §5):
//
//   IDENTITY    artwork, full name, set (linked when the set page exists),
//               language, raw condition or grader + grade
//   OFFER       ONE dominant price with a clear meaning. When the scan
//               recorded a shipping charge: "Listing total" (item +
//               shipping) and the charge. When it recorded 0 - which is
//               BOTH shipping at no charge and "no shipping option stated" - the
//               headline is the "Listing price" and the card says
//               "Shipping not confirmed"; it never says free and never
//               presents the figure as landed. Auctions headline the
//               CURRENT BID with shipping + estimated total (<AuctionPrice>).
//   COMPARISON  the matching market reference with its condition context
//               and the derived saving - ONLY when the existing rules say
//               the reference is comparable (savings === "trusted"). With
//               shipping unconfirmed the saving is stated "before
//               shipping" so it never reads as a verified delivered
//               saving; otherwise the listing renders PLAIN with the reason.
//   STATUS      real facts: found when, N active listings, auction end
//   ACTIONS     primary "View deal on eBay" / "View auction on eBay" (the
//               existing AffiliateLink wrapper + surface attribution);
//               the artwork and name open the site's own detail page; the
//               save control is the existing device-local toggle
//
// LAYOUT: one DOM, two shapes. Below `sm` the card is a compact unit -
// artwork (4:5, object-contain, never cropped) on the left, identity /
// offer / comparison on the right, the 44px eBay button spanning the
// width beneath. From `sm` up it stacks: a 6:5 artwork box (fold revision:
// proportionally smaller art so a complete offer fits a 1280x900 first
// screen - text sizes untouched), body, button.
//
// `rank` shows a number badge only on ranked lists (Top 10, "Best deals").
// `hub` is `{ count, slug }` from fetchHubCounts when this card has 2+
// active listings, optional. `priority` marks an above-the-fold image.
export default function DealCard({ deal, rank, hub, pageName = "home", validSetSlugs, from, fromCountry, analytics, priority = false }) {
  const cardName = cardDisplayName({ name: normalizePublicText(deal.watchlist?.name ?? deal.title) });
  // EPN sub-ID attribution: a fixed, privacy-safe surface enum derived
  // from the existing pageName taxonomy (never the card/deal identity) -
  // see lib/affiliateSurfaces.js.
  const affiliateHref = wrapEbayAffiliateUrl(deal.affiliate_url, { surface: surfaceForPageName(pageName) });

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

  // Never default to "Near Mint". Unknown / grading-status -> "Condition
  // not verified" (see lib/dealQuality). Grading status stays separate
  // from physical condition.
  const conditionText = conditionLabel(deal);

  // The shipping recorded at scan (listing currency), read through the
  // shared contract (lib/offerPresentation): > 0 confirmed, 0 = free OR
  // unstated -> "not confirmed", field absent -> "unknown". The headline
  // label, the note and the saving qualifier all come from that one rule.
  const ship = offerShipping(deal);
  const shippingConfirmed = ship.state === "confirmed";
  const shippingNative = shippingConfirmed ? ship.amount : null;
  const shippingUsd = shippingConfirmed && usdTotal > 0 && total > 0 ? shippingNative * (usdTotal / total) : null;

  // 17C.7: a listing whose discount has no evidenced reference for this
  // exact product and condition renders PLAIN - price, shipping and the
  // release/seller-claim notes, with no badge, strikethrough, saving or
  // "% below market" anywhere.
  const presentation = listingPresentation(deal);
  const showSavings = presentation.savings === "trusted";
  // Review round 2: a trusted reference is necessary but not sufficient -
  // when the row carries NO shipping breakdown (ship.state "unknown") the
  // stored total may or may not include a charge, so no saving (badge,
  // "Save …", "% below market") is stated at all; the reference is still
  // shown, with the reason.
  const savingsSupported = showSavings && ship.savingClaim !== "none";

  // Phase 13A - structural, non-PII payload for the discovery-lane
  // impression + click events. Only emitted when a lane opts in by
  // passing `analytics={{ section }}` (the big "All deals" grid does not,
  // by design - we don't instrument every catalogue card).
  const analyticsPayload = analytics?.section
    ? {
        section: analytics.section,
        deal_id: deal.id,
        content_id: String(deal.id),
        rank: analytics.rank ?? rank ?? undefined,
        listing_type: listingTypeProp(deal.listing_type),
        raw_vs_graded: rawVsGraded(deal.is_graded),
        price_band_usd: priceBandUsd(usdTotal),
        discount_band: savingsSupported ? discountBand(discountPct) : "no_savings_claim",
        country: deal.marketplace ? String(deal.marketplace).replace("EBAY_", "") : "unknown",
      }
    : null;
  const analyticsAttrs = analyticsPayload
    ? {
        "data-analytics-deal": JSON.stringify(analyticsPayload),
        "data-analytics-deal-impression": JSON.stringify(analyticsPayload),
      }
    : {};

  return (
    <article
      {...analyticsAttrs}
      data-offer-state={isAuction ? "auction" : showSavings ? "bin_compared" : "bin_plain"}
      data-shipping={ship.state}
      className="group grid h-full grid-cols-[7.25rem_1fr] grid-rows-[auto_auto] overflow-hidden rounded-xl border border-zinc-200 bg-white transition-shadow duration-200 hover:shadow-card-hover focus-within:shadow-card-hover sm:flex sm:flex-col dark:border-zinc-800 dark:bg-zinc-950"
    >
      {/* ARTWORK - the seller's photo (or, labelled, the catalogue art);
          opens the site's own detail page. Badges carry only real facts.
          4:5 box on phones, 6:5 from `sm`; object-contain, so the
          artwork keeps its own proportions and is never cropped. */}
      <div className="relative row-span-1 sm:row-auto">
        <div className="absolute bottom-1.5 right-1.5 z-10 sm:bottom-2 sm:right-2">
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
          aria-label={`${cardName} - details`}
          className="relative block aspect-[4/5] w-full bg-zinc-50 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-red-600 sm:aspect-[6/5] dark:bg-zinc-900"
        >
          <DealImage
            {...dealImageProps(deal)}
            alt={normalizePublicText(deal.title)}
            sizes="(max-width: 640px) 116px, (max-width: 1024px) 46vw, 24vw"
            quality={85}
            priority={priority}
            className="object-contain p-2 sm:p-3"
          />

          <div className="absolute left-1.5 top-1.5 flex flex-col items-start gap-1 sm:left-2 sm:top-2">
            {rank != null && (
              <span className="flex h-6 min-w-6 items-center justify-center rounded-md bg-zinc-900/85 px-1.5 text-xs font-bold text-white">
                {rank}
              </span>
            )}
            {marketInfo && (
              <span className="rounded-md bg-white/90 px-1.5 py-0.5 text-xs shadow-sm dark:bg-zinc-950/90" title={marketInfo.label}>
                {marketInfo.flag}
              </span>
            )}
            {/* Hydration-safe window: computed on the server's clock for the
                HTML + first paint, the viewer's clock after hydration. */}
            {!isAuction && (
              <WithinWindow date={deal.first_seen_at} withinMs={JUST_FOUND_MS}>
                <span className="rounded-md bg-live/95 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-zinc-900 shadow-sm">
                  Just found
                </span>
              </WithinWindow>
            )}
          </div>

          {savingsSupported && (
            <span className={`absolute right-1.5 top-1.5 rounded-md px-1.5 py-0.5 text-xs font-extrabold leading-none shadow-sm sm:right-2 sm:top-2 sm:px-2 sm:py-1 sm:text-sm ${discountBadgeClass(discountPct)}`}>
              −{discountPct}%
            </span>
          )}
        </a>
      </div>

      {/* IDENTITY · OFFER · COMPARISON · STATUS */}
      <div className="flex min-w-0 flex-col p-3 sm:flex-1 sm:p-3.5">
        <a
          href={dealHref}
          rel={dealRel}
          className="line-clamp-2 text-base font-semibold leading-snug text-zinc-900 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600 dark:text-zinc-50"
        >
          {cardName}
        </a>
        {/* Set · condition. The condition (or grader + grade) is REQUIRED
            reading, never fine print: it sits in its own non-shrinking span
            so a long set name truncates instead of hiding it, and at the
            narrowest widths the line wraps rather than clipping. */}
        <p className="mt-0.5 flex flex-wrap items-baseline gap-x-1 text-xs text-zinc-500 dark:text-zinc-400">
          {cardSet && (
            <span className="min-w-0 max-w-full truncate">
              {isJapanese && "🇯🇵 Japanese · "}
              {setHasPage ? (
                <Link href={`/sets/${setSlug}`} className="hover:text-red-600 hover:underline dark:hover:text-red-500">
                  {cardSet}
                </Link>
              ) : (
                cardSet
              )}
            </span>
          )}
          <span
            data-condition
            className={`shrink-0 whitespace-nowrap ${conditionText === "Condition not verified" ? "text-amber-700 dark:text-amber-500" : "font-medium text-zinc-700 dark:text-zinc-300"}`}
          >
            {cardSet && "· "}
            {conditionText}
          </span>
        </p>

        {isAuction ? (
          // P0 auction-price-integrity: the headline figure for an auction
          // is the CURRENT BID, with shipping and the estimated landed
          // total as their own lines - never the bid+shipping total shown
          // as though it were the bid.
          <AuctionPrice
            deal={deal}
            marketUsd={showSavings ? marketUsd : null}
            marketNative={showSavings ? marketNative : null}
            discountPct={showSavings ? discountPct : 0}
            variant="card"
            className="mt-2"
          />
        ) : (
          <div className="mt-2">
            <p className="text-[11px] font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              {ship.headline}
            </p>
            <Price
              usd={usdTotal}
              native={{ amount: total, currency: nativeCurrency }}
              className="tnum block text-2xl font-bold leading-tight text-zinc-900 dark:text-zinc-50"
            />
            <p className={`tnum mt-0.5 text-xs ${shippingConfirmed ? "text-zinc-500 dark:text-zinc-400" : "text-amber-700 dark:text-amber-500"}`}>
              {shippingConfirmed ? (
                <>
                  incl. <Price usd={shippingUsd} native={{ amount: shippingNative, currency: nativeCurrency }} approxPrefix="" /> shipping
                </>
              ) : (
                ship.note
              )}
            </p>
          </div>
        )}

        {/* COMPARISON - only a trusted reference earns the green line; a
            plain listing states why it carries no claim. */}
        {!showSavings ? (
          <div className="mt-1.5 flex flex-col gap-1">
            {presentation.notes.map((note) => (
              <p key={note} className="text-[11px] leading-snug text-zinc-500 dark:text-zinc-400">
                {note}
              </p>
            ))}
          </div>
        ) : isAuction ? null : (
          <div className="mt-1.5">
            {showRef ? (
              <p className="tnum text-xs text-zinc-500 dark:text-zinc-400">
                Market reference{" "}
                <Price usd={marketUsd} native={{ amount: marketNative, currency: nativeCurrency }} approxPrefix="" className="font-medium text-zinc-700 dark:text-zinc-300" />
                {" · "}
                {conditionText}
              </p>
            ) : null}
            {!savingsSupported ? (
              // unknown breakdown: the reference stands, the saving does not
              <p className="text-[11px] leading-snug text-amber-700 dark:text-amber-500">
                No saving stated: shipping breakdown not recorded
              </p>
            ) : (
            <p className="tnum text-xs font-semibold text-emerald-700 dark:text-emerald-500">
              {showRef ? (
                <>
                  Save <Price usd={savedUsd} native={{ amount: savedNative, currency: nativeCurrency }} />
                  {ship.savingQualifier} · {discountPct}% below market
                </>
              ) : (
                <>
                  {discountPct}% below market{ship.savingQualifier ? ` (${ship.savingQualifier.trim()})` : ""}
                </>
              )}
            </p>
            )}
          </div>
        )}

        <div className="mt-1.5 flex items-center justify-between gap-2 text-[11px] text-zinc-500 dark:text-zinc-400">
          <p className="min-w-0 truncate">
            {isAuction ? (
              <>
                Auction · ends {deal.auction_end_at ? <RelativeTime date={deal.auction_end_at} mode="until" /> : "soon"}
                {deal.bid_count != null && ` · ${deal.bid_count} bids`}
              </>
            ) : (
              <>
                {hub?.count >= 2 && (
                  <>
                    <Link href={`/cards/${hub.slug}`} className="font-semibold text-zinc-600 hover:text-red-600 hover:underline dark:text-zinc-300 dark:hover:text-red-500">
                      {hub.count} {hub.count === 1 ? "listing" : "listings"}
                    </Link>
                    {" · "}
                  </>
                )}
                found <RelativeTime date={deal.first_seen_at} />
              </>
            )}
          </p>
          <a href={dealHref} rel={dealRel} className="shrink-0 font-medium text-zinc-600 underline-offset-2 hover:text-red-600 hover:underline dark:text-zinc-300 dark:hover:text-red-500">
            Details
          </a>
        </div>
      </div>

      {/* PRIMARY ACTION - the existing wrapper, tracking and surface
          attribution; opens the exact listing on eBay in a new tab. Spans
          the whole card below `sm`; sits at the foot of the column above. */}
      <div className="col-span-2 px-3 pb-3 sm:col-auto sm:mt-auto sm:px-3.5 sm:pb-3.5">
        <AffiliateLink
          href={affiliateHref}
          eventName="eBay Click"
          eventData={{
            card: cardName,
            marketplace: deal.marketplace,
            discountPct,
            listingType: deal.listing_type,
            isGraded: deal.is_graded,
            usdTotal,
            page: pageName,
          }}
          analyticsProps={
            analyticsPayload
              ? { ...analyticsPayload, origin_section: analyticsPayload.section }
              : {
                  origin_section: pageName,
                  deal_id: deal.id,
                  content_id: String(deal.id),
                  discount_band: savingsSupported ? discountBand(discountPct) : "no_savings_claim",
                }
          }
          className="flex min-h-11 w-full items-center justify-center rounded-lg bg-red-600 px-4 text-center text-sm font-semibold text-white transition-colors hover:bg-red-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600"
        >
          {isAuction ? "View auction on eBay" : "View deal on eBay"}
        </AffiliateLink>
      </div>
    </article>
  );
}
