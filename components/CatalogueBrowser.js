"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { track } from "@vercel/analytics";
import { hasPrice, MARKETPLACE_CURRENCY, refInListingCurrency } from "@/lib/money";
import { offerShipping } from "@/lib/offerPresentation";
import Price from "@/components/Price";
import { cardNameWithoutNumber, cardIdentityLine } from "@/lib/cardName";
import { useCatalogueView } from "@/components/CatalogueViews";
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
// button - the full list stays in the DOM (SSR) the whole time. 6, not 12,
// since the gallery became the default view (mobile UX refinement,
// 2026-09-14): 12 image-heavy groups made a phone page ~21,000px tall.
const INITIAL_SET_GROUPS = 6;

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

// `showSet` is false on a set page, where every tile is the same set and
// repeating its name pushed the collector number off the end of the line.
export function Tile({ card, speciesName, placement, showSet = true }) {
  const region = useRegion();
  const href = permanentHref(card);
  // The identity line below prints "#<number>", so the name shows the
  // number only once (lib/cardName cardNameWithoutNumber).
  const name = cardNameWithoutNumber(card);
  const meta = cardIdentityLine(showSet ? card : { ...card, set: null }, { withHash: true, withRarity: false });
  const isDeal = Boolean(card.deal);
  const isAuction = card.deal?.listingType === "AUCTION";
  const discountPct = card.deal?.discountPct != null ? Math.round(card.deal.discountPct * 100) : null;
  // Same shipping-uncertainty contract as every other savings renderer
  // (DealCard, SpeciesCard, SealedDealCard, lib/offerPresentation): an
  // unconfirmed-shipping saving is always stated "before shipping", and a
  // row with no shipping breakdown at all claims no saving here either -
  // this compact tile must never show a bare "% below market" that the
  // full deal page would qualify or withhold.
  const shipping = isDeal ? offerShipping(card.deal) : null;
  const showSavings = isDeal && discountPct != null && discountPct > 0 && shipping.savingClaim !== "none";
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
      {showSavings && (
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

      <div className="flex flex-1 flex-col gap-1 p-3 sm:p-4">
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
        <p className="line-clamp-2 break-words text-xs text-zinc-500 dark:text-zinc-400">{meta || " "}</p>
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
              {/* P0 auction-price-integrity: card.deal.cheapest* is the
                  bid + shipping LANDED total. On an auction tile it is
                  labelled "est. total", never "current bid" - the full
                  bid / shipping split lives on the deal card + detail
                  page. */}
              {isAuction && (
                <p className="text-[10px] font-medium uppercase tracking-wide text-amber-600 dark:text-amber-500">
                  Est. total
                </p>
              )}
              <p className="text-lg font-bold text-emerald-700 dark:text-emerald-500">
                <Money
                  usd={card.deal.cheapestUsd}
                  native={{ amount: card.deal.cheapestNative, currency: dealCcy }}
                />
              </p>
              {showSavings && (
                isAuction ? (
                  <p className="text-xs font-semibold text-amber-600 dark:text-amber-500">
                    {discountPct}% under ref{shipping.savingQualifier} · auction, bids can rise
                  </p>
                ) : (
                  <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-500">{discountPct}% below market{shipping.savingQualifier}</p>
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

        {/* Phone-width tiles: the art and name already open the card (same
            view_card tracking), so the separate View Card button is hidden
            below sm and the eBay action gets the full width on one line. */}
        <div className="mt-auto flex gap-2 pt-3">
          {href && (
            <Link
              href={href}
              onClick={viewCard}
              className="hidden min-h-10 flex-1 items-center justify-center rounded-lg border border-zinc-300 px-3 py-2 text-center text-xs sm:inline-flex font-semibold text-zinc-700 transition-colors hover:border-zinc-400 hover:text-black dark:border-zinc-700 dark:text-zinc-200 dark:hover:text-zinc-50"
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
              className="inline-flex min-h-10 flex-1 items-center justify-center rounded-lg bg-emerald-600 px-3 py-2 text-center text-xs font-semibold text-white transition-colors hover:bg-emerald-700"
            >
              {isAuction ? "Bid on eBay" : "View on eBay"}
            </AffiliateLink>
          ) : (
            <a
              href={localizeEbaySearchUrl(card.ebayHref, region)}
              target="_blank"
              rel="sponsored noopener noreferrer"
              onClick={() => track("eBay Click", { ...ev, cta: "find_on_ebay", card: card.name, marketplace: region || "unknown" })}
              className="inline-flex min-h-10 flex-1 items-center justify-center rounded-lg bg-zinc-900 px-3 py-2 text-center text-xs font-semibold text-white transition-colors hover:bg-zinc-800 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
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
                showSet={false}
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
          {open ? "Show fewer" : `Show all ${list.length} cards in this set →`}
        </button>
      )}
    </section>
  );
}

export default function CatalogueBrowser({ speciesName, label, items, variant = "species", totalCount }) {
  const name = label ?? speciesName;
  const isSet = variant === "set";
  const prefix = isSet ? "set_" : "species_";
  // When the page capped what it handed us (large catalogue), say so and
  // offer the complete list (the CatalogueLinkIndex in the List view).
  const capped = Number.isFinite(totalCount) && totalCount > items.length;
  const catalogueView = useCatalogueView();

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
        {/* Phone: search on its own row, filters/sort share a compact grid
            below it instead of stacking three full-width rows. */}
        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search cards"
            aria-label={`Search ${name} cards by name, number or rarity`}
            className="col-span-2 min-h-11 min-w-0 flex-1 rounded-lg border border-zinc-300 px-3 py-2 text-base sm:text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
          />
          {!isSet && (
            <select
              value={setFilter}
              onChange={(e) => setSetFilter(e.target.value)}
              aria-label="Filter by set"
              className="min-h-11 min-w-0 rounded-lg border border-zinc-300 px-2 py-2 text-base sm:text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
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
            className={`min-h-11 min-w-0 rounded-lg border border-zinc-300 px-2 py-2 text-base sm:text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 ${isSet ? "col-span-2" : ""}`}
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
            className={`min-h-11 min-w-0 rounded-lg border border-zinc-300 px-2 py-2 text-base sm:text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 col-span-2`}
          >
            {Object.entries(SORTS).map(([k, v]) => (
              <option key={k} value={k}>
                Sort: {v.label}
              </option>
            ))}
          </select>
        </div>
        {/* The page heading already states the tracked total, so a count
            line only appears when it says something new: a filtered result,
            or a capped gallery. */}
        {(capped || isFiltering || !isSet) && (
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              {isFiltering ? (
                `${filtered.length} of ${items.length} ${items.length === 1 ? "card" : "cards"}${capped ? " shown in the gallery" : ""}`
              ) : capped ? (
                <>
                  {`Gallery shows the ${items.length} highest-value of ${totalCount} cards. `}
                  {catalogueView ? (
                    <button type="button" onClick={() => catalogueView.setView("list")} className="font-semibold text-red-600 underline underline-offset-2 dark:text-red-500">
                      {`See all ${totalCount} in the list`}
                    </button>
                  ) : null}
                </>
              ) : null}
            </p>
            <div className="flex items-center gap-3">
              {isFiltering && (
                <button type="button" onClick={clear} className="min-h-10 text-xs font-semibold text-red-600 hover:underline dark:text-red-500">
                  Clear filters
                </button>
              )}
              {!isSet && !isFiltering && (
                <label className="flex min-h-10 cursor-pointer items-center gap-1.5 text-xs font-semibold text-zinc-600 dark:text-zinc-300">
                  <input type="checkbox" checked={expandAll} onChange={(e) => setExpandAll(e.target.checked)} />
                  Expand all sets
                </label>
              )}
            </div>
          </div>
        )}
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
                    showSet={false}
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
