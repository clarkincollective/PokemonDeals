import Link from "next/link";

// The pill row under the hero search.
//
// LABELLING. The reference design calls this "Trending". We do not
// measure trend - there is no time-series of query volume or of listing
// growth per species behind these, so calling them trending would be a
// claim the data cannot support. The species pills come from
// speciesHubs, which is ordered by how many ACTIVE LISTINGS each species
// has right now, so the honest heading is "Most listed" and that is what
// this renders. The remaining pills are category destinations, labelled
// as such.
//
// Every pill is a real route. The species ones go to /pokemon/<slug>,
// which exists for exactly the species in this list; the category ones go
// to routes defined in lib/dealCategories.
export default function HomeQuickFilters({ species = [], categories = [] }) {
  const pills = [
    ...species.map((s) => ({
      key: `sp-${s.slug}`,
      href: `/pokemon/${s.slug}`,
      label: s.name,
      kind: "species",
      count: s.count,
    })),
    ...categories.map((c) => ({ key: `cat-${c.href}`, href: c.href, label: c.label, kind: "category" })),
  ];
  if (pills.length === 0) return null;

  return (
    // Scrolls as ONE row on a phone, wraps from sm. Wrapping at 390px
    // pushed these into three rows and shoved the first deal card that
    // much further below the fold, which is the opposite of what the row
    // is for. -mx-4/px-4 lets it scroll edge to edge while the first pill
    // still lines up with the page gutter.
    <div className="-mx-4 mt-4 flex items-center gap-x-2 gap-y-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-0 [&::-webkit-scrollbar]:hidden">
      <span className="shrink-0 text-[13px] font-medium text-zinc-500 dark:text-zinc-400">Most listed:</span>
      {pills.map((p, i) => (
        <Link
          key={p.key}
          href={p.href}
          data-analytics-click="quick_filter_clicked"
          data-analytics-props={JSON.stringify({
            surface: "home",
            section: "quick_filters",
            position: i + 1,
            kind: p.kind,
            content_id: p.href,
          })}
          // min-h-9 keeps these comfortably tappable without making the
          // row as heavy as the deal-category strip below, which is the
          // primary navigation of the two.
          className="inline-flex min-h-9 shrink-0 items-center rounded-full border border-zinc-200 bg-white px-3 text-[13px] font-medium text-zinc-700 transition-colors hover:border-red-300 hover:text-red-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:text-red-400"
        >
          {p.label}
        </Link>
      ))}
    </div>
  );
}
