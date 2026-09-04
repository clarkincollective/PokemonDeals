"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { track } from "@vercel/analytics";
import { hasPrice, MARKETPLACE_CURRENCY, refInListingCurrency } from "@/lib/money";
import Price from "@/components/Price";
import { cardDisplayName, cardIdentityLine } from "@/lib/cardName";
import { upgradeCatalogImage } from "@/lib/cardImage";
import { useRegion, localizeEbaySearchUrl } from "@/lib/useRegion";
import {
  SORTS,
  DEFAULT_SORT,
  ALWAYS_FULL_UP_TO,
  INITIAL_PER_LARGE_GROUP,
  INITIAL_FLAT,
  FLAT_STEP,
  flatVisible,
  filterCards,
  sortCards,
  groupBySet,
  distinctSorted,
} from "@/lib/catalogueView";
import AffiliateLink from "@/components/AffiliateLink";
import CardImagePlaceholder from "@/components/CardImagePlaceholder";

// The full species catalogue browser: search / set / rarity / sort
// toolbar + progressive disclosure. Every `item` is a server prop (no
// fetch), so the whole catalogue is in the SSR HTML; this only shows /
// hides / re-orders it. Nothing here writes to the URL. Pure view logic
// lives in lib/catalogueView (unit-tested).

// Species like Charizard / Pikachu span 60-120 sets, most with only 1-3
// cards. Show the richest N set sections first, the rest behind one
// button - the full list stays in the DOM (SSR) the whole time.
const INITIAL_SET_GROUPS = 12;

// One USD-canonical figure, localised to the viewer's currency after
// hydration (Phase 6A currency closeout - this grid used to print raw
// "$X" regardless of the selected country).
function Money({ usd, native }) {
  return <Price usd={usd} native={native ?? { amount: usd, currency: "USD" }} approxPrefix="" />;
}
// Same precedence as lib/speciesHub cardPermanentHref, inlined so this
// client bundle doesn't pull in the species-name dataset.
function permanentHref(card) {
  if (card.hubSlug) return `/cards/${card.hubSlug}`;
  if (card.catalogSlug) return `/cards/${card.catalogSlug}`;
  return null;
}

