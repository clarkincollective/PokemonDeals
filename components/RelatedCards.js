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
export default function RelatedCards({
  sameSpecies = [],
  sameSet = [],
  speciesLink = null,
  setLink = null,
  className = "",
}) {
  if (sameSpecies.length === 0 && sameSet.length === 0) return null;

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
