"use client";

import { useSyncExternalStore } from "react";
import { REGION_KEY } from "@/components/RegionControl";
import { useCurrency } from "@/components/CurrencyProvider";
import { MARKETPLACES } from "@/lib/ebayLinks";
import { allMarketplacesHref, DELIVERY_NOT_CONFIRMED, effectiveMarketplaceScope, marketplaceName } from "@/lib/marketplaceScope";

// marketplace-broaden-r1: which marketplaces these results come from, and
// the way out of a single-marketplace scope. Rendered above results on
// DealGrid pages (graded, categories, species, sets, /deals) and on the
// homepage, /best-finds and /japanese-cards.
//
//   one marketplace -> "Showing listings on eBay Germany only." + "Browse
//                      all marketplaces" (every filter kept, page reset).
//                      `additional` (exact, or null) adds "N more
//                      listings" only when the caller computed it from the
//                      same eligibility rules, filters and listing
//                      identities as the destination; `thin` makes the
//                      note prominent.
//   all marketplaces -> the delivery-not-confirmed note, decided from the
//                      EFFECTIVE scope (lib/marketplaceScope), so a saved
//                      All marketplaces preference on a URL without
//                      ?country= shows it too.
//
// pinned: the page mounts RegionRedirect (everything except /deals).

function subscribeStored(onChange) {
  window.addEventListener("storage", onChange);
  window.addEventListener("pdf:region", onChange);
  window.addEventListener("popstate", onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener("pdf:region", onChange);
    window.removeEventListener("popstate", onChange);
  };
}
function readStored() {
  try {
    return window.localStorage.getItem(REGION_KEY);
  } catch {
    return null;
  }
}
const storedOnServer = () => undefined;

export default function MarketplaceScopeNote({ params, basePath, pinned = true, allByDefault = false, additional = null, thin = false }) {
  const stored = useSyncExternalStore(subscribeStored, readStored, storedOnServer);
  const { marketplace: detected, rates } = useCurrency();
  const scope = effectiveMarketplaceScope({
    urlCountry: params.country,
    pinned: pinned && !allByDefault,
    stored,
    geoResolved: Boolean(rates),
    detected,
  });

  if (scope.kind === "one") {
    const { code } = scope;
    const more =
      typeof additional === "number" && additional > 0
        ? `Browse all marketplaces (+${additional.toLocaleString("en-US")} more listing${additional === 1 ? "" : "s"})`
        : "Browse all marketplaces";
    return (
      <div
        data-marketplace-scope={code}
        className={
          thin
            ? "mb-4 rounded-xl border border-zinc-200 bg-white p-4 text-sm text-zinc-700 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-200"
            : "mb-4 text-sm text-zinc-600 dark:text-zinc-300"
        }
      >
        <p>
          <span aria-hidden="true">{MARKETPLACES[code].flag}</span> Showing listings on {marketplaceName(code)} only
          {thin ? " - there are few here for this selection." : "."}{" "}
          <a
            href={allMarketplacesHref(params, basePath, { defaultIsAll: allByDefault })}
            rel="nofollow"
            data-marketplace-choice="all"
            data-analytics-click="filter_cleared"
            data-analytics-props={JSON.stringify({ facet: "country", context: thin ? "thin_results" : "scope_note" })}
            className="font-semibold text-red-600 underline underline-offset-2 dark:text-red-500"
          >
            {more}
          </a>
        </p>
      </div>
    );
  }
  if (scope.kind === "all") {
    return (
      <p data-marketplace-scope="all" className="mb-4 text-xs text-zinc-500 dark:text-zinc-400">
        <span aria-hidden="true">🌐</span> {DELIVERY_NOT_CONFIRMED}
      </p>
    );
  }
  return null;
}
