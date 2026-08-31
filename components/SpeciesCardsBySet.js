import Image from "next/image";
import Link from "next/link";
import { slugifySet } from "@/lib/slugify";
import { cardPermanentHref } from "@/lib/speciesHub";
import { buildEbaySearchLink } from "@/lib/ebay";
import { hasPrice } from "@/lib/money";
import AffiliateLink from "@/components/AffiliateLink";
import CardImagePlaceholder from "@/components/CardImagePlaceholder";

// "Browse every <Pokemon> card by set" - a premium, image-forward tile
// grid (2 / 3 / 4 per row), grouped by set. Same visual language as the
// DealCard / SpeciesCard grids used elsewhere; large card art dominates
// each tile. Two clearly distinct eBay states:
//
//   STATE A - a real active below-market deal for this exact card:
//     emerald accent, "-N%" badge, Market/Deal/N% below, and
//     "View Deal on eBay" -> the verified listing's own affiliate URL.
//   STATE B - no active deal: plain tile, market reference price only,
//     and "Find on eBay" -> a card-specific eBay SEARCH through our
//     affiliate infra (buildEbaySearchLink -> campaign EBAY_CAMPAIGN_ID).
//     No deal styling, no savings %, no strikethrough, no urgency.
//
// The art + name link internally to the permanent /cards/[slug]; the eBay
// action is a separate button. A card with no permanent page (missing
// price/image / non-card product) renders un-linked and keeps only "Find
// on eBay".
//
// `cards` from fetchSpeciesCatalog: { tcgplayerId, name, set, cardNumber,
// rarity, refPrice, image, hubSlug, catalogSlug, deal }.

