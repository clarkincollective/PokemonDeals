"use client";

import { useSyncExternalStore } from "react";
import Link from "next/link";
import Image from "next/image";
import CardImagePlaceholder from "@/components/CardImagePlaceholder";
import { readRecent, readSaved, subscribeCards, getServerSnapshot } from "@/lib/recentCards";

// Homepage strips for the viewer's own locally-stored "saved" and
// "recently viewed" cards. Renders nothing on the server and nothing at
// all when both lists are empty, so first-time visitors see no gap.
function Tile({ card }) {
  return (
    <Link
      href={`/cards/${card.slug}`}
      className="group flex w-32 shrink-0 flex-col gap-1.5"
    >
      <div className="relative h-32 w-32 overflow-hidden rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
        {card.image ? (
          <Image src={card.image} alt={card.name || "Card"} fill sizes="128px" className="object-contain p-2" />
        ) : (
          <div className="flex h-full items-center justify-center">
            <CardImagePlaceholder className="h-14 w-10" />
          </div>
        )}
      </div>
      <span className="line-clamp-1 text-xs font-medium text-zinc-700 group-hover:text-red-600 dark:text-zinc-300">
        {card.name}
      </span>
      {card.price != null && (
        <span className="text-xs text-zinc-500">from ${Number(card.price).toFixed(2)}</span>
      )}
    </Link>
  );
}

function Row({ title, cards }) {
  if (!cards.length) return null;
  return (
    <div>
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-400">{title}</h2>
      <div className="-mx-6 flex gap-4 overflow-x-auto px-6 pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {cards.map((c) => (
          <Tile key={c.slug} card={c} />
        ))}
      </div>
    </div>
  );
}

export default function CardMemoryStrip() {
  const saved = useSyncExternalStore(subscribeCards, readSaved, getServerSnapshot);
  const recent = useSyncExternalStore(subscribeCards, readRecent, getServerSnapshot);

  if (!saved.length && !recent.length) return null;

  // Don't repeat a card in "recently viewed" if it's already shown under
  // "saved" right above it.
  const savedSlugs = new Set(saved.map((c) => c.slug));
  const recentOnly = recent.filter((c) => !savedSlugs.has(c.slug));

  return (
    <section className="border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-black">
      <div className="mx-auto flex max-w-7xl flex-col gap-6 px-6 py-8">
        <Row title="Your saved cards" cards={saved} />
        <Row title="Recently viewed" cards={recentOnly} />
      </div>
    </section>
  );
}
