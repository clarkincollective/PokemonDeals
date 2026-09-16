import SkipToContent from "@/components/SkipToContent";
import { offerShipping } from "@/lib/offerPresentation";
import { cache } from "react";
import { unstable_cache } from "next/cache";
import Image from "next/image";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { buildTcgplayerLink } from "@/lib/tcgplayer";
import { MARKETPLACES, wrapEbayAffiliateUrl } from "@/lib/ebayLinks";
import { currencyForDeal, refInListingCurrency, dealTotalUsd, hasPrice, auctionDisplayParts } from "@/lib/money";
import Price from "@/components/Price";
import AuctionPrice from "@/components/AuctionPrice";
import { getSealedPriceHistory } from "@/lib/pokemonPriceTracker";
import { withPptConsumer } from "@/lib/pptTelemetry";
import { shouldIndexDeal } from "@/lib/indexability";
import { isDisplayableSealedDeal, listingPresentation } from "@/lib/dealQuality";
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
export const revalidate = 600;
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
    return await withPptConsumer("page:sealed-deal", () => getSealedPriceHistory(tcgplayerId));
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
  if (!shouldIndexDeal(deal) || !isDisplayableSealedDeal(deal))
    return { title: "Deal not found", robots: { index: false, follow: true } };

  const productName = normalizePublicText(deal.sealed_watchlist?.name ?? deal.title);
  const productSet = deal.sealed_watchlist?.set;
  // 17C.7: no evidenced reference for this exact product -> no discount
  // claim in the title, description or link preview, and no indexing.
  const shipping = offerShipping(deal);
  if (!hasPrice(deal.total_price) || !hasPrice(deal.market_price) || listingPresentation(deal).savings !== "trusted" || shipping.savingClaim === "none") {
    const plainName = `${productName}${productSet ? ` (${productSet})` : ""}`;
    return {
      title: `${plainName} - eBay listing`,
      description: `${plainName} listed on eBay. Shown without a savings claim; check the current listing price and shipping on eBay.`,
      alternates: { canonical: `/sealed-deals/${id}` },
      robots: { index: false, follow: true },
    };
  }
  const discountPct = Math.round(deal.discount_pct * 100);
  // Length-aware, same approach as the card hub: keep the real product
  // (and set) name intact and drop the "- N% below market" suffix rather
  // than let the title run long once the site-name template is appended.
  const titleBase = `${productName}${productSet ? ` (${productSet})` : ""}`;
  const titleSuffix = ` - ${discountPct}% below market${shipping.savingQualifier}`;
  const title = titleBase.length + titleSuffix.length <= 58 ? `${titleBase}${titleSuffix}` : titleBase;
  // Real product/set context up front, not just bare price numbers - see
  // app/deals/[id]/page.js's identical reasoning. Both figures are USD
  // (dealTotalUsd + the USD market_price) so a non-USD listing isn't
  // rendered as "$685" beside a "$558" USD market price.
  const listingUsd = dealTotalUsd(deal);
  const marketUsd = Number(deal.market_price);
  const forClause = listingUsd ? ` for $${listingUsd.toFixed(2)}` : "";
  const description = `${productName}${productSet ? ` (${productSet})` : ""}${forClause} - ${discountPct}% below the $${marketUsd.toFixed(2)} market reference${shipping.savingQualifier} on eBay.`;

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
  if (!shouldIndexDeal(deal) || !isDisplayableSealedDeal(deal)) {
    // 17C.7: an active early listing awaiting eBay's own confirmation is
    // gated, not expired - say so, and claim no discount.
    const gatedPresentation = deal?.is_active ? listingPresentation(deal) : null;
    const preRelease = gatedPresentation?.early ? gatedPresentation : null;
    return (
      <div className="min-h-screen bg-paper">
        <SkipToContent />
        <SiteHeader />
        <main id="main-content" tabIndex={-1} className="mx-auto max-w-2xl scroll-mt-24 px-6 py-16 text-center">
          {preRelease ? (
            <>
              <h1 className="text-xl font-bold text-black dark:text-zinc-50">{preRelease.notes[0]}</h1>
              <p className="mt-2 text-sm text-zinc-500">
                This listing predates its set&apos;s release and eBay hasn&apos;t confirmed it is active. We show
                such a listing once eBay confirms it - that confirms the listing, not that the seller holds the
                product or when it would arrive. No discount or delivery date is claimed here.
              </p>
            </>
          ) : (
            <><h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">This listing is unavailable here</h1><p className="mt-2 text-zinc-600 dark:text-zinc-400">It does not currently pass our listing checks. This does not confirm whether it has sold or ended on eBay.</p></>
          )}
          <Link href="/sealed-deals" className="mt-4 inline-block text-sm font-medium underline">
            Back to sealed product deals
          </Link>
        </main>
      </div>
    );
  }

  const watchlist = deal.sealed_watchlist;
  const productName = normalizePublicText(watchlist?.name ?? deal.title);
  const productSet = watchlist?.set;
  const discountPct = Math.round(deal.discount_pct * 100);
  // 17C.7: savings claims need an evidenced reference for this exact product.
  const presentation = listingPresentation(deal);
  const shipping = offerShipping(deal);
  const showSavings = hasPrice(deal.total_price) && hasPrice(deal.market_price) && presentation.savings === "trusted" && shipping.savingClaim !== "none";
  // Native currency on the server (keeps this page cacheable); <Price>
  // localises after hydration. market_price / "saved" are USD.
  const nativeCurrency = currencyForDeal(deal);
  const total = Number(deal.total_price);
  const usdTotal = dealTotalUsd(deal);
  const marketUsd = Number(deal.market_price);
  const savedUsd = usdTotal != null ? marketUsd - usdTotal : null;
  // USD reference / savings in the listing's own currency so a comparison
  // block never mixes AUD/USD before <Price> localises both together
  // after hydration (lib/money.refInListingCurrency).
  const marketNative = refInListingCurrency(marketUsd, total, usdTotal, nativeCurrency);
  const savedNative = marketNative != null ? marketNative - total : null;
  const showRef = Number.isFinite(marketUsd) && savedUsd > 0 && marketNative != null;
  const isAuction = deal.listing_type === "AUCTION";
  const auctionParts = isAuction ? auctionDisplayParts(deal) : null;
  const marketInfo = MARKETPLACES[deal.marketplace];
  const tcgplayerLink = buildTcgplayerLink(productName, watchlist?.tcgplayer_id);

  let history = [];
  if (watchlist?.tcgplayer_id) {
    history = await loadSealedHistory(watchlist.tcgplayer_id);
  }

  // brand is real data; deliberately no hasMerchantReturnPolicy, since the
  // real return policy is set by whichever eBay seller has the listing and
  // varies per one. SEO-2.6.1: likewise no shippingDetails - see
  // app/deals/[id]/page.js for the identical reasoning (we hold only the
  // charge, never a delivery time, and must not invent one). The recorded
  // charge stays on the visible page via `shipping`.
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
      priceCurrency: nativeCurrency,
      price: Number(auctionParts ? auctionParts.bid.native : deal.total_price).toFixed(2),
      availability: deal.is_active ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
      itemCondition: "https://schema.org/NewCondition",
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
      {/* 17C.7: a plain listing makes no price/availability claim in
          structured data either - only the breadcrumb below. */}
      {showSavings && (!isAuction || auctionParts) && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(productJsonLd) }} />}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }} />
      <SkipToContent />
      <SiteHeader />
      <main id="main-content" tabIndex={-1} className="mx-auto max-w-5xl scroll-mt-24 px-5 py-6 sm:px-6 sm:py-8">
        <Breadcrumbs
          items={[
            { name: "Deals", href: "/" },
            { name: "Sealed product", href: "/sealed-deals" },
            { name: productName },
          ]}
        />

        <div className="mt-4 flex flex-col gap-6 rounded-xl border border-zinc-200 bg-white p-4 shadow-card sm:flex-row sm:p-6 dark:border-zinc-800 dark:bg-zinc-950">
          <div className="relative h-40 w-40 shrink-0 sm:h-56 sm:w-56 self-center overflow-hidden rounded-lg bg-zinc-50 sm:self-auto dark:bg-zinc-900">
            {deal.image_url ? (
              <Image src={deal.image_url} alt={normalizePublicText(deal.title)} fill sizes="224px" className="object-contain p-3" />
            ) : (
              <CardImagePlaceholder className="h-24 w-16" />
            )}
          </div>

          <div className="flex-1">
            <div className="flex flex-wrap items-center gap-2">
              {showSavings && (
                <span className="rounded-md bg-emerald-700 px-2.5 py-0.5 text-xs font-semibold text-white">
                  {discountPct}% below market{shipping.savingQualifier}
                </span>
              )}
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
            </h1>
            {productSet && <p className="text-zinc-500">{productSet}</p>}
            <p className="mt-1 line-clamp-2 text-sm text-zinc-600 dark:text-zinc-400">{normalizePublicText(deal.title)}</p>

            <div className="mt-4">
              {!hasPrice(deal.total_price) ? <p className="text-lg font-semibold text-zinc-700 dark:text-zinc-200">Price unavailable</p> : isAuction ? (
                // P0 auction-price-integrity: headline = CURRENT BID, with
                // shipping + estimated landed total on their own lines.
                <AuctionPrice
                  deal={deal}
                  marketUsd={showSavings ? marketUsd : null}
                  marketNative={showSavings ? marketNative : null}
                  discountPct={showSavings ? discountPct : 0}
                  variant="detail"
                />
              ) : (
                <>
                  <p className="mb-1 text-sm text-zinc-600 dark:text-zinc-400">{shipping.headline}</p>
                  <div className="flex items-baseline gap-3">
                    <Price
                      usd={usdTotal}
                      native={{ amount: total, currency: nativeCurrency }}
                      className="text-2xl font-bold text-black dark:text-zinc-50"
                    />
                    {showSavings && showRef && (
                      <span className="text-lg text-zinc-400 line-through">
                        <Price
                          usd={marketUsd}
                          native={{ amount: marketNative, currency: nativeCurrency }}
                          approxPrefix=""
                        />
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{shipping.note ?? "Includes recorded shipping"}</p>
                  {!showSavings ? null : showRef ? (
                    <p className="mt-1 text-sm font-medium text-emerald-600 dark:text-emerald-500">
                      You save{" "}
                      <Price usd={savedUsd} native={{ amount: savedNative, currency: nativeCurrency }} />{shipping.savingQualifier} ·{" "}
                      {discountPct}% below market
                    </p>
                  ) : (
                    <p className="mt-1 text-sm font-medium text-emerald-600 dark:text-emerald-500">
                      {discountPct}% below market{shipping.savingQualifier}
                    </p>
                  )}
                </>
              )}
              {!showSavings &&
                presentation.notes.map((note) => (
                  <p key={note} className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                    {note}
                  </p>
                ))}
            </div>
            {isAuction && deal.auction_end_at && (
              <p className="mt-1 text-xs font-medium text-amber-600 dark:text-amber-400">
                Auction ends {timeUntil(deal.auction_end_at)}
              </p>
            )}
            {deal.seller_feedback_pct != null && (
              <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
                {Number(deal.seller_feedback_pct).toFixed(1)}% seller feedback
              </p>
            )}
            <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">Found {timeAgo(deal.first_seen_at)}</p>

            <div className="mt-5 flex flex-wrap gap-3">
              <AffiliateLink
                href={wrapEbayAffiliateUrl(deal.affiliate_url, { surface: "deal_page" })}
                eventName="eBay Click"
                eventData={{
                  product: productName,
                  marketplace: deal.marketplace,
                  discountPct: showSavings ? discountPct : null,
                  listingType: deal.listing_type,
                  page: "sealed_detail",
                }}
                className="inline-flex min-h-11 items-center justify-center rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-zinc-800 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
              >
                {isAuction ? "View auction on eBay →" : "View listing on eBay →"}
              </AffiliateLink>
              <AffiliateLink
                href={tcgplayerLink}
                eventName="TCGPlayer Click"
                eventData={{ product: productName, page: "sealed_detail" }}
                className="inline-flex min-h-11 items-center rounded-lg border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-600 hover:border-zinc-300 dark:border-zinc-800 dark:text-zinc-300"
              >
                Check on TCGPlayer
              </AffiliateLink>
              <ShareButton
                url={`${SITE_URL}/sealed-deals/${deal.id}`}
                title={showSavings ? `${productName} - ${discountPct}% below market${shipping.savingQualifier}` : productName}
                text={
                  showSavings
                    ? `${productName}${productSet ? ` (${productSet})` : ""}${dealTotalUsd(deal) ? ` - $${dealTotalUsd(deal).toFixed(2)},` : " -"} ${discountPct}% below market${shipping.savingQualifier} on Pokemon Deal Finder`
                    : `${productName}${productSet ? ` (${productSet})` : ""} on Pokemon Deal Finder`
                }
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
          ) : hasPrice(marketUsd) && presentation.savings === "trusted" ? (
            <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-300">
              Not enough dated sales to plot a trend yet. The stored market reference is{" "}
              <span className="font-semibold text-black dark:text-zinc-50">
                <Price
                  usd={marketUsd}
                  native={{ amount: marketNative ?? marketUsd, currency: marketNative != null ? nativeCurrency : "USD" }}
                  approxPrefix=""
                />
              </span>
              {showSavings && (
                <>
                  {" "}
                  — this listing is{" "}
                  <span className="font-semibold text-emerald-600 dark:text-emerald-500">
                    {discountPct}% below
                  </span>{" "}
                  it{shipping.savingQualifier}
                </>
              )}
              .
            </p>
          ) : <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">No verified market reference is available for this exact product.</p>}
        </div>
      </main>

      <SiteFooter note="Listing-to-product matching is automated and not perfect - always double-check a listing's photos and description (and that it's genuinely factory sealed) before buying." />
    </div>
  );
}
