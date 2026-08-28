import Link from "next/link";
import Price from "@/components/Price";

// A price/value summary that leads the card page - so a "<card> <set>
// price / value / PSA 10 price" search is answered above the fold, not
// only by the deal grid and the detailed variant grid further down.
//
// Every figure here is real data from PokemonPriceTracker (raw market
// price, per-condition prices, graded sold-sale medians). Nothing is
// fabricated: a condition tier only shows when it forms a sane
// (non-increasing) ladder from Near Mint, a graded tier only shows when
// it has at least one real recorded sale, and low-confidence tiers are
// labelled as such. The live-eBay figure is explicitly called an asking
// price, not a value.

function usd(n) {
  return `$${Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function conditionLadder(analysis) {
  const cb = analysis?.conditionBreakdown ?? [];
  const nm =
    cb.find((c) => /near mint/i.test(c.condition))?.price ?? analysis?.raw?.currentPrice ?? null;
  if (nm == null) return [];
  // Keep only leading rows that never rise above Near Mint and never
  // increase as condition worsens - a rise means the underlying data for
  // that card is contaminated, so stop rather than show a nonsense
  // "Damaged costs more than Near Mint" row.
  const out = [];
  let prev = Infinity;
  for (const c of cb) {
    if (c.price == null || c.price > nm * 1.02 || c.price > prev) break;
    out.push(c);
    prev = c.price;
  }
  return out.length >= 2 ? out : [];
}

export default function CardPriceSummary({ analysis, offersCount = 0, listingsLowUsd = null }) {
  const rawNm = analysis?.raw?.currentPrice ?? null;
  const ladder = conditionLadder(analysis);
  const graded = (analysis?.graded ?? [])
    .filter((g) => g.currentPrice != null && g.saleCount > 0)
    .slice(0, 5);

  // Nothing worth showing (no reference data at all, no listings figure).
  if (rawNm == null && graded.length === 0 && listingsLowUsd == null) return null;

  return (
    <section className="mt-6 rounded-xl border border-zinc-200 bg-white p-6 shadow-card dark:border-zinc-800 dark:bg-zinc-950">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-400">Price &amp; value</h2>

      {rawNm != null && (
        <div className="mt-3">
          <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
            Market value · raw, Near Mint
          </p>
          <p className="text-3xl font-bold text-black dark:text-zinc-50">
            <Price usd={rawNm} native={{ amount: rawNm, currency: "USD" }} approxPrefix="" />
          </p>
          <p className="mt-1 text-xs text-zinc-400">
            Reference price from PokémonPriceTracker, based on recent sold data —{" "}
            <Link href="/methodology" className="hover:text-red-600 hover:underline dark:hover:text-red-500">
              how we work this out
            </Link>
            .
          </p>
        </div>
      )}

      {ladder.length > 0 && (
        <div className="mt-5">
          <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">By condition · raw</p>
          <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1.5 text-sm">
            {ladder.map((c) => (
              <span key={c.condition} className="tnum text-zinc-700 dark:text-zinc-300">
                {c.condition} <span className="font-semibold text-black dark:text-zinc-50">{usd(c.price)}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {graded.length > 0 && (
        <div className="mt-5">
          <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
            Graded — from real recent sold sales
          </p>
          <ul className="mt-2 divide-y divide-zinc-100 dark:divide-zinc-900">
            {graded.map((g) => (
              <li key={g.key} className="flex items-baseline justify-between gap-4 py-1.5 text-sm">
                <span className="font-medium text-zinc-700 dark:text-zinc-300">{g.label}</span>
                <span className="flex items-baseline gap-2">
                  <span className="tnum font-semibold text-black dark:text-zinc-50">{usd(g.currentPrice)}</span>
                  <span className="text-xs text-zinc-400">
                    {`${g.saleCount} sale${g.saleCount === 1 ? "" : "s"}`}
                    {g.isLowConfidence && " · low confidence"}
                  </span>
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-1.5 text-xs text-zinc-400">
            Every graded and raw tier with its own price history is further down.
          </p>
        </div>
      )}

      {listingsLowUsd != null && (
        <div className="mt-5 border-t border-zinc-100 pt-4 dark:border-zinc-900">
          <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Live eBay listings</p>
          <p className="mt-1 text-sm text-zinc-700 dark:text-zinc-300">
            {offersCount} active {offersCount === 1 ? "listing" : "listings"} right now, from{" "}
            <span className="font-semibold text-black dark:text-zinc-50">
              <Price usd={listingsLowUsd} native={{ amount: listingsLowUsd, currency: "USD" }} />
            </span>{" "}
            <span className="text-zinc-400">(asking prices, not sold)</span>.
          </p>
        </div>
      )}
    </section>
  );
}
