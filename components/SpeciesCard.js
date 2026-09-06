import Image from "next/image";
import Link from "next/link";
import AffiliateLink from "@/components/AffiliateLink";
import EbaySearchLink from "@/components/EbaySearchLink";
import CardImagePlaceholder from "@/components/CardImagePlaceholder";
import Price from "@/components/Price";
import { MARKETPLACE_CURRENCY, hasPrice } from "@/lib/money";
import { buildEbaySearchLink, wrapEbayAffiliateUrl } from "@/lib/ebay";
import { surfaceForPageName } from "@/lib/affiliateSurfaces";
import { upgradeCatalogImage } from "@/lib/cardImage";
import { cardDisplayName, cardIdentityLine } from "@/lib/cardName";

// One card tile in a catalogue grid - per set (/sets/[slug]), per species
// (/pokemon/[slug] no-deal path) or per sealed hub. Same shell as
// DealCard (image-forward, aspect-square, info + CTA below, hover lift).
//
// EVERY visible card gets TWO distinct, always-useful actions - there is
// no dead tile and no "hunt for yourself in #deals":
//   - image + title  -> the permanent /cards/[slug] page (SEO / details)
//   - shopping CTA:
//       has a verified live deal (card.deal.affiliateUrl is an exact
//         /itm/ URL the deal-quality gate already vouched for)
//         -> "View Deal on eBay" / "Bid on eBay" straight to that exact
//            listing, campid preserved. Never #deals, never /p/, /sch/.
//       no verified live deal
//         -> "Find on eBay": the card-specific, campaign-wrapped search,
//            re-pointed to the visitor's marketplace (EbaySearchLink).
//
// `label` is the grouping name (set / species) used only for click
// tracking; `speciesName` is accepted as its old name.
export default function SpeciesCard({ card, label, speciesName, pageName = "species_card" }) {
  const context = label ?? speciesName;
  // EPN sub-ID attribution - see components/DealCard.js's identical comment.
  const surface = surfaceForPageName(pageName);

  // A card only counts as a DEAL tile when it carries the exact verified
  // /itm/ listing URL. Anything else -> render as a no-deal card (Find on
  // eBay), never a stale "See deal". The identity check runs on the raw
  // stored URL (unaffected by query-param rewriting); the affiliate wrap
  // happens after, at render time.
  const dealUrl =
    typeof card.deal?.affiliateUrl === "string" && /\.ebay\.[^/]+\/itm\/\d+/.test(card.deal.affiliateUrl)
      ? wrapEbayAffiliateUrl(card.deal.affiliateUrl, { surface })
      : null;
  const isDeal = Boolean(dealUrl);

  const cardPageHref = card.hubSlug
    ? `/cards/${card.hubSlug}`
    : card.catalogSlug
      ? `/cards/${card.catalogSlug}`
      : null;

  const name = card.displayName ?? cardDisplayName(card);
  const meta = card.meta ?? cardIdentityLine(card);
  // Sealed product names are self-contained; a card needs its set to
  // disambiguate prints. Prefer the server-built (campaign-wrapped) href.
  const ebayQuery = card.searchQuery ?? `${card.name} ${card.set}`;
  // card.ebayHref may have been pre-built upstream (e.g. buildCatalogueItems,
  // or a sealed-catalogue fetch in lib/deals.js) - possibly without this
  // page's surface, or without any surface at all, since a shared/cached
  // data function doesn't always know which page will render its output.
  // SpeciesCard is the actual presentation-layer CTA boundary and DOES
  // know its real surface (via pageName), so it always re-applies it here
  // - the same idempotent overwrite-only-the-customid-param pattern used
  // everywhere else in this feature - rather than trusting an upstream
  // value to already be correct. No new data fetch, no cache-key change.
  const searchHref = card.ebayHref
    ? wrapEbayAffiliateUrl(card.ebayHref, { surface })
    : buildEbaySearchLink(ebayQuery, undefined, surface);
  const isAuction = card.deal?.listingType === "AUCTION";

  const imageEl = card.image ? (
    <Image
      src={upgradeCatalogImage(card.image)}
      alt={name}
      fill
      sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 20vw"
      quality={85}
      className="object-contain p-3 transition-transform duration-200 group-hover:scale-[1.03]"
    />
  ) : (
    <CardImagePlaceholder />
  );

  return (
    <div
      className={`group flex h-full flex-col overflow-hidden rounded-xl border bg-white shadow-card transition-all duration-200 hover:-translate-y-0.5 hover:shadow-card-hover dark:bg-zinc-950 ${
        isDeal
          ? "border-emerald-500/50 dark:border-emerald-500/40"
          : "border-zinc-200 dark:border-zinc-800"
      }`}
    >
      <div className="relative">
        {isDeal && card.deal.discountPct != null && (
          <span className="absolute right-2 top-2 z-10 rounded-md bg-emerald-600 px-2 py-1 text-sm font-extrabold leading-none text-white shadow-sm">
            −{Math.round(card.deal.discountPct * 100)}%
          </span>
        )}
        <div className="relative block aspect-square w-full bg-gradient-to-b from-zinc-50 to-zinc-100 dark:from-zinc-900 dark:to-zinc-950">
          {cardPageHref ? (
            <Link href={cardPageHref} className="block h-full w-full" aria-label={`${name} — card details`}>
              {imageEl}
            </Link>
          ) : (
            imageEl
          )}
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-1 p-4">
        {cardPageHref ? (
          <Link
            href={cardPageHref}
            className="truncate text-[15px] font-semibold leading-snug text-zinc-900 hover:text-emerald-700 dark:text-zinc-50 dark:hover:text-emerald-500"
          >
            {name}
          </Link>
        ) : (
          <p className="truncate text-[15px] font-semibold leading-snug text-zinc-900 dark:text-zinc-50">
            {name}
          </p>
        )}
        <p className="truncate text-xs text-zinc-500 dark:text-zinc-400">{meta || " "}</p>

        {isDeal ? (
          <>
            <div className="mt-1.5">
              {/* P0 auction-price-integrity: card.deal.cheapest* is the
                  bid + shipping LANDED total, so an auction shows it as
                  "est. total", never as "current bid". The full
                  bid / shipping / total split lives on the deal card and
                  the deal detail page. */}
              {isAuction && (
                <p className="text-[10px] font-medium uppercase tracking-wide text-amber-600 dark:text-amber-500">
                  Est. total
                </p>
              )}
              <Price
                usd={card.deal.cheapestUsd}
                native={{
                  amount: card.deal.cheapestNative,
                  currency: MARKETPLACE_CURRENCY[card.deal.marketplace] ?? "USD",
                }}
                className="tnum text-lg font-bold text-zinc-900 dark:text-zinc-50"
              />
            </div>
            {isAuction ? (
              <p className="tnum text-xs font-semibold text-amber-600 dark:text-amber-500">
                {card.deal.discountPct != null && `${Math.round(card.deal.discountPct * 100)}% under market ref · auction, bids can rise`}
              </p>
            ) : (
              <p className="tnum text-xs font-semibold text-emerald-700 dark:text-emerald-500">
                {card.deal.discountPct != null && `${Math.round(card.deal.discountPct * 100)}% below market · `}
                {card.deal.count} live {card.deal.count === 1 ? "listing" : "listings"}
              </p>
            )}
            <div className="mt-auto flex flex-col gap-1.5 pt-2.5">
              <AffiliateLink
                href={dealUrl}
                eventName={isAuction ? "Bid on eBay" : "View Deal on eBay"}
                eventData={{ context, card: card.name, page: pageName, marketplace: card.deal.marketplace }}
                className="block rounded-lg bg-emerald-600 px-4 py-2 text-center text-sm font-semibold text-white transition-colors hover:bg-emerald-700"
              >
                {isAuction ? "Bid on eBay →" : "View Deal on eBay →"}
              </AffiliateLink>
              {cardPageHref && (
                <Link
                  href={cardPageHref}
                  className="block text-center text-xs font-medium text-zinc-500 hover:text-emerald-700 dark:text-zinc-400 dark:hover:text-emerald-500"
                >
                  View card
                </Link>
              )}
            </div>
          </>
        ) : (
          <>
            <div className="mt-1.5">
              {hasPrice(card.refPrice) ? (
                <Price
                  usd={card.refPrice}
                  native={{ amount: card.refPrice, currency: "USD" }}
                  approxPrefix=""
                  className="tnum text-lg font-bold text-zinc-900 dark:text-zinc-50"
                />
              ) : (
                <span className="text-sm text-zinc-400">Price unavailable</span>
              )}
            </div>
            <p className="text-[11px] text-zinc-400">
              {hasPrice(card.refPrice) ? "Reference price · " : ""}PokemonPriceTracker
            </p>
            <div className="mt-auto flex flex-col gap-1.5 pt-2.5">
              <EbaySearchLink
                href={searchHref}
                event={{ context, card: card.name, page: pageName, cta: "find_on_ebay" }}
                className="block rounded-lg border border-zinc-300 px-4 py-2 text-center text-sm font-semibold text-zinc-700 transition-colors hover:border-zinc-400 hover:text-black dark:border-zinc-700 dark:text-zinc-200 dark:hover:text-zinc-50"
              >
                Find on eBay →
              </EbaySearchLink>
              {cardPageHref && (
                <Link
                  href={cardPageHref}
                  className="block text-center text-xs font-medium text-zinc-500 hover:text-emerald-700 dark:text-zinc-400 dark:hover:text-emerald-500"
                >
                  View card
                </Link>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
