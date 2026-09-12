import Price from "@/components/Price";

// Phase 17C.2 table styling + row, extracted in 17C.11 so both the set
// checklist (now interactive) and components/SpeciesChecklist (unchanged,
// server-rendered) share ONE row renderer. Moving it here rather than
// leaving it inside SetChecklist avoids a client/server import cycle and
// keeps the species pages exactly as they were.
//
// ALL styling sits on the <table> as column-level arbitrary-variant rules,
// so the rows carry no class strings at all - each row is repeated in both
// the SSR HTML and the RSC payload, and ~110 rows of repeated Tailwind
// strings would otherwise add ~100 KB to the page.
//   col 1  Own      17C.11 checkbox column; absent on the species page
//   col 2  No.      mono, muted
//   col 3  Card     name link; <small> = rarity, shown only below `sm`
//   col 4  Rarity   hidden below `sm` (the <small> in col 3 carries it)
//   col 5  Market reference  right-aligned; <b> = figure, <small> = context
//
// `owned` columns are opt-in: SpeciesChecklist renders without them, so its
// column positions are unchanged from 17C.4.
const BASE = [
  "w-full border-collapse text-left text-sm tabular-nums",
  "[&_th]:px-3 [&_th]:py-2 [&_th]:text-xs [&_th]:font-semibold [&_th]:uppercase [&_th]:tracking-wide [&_th]:text-zinc-500 dark:[&_th]:text-zinc-400",
  "[&_td]:px-3 [&_td]:py-2 [&_td]:align-top",
  "[&_tbody_tr]:border-t [&_tbody_tr]:border-zinc-100 dark:[&_tbody_tr]:border-zinc-800",
  "[&_a]:font-medium [&_a]:text-zinc-900 [&_a]:underline-offset-2 [&_a:hover]:text-red-600 [&_a:hover]:underline dark:[&_a]:text-zinc-100 dark:[&_a:hover]:text-red-500",
  "[&_i]:text-xs [&_i]:text-zinc-500 dark:[&_i]:text-zinc-400",
];

// Column rules for the 4-column layout (species page, and any caller that
// renders no Own column).
export const CHECKLIST_TABLE_CLASS = [
  ...BASE,
  "[&_td:nth-child(1)]:whitespace-nowrap [&_td:nth-child(1)]:font-mono [&_td:nth-child(1)]:text-xs [&_td:nth-child(1)]:text-zinc-500 dark:[&_td:nth-child(1)]:text-zinc-400",
  "[&_th:nth-child(1)]:w-20",
  "[&_td:nth-child(2)_small]:mt-0.5 [&_td:nth-child(2)_small]:block [&_td:nth-child(2)_small]:text-xs [&_td:nth-child(2)_small]:text-zinc-500 sm:[&_td:nth-child(2)_small]:hidden dark:[&_td:nth-child(2)_small]:text-zinc-400",
  "[&_td:nth-child(3)]:hidden [&_th:nth-child(3)]:hidden sm:[&_td:nth-child(3)]:table-cell sm:[&_th:nth-child(3)]:table-cell [&_td:nth-child(3)]:text-zinc-600 dark:[&_td:nth-child(3)]:text-zinc-400",
  "[&_td:nth-child(4)]:whitespace-nowrap [&_td:nth-child(4)]:text-right [&_th:nth-child(4)]:text-right",
  "[&_td:nth-child(4)_b]:font-semibold [&_td:nth-child(4)_b]:text-black dark:[&_td:nth-child(4)_b]:text-zinc-50",
  "[&_td:nth-child(4)_small]:block [&_td:nth-child(4)_small]:text-xs [&_td:nth-child(4)_small]:text-zinc-500 dark:[&_td:nth-child(4)_small]:text-zinc-400",
].join(" ");

// The same rules shifted one column right, for the 17C.11 set checklist
// which prepends an "Own" checkbox column.
export const CHECKLIST_TABLE_CLASS_OWNED = [
  ...BASE,
  "[&_th:nth-child(1)]:w-10 [&_td:nth-child(1)]:whitespace-nowrap",
  "[&_td:nth-child(2)]:whitespace-nowrap [&_td:nth-child(2)]:font-mono [&_td:nth-child(2)]:text-xs [&_td:nth-child(2)]:text-zinc-500 dark:[&_td:nth-child(2)]:text-zinc-400",
  "[&_th:nth-child(2)]:w-20",
  "[&_td:nth-child(3)_small]:mt-0.5 [&_td:nth-child(3)_small]:block [&_td:nth-child(3)_small]:text-xs [&_td:nth-child(3)_small]:text-zinc-500 sm:[&_td:nth-child(3)_small]:hidden dark:[&_td:nth-child(3)_small]:text-zinc-400",
  "[&_td:nth-child(4)]:hidden [&_th:nth-child(4)]:hidden sm:[&_td:nth-child(4)]:table-cell sm:[&_th:nth-child(4)]:table-cell [&_td:nth-child(4)]:text-zinc-600 dark:[&_td:nth-child(4)]:text-zinc-400",
  "[&_td:nth-child(5)]:whitespace-nowrap [&_td:nth-child(5)]:text-right [&_th:nth-child(5)]:text-right",
  "[&_td:nth-child(5)_b]:font-semibold [&_td:nth-child(5)_b]:text-black dark:[&_td:nth-child(5)_b]:text-zinc-50",
  "[&_td:nth-child(5)_small]:block [&_td:nth-child(5)_small]:text-xs [&_td:nth-child(5)_small]:text-zinc-500 dark:[&_td:nth-child(5)_small]:text-zinc-400",
].join(" ");

// The four data cells, shared by every checklist surface. Kept as a
// fragment so a caller can prepend its own cell without a wrapper element.
export function ChecklistCells({ r }) {
  return (
    <>
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
    </>
  );
}

export function ChecklistRow({ r }) {
  return (
    <tr>
      <ChecklistCells r={r} />
    </tr>
  );
}
