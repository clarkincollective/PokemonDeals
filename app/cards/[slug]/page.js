import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { resolveCardSlug, resolveCatalogCard, resolveCatalogCardById, fetchCardOffers, fetchCardRelations, fetchSetSlugs, fetchCardPriceHistory, fetchSets, fetchSpeciesHubs } from "@/lib/deals";
import { cardWorthAnswer, isUsableUsdPrice } from "@/lib/cardWorth";
import { cardSummaryOffer } from "@/lib/cardSummaryOffer";
import { cardNextSteps } from "@/lib/cardNextSteps";
import CardWorthAnswer from "@/components/CardWorthAnswer";
import CardNextSteps from "@/components/CardNextSteps";
import { catalogCardTitle, catalogCardHeading, catalogCardIdentity } from "@/lib/cardSlug";
import { cardDisplayName, collectorNumberFromName } from "@/lib/cardName";
import { propertyValue, serializeJsonLd } from "@/lib/jsonLd";
import { storedReferenceEvidence } from "@/lib/dealQuality";
import { otherPrintings } from "@/lib/cardPrintings";
import { catalogImageUrl } from "@/lib/cardImage";
import { trustedDealImageUrl } from "@/lib/listingImage";
import { cardSpeciesLink } from "@/lib/cardLinks";
import { slugifySet } from "@/lib/slugify";
import { buildTcgplayerLink } from "@/lib/tcgplayer";
import { wrapEbayAffiliateUrl, buildEbaySearchLink } from "@/lib/ebayLinks";
import { buildCardSearchQuery } from "@/lib/cardSearchQuery";
import SiteHeader from "@/components/SiteHeader";
import SkipToContent from "@/components/SkipToContent";
import CardDealFilters from "@/components/CardDealFilters";
import { currencyForDeal, auctionDisplayParts, dealTotalUsd, hasPrice } from "@/lib/money";
import PriceHistoryChart from "@/components/PriceHistoryChart";
import CardMarketPanel, { CardMarketSummary } from "@/components/CardMarketPanel";
import CardPriceIntelligence from "@/components/CardPriceIntelligence";
import CardImagePlaceholder from "@/components/CardImagePlaceholder";
import AffiliateLink from "@/components/AffiliateLink";
import Breadcrumbs from "@/components/Breadcrumbs";
import CatalogCardView from "@/components/CatalogCardView";
import { offerShipping } from "@/lib/offerPresentation";
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

export const revalidate = 3600;

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
// audit-r1: the provider market analysis is no longer loaded here. The
// page renders from the catalogue reference (resolveCatalogCardById) and
// components/CardMarketPanel fetches lib/cardPriceAnalysis through
// /api/card-analysis after the page has rendered - so a cold render, and a
// crawler's render in particular, makes no PokemonPriceTracker call.

