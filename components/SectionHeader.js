import Link from "next/link";

// A section's face: a small kicker line + a real title, with an optional
// right-aligned action link. Replaces the old bare
// `text-xs uppercase text-zinc-400` headers so each homepage section
// reads as its own unit instead of blurring into the next.
export default function SectionHeader({ kicker, title, actionLabel, actionHref, id }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
      <div>
        {kicker && (
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-400">
            {kicker}
          </p>
        )}
        <h2 id={id} className="mt-1 text-xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          {title}
        </h2>
      </div>
      {actionLabel && actionHref && (
        <Link
          href={actionHref}
          className="rounded-full border border-zinc-200 px-3 py-1 text-xs font-medium text-zinc-600 transition-colors hover:border-red-300 hover:text-red-600 dark:border-zinc-800 dark:text-zinc-300 dark:hover:border-red-800 dark:hover:text-red-500"
        >
          {actionLabel} →
        </Link>
      )}
    </div>
  );
}
