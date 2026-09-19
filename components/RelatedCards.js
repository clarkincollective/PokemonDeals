import Link from "next/link";

// SEO Phase 4B - one shared, bounded related-card navigation block for
// BOTH /cards/[slug] render paths (the live deal hub and the catalogue
// fallback). Data (fetchCardRelations in lib/deals) is already filtered
// to real, priced cards with a permanent page, the current card removed,
// standard printings before specialty, highest reference first. This
// component only renders it - no data access, no ordering.
//
// `sameSpecies` / `sameSet`: [{ slug, displayName, set, cardNumber, rarity, refPrice }]
// `speciesLink`  : { name, slug } | null  -> "/pokemon/[slug]"
// `setLink`      : { name, slug } | null  -> "/sets/[slug]"
// `printings`    : the same card's other printings (lib/cardPrintings
//                  otherPrintings - same number, same set family), each
//                  with its own catalogue reference. Growth batch 2: the
//                  variant comparison the card-value SERPs lead with.
export default function RelatedCards({
  printings = [],
  sameSpecies = [],
  sameSet = [],
  speciesLink = null,
  setLink = null,
  className = "",
}) {
  if (printings.length === 0 && sameSpecies.length === 0 && sameSet.length === 0) return null;

  // the reference is a USD figure; written "USD" (no "$") so the page's
  // one visible "$" statement of a reference stays the worth answer's
  const refText = (v) => (Number.isFinite(Number(v)) && Number(v) > 0 ? `${Number(v).toFixed(2)} USD` : null);
  const printingsBlock = printings.length > 0 && (
    <div className="sm:col-span-2" data-card-printings={printings.length}>
      <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-400">Other printings of this card</h2>
      <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
        Same card, different print run. Each has its own page and its own market reference; they are never compared with each other.
      </p>
      <ul className="mt-2 flex flex-col gap-1.5">
        {printings.map((c) => (
          <li key={c.slug} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5">
            <Link href={`/cards/${c.slug}`} className="text-sm text-zinc-700 hover:text-red-600 hover:underline dark:text-zinc-300 dark:hover:text-red-500">
              {c.set}
              <span className="text-zinc-400">{c.cardNumber ? ` · ${c.cardNumber}` : ""}</span>
            </Link>
            {refText(c.refPrice) && (
              <span className="text-xs text-zinc-500 dark:text-zinc-400">
                market reference <span className="tnum text-zinc-800 dark:text-zinc-200">{refText(c.refPrice)}</span>
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );

  const row = (c) => (
    <li key={c.slug}>
      <Link
        href={`/cards/${c.slug}`}
        className="text-sm text-zinc-700 hover:text-red-600 hover:underline dark:text-zinc-300 dark:hover:text-red-500"
      >
        {c.displayName}
        <span className="text-zinc-400">
          {" · "}
          {c.set}
          {c.cardNumber ? ` · ${c.cardNumber}` : ""}
        </span>
      </Link>
    </li>
  );

  return (
    <div className={`grid gap-8 sm:grid-cols-2 ${className}`}>
      {printingsBlock}
      {sameSpecies.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-400">
            More {speciesLink?.name ?? "related"} cards
          </h2>
          <ul className="mt-3 space-y-1.5">
            {sameSpecies.map(row)}
            {speciesLink && (
              <li>
                <Link
                  href={`/pokemon/${speciesLink.slug}`}
                  className="text-sm font-medium text-red-600 hover:underline dark:text-red-500"
                >
                  All {speciesLink.name} cards &amp; prices &rarr;
                </Link>
              </li>
            )}
          </ul>
        </section>
      )}

      {sameSet.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-400">
            More cards from {setLink?.name ?? sameSet[0].set}
          </h2>
          <ul className="mt-3 space-y-1.5">
            {sameSet.map(row)}
            {setLink && (
              <li>
                <Link
                  href={`/sets/${setLink.slug}`}
                  className="text-sm font-medium text-red-600 hover:underline dark:text-red-500"
                >
                  All {setLink.name} cards &amp; prices &rarr;
                </Link>
              </li>
            )}
          </ul>
        </section>
      )}
    </div>
  );
}