export async function generateMetadata({ params }) {
  const { slug } = await params;
  const hub = await resolveCardSlug(slug);
  if (!hub) {
    // No live-deal hub - fall back to the stable card_catalog record.
    const card = await resolveCatalogCard(slug);
    if (!card) {
      const title = "Card not found";
      const description = "This card page is not available. Browse the card catalogue to find another card.";
      return {
        title,
        description,
        robots: { index: false, follow: true },
        openGraph: { title, description, images: [] },
        twitter: { card: "summary", title, description, images: [] },
      };
    }
    const dn = card.displayName ?? cardDisplayName(card);
    // Precedence: structured card_catalog.card_number, then a number
    // embedded in the name (near-zero here - card_catalog is ~99% numbered).
    const catNumber = card.cardNumber ?? collectorNumberFromName(card.name);
    const title = catalogCardTitle(dn, card.set, catNumber);
    // SEO-1.1 P6: the same identity helper as the title above, so a name
    // that already embeds its collector number does not get it a second
    // time. The number now lives in the identity, so `idBits` carries only
    // the rarity - it was the other half of the same duplication.
    const identity = catalogCardIdentity(dn, catNumber);
    const idBits = [card.rarity].filter(Boolean).join(", ");
    const description = card.refPrice != null
      ? `${identity} (${card.set}) Pokemon card price & value${idBits ? ` — ${idBits}` : ""}. Raw market reference (labelled by its real condition) and condition-by-condition prices from real recent sold data, plus a TCGPlayer link.`
      : `${identity} (${card.set}) Pokemon card${idBits ? ` — ${idBits}` : ""}. Identity, image and a TCGPlayer link. Market price currently unavailable.`;
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
  const image = catalogImageUrl(hub.tcgplayerId) ?? trustedDealImageUrl(offers[0]) ?? undefined;

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
  // number from the catalogue record (audit-r1: no provider call here; the
  // page component reads the same cached row).
  const catalog = await resolveCatalogCardById(hub.tcgplayerId);
  const hubName = cardDisplayName(hub);
  const hubNumber = catalog?.cardNumber ?? collectorNumberFromName(hub.name);
  const title = catalogCardTitle(hubName, hub.set, hubNumber);
  // SEO-1.1 P6: catalogCardIdentity, NOT `name + " #" + number`. Some
  // catalogue and watchlist names already carry the collector number
  // ("Riolu - 61/130"), and appending it again produced descriptions like
  // "Riolu - 61/130 #061/130 (Countdown Calendar Promos)". The identity
  // helper strips an embedded number - tolerating leading zeroes and the
  // numerator-only form - and re-attaches it exactly once, which is the
  // same function the <title> on the line above and the H1 already use.
  // SEO audit 2026-09-20: ~150 chars - identity first, then what the page holds
  const description = `${catalogCardIdentity(hubName, hubNumber)} (${hub.set}) price & value: market reference by condition, graded tiers where recorded, and live eBay listings cheapest first.`;

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
    const catalogSpecies = cardSpeciesLink({ name: card.name, cardType: card.cardType, species: card.species });
    const [validSetSlugs, relations, priceHistory, { species: speciesHubs }, { sets: liveSets }] = await Promise.all([
      fetchSetSlugs("english"),
      fetchCardRelations(slug, card.name, card.set, card.species),
      fetchCardPriceHistory(card.tcgplayerId),
      // Phase 17B next-step counts: real active-listing aggregates (the
      // same cached snapshot the species / set pages use). A species or
      // set under its listing threshold simply has no entry -> no count.
      fetchSpeciesHubs({ language: "english" }),
      fetchSets({ language: "english" }),
    ]);
    const setSlugHere = slugifySet(card.set);
    return (
      <CatalogCardView
        card={card}
        priceHistory={priceHistory}
        setHasPage={validSetSlugs.includes(setSlugHere)}
        relations={relations}
        speciesLiveCount={catalogSpecies ? (speciesHubs ?? []).find((s) => s.slug === catalogSpecies.slug)?.count ?? null : null}
        setLiveCount={(liveSets ?? []).find((s) => s.slug === setSlugHere)?.count ?? null}
        alertsEnabled={emailEnabled()}
        // FINDING 8: was `${displayName} ${set}` - the collector number was
        // dropped unless it happened to be inside the display name, so two
        // cards of the same name in the same set could not be separated.
        ebaySearchHref={buildEbaySearchLink(
          buildCardSearchQuery({
            name: card.displayName ?? cardDisplayName(card),
            set: card.set,
            cardNumber: card.cardNumber ?? card.card_number ?? null,
            language: card.language ?? null,
          }),
          undefined,
          { page: "card", placement: "search" }
        )}
        nowMs={Date.now()}
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
  const [{ deals: offers, error }, catalog, relations, validSetSlugs, priceHistory, { species: speciesHubs }, { sets: liveSets }] =
    await Promise.all([
      fetchCardOffers(hub.id),
      resolveCatalogCardById(hub.tcgplayerId),
      fetchCardRelations(slug, hub.name, hub.set, null),
      fetchSetSlugs("english"),
      fetchCardPriceHistory(hub.tcgplayerId),
      fetchSpeciesHubs({ language: "english" }),
      fetchSets({ language: "english" }),
    ]);
  const allOffers = offers;
  // Collector number + rarity for the visible identity line (Phase 8A /
  // §13). The live-deal hub object carries only name + set, so take the
  // structured values from the price-analysis record (same provider call
  // already made, no extra request), falling back to a number embedded in
  // the watchlist name.
  const cardCollectorNumber = catalog?.cardNumber ?? collectorNumberFromName(hub.name);
  const cardRarity = catalog?.rarity ?? null;
  // Trusted canonical artwork for this exact product - see generateMetadata.
  const canonicalImage = catalogImageUrl(hub.tcgplayerId);
  // P0 deal-image-integrity: the permanent card hero is the canonical
  // exact-printing art. Only when there is NO canonical do we borrow a
  // seller photo - and then via the trusted-image contract, so it can
  // never be a card-back listing photo.
  const heroImage = canonicalImage ?? trustedDealImageUrl(allOffers[0]) ?? null;

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
  // Cheapest live listing, normalised to the USD value every offer carries,
  // TOGETHER with what that figure is (delivered / before shipping /
  // unrecorded), whether it is an auction bid, and whether this listing may
  // claim a saving at all. Audit finding 2: the summaries used to receive
  // only the bare number and re-derive a savings claim from it against the
  // raw catalogue reference, contradicting the tile below - see
  // lib/cardSummaryOffer for the measurement and the rule.
  const summaryOffer = cardSummaryOffer(offers);
  const rangeLowUsd = summaryOffer?.lowUsd ?? null;

  // Phase 11C: the chart + variant sparkline read the canonical merged
  // price_history spine (first-party 'catalog' forward + 'ppt_backfill'
  // prefix, WOTC = first-party only), NOT a per-request provider history
  // call. Already downsampled + bounded server-side (fetchCardPriceHistory).
  const chartPoints = priceHistory?.chartPoints ?? [];
  // Price-condition provenance: the tile's range covers only VERIFIED
  // history comparable to the latest recorded reference (null until such
  // history exists) - never the whole series, whose older points may be
  // for an unrecorded or different condition / printing.
  const tcgplayerLink = buildTcgplayerLink(hub.name, hub.tcgplayerId, { page: "card", placement: "reference" });

  // Phase 17B - the "How much is <card> worth?" answer: the SAME raw Near
  // Mint figure CardPriceSummary shows (analysis.raw.currentPrice) and the
  // real live-listing count / cheapest asking price already on this page.
  // the daily-synced catalogue reference, labelled by its real condition
  const hubRaw = catalog?.refPrice;
  const worth = cardWorthAnswer({
    name: cardName,
    set: hub.set,
    cardNumber: cardCollectorNumber,
    rarity: cardRarity,
    marketUsd: isUsableUsdPrice(hubRaw) ? Number(hubRaw) : null,
    priceSource: "catalog",
    priceUpdatedAt: catalog?.syncedAt ?? null,
    // Price-condition provenance: the condition the figure is really for.
    referenceCondition: catalog?.refCondition ?? null,
    // an "Unlimited" reference printing exists only where a 1st Edition
    // printing does too, so that figure excludes 1st Edition copies
    firstEditionExcluded: /unlimited/i.test(catalog?.refPrinting ?? ""),
    // graded tiers load with the market panel, after the answer renders
    gradedAvailable: false,
    // The floor carries its own basis: a total that includes a recorded
    // shipping charge, an item price with shipping unconfirmed, or a figure
    // whose breakdown was never recorded - plus whether the cheapest
    // listing is an auction, whose figure is a current bid.
    liveListings: {
      count: offers.length,
      lowUsd: rangeLowUsd,
      lowBasis: summaryOffer?.priceBasis ?? null,
      lowIsAuction: Boolean(summaryOffer?.isAuction),
    },
    nowMs: Date.now(),
  });
  const exploreLinks = cardNextSteps({
    species: speciesLink,
    speciesLive: speciesLink ? (speciesHubs ?? []).find((s) => s.slug === speciesLink.slug)?.count ?? null : null,
    set: setHasPage ? { name: hub.set, slug: setSlug } : null,
    setLive: (liveSets ?? []).find((s) => s.slug === setSlug)?.count ?? null,
    marketUsd: isUsableUsdPrice(hubRaw) ? Number(hubRaw) : null,
    setName: hub.set,
  });

  // Minimal descriptor for the viewer's local "recently viewed" / "saved"
  // lists (lib/recentCards) - enough to render a tile and link back here.
  const cardDescriptor = {
    slug,
    name: cardName,
    set: hub.set,
    image: heroImage,
    price: allOffers[0]?.total_price ?? null,
    currency: allOffers[0] ? currencyForDeal(allOffers[0]) : null,
  };

  // Match the price/currency shown by the offer controls. An auction without
  // a usable bid or a row without a positive price cannot support a priced Offer.
  // Structured-data brief 2026-09-20: one Offer per live FIXED-PRICE
  // listing (an auction's current bid is not a stable offer price), each
  // pointing at the listing's own page on this site - never an eBay or
  // affiliate URL - with the ITEM price excluding shipping in the listing's
  // own currency. Listings across marketplaces carry different currencies,
  // which is why this stays an array of Offers rather than one
  // AggregateOffer (that needs a single priceCurrency). The item figure is
  // visible on each row's card ("incl. … shipping · item …") and on the
  // listing page itself.
  const schemaOffers = allOffers.flatMap((deal) => {
    if (deal.listing_type === "AUCTION") return [];
    if (!hasPrice(deal.total_price) || !hasPrice(deal.price)) return [];
    return [{
      "@type": "Offer",
      url: `${SITE_URL}/deals/${deal.id}`,
      priceCurrency: currencyForDeal(deal),
      price: Number(deal.price).toFixed(2),
      availability: "https://schema.org/InStock",
      itemCondition: "https://schema.org/UsedCondition",
    }];
  });
  // GEO audit 2026-09-19 - the card is an ENTITY whether or not it has
  // live offers: set, collector number, rarity, the catalogue market
  // reference (labelled by the condition it is really for) and the date it
  // was recorded, as machine-readable properties; offers as an
  // AggregateOffer when there are several. No rating, no review, nothing
  // the page does not itself state.
  const refUsd = isUsableUsdPrice(hubRaw) ? Number(hubRaw) : null;
  const refCondition = catalog?.refCondition ?? null;
  // Graded references already STORED on this card's live graded listings
  // (the grade-specific reference each was compared with, lib/dealQuality
  // storedReferenceEvidence kind "graded") - no provider call. One entry
  // per grader+grade, the most recently checked listing's figure. Answers
  // "how much is a PSA 10 <card> worth" from data the page already loads.
  const gradedRefs = [...allOffers]
    .filter((d) => d.is_graded && storedReferenceEvidence(d)?.kind === "graded" && isUsableUsdPrice(d.market_price))
    .sort((a, b) => Date.parse(b.last_seen_at ?? 0) - Date.parse(a.last_seen_at ?? 0))
    .reduce((acc, d) => {
      const key = `${String(d.grader).toUpperCase()} ${d.grade}`;
      if (!acc.some((x) => x.key === key)) acc.push({ key, usd: Number(d.market_price), checkedAt: d.last_seen_at ?? null });
      return acc;
    }, [])
    .sort((a, b) => Number(b.key.split(" ")[1]) - Number(a.key.split(" ")[1]));
  const refRecorded = catalog?.syncedAt ? new Date(catalog.syncedAt).toISOString().slice(0, 10) : null;
  const offerUsdTotals = allOffers.map((d) => dealTotalUsd(d)).filter((v) => Number.isFinite(v) && v > 0);
  // Audit finding 2: these two properties were named "Lowest/Highest live
  // total" unconditionally, but dealTotalUsd only includes a shipping charge
  // where one was actually RECORDED (lib/offerPresentation) - so on most
  // cards the figure is an item price, and "total" implied a delivered cost
  // nothing here established. Named for what it really is, and the basis is
  // stated in the property's own description either way.
  const rangeAllDelivered =
    allOffers.length > 0 && allOffers.every((d) => offerShipping(d).savingClaim === "delivered");
  const rangeLabel = rangeAllDelivered ? "live total" : "live listing price";
  const rangeDescription = rangeAllDelivered
    ? "Item price plus the shipping charge recorded for every listing on this page; a landed total."
    : "Item price. Shipping is not recorded for every listing on this page, so this is not a delivered cost.";
  const productJsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    "@id": `${SITE_URL}/cards/${slug}#product`,
    // the shared display identity (card-name rule 13); number + rarity
    // are additionalProperty entries below
    name: `${cardName} - ${hub.set}`,
    sku: hub.tcgplayerId ? `tcgplayer:${hub.tcgplayerId}` : undefined,
    mpn: cardCollectorNumber ?? undefined,
    image: heroImage ?? undefined,
    description: [
      // catalogCardIdentity: the number is added once - a stored name that
      // already embeds it ("Galarian Meowth - 141/128") is not doubled
      `${catalogCardIdentity(cardName, cardCollectorNumber)} from ${hub.set}.`,
      refUsd != null
        // ISO form, not "$" - the worth answer is the page's ONE visible
        // statement of the figure (R3 card summary); this is entity text
        ? `Market reference ${refUsd.toFixed(2)} USD${refCondition ? ` for ${refCondition}` : ""}${refRecorded ? `, recorded ${refRecorded}` : ""}.`
        : "No trustworthy raw market reference is currently held for this printing.",
      `${allOffers.length} live eBay ${allOffers.length === 1 ? "listing" : "listings"} on this page.`,
    ].join(" "),
    brand: { "@type": "Brand", name: "Pokemon" },
    category: "Pokemon Trading Card Game > Single cards",
    additionalProperty: [
      propertyValue("Set", hub.set),
      propertyValue("Collector number", cardCollectorNumber),
      propertyValue("Rarity", cardRarity),
      refUsd != null
        ? propertyValue(`Market reference${refCondition ? ` (${refCondition})` : ""}`, refUsd.toFixed(2), { unitCode: "USD", description: "Recent sold data for this printing and condition; a reference, not a guaranteed sale price" })
        : null,
      propertyValue("Reference recorded", refRecorded),
      ...gradedRefs.map((g) => propertyValue(`Graded market reference (${g.key})`, g.usd.toFixed(2), { unitCode: "USD", description: "Grade-specific reference stored on a live graded listing of this card; a reference, not a guaranteed sale price" })),
    ].filter(Boolean),
    // R3 card-offer contract: `offers` is the array of PRICED live listings
    // (an auction without a usable bid is never promoted as a priced offer),
    // and the Product is emitted only when at least one exists - see the
    // gate below. The offer count and USD range ride as properties instead
    // of an AggregateOffer wrapper, so that contract stays intact.
    offers: schemaOffers,
  };
  if (offerUsdTotals.length) {
    productJsonLd.additionalProperty.push(
      propertyValue("Live listings", schemaOffers.length),
      propertyValue(`Lowest ${rangeLabel}`, Math.min(...offerUsdTotals).toFixed(2), { unitCode: "USD", description: rangeDescription }),
      propertyValue(`Highest ${rangeLabel}`, Math.max(...offerUsdTotals).toFixed(2), { unitCode: "USD", description: rangeDescription })
    );
  }

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
      {/* R3: a card with no PRICED live offer is not promoted as a product
          with offers - the worth answer above is its entity statement. */}
      {schemaOffers.length > 0 && (
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(productJsonLd) }} />
      )}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(breadcrumbJsonLd) }} />
      <RecordCardView card={cardDescriptor} />
      <DetailViewAnalytics kind="card" contentId={slug} />
      <SkipToContent />
      <SiteHeader />

      <main id="main-content" tabIndex={-1} className="mx-auto max-w-5xl scroll-mt-24 px-6 py-6">
        <Breadcrumbs
          items={[
            { name: "Deals", href: "/" },
            { name: "Cards", href: "/cards" },
            { name: hub.set, href: setHasPage ? `/sets/${setSlug}` : undefined },
            { name: cardName },
          ]}
        />

        <div className="mt-4 flex flex-col gap-4 rounded-xl border border-zinc-200 bg-white p-4 sm:gap-6 sm:p-6 sm:flex-row dark:border-zinc-800 dark:bg-zinc-950">
          <div className="relative aspect-[63/88] w-28 shrink-0 self-center overflow-hidden rounded-lg bg-zinc-50 sm:w-48 sm:self-auto dark:bg-zinc-900">
            {heroImage ? (
              <Image
                src={heroImage}
                alt={`${cardName} - ${hub.set}`}
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
              {offers.length} active {offers.length === 1 ? "listing" : "listings"}
            </span>
            {/* SEO-2: the H1 carries the same identity as the <title>
                (lib/cardSlug catalogCardIdentity) - collector number
                exactly once, in one canonical position. */}
            <h1 className="mt-3 text-xl font-bold text-black dark:text-zinc-50">
              {catalogCardHeading(cardName, hub.set, cardCollectorNumber)}
            </h1>
            <p className="mt-1 flex flex-wrap items-center gap-x-2 text-sm text-zinc-500 dark:text-zinc-400">
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
              {cardCollectorNumber && <span className="text-zinc-600 dark:text-zinc-400">· {cardCollectorNumber}</span>}
              {cardRarity && <span className="text-zinc-600 dark:text-zinc-400">· {cardRarity}</span>}
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
              {/* Graded worth, from the grade-specific references stored on
                  this card's live graded listings - the "how much is a PSA 10
                  <card> worth" answer, without a provider call. Labelled as a
                  reference; the raw figure above stays the page's one raw
                  statement (R3). */}
              {gradedRefs.length > 0 && (
                <p className="mt-2 text-sm leading-relaxed text-zinc-700 dark:text-zinc-300" data-worth-graded={gradedRefs.length}>
                  Graded copies: {gradedRefs.map((g, i) => (
                    <span key={g.key}>
                      {i > 0 ? " · " : ""}
                      <strong className="text-black dark:text-zinc-50">{g.key}</strong>{" "}
                      <span className="tnum">{g.usd.toFixed(2)} USD</span>
                    </span>
                  ))}
                  {" "}— grade-specific references recorded against live graded listings of this card
                  {gradedRefs[0]?.checkedAt ? ` (last checked ${new Date(gradedRefs[0].checkedAt).toISOString().slice(0, 10)})` : ""}
                  ; references, not sale prices.
                </p>
              )}

              <div className="mt-5 flex flex-wrap items-center gap-3">
                {allOffers.length > 0 && (
                  <a href="#card-offers" className="inline-flex min-h-[48px] items-center justify-center rounded-lg bg-red-600 px-5 py-3 text-sm font-semibold text-white hover:bg-red-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600">
                    View {allOffers.length} {allOffers.length === 1 ? "offer" : "offers"}
                  </a>
                )}
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
                  // §6: anchored so /saved, the filtered empty state and the
                  // expired-deal page can send a visitor straight here
                  <div id="price-alert" className="scroll-mt-24">
                    <PriceAlertForm
                      cardSlug={slug}
                      cardName={hub.name}
                      // audit-r1: without a live offer, suggest 10% under the catalogue reference
                      suggestedPrice={cheapest ? (cheapest.total_price_usd ?? cheapest.total_price) : isUsableUsdPrice(hubRaw) ? Math.round(Number(hubRaw) * 0.9 * 100) / 100 : null}
                    />
                  </div>
                )}
              </div>
            </CardWorthAnswer>
          </div>
        </div>

        <CardMarketSummary tcgplayerId={hub.tcgplayerId} />

        <CardPriceIntelligence
          detailsOnly
          marketValueUsd={hubRaw ?? null}
          referenceCondition={catalog?.refCondition ?? null}
          trends={priceHistory?.trends ?? null}
          signal={priceHistory?.signal ?? null}
          coverage={priceHistory?.coverage ?? null}
          summaryOffer={summaryOffer}
          offersCount={offers.length}
        />

        {/* 13B.4.2 - the live-listings area. Structured deal filters
            (type / grader / grade / price / listing / country / sort) are
            client-driven off the URL; the card identity above is never
            affected. Provider-free (Supabase). */}
        <div id="card-offers" className="scroll-mt-24">
          <CardDealFilters
            slug={slug}
            initial={allOffers}
            validSetSlugs={validSetSlugs}
            featuredCount={FEATURED_OFFER_COUNT}
            totalActive={allOffers.length}
            alertsEnabled={emailEnabled()}
          />
        </div>

        {chartPoints.length >= 2 && (
          <div className="mt-6 rounded-xl border border-zinc-200 bg-white p-6 shadow-card dark:border-zinc-800 dark:bg-zinc-950">
            <h2 className="text-sm font-semibold text-black dark:text-zinc-50">Market price history</h2>
            <p className="text-xs text-zinc-600 dark:text-zinc-400">
              Our first-party daily snapshots joined to reference history. Reference prices are recorded in
              USD (shown ≈ in your currency); the legend below the chart names the condition and printing
              each verified point was recorded for. Historical data availability varies by card.
            </p>
            <div className="mt-4">
              <PriceHistoryChart points={chartPoints} />
            </div>
          </div>
        )}

        <CardMarketPanel
          tcgplayerId={hub.tcgplayerId}
          cardName={cardName}
          gridName={hub.name}
          set={hub.set}
          language={hub.language ?? null}
          chartPoints={chartPoints}
          comparableRange={priceHistory?.comparableRange ?? null}
        />

        <p className="mt-6 text-xs leading-relaxed text-zinc-600 dark:text-zinc-400">
          Market-reference prices are a guide based on recent sold data, not a guaranteed sale value —
          the real figure depends on the exact printing, condition and grade, and marketplace prices
          move. Pokemon Deal Finder doesn&apos;t buy cards or guarantee any sale value.
        </p>

        {error && (
          <p className="mt-6 rounded-lg bg-danger/10 p-4 text-danger">Couldn&apos;t load listings: {error}</p>
        )}

        <RelatedCards
          // growth batch 2: the same card's other printings, from the
          // relations already loaded - no extra query
          printings={otherPrintings({ set: hub.set, cardNumber: cardCollectorNumber }, sameSpecies)}
          sameSpecies={sameSpecies}
          sameSet={sameSet}
          speciesLink={speciesLink}
          setLink={setHasPage ? { name: hub.set, slug: setSlug } : null}
          className="mt-10"
        />

        <CardNextSteps variant="explore" links={exploreLinks} className="mt-10" />

        <ListingChecks className="mt-8" />

        <div className="mt-8 flex justify-center">
          <Link
            href="/deals"
            className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-300 bg-white px-3.5 py-2 text-sm font-semibold text-black transition-colors hover:border-zinc-400 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50 dark:hover:bg-zinc-800"
          >
            ← Browse all deals
          </Link>
        </div>
      </main>

      {cheapest &&
        (() => {
          // P0 auction-price-integrity: for an auction the sticky-bar
          // figure is the current bid when recorded; otherwise the
          // stored total is explicitly labelled as a recorded auction price.
          const isAuc = cheapest.listing_type === "AUCTION";
          const parts = isAuc ? auctionDisplayParts(cheapest) : null;
          const shipping = offerShipping(cheapest);
          return (
            <StickyDealCta
              href={wrapEbayAffiliateUrl(cheapest.affiliate_url, { page: "card", placement: "offer" })}
              priceUsd={parts ? parts.bid.usd : dealTotalUsd(cheapest)}
              priceNative={
                parts
                  ? { amount: parts.bid.native, currency: parts.currency }
                  : { amount: Number(cheapest.total_price), currency: currencyForDeal(cheapest) }
              }
              priceLabel={isAuc ? (parts ? "Current bid" : "Recorded auction price") : shipping.headline}
              priceNote={shipping.note ?? (isAuc && parts ? "Plus shipping" : "Includes recorded shipping")}
              ctaLabel={isAuc ? "View auction on eBay" : "View listing on eBay"}
              eventData={{ card: hub.name, marketplace: cheapest.marketplace, page: "card_hub" }}
            />
          );
        })()}

      <SiteFooter note="Card-to-listing matching is automated and not perfect - always double-check a listing's photos and description before buying." />

      {/* 13B.7.2 - reserved strip BELOW the footer so the fixed mobile
          CTA (including wrapped shipping notes) never covers the footer nav / affiliate disclosure
          when scrolled to the bottom. */}
      {cheapest && <div className="h-32 lg:hidden" aria-hidden="true" />}
    </div>
  );
}
