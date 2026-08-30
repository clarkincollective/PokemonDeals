import Link from "next/link";
import AffiliateLink from "@/components/AffiliateLink";
import { buildEbaySearchLink } from "@/lib/ebay";

// Every known card of one species, deals surfaced first. Two visibly
// distinct row styles, per the guardrail that a browsable card must never
// imply it's a deal:
//
//   * card.deal != null  -> green row, "N% below market · N listings",
//     links to the live listings (its /cards/[slug] hub, or the deals
//     section on this page).
//   * card.deal == null  -> plain row: set / number / rarity + the PPT
//     reference price, and a plain affiliate "View on eBay" link. No
//     savings %, no strikethrough, no green.
//
// refPrice is always the PokemonPriceTracker reference figure, never
// presented as a deal or a guaranteed value.

function money(n) {
  return `$${Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function SpeciesCardList({ speciesName, cards, dealsHref = "#deals" }) {
  if (!cards || cards.length === 0) return null;

  return (
    <ul className="mt-3 divide-y divide-zinc-100 dark:divide-zinc-900">
      {cards.map((c) => {
        const isDeal = Boolean(c.deal);
        const meta = [c.set, c.cardNumber, c.rarity].filter(Boolean).join(" · ");
        return (
          <li
            key={c.tcgplayerId ?? `${c.name}|${c.set}`}
            className={`flex items-center gap-3 py-2.5 text-sm ${
              isDeal ? "-mx-2 rounded-lg border border-emerald-500/40 bg-emerald-50 px-2 dark:border-emerald-500/30 dark:bg-emerald-950/25" : ""
            }`}
          >
            {c.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={c.image}
                alt=""
                width={36}
                height={50}
                loading="lazy"
                className="h-[50px] w-9 shrink-0 rounded object-contain"
              />
            ) : (
              <span className="h-[50px] w-9 shrink-0 rounded bg-zinc-100 dark:bg-zinc-900" />
            )}

            <div className="min-w-0 flex-1">
              <p className="truncate font-medium text-black dark:text-zinc-50">{c.name}</p>
              <p className="truncate text-xs text-zinc-400">{meta || " "}</p>
              {isDeal ? (
                <p className="mt-0.5 text-xs font-semibold text-emerald-700 dark:text-emerald-500">
                  {c.deal.discountPct != null && `${Math.round(c.deal.discountPct * 100)}% below market · `}
                  {c.deal.count} live {c.deal.count === 1 ? "listing" : "listings"} from {money(c.deal.cheapestNative)}
                </p>
              ) : (
                c.refPrice != null && (
                  <p className="mt-0.5 text-xs text-zinc-400">
                    Reference price {money(c.refPrice)} <span className="text-zinc-300 dark:text-zinc-600">·</span>{" "}
                    <span className="text-zinc-400">PokemonPriceTracker</span>
                  </p>
                )
              )}
            </div>

            <div className="shrink-0">
              {isDeal ? (
                <Link
                  href={c.hubSlug ? `/cards/${c.hubSlug}` : dealsHref}
                  className="inline-flex items-center rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-emerald-700"
                >
                  See deal →
                </Link>
              ) : (
                <AffiliateLink
                  href={buildEbaySearchLink(`${c.name} ${c.set}`)}
                  eventName="eBay Click"
                  eventData={{ species: speciesName, card: c.name, page: "species_card_list" }}
                  className="inline-flex items-center rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-600 transition-colors hover:border-zinc-400 hover:text-black dark:border-zinc-700 dark:text-zinc-300 dark:hover:text-zinc-50"
                >
                  View on eBay →
                </AffiliateLink>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