export function Tile({ card, speciesName, placement }) {
  const region = useRegion();
  const href = permanentHref(card);
  const name = card.displayName ?? cardDisplayName(card);
  const meta = cardIdentityLine(card, { withHash: true, withRarity: false });
  const isDeal = Boolean(card.deal);
  const isAuction = card.deal?.listingType === "AUCTION";
  const discountPct = card.deal?.discountPct != null ? Math.round(card.deal.discountPct * 100) : null;
  // On a deal tile the listing price and the market reference must share
  // one currency in every state. Express the USD reference in the deal's
  // own currency (scan-time rate, no live FX); <Price> then localises
  // both together after hydration.
  const dealCcy = isDeal ? MARKETPLACE_CURRENCY[card.deal.marketplace] || "USD" : "USD";
  const refNative = isDeal
    ? refInListingCurrency(card.refPrice, card.deal.cheapestNative, card.deal.cheapestUsd, dealCcy)
    : null;
  const ev = { species: speciesName, cardCatalogId: card.tcgplayerId ?? null, placement };
  const viewCard = () => track("View Card", { ...ev, cta: "view_card" });

  const art = (
    <div className="relative aspect-[63/88] w-full overflow-hidden rounded-t-xl bg-gradient-to-b from-zinc-50 to-zinc-100 dark:from-zinc-900 dark:to-zinc-950">
      {isDeal && discountPct != null && (
        <span className="absolute right-2 top-2 z-10 rounded-md bg-emerald-600 px-2 py-1 text-sm font-extrabold leading-none text-white shadow-sm">
          −{discountPct}%
        </span>
      )}
      {card.image ? (
        <Image
          src={upgradeCatalogImage(card.image)}
          alt={name}
          fill
          sizes="(max-width: 640px) 45vw, (max-width: 1024px) 30vw, 23vw"
          quality={85}
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
        <Link href={href} aria-label={`${name} card details`} onClick={viewCard}>
          {art}
        </Link>
      ) : (
        art
      )}

      <div className="flex flex-1 flex-col gap-1 p-4">
        {href ? (
          <Link
            href={href}
            onClick={viewCard}
            className="line-clamp-2 text-[15px] font-semibold leading-snug text-zinc-900 hover:text-red-600 dark:text-zinc-50 dark:hover:text-red-500"
          >
            {name}
          </Link>
        ) : (
          <p className="line-clamp-2 text-[15px] font-semibold leading-snug text-zinc-900 dark:text-zinc-50">
            {name}
          </p>
        )}
        <p className="truncate text-xs text-zinc-500 dark:text-zinc-400">{meta || " "}</p>
        {card.rarity && (
          <p className="truncate text-xs font-medium text-zinc-400 dark:text-zinc-500">{card.rarity}</p>
        )}

        <div className="mt-2">
          {isDeal ? (
            <>
              {hasPrice(card.refPrice) && refNative != null && (
                <p className="text-xs text-zinc-400">
                  {isAuction ? "Market ref " : "Market "}
                  <Money usd={card.refPrice} native={{ amount: refNative, currency: dealCcy }} />
                </p>
              )}
              <p className="text-lg font-bold text-emerald-700 dark:text-emerald-500">
                <Money
                  usd={card.deal.cheapestUsd}
                  native={{ amount: card.deal.cheapestNative, currency: dealCcy }}
                />
              </p>
              {discountPct != null && discountPct > 0 && (
                isAuction ? (
                  <p className="text-xs font-semibold text-amber-600 dark:text-amber-500">
                    Current bid · {discountPct}% under ref · can rise
                  </p>
                ) : (
                  <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-500">{discountPct}% below market</p>
                )
              )}
            </>
          ) : (
            <>
              <p className="text-xs text-zinc-400">Market reference</p>
              {hasPrice(card.refPrice) ? (
                <p className="text-lg font-bold text-zinc-900 dark:text-zinc-50">
                  <Money usd={card.refPrice} />
                </p>
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
              onClick={viewCard}
              className="flex-1 rounded-lg border border-zinc-300 px-3 py-2 text-center text-xs font-semibold text-zinc-700 transition-colors hover:border-zinc-400 hover:text-black dark:border-zinc-700 dark:text-zinc-200 dark:hover:text-zinc-50"
            >
              View Card
            </Link>
          )}
          {isDeal && card.deal.affiliateUrl ? (
            <AffiliateLink
              href={card.deal.affiliateUrl}
              eventName="eBay Click"
              eventData={{
                ...ev,
                cta: isAuction ? "bid_on_ebay" : "view_deal",
                marketplace: card.deal.marketplace ?? region ?? "unknown",
              }}
              className="flex-1 rounded-lg bg-emerald-600 px-3 py-2 text-center text-xs font-semibold text-white transition-colors hover:bg-emerald-700"
            >
              {isAuction ? "Bid on eBay" : "View Deal on eBay"}
            </AffiliateLink>
          ) : (
            <a
              href={localizeEbaySearchUrl(card.ebayHref, region)}
              target="_blank"
              rel="sponsored noopener noreferrer"
              onClick={() => track("eBay Click", { ...ev, cta: "find_on_ebay", card: card.name, marketplace: region || "unknown" })}
              className="flex-1 rounded-lg bg-zinc-900 px-3 py-2 text-center text-xs font-semibold text-white transition-colors hover:bg-zinc-800 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
            >
              Find on eBay
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

const GRID = "mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4";

// EVERY tile / group is always rendered (so the full card list + all
// /cards/[slug] links are in the SSR HTML for crawlers); "collapsed" ones
// just get `hidden` (display:none). This is disclosure, never lazy load.
function SetGroup({ set, list, speciesName, expandAll, groupHidden }) {
  const [open, setOpen] = useState(false);
  const small = list.length <= ALWAYS_FULL_UP_TO;
  const showAll = small || open || expandAll;
  const setSlug = list[0]?.setSlug;
  const setHasPage = list[0]?.setHasPage;
  // Collapsed groups (past INITIAL_SET_GROUPS) and the tail of a large
  // group render NO tiles until the user asks - the tiles are painted
  // client-side from the in-memory prop. Every card still has a permanent
  // link in the always-SSR <CatalogueLinkIndex> below the browser.
  const shownTiles = groupHidden ? [] : showAll ? list : list.slice(0, INITIAL_PER_LARGE_GROUP);

  return (
    <section className={groupHidden ? "hidden" : undefined}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-b border-zinc-200 pb-2 dark:border-zinc-800">
        <div className="flex items-baseline gap-2">
          <h3 className="text-base font-bold text-black dark:text-zinc-50">{set}</h3>
          <span className="text-xs text-zinc-400">
            {list.length} {list.length === 1 ? "card" : "cards"}
          </span>
        </div>
        {setHasPage && (
          <Link href={`/sets/${setSlug}`} className="text-xs font-semibold text-red-600 hover:underline dark:text-red-500">
            View set →
          </Link>
        )}
      </div>
      {shownTiles.length > 0 && (
        <div className={GRID}>
          {shownTiles.map((c, i) => (
            <div key={c.tcgplayerId ?? `${c.name}|${c.set}`}>
              <Tile
                card={c}
                speciesName={speciesName}
                placement={!small && i >= INITIAL_PER_LARGE_GROUP ? "species_set_expanded" : "species_catalog"}
              />
            </div>
          ))}
        </div>
      )}
      {!small && !expandAll && (
        <button
          type="button"
          onClick={() => {
            setOpen((v) => !v);
            if (!open) track("Catalogue Expand", { species: speciesName, set, count: list.length });
          }}
          className="mt-3 inline-flex items-center gap-1 rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-semibold text-zinc-700 transition-colors hover:border-zinc-400 hover:text-black dark:border-zinc-700 dark:text-zinc-200"
        >
          {open ? "Show fewer" : `Show all ${list.length} ${set} cards →`}
        </button>
      )}
    </section>
  );
}

export default function CatalogueBrowser({ speciesName, label, items, variant = "species", totalCount }) {
  const name = label ?? speciesName;
  const isSet = variant === "set";
  const prefix = isSet ? "set_" : "species_";
  // When the page capped what it handed us (large catalogue), say so -
  // the complete list is the CatalogueLinkIndex below this browser.
  const capped = Number.isFinite(totalCount) && totalCount > items.length;

  const [q, setQ] = useState("");
  const [setFilter, setSetFilter] = useState("");
  const [rarityFilter, setRarityFilter] = useState("");
  const [sort, setSort] = useState(DEFAULT_SORT);
  const [expandAll, setExpandAll] = useState(false);
  const [showAllSets, setShowAllSets] = useState(false);
  const [shown, setShown] = useState(INITIAL_FLAT); // flat (set) disclosure counter

  const setOptions = useMemo(() => distinctSorted(items, "set"), [items]);
  const rarityOptions = useMemo(() => distinctSorted(items, "rarity"), [items]);

  const filtered = useMemo(
    () => filterCards(items, { q, set: setFilter, rarity: rarityFilter }),
    [items, q, setFilter, rarityFilter]
  );

  const isFiltering = Boolean(q.trim() || setFilter || rarityFilter || sort !== DEFAULT_SORT);
  const groups = useMemo(() => groupBySet(filtered), [filtered]);
  // Relevance tier (standard cards ahead of Jumbo / oversized / WCD
  // specialty) applies ONLY to the DEFAULT sort - an explicit Lowest
  // price / Card number / Name A-Z choice is honoured literally.
  const flat = useMemo(
    () => sortCards(filtered, sort, { relevanceTier: sort === DEFAULT_SORT }),
    [filtered, sort]
  );

  // Flat disclosure resets to the first screen whenever the result set
  // changes (new search / rarity / sort).
  useEffect(() => {
    setShown(INITIAL_FLAT);
  }, [q, rarityFilter, sort]);
  const visible = flatVisible(flat.length, shown);

  const clear = () => {
    setQ("");
    setSetFilter("");
    setRarityFilter("");
    setSort(DEFAULT_SORT);
  };

  return (
    <div className="mt-4">
      {/* Toolbar */}
      <div className="rounded-xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950">
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={`Search ${name} cards — name, number, rarity…`}
            aria-label={`Search ${name} cards`}
            className="min-w-0 flex-1 rounded-lg border border-zinc-300 px-3 py-2 text-base sm:text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
          />
          {!isSet && (
            <select
              value={setFilter}
              onChange={(e) => setSetFilter(e.target.value)}
              aria-label="Filter by set"
              className="rounded-lg border border-zinc-300 px-3 py-2 text-base sm:text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
            >
              <option value="">All sets</option>
              {setOptions.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          )}
          <select
            value={rarityFilter}
            onChange={(e) => setRarityFilter(e.target.value)}
            aria-label="Filter by rarity"
            className="rounded-lg border border-zinc-300 px-3 py-2 text-base sm:text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
          >
            <option value="">All rarities</option>
            {rarityOptions.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value)}
            aria-label="Sort cards"
            className="rounded-lg border border-zinc-300 px-3 py-2 text-base sm:text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
          >
            {Object.entries(SORTS).map(([k, v]) => (
              <option key={k} value={k}>
                Sort: {v.label}
              </option>
            ))}
          </select>
        </div>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            {capped
              ? `Showing ${filtered.length} highest-value of ${totalCount} ${name} cards — the full index is below`
              : isSet || isFiltering
                ? `${filtered.length} of ${items.length} ${items.length === 1 ? "card" : "cards"}`
                : `${filtered.length} ${filtered.length === 1 ? "card" : "cards"} across ${setOptions.length} sets`}
          </p>
          <div className="flex items-center gap-3">
            {isFiltering && (
              <button type="button" onClick={clear} className="text-xs font-semibold text-red-600 hover:underline dark:text-red-500">
                Clear filters
              </button>
            )}
            {!isSet && !isFiltering && (
              <label className="flex cursor-pointer items-center gap-1.5 text-xs font-semibold text-zinc-600 dark:text-zinc-300">
                <input type="checkbox" checked={expandAll} onChange={(e) => setExpandAll(e.target.checked)} />
                Expand all sets
              </label>
            )}
          </div>
        </div>
      </div>

      {/* --- SET variant: one flat sorted grid + flat progressive disclosure --- */}
      {isSet ? (
        flat.length === 0 ? (
          <p className="mt-6 text-sm text-zinc-500 dark:text-zinc-400">
            No {name} cards match.{" "}
            <button type="button" onClick={clear} className="font-semibold text-red-600 hover:underline">
              Clear filters
            </button>
          </p>
        ) : (
          <>
            {/* Only the visible slice is rendered (SSR + hydration) - "Show
                more" bumps `shown` and paints additional tiles from the
                in-memory `items` prop, no fetch. The complete permanent-
                card link set lives in the always-SSR <CatalogueLinkIndex>
                the page renders below this browser. */}
            <div className={GRID}>
              {flat.slice(0, visible).map((c, i) => (
                <div key={c.tcgplayerId ?? `${c.name}|${c.set}`}>
                  <Tile
                    card={c}
                    speciesName={name}
                    placement={
                      isFiltering
                        ? `${prefix}catalog_filtered`
                        : i >= INITIAL_FLAT
                          ? `${prefix}catalog_expanded`
                          : `${prefix}catalog`
                    }
                  />
                </div>
              ))}
            </div>
            {flat.length > INITIAL_FLAT && (
              <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
                {visible < flat.length && (
                  <button
                    type="button"
                    onClick={() => {
                      setShown((s) => s + FLAT_STEP);
                      track("Catalogue Expand", { set: name, placement: `${prefix}catalog_expanded`, count: flat.length });
                    }}
                    className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-semibold text-zinc-700 transition-colors hover:border-zinc-400 hover:text-black dark:border-zinc-700 dark:text-zinc-200"
                  >
                    Show more cards ({flat.length - visible} more)
                  </button>
                )}
                {visible < flat.length && (
                  <button
                    type="button"
                    onClick={() => {
                      setShown(flat.length);
                      track("Catalogue Expand", { set: name, placement: `${prefix}catalog_expanded`, count: flat.length, all: true });
                    }}
                    className="rounded-lg px-3 py-2 text-sm font-semibold text-red-600 hover:underline dark:text-red-500"
                  >
                    Show all {flat.length}
                  </button>
                )}
                {visible > INITIAL_FLAT && (
                  <button
                    type="button"
                    onClick={() => setShown(INITIAL_FLAT)}
                    className="rounded-lg px-3 py-2 text-sm font-semibold text-zinc-500 hover:underline dark:text-zinc-400"
                  >
                    Show fewer
                  </button>
                )}
              </div>
            )}
          </>
        )
      ) : filtered.length === 0 ? (
        <p className="mt-6 text-sm text-zinc-500 dark:text-zinc-400">
          No {name} cards match. <button type="button" onClick={clear} className="font-semibold text-red-600 hover:underline">Clear filters</button>
        </p>
      ) : isFiltering ? (
        <div className={GRID}>
          {flat.map((c) => (
            <Tile key={c.tcgplayerId ?? `${c.name}|${c.set}`} card={c} speciesName={name} placement="species_catalog_filtered" />
          ))}
        </div>
      ) : (
        <>
          <div className="mt-6 space-y-12">
            {groups.map(({ set, list }, i) => (
              <SetGroup
                key={set}
                set={set}
                list={list}
                speciesName={name}
                expandAll={expandAll}
                groupHidden={!showAllSets && !expandAll && i >= INITIAL_SET_GROUPS}
              />
            ))}
          </div>
          {groups.length > INITIAL_SET_GROUPS && !expandAll && (
            <button
              type="button"
              onClick={() => {
                setShowAllSets((v) => !v);
                if (!showAllSets) track("Catalogue Expand", { species: name, sets: groups.length });
              }}
              className="mt-8 w-full rounded-lg border border-zinc-300 py-2.5 text-sm font-semibold text-zinc-700 transition-colors hover:border-zinc-400 hover:text-black dark:border-zinc-700 dark:text-zinc-200"
            >
              {showAllSets
                ? "Show fewer sets"
                : `Show ${groups.length - INITIAL_SET_GROUPS} more ${name} sets →`}
            </button>
          )}
        </>
      )}
    </div>
  );
}
