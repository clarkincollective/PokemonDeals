"use client";

import { useSyncExternalStore } from "react";
import Link from "next/link";
import Image from "next/image";
import CardImagePlaceholder from "@/components/CardImagePlaceholder";
import { upgradeCatalogImage } from "@/lib/cardImage";
import { formatMoney, toViewerCurrency } from "@/lib/money";
import { useCurrency } from "@/components/CurrencyProvider";
import {
  readRecent,
  readSaved,
  subscribeCards,
  getServerSnapshot,
  entryHref,
  clearRecent,
  clearSaved,
  removeRecent,
  removeSaved,
} from "@/lib/recentCards";

// Homepage strips for the viewer's own locally-stored "saved" and
// "recently viewed" cards. Renders nothing on the server and nothing at
// all when both lists are empty, so first-time visitors see no gap.
// A stored tile price is in the card's own (native) currency. Convert it
// to the viewer's currency via USD when we know both; return null to fall
// back to showing the native figure.
function tilePrice(card, fx) {
  const native = card.currency || "USD";
  if (card.price == null) return null;
  if (!fx?.viewer || !fx.rates || fx.viewer === native) {
    return { text: formatMoney(card.price, native), approx: false };
  }
  const nativeRate = fx.rates[native] || 1;
  const usd = Number(card.price) / nativeRate;
  return { text: formatMoney(toViewerCurrency(usd, fx.viewer, fx.rates), fx.viewer), approx: true };
}

function Tile({ card, onRemove, fx }) {
  const price = tilePrice(card, fx);
  return (
    <div className="relative w-32 shrink-0">
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onRemove(card);
        }}
        aria-label={`Remove ${card.name || "this card"}`}
        title="Remove"
        className="absolute -right-1.5 -top-1.5 z-10 flex h-6 w-6 items-center justify-center rounded-full border border-zinc-300 bg-white text-sm font-bold leading-none text-zinc-500 shadow-sm hover:border-red-400 hover:text-red-600 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:text-red-400"
      >
        ×
      </button>
      <Link href={entryHref(card)} className="group flex flex-col gap-1.5">
        <div className="relative h-32 w-32 overflow-hidden rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
          {card.image ? (
            <Image src={upgradeCatalogImage(card.image)} alt={card.name || "Card"} fill sizes="128px" quality={85} className="object-contain p-2" />
          ) : (
            <div className="flex h-full items-center justify-center">
              <CardImagePlaceholder className="h-14 w-10" />
            </div>
          )}
        </div>
        <span className="line-clamp-1 text-xs font-medium text-zinc-700 group-hover:text-red-600 dark:text-zinc-300">
          {card.name}
        </span>
        {price && (
          <span className="text-xs text-zinc-500">
            from {price.approx ? "≈ " : ""}
            {price.text}
          </span>
        )}
      </Link>
    </div>
  );
}

function Row({ title, cards, onClear, onRemove, fx }) {
  if (!cards.length) return null;
  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-400">{title}</h2>
        <button
          type="button"
          onClick={onClear}
          className="rounded-md border border-red-200 px-2.5 py-1 text-xs font-bold uppercase tracking-wide text-red-600 transition-colors hover:bg-red-50 hover:text-red-700 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950/40"
        >
          Clear all
        </button>
      </div>
      <div className="-mx-6 flex gap-4 overflow-x-auto px-6 pb-2 pt-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {cards.map((c) => (
          <Tile key={c.key} card={c} onRemove={onRemove} fx={fx} />
        ))}
      </div>
    </div>
  );
}

export default function CardMemoryStrip() {
  const saved = useSyncExternalStore(subscribeCards, readSaved, getServerSnapshot);
  const recent = useSyncExternalStore(subscribeCards, readRecent, getServerSnapshot);

  // Viewer currency + FX rates from the shared context (loads after
  // paint); until then tiles show the card's own currency.
  const fx = useCurrency();

  if (!saved.length && !recent.length) return null;

  // Don't repeat a card in "recently viewed" if it's already shown under
  // "saved" right above it.
  const savedKeys = new Set(saved.map((c) => c.key));
  const recentOnly = recent.filter((c) => !savedKeys.has(c.key));

  return (
    <section className="border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-black">
      <div className="mx-auto flex max-w-7xl flex-col gap-6 px-6 py-8">
        <Row title="Your saved cards" cards={saved} onClear={clearSaved} onRemove={removeSaved} fx={fx} />
        <Row title="Recently viewed" cards={recentOnly} onClear={clearRecent} onRemove={removeRecent} fx={fx} />
      </div>
    </section>
  );
}
