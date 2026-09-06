import { cache } from "react";
import { unstable_cache } from "next/cache";
import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { findCardHubByWatchlistId, resolveSpeciesByName, fetchSetSlugs, cardColsReady, withCard } from "@/lib/deals";
import { shouldIndexDeal } from "@/lib/indexability";
import { conditionLabel, isDisplayableDeal } from "@/lib/dealQuality";
import { normalizePublicText } from "@/lib/publicText";
import { cardDisplayName } from "@/lib/cardName";
import { extractSpecies } from "@/lib/pokemonSpecies";
import { slugifySet } from "@/lib/slugify";
import { buildTcgplayerLink } from "@/lib/tcgplayer";
import { MARKETPLACES, buildEbaySearchLink, wrapEbayAffiliateUrl } from "@/lib/ebay";
import { currencyForDeal, refInListingCurrency, dealTotalUsd, auctionDisplayParts } from "@/lib/money";
import Price from "@/components/Price";
import AuctionPrice from "@/components/AuctionPrice";
import { getFullPriceAnalysis } from "@/lib/pokemonPriceTracker";
import PriceHistoryChart from "@/components/PriceHistoryChart";
import VariantPriceGrid from "@/components/VariantPriceGrid";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import Breadcrumbs from "@/components/Breadcrumbs";
import StickyDealCta from "@/components/StickyDealCta";
import RecordCardView from "@/components/RecordCardView";
import DetailViewAnalytics from "@/components/analytics/DetailViewAnalytics";
import ListingChecks from "@/components/ListingChecks";
import RecentSales from "@/components/RecentSales";
import SaveCardButton from "@/components/SaveCardButton";
import PriceAlertForm from "@/components/PriceAlertForm";
import { emailEnabled } from "@/lib/email";
import DealImage from "@/components/DealImage";
import { dealImageProps, trustedDealImageUrl } from "@/lib/listingImage";
import DealBackLink from "@/components/DealBackLink";
import AffiliateLink from "@/components/AffiliateLink";
import ShareButton from "@/components/ShareButton";
import { DEAL_CATEGORIES, DEAL_CATEGORY_SLUGS } from "@/lib/dealCategories";
import DealCategoryPage, { dealCategoryMetadata } from "@/components/DealCategoryPage";

const SITE_URL = "https://pokemondealfinder.com";

// Real, live perf/cost problem found via SEO audit: this page ran fully
// dynamic on every view (confirmed live: Cache-Control was no-store,
// getFullPriceAnalysis - a real, billed PokemonPriceTracker API call -
// fired fresh every single time) despite this being the highest-volume
// page type on the site by far. `export const revalidate` alone doesn't
// fix this: Next 15+ defaults every fetch() to uncached, and the
// Supabase client's internal fetch calls have no cache option set, so
// any route touching them is forced fully dynamic regardless of a
// route-level revalidate export - the same reason the grid pages
// (lib/deals.js) needed unstable_cache instead. Wrapping the actual data
// fetches directly, like this, is what actually works - verified live
// (see the deal fetch's 60s window below and price analysis's 300s one).
//
// Since the currency/region work moved fully client-side, this route
// reads no request-time APIs (no headers/cookies/searchParams), so an
// empty generateStaticParams + a revalidate window is enough to flip it
// from fully-dynamic (Cache-Control: no-store, X-Vercel-Cache: MISS on
// every hit) to ISR: rendered on demand, then served from the edge cache
// and revalidated in the background. 5,000 deal pages churn too fast to
// prerender at build, so the list is empty and every page is on-demand.
export const revalidate = 120;
export async function generateStaticParams() {
  // /deals/<category>/ landing routes share this [id] segment (a real
  // deal id is always numeric, a category slug never is). Prerender the
  // category pages; leave the ~5,000 individual deal pages on-demand.
  return DEAL_CATEGORY_SLUGS.map((id) => ({ id }));
}