function usd(n) {
  return `$${Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function groupBySet(cards) {
  const groups = new Map();
  for (const c of cards) {
    if (!groups.has(c.set)) groups.set(c.set, []);
    groups.get(c.set).push(c);
  }
  const out = [...groups.entries()].map(([set, list]) => ({
    set,
    // Collector-friendly card-number order within a set; price is made
    // visually prominent instead of resorting the grid by value.
    cards: list.sort((a, b) => {
      const an = parseInt(String(a.cardNumber ?? "").replace(/\D.*$/, ""), 10);
      const bn = parseInt(String(b.cardNumber ?? "").replace(/\D.*$/, ""), 10);
      if (Number.isFinite(an) && Number.isFinite(bn) && an !== bn) return an - bn;
      return a.name.localeCompare(b.name);
    }),
  }));
  // Richest groups first, then alphabetical - deterministic.
  out.sort((a, b) => b.cards.length - a.cards.length || a.set.localeCompare(b.set));
  return out;
}

function ebayQueryFor(c) {
  return [c.name, c.cardNumber, c.set].filter(Boolean).join(" ");
}

function Tile({ card, speciesName }) {
  const href = cardPermanentHref(card);
  const meta = [card.set, card.cardNumber && `#${card.cardNumber}`].filter(Boolean).join(" · ");
  const isDeal = Boolean(card.deal);
  const discountPct = card.deal?.discountPct != null ? Math.round(card.deal.discountPct * 100) : null;

  const art = (
    <div className="relative aspect-[63/88] w-full overflow-hidden rounded-t-xl bg-gradient-to-b from-zinc-50 to-zinc-100 dark:from-zinc-900 dark:to-zinc-950">
      {isDeal && discountPct != null && (
        <span className="absolute right-2 top-2 z-10 rounded-md bg-emerald-600 px-2 py-1 text-sm font-extrabold leading-none text-white shadow-sm">
          −{discountPct}%
        </span>
      )}
      {card.image ? (
        <Image
          src={card.image}
          alt={card.name}
          fill
          sizes="(max-width: 640px) 45vw, (max-width: 1024px) 30vw, 22vw"
          className="object-contain p-3 transition-transform duration-200 group-hover:scale-[1.03]"
        />
      ) : (
        <CardImagePlaceholder />
      )}
    </div>
  );

  return (
    <div
      className={`group flex h-full flex-col overflow-hidden rounded-xl border bg-white shadow-card transition-all duration-200 hover:-translate-y-0.5 hover:shadow-card-hover dark:bg-zinc-950 ${
        isDeal ? "border-emerald-500/50 dark:border-emerald-500/40" : "border-zinc-200 dark:border-zinc-800"
      }`}
    >
      {href ? (
        <Link href={href} aria-label={`${card.name} card details`}>
          {art}
        </Link>
      ) : (
        art
      )}

      <div className="flex flex-1 flex-col gap-1 p-4">
        {href ? (
          <Link
            href={href}
            className="line-clamp-2 text-[15px] font-semibold leading-snug text-zinc-900 hover:text-red-600 dark:text-zinc-50 dark:hover:text-red-500"
          >
            {card.name}
          </Link>
        ) : (
          <p className="line-clamp-2 text-[15px] font-semibold leading-snug text-zinc-900 dark:text-zinc-50">
            {card.name}
          </p>
        )}
        <p className="truncate text-xs text-zinc-500 dark:text-zinc-400">{meta || " "}</p>
        {card.rarity && (
          <p className="truncate text-xs font-medium text-zinc-400 dark:text-zinc-500">{card.rarity}</p>
        )}

        <div className="mt-2">
          {isDeal ? (
            <>
              {hasPrice(card.refPrice) && (
                <p className="text-xs text-zinc-400">Market {usd(card.refPrice)}</p>
              )}
              <p className="text-lg font-bold text-emerald-700 dark:text-emerald-500">
                {usd(card.deal.cheapestUsd)}
              </p>
              {discountPct != null && discountPct > 0 && (
                <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-500">
                  {discountPct}% below market
                </p>
              )}
            </>
          ) : (
            <>
              <p className="text-xs text-zinc-400">Market price</p>
              {hasPrice(card.refPrice) ? (
                <p className="text-lg font-bold text-zinc-900 dark:text-zinc-50">{usd(card.refPrice)}</p>
              ) : (
                <p className="text-sm text-zinc-400">Price unavailable</p>
              )}
            </>
          )}
        </div>

        <div className="mt-auto flex gap-2 pt-3">
          {href && (
            <Link
              href={href}
              className="flex-1 rounded-lg border border-zinc-300 px-3 py-2 text-center text-xs font-semibold text-zinc-700 transition-colors hover:border-zinc-400 hover:text-black dark:border-zinc-700 dark:text-zinc-200 dark:hover:text-zinc-50"
            >
              View Card
            </Link>
          )}
          {isDeal && card.deal.affiliateUrl ? (
            <AffiliateLink
              href={card.deal.affiliateUrl}
              eventName="eBay Click"
              eventData={{ species: speciesName, card: card.name, page: "species_by_set_deal" }}
              className="flex-1 rounded-lg bg-emerald-600 px-3 py-2 text-center text-xs font-semibold text-white transition-colors hover:bg-emerald-700"
            >
              View Deal on eBay
            </AffiliateLink>
          ) : (
            <AffiliateLink
              href={buildEbaySearchLink(ebayQueryFor(card))}
              eventName="eBay Click"
              eventData={{ species: speciesName, card: card.name, page: "species_by_set_search" }}
              className="flex-1 rounded-lg bg-zinc-900 px-3 py-2 text-center text-xs font-semibold text-white transition-colors hover:bg-zinc-800 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
            >
              Find on eBay
            </AffiliateLink>
          )}
        </div>
      </div>
    </div>
  );
}

export default function SpeciesCardsBySet({ speciesName, cards, validSetSlugs = [] }) {
  if (!cards || cards.length === 0) return null;
  const groups = groupBySet(cards);

  return (
    <div className="mt-3">
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        Browse every {speciesName} card by set, compare current market prices, and open any card for
        full pricing and live deals.
      </p>
      <p className="mt-1 text-xs text-zinc-400">
        Market prices are based on recent sales and are not guaranteed values.
      </p>

      <div className="mt-6 space-y-12">
        {groups.map(({ set, cards: list }) => {
          const setSlug = slugifySet(set);
          const setHasPage = validSetSlugs.includes(setSlug);
          return (
            <section key={set}>
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-b border-zinc-200 pb-2 dark:border-zinc-800">
                <div className="flex items-baseline gap-2">
                  <h3 className="text-base font-bold text-black dark:text-zinc-50">{set}</h3>
                  <span className="text-xs text-zinc-400">
                    {list.length} {list.length === 1 ? "card" : "cards"}
                  </span>
                </div>
                {setHasPage && (
                  <Link
                    href={`/sets/${setSlug}`}
                    className="text-xs font-semibold text-red-600 hover:underline dark:text-red-500"
                  >
                    View set →
                  </Link>
                )}
              </div>
              <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
                {list.map((c) => (
                  <Tile key={c.tcgplayerId ?? `${c.name}|${c.set}`} card={c} speciesName={speciesName} />
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
