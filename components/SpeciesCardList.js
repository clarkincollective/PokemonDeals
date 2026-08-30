import SpeciesCard from "@/components/SpeciesCard";

// Every known card in one grouping - a species (/pokemon/[slug]) or a set
// (/sets/[slug]) - as an image-forward tile grid matching the site's
// DealCard grids. Active deals lead in their own labelled section (green
// tiles) so a real deal is never buried among the browsable-only cards;
// the rest follow as the full browse grid.
//
// `label` is the noun shown in the section headings and used for
// click-tracking ("Charizard", "XY - Flashfire"). `speciesName` is still
// accepted as the old name for it. `cards` arrives pre-sorted from
// fetchSpeciesCatalog (deals-first) or fetchSetCatalog (by card number).
const GRID = "mt-3 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5";

export default function SpeciesCardList({
  label,
  speciesName,
  cards,
  dealsHref = "#deals",
  pageName,
  itemNoun = "card",
}) {
  const name = label ?? speciesName;
  if (!cards || cards.length === 0) return null;

  const deals = cards.filter((c) => c.deal);
  const browse = cards.filter((c) => !c.deal);

  return (
    <div className="mt-2">
      {deals.length > 0 && (
        <section>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-500">
            Active {name} deals ({deals.length})
          </h3>
          <div className={GRID}>
            {deals.map((c) => (
              <SpeciesCard
                key={c.tcgplayerId ?? `${c.name}|${c.set}`}
                card={c}
                label={name}
                dealsHref={dealsHref}
                pageName={pageName}
              />
            ))}
          </div>
        </section>
      )}

      {browse.length > 0 && (
        <section className={deals.length > 0 ? "mt-8" : ""}>
          {deals.length > 0 && (
            <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
              Every other {name} {itemNoun} ({browse.length})
            </h3>
          )}
          <div className={GRID}>
            {browse.map((c) => (
              <SpeciesCard
                key={c.tcgplayerId ?? `${c.name}|${c.set}`}
                card={c}
                label={name}
                dealsHref={dealsHref}
                pageName={pageName}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
