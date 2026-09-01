import Link from "next/link";
import Price from "@/components/Price";
import { hasPrice } from "@/lib/money";

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

// Every figure in this component is a USD-canonical PokemonPriceTracker
// reference; <Price> converts each to the viewer's currency after
// hydration so the whole card stays one currency (the "Market value ·
// raw" figure at the top already went through <Price>; the by-condition
// and graded tiers below now do too - Phase 6A currency closeout).
function Money({ usd }) {
  return <Price usd={usd} native={{ amount: usd, currency: "USD" }} approxPrefix="" />;
}

function conditionLadder(analysis) {
  const cb = analysis?.conditionBreakdown ?? [];
  const nmRaw =
    cb.find((c) => /near mint/i.test(c.condition))?.price ?? analysis?.raw?.currentPrice ?? null;
  const nm = hasPrice(nmRaw) ? Number(nmRaw) : null;
  if (nm == null) return [];
  // Keep only leading rows that never rise above Near Mint and never
  // increase as condition worsens - a rise means the underlying data for
  // that card is contaminated, so stop rather than show a nonsense
  // "Damaged costs more than Near Mint" row.
  const out = [];
  let prev = Infinity;
  for (const c of cb) {
    if (!hasPrice(c.price) || c.price > nm * 1.02 || c.price > prev) break;
    out.push(c);
    prev = c.price;
  }
  return out.length >= 2 ? out : [];
}

export default function CardPriceSummary({
  analysis,
  offersCount = 0,
  listingsLowUsd = null,
  listingsHref = "#listings",
}) {
  const rawNmValue = analysis?.raw?.currentPrice ?? null;
  const rawNm = hasPrice(rawNmValue) ? Number(rawNmValue) : null;
  const ladder = conditionLadder(analysis);
  const graded = (analysis?.graded ?? [])
    .filter((g) => hasPrice(g.currentPrice) && g.saleCount > 0)
    // A graded slab that "sold" for less than the raw Near Mint market
    // value is a contaminated sample (mislabelled lots, altered/proxy
    // cards under a real grade string) - e.g. a "TAG 8.5" Base Set
    // Charizard at $25 against an $855 raw price. Grading costs money and
    // a slab carries a premium, so drop the tier rather than show a
    // figure that makes the whole ladder look broken. Same trade-off the
    // raw conditionLadder already makes. Kept when there's no raw
    // reference to check against.
    .filter((g) => rawNm == null || g.currentPrice >= rawNm)
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
            Reference price from PokemonPriceTracker, based on recent sold data —{" "}
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
                {c.condition} <span className="font-semibold text-black dark:text-zinc-50"><Money usd={c.price} /></span>
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
              <li key={g.key} className="py-1.5 text-sm">
                <div className="flex items-baseline justify-between gap-4">
                  <span className="font-medium text-zinc-700 dark:text-zinc-300">{g.label}</span>
                  <span className="flex items-baseline gap-2">
                    <span className="tnum font-semibold text-black dark:text-zinc-50"><Money usd={g.currentPrice} /></span>
                    <span className="text-xs text-zinc-400">
                      {`${g.saleCount} sale${g.saleCount === 1 ? "" : "s"}`}
                    </span>
                  </span>
                </div>
                {g.isLowConfidence && (
                  // Its own line, not appended to the sale count - this flags
                  // that the PRICE is a statistical outlier / wide-spread
                  // estimate, which is unrelated to how many sales there were.
                  <p className="mt-0.5 text-xs text-amber-600 dark:text-amber-500">
                    Price outlier — treat with caution
                  </p>
                )}
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
          {offersCount > 0 && (
            // Primary action right here so a price-intent visitor can jump
            // to the listings without scrolling past the value context.
            // In-page anchor (not a direct affiliate link) because the copy
            // promises a list to compare, not one pre-picked listing.
            <a
              href={listingsHref}
              className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-600 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-red-600 dark:hover:text-white"
            >
              {offersCount === 1 ? "View the listing" : `View all ${offersCount} listings`} from{" "}
              <Price
                usd={listingsLowUsd}
                native={{ amount: listingsLowUsd, currency: "USD" }}
                approxPrefix=""
              />{" "}
              →
            </a>
          )}
        </div>
      )}
    </section>
  );
}
