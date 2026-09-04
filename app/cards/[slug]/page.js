import { unstable_cache } from "next/cache";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { resolveCardSlug, resolveCatalogCard, fetchCardOffers, fetchCardRelations, fetchSetSlugs, fetchCardPriceHistory } from "@/lib/deals";
import { catalogCardTitle } from "@/lib/cardSlug";
import { cardDisplayName, collectorNumberFromName } from "@/lib/cardName";
import { catalogImageUrl } from "@/lib/cardImage";
import { cardSpeciesLink } from "@/lib/cardLinks";
import { slugifySet } from "@/lib/slugify";
import { buildTcgplayerLink } from "@/lib/tcgplayer";
import { MARKETPLACES } from "@/lib/ebay";
import { getFullPriceAnalysis } from "@/lib/pokemonPriceTracker";
import SiteHeader from "@/components/SiteHeader";
import CardDealFilters from "@/components/CardDealFilters";
import { currencyForDeal } from "@/lib/money";
import PriceHistoryChart from "@/components/PriceHistoryChart";
import VariantPriceGrid from "@/components/VariantPriceGrid";
import RecentSales from "@/components/RecentSales";
import CardPriceSummary from "@/components/CardPriceSummary";
import CardPriceIntelligence from "@/components/CardPriceIntelligence";
import CardImagePlaceholder from "@/components/CardImagePlaceholder";
import AffiliateLink from "@/components/AffiliateLink";
import Breadcrumbs from "@/components/Breadcrumbs";
import CatalogCardView from "@/components/CatalogCardView";
import StickyDealCta from "@/components/StickyDealCta";
import SaveCardButton from "@/components/SaveCardButton";
import PriceAlertForm from "@/components/PriceAlertForm";
import { emailEnabled } from "@/lib/email";
import RecordCardView from "@/components/RecordCardView";
import DetailViewAnalytics from "@/components/analytics/DetailViewAnalytics";
import ListingChecks from "@/components/ListingChecks";
import RelatedCards from "@/components/RelatedCards";
import SiteFooter from "@/components/SiteFooter";

// How many of the cheapest offers get the full visual DealCard treatment
// (image, badges, CTA) right at the top - real feedback: landing on a
// page of plain text rows after clicking "N active listings" read as
// confusing/broken, since every other page on the site shows deals as
// image cards. The rest of the offers still get the complete plain list
// further down for anyone comparing all of them, not just the top few.
const FEATURED_OFFER_COUNT = 4;

const SITE_URL = "https://pokemondealfinder.com";

export const revalidate = 900;

// No request-time APIs on this route (currency/region moved client-side,
// no searchParams), so an empty generateStaticParams + the revalidate
// window above is enough to make it ISR: each hub renders on the first
// request, then serves from the edge cache (X-Vercel-Cache: HIT) and
// revalidates in the background. Prerendering all ~720 at build isn't
// worth it - each one makes a billed, rate-limited PokemonPriceTracker
// call, and on-demand spreads that load out instead of bursting it.
export async function generateStaticParams() {
  return [];
}

// Real per-card hub page - see lib/deals.js's fetchCardHubs for the full
// reasoning: consolidates every currently active listing of one exact
// print into one strong page instead of leaving them as several
// near-identical /deals/[id] pages competing with each other.
//
// Reference market data, cached separately from the live offers list
// (which changes as listings sell/expire) - same 300s window and
// primitive-keyed cache as app/deals/[id]/page.js's loadPriceAnalysis,
// reused here rather than duplicated.
const loadPriceAnalysisUncached = async (tcgplayerId) => {
  if (!tcgplayerId) return null;
  try {
    // Phase 11C: the raw Near Mint history series is now sourced from the
    // canonical price_history spine (fetchCardPriceHistory), so this
    // request no longer needs includeHistory - one fewer provider credit
    // per uncached render and no page traffic on the history endpoint.
    return await getFullPriceAnalysis(tcgplayerId, { includeHistory: false });
  } catch (err) {
    console.error("Price analysis lookup failed:", err.message);
    return null;
  }
};

