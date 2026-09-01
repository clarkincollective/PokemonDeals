import Link from "next/link";
import Price from "@/components/Price";

// Visible, data-only "common questions" block for /pokemon/[slug]. Every
// answer is generated from real catalogue counts / references - no lore,
// no generic paragraphs. NO FAQPage JSON-LD is emitted (there is no
// meaningful rich-result benefit for this site and the task forbids it):
// this is plain on-page content that happens to answer the questions a
// "<species> cards" / "<species> card value" searcher actually has.
//
// `snapshot` = lib/speciesSummary.speciesPriceSnapshot(cards).
// `setRows`  = lib/speciesSummary.speciesBySet(cards, validSetSlugs).
export default function SpeciesQuickAnswers({ speciesName, snapshot, setRows, hasDeals }) {
  if (!snapshot || snapshot.cardCount === 0) return null;
  const { cardCount, pricedCount, setCount, minPrice, maxPrice } = snapshot;

  const money = (n) =>
    n == null ? null : <Price usd={n} native={{ amount: Number(n), currency: "USD" }} />;

  const namedSets = (setRows ?? []).slice(0, 6);
  const moreSets = Math.max(0, (setRows ?? []).length - namedSets.length);

  const q = "mt-5 text-sm font-bold text-black dark:text-zinc-50";
  const a = "mt-2 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400";

  return (
    <section className="mt-12 border-t border-zinc-200 pt-8 dark:border-zinc-800">
      <h2 className="text-lg font-bold text-black dark:text-zinc-50">
        Common questions about {speciesName} cards
      </h2>

      <h3 className={q}>How many {speciesName} cards are there?</h3>
      <p className={a}>
        We currently track{" "}
        <span className="font-semibold text-black dark:text-zinc-50">{cardCount}</span> {speciesName}{" "}
        card {cardCount === 1 ? "record" : "records"} across{" "}
        <span className="font-semibold text-black dark:text-zinc-50">{setCount}</span>{" "}
        {setCount === 1 ? "set" : "sets"}. That is the catalogue of {speciesName} cards we price and
        monitor for deals — not necessarily every {speciesName} card ever printed.
      </p>

      <h3 className={q}>How much are {speciesName} cards worth?</h3>
      <p className={a}>
        {pricedCount > 0 && minPrice != null && maxPrice != null ? (
          <>
            Market references for the {pricedCount} priced {speciesName}{" "}
            {pricedCount === 1 ? "card" : "cards"} we track{" "}
            {maxPrice !== minPrice ? (
              <>
                range from {money(minPrice)} to {money(maxPrice)}
              </>
            ) : (
              <>sit at {money(minPrice)}</>
            )}
            . There is no single {speciesName} card value — condition, set, printing and grade all
            change what an individual card is worth.
          </>
        ) : (
          <>
            We don&apos;t have a trustworthy recent-sold reference for any {speciesName} card right
            now, so we can&apos;t give a range. Individual cards vary widely by set, printing, condition
            and grade.
          </>
        )}
      </p>

      {namedSets.length > 0 && (
        <>
          <h3 className={q}>Which sets have {speciesName} cards?</h3>
          <p className={a}>
            {speciesName} cards we track appear in{" "}
            {namedSets.map((r, i) => (
              <span key={r.set}>
                {i > 0 ? ", " : ""}
                {r.slug ? (
                  <Link
                    href={`/sets/${r.slug}`}
                    className="text-red-600 hover:underline dark:text-red-500"
                  >
                    {r.set}
                  </Link>
                ) : (
                  r.set
                )}
              </span>
            ))}
            {moreSets > 0 ? `, and ${moreSets} more` : ""}. See the full by-set breakdown above.
          </p>
        </>
      )}

      <h3 className={q}>Are there any {speciesName} card deals right now?</h3>
      <p className={a}>
        {hasDeals ? (
          <>
            Yes — the qualifying below-market {speciesName} listings we&apos;ve found are shown above,
            each checked against its real market reference.
          </>
        ) : (
          <>
            Not right now. We only feature a {speciesName} listing once it&apos;s verified below its
            market reference, and there isn&apos;t one to show at the moment. The catalogue and market
            references above stay available, and the page updates automatically when a qualifying deal
            appears.
          </>
        )}
      </p>
    </section>
  );
}
