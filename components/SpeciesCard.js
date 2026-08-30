import Image from "next/image";
import Link from "next/link";
import AffiliateLink from "@/components/AffiliateLink";
import CardImagePlaceholder from "@/components/CardImagePlaceholder";
import Price from "@/components/Price";
import { MARKETPLACE_CURRENCY, hasPrice } from "@/lib/money";
import { buildEbaySearchLink } from "@/lib/ebay";

// One card tile in the per-species grid. Same shell as DealCard
// (image-forward, aspect-square, info + CTA below, hover lift) so the
// species pages read as the same design system.
//
// Two variants, kept visibly distinct:
//   card.deal != null -> emerald accent, "-N%" badge, "N% below market",
//     live-listing count, "See deal ->" to the listings.
//   card.deal == null -> plain: the PokemonPriceTracker reference price
//     + attribution + a neutral "View on eBay" affiliate CTA. No discount
//     badge, no "below market", no green.
export default function SpeciesCard({ card, speciesName, dealsHref = "#deals", pageName = "species_card" }) {
  const isDeal = Boolean(card.deal);
  const meta = [card.set, card.cardNumber, card.rarity].filter(Boolean).join(" · ");
  const dealHref = card.hubSlug ? `/cards/${card.hubSlug}` : dealsHref;

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
          {card.image ? (
            <Image
              src={card.image}
              alt={card.name}
              fill
              sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 20vw"
              className="object-contain p-3 transition-transform duration-200 group-hover:scale-[1.03]"
            />
          ) : (
            <CardImagePlaceholder />
          )}
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-1 p-4">
        <p className="truncate text-[15px] font-semibold leading-snug text-zinc-900 dark:text-zinc-50">
          {card.name}
        </p>
        <p className="truncate text-xs text-zinc-500 dark:text-zinc-400">{meta || " "}</p>

        {isDeal ? (
          <>
            <div className="mt-1.5">
              <Price
                usd={card.deal.cheapestUsd}
                native={{
                  amount: card.deal.cheapestNative,
                  currency: MARKETPLACE_CURRENCY[card.deal.marketplace] ?? "USD",
                }}
                className="tnum text-lg font-bold text-zinc-900 dark:text-zinc-50"
              />
            </div>
            <p className="tnum text-xs font-semibold text-emerald-700 dark:text-emerald-500">
              {card.deal.discountPct != null && `${Math.round(card.deal.discountPct * 100)}% below market · `}
              {card.deal.count} live {card.deal.count === 1 ? "listing" : "listings"}
            </p>
            <div className="mt-auto pt-2.5">
              <Link
                href={dealHref}
                className="block rounded-lg bg-emerald-600 px-4 py-2 text-center text-sm font-semibold text-white transition-colors hover:bg-emerald-700"
              >
                See deal →
              </Link>
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
            <div className="mt-auto pt-2.5">
              <AffiliateLink
                href={buildEbaySearchLink(`${card.name} ${card.set}`)}
                eventName="eBay Click"
                eventData={{ species: speciesName, card: card.name, page: pageName }}
                className="block rounded-lg border border-zinc-300 px-4 py-2 text-center text-sm font-semibold text-zinc-700 transition-colors hover:border-zinc-400 hover:text-black dark:border-zinc-700 dark:text-zinc-200 dark:hover:text-zinc-50"
              >
                View on eBay →
              </AffiliateLink>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
