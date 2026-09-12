import Image from "next/image";
import Link from "next/link";
import Price from "@/components/Price";
import EbaySearchLink from "@/components/EbaySearchLink";
import CardImagePlaceholder from "@/components/CardImagePlaceholder";
import { catalogImageUrl } from "@/lib/cardImage";
import { buildEbaySearchLink } from "@/lib/ebayLinks";

// Deal-first R1 - the CATALOGUE / REFERENCE-ONLY offer state, in the same
// shell as <DealCard> so the two read as one system while staying
// unmistakably different: no listing, no price badge, no "View deal";
// a labelled market reference for the exact printing and condition, and
// a correctly labelled "Find on eBay" search (the existing tracked
// EbaySearchLink, re-pointed to the viewer's marketplace on the client).
//
// Props are a plain descriptor - the same fields the catalogue surfaces
// already hold (components/SpeciesCard, CatalogueBrowser build them):
//   { name, set, number, tcgplayerId, href, referenceUsd, referenceCondition, referencePrinting }
// `referenceUsd` null renders "No reliable market reference" (never $0).
export default function ReferenceOfferCard({ card, surface = "other" }) {
  const image = card.tcgplayerId ? catalogImageUrl(card.tcgplayerId) : null;
  const query = [card.name, card.set, card.number].filter(Boolean).join(" ");
  const searchHref = buildEbaySearchLink(query, undefined, surface);
  const hasRef = Number.isFinite(Number(card.referenceUsd)) && Number(card.referenceUsd) > 0;
  const identity = [card.set, card.number].filter(Boolean).join(" · ");

  return (
    <article
      data-offer-state="reference_only"
      className="group flex h-full flex-col overflow-hidden rounded-xl border border-dashed border-zinc-300 bg-white transition-shadow duration-200 hover:shadow-card-hover dark:border-zinc-700 dark:bg-zinc-950"
    >
      <div className="relative aspect-square w-full bg-zinc-50 dark:bg-zinc-900">
        {image ? (
          card.href ? (
            <Link href={card.href} className="block h-full w-full" aria-label={`${card.name} - card page`}>
              <Image src={image} alt={`${card.name} - ${card.set ?? ""} reference artwork`} fill sizes="(max-width: 640px) 90vw, 24vw" quality={75} className="object-contain p-3" />
            </Link>
          ) : (
            <Image src={image} alt={`${card.name} - ${card.set ?? ""} reference artwork`} fill sizes="(max-width: 640px) 90vw, 24vw" quality={75} className="object-contain p-3" />
          )
        ) : (
          <CardImagePlaceholder />
        )}
        <span className="pointer-events-none absolute bottom-1.5 left-1.5 rounded bg-zinc-900/75 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
          Reference image
        </span>
      </div>

      <div className="flex flex-1 flex-col p-4">
        {card.href ? (
          <Link href={card.href} className="line-clamp-2 text-base font-semibold leading-snug text-zinc-900 hover:underline dark:text-zinc-50">
            {card.name}
          </Link>
        ) : (
          <p className="line-clamp-2 text-base font-semibold leading-snug text-zinc-900 dark:text-zinc-50">{card.name}</p>
        )}
        {identity && <p className="mt-1 truncate text-xs text-zinc-500 dark:text-zinc-400">{identity}</p>}

        <div className="mt-3">
          <p className="text-[11px] font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Market reference · not a listing
          </p>
          {hasRef ? (
            <>
              <Price
                usd={Number(card.referenceUsd)}
                native={{ amount: Number(card.referenceUsd), currency: "USD" }}
                className="tnum block text-2xl font-bold leading-tight text-zinc-900 dark:text-zinc-50"
              />
              <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                {[card.referenceCondition, card.referencePrinting].filter(Boolean).join(" · ") || "condition not recorded"} · recent-sold reference (PokemonPriceTracker), not a guaranteed value
              </p>
            </>
          ) : (
            <p className="mt-0.5 text-sm text-zinc-600 dark:text-zinc-400">No reliable market reference right now.</p>
          )}
        </div>

        <p className="mt-2 text-[11px] text-zinc-500 dark:text-zinc-400">No eligible below-market listing found for this card at the last scan.</p>

        <div className="mt-auto pt-3">
          <EbaySearchLink
            href={searchHref}
            event={{ placement: surface, cta: "find_on_ebay" }}
            className="flex min-h-11 w-full items-center justify-center rounded-lg border border-zinc-300 bg-white px-4 text-sm font-semibold text-zinc-800 transition-colors hover:border-zinc-400 hover:bg-zinc-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
          >
            Find on eBay
          </EbaySearchLink>
        </div>
      </div>
    </article>
  );
}
