import Image from "next/image";
import Link from "next/link";
import { slugifySet } from "@/lib/slugify";
import { hasPrice } from "@/lib/money";
import { upgradeCatalogImage } from "@/lib/cardImage";
import { cardSpeciesLink } from "@/lib/cardLinks";
import { buildTcgplayerLink } from "@/lib/tcgplayer";
import { cardDisplayName } from "@/lib/cardName";
import { catalogCardHeading } from "@/lib/cardSlug";
import SiteHeader from "@/components/SiteHeader";
import SkipToContent from "@/components/SkipToContent";
import SiteFooter from "@/components/SiteFooter";
import Breadcrumbs from "@/components/Breadcrumbs";
import CardImagePlaceholder from "@/components/CardImagePlaceholder";
import CardMarketPanel, { CardMarketSummary } from "@/components/CardMarketPanel";
import CardPriceIntelligence from "@/components/CardPriceIntelligence";
import PriceHistoryChart from "@/components/PriceHistoryChart";
import AffiliateLink from "@/components/AffiliateLink";
import ListingChecks from "@/components/ListingChecks";
import RelatedCards from "@/components/RelatedCards";
import RecordCardView from "@/components/RecordCardView";
import CardWorthAnswer from "@/components/CardWorthAnswer";
import CardNextSteps from "@/components/CardNextSteps";
import { cardWorthAnswer, pageShowsGraded, isUsableUsdPrice } from "@/lib/cardWorth";
import { cardNextSteps } from "@/lib/cardNextSteps";
import { otherPrintings } from "@/lib/cardPrintings";
import { serializeJsonLd } from "@/lib/jsonLd";

const SITE_URL = "https://pokemondealfinder.com";

