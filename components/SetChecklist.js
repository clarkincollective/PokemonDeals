import ChecklistTable from "@/components/ChecklistTable";
import { buildChecklistRows, checklistSummary, checklistLegend } from "@/lib/setChecklist";

// Phase 17C.2 - the readable set checklist. 17C.11 makes it a collector
// utility: the same crawlable list, plus owned/missing marking, a
// missing-only view, reset and a print layout.
//
// This stays a SERVER component. It builds the rows (and the summary and
// legend sentences) here and hands them to <ChecklistTable>, a client
// component - which the App Router still server-renders, so every row and
// every permanent /cards/[slug] link remains in the SSR HTML exactly as in
// 17C.2/17C.3. Hydration only attaches the checkboxes.
//
// The row renderer and table styling live in components/ChecklistRow so
// components/SpeciesChecklist (server, no Own column) keeps the identical
// 4-column layout it had in 17C.4.
//
// It REPLACES the set's plain <CatalogueLinkIndex> (same heading id, same
// crawl role) and adds what the index lacked - collector number, recorded
// rarity and the market reference with its real context - in
// collector-number order. The art grid above stays the place to search /
// filter / sort; this is the scannable list, not a second grid.
export { CHECKLIST_TABLE_CLASS, ChecklistRow, ChecklistCells } from "@/components/ChecklistRow";

export default function SetChecklist({ setName, cards, headingId = "full-set-index" }) {
  const rows = buildChecklistRows(cards);
  if (rows.length === 0) return null;
  const s = checklistSummary(rows);
  const legend = checklistLegend(s, rows);

  return (
    <section
      aria-labelledby={headingId}
      data-checklist-print-root
      className="mt-12 border-t border-zinc-200 pt-8 dark:border-zinc-800"
    >
      <h2 id={headingId} className="scroll-mt-24 text-lg font-bold text-black dark:text-zinc-50">
        {`${setName} checklist (${s.total} ${s.total === 1 ? "card" : "cards"})`}
      </h2>
      <p className="mt-1 max-w-3xl text-sm text-zinc-600 dark:text-zinc-400" data-print-hide>
        {`Every ${setName} card in our catalogue, in collector-number order. Tick what you own to see what's missing, then print the list. Card names link to each card's page with full pricing, graded values and any live deal.`}
      </p>
      <p className="mt-2 max-w-3xl text-xs leading-relaxed text-zinc-500 dark:text-zinc-400" data-print-hide>
        Market reference = a recent-sold price for one raw (ungraded) copy, stored in US dollars and
        shown in your currency (marked ≈) when you have chosen another.{" "}
        {legend.condition ? `${legend.condition} ` : ""}
        They are individual card references, not a value for the complete set.
        {legend.unpriced ? ` ${legend.unpriced}` : ""}
      </p>

      <ChecklistTable
        setName={setName}
        rows={rows}
        caption={`${setName} card checklist: owned, collector number, card, rarity and market reference`}
      />
    </section>
  );
}
