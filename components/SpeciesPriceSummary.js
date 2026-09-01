import Price from "@/components/Price";

// Species-level card-price snapshot from real catalogue references.
// NEVER a single "this Pokemon is worth $X": it states a count, a range
// and (when useful) a median across the priced cards we track, and is
// explicit that individual printings vary. Figures are USD references
// that <Price> localises to the viewer's currency after hydration.
//
// `snapshot` comes from lib/speciesSummary.speciesPriceSnapshot(cards).
export default function SpeciesPriceSummary({ speciesName, snapshot, className = "" }) {
  if (!snapshot) return null;
  const { cardCount, pricedCount, setCount, minPrice, maxPrice, medianPrice, specialtyPricedCount } =
    snapshot;

  const money = (n) =>
    n == null ? null : <Price usd={n} native={{ amount: Number(n), currency: "USD" }} />;

  return (
    <section
      className={`rounded-xl border border-zinc-200 bg-white p-5 shadow-card dark:border-zinc-800 dark:bg-zinc-950 ${className}`}
    >
      <h2 className="text-sm font-semibold text-black dark:text-zinc-50">
        {speciesName} card prices at a glance
      </h2>
      <p className="mt-2 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
        We track{" "}
        <span className="font-semibold text-black dark:text-zinc-50">{cardCount}</span>{" "}
        {speciesName} card {cardCount === 1 ? "record" : "records"} across{" "}
        <span className="font-semibold text-black dark:text-zinc-50">{setCount}</span>{" "}
        {setCount === 1 ? "set" : "sets"}.
        {pricedCount > 0 ? (
          <>
            {" "}
            Market references for the{" "}
            <span className="font-semibold text-black dark:text-zinc-50">{pricedCount}</span> priced
            {" "}
            {pricedCount === 1 ? "card" : "cards"}{" "}
            {minPrice != null && maxPrice != null && maxPrice !== minPrice ? (
              <>
                range from {money(minPrice)} to {money(maxPrice)}
              </>
            ) : (
              <>sit at {money(minPrice ?? maxPrice)}</>
            )}
            {medianPrice != null && pricedCount >= 4 ? (
              <>
                {" "}
                (median {money(medianPrice)})
              </>
            ) : null}
            .
          </>
        ) : (
          <> We don&apos;t have a trustworthy market reference for any {speciesName} card right now.</>
        )}
      </p>
      <p className="mt-2 text-xs text-zinc-400">
        These are recent-sold reference prices for individual cards, not a single value for the
        Pokemon — condition, set, printing and grade all move a card&apos;s price.
        {specialtyPricedCount > 0
          ? ` ${specialtyPricedCount} Jumbo / World Championship ${
              specialtyPricedCount === 1 ? "card is" : "cards are"
            } tracked separately and excluded from the range above.`
          : ""}
      </p>
    </section>
  );
}
