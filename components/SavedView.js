"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import Image from "next/image";
import CardImagePlaceholder from "@/components/CardImagePlaceholder";
import { upgradeCatalogImage } from "@/lib/cardImage";
import { formatMoney, toViewerCurrency, dealTotalUsd } from "@/lib/money";
import { useCurrency } from "@/components/CurrencyProvider";
import { readSaved, subscribeCards, getServerSnapshot, entryHref, removeSaved, clearSaved } from "@/lib/recentCards";
import { readSavedSearches, subscribeSearches, getServerSnapshot as noSearches, removeSavedSearch, clearSavedSearches } from "@/lib/savedSearches";
import { capture } from "@/lib/analytics/client";
import { EVENTS } from "@/lib/analytics/events";

// /saved - the viewer's device-local saved cards and saved searches, with
// each saved card's CURRENT live offers (the same displayable, cheapest-
// first set the card page shows, via /api/deals-page?kind=card). Nothing
// here is stored server-side; the list is whatever this browser holds.
//
// Live-offer lookups run a few at a time after mount; until one answers
// the row says "checking live offers…", never a stale stored price
// presented as current.

const CONCURRENCY = 4;
const countBand = (n) => (n === 0 ? "0" : n <= 3 ? "1-3" : n <= 10 ? "4-10" : "11+");