const loadPriceAnalysis = unstable_cache(loadPriceAnalysisUncached, ["card-hub-price-analysis"], {
  revalidate: 300,
});

export async function generateMetadata({ params }) {
  const { slug } = await params;
  const hub = await resolveCardSlug(slug);
  if (!hub) {
    // No live-deal hub - fall back to the stable card_catalog record.
    const card = await resolveCatalogCard(slug);
    if (!card) return { title: "Card not found", robots: { index: false, follow: true } };
    const dn = card.displayName ?? cardDisplayName(card);
    // Precedence: structured card_catalog.card_number, then a number
    // embedded in the name (near-zero here - card_catalog is ~99% numbered).
    const catNumber = card.cardNumber ?? collectorNumberFromName(card.name);
    const title = catalogCardTitle(dn, card.set, catNumber);
    const idBits = [catNumber, card.rarity].filter(Boolean).join(", ");
    const description = card.refPrice != null
      ? `${dn} (${card.set}) Pokemon card price & value${idBits ? ` — ${idBits}` : ""}. Raw Near Mint market reference and condition-by-condition prices from real recent sold data, plus a TCGPlayer link.`
      : `${dn} (${card.set}) Pokemon card${idBits ? ` — ${idBits}` : ""}. Identity, image and a TCGPlayer link. Market price currently unavailable.`;
    return {
      title,
      description,
      // The permanent URL stays live (200) even with no trustworthy
      // price, but a page with no market value is too thin to index -
      // noindex,follow until a real price returns (P0 sitemap stays
      // price-gated to match).
      robots: card.indexable ? undefined : { index: false, follow: true },
      alternates: { canonical: `/cards/${slug}` },
      openGraph: {
        title,
        description,
        url: `${SITE_URL}/cards/${slug}`,
        images: card.image ? [card.image] : undefined,
      },
      twitter: {
        card: card.image ? "summary_large_image" : "summary",
        title,
        description,
        images: card.image ? [card.image] : undefined,
      },
    };
  }

  // Real gap found live: without an explicit openGraph/twitter block,
  // Next falls back to the root layout's generic site-wide preview
  // (title "Pokemon Deal Finder", generic description, generic image,
  // og:url pointing at the bare homepage) for every single card hub -
  // meaning sharing a specific card's link in Discord/Reddit/etc showed
  // no sign it was that card at all. fetchCardOffers is already
  // unstable_cache'd, so calling it again here just reuses that same
  // cached result rather than costing a second real query.
  const { deals: offers } = await fetchCardOffers(hub.id);
  // Card ARTWORK on a permanent page is the trusted TCGplayer catalogue
  // image for this exact product id - NEVER a marketplace listing photo,
  // which can be a counterfeit / novelty / wrong-angle shot of the card
  // (verified live: gold-metal fakes of Mewtwo EX 98/99 and Pikachu &
  // Zekrom GX 184/181 were the cheapest listing, so their photo would
  // have become this page's hero + og:image). A listing photo is a
  // last-resort fallback only when there is no catalogue image at all.
  const image = catalogImageUrl(hub.tcgplayerId) ?? offers[0]?.image_url;

  // Real gap found live: some watched cards have genuinely long real
  // names (tournament/championship promo prints, e.g. "Buddy-Buddy
  // Poffin - 144/162 (North America International Championship)
  // [Staff]") - Google reliably shows only ~55-60 characters of a title
  // before truncating or replacing it with its own rewrite, and the base
  // "Compare N Deals" template pushed some of these past 120 characters.
  // Never truncates the real name itself (that risks cutting off the
  // card number or other identifying info) - just drops the promotional
  // suffix when there's no room for it, rather than fighting a losing
  // battle against a genuinely long real title.
  // Phase 8A: one STABLE card-page template regardless of current deal
  // state - the "<card> <number> price / value" intent is identical
  // whether or not a listing is live right now, and a flipping
  // "... & Deals" / "... & Value" title churns the index.
  //
  // Collector-number source precedence (8A closeout): the STRUCTURED full
  // number wins over any partial pulled from the display name. The
  // live-deal hub object carries only name + set, so read the structured
  // number from the price-analysis record (d.cardNumber). loadPriceAnalysis
  // is unstable_cache'd and the page component calls it too, so this adds
  // no net billed request - just orders the same cached call first.
  const analysis = await loadPriceAnalysis(hub.tcgplayerId);
  const hubName = cardDisplayName(hub);
  const hubNumber = analysis?.cardNumber ?? collectorNumberFromName(hub.name);
  const title = catalogCardTitle(hubName, hub.set, hubNumber);
  const description = `${hubName}${hubNumber ? ` #${hubNumber}` : ""} (${hub.set}) Pokemon card price & value — raw Near Mint market reference and condition-by-condition prices from real recent sold data, graded (PSA/CGC/BGS) tiers where available, and live eBay listings compared cheapest first.`;

  return {
    title,
    description,
    alternates: { canonical: `/cards/${slug}` },
    openGraph: {
      title,
      description,
      url: `${SITE_URL}/cards/${slug}`,
      images: image ? [image] : undefined,
    },
    twitter: {
      card: image ? "summary_large_image" : "summary",
      title,
      description,
      images: image ? [image] : undefined,
    },
  };
}

