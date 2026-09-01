import Price from "@/components/Price";

// Set-level card-price snapshot from real catalogue references. NEVER a
// complete-set valuation: it states a count, a range and (when useful) a
// median across the priced INDIVIDUAL cards we track, and is explicit
// that it is a distribution, not "the set is worth $X". USD references,
// localised by <Price> after hydration. `snapshot` = lib/setSummary.
export default function SetPriceSummary({ setName, snapshot, className = "" }) {
  if (!snapshot) return null;
  const { pricedCount, minPrice, maxPrice, medianPrice, specialtyPricedCount } = snapshot;

  const money = (n) =>
    n == null ? null : <Price usd={n} native={{ amount: Number(n), currency: "USD" }} />;

  return (
    <section
      className={`rounded-xl border border-zinc-200 bg-white p-5 shadow-card dark:border-zinc-800 dark:bg-zinc-950 ${className}`}
    >
      <h2 className="text-sm font-semibold text-black dark:text-zinc-50">
        {setName} card prices at a glance
      </h2>
      {pricedCount > 0 ? (
        <p className="mt-2 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
          We currently track{" "}
          <span className="font-semibold text-black dark:text-zinc-50">{pricedCount}</span> priced{" "}
          {pricedCount === 1 ? "card" : "cards"} from {setName}.{" "}
          {minPrice != null && maxPrice != null && maxPrice !== minPrice ? (
            <>
              Market references for individual cards range from {money(minPrice)} to {money(maxPrice)}
            </>
          ) : (
            <>Their market reference is {money(minPrice ?? maxPrice)}</>
          )}
          {medianPrice != null && pricedCount >= 4 ? <> (median {money(medianPrice)})</> : null}.
        </p>
      ) : (
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          We don&apos;t have a trustworthy market reference for any {setName} card right now.
        </p>
      )}
      <p className="mt-2 text-xs text-zinc-400">
        These are recent-sold reference prices for individual cards, not a valuation of the complete
        set. Condition, printing and grade all move a card&apos;s price.
        {specialtyPricedCount > 0
          ? ` ${specialtyPricedCount} Jumbo / World Championship ${
              specialtyPricedCount === 1 ? "card is" : "cards are"
            } tracked separately and excluded from the range above.`
          : ""}
      </p>
    </section>
  );
}
