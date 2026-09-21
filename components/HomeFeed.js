"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import Image from "next/image";
import FilterBar from "@/components/FilterBar";
import Pagination, { pageHref } from "@/components/Pagination";
import DealCard from "@/components/DealCard";
import MarketplaceScopeNote from "@/components/MarketplaceScopeNote";
import { EmptyStateEscapes } from "@/components/DealFilterChips";
import CardMemoryStrip from "@/components/CardMemoryStrip";
import EmailCapture from "@/components/EmailCapture";
import SectionHeader from "@/components/SectionHeader";
import GridSkeleton from "@/components/GridSkeleton";
import CardImagePlaceholder from "@/components/CardImagePlaceholder";
import HomeBrowseLinks from "@/components/HomeBrowseLinks";
import Price from "@/components/Price";
import HomepageAnalytics from "@/components/analytics/HomepageAnalytics";

// Homepage-caching r1: the country/sort/filter/page-driven part of the
// homepage feed, split out of app/page.js so that file can go back to
// reading no searchParams at all and stay statically cacheable at the
// edge (same reasoning + the same `window.location.search` /
// useSyncExternalStore approach as components/DealGrid.js, which does
// this for /pokemon/[slug] and /sets/[slug]; /deals uses DealGrid
// itself). RegionRedirect's client-side geo default writes ?country=
// into the URL for almost every real visitor shortly after hydration -
// before this component existed that redirect made the WHOLE homepage
// render dynamically (it read searchParams.country) on every one of
// those requests, not just once per country. Filter/sort/page variants
// are additionally kept out of the index via next.config.mjs's
// X-Robots-Tag rule for "/", the same mechanism /deals already uses.
//
// `initial` is page 1, no filters, no country - the exact server-
// rendered default (crawler-visible HTML, first paint). Any other URL
// state fetches its own {flagshipDeals, deals, totalPages} from
// /api/deals-page?kind=home.
function subscribe(onChange) {
  window.addEventListener("popstate", onChange);
  window.addEventListener("pdf:region", onChange);
  return () => {
    window.removeEventListener("popstate", onChange);
    window.removeEventListener("pdf:region", onChange);
  };
}
const getSnapshot = () => window.location.search;
const getServerSnapshot = () => "";

function parseSearch(search) {
  const sp = new URLSearchParams(search);
  const get = (k) => sp.get(k) || null;
  const num = (k) => (sp.get(k) ? Number(sp.get(k)) : null);
  const country = get("country");
  const cardType = get("type");
  const listingType = get("listing");
  const sort = get("sort");
  const maxPrice = num("maxPrice");
  const minPrice = num("minPrice");
  const page = Math.max(1, Number(sp.get("page")) || 1);
  // A `country` filter alone keeps the curated feed (deal-first review: a
  // region-set visitor still gets it, just scoped to deals they can buy).
  const anyFilter = Boolean(country || cardType || listingType || sort || maxPrice || minPrice);
  const showPromo = page === 1 && !cardType && !listingType && !sort && !maxPrice && !minPrice;
  const useStableList = page > 1 || Boolean(sort);
  return {
    country,
    cardType,
    listingType,
    sort,
    maxPrice,
    minPrice,
    page,
    anyFilter,
    showPromo,
    useStableList,
    raw: sp.toString(),
    obj: Object.fromEntries(sp.entries()),
  };
}

// Matches next.config.mjs's HOME_VARIANT_PARAMS - every URL key that
// changes what the flagship/grid content below should be.
const HOME_VARIANT_KEYS = ["country", "type", "listing", "minPrice", "maxPrice", "sort", "page"];

