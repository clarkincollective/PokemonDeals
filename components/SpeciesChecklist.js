import { CHECKLIST_TABLE_CLASS, ChecklistRow } from "@/components/SetChecklist";
import { buildChecklistRows, checklistSummary, checklistLegend } from "@/lib/setChecklist";

// Phase 17C.4 - SERVER component. The Pokemon-page pilot's exact-card
// checklist: every catalogue card for the species, grouped by era
// (lib/speciesCoverage SET_ERAS, from the curated release list) and then by
// set in release order, cards in collector-number order. It REPLACES the
// plain <CatalogueLinkIndex> (same heading id, same crawl role - every
// permanent /cards/[slug] link as a plain server-rendered <a>) and reuses
// the set checklist's table, row rendering, link rule and legend, so the
// price-condition context is identical to the set pages.
// `groups` = lib/speciesCoverage.speciesEraGroups(cards, validSetSlugs).
const GROUP_HEADER_CLASS =
  "[&_tbody_th]:bg-zinc-50 [&_tbody_th]:text-left [&_tbody_th]:normal-case [&_tbody_th]:tracking-normal [&_tbody_th]:text-sm [&_tbody_th]:font-semibold [&_tbody_th]:text-zinc-800 dark:[&_tbody_th]:bg-zinc-900 dark:[&_tbody_th]:text-zinc-200 [&_tbody_th_span]:font-normal [&_tbody_th_span]:text-zinc-500 dark:[&_tbody_th_span]:text-zinc-400";

export default function SpeciesChecklist({ speciesName, groups, headingId = "full-card-index" }) {
  if (!groups || groups.length === 0) return null;
  const built = groups.map((g) => ({
    era: g.era,
    sets: g.sets.map((s) => ({ ...s, rows: buildChecklistRows(s.cards) })),
  }));
  const allRows = built.flatMap((g) => g.sets.flatMap((s) => s.rows));
  const summary = checklistSummary(allRows);
  const legend = checklistLegend(summary, allRows);

  return (
    <section aria-labelledby={headingId} className="mt-12 border-t border-zinc-200 pt-8 dark:border-zinc-800">
      <h2 id={headingId} className="scroll-mt-24 text-lg font-bold text-black dark:text-zinc-50">
        {`${speciesName} checklist by era and set (${summary.total} ${summary.total === 1 ? "card" : "cards"})`}
      </h2>
      <p className="mt-1 max-w-3xl text-sm text-zinc-600 dark:text-zinc-400">
        {`Every ${speciesName} card in our catalogue, oldest era first, then by set release and collector number. Card names link to each card's page.`}
      </p>
      <p className="mt-2 max-w-3xl text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
        Market reference = a recent-sold price for one raw (ungraded) copy, stored in US dollars and
        shown in your currency (marked ≈) when you have chosen another.{" "}
        {legend.condition ? `${legend.condition} ` : ""}
        They are individual card references, not a value for the Pokemon.
        {legend.unpriced ? ` ${legend.unpriced}` : ""}
      </p>

      <div className="mt-4 space-y-8">
        {built.map(({ era, sets }) => {
          const cardCount = sets.reduce((n, s) => n + s.rows.length, 0);
          return (
            <div key={era.key}>
              <h3 className="text-sm font-bold text-black dark:text-zinc-50">
                {era.label}
                {era.years ? <span className="font-normal text-zinc-500 dark:text-zinc-400">{` · ${era.years}`}</span> : null}
              </h3>
              <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                {`${sets.length} ${sets.length === 1 ? "set" : "sets"} · ${cardCount} ${cardCount === 1 ? "card" : "cards"}`}
                {era.note ? ` · ${era.note}` : ""}
              </p>
              <div className="mt-2 overflow-x-auto rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
                <table className={`${CHECKLIST_TABLE_CLASS} ${GROUP_HEADER_CLASS}`}>
                  <caption className="sr-only">{`${speciesName} cards, ${era.label}: set, collector number, card, rarity and market reference`}</caption>
                  <thead className="bg-zinc-50 dark:bg-zinc-900">
                    <tr>
                      <th scope="col">No.</th>
                      <th scope="col">Card</th>
                      <th scope="col">Rarity</th>
                      <th scope="col">Market reference</th>
                    </tr>
                  </thead>
                  {sets.map((s) => (
                    <tbody key={s.set}>
                      <tr>
                        <th scope="rowgroup" colSpan={4}>
                          {s.slug ? <a href={`/sets/${s.slug}`}>{s.set}</a> : s.set}
                          <span>{` · ${s.rows.length} ${s.rows.length === 1 ? "card" : "cards"}`}</span>
                        </th>
                      </tr>
                      {s.rows.map((r) => (
                        <ChecklistRow key={r.key} r={r} />
                      ))}
                    </tbody>
                  ))}
                </table>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