// The catalog-backed /cards/[slug] render: a real card that currently has
// NO live eBay deal. Identity + market reference pricing + variant/graded
// analysis + a TCGPlayer CTA. It carries BreadcrumbList schema only -
// deliberately NO Product/Offer/AggregateRating, because there are no
// offers and no reviews to describe. When a live deal appears for this
// card, resolveCardSlug (the deal hub) takes over the same URL and the
// full deal-hub template (Product/Offer schema, listings grid) renders
// instead - see app/cards/[slug]/page.js.
export default function CatalogCardView({
  card,
  analysis,
  priceHistory = null,
  setHasPage,
  relations = null,
  speciesLiveCount = null,
  setLiveCount = null,
  alertsEnabled = false,
  ebaySearchHref = null,
  nowMs = null,
}) {
  const { slug, set, cardNumber, rarity, image, species, refPrice } = card;
  // shared display identity - the ex/EX/GX/Mega/owner name kept verbatim,
  // only TCGplayer's "(#NN)" collector-number parenthetical removed (the
  // number is on the identity line below the H1).
  const name = card.displayName ?? cardDisplayName(card);

  const setSlug = slugifySet(set);
  // SEO Phase 4B - one shared rule for the card -> Pokemon link, identical
  // to the live-deal hub path. Rejects Trainer / Energy names even when
  // the catalogue `species` column is set.
  const speciesLink = cardSpeciesLink({ name: card.name, cardType: card.cardType, species });
  const tcgplayerLink = buildTcgplayerLink(name, card.tcgplayerId, { page: "card", placement: "reference" });
  // Phase 11C: canonical merged price_history spine (not a provider
  // history call). Bounded + downsampled server-side.
  const chartPoints = priceHistory?.chartPoints ?? [];
  // Price-condition provenance: the tile's range covers only VERIFIED
  // history comparable to the latest recorded reference (null until such
  // history exists) - see fetchCardPriceHistory's comparableRange.
  const canonRaw = analysis?.raw
    ? {
        ...analysis.raw,
        history: chartPoints,
        minPrice: priceHistory?.comparableRange?.min ?? null,
        maxPrice: priceHistory?.comparableRange?.max ?? null,
      }
    : analysis?.raw;
  const hasAnalysis = Boolean(analysis && (chartPoints.length >= 2 || analysis.graded?.length));

  // Does the live analysis carry a real, showable number? (Mirrors
  // CardPriceSummary's own "nothing worth showing" gate.) When it doesn't -
  // e.g. PPT's figure for this printing was rejected as contaminated
  // (an impossible condition ladder) - we must NOT quietly fall back to
  // the daily-synced card_catalog price, which shares that bad-data
  // lineage: a missing price is preferable to a false one. Show an
  // explicit "unavailable" instead.
  const analysisHasPrice = Boolean(
    analysis &&
      (hasPrice(analysis.raw?.currentPrice) ||
        (analysis.graded ?? []).some((g) => hasPrice(g.currentPrice) && g.saleCount > 0))
  );

  const cardDescriptor = {
    slug,
    name,
    set,
    image: image ?? null,
    price: refPrice ?? null,
    currency: "USD",
  };

  // Phase 17B - the worth answer owns the raw reference, using the same
  // established precedence: the live analysis raw
  // price; else, only when the analysis call itself failed, the catalogue
  // copy; else no figure at all (a rejected analysis price is never
  // papered over with the catalogue value).
  const analysisRaw = analysis?.raw?.currentPrice;
  const worthUsd = analysisHasPrice
    ? (isUsableUsdPrice(analysisRaw) ? Number(analysisRaw) : null)
    : analysis == null && isUsableUsdPrice(refPrice)
      ? Number(refPrice)
      : null;
  const worth = cardWorthAnswer({
    name,
    set,
    cardNumber,
    rarity,
    marketUsd: worthUsd,
    priceSource: analysisHasPrice ? "analysis" : "catalog",
    // audit-r1: the catalogue reference carries its own sync date
    priceUpdatedAt: analysisHasPrice ? analysis?.priceUpdatedAt ?? null : card.syncedAt ?? null,
    // Price-condition provenance, from whichever source supplied the figure:
    // the live analysis's recorded condition, else the catalogue's stored
    // market_condition (null until the provenance migration + a sync).
    referenceCondition: analysisHasPrice ? analysis?.raw?.referenceCondition ?? null : card.refCondition ?? null,
    firstEditionExcluded: analysisHasPrice ? Boolean(analysis?.firstEditionExcluded) : /unlimited/i.test(card.refPrinting ?? ""),
    gradedAvailable: analysisHasPrice && pageShowsGraded(analysis),
    liveListings: null,
    nowMs,
  });
  const nextLinks = cardNextSteps({
    species: speciesLink,
    speciesLive: speciesLiveCount,
    set: setHasPage ? { name: set, slug: setSlug } : null,
    setLive: setLiveCount,
    marketUsd: worthUsd,
    setName: set,
  });

  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Deals", item: `${SITE_URL}/` },
      { "@type": "ListItem", position: 2, name: "Cards", item: `${SITE_URL}/cards` },
      {
        "@type": "ListItem",
        position: 3,
        name: set,
        ...(setHasPage ? { item: `${SITE_URL}/sets/${setSlug}` } : {}),
      },
      { "@type": "ListItem", position: 4, name: `${name} (${set})`, item: `${SITE_URL}/cards/${slug}` },
    ],
  };

  return (
    <div className="min-h-screen bg-paper">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(breadcrumbJsonLd) }} />
      <RecordCardView card={cardDescriptor} />
      <SkipToContent />
      <SiteHeader />

      <main id="main-content" tabIndex={-1} className="mx-auto max-w-5xl scroll-mt-24 px-6 py-6">
        <Breadcrumbs
          items={[
            { name: "Deals", href: "/" },
            { name: "Cards", href: "/cards" },
            { name: set, href: setHasPage ? `/sets/${setSlug}` : undefined },
            { name },
          ]}
        />

        <div className="mt-4 flex flex-col gap-4 rounded-xl border border-zinc-200 bg-white p-4 sm:gap-6 sm:p-6 sm:flex-row dark:border-zinc-800 dark:bg-zinc-950">
          <div className="relative aspect-[63/88] w-28 shrink-0 self-center overflow-hidden rounded-lg bg-zinc-50 sm:w-48 sm:self-auto dark:bg-zinc-900">
            {image ? (
              <Image
                src={upgradeCatalogImage(image)}
                alt={`${name} - ${set}`}
                fill
                sizes="(max-width: 640px) 112px, 192px"
                quality={85}
                priority
                className="object-contain"
              />
            ) : (
              <CardImagePlaceholder className="h-24 w-16" />
            )}
          </div>

          <div className="flex-1">
            <span className="rounded-md bg-zinc-100 px-2.5 py-0.5 text-xs font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
              No live eBay deals right now
            </span>
            {/* SEO-2: same identity as the <title> - the collector number
                appears exactly once (lib/cardSlug catalogCardHeading). */}
            <h1 className="mt-3 text-xl font-bold text-black dark:text-zinc-50">
              {catalogCardHeading(name, set, cardNumber)}
            </h1>
            <p className="mt-1 flex flex-wrap items-center gap-x-2 text-sm text-zinc-500 dark:text-zinc-400">
              {setHasPage ? (
                <Link href={`/sets/${setSlug}`} className="hover:text-red-600 hover:underline dark:hover:text-red-500">
                  {set}
                </Link>
              ) : (
                <span>{set}</span>
              )}
              {cardNumber && <span className="text-zinc-600 dark:text-zinc-400">· {cardNumber}</span>}
              {rarity && <span className="text-zinc-600 dark:text-zinc-400">· {rarity}</span>}
            </p>

            {speciesLink && (
              <div className="mt-1">
                <Link
                  href={`/pokemon/${speciesLink.slug}`}
                  className="text-sm text-zinc-500 hover:text-red-600 hover:underline dark:hover:text-red-500 dark:text-zinc-400"
                >
                  All {speciesLink.name} cards &amp; prices →
                </Link>
              </div>
            )}

            <CardWorthAnswer answer={worth} embedded>

              <div className="mt-5 flex flex-wrap items-center gap-3">
                {tcgplayerLink && (
                  <AffiliateLink
                    href={tcgplayerLink}
                    eventName="TCGPlayer Click"
                    eventData={{ card: name, page: "card_catalog" }}
                    className="rounded-lg border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-600 hover:border-zinc-300 dark:border-zinc-800 dark:text-zinc-300"
                  >
                    Check on TCGPlayer
                  </AffiliateLink>
                )}
              </div>
            </CardWorthAnswer>
          </div>
        </div>

        {/* Live PPT analysis first. If it has no showable number, fall back
            to the daily-synced card_catalog figure ONLY when the analysis
            fetch itself failed (analysis == null) - never to paper over a
            price the analysis deliberately rejected. Otherwise say so. */}
        <CardMarketSummary tcgplayerId={card.tcgplayerId} />
        {isUsableUsdPrice(refPrice) ? (
          <>
            <CardPriceIntelligence
              detailsOnly
              marketValueUsd={Number(refPrice)}
              referenceCondition={card.refCondition ?? null}
              trends={priceHistory?.trends ?? null}
              signal={priceHistory?.signal ?? null}
              coverage={priceHistory?.coverage ?? null}
              summaryOffer={null}
              offersCount={0}
            />
          </>
        ) : null}

        <CardNextSteps
          variant="no-deal"
          links={nextLinks}
          alert={alertsEnabled ? { cardSlug: slug, cardName: card.name, suggestedPrice: isUsableUsdPrice(refPrice) ? Math.round(Number(refPrice) * 0.9 * 100) / 100 : null } : null}
          ebaySearchHref={ebaySearchHref}
        />

        {chartPoints.length >= 2 && (
          <div className="mt-6 rounded-xl border border-zinc-200 bg-white p-6 shadow-card dark:border-zinc-800 dark:bg-zinc-950">
            <h2 className="text-sm font-semibold text-black dark:text-zinc-50">Market price history</h2>
            <p className="text-xs text-zinc-600 dark:text-zinc-400">
              Our first-party daily snapshots joined to reference history. Historical data availability
              varies by card.
            </p>
            <div className="mt-4">
              <PriceHistoryChart points={chartPoints} />
            </div>
          </div>
        )}

        <CardMarketPanel
          tcgplayerId={card.tcgplayerId}
          cardName={name}
          chartPoints={chartPoints}
          comparableRange={priceHistory?.comparableRange ?? null}
        />

        <p className="mt-6 text-xs leading-relaxed text-zinc-600 dark:text-zinc-400">
          Market-reference prices are a guide based on recent sold data, not a guaranteed sale value —
          the real figure depends on the exact printing, condition and grade, and marketplace prices
          move. Pokemon Deal Finder doesn&apos;t buy cards or guarantee any sale value.
        </p>

        <RelatedCards
          // growth batch 2 follow-up (2026-09-20): the catalogue render is
          // the majority of card pages and had no printings block - the
          // Shadowless Charizard page listed Base Set unlabelled while the
          // Base Set page listed Shadowless as a printing. Same rule, same
          // relations, no extra query.
          printings={otherPrintings({ set, cardNumber }, relations?.sameSpecies ?? [])}
          sameSpecies={relations?.sameSpecies ?? []}
          sameSet={relations?.sameSet ?? []}
          speciesLink={speciesLink}
          setLink={setHasPage ? { name: set, slug: setSlug } : null}
          className="mt-10"
        />

        <ListingChecks className="mt-6" />

        <div className="mt-10 flex flex-wrap gap-3">
          {speciesLink && (
            <Link
              href={`/pokemon/${speciesLink.slug}`}
              className="rounded-lg border border-zinc-300 bg-white px-3.5 py-2 text-sm font-semibold text-black hover:border-zinc-400 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50 dark:hover:bg-zinc-800"
            >
              All {speciesLink.name} cards &amp; prices →
            </Link>
          )}
          {setHasPage && (
            <Link
              href={`/sets/${setSlug}`}
              className="rounded-lg border border-zinc-300 bg-white px-3.5 py-2 text-sm font-semibold text-black hover:border-zinc-400 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50 dark:hover:bg-zinc-800"
            >
              Browse {set} cards &amp; prices →
            </Link>
          )}
          <Link
            href="/cards"
            className="rounded-lg border border-zinc-300 bg-white px-3.5 py-2 text-sm font-semibold text-black hover:border-zinc-400 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50 dark:hover:bg-zinc-800"
          >
            Browse the card database →
          </Link>
        </div>
      </main>

      <SiteFooter note="Card-to-listing matching is automated and not perfect - always double-check a listing's photos and description before buying." />
    </div>
  );
}
