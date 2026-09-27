import Image from "next/image";
import { wrapEbayAffiliateUrl } from "@/lib/ebayLinks";
import { fetchBoardDeals } from "@/lib/boardDealsFeed";

// "More deals" (2026-09-27) - listings published by the external deal board,
// shown with the board's own captured discount: a FRESH row (by the board's
// found-at, within lib/boardDeals.UNVERIFIED_FRESH_HOURS) at once and
// unverified, on the plain listing URL wrapped with our campaign; older rows
// only after OUR eBay lookup confirmed them live at the captured price. The
// owner accepted the unverified trade-off on 27 Sep (a row may have sold or
// changed price before its lookup), and the surface note says to check.
//
// What this surface deliberately does NOT do:
//   * name, brand, credit or link the source (the source URL and capture
//     time live inside the record, for auditing only);
//   * present the figure as the site's own evidenced saving - it sits on
//     this separate surface, styled as a listed discount, with a one-line
//     note that it is not our comparison. The site's green evidenced-saving
//     badge and its Price-details evidence never appear here;
//   * invent a reference price: nothing is shown but the live listing price
//     and the captured percentage.
// The eBay button is the site's own EPN link (eBay's itemAffiliateWebUrl for
// our campaign, re-wrapped with this page's placement).
//
// Async server component: fetches its own (tag-cached) rows unless a page
// hands it `deals`, so a page adds it with one line and no data plumbing.
export default async function BoardDealsSection({ deals = null, page = "deals", heading = "More deals", limit = 12 }) {
  const rows = deals ?? (await fetchBoardDeals({ limit }));
  const items = (rows ?? []).filter((d) => d?.affiliateUrl && d.price > 0 && d.discountPct > 0);
  if (items.length === 0) return null;

  return (
    <section aria-labelledby="board-deals" className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <h2 id="board-deals" className="text-xl font-bold tracking-tight text-zinc-900 sm:text-2xl dark:text-zinc-50">
          {heading}
        </h2>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          New finds every 30 minutes. The percentage is the listed discount, not our own market comparison; check the listing on eBay before buying.
        </p>
      </div>
      <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {items.map((d) => {
          const href = wrapEbayAffiliateUrl(d.affiliateUrl, { page, placement: "feature" });
          const meta = [d.variant, d.format, d.marketplaceShort ? `${d.marketplaceFlag ?? ""} eBay ${d.marketplaceShort}`.trim() : null].filter(Boolean);
          return (
            <li key={d.id} className="flex flex-col overflow-hidden rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
              <div className="relative aspect-[4/5] w-full bg-zinc-50 dark:bg-zinc-950">
                {d.image ? (
                  <Image src={d.image} alt={d.name ? `${d.name}${d.set ? ` (${d.set})` : ""}` : d.title ?? ""} fill sizes="(min-width: 1024px) 25vw, (min-width: 640px) 50vw, 100vw" className="object-contain p-2" />
                ) : null}
                <span className="absolute left-2 top-2 rounded-md bg-zinc-900/90 px-2 py-0.5 text-xs font-semibold text-white dark:bg-zinc-100/90 dark:text-zinc-900">
                  {d.discountPercentText}
                </span>
              </div>
              <div className="flex flex-1 flex-col gap-1 p-3">
                <p className="line-clamp-1 text-sm font-semibold text-zinc-900 dark:text-zinc-50">{d.name ?? d.title}</p>
                {d.set ? <p className="line-clamp-1 text-xs text-zinc-600 dark:text-zinc-400">{d.set}</p> : null}
                <p className="mt-1 text-base font-bold text-zinc-900 dark:text-zinc-50">{d.priceText}</p>
                {meta.length ? <p className="text-xs text-zinc-500 dark:text-zinc-400">{meta.join(" · ")}</p> : null}
                <a
                  href={href}
                  target="_blank"
                  rel="nofollow sponsored noopener"
                  className="mt-2 inline-flex items-center justify-center rounded-lg bg-red-600 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600"
                >
                  View on eBay
                </a>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
