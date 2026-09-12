import Link from "next/link";
import { buildSetReference } from "@/lib/setReference";

// Phase 17C.12 - "Reading the <set> checklist": three short, verified,
// set-specific notes rendered server-side directly above the progress
// card, where someone deciding whether two rows are the same card will
// look. Pilot sets only; null for every other set (no empty section).
//
// A native <details> keeps it compact on every viewport without any
// client JavaScript: the summary line carries the three leads (the facts
// themselves), and opening it shows the full explanations. Everything is
// in the server HTML either way. Hidden in print - the printed list stays
// a list.
export default function SetReferenceNotes({ setName, rows }) {
  const ref = buildSetReference(setName, rows);
  if (!ref) return null;
  return (
    <details
      className="group mt-5 rounded-xl border border-zinc-200 bg-zinc-50 print:hidden dark:border-zinc-800 dark:bg-zinc-900/40"
      data-set-reference={setName}
      data-print-hide
    >
      <summary className="flex cursor-pointer list-none items-start gap-3 p-4 [&::-webkit-details-marker]:hidden sm:items-center sm:p-5">
        <span className="min-w-0 flex-1">
          <span className="block text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-400">
            Reading the {setName} checklist
          </span>
          {/* leads: one per line on phones, a dotted run from `sm` up */}
          <span className="mt-1.5 flex flex-col gap-y-1 text-sm font-medium text-black sm:flex-row sm:flex-wrap sm:gap-x-2 dark:text-zinc-50">
            {ref.items.map((item, i) => (
              <span key={item.id} className="inline-flex items-center gap-2">
                {i > 0 && <span aria-hidden className="hidden text-zinc-300 sm:inline dark:text-zinc-600">·</span>}
                {item.lead}
              </span>
            ))}
          </span>
        </span>
        <span
          aria-hidden
          className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-zinc-300 bg-white text-zinc-500 transition-transform group-open:rotate-180 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400"
        >
          <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 8l5 5 5-5" />
          </svg>
        </span>
      </summary>
      <dl className="grid gap-x-8 gap-y-4 border-t border-zinc-200 px-4 pb-4 pt-4 sm:grid-cols-2 sm:px-5 sm:pb-5 lg:grid-cols-3 dark:border-zinc-800">
        {ref.items.map((item) => (
          <div key={item.id} className="min-w-0" data-set-reference-item={item.id}>
            <dt className="text-sm font-semibold text-black dark:text-zinc-50">{item.lead}</dt>
            <dd className="mt-1 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
              {item.text}
              {item.link && (
                <>
                  {" "}
                  <Link href={item.link.href} className="font-medium text-red-600 hover:underline dark:text-red-500">
                    {item.link.label}
                  </Link>
                </>
              )}
            </dd>
          </div>
        ))}
      </dl>
    </details>
  );
}
