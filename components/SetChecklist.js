import Price from "@/components/Price";
import { buildChecklistRows, checklistSummary } from "@/lib/setChecklist";

// Phase 17C.2 - SERVER component. The readable set checklist for a pilot
// set. It REPLACES that set's plain <CatalogueLinkIndex> (same heading id,
// same crawl role: every permanent /cards/[slug] link server-rendered as a
// plain <a>, no next/link prefetch, nothing hidden) and adds what the
// index lacked - collector number, recorded rarity and the market
// reference with its real context - in collector-number order. The art
// grid above stays the place to search / filter / sort; this is the
// scannable list, not a second grid.
//
// ALL styling sits on the <table> as column-level arbitrary-variant rules,
// so the rows carry no class strings at all - each row is repeated in both
// the SSR HTML and the RSC payload, and ~110 rows of repeated Tailwind
// strings would otherwise add ~100 KB to the page.
//   col 1  No.      mono, muted
//   col 2  Card     name link; <small> = rarity, shown only below `sm`
//   col 3  Rarity   hidden below `sm` (the <small> in col 2 carries it)
//   col 4  Market reference  right-aligned; <b> = figure, <small> = context
const TABLE_CLASS = [
  "w-full border-collapse text-left text-sm tabular-nums",
  "[&_th]:px-3 [&_th]:py-2 [&_th]:text-xs [&_th]:font-semibold [&_th]:uppercase [&_th]:tracking-wide [&_th]:text-zinc-500 dark:[&_th]:text-zinc-400",
  "[&_td]:px-3 [&_td]:py-2 [&_td]:align-top",
  "[&_tbody_tr]:border-t [&_tbody_tr]:border-zinc-100 dark:[&_tbody_tr]:border-zinc-800",
  "[&_td:nth-child(1)]:whitespace-nowrap [&_td:nth-child(1)]:font-mono [&_td:nth-child(1)]:text-xs [&_td:nth-child(1)]:text-zinc-500 dark:[&_td:nth-child(1)]:text-zinc-400",
  "[&_th:nth-child(1)]:w-20",
  "[&_a]:font-medium [&_a]:text-zinc-900 [&_a]:underline-offset-2 [&_a:hover]:text-red-600 [&_a:hover]:underline dark:[&_a]:text-zinc-100 dark:[&_a:hover]:text-red-500",
  "[&_td:nth-child(2)_small]:mt-0.5 [&_td:nth-child(2)_small]:block [&_td:nth-child(2)_small]:text-xs [&_td:nth-child(2)_small]:text-zinc-500 sm:[&_td:nth-child(2)_small]:hidden dark:[&_td:nth-child(2)_small]:text-zinc-400",
  "[&_td:nth-child(3)]:hidden [&_th:nth-child(3)]:hidden sm:[&_td:nth-child(3)]:table-cell sm:[&_th:nth-child(3)]:table-cell [&_td:nth-child(3)]:text-zinc-600 dark:[&_td:nth-child(3)]:text-zinc-400",
  "[&_td:nth-child(4)]:whitespace-nowrap [&_td:nth-child(4)]:text-right [&_th:nth-child(4)]:text-right",
  "[&_td:nth-child(4)_b]:font-semibold [&_td:nth-child(4)_b]:text-black dark:[&_td:nth-child(4)_b]:text-zinc-50",
  "[&_td:nth-child(4)_small]:block [&_td:nth-child(4)_small]:text-xs [&_td:nth-child(4)_small]:text-zinc-500 dark:[&_td:nth-child(4)_small]:text-zinc-400",
  "[&_i]:text-xs [&_i]:text-zinc-500 dark:[&_i]:text-zinc-400",
].join(" ");

export default function SetChecklist({ setName, cards, headingId = "full-set-index" }) {
  const rows = buildChecklistRows(cards);
  if (rows.length === 0) return null;
  const s = checklistSummary(rows);

  return (
    <section aria-labelledby={headingId} className="mt-12 border-t border-zinc-200 pt-8 dark:border-zinc-800">
      <h2 id={headingId} className="scroll-mt-24 text-lg font-bold text-black dark:text-zinc-50">
        {`${setName} checklist (${s.total} ${s.total === 1 ? "card" : "cards"})`}
      </h2>
      <p className="mt-1 max-w-3xl text-sm text-zinc-600 dark:text-zinc-400">
        {`Every ${setName} card in our catalogue, in collector-number order. Card names link to each card's page with full pricing, graded values and any live deal.`}
      </p>
      <p className="mt-2 max-w-3xl text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
        Market reference = a recent-sold price for one raw (ungraded) copy, stored in US dollars and
        shown in your currency (marked ≈) when you have chosen another.{" "}
        {s.mixedOrUnstatedConditions
          ? s.conditionStated === 0
            ? "Condition not recorded: our catalogue has not captured which condition these references are for yet, so they are not like-for-like across cards."
            : `A condition is shown where our catalogue has recorded it (${s.conditionStated} of ${s.priced}); where none is shown the condition is not recorded, so references are not like-for-like across cards.`
          : `Every reference here is for a ${rows.find((r) => r.reference)?.reference.conditionLabel} copy.`}{" "}
        They are individual card references, not a value for the complete set.
        {s.unpriced > 0 ? ` ${s.unpriced} ${s.unpriced === 1 ? "card has" : "cards have"} no reliable reference right now.` : ""}
      </p>

      <div className="mt-4 overflow-x-auto rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
        <table className={TABLE_CLASS}>
          <caption className="sr-only">{`${setName} card checklist: collector number, card, rarity and market reference`}</caption>
          <thead className="bg-zinc-50 dark:bg-zinc-900">
            <tr>
              <th scope="col">No.</th>
              <th scope="col">Card</th>
              <th scope="col">Rarity</th>
              <th scope="col">Market reference</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key}>
                <td>{r.number ?? "—"}</td>
                <td>
                  {r.href ? <a href={r.href}>{r.name}</a> : r.name}
                  <small>{r.rarity ?? "Rarity not recorded"}</small>
                </td>
                <td>{r.rarity ?? "Not recorded"}</td>
                <td>
                  {r.reference ? (
                    <>
                      <b>
                        <Price usd={r.reference.usd} native={{ amount: r.reference.usd, currency: "USD" }} />
                      </b>
                      {(r.reference.conditionKnown || r.reference.printing) && (
                        <small>{[r.reference.conditionLabel, r.reference.printing].filter(Boolean).join(" · ")}</small>
                      )}
                    </>
                  ) : (
                    <i>No reliable reference</i>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
