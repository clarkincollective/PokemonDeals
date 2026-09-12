import Price from "@/components/Price";

// Phase 17C.2 table styling + row, extracted in 17C.11 so both the set
// checklist (now interactive) and components/SpeciesChecklist (unchanged,
// server-rendered) share ONE row renderer. Moving it here rather than
// leaving it inside SetChecklist avoids a client/server import cycle and
// keeps the species pages exactly as they were.
//
// ALL styling sits on the <table> as column-level arbitrary-variant rules,
// so the rows carry (almost) no class strings - each row is repeated in
// both the SSR HTML and the RSC payload, and ~110 rows of repeated
// Tailwind strings would otherwise add ~100 KB to the page.
//
// 4-column layout (species page):
//   col 1  No.      mono, muted
//   col 2  Card     name link; <small> = rarity, shown only below `sm`
//   col 3  Rarity   hidden below `sm` (the <small> in col 2 carries it)
//   col 4  Market reference  right-aligned; <b> = figure, <small> = context
// 6-column layout (set page, 17C.11): Own | Art | No. | Card | Rarity | Ref
const BASE = [
  "w-full border-collapse text-left text-sm tabular-nums",
  "[&_th]:px-3 [&_th]:py-2 [&_th]:text-xs [&_th]:font-semibold [&_th]:uppercase [&_th]:tracking-wide [&_th]:text-zinc-500 dark:[&_th]:text-zinc-400",
  "[&_td]:px-3 [&_td]:py-2 [&_td]:align-top",
  "[&_tbody_tr]:border-t [&_tbody_tr]:border-zinc-100 dark:[&_tbody_tr]:border-zinc-800",
  "[&_a]:font-medium [&_a]:text-zinc-900 [&_a]:underline-offset-2 [&_a:hover]:text-red-600 [&_a:hover]:underline dark:[&_a]:text-zinc-100 dark:[&_a:hover]:text-red-500",
  "[&_i]:text-xs [&_i]:text-zinc-500 dark:[&_i]:text-zinc-400",
];

// Column rules for the 4-column layout (species page, and any caller that
// renders no Own / Art columns).
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

// The same rules shifted two columns right, for the 17C.11 set checklist
// which prepends an Own checkbox column and an Art thumbnail column. Rows
// are vertically centred so a 62-73px thumbnail sits level with its name.
export const CHECKLIST_TABLE_CLASS_OWNED = [
  ...BASE,
  "[&_td]:align-middle",
  // 1 Own - a 44px tap target wrapping a 20px box; no horizontal padding
  "[&_th:nth-child(1)]:w-12 [&_th:nth-child(1)]:px-1 [&_th:nth-child(1)]:text-center [&_td:nth-child(1)]:w-12 [&_td:nth-child(1)]:px-1 [&_td:nth-child(1)]:py-1",
  // 2 Art - the thumbnail cell, tight
  "[&_th:nth-child(2)]:w-14 [&_th:nth-child(2)]:px-1 sm:[&_th:nth-child(2)]:w-16 [&_td:nth-child(2)]:w-14 [&_td:nth-child(2)]:px-1 [&_td:nth-child(2)]:py-1.5 sm:[&_td:nth-child(2)]:w-16",
  // 3 No. - hidden below sm, where the Own + Art columns already take
  //   ~100px of a 342px content width; the number moves into the Card
  //   cell's <small> line ("01/64 · Holo Rare") so nothing is lost and the
  //   market reference stays on screen without horizontal scrolling
  "[&_td:nth-child(3)]:hidden [&_th:nth-child(3)]:hidden sm:[&_td:nth-child(3)]:table-cell sm:[&_th:nth-child(3)]:table-cell",
  "[&_td:nth-child(3)]:whitespace-nowrap [&_td:nth-child(3)]:font-mono [&_td:nth-child(3)]:text-xs [&_td:nth-child(3)]:text-zinc-500 dark:[&_td:nth-child(3)]:text-zinc-400",
  "[&_th:nth-child(3)]:w-20",
  // 4 Card (+ small "number · rarity" below sm)
  "[&_td:nth-child(4)_small]:mt-0.5 [&_td:nth-child(4)_small]:block [&_td:nth-child(4)_small]:text-xs [&_td:nth-child(4)_small]:text-zinc-500 sm:[&_td:nth-child(4)_small]:hidden dark:[&_td:nth-child(4)_small]:text-zinc-400",
  // 5 Rarity (hidden below sm)
  "[&_td:nth-child(5)]:hidden [&_th:nth-child(5)]:hidden sm:[&_td:nth-child(5)]:table-cell sm:[&_th:nth-child(5)]:table-cell [&_td:nth-child(5)]:text-zinc-600 dark:[&_td:nth-child(5)]:text-zinc-400",
  // 6 Market reference - the figure never wraps; its context line may, so
  //   "Near Mint · Unlimited Holofoil" fits under the figure on a phone
  "[&_td:nth-child(6)]:text-right [&_th:nth-child(6)]:text-right",
  "[&_td:nth-child(6)_b]:whitespace-nowrap [&_td:nth-child(6)_b]:font-semibold [&_td:nth-child(6)_b]:text-black dark:[&_td:nth-child(6)_b]:text-zinc-50",
  "[&_td:nth-child(6)_i]:whitespace-nowrap",
  "[&_td:nth-child(6)_small]:block [&_td:nth-child(6)_small]:text-xs [&_td:nth-child(6)_small]:text-zinc-500 dark:[&_td:nth-child(6)_small]:text-zinc-400",
  // owned rows settle back (tint + muted name); the checked box - not the
  // colour - is the state cue, and missing rows keep full contrast to scan
  "[&_tr[data-owned=true]]:bg-zinc-100 dark:[&_tr[data-owned=true]]:bg-zinc-900/60",
  "[&_tr[data-owned=true]_a]:text-zinc-500 dark:[&_tr[data-owned=true]_a]:text-zinc-400",
  "[&_tr[data-owned=true]_img]:opacity-70",
].join(" ");

// The four data cells, shared by every checklist surface. Kept as a
// fragment so a caller can prepend its own cells without a wrapper element.
// `compact`: the caller hides the No. column on phones (the 6-column set
// layout), so the number is repeated in the Card cell's <small> line.
export function ChecklistCells({ r, compact = false }) {
  return (
    <>
      <td>{r.number ?? "—"}</td>
      <td>
        {r.href ? <a href={r.href}>{r.name}</a> : r.name}
        <small>
          {compact && r.number ? `${r.number} · ` : ""}
          {r.rarity ?? "Rarity not recorded"}
        </small>
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