const loadDealUncached = async (id) => {
  // Prefer the flat resolved card_* columns (a feed-discovered deal has no
  // watchlist row); fall back to the watchlist embed until the
  // deals_feed_discovery migration runs. withCard() normalises either shape
  // so everything below can keep reading deal.watchlist?.name etc.
  //
  // P0.2: this MUST use the admin (service-role) client, not the public
  // `supabase` client. RLS only grants public SELECT on `is_active = true`
  // rows (supabase/deals_schema.sql), so a deactivated (sold/ended) deal
  // was previously invisible to this query entirely - `deal` came back
  // null, and the page could only ever render the generic "not found"
  // text, never the truthful "this deal has ended" state with real card
  // context (card name, hub link) the brief requires. This is server-only
  // (a Server Component data loader, never shipped to the browser), so
  // reading past RLS here is safe - nothing below this call exposes
  // anything beyond what the page already renders for a live deal.
  const ready = await cardColsReady();
  const { data } = await supabaseAdmin()
    .from("deals")
    .select(ready ? "*" : "*, watchlist:watchlist_id (name, set, justtcg_tcgplayer_id, language)")
    .eq("id", id)
    .single();
  return data ? withCard(data) : data;
};

// 60s, not 300s like price analysis below - this row's own is_active flag
// is what keeps a sold/expired deal from continuing to render as live and
// buyable, so it shouldn't sit stale as long as data that only affects
// reference pricing.
const loadDealFromDataCache = unstable_cache(loadDealUncached, ["deal-detail"], { revalidate: 60 });

// cache() dedupes this within a single request on top of the above -
// generateMetadata and the page component below both need the same deal,
// and without this it'd be two calls per request even when both hit the
// same warm entry in Next's Data Cache.
const loadDeal = cache(loadDealFromDataCache);

export async function generateMetadata({ params }) {
  const { id } = await params;
  if (DEAL_CATEGORIES[id]) return dealCategoryMetadata(id);
  const deal = await loadDeal(id);
  // Not active anymore = as good as not found for anyone landing here -
  // don't generate a title/description repeating pricing/discount claims
  // that are no longer real (e.g. a link shared or indexed before the
  // deal expired) even in a link-preview card, which never hits the
  // page component's own is_active check below.
  // Not active, OR still active but no longer passes the quality gate
  // (played/damaged, wrong-language, or a physical condition we could
  // never actually verify) - as good as not found for anyone landing
  // here: don't repeat pricing/discount claims that aren't trustworthy.
  if (!shouldIndexDeal(deal) || !isDisplayableDeal(deal))
    return { title: "Deal not found", robots: { index: false, follow: true } };

  const cardName = cardDisplayName({ name: normalizePublicText(deal.watchlist?.name ?? deal.title) });
  const cardSet = deal.watchlist?.set;
  const discountPct = Math.round(deal.discount_pct * 100);
  // Length-aware, same approach as the card hub: keep the real card (and
  // set) name intact and drop the "- N% below market" suffix rather than
  // let the title run long once the site-name template is appended.
  const titleBase = `${cardName}${cardSet ? ` (${cardSet})` : ""}`;
  const titleSuffix = ` - ${discountPct}% below market`;
  // Keep the distinctive part inside Google's ~63-char display budget
  // (tests/seo/pages.test.mjs titleCore <= 65): prefer name+set+suffix,
  // then name+set, then drop the "(set)" parenthetical, then clip the
  // name - only a long name+set pair (e.g. a Trainer Kit sub-name) ever
  // reaches the last two branches.
  const title =
    titleBase.length + titleSuffix.length <= 58
      ? `${titleBase}${titleSuffix}`
      : titleBase.length <= 63
        ? titleBase
        : cardName.length <= 63
          ? cardName
          : cardName.slice(0, 62).trimEnd();
  // Real card/set context up front, not just bare price numbers - a
  // search result showing only "$74.99 vs a $214.20 market price" gives a
  // searcher no reason to click over a competing result unless they've
  // already scanned the title; naming the card again in the snippet does
  // that work for them.
  //
  // Both figures here are USD: `market_price` is a USD reference and
  // `dealTotalUsd` is the listing's USD-canonical total (NOT the native
  // `total_price`, which would render a non-USD listing as "$685" beside
  // the "$558" USD market price - a mixed, sometimes self-contradictory
  // snippet). The "for $X" clause is dropped when the USD total is
  // unknown rather than guessed. metadata is region-agnostic, so USD is
  // the right canonical unit even though the page localises on hydration.
  const listingUsd = dealTotalUsd(deal);
  const marketUsd = Number(deal.market_price);
  const forClause = listingUsd ? ` for $${listingUsd.toFixed(2)}` : "";
  const description = `${cardName}${cardSet ? ` (${cardSet})` : ""}${forClause} - ${discountPct}% below the $${marketUsd.toFixed(2)} real market price on eBay.`;

  // P0 deal-image-integrity: never advertise a card-back seller photo as
  // the deal's identity image - trustedDealImageUrl yields the canonical
  // exact-printing art for a CARD_BACK row, or null (omit) when there is
  // no trusted image.
  const ogImage = trustedDealImageUrl(deal);

  return {
    title,
    description,
    alternates: { canonical: `/deals/${id}` },
    openGraph: {
      title,
      description,
      images: ogImage ? [ogImage] : undefined,
    },
    // Next.js doesn't derive twitter:* from openGraph automatically - set
    // explicitly, or a shared deal link shows the generic site title/desc
    // on Twitter/X instead of this specific card's.
    twitter: {
      card: ogImage ? "summary_large_image" : "summary",
      title,
      description,
      images: ogImage ? [ogImage] : undefined,
    },
    // Always active here - the inactive case returns early above.
  };
}

