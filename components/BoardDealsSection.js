import Link from "next/link";
import { fetchBoardDeals, fetchBoardDealsCount } from "@/lib/boardDealsFeed";
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
// Async server component: fetches its own (tag-cached) rows unless a page
// hands it `deals`, so a page adds it with one line and no data plumbing.
// `limit` rows here; the "See all" link goes to /more-deals for the rest.
export default async function BoardDealsSection({ deals = null, page = "deals", heading = "More deals", limit = 12 }) {
  const [rows, total] = await Promise.all([deals ?? fetchBoardDeals({ limit }), fetchBoardDealsCount()]);
  const items = (rows ?? []).filter((d) => d?.affiliateUrl && d.price > 0 && d.discountPct > 0);
  if (items.length === 0) return null;

  return (
    <section aria-labelledby="board-deals" className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <h2 id="board-deals" className="text-xl font-bold tracking-tight text-zinc-900 sm:text-2xl dark:text-zinc-50">
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
          <Link href="/more-deals" className="text-sm font-semibold text-red-600 hover:underline dark:text-red-500">
            See all {total.toLocaleString()} more deals →
          </Link>
        </p>
      ) : null}
    </section>
  );
}