export default function HomeFeed({
  feedModes,
  initial,
  hubCounts = {},
  validSetSlugs = [],
  previewSize = 9,
  emailCaptureEnabled = false,
  liveCount = null,
  // the server-rendered "N live deals · checked X ago · disclosure" line
  // (app/page.js) - a finished element, so no relative time is computed here
  trustLine = null,
  topHubs = [],
}) {
  const search = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const params = useMemo(() => parseSearch(search), [search]);
  const reqKey = params.raw;

  const [fetched, setFetched] = useState(null); // { key, flagshipDeals, deals, totalPages, error }

  useEffect(() => {
    if (!params.raw) return; // "" = the bare default URL, already `initial`
    let cancelled = false;
    const q = new URLSearchParams({ kind: "home", previewSize: String(previewSize) });
    if (params.country) q.set("country", params.country);
    if (params.cardType) q.set("type", params.cardType);
    if (params.listingType) q.set("listing", params.listingType);
    if (params.sort) q.set("sort", params.sort);
    if (params.maxPrice) q.set("maxPrice", String(params.maxPrice));
    if (params.minPrice) q.set("minPrice", String(params.minPrice));
    q.set("page", String(params.page));
    fetch(`/api/deals-page?${q.toString()}`)
      .then((r) => r.json().then((d) => (r.ok || d?.error ? d : { ...d, error: `HTTP ${r.status}` })))
      .then((d) => {
        if (!cancelled)
          setFetched({
            key: reqKey,
            flagshipDeals: d.flagshipDeals ?? [],
            deals: d.deals ?? [],
            totalPages: d.totalPages ?? 1,
            error: d.error ?? null,
          });
      })
      .catch((e) => {
        if (!cancelled) setFetched({ key: reqKey, flagshipDeals: [], deals: [], totalPages: 1, error: e.message });
      });
    return () => {
      cancelled = true;
    };
  }, [reqKey, params, previewSize]);

  const loading = Boolean(params.raw) && fetched?.key !== reqKey;
  const fresh = !params.raw
    ? { flagshipDeals: initial.flagshipDeals, deals: initial.deals, totalPages: 1, error: null }
    : loading
      ? null
      : { flagshipDeals: fetched.flagshipDeals, deals: fetched.deals, totalPages: fetched.totalPages, error: fetched.error };

  // CLS fix 2026-09-21. While a variant fetch is in flight this rendered
  // an EMPTY feed, so the grid collapsed and then re-expanded - two
  // layout shifts of the whole page below it. Lighthouse measured the
  // pair at 0.80 on desktop and 0.34 on mobile, and it fires on an
  // ordinary first visit: RegionRedirect applies the geo default once
  // /api/rates resolves, which changes the params and starts this fetch.
  //
  // Now the feed keeps showing what is already on screen until the next
  // one is ready. Nothing about the outcome changes - the same final
  // content, the same geo default, the same order - and the stale frame
  // is the same content the visitor was already looking at, because it
  // is what the server rendered. It is marked aria-busy and dimmed
  // (opacity only, which cannot shift layout) so the update is visible.
  const lastShown = useRef(null);
  if (fresh) lastShown.current = fresh;
  const view = fresh ?? lastShown.current ?? { flagshipDeals: [], deals: [], totalPages: 1, error: null };

  const feedEmpty = !loading && !view.error && view.flagshipDeals.length === 0 && (view.deals?.length ?? 0) === 0;

  // Hands off from the inline guard script's static placeholder (below) to
  // this component's own, already-correct rendering the instant this
  // component actually mounts - by then the very first render above has
  // already computed the real params from the true URL
  // (useSyncExternalStore corrects off the empty server snapshot before
  // this effect can fire). Same mechanism as DealGrid's guardColdNav.
  useEffect(() => {
    const wrap = document.getElementById("pdf-home-wrap");
    const placeholder = document.getElementById("pdf-home-loading");
    if (wrap) wrap.hidden = false;
    if (placeholder) placeholder.hidden = true;
  }, []);

  // 2026-09-22 redesign: TABS, not pills. The strip is the page's deal
  // navigation, and a row of seven outlined pills competes with the red
  // CTAs below it for the same attention. A tab row with the current
  // entry underlined in brand red reads as navigation, leaves red
  // meaning "act" everywhere else, and is what the reference design
  // shows. min-h-11 keeps every entry a 44px touch target.
  const chip = (active) =>
    `inline-flex min-h-11 shrink-0 items-center whitespace-nowrap border-b-2 px-3 text-sm transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-red-600 ${
      active
        ? "border-red-600 font-bold text-zinc-900 dark:text-zinc-50"
        : "border-transparent font-medium text-zinc-600 hover:border-zinc-300 hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-zinc-50"
    }`;

  return (
    <>
      <HomepageAnalytics
        variant={params.showPromo ? "promo" : params.page > 1 ? "paged" : "filtered"}
        page={params.page}
        hasFilters={params.anyFilter}
      />

      {/* THE FEED - one dominant deal feed: the premium-gated flagship
          row (best_deals) then the diverse preview grid (all_deals), the
          mode row above it, "More filters" for the full filter set, and
          the paginated / filtered list on any non-default view. Section
          ids keep their established analytics meaning. */}
      <main id="deals" tabIndex={-1} className="mx-auto w-full max-w-7xl flex-1 scroll-mt-6 px-6 py-5">
        {/* Feed controls, kept to two short rows above the first offer:
            (1) the section face + the nine mode links - one wrapping row
            on desktop, a horizontally scrolling row on phones (every link
            stays in the DOM and crawlable; the rightmost chips need a
            swipe); (2) the live-count + trust line. The full FilterBar
            ("More filters") sits between the flagship row and the grid it
            filters, so it no longer pushes the first offer down. */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <SectionHeader
          kicker={params.anyFilter ? "Filtered" : "Buy it now and auctions"}
          title={params.anyFilter ? "Filtered deals" : params.page > 1 ? `All deals - page ${params.page}` : "Deals to explore"}
        />
        <nav
          aria-label="Deal modes"
          // Scrolls horizontally at every width now it is a tab row: a
          // wrapping second line of tabs reads as two rows of navigation
          // rather than one, and the underline no longer lines up.
          className="-mx-6 flex basis-full items-center gap-1 overflow-x-auto border-b border-zinc-200 px-6 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden lg:mx-0 lg:min-w-0 lg:flex-1 lg:basis-0 lg:px-0 dark:border-zinc-800"
        >
          {feedModes.map((m) => (
            <a
              key={m.href}
              href={m.href}
              rel={m.href.includes("?") ? "nofollow" : undefined}
              aria-current={m.home && params.showPromo ? "page" : undefined}
              data-analytics-click="start_here_clicked"
              data-analytics-props={JSON.stringify({ section: "feed_modes", chip: m.chip, ...(m.graded ? { graded_entry: true, source: "start_here" } : {}) })}
              className={chip(m.home && params.showPromo)}
            >
              {/* The icon is decorative: the label beside it already
                  names the destination, so it is hidden from assistive
                  tech rather than read out as "fire Best Deals". */}
              {m.icon && <span aria-hidden="true" className="mr-1.5 text-base leading-none">{m.icon}</span>}
              {m.label}
            </a>
          ))}
          {(params.useStableList || params.page > 1 || (params.anyFilter && !params.showPromo)) && (
            <a
              href="/"
              data-analytics-click="filter_cleared"
              data-analytics-props={JSON.stringify({ facet: "all", context: "all_deals" })}
              className="inline-flex min-h-11 shrink-0 items-center whitespace-nowrap px-2 text-sm font-medium text-zinc-600 underline-offset-2 hover:text-red-600 hover:underline dark:text-zinc-300 dark:hover:text-red-500"
            >
              Clear filters
            </a>
          )}
        </nav>
      </div>

      {trustLine}

      {view.error && <p className="mt-4 rounded-lg bg-red-50 p-4 text-red-700">Couldn&apos;t load deals: {view.error}</p>}

      {feedEmpty && (
        <div className="mt-4 rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950">
          <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
            {params.anyFilter
              ? "No live deals match these filters right now."
              : "No deals to show right now — the next scheduled scan will refresh this."}
          </p>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            {params.anyFilter
              ? "These filters run against real, currently-active listings — nothing was broadened."
              : "Every deal is a live listing checked against real market data."}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs font-medium">
            {params.anyFilter && (
              <a
                href="/"
                data-analytics-click="filter_cleared"
                data-analytics-props={JSON.stringify({ facet: "all", context: "empty_state" })}
                className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 font-semibold text-black hover:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
              >
                Clear filters
              </a>
            )}
            <EmptyStateEscapes />
          </div>
        </div>
      )}

      <div id="pdf-home-wrap" aria-busy={loading || undefined} className={loading ? "opacity-60 transition-opacity" : "transition-opacity"}>
        {params.showPromo && view.flagshipDeals.length > 0 && (
          <section id="best-deals" data-analytics-section="best_deals" aria-label="Best deals right now" className="mt-4 scroll-mt-24">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5 lg:grid-cols-4">
              {view.flagshipDeals.map((deal, i) => (
                <DealCard key={deal.id} deal={deal} rank={i + 1} hub={hubCounts[deal.watchlist_id]} pageName="home_best" validSetSlugs={validSetSlugs} priority={i < 2} analytics={{ section: "best_deals", rank: i + 1 }} />
              ))}
            </div>
          </section>
        )}

        <div className="mt-4" data-analytics-filter-bar="all_deals">
          <FilterBar
            params={params.obj}
            country={params.country}
            cardType={params.cardType}
            listingType={params.listingType}
            maxPrice={params.maxPrice}
            minPrice={params.minPrice}
            sort={params.sort}
            collapsible
          />
        </div>

        <section data-analytics-section="all_deals" aria-label={params.anyFilter ? "Filtered deals" : "More deals"} className="mt-4">
          <MarketplaceScopeNote params={params.obj} basePath="/" thin={params.page === 1 && (view.deals?.length ?? 0) < 8} />
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {view.deals?.map((deal) => (
              <DealCard key={deal.id} deal={deal} hub={hubCounts[deal.watchlist_id]} validSetSlugs={validSetSlugs} pageName="home_all_deals" />
            ))}
          </div>

          {!params.useStableList ? (
            view.deals?.length > 0 && (
              <div className="mt-8 flex flex-col items-center gap-2">
                <a
                  href="/deals"
                  data-analytics-click="browse_all_deals_clicked"
                  data-analytics-props={JSON.stringify({ section: "all_deals" })}
                  className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-zinc-300 bg-white px-6 text-sm font-semibold text-zinc-900 transition-colors hover:border-zinc-400 hover:bg-zinc-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50 dark:hover:bg-zinc-800"
                >
                  Browse all live deals
                  {liveCount != null && (
                    <span className="tnum rounded-md bg-zinc-100 px-1.5 py-0.5 text-xs font-bold text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200">
                      {liveCount.toLocaleString()}
                    </span>
                  )}
                  <span aria-hidden="true">→</span>
                </a>
                <a
                  href={pageHref(params.obj, 2, "/")}
                  className="text-xs font-medium text-zinc-500 underline-offset-2 hover:text-red-600 hover:underline dark:text-zinc-400 dark:hover:text-red-500"
                >
                  or keep scrolling this page
                </a>
              </div>
            )
          ) : (
            <Pagination page={params.page} totalPages={view.totalPages} params={params.obj} basePath="/" />
          )}
        </section>
      </div>
      {/* Static fallback for the pre-hydration window on a cold navigation
          straight to a variant URL (e.g. a FEED_MODES chip) - never shown
          once React has mounted (the effect above hides it immediately).
          Same mechanism as DealGrid's guardColdNav. */}
      <div id="pdf-home-loading" hidden>
        <GridSkeleton />
      </div>
      <noscript>
        <style>{"#pdf-home-loading{display:none!important}"}</style>
      </noscript>
      <script
        dangerouslySetInnerHTML={{
          __html: `(function(){try{
            var sp=new URLSearchParams(location.search);
            var keys=${JSON.stringify(HOME_VARIANT_KEYS)};
            var hasVariant=keys.some(function(k){return sp.get(k);});
            if(!hasVariant)return;
            var wrap=document.getElementById('pdf-home-wrap');
            var ph=document.getElementById('pdf-home-loading');
            if(wrap)wrap.hidden=true;
            if(ph)ph.hidden=false;
          }catch(e){}})();`,
        }}
      />

      {params.showPromo && <CardMemoryStrip />}

      {params.showPromo && emailCaptureEnabled && (
        <EmailCapture placement="homepage" pageType="homepage" className="mt-10" />
      )}
      </main>

      {/* EXPLORE - compact catalogue / collecting entry points: the three
          hubs, the six cards with the most active listings (real counts),
          and the static Popular Pokemon / Key sets rows. Every link and
          click event from the previous "Explore Pokemon cards" section is
          preserved. */}
      {params.showPromo && (
        <section data-analytics-section="browse" className="border-t border-zinc-200 dark:border-zinc-800">
          <div className="mx-auto max-w-7xl px-6 py-10">
            <SectionHeader kicker="Know what you want" title="Explore more ways to collect" />

            <div className="mt-5 grid gap-4 sm:grid-cols-3">
              {[
                { href: "/sets", event: "browse_sets_clicked", title: "Sets & checklists", copy: "Set checklists with market-reference prices - track a set and mark what you own." },
                { href: "/pokemon", event: "browse_pokemon_clicked", title: "Pokemon cards", copy: "Card prices and values for a species across all its prints and sets - plus any current deal." },
                { href: "/cards", event: "browse_catalogue_clicked", title: "Card database", copy: "Find an exact printing - a permanent page for every card we track, with a real market reference where one exists." },
              ].map((t) => (
                <a
                  key={t.href}
                  href={t.href}
                  data-analytics-click={t.event}
                  data-analytics-props={JSON.stringify({ section: "browse" })}
                  className="group flex items-center justify-between gap-4 rounded-xl border border-zinc-200 bg-white p-5 transition-colors hover:border-zinc-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600 dark:border-zinc-800 dark:bg-zinc-950 dark:hover:border-zinc-600"
                >
                  <div>
                    <p className="text-base font-semibold text-zinc-900 dark:text-zinc-50">{t.title}</p>
                    <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">{t.copy}</p>
                  </div>
                  <span className="text-xl text-zinc-300 transition-colors group-hover:text-red-600 dark:text-zinc-600">→</span>
                </a>
              ))}
            </div>

            {topHubs.length > 0 && (
              <div className="mt-8">
                <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
                  <h3 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-400">
                    Cards with the most active listings
                  </h3>
                  <a
                    href="/market-data/most-listed-cards"
                    className="text-xs font-medium text-zinc-600 underline-offset-2 hover:text-red-600 hover:underline dark:text-zinc-300 dark:hover:text-red-500"
                  >
                    Compare all →
                  </a>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
                  {topHubs.map((hub, i) => (
                    <a
                      key={hub.id}
                      href={`/cards/${hub.slug}`}
                      data-analytics-click="most_active_clicked"
                      data-analytics-props={JSON.stringify({ section: "most_active", card_slug: hub.slug, content_id: hub.slug, rank: i + 1 })}
                      className="group flex flex-col overflow-hidden rounded-xl border border-zinc-200 bg-white transition-colors hover:border-zinc-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600 dark:border-zinc-800 dark:bg-zinc-950 dark:hover:border-zinc-600"
                    >
                      <div className="relative aspect-square w-full bg-zinc-50 dark:bg-zinc-900">
                        {hub.image ? (
                          <Image
                            src={hub.image}
                            alt={`${hub.name} - ${hub.set}`}
                            fill
                            sizes="(max-width: 640px) 50vw, 16vw"
                            className="object-contain p-2"
                          />
                        ) : (
                          <CardImagePlaceholder />
                        )}
                        <span className="absolute right-1.5 top-1.5 rounded-md bg-zinc-900/85 px-1.5 py-0.5 text-[11px] font-bold text-white">
                          {hub.count} {hub.count === 1 ? "listing" : "listings"}
                        </span>
                      </div>
                      <div className="p-2.5">
                        <p className="line-clamp-1 text-xs font-semibold text-zinc-900 dark:text-zinc-50">{hub.name}</p>
                        <p className="line-clamp-1 text-[11px] text-zinc-500">{hub.set}</p>
                        <p className="tnum mt-1 text-xs font-bold text-zinc-900 dark:text-zinc-50">
                          from <Price usd={hub.cheapestPrice} native={{ amount: hub.cheapestPrice, currency: "USD" }} />
                        </p>
                      </div>
                    </a>
                  ))}
                </div>
              </div>
            )}

            <HomeBrowseLinks />
          </div>
        </section>
      )}
    </>
  );
}