// Keyed on primitives (not the deal/watchlist objects) so the cache key
// is exactly the values that actually change the result - every listing
// of the same card/grader/grade/language shares one cache entry here,
// not just repeat views of the exact same deal id, which multiplies the
// real hit rate on this expensive external API call well beyond what
// per-deal caching alone would get. 300s: this is reference market
// pricing, not the deal's own live/sold state (that's loadDeal, cached
// separately above at 60s), so it can safely sit a few minutes stale.
const loadPriceAnalysisUncached = async (tcgplayerId, grader, grade, language) => {
  try {
    return await getFullPriceAnalysis(tcgplayerId, { primaryGrader: grader, primaryGrade: grade, language });
  } catch (err) {
    console.error("Price analysis lookup failed:", err.message);
    return null;
  }
};

const loadPriceAnalysisFromDataCache = unstable_cache(loadPriceAnalysisUncached, ["price-analysis"], {
  revalidate: 300,
});

async function loadPriceAnalysis(deal, watchlist) {
  return loadPriceAnalysisFromDataCache(
    watchlist.justtcg_tcgplayer_id ?? null,
    deal.grader ?? null,
    deal.grade ?? null,
    watchlist.language ?? null
  );
}

export default async function DealDetailPage({ params }) {
  const { id } = await params;

  // /deals/<category>/ landing route (category slug), not a deal id.
  if (DEAL_CATEGORIES[id]) return <DealCategoryPage slug={id} />;

  const deal = await loadDeal(id);

  // A deactivated deal (expired, or corrected for bad data), OR a still-
  // active row that no longer passes the quality gate (played/damaged,
  // wrong-language, unverifiable physical condition) reads the same to a
  // visitor: not a live, trustworthy deal - so don't keep showing it with
  // real-looking pricing/CTAs. The card's own /cards/[slug] hub still
  // offers a plain "Find on eBay".
  if (!shouldIndexDeal(deal) || !isDisplayableDeal(deal)) {
    // P0.2: truthful expiry, not a dead end. `deal` (if a row exists at
    // all) still carries its card identity even once inactive/stale, so a
    // real "not this exact listing anymore, but here's what to do next"
    // page is possible without ever showing the old listing as an active
    // purchase opportunity or auto-redirecting anywhere.
    const cardName = deal ? cardDisplayName({ name: normalizePublicText(deal.watchlist?.name ?? deal.title) }) : null;
    const cardSet = deal?.watchlist?.set ?? null;
    const cardHub = deal?.watchlist_id ? await findCardHubByWatchlistId(deal.watchlist_id) : null;
    const searchQuery = cardName ? `${cardName}${cardSet ? ` ${cardSet}` : ""}` : null;
    const ebaySearchUrl = searchQuery ? buildEbaySearchLink(searchQuery, deal?.marketplace, "deal_page") : null;
    return (
      <div className="min-h-screen bg-paper">
        <SiteHeader />
        <div className="mx-auto max-w-2xl px-6 py-16 text-center">
          <h1 className="text-xl font-bold text-black dark:text-zinc-50">
            {deal ? "This deal has ended" : "Deal not found"}
          </h1>
          <p className="mt-2 text-sm text-zinc-500">
            {deal
              ? `The listing${cardName ? ` for ${cardName}` : ""} is no longer available, sold, or no longer meets our listing checks - it's not a live purchase opportunity anymore.`
              : "That deal doesn't exist, or has expired."}
          </p>
          <div className="mt-6 flex flex-col items-center gap-3">
            {cardHub && (
              <Link
                href={`/cards/${cardHub.slug}`}
                className="rounded-lg bg-black px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-zinc-800 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
              >
                See current listings for this card →
              </Link>
            )}
            {ebaySearchUrl && (
              <AffiliateLink
                href={ebaySearchUrl}
                eventName="eBay Search Click"
                eventData={{ page: "expired_deal" }}
                className="text-sm font-medium text-red-600 hover:underline dark:text-red-500"
              >
                See current listings on eBay →
              </AffiliateLink>
            )}
            <Link href="/" className="text-sm font-medium underline">
              Back to all deals
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // cardHub is only non-null when 2+ listings of this exact card are
  // simultaneously active (see lib/deals.js's fetchCardHubs) - a real,
  // live duplicate-content problem this session's SEO audit found: 69%
  // of watched cards with an active deal have 2+ listings at once, each
  // one otherwise a near-identical page competing with the others for
  // the same search. Linking every one of them to the one consolidated
  // hub page is what actually fixes that (not just the hub page
  // existing on its own, unlinked).
  // Species page is English-only (see lib/deals.js's fetchSpeciesHubs);
  // only link one when this card's species cleared SPECIES_MIN_LISTINGS.
  const speciesName =
    deal.watchlist?.language !== "japanese"
      ? extractSpecies(deal.watchlist?.name ?? deal.title)
      : null;

  const [analysis, cardHub, speciesHub, validSetSlugs] = await Promise.all([
    loadPriceAnalysis(deal, deal.watchlist),
    deal.watchlist_id ? findCardHubByWatchlistId(deal.watchlist_id) : Promise.resolve(null),
    speciesName ? resolveSpeciesByName(speciesName) : Promise.resolve(null),
    fetchSetSlugs("english"),
  ]);

  // The chart/section for THIS specific listing's own variant - raw uses
  // analysis.raw directly, graded finds its matching tile in
  // analysis.graded by the key the library already computed.
  const primaryHistory = deal.is_graded
    ? analysis?.graded?.find((g) => g.key === analysis.primaryKey)?.history ?? []
    : analysis?.raw?.history ?? [];
  const recentSales = analysis?.primaryRecentSales ?? [];

  const cardName = cardDisplayName({ name: normalizePublicText(deal.watchlist?.name ?? deal.title) });
  const cardSet = deal.watchlist?.set;
  // /sets/[slug] only exists for an English set that clears
  // SET_MIN_LISTINGS - gate on the real list, not just "is English".
  const setSlugRaw = cardSet && deal.watchlist?.language !== "japanese" ? slugifySet(cardSet) : null;
  const setSlug = setSlugRaw && validSetSlugs.includes(setSlugRaw) ? setSlugRaw : null;

  // Deterministic "return to browsing" destination from the deal's own
  // data, used for a direct visit / an absent-or-invalid ?from= hint:
  // species page (only when it's a real indexed one) -> set page -> the
  // deals index. Never invents a species link that doesn't exist.
  const backFallback = speciesHub
    ? { href: `/pokemon/${speciesHub.slug}`, label: `${speciesHub.name} cards & deals` }
    : setSlug
      ? { href: `/sets/${setSlug}`, label: cardSet }
      : { href: "/deals", label: "all deals" };
  const discountPct = Math.round(deal.discount_pct * 100);
  const isAuction = deal.listing_type === "AUCTION";
  const marketInfo = MARKETPLACES[deal.marketplace];

  // Native currency on the server (keeps this page statically cacheable);
  // <Price> localises each figure to the viewer's currency after
  // hydration. market_price and the derived "saved" are USD references.
  const nativeCurrency = currencyForDeal(deal);
  const total = Number(deal.total_price);
  const usdTotal = Number(deal.total_price_usd ?? deal.total_price);
  const marketUsd = Number(deal.market_price);
  const savedUsd = marketUsd - usdTotal;
  // USD reference / savings in the listing's own currency so every money
  // figure in the same comparison shares one currency before <Price>
  // localises them together after hydration (lib/money.refInListingCurrency).
  const marketNative = refInListingCurrency(marketUsd, total, usdTotal, nativeCurrency);
  const savedNative = marketNative != null ? marketNative - total : null;
  const showRef = Number.isFinite(marketUsd) && savedUsd > 0 && marketNative != null;
  // P0 auction-price-integrity: the bid / shipping / landed-total split in
  // the listing's own currency, using the scan-time implied FX rate. Used
  // for the sticky CTA price and the Product JSON-LD offer so both name
  // the CURRENT BID as the auction's price, not the bid+shipping total.
  const auctionParts = isAuction ? auctionDisplayParts(deal) : null;
  const ctaPriceUsd = auctionParts ? auctionParts.bid.usd : usdTotal;
  const ctaPriceNative = auctionParts
    ? { amount: auctionParts.bid.native, currency: auctionParts.currency }
    : { amount: total, currency: nativeCurrency };
  const tcgplayerLink = buildTcgplayerLink(cardName, deal.watchlist?.justtcg_tcgplayer_id);

  // Structured data so a search result can show price/availability
  // directly (Google's Product rich result). Auctions report the current
  // bid as the price with an UsedCondition note in the description above,
  // not a special schema.org auction type - Offer doesn't model
  // "current bid, may rise" cleanly, and this stays accurate either way.
  //
  // brand and shippingDetails are both real data, not filled in to please
  // Search Console: "Pokemon" is genuinely the brand of every card here,
  // and shippingRate is deal.shipping - the actual cost eBay's own API
  // returned for this exact listing, already used to compute total_price.
  // Deliberately NOT adding hasMerchantReturnPolicy - the real return
  // policy is set by whichever eBay seller has the listing and genuinely
  // varies per listing; asserting one here would mean stating something
  // we don't actually know is true for this specific sale.
  const productJsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: `${cardName}${cardSet ? ` - ${cardSet}` : ""}`,
    // P0 deal-image-integrity: the trusted display image (seller face, or
    // canonical exact-printing art) - never a card-back seller photo.
    image: trustedDealImageUrl(deal) ?? undefined,
    description: normalizePublicText(deal.title),
    brand: { "@type": "Brand", name: "Pokemon" },
    offers: {
      "@type": "Offer",
      url: deal.listing_url,
      // The listing's OWN currency (deal.currency, falling back to the
      // marketplace default) - not the marketplace currency, which can
      // differ from how the listing is actually priced (e.g. a
      // USD-denominated auction delivered to the UK). For an auction the
      // price is the CURRENT BID, matching what the page now shows.
      priceCurrency: nativeCurrency,
      price: Number(auctionParts ? auctionParts.bid.native : deal.total_price).toFixed(2),
      availability: deal.is_active ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
      itemCondition: "https://schema.org/UsedCondition",
      shippingDetails: {
        "@type": "OfferShippingDetails",
        shippingRate: {
          "@type": "MonetaryAmount",
          value: Number(deal.shipping ?? 0).toFixed(2),
          currency: nativeCurrency,
        },
        shippingDestination: {
          "@type": "DefinedRegion",
          addressCountry: deal.marketplace?.replace("EBAY_", "") ?? "US",
        },
      },
    },
  };

  // Real 3-level breadcrumb (Deals > this card's hub > this listing) when
  // a hub exists - matches the real "View 12 active listings" link above
  // and gives Google the same hierarchy the visible page shows, instead
  // of a flat 2-level one that hides the hub relationship entirely.
  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Deals", item: "https://pokemondealfinder.com/" },
      ...(cardHub
        ? [{ "@type": "ListItem", position: 2, name: cardName, item: `https://pokemondealfinder.com/cards/${cardHub.slug}` }]
        : []),
      {
        "@type": "ListItem",
        position: cardHub ? 3 : 2,
        name: cardHub ? "This listing" : cardName,
        item: `https://pokemondealfinder.com/deals/${deal.id}`,
      },
    ],
  };

  return (
    <div className="min-h-screen bg-paper">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(productJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />
      <RecordCardView
        card={{
          slug: cardHub?.slug ?? null,
          dealId: deal.id,
          name: cardName,
          set: cardSet,
          image: trustedDealImageUrl(deal),
          price: deal.total_price,
          currency: currencyForDeal(deal),
        }}
      />
      <DetailViewAnalytics kind="deal" contentId={deal.id} />
      <SiteHeader />
      <div className="mx-auto max-w-5xl px-6 py-10">
        <div className="mb-3">
          <DealBackLink fallbackHref={backFallback.href} fallbackLabel={backFallback.label} />
        </div>
        <Breadcrumbs
          items={[
            { name: "Deals", href: "/" },
            ...(cardHub ? [{ name: cardName, href: `/cards/${cardHub.slug}` }] : []),
            { name: cardHub ? "This listing" : cardName },
          ]}
        />

        <div className="mt-4 flex flex-col gap-6 rounded-xl border border-zinc-200 bg-white p-6 shadow-card sm:flex-row dark:border-zinc-800 dark:bg-zinc-950">
          <div className="relative h-56 w-56 shrink-0 self-center overflow-hidden rounded-lg bg-zinc-50 sm:self-auto dark:bg-zinc-900">
            <DealImage
              {...dealImageProps(deal)}
              alt={normalizePublicText(deal.title)}
              sizes="224px"
              priority
              className="object-contain p-3"
            />
          </div>

          <div className="flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-md bg-emerald-600 px-2.5 py-0.5 text-xs font-semibold text-white">
                {discountPct}% below market
              </span>
              {deal.watchlist?.language === "japanese" && (
                <span className="rounded-md bg-zinc-100 px-2.5 py-0.5 text-xs font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                  🇯🇵 Japanese Print
                </span>
              )}
              {deal.is_graded ? (
                <span className="rounded-md bg-indigo-100 px-2.5 py-0.5 text-xs font-medium text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
                  {deal.grader} {deal.grade}
                </span>
              ) : (
                <span className="rounded-md bg-zinc-100 px-2.5 py-0.5 text-xs font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                  {conditionLabel(deal)}
                </span>
              )}
              <span className="rounded-md bg-zinc-100 px-2.5 py-0.5 text-xs font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                {isAuction ? "Auction" : "Buy It Now"}
              </span>
              {marketInfo && <span title={marketInfo.label}>{marketInfo.flag}</span>}
            </div>

            {/* Real deal context folded into the H1 itself (not just the
                separate badge above it) - a bare card name as H1 misses
                the actual search intent for "<card> deal"/"<card> below
                market" queries, which the title tag and meta description
                already target but the page's own primary heading didn't. */}
            <h1 className="mt-3 text-xl font-bold text-black dark:text-zinc-50">
              {cardName}
              <span className="font-medium text-zinc-500"> - {discountPct}% Below Market</span>
            </h1>
            {cardSet && (
              setSlug ? (
                <Link href={`/sets/${setSlug}`} className="text-zinc-500 hover:text-red-600 hover:underline dark:hover:text-red-500">
                  {cardSet}
                </Link>
              ) : (
                <p className="text-zinc-500">{cardSet}</p>
              )
            )}
            <p className="mt-1 line-clamp-2 text-sm text-zinc-400">{normalizePublicText(deal.title)}</p>

            {cardHub && (
              <Link
                href={`/cards/${cardHub.slug}`}
                className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-red-600 hover:underline dark:text-red-500"
              >
                {cardHub.count} active listings found - compare prices →
              </Link>
            )}

            {speciesHub && (
              <Link
                href={`/pokemon/${speciesHub.slug}`}
                className="mt-1 flex items-center gap-1 text-sm text-zinc-500 hover:text-red-600 hover:underline dark:hover:text-red-500"
              >
                All {speciesHub.name} deals ({speciesHub.count}) →
              </Link>
            )}

            <div className="mt-4">
              {isAuction ? (
                // P0 auction-price-integrity: headline = CURRENT BID, with
                // shipping and the estimated landed total on their own
                // lines. The "% below market" / market reference stay
                // attached to the EST. TOTAL line - deal qualification is
                // unchanged, it still compares the landed total against the
                // reference.
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
                      <span className="text-base text-zinc-400 line-through">
                        <Price
                          usd={marketUsd}
                          native={{ amount: marketNative, currency: nativeCurrency }}
                          approxPrefix=""
                        />
                      </span>
                    )}
                  </div>
                  {showRef ? (
                    <p className="text-sm font-medium text-emerald-600 dark:text-emerald-500">
                      You save{" "}
                      <Price usd={savedUsd} native={{ amount: savedNative, currency: nativeCurrency }} /> ·{" "}
                      {discountPct}% below market
                    </p>
                  ) : (
                    <p className="text-sm font-medium text-emerald-600 dark:text-emerald-500">
                      {discountPct}% below market
                    </p>
                  )}
                </>
              )}
              <p className="mt-1 text-xs text-zinc-400">
                Compared against real market pricing.{" "}
                <Link
                  href="/methodology"
                  className="hover:text-red-600 hover:underline dark:hover:text-red-500"
                >
                  How we price this →
                </Link>
              </p>
            </div>
            {deal.seller_feedback_pct != null && (
              <p className="mt-1 text-xs text-zinc-400">
                {Number(deal.seller_feedback_pct).toFixed(1)}% seller feedback
              </p>
            )}

            <div className="mt-5 flex flex-wrap gap-3">
              <AffiliateLink
                href={wrapEbayAffiliateUrl(deal.affiliate_url, { surface: "deal_page" })}
                eventName="eBay Click"
                eventData={{
                  card: cardName,
                  marketplace: deal.marketplace,
                  discountPct,
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
              <ShareButton
                url={`${SITE_URL}/deals/${deal.id}`}
                title={`${cardName} - ${discountPct}% below market`}
                text={`${cardName}${cardSet ? ` (${cardSet})` : ""}${dealTotalUsd(deal) ? ` - $${dealTotalUsd(deal).toFixed(2)},` : " -"} ${discountPct}% below market on Pokemon Deal Finder`}
                label="Share"
                className="rounded-lg px-4 py-2"
              />
              <SaveCardButton
                card={{
                  slug: cardHub?.slug ?? null,
                  dealId: deal.id,
                  name: cardName,
                  set: cardSet,
                  image: trustedDealImageUrl(deal),
                  price: deal.total_price,
                  currency: currencyForDeal(deal),
                }}
              />
              {emailEnabled() && cardHub && (
                <PriceAlertForm
                  cardSlug={cardHub.slug}
                  cardName={cardName}
                  suggestedPrice={deal.total_price_usd ?? deal.total_price}
                />
              )}
            </div>
          </div>
        </div>

        <div className="mt-6 rounded-xl border border-zinc-200 bg-white p-6 shadow-card dark:border-zinc-800 dark:bg-zinc-950">
          <h2 className="text-sm font-semibold text-black dark:text-zinc-50">
            {deal.is_graded ? `${deal.grader} ${deal.grade} price history` : "Market price history"}
          </h2>
          <p className="text-xs text-zinc-400">
            {deal.is_graded ? "Real graded sold comps" : "Real market pricing"}, fetched fresh for this
            page.
          </p>
          {primaryHistory.length >= 2 ? (
            <div className="mt-4">
              <PriceHistoryChart points={primaryHistory} />
            </div>
          ) : (
            <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-300">
              Not enough dated sales to plot a trend yet. Current{" "}
              {deal.is_graded ? "graded comp" : "market"} value is{" "}
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

        {analysis && (analysis.graded.length > 0 || analysis.raw.history.length > 0) && (
          <div
            id="price-analysis"
            className="mt-6 scroll-mt-6 rounded-xl border border-zinc-200 bg-white p-6 shadow-card dark:border-zinc-800 dark:bg-zinc-950"
          >
            <h2 className="text-sm font-semibold text-black dark:text-zinc-50">Every variant, side by side</h2>
            <p className="text-xs text-zinc-400">
              Raw and every graded tier with real recorded sales - the highlighted tile is this listing.
            </p>
            <div className="mt-4">
              <VariantPriceGrid raw={analysis.raw} graded={analysis.graded} activeKey={analysis.primaryKey} cardName={cardName} surface="deal_page" />
            </div>
          </div>
        )}

        {analysis && (analysis.conditionBreakdown.length > 0 || analysis.salesVelocity) && (
          <div className="mt-6 grid gap-6 sm:grid-cols-2">
            {analysis.conditionBreakdown.length > 0 && (
              <div className="rounded-xl border border-zinc-200 bg-white p-6 shadow-card dark:border-zinc-800 dark:bg-zinc-950">
                <h2 className="text-sm font-semibold text-black dark:text-zinc-50">Condition breakdown</h2>
                <p className="text-xs text-zinc-400">
                  Current raw market price by condition - click any to find that condition on eBay.
                </p>
                <ul className="mt-4 flex flex-col gap-2">
                  {analysis.conditionBreakdown.map((c) => (
                    <li key={c.condition}>
                      <AffiliateLink
                        href={buildEbaySearchLink(`${cardName} ${c.condition}`, undefined, "deal_page")}
                        eventName="eBay Click"
                        eventData={{ card: cardName, page: "condition_breakdown", condition: c.condition }}
                        className="flex items-center justify-between text-sm text-zinc-600 hover:text-red-600 dark:text-zinc-300 dark:hover:text-red-400"
                      >
                        <span>{c.condition}</span>
                        <span className="font-semibold text-black dark:text-zinc-50">
                          {(() => {
                            // Express the USD condition price in the
                            // listing's own currency so this block matches
                            // the headline price on the server render too.
                            const n = refInListingCurrency(c.price, total, usdTotal, nativeCurrency);
                            return (
                              <Price
                                usd={c.price}
                                native={{
                                  amount: n ?? Number(c.price),
                                  currency: n != null ? nativeCurrency : "USD",
                                }}
                                approxPrefix=""
                              />
                            );
                          })()}
                        </span>
                      </AffiliateLink>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {analysis.salesVelocity && (
              <div className="rounded-xl border border-zinc-200 bg-white p-6 shadow-card dark:border-zinc-800 dark:bg-zinc-950">
                <h2 className="text-sm font-semibold text-black dark:text-zinc-50">Market activity</h2>
                <p className="text-xs text-zinc-400">Real eBay sales across all conditions and grades.</p>
                <ul className="mt-4 flex flex-col gap-2 text-sm">
                  <li className="flex items-center justify-between">
                    <span className="text-zinc-600 dark:text-zinc-300">Sales in the last 30 days</span>
                    <span className="font-semibold text-black dark:text-zinc-50">{analysis.salesVelocity.monthlyTotal}</span>
                  </li>
                  <li className="flex items-center justify-between">
                    <span className="text-zinc-600 dark:text-zinc-300">Weekly average</span>
                    <span className="font-semibold text-black dark:text-zinc-50">
                      {analysis.salesVelocity.weeklyAverage.toFixed(1)}
                    </span>
                  </li>
                  <li className="flex items-center justify-between">
                    <span className="text-zinc-600 dark:text-zinc-300">Daily average</span>
                    <span className="font-semibold text-black dark:text-zinc-50">
                      {analysis.salesVelocity.dailyAverage.toFixed(2)}
                    </span>
                  </li>
                </ul>
              </div>
            )}
          </div>
        )}

        <RecentSales sales={recentSales} cardName={cardName} page="deal_recent_sales" surface="deal_page" className="mt-6" />

        <ListingChecks className="mt-8" />
      </div>
      <SiteFooter note="Card-to-listing matching is automated and not perfect - always double-check a listing's photos and description before buying." />

      {/* 13B.7.2 - reserved strip BELOW the footer so the fixed mobile
          CTA (~65px) never covers the footer nav / affiliate disclosure
          when scrolled to the bottom. */}
      <div className="h-20 lg:hidden" aria-hidden="true" />

      <StickyDealCta
        href={wrapEbayAffiliateUrl(deal.affiliate_url, { surface: "deal_page" })}
        priceUsd={ctaPriceUsd}
        priceNative={ctaPriceNative}
        priceLabel={isAuction ? "current bid" : undefined}
        ctaLabel={isAuction ? "Bid on eBay →" : "Check on eBay →"}
        eventData={{ card: cardName, marketplace: deal.marketplace, discountPct }}
      />
    </div>
  );
}
