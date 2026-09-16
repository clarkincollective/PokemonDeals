import Image from "next/image";
import Link from "next/link";
import { catalogImageUrl } from "@/lib/cardImage";

// Shared card artwork for editorial guides.
//
// The image is the catalogue scan (the TCGplayer product image every card
// page already uses - an approved source, a complete card face, never
// generated or reconstructed art). Fixed 717:1000 proportions reserve the
// tile's space before a lazy image loads, and the link is full tile width
// so the reserved box does not collapse. On phones a tile caps at half a
// row, so galleries read as two columns rather than one long stack.
//
// Every tile links the card's own catalogue page. Callers pass a
// lib/guideLinks GUIDE_CARDS entry, so the href is derived from the same
// slug function the /cards route resolves - never hand-typed.

export function CardTile({ card, caption, width = 168, priority = false }) {
  const height = Math.round((width * 1000) / 717);
  return (
    <li className="flex flex-col items-center" style={{ width, maxWidth: "calc(50% - 0.5rem)" }}>
      <Link
        href={card.href}
        className="block w-full rounded-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600"
      >
        <Image
          src={catalogImageUrl(card.tcgplayerId)}
          alt={`${card.label} — ${card.set}, complete card face`}
          width={width}
          height={height}
          sizes={`(max-width: 640px) 45vw, ${width}px`}
          priority={priority}
          className="h-auto w-full rounded-md shadow-sm"
        />
      </Link>
      <span className="mt-2 text-center text-[11px] leading-snug text-zinc-600 dark:text-zinc-400">
        <Link
          href={card.href}
          className="font-medium text-zinc-800 hover:text-red-600 hover:underline dark:text-zinc-200 dark:hover:text-red-500"
        >
          {card.label}
        </Link>
        {caption ? (
          <>
            <br />
            {caption}
          </>
        ) : null}
      </span>
    </li>
  );
}

// `cards` is [{ card, caption }]. `note` is the figure's caption - what the
// reader is looking at and why, never a price or availability claim.
export function Gallery({ cards, width, priorityCount = 0, note }) {
  return (
    <figure className="mt-5 overflow-hidden rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
      <div className="p-5">
        <ul className="m-0 flex list-none flex-wrap justify-center gap-x-4 gap-y-6 p-0">
          {cards.map(({ card, caption }, i) => (
            <CardTile key={card.href} card={card} caption={caption} width={width} priority={i < priorityCount} />
          ))}
        </ul>
      </div>
      {note && (
        <figcaption className="border-t border-zinc-200 px-5 py-3 text-xs leading-relaxed text-zinc-600 dark:border-zinc-800 dark:text-zinc-400">
          {note}
        </figcaption>
      )}
    </figure>
  );
}

const TH = "px-3 py-2.5 font-semibold";
const TD = "px-3 py-3 align-top leading-relaxed text-zinc-600 dark:text-zinc-400";

// A comparison table. Wide tables scroll inside their own container so the
// page body never scrolls sideways on a phone.
export function GuideTable({ head, rows, minWidth = "36rem", caption }) {
  return (
    <div className="mt-4 overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
      <table className="w-full border-collapse text-left text-sm" style={{ minWidth }}>
        {caption && (
          <caption className="px-3 py-2 text-left text-xs text-zinc-500 dark:text-zinc-400">{caption}</caption>
        )}
        <thead>
          <tr className="border-b border-zinc-200 bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
            {head.map((h) => (
              <th key={h} scope="col" className={TH}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-100 dark:divide-zinc-900">
          {rows.map((r, i) => (
            <tr key={i}>
              {r.map((cell, j) =>
                j === 0 ? (
                  <th key={j} scope="row" className="px-3 py-3 align-top font-semibold text-black dark:text-zinc-50">
                    {cell}
                  </th>
                ) : (
                  <td key={j} className={TD}>
                    {cell}
                  </td>
                )
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
