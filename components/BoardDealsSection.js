import Link from "next/link";
import { fetchBoardDealsPage } from "@/lib/boardDealsFeed";
import BoardDealCard from "@/components/BoardDealCard";

// "More deals" (2026-09-27) - listings published by external deal boards,
// shown with the board's own published saving: a FRESH row (by the board's
// found-at, or while the second board still lists it) at once and
// unverified, on the plain listing URL wrapped with our campaign; older rows
// only after OUR eBay lookup confirmed them live at the captured price. The
// owner accepted the unverified trade-off on 27 Sep (a row may have sold or
// changed price before its lookup) and, later that day, asked for the
// published figure to be shown AS the saving ("these sites are accurate
// already so we should be showing what they're saying in the savings").
//
// What this surface deliberately does NOT do:
//   * name, brand, credit or link the source (the source URL and capture
//     time live inside the record, for auditing only);
//   * mix these rows into the evidenced grid: they carry their own
//     `verified` flag in the record, and the site's Price-details evidence
//     never appears here;
//   * invent a reference price: the market value shown is the one the
//     row was published with.
// The eBay button is the site's own EPN link (eBay's itemAffiliateWebUrl for
// our campaign, re-wrapped with this page's placement).
//
// 28 Sep 2026 (owner: "Sealed Deals, singles, and graded should all appear
// from the scrape into the categories ... It should feed all through the
// site. As well as product location"): the section now takes the surface's
// own filters - `kind` (graded | sealed | raw), `market` (EBAY_*), `format`
// (bin | auction), `maxPriceUsd` - so a category page shows the imported
// rows that belong to it (graded on /deals/graded, sealed on /sealed-deals,
// the UK's on /deals/uk, under $50 on /deals/under-50), and "See all" opens
// /more-deals with the same filters. The rows stay a separate surface from
// the evidenced grid; only the selection follows the page.
//
// Async server component: fetches its own (tag-cached) rows unless a page
// hands it `deals`, so a page adds it with one line and no data plumbing.
// `limit` rows here; the "See all" link goes to /more-deals for the rest.
function moreDealsHref({ kind, market, format, maxPriceUsd }) {
  const q = new URLSearchParams();
  if (market) q.set("market", market);
  if (kind) q.set("kind", kind);
  if (format) q.set("format", format);
  if (maxPriceUsd) q.set("maxPrice", String(maxPriceUsd));
  const s = q.toString();
  return s ? `/more-deals?${s}` : "/more-deals";
}

export default async function BoardDealsSection({ deals = null, page = "deals", heading = "More deals", limit = 12, kind = null, market = null, format = null, maxPriceUsd = null, id = "board-deals", headingStyle = "page" }) {
  const filters = { kind: kind || null, market: market || null, format: format || null, maxPriceUsd: maxPriceUsd || null };
  let rows = deals;
  let total = 0;
  if (rows) {
    total = rows.length;
  } else {
    const result = await fetchBoardDealsPage({ page: 1, pageSize: limit, ...filters });
    rows = result?.rows ?? [];
    total = result?.total ?? rows.length;
  }
  const items = (rows ?? []).filter((d) => d?.affiliateUrl && d.price > 0 && d.discountPct > 0);
  if (items.length === 0) return null;
  const seeAll = moreDealsHref(filters);
  return (
    <section id={id} aria-labelledby={`${id}-heading`} className={headingStyle === "sub" ? "scroll-mt-6" : "mx-auto w-full max-w-7xl px-4 py-10 sm:px-6"}>
      <div className="flex flex-wrap items-end justify-between gap-2">
        <h2
          id={`${id}-heading`}
          className={
            headingStyle === "sub"
              ? "text-sm font-semibold uppercase tracking-wide text-zinc-600 dark:text-zinc-400"
              : "text-xl font-bold tracking-tight text-zinc-900 sm:text-2xl dark:text-zinc-50"
          }
        >
          {heading}
        </h2>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          New finds every 30 minutes. Savings are against each listing&apos;s published market value; check the listing on eBay before buying.
        </p>
      </div>
      <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {items.map((d) => (
          <BoardDealCard key={d.id} deal={d} page={page} />
        ))}
      </ul>
      {total > items.length ? (
        <p className="mt-4">
          {/* the unfiltered link keeps its literal href for the source pin (BD-13) */}
          {seeAll === "/more-deals" ? (
            <Link href="/more-deals" className="text-sm font-semibold text-red-600 hover:underline dark:text-red-500">
              See all {total.toLocaleString()} more deals →
            </Link>
          ) : (
            <Link href={seeAll} className="text-sm font-semibold text-red-600 hover:underline dark:text-red-500">
              See all {total.toLocaleString()} matching deals →
            </Link>
          )}
        </p>
      ) : null}
    </section>
  );
}
