import Link from "next/link";

// Phase 17B - server-rendered "How much is <exact card> worth?" answer for
// /cards/[slug]. Renders ONLY what lib/cardWorth.cardWorthAnswer() built
// from this page's real data - no data access, no prose of its own that
// states a fact. The amount is written in USD text on purpose: this is the
// crawlable answer, and USD is the currency the reference is stored and
// sourced in (the Price & value box below converts for the viewer).
export default function CardWorthAnswer({ answer, className = "" }) {
  if (!answer) return null;
  const { printing, live } = answer;
  const details = [
    ["Set", answer.set || null],
    ["Card number", printing.cardNumber],
    ["Rarity", printing.rarity],
    ["Printing", printing.notes.length ? printing.notes.join(", ") : null],
    ["Promo", printing.promo ? "Yes" : null],
  ].filter(([, v]) => v);

  return (
    <section
      id="card-worth"
      aria-labelledby="card-worth-q"
      className={`mt-6 rounded-xl border border-zinc-200 bg-white p-6 shadow-card dark:border-zinc-800 dark:bg-zinc-950 ${className}`}
    >
      <h2 id="card-worth-q" className="text-base font-semibold text-black dark:text-zinc-50">
        {answer.question}
      </h2>

      {answer.status === "priced" ? (
        <div className="mt-2 space-y-2 text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">
          <p data-worth-answer="priced" data-worth-condition={answer.referenceCondition ?? "unknown"}>
            {answer.subject} has a {answer.marketNoun ?? "market price"} of about{" "}
            <strong className="tnum text-black dark:text-zinc-50">{answer.marketText}</strong> for a{" "}
            {answer.condition} copy, based on recent sold data from PokemonPriceTracker
            {answer.updatedOn ? <> (last updated {answer.updatedOn})</> : null}.
          </p>
          {answer.conditionKnown === false && (
            // The provider prices this printing without stating a condition
            // tier - say so rather than imply Near Mint.
            <p>The provider doesn&apos;t state which condition this reference is for, so treat it as a general raw-card guide.</p>
          )}
          {answer.firstEditionExcluded && (
            <p>1st Edition copies of this card are priced separately and are not included in this figure.</p>
          )}
          <p>
            Prices vary with condition, grading and current buyer demand
            {answer.gradedAvailable ? " — graded prices for this printing are listed below" : ""}.{" "}
            <Link href="/methodology" className="text-zinc-500 hover:text-red-600 hover:underline dark:hover:text-red-500">
              How we work out prices
            </Link>
          </p>
        </div>
      ) : (
        <div className="mt-2 space-y-2 text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">
          <p data-worth-answer="unavailable">
            We don&apos;t have a reliable recent-sold market price for a raw copy of {answer.subject} right now, so
            we don&apos;t show one.
            {answer.gradedAvailable ? " Graded prices for this printing are listed below." : ""}
          </p>
        </div>
      )}

      {live ? (
        <p className="mt-2 text-sm text-zinc-700 dark:text-zinc-300" data-worth-live={live.count}>
          {live.count} active eBay {live.count === 1 ? "listing" : "listings"} for this card right now
          {live.lowUsd != null ? (
            <>
              , from <span className="tnum font-semibold text-black dark:text-zinc-50">${live.lowUsd.toFixed(2)} USD</span>{" "}
              <span className="text-zinc-400">(asking prices, not sold)</span>
            </>
          ) : null}
          .
        </p>
      ) : null}

      {details.length > 0 && (
        <dl className="mt-4 grid grid-cols-1 gap-x-6 gap-y-1 border-t border-zinc-100 pt-3 text-sm sm:grid-cols-2 dark:border-zinc-900">
          {details.map(([k, v]) => (
            <div key={k} className="flex gap-2">
              <dt className="text-zinc-400">{k}</dt>
              <dd className="text-zinc-700 dark:text-zinc-300">{v}</dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  );
}
