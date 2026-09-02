import Image from "next/image";
import Link from "next/link";
import { slugifySet } from "@/lib/slugify";
import { hasPrice } from "@/lib/money";
import { upgradeCatalogImage } from "@/lib/cardImage";
import { cardSpeciesLink } from "@/lib/cardLinks";
import { buildTcgplayerLink } from "@/lib/tcgplayer";
import { cardDisplayName } from "@/lib/cardName";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import Breadcrumbs from "@/components/Breadcrumbs";
import CardImagePlaceholder from "@/components/CardImagePlaceholder";
import Price from "@/components/Price";
import CardPriceSummary from "@/components/CardPriceSummary";
import CardPriceIntelligence from "@/components/CardPriceIntelligence";
import VariantPriceGrid from "@/components/VariantPriceGrid";
import PriceHistoryChart from "@/components/PriceHistoryChart";
import RecentSales from "@/components/RecentSales";
import AffiliateLink from "@/components/AffiliateLink";
import ListingChecks from "@/components/ListingChecks";
import RelatedCards from "@/components/RelatedCards";
import RecordCardView from "@/components/RecordCardView";

const SITE_URL = "https://pokemondealfinder.com";

// The catalog-backed /cards/[slug] render: a real card that currently has
// NO live eBay deal. Identity + market reference pricing + variant/graded
// analysis + a TCGPlayer CTA. It carries BreadcrumbList schema only -
// deliberately NO Product/Offer/AggregateRating, because there are no
// offers and no reviews to describe. When a live deal appears for this
// card, resolveCardSlug (the deal hub) takes over the same URL and the
// full deal-hub template (Product/Offer schema, listings grid) renders
// instead - see app/cards/[slug]/page.js.
export default function CatalogCardView({ card, analysis, priceHistory = null, setHasPage, relations = null }) {
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
  const tcgplayerLink = buildTcgplayerLink(name, card.tcgplayerId);
  // Phase 11C: canonical merged price_history spine (not a provider
  // history call). Bounded + downsampled server-side.
  const chartPoints = priceHistory?.chartPoints ?? [];
  const canonRaw = analysis?.raw
    ? {
        ...analysis.raw,
        history: chartPoints,
        minPrice: chartPoints.length ? Math.min(...chartPoints.map((p) => p.p)) : null,
        maxPrice: chartPoints.length ? Math.max(...chartPoints.map((p) => p.p)) : null,
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
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }} />
      <RecordCardView card={cardDescriptor} />
      <SiteHeader />

      <div className="mx-auto max-w-5xl px-6 py-10">
        <Breadcrumbs
          items={[
            { name: "Deals", href: "/" },
            { name: "Cards", href: "/cards" },
            { name: set, href: setHasPage ? `/sets/${setSlug}` : undefined },
            { name },
          ]}
        />

        <div className="mt-4 flex flex-col gap-6 rounded-xl border border-zinc-200 bg-white p-6 shadow-card sm:flex-row dark:border-zinc-800 dark:bg-zinc-950">
          <div className="relative aspect-[63/88] w-44 shrink-0 self-center overflow-hidden rounded-lg bg-zinc-50 sm:w-64 sm:self-auto dark:bg-zinc-900">
            {image ? (
              <Image
                src={upgradeCatalogImage(image)}
                alt={`${name} - ${set}`}
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
              No live eBay deals right now
            </span>
            <h1 className="mt-3 text-xl font-bold text-black dark:text-zinc-50">
              {name} — {set} Price &amp; Value
            </h1>
            <p className="mt-1 flex flex-wrap items-center gap-x-2 text-sm text-zinc-500">
              {setHasPage ? (
                <Link href={`/sets/${setSlug}`} className="hover:text-red-600 hover:underline dark:hover:text-red-500">
                  {set}
                </Link>
              ) : (
                <span>{set}</span>
              )}
              {cardNumber && <span className="text-zinc-400">· {cardNumber}</span>}
              {rarity && <span className="text-zinc-400">· {rarity}</span>}
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
          </div>
        </div>

        {/* Live PPT analysis first. If it has no showable number, fall back
            to the daily-synced card_catalog figure ONLY when the analysis
            fetch itself failed (analysis == null) - never to paper over a
            price the analysis deliberately rejected. Otherwise say so. */}
        {analysisHasPrice ? (
          <>
            <CardPriceSummary analysis={analysis} offersCount={0} listingsLowUsd={null} />
            <CardPriceIntelligence
              marketValueUsd={analysis?.raw?.currentPrice ?? null}
              trends={priceHistory?.trends ?? null}
              signal={priceHistory?.signal ?? null}
              coverage={priceHistory?.coverage ?? null}
              cheapestListingUsd={null}
              offersCount={0}
            />
          </>
        ) : analysis == null && refPrice != null ? (
          <section className="mt-6 rounded-xl border border-zinc-200 bg-white p-6 shadow-card dark:border-zinc-800 dark:bg-zinc-950">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-400">Price &amp; value</h2>
            <div className="mt-3">
              <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Market reference · raw</p>
              <p className="text-3xl font-bold text-black dark:text-zinc-50">
                <Price usd={refPrice} native={{ amount: refPrice, currency: "USD" }} approxPrefix="" />
              </p>
              <p className="mt-1 text-xs text-zinc-400">
                Reference price from PokemonPriceTracker, based on recent sold data —{" "}
                <Link href="/methodology" className="hover:text-red-600 hover:underline dark:hover:text-red-500">
                  how we work this out
                </Link>
                .
              </p>
            </div>
          </section>
        ) : (
          <section className="mt-6 rounded-xl border border-zinc-200 bg-white p-6 shadow-card dark:border-zinc-800 dark:bg-zinc-950">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-400">Price &amp; value</h2>
            <div className="mt-3">
              <p className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">Market price unavailable</p>
              <p className="mt-1 text-xs text-zinc-400">
                We don&apos;t have a reliable recent-sold reference for this exact printing right now. Rather
                than show a figure we can&apos;t stand behind, we show none —{" "}
                <Link href="/methodology" className="hover:text-red-600 hover:underline dark:hover:text-red-500">
                  how we work this out
                </Link>
                .
              </p>
            </div>
          </section>
        )}

        <p className="mt-6 rounded-lg border border-zinc-200 bg-white p-4 text-sm text-zinc-500 dark:border-zinc-800 dark:bg-zinc-950">
          No active below-market eBay listing for this exact card right now. The prices above are real
          recent-sold references, not live listings. Check back after the next scan, or use the
          TCGPlayer link.
        </p>

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

        {hasAnalysis && (
          <div className="mt-6 rounded-xl border border-zinc-200 bg-white p-6 shadow-card dark:border-zinc-800 dark:bg-zinc-950">
            <h2 className="text-sm font-semibold text-black dark:text-zinc-50">Every variant, side by side</h2>
            <p className="text-xs text-zinc-400">Raw and every graded tier with real recorded sales.</p>
            <div className="mt-4">
              <VariantPriceGrid raw={canonRaw} graded={analysis.graded} cardName={name} />
            </div>
          </div>
        )}

        <RecentSales
          sales={analysis?.primaryRecentSales}
          cardName={name}
          page="card_recent_sales"
          variant={analysis?.primaryKey === "raw" ? "raw" : null}
          className="mt-6"
        />

        <p className="mt-6 text-xs leading-relaxed text-zinc-400">
          Market-reference prices are a guide based on recent sold data, not a guaranteed sale value —
          the real figure depends on the exact printing, condition and grade, and marketplace prices
          move. Pokemon Deal Finder doesn&apos;t buy cards or guarantee any sale value.
        </p>

        <RelatedCards
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
      </div>

      <SiteFooter note="Card-to-listing matching is automated and not perfect - always double-check a listing's photos and description before buying." />
    </div>
  );
}
