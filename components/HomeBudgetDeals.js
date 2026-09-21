import Link from "next/link";
import Image from "next/image";

// "Deals under your budget" - the price-banded discovery modules.
//
// FOUR BANDS. Three existed (under-25/50/100); under-250 was added to
// lib/dealCategories as a real category with its own filter, copy and
// landing page, because stopping at $100 left out the band most chase
// cards and graded slabs actually sit in. It is a real route, not a
// tile added to match a picture - if it could not have been a real
// route, there would still be three here.
//
// CURRENCY. The thresholds are the categories' own USD bands and the
// labels say so. They are NOT converted into the viewer's currency,
// because /deals/under-25 filters on a USD figure: showing "Under A$38"
// on a tile that lands on a US$25 filter would misdescribe the
// destination. The card prices inside the tiles are localised as
// everywhere else - that is the site's existing behaviour and is
// untouched here.
// Tints are neutral / red / amber and deliberately NOT green: green on
// this site means an evidenced below-market figure, and a price-band
// tile is a filter, not a saving. redesign-theme enforces it.
const BANDS = [
  { href: "/deals/under-25", label: "Under $25", blurb: "Great finds for every collector", tint: "bg-zinc-50" },
  { href: "/deals/under-50", label: "Under $50", blurb: "Hidden gems", tint: "bg-red-50" },
  { href: "/deals/under-100", label: "Under $100", blurb: "Bigger deals", tint: "bg-amber-50" },
  { href: "/deals/under-250", label: "Under $250", blurb: "Chase cards for less", tint: "bg-red-50/60" },
];

export default function HomeBudgetDeals({ previewsByBand = {} }) {
  const bands = BANDS.map((b) => ({ ...b, previews: (previewsByBand[b.href] ?? []).filter((p) => p.image).slice(0, 3) }));
  if (bands.every((b) => b.previews.length === 0)) return null;

  return (
    <section aria-labelledby="budget-deals" className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6">
      <h2 id="budget-deals" className="text-xl font-bold tracking-tight text-zinc-900 sm:text-2xl dark:text-zinc-50">
        Deals under your budget
      </h2>
      <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {bands.map((b, i) => (
          <li key={b.href}>
            <Link
              href={b.href}
              data-analytics-click="budget_filter_clicked"
              data-analytics-props={JSON.stringify({
                surface: "home",
                section: "budget",
                position: i + 1,
                content_id: b.href,
              })}
              className={`group flex min-h-[7.5rem] items-center justify-between gap-3 rounded-xl border border-zinc-200 ${b.tint} p-4 transition-shadow hover:shadow-card-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600 dark:border-zinc-800 dark:bg-zinc-900`}
            >
              <span className="min-w-0">
                <span className="block text-lg font-bold tracking-tight text-zinc-900 dark:text-zinc-50">{b.label}</span>
                <span className="mt-0.5 block text-[13px] text-zinc-600 dark:text-zinc-400">{b.blurb}</span>
                <span className="mt-2 inline-flex items-center gap-1 text-[13px] font-semibold text-red-600 dark:text-red-500">
                  Browse
                  <span aria-hidden="true" className="transition-transform group-hover:translate-x-0.5">→</span>
                </span>
              </span>
              {b.previews.length > 0 && (
                <span aria-hidden="true" className="flex shrink-0 -space-x-3">
                  {b.previews.map((p, n) => (
                    <span
                      key={p.id ?? n}
                      className="relative block h-16 w-12 overflow-hidden rounded-md border border-white bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950"
                    >
                      <Image src={p.image} alt="" fill sizes="48px" className="object-contain p-0.5" />
                    </span>
                  ))}
                </span>
              )}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
