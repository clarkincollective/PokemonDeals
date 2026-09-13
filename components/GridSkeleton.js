// Pure presentational skeleton for a loading deal grid. Extracted from
// DealGrid.js (review closure, 2026-09-14) so a server component can
// render the exact same markup as DealGrid's own client-side loading
// state, with zero visual drift between the two - no hooks, no "use
// client", safe to import from either.
export default function GridSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {Array.from({ length: 8 }).map((_, i) => (
        <div
          key={i}
          className="h-72 animate-pulse rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950"
        />
      ))}
    </div>
  );
}