export default async function CardHubPage({ params }) {
  const { slug } = await params;
  const hub = await resolveCardSlug(slug);
  if (!hub) {
    // No live-deal hub - render the stable card_catalog-backed page
    // instead (Phase 4 P0). It has no offers, so no Product/Offer schema.
    const card = await resolveCatalogCard(slug);
    if (!card) notFound();
    const [analysis, validSetSlugs, relations, priceHistory] = await Promise.all([
      loadPriceAnalysis(card.tcgplayerId),
      fetchSetSlugs("english"),
      fetchCardRelations(slug, card.name, card.set, card.species),
      fetchCardPriceHistory(card.tcgplayerId),
    ]);
    return (
      <CatalogCardView
        card={card}
        analysis={analysis}
        priceHistory={priceHistory}
        setHasPage={validSetSlugs.includes(slugifySet(card.set))}
        relations={relations}
      />
    );
  }

  // The canonical Pokemon this card links to (SEO Phase 4B - one shared
  // rule for both render paths, see lib/cardLinks). null for Trainer /
  // Energy / any card whose name a species doesn't lead.
  const speciesLink = cardSpeciesLink({ name: hub.name });
  // Shared display identity for the H1 / breadcrumb / Product JSON-LD /
  // OG - the exact catalogue name, only TCGplayer's "(#NN)" collector-
  // number parenthetical removed (it's on the identity line below).
  const cardName = cardDisplayName(hub);
  const [{ deals: offers, error }, analysis, relations, validSetSlugs, priceHistory] =
    await Promise.all([
      fetchCardOffers(hub.id),
      loadPriceAnalysis(hub.tcgplayerId),
      fetchCardRelations(slug, hub.name, hub.set, null),
      fetchSetSlugs("english"),
      fetchCardPriceHistory(hub.tcgplayerId),
    ]);
  const allOffers = offers;
  // Collector number + rarity for the visible identity line (Phase 8A /
  // §13). The live-deal hub object carries only name + set, so take the
  // structured values from the price-analysis record (same provider call
  // already made, no extra request), falling back to a number embedded in
  // the watchlist name.
  const cardCollectorNumber = analysis?.cardNumber ?? collectorNumberFromName(hub.name);
  const cardRarity = analysis?.rarity ?? null;
  // Trusted canonical artwork for this exact product - see generateMetadata.
  const canonicalImage = catalogImageUrl(hub.tcgplayerId);

  // This card's set only has a browsable /sets/[slug] page when it clears
  // SET_MIN_LISTINGS (a card hub needs only 2 listings; a set page needs
  // 3). Gate every "{set}" link/URL on that so we never link to a 404.
  const setSlug = slugifySet(hub.set);
  const setHasPage = validSetSlugs.includes(setSlug);

  // Durable card-to-card links (SEO Phase 4B): other prints of the same
  // Pokemon + other cards from the same set, from the whole catalogue
  // (not just live-deal hubs), each a permanent /cards/[slug].
  const { sameSpecies, sameSet } = relations;

  // The hub only exists (see fetchCardHubs) when there were 2+ active
  // listings as of the last 15-minute cache refresh - but listings sell/
  // expire between refreshes, so by the time this renders there could
  // legitimately be down to 1 or 0. 0 shouldn't happen (this cache
  // window is short) but isn't treated as an error if it does - just an
  // honest "nothing active right now" state, same as any other grid.
  // No ?country= filter here: the page is now statically cacheable (no
  // request-time APIs), the country grids cover that intent, and the
  // faceted per-hub URLs were only spending crawl budget.
  const cheapest = offers[0];
  // Cheapest live listing, normalised to the USD value every offer
  // carries - shown in the price summary as an asking-price floor, not a
  // market value.
  const rangeLowUsd = offers[0] ? Number(offers[0].total_price_usd ?? offers[0].total_price) : null;

  // Phase 11C: the chart + variant sparkline read the canonical merged
  // price_history spine (first-party 'catalog' forward + 'ppt_backfill'
  // prefix, WOTC = first-party only), NOT a per-request provider history
  // call. Already downsampled + bounded server-side (fetchCardPriceHistory).
  const chartPoints = priceHistory?.chartPoints ?? [];
  const canonRaw = analysis?.raw
    ? {
        ...analysis.raw,
        history: chartPoints,
        minPrice: chartPoints.length ? Math.min(...chartPoints.map((p) => p.p)) : null,
        maxPrice: chartPoints.length ? Math.max(...chartPoints.map((p) => p.p)) : null,
      }
    : analysis?.raw;
  const tcgplayerLink = buildTcgplayerLink(hub.name, hub.tcgplayerId);

  // Minimal descriptor for the viewer's local "recently viewed" / "saved"
  // lists (lib/recentCards) - enough to render a tile and link back here.
  const cardDescriptor = {
    slug,
    name: cardName,
    set: hub.set,
    image: canonicalImage ?? allOffers[0]?.image_url ?? null,
    price: allOffers[0]?.total_price ?? null,
    currency: allOffers[0] ? currencyForDeal(allOffers[0]) : null,
  };

  // One real Offer per real active listing - the documented Google/
  // schema.org pattern for "multiple sellers, one product," and the
  // direct structured-data expression of why this page exists: real
  // current offers, not a fabricated aggregate.
  // Real gap found live: Google's Product structured data guidelines
  // treat `image` as required for the richer product-snippet result
  // types, and this was missing here even though every sibling Product
  // block on the site (deal detail, sealed detail) already sets it from
  // real data - just an oversight when this page was first built, not a
  // deliberate omission (unlike hasMerchantReturnPolicy elsewhere, which
  // stays deliberately unset because there's no single real answer for
  // it across multiple sellers).
  const productJsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: `${cardName} - ${hub.set}`,
    image: canonicalImage ?? allOffers[0]?.image_url ?? undefined,
    description: `${cardName} (${hub.set}) - ${allOffers.length} active eBay ${allOffers.length === 1 ? "listing" : "listings"}, compared against real market pricing.`,
    brand: { "@type": "Brand", name: "Pokemon" },
    offers: allOffers.map((deal) => ({
      "@type": "Offer",
      url: deal.listing_url,
      priceCurrency: MARKETPLACES[deal.marketplace]?.currency ?? "USD",
      price: Number(deal.total_price).toFixed(2),
      availability: "https://schema.org/InStock",
      itemCondition: "https://schema.org/UsedCondition",
    })),
  };

  // Mirrors the visible <Breadcrumbs> below (Deals -> Cards -> set ->
  // card) so the structured trail matches what a user sees, per Google's
  // guidance. "Cards" is the SEO Phase 4B card directory.
  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Deals", item: `${SITE_URL}/` },
      { "@type": "ListItem", position: 2, name: "Cards", item: `${SITE_URL}/cards` },
      {
        "@type": "ListItem",
        position: 3,
        name: hub.set,
        ...(setHasPage ? { item: `${SITE_URL}/sets/${setSlug}` } : {}),
      },
      { "@type": "ListItem", position: 4, name: `${cardName} (${hub.set})`, item: `${SITE_URL}/cards/${slug}` },
    ],
  };

  return (
    <div className="min-h-screen bg-paper">
      {allOffers.length > 0 && (
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(productJsonLd) }} />
      )}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }} />
      <RecordCardView card={cardDescriptor} />
      <DetailViewAnalytics kind="card" contentId={slug} />
      <SiteHeader />

      <div className="mx-auto max-w-5xl px-6 py-10">
        <Breadcrumbs
          items={[
            { name: "Deals", href: "/" },
            { name: "Cards", href: "/cards" },
            { name: hub.set, href: setHasPage ? `/sets/${setSlug}` : undefined },
            { name: cardName },
          ]}
        />

        <div className="mt-4 flex flex-col gap-6 rounded-xl border border-zinc-200 bg-white p-6 shadow-card sm:flex-row dark:border-zinc-800 dark:bg-zinc-950">
          <div className="relative aspect-[63/88] w-44 shrink-0 self-center overflow-hidden rounded-lg bg-zinc-50 sm:w-64 sm:self-auto dark:bg-zinc-900">
            {canonicalImage || cheapest?.image_url ? (
              <Image
                src={canonicalImage ?? cheapest.image_url}
                alt={`${cardName} - ${hub.set}`}
                fill
                sizes="(max-width: 640px) 176px, 256px"
                quality={90}
                priority
                className="object-contain"
              />
            ) : (
              <CardImagePlaceholder className="h-24 w-16" />
            )}
          </div>

          <div className="flex-1">
            <span className="rounded-md bg-zinc-100 px-2.5 py-0.5 text-xs font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
              {offers.length} active {offers.length === 1 ? "listing" : "listings"}
            </span>
            <h1 className="mt-3 text-xl font-bold text-black dark:text-zinc-50">
              {cardName} — {hub.set} Price &amp; Value
            </h1>
            <p className="mt-1 flex flex-wrap items-center gap-x-2 text-sm text-zinc-500">
              {setHasPage ? (
                <Link
                  href={`/sets/${setSlug}`}
                  className="hover:text-red-600 hover:underline dark:hover:text-red-500"
                >
                  {hub.set}
                </Link>
              ) : (
                <span>{hub.set}</span>
              )}
              {cardCollectorNumber && <span className="text-zinc-400">· {cardCollectorNumber}</span>}
              {cardRarity && <span className="text-zinc-400">· {cardRarity}</span>}
            </p>

            {speciesLink && (
              <div className="mt-1">
                <Link
                  href={`/pokemon/${speciesLink.slug}`}
                  className="text-sm text-zinc-500 hover:text-red-600 hover:underline dark:hover:text-red-500"
                >
                  All {speciesLink.name} cards &amp; prices →
                </Link>
              </div>
            )}

            <div className="mt-5 flex flex-wrap items-center gap-3">
              <SaveCardButton card={cardDescriptor} />
              {tcgplayerLink && (
                <AffiliateLink
                  href={tcgplayerLink}
                  eventName="TCGPlayer Click"
                  eventData={{ card: hub.name, page: "card_hub" }}
                  className="rounded-lg border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-600 hover:border-zinc-300 dark:border-zinc-800 dark:text-zinc-300"
                >
                  Check on TCGPlayer
                </AffiliateLink>
              )}
              {emailEnabled() && (
                <PriceAlertForm
                  cardSlug={slug}
                  cardName={hub.name}
                  suggestedPrice={cheapest ? (cheapest.total_price_usd ?? cheapest.total_price) : null}
                />
              )}
            </div>
          </div>
        </div>

        <CardPriceSummary
          analysis={analysis}
          offersCount={offers.length}
          listingsLowUsd={rangeLowUsd}
        />

        <CardPriceIntelligence
          marketValueUsd={analysis?.raw?.currentPrice ?? null}
          trends={priceHistory?.trends ?? null}
          signal={priceHistory?.signal ?? null}
          coverage={priceHistory?.coverage ?? null}
          cheapestListingUsd={rangeLowUsd}
          offersCount={offers.length}
        />

        {/* 13B.4.2 - the live-listings area. Structured deal filters
            (type / grader / grade / price / listing / country / sort) are
            client-driven off the URL; the card identity above is never
            affected. Provider-free (Supabase). */}
        <CardDealFilters
          slug={slug}
          initial={allOffers}
          validSetSlugs={validSetSlugs}
          featuredCount={FEATURED_OFFER_COUNT}
          totalActive={allOffers.length}
        />

        {chartPoints.length >= 2 && (
          <div className="mt-6 rounded-xl border border-zinc-200 bg-white p-6 shadow-card dark:border-zinc-800 dark:bg-zinc-950">
            <h2 className="text-sm font-semibold text-black dark:text-zinc-50">Market price history</h2>
            <p className="text-xs text-zinc-400">
              Our first-party daily snapshots joined to reference history. Historical data availability
              varies by card.
            </p>
            <div className="mt-4">
              <PriceHistoryChart points={chartPoints} />
            </div>
          </div>
        )}

        {analysis && (analysis.graded.length > 0 || chartPoints.length >= 2) && (
          <div className="mt-6 rounded-xl border border-zinc-200 bg-white p-6 shadow-card dark:border-zinc-800 dark:bg-zinc-950">
            <h2 className="text-sm font-semibold text-black dark:text-zinc-50">Every variant, side by side</h2>
            <p className="text-xs text-zinc-400">Raw and every graded tier with real recorded sales.</p>
            <div className="mt-4">
              <VariantPriceGrid raw={canonRaw} graded={analysis.graded} cardName={hub.name} />
            </div>
          </div>
        )}

        <RecentSales
          sales={analysis?.primaryRecentSales}
          cardName={cardName}
          page="card_recent_sales"
          variant={analysis?.primaryKey === "raw" ? "raw" : null}
          className="mt-6"
        />

        <p className="mt-6 text-xs leading-relaxed text-zinc-400">
          Market-reference prices are a guide based on recent sold data, not a guaranteed sale value —
          the real figure depends on the exact printing, condition and grade, and marketplace prices
          move. Pokemon Deal Finder doesn&apos;t buy cards or guarantee any sale value.
        </p>

        {error && (
          <p className="mt-6 rounded-lg bg-red-50 p-4 text-red-700">Couldn&apos;t load listings: {error}</p>
        )}

        <RelatedCards
          sameSpecies={sameSpecies}
          sameSet={sameSet}
          speciesLink={speciesLink}
          setLink={setHasPage ? { name: hub.set, slug: setSlug } : null}
          className="mt-10"
        />

        <ListingChecks className="mt-8" />

        <div className="mt-8 flex justify-center">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-300 bg-white px-3.5 py-2 text-sm font-semibold text-black transition-colors hover:border-zinc-400 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50 dark:hover:bg-zinc-800"
          >
            ← Back to All Deals
          </Link>
        </div>
      </div>

      {cheapest && (
        <>
          <StickyDealCta
            href={cheapest.affiliate_url}
            priceUsd={cheapest.total_price_usd ?? cheapest.total_price}
            priceNative={{ amount: Number(cheapest.total_price), currency: currencyForDeal(cheapest) }}
            ctaLabel={cheapest.listing_type === "AUCTION" ? "Bid on eBay →" : "Check on eBay →"}
            eventData={{ card: hub.name, marketplace: cheapest.marketplace, page: "card_hub" }}
          />
          {/* 13B.7.1 - reserve space so the fixed mobile CTA never covers
              the footer links / affiliate disclosure at the page bottom. */}
          <div className="h-16 lg:hidden" aria-hidden="true" />
        </>
      )}

      <SiteFooter note="Card-to-listing matching is automated and not perfect - always double-check a listing's photos and description before buying." />
    </div>
  );
}
