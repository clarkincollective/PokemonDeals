import Image from "next/image";
import Link from "next/link";
import { slugifySet } from "@/lib/slugify";
import { cardPermanentHref } from "@/lib/speciesHub";
import { hasPrice } from "@/lib/money";

// "Every <Pokemon> card, by set" (Phase 4 P1.2). Groups a species'
// card_catalog cards by set so a visitor searching e.g. "houndoom
// breakthrough" immediately sees every Houndoom print in that set and can
// open each one. Every card links to its PERMANENT /cards/[slug] page
// (the deal hub if it has live listings, otherwise the P0 catalog-backed
// page) - never a page that 404s: a card with no permanent page (missing
// price/image, or a non-card product) renders as plain text, no link.
//
// `cards` come from fetchSpeciesCatalog: { name, set, cardNumber, rarity,
// refPrice, image, hubSlug, catalogSlug, deal }.

function usd(n) {
  return `$${Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// Newest sets first is impossible without set dates; group order is by
// number of cards (most-represented set first), then name - deterministic
// and puts the richest groups on top.
function groupBySet(cards) {
  const groups = new Map();
  for (const c of cards) {
    if (!groups.has(c.set)) groups.set(c.set, []);
    groups.get(c.set).push(c);
  }
  const out = [...groups.entries()].map(([set, list]) => ({
    set,
    cards: list.sort((a, b) => {
      // card number ascending where numeric-ish, else by name
      const an = parseInt(String(a.cardNumber ?? "").replace(/\D.*$/, ""), 10);
      const bn = parseInt(String(b.cardNumber ?? "").replace(/\D.*$/, ""), 10);
      if (Number.isFinite(an) && Number.isFinite(bn) && an !== bn) return an - bn;
      return a.name.localeCompare(b.name);
    }),
  }));
  out.sort((a, b) => b.cards.length - a.cards.length || a.set.localeCompare(b.set));
  return out;
}

export default function SpeciesCardsBySet({ speciesName, cards, validSetSlugs = [] }) {
  if (!cards || cards.length === 0) return null;
  const groups = groupBySet(cards);

  return (
    <div className="mt-4 space-y-8">
      {groups.map(({ set, cards: list }) => {
        const setSlug = slugifySet(set);
        const setHasPage = validSetSlugs.includes(setSlug);
        return (
          <section key={set}>
            <div className="flex items-baseline justify-between gap-3 border-b border-zinc-200 pb-1.5 dark:border-zinc-800">
              <h3 className="text-sm font-bold text-black dark:text-zinc-50">
                {setHasPage ? (
                  <Link href={`/sets/${setSlug}`} className="hover:text-red-600 hover:underline dark:hover:text-red-500">
                    {set}
                  </Link>
                ) : (
                  set
                )}
              </h3>
              <span className="text-xs text-zinc-400">
                {list.length} {list.length === 1 ? "card" : "cards"}
              </span>
            </div>
            <ul className="mt-2 divide-y divide-zinc-100 dark:divide-zinc-900">
              {list.map((c) => {
                const href = cardPermanentHref(c);
                const meta = [c.cardNumber, c.rarity].filter(Boolean).join(" · ");
                const inner = (
                  <>
                    <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded bg-zinc-50 dark:bg-zinc-900">
                      {c.image ? (
                        <Image src={c.image} alt={c.name} fill sizes="48px" className="object-contain p-0.5" />
                      ) : null}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-zinc-800 dark:text-zinc-200">{c.name}</p>
                      {meta && <p className="truncate text-xs text-zinc-400">{meta}</p>}
                    </div>
                    <div className="shrink-0 text-right">
                      {c.deal ? (
                        <span className="text-sm font-bold text-emerald-700 dark:text-emerald-500">
                          {usd(c.deal.cheapestUsd)}{" "}
                          <span className="text-[11px] font-medium">live deal</span>
                        </span>
                      ) : hasPrice(c.refPrice) ? (
                        <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">{usd(c.refPrice)}</span>
                      ) : (
                        <span className="text-xs text-zinc-400">Price unavailable</span>
                      )}
                    </div>
                  </>
                );
                return (
                  <li key={c.tcgplayerId ?? `${c.name}|${c.set}`}>
                    {href ? (
                      <Link
                        href={href}
                        className="flex items-center gap-3 py-2.5 transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-900"
                      >
                        {inner}
                      </Link>
                    ) : (
                      <div className="flex items-center gap-3 py-2.5">{inner}</div>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