function useLiveOffers(cards) {
  const [offers, setOffers] = useState({}); // slug -> { count, cheapestUsd, error }
  const inflight = useRef(new Set());
  useEffect(() => {
    const slugs = cards.map((c) => c.slug).filter((s) => s && !offers[s] && !inflight.current.has(s));
    if (!slugs.length) return;
    let cancelled = false;
    (async () => {
      const queue = [...slugs];
      const worker = async () => {
        while (queue.length && !cancelled) {
          const slug = queue.shift();
          inflight.current.add(slug);
          let result;
          try {
            const res = await fetch(`/api/deals-page?kind=card&slug=${encodeURIComponent(slug)}&sort=price_asc`);
            const body = res.ok ? await res.json() : null;
            const deals = Array.isArray(body?.deals) ? body.deals : [];
            const cheapest = deals[0] ?? null;
            result = { count: deals.length, cheapestUsd: cheapest ? dealTotalUsd(cheapest) : null, auction: cheapest?.listing_type === "AUCTION", error: !res.ok };
          } catch {
            result = { count: 0, cheapestUsd: null, error: true };
          }
          if (!cancelled) setOffers((o) => ({ ...o, [slug]: result }));
          inflight.current.delete(slug);
        }
      };
      await Promise.all(Array.from({ length: Math.min(CONCURRENCY, queue.length) }, worker));
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cards]);
  return offers;
}

function money(usd, fx) {
  if (!Number.isFinite(usd) || usd <= 0) return null;
  const viewer = fx?.viewer || "USD";
  const text = formatMoney(toViewerCurrency(usd, viewer, fx?.rates), viewer);
  return viewer === "USD" ? text : `≈ ${text}`;
}

function OfferLine({ slug, live, fx }) {
  if (!slug) return <span className="text-xs text-zinc-500 dark:text-zinc-400">Saved from a single listing — open it to check whether it is still live.</span>;
  if (!live) return <span className="text-xs text-zinc-500 dark:text-zinc-400">Checking live offers…</span>;
  if (live.error) return <span className="text-xs text-zinc-500 dark:text-zinc-400">Couldn&apos;t check live offers just now.</span>;
  if (live.count === 0) return <span className="text-xs text-zinc-600 dark:text-zinc-400">No live offers right now.</span>;
  const from = money(live.cheapestUsd, fx);
  return (
    <span className="text-xs text-zinc-700 dark:text-zinc-300">
      {live.count} live {live.count === 1 ? "offer" : "offers"}
      {from ? ` · ${live.auction ? "current bid" : "from"} ${from}` : ""}
    </span>
  );
}

const actionClass = "inline-flex min-h-11 items-center rounded-lg border border-zinc-300 bg-white px-3 text-xs font-semibold text-zinc-800 hover:border-zinc-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100";

export default function SavedView({ alertsEnabled = false }) {
  const cards = useSyncExternalStore(subscribeCards, readSaved, getServerSnapshot);
  const searches = useSyncExternalStore(subscribeSearches, readSavedSearches, noSearches);
  const fx = useCurrency();
  const live = useLiveOffers(cards);
  const opened = useRef(false);
  useEffect(() => {
    if (opened.current) return;
    opened.current = true;
    capture(EVENTS.SAVED_VIEW_OPENED, { count_band: countBand(cards.length + searches.length) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const empty = cards.length === 0 && searches.length === 0;

  return (
    <div className="flex flex-col gap-10">
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        Saved on this device only — nothing here is sent to us, and clearing site data removes it.
        Saving keeps a card or search here; an <strong>alert</strong> emails you when a matching listing appears.
      </p>

      {empty && (
        <div className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950">
          <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Nothing saved yet.</p>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            Tap ♡ on any card or listing to keep it here, or save a filtered search from its &ldquo;Filtered by&rdquo; row.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link href="/deals" className={actionClass}>Browse all live deals</Link>
            <Link href="/best-finds" className={actionClass}>Top 10 right now</Link>
            <Link href="/search" className={actionClass}>Check a card&apos;s price</Link>
          </div>
        </div>
      )}

      {cards.length > 0 && (
        <section aria-labelledby="saved-cards">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 id="saved-cards" className="text-base font-bold text-zinc-900 dark:text-zinc-50">Saved cards ({cards.length})</h2>
            <button type="button" onClick={clearSaved} className="min-h-11 rounded-md border border-red-200 px-2.5 text-xs font-bold text-red-600 hover:bg-red-50 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950/40">
              Clear all
            </button>
          </div>
          <ul className="flex flex-col divide-y divide-zinc-200 rounded-xl border border-zinc-200 bg-white dark:divide-zinc-800 dark:border-zinc-800 dark:bg-zinc-950">
            {cards.map((c) => (
              <li key={c.key} className="flex flex-wrap items-center gap-3 p-3 sm:flex-nowrap">
                <Link href={entryHref(c)} className="relative h-16 w-12 shrink-0 overflow-hidden rounded-md border border-zinc-200 bg-white dark:border-zinc-800">
                  {c.image ? (
                    <Image src={upgradeCatalogImage(c.image)} alt="" fill sizes="48px" className="object-contain p-1" />
                  ) : (
                    <div className="flex h-full items-center justify-center"><CardImagePlaceholder className="h-8 w-6" /></div>
                  )}
                </Link>
                <div className="min-w-0 flex-1">
                  <Link href={entryHref(c)} className="block truncate text-sm font-semibold text-zinc-900 hover:text-red-600 dark:text-zinc-50">
                    {c.name}
                  </Link>
                  {c.set && <p className="truncate text-xs text-zinc-500 dark:text-zinc-400">{c.set}</p>}
                  <p className="mt-0.5"><OfferLine slug={c.slug} live={live[c.slug]} fx={fx} /></p>
                </div>
                <div className="flex w-full flex-wrap gap-2 sm:w-auto">
                  <Link href={entryHref(c)} className={actionClass}>{c.slug ? "View offers" : "View listing"}</Link>
                  {alertsEnabled && c.slug && (
                    <Link href={`/cards/${c.slug}#price-alert`} className={actionClass}>Set an alert</Link>
                  )}
                  <button type="button" onClick={() => removeSaved(c)} aria-label={`Remove ${c.name || "this card"}`} className={actionClass}>
                    Remove
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {searches.length > 0 && (
        <section aria-labelledby="saved-searches">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 id="saved-searches" className="text-base font-bold text-zinc-900 dark:text-zinc-50">Saved searches ({searches.length})</h2>
            <button type="button" onClick={clearSavedSearches} className="min-h-11 rounded-md border border-red-200 px-2.5 text-xs font-bold text-red-600 hover:bg-red-50 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950/40">
              Clear all
            </button>
          </div>
          <ul className="flex flex-col divide-y divide-zinc-200 rounded-xl border border-zinc-200 bg-white dark:divide-zinc-800 dark:border-zinc-800 dark:bg-zinc-950">
            {searches.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center gap-3 p-3 sm:flex-nowrap">
                <div className="min-w-0 flex-1">
                  <a href={s.href} rel="nofollow" className="block truncate text-sm font-semibold text-zinc-900 hover:text-red-600 dark:text-zinc-50">
                    {s.label || "Filtered deals"}
                  </a>
                  <p className="truncate text-xs text-zinc-500 dark:text-zinc-400">{s.scope || s.href}</p>
                </div>
                <div className="flex w-full flex-wrap gap-2 sm:w-auto">
                  <a href={s.href} rel="nofollow" className={actionClass}>Open</a>
                  <button type="button" onClick={() => removeSavedSearch(s.id)} aria-label={`Remove saved search ${s.label || ""}`} className={actionClass}>
                    Remove
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
