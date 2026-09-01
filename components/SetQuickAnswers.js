import Link from "next/link";
import Price from "@/components/Price";

// Visible, data-only "common questions" for /sets/[slug]. Every answer is
// generated from real catalogue counts / references. NO FAQPage JSON-LD
// (no rich-result benefit for this site; the task forbids it) - just
// plain on-page content answering "{set} card list / prices / values /
// deals / which Pokemon" intent.
//
// `snapshot` = lib/setSummary.setPriceSnapshot(cards).
// `species`  = lib/setSummary.setSpeciesList(cards).
export default function SetQuickAnswers({ setName, snapshot, species, hasDeals }) {
  if (!snapshot || snapshot.cardCount === 0) return null;
  const { cardCount, pricedCount, minPrice, maxPrice } = snapshot;

  const money = (n) =>
    n == null ? null : <Price usd={n} native={{ amount: Number(n), currency: "USD" }} />;

  const named = (species ?? []).slice(0, 8);
  const more = Math.max(0, (species ?? []).length - named.length);

  const q = "mt-5 text-sm font-bold text-black dark:text-zinc-50";
  const a = "mt-2 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400";

  return (
    <section className="mt-12 border-t border-zinc-200 pt-8 dark:border-zinc-800">
      <h2 className="text-lg font-bold text-black dark:text-zinc-50">
        Common questions about {setName} cards
      </h2>

      <h3 className={q}>How many cards from {setName} do you track?</h3>
      <p className={a}>
        We currently track{" "}
        <span className="font-semibold text-black dark:text-zinc-50">{cardCount}</span> {setName} card{" "}
        {cardCount === 1 ? "record" : "records"} — the cards we price and monitor for deals, not
        necessarily the set&apos;s full printed checklist.
      </p>

      <h3 className={q}>How much are {setName} cards worth?</h3>
      <p className={a}>
        {pricedCount > 0 && minPrice != null && maxPrice != null ? (
          <>
            Market references for the {pricedCount} priced {setName}{" "}
            {pricedCount === 1 ? "card" : "cards"} we track{" "}
            {maxPrice !== minPrice ? (
              <>
                range from {money(minPrice)} to {money(maxPrice)}
              </>
            ) : (
              <>sit at {money(minPrice)}</>
            )}
            . That is a distribution of individual card prices — there is no single {setName} value,
            and this is not a complete-set valuation.
          </>
        ) : (
          <>
            We don&apos;t have a trustworthy recent-sold reference for any {setName} card right now.
          </>
        )}
      </p>

      {named.length > 0 && (
        <>
          <h3 className={q}>Which Pokemon appear in {setName}?</h3>
          <p className={a}>
            {setName} cards we track feature{" "}
            {named.map((s, i) => (
              <span key={s.slug}>
                {i > 0 ? ", " : ""}
                <Link
                  href={`/pokemon/${s.slug}`}
                  className="text-red-600 hover:underline dark:text-red-500"
                >
                  {s.name}
                </Link>
              </span>
            ))}
            {more > 0 ? `, and ${more} more` : ""}. See the full list above.
          </p>
        </>
      )}

      <h3 className={q}>Are there any {setName} card deals right now?</h3>
      <p className={a}>
        {hasDeals ? (
          <>
            Yes — the qualifying below-market {setName} listings we&apos;ve found are shown above, each
            checked against its real market reference.
          </>
        ) : (
          <>
            Not right now. We only feature a {setName} listing once it&apos;s verified below its market
            reference, and there isn&apos;t one to show at the moment. The checklist and card
            references above stay available, and this page updates automatically when a qualifying
            deal appears.
          </>
        )}
      </p>
    </section>
  );
}
