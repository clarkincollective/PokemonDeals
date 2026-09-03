// Phase 13B.3 - applied-filter visibility (section 8) + a truthful
// empty-filtered state with explicit relaxation actions (section 9), for
// the /pokemon/[slug] scoped-deal grid.
//
// Everything here is plain <a href> navigation back to the statically
// cached page shell (same model as FilterBar) - no client router push,
// no state. Query-param links carry rel="nofollow", matching the site's
// crawl-hygiene rule for internal parameter links.

import {
  appliedFilterChips,
  relaxationSteps,
  normalizeDealFilters,
} from "@/lib/dealFilters";

// currentParams: a plain object of the live query string.
// Drop the given keys (and always ?page=) and return the resulting href.
function hrefWithout(currentParams, dropKeys, basePath) {
  const params = new URLSearchParams(currentParams);
  for (const k of dropKeys) params.delete(k);
  params.delete("page");
  const qs = params.toString();
  return qs ? `${basePath}?${qs}` : basePath;
}

// The normalisation can adjust a contradictory URL (e.g. type=raw +
// grade=10). Show those adjustments once, plainly, so the collector knows
// why the state they see isn't literally what they typed.
export function FilterNotes({ params }) {
  const { notes } = normalizeDealFilters({
    type: params.type,
    grader: params.grader,
    grade: params.grade,
    listing: params.listing,
    minPrice: params.minPrice,
    maxPrice: params.maxPrice,
  });
  if (!notes.length) return null;
  return (
    <ul className="mb-3 space-y-1">
      {notes.map((n) => (
        <li
          key={n.code}
          className="text-xs font-medium text-amber-700 dark:text-amber-500"
        >
          {n.message}
        </li>
      ))}
    </ul>
  );
}

// The row of active-filter chips. Each chip's ✕ removes exactly that
// filter (the "Graded" chip also clears grader + grade, since those
// depend on it).
export function AppliedFilters({ params, basePath, resultCount }) {
  const chips = appliedFilterChips({
    type: params.type,
    grader: params.grader,
    grade: params.grade,
    listing: params.listing,
    minPrice: params.minPrice,
    maxPrice: params.maxPrice,
  });
  if (!chips.length) return null;

  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      <span className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
        Filtered by
      </span>
      {chips.map((c) => (
        <a
          key={c.key}
          href={hrefWithout(params, c.clears, basePath)}
          rel="nofollow"
          className="inline-flex items-center gap-1 rounded-full border border-zinc-300 bg-white px-2.5 py-1 text-xs font-medium text-zinc-700 transition-colors hover:border-red-300 hover:text-red-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:text-red-500"
          aria-label={`Remove filter: ${c.label}`}
        >
          {c.label}
          <span aria-hidden="true" className="text-zinc-400">
            ✕
          </span>
        </a>
      ))}
      <a
        href={hrefWithout(params, ["type", "grader", "grade", "listing", "minPrice", "maxPrice"], basePath)}
        rel="nofollow"
        className="text-xs font-medium text-zinc-500 underline underline-offset-2 hover:text-red-600 dark:hover:text-red-500"
      >
        Clear all
      </a>
      {typeof resultCount === "number" && (
        <span className="text-xs text-zinc-400">
          · {resultCount} match{resultCount === 1 ? "" : "es"}
        </span>
      )}
    </div>
  );
}

// Shown instead of the grid when a FILTERED query has zero live deals.
// States plainly that nothing matches (never silently shows unrelated
// listings) and offers relaxation actions that each explicitly change the
// filter state.
export function FilteredEmptyState({ params, basePath, subjectLabel }) {
  const steps = relaxationSteps({
    type: params.type,
    grader: params.grader,
    grade: params.grade,
    listing: params.listing,
    minPrice: params.minPrice,
    maxPrice: params.maxPrice,
  });
  const chips = appliedFilterChips({
    type: params.type,
    grader: params.grader,
    grade: params.grade,
    listing: params.listing,
    minPrice: params.minPrice,
    maxPrice: params.maxPrice,
  });
  const summary = chips.map((c) => c.label).join(" · ");

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950">
      <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
        No live {subjectLabel} deals match {summary || "these filters"} right now.
      </p>
      <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
        These filters are applied to real, currently-active listings — nothing has been
        broadened. Try one of these:
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {steps.map((s, i) => (
          <a
            key={i}
            href={hrefWithout(params, s.drop, basePath)}
            rel="nofollow"
            className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs font-semibold text-black transition-colors hover:border-zinc-400 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50 dark:hover:bg-zinc-800"
          >
            {s.label}
          </a>
        ))}
      </div>
    </div>
  );
}
