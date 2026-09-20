import Link from "next/link";
import { DEAL_CATEGORIES, DEAL_CATEGORY_SLUGS } from "@/lib/dealCategories";

// /deals browse guide (2026-09-21). The page was pure interface: an H1,
// two lines of caveat, a chip strip and the grid - no headings, nothing
// that answered what a reader of this page is actually asking. DataForSEO
// (21 Sep, US): "pokemon card deals" 1,600/mo at difficulty 2, and the
// only URL of ours in the top 30 is /deals/usa at 36.
//
// Scope deliberately kept to what docs/seo-headterm-strategy.md assigns
// this page: the LONG TAIL ("pokemon cards under $50", "graded pokemon
// card deals", "vintage pokemon card deals"). The homepage remains the
// primary candidate for the head term, so nothing here repeats that
// phrase as a heading or lead - the headings are the questions a browser
// of this list asks, and the category table is real descriptive internal
// linking instead of a strip of chips.
//
// Every category line is DERIVED from the registry's own `intro` (first
// sentence), so it cannot drift from the page it links to. Nothing here
// states a price, a count or a saving: this block is static, the figures
// live in the grid above it.
const H2 = "text-lg font-semibold tracking-tight text-zinc-900 dark:text-zinc-50";
const P = "mt-2 max-w-3xl text-sm leading-relaxed text-zinc-600 dark:text-zinc-400";
const LINK = "underline underline-offset-2 hover:text-red-600 dark:hover:text-red-500";

// First sentence of the category's own intro - the registry is the source.
function firstSentence(text) {
  const s = String(text ?? "").trim();
  const end = s.search(/\.\s|\.$/);
  return end === -1 ? s : s.slice(0, end + 1);
}

const EXTRA_ROWS = [
  {
    href: "/japanese-cards",
    label: "Japanese cards",
    blurb: "Japanese-language Pokemon cards, kept separate because a Japanese printing is a different card from its English counterpart and carries its own reference.",
  },
  {
    href: "/sealed-deals",
    label: "Sealed products",
    blurb: "Booster boxes, bundles, tins and other sealed product, compared against sealed references rather than single-card ones.",
  },
];

export default function DealsBrowseGuide() {
  const rows = [
    ...DEAL_CATEGORY_SLUGS.map((slug) => ({
      href: `/deals/${slug}`,
      label: DEAL_CATEGORIES[slug].h1,
      blurb: firstSentence(DEAL_CATEGORIES[slug].intro),
    })),
    ...EXTRA_ROWS,
  ];

  return (
    <section aria-labelledby="browse-guide" className="mt-12 border-t border-zinc-200 pt-8 dark:border-zinc-800" data-deals-browse-guide>
      <h2 id="browse-guide" className={H2}>
        What is in this list?
      </h2>
      <p className={P} data-direct-answer>
        Every Pokemon card listing the scanner currently tracks and is allowed to show, from eBay&apos;s United States,
        United Kingdom, Australia, Canada, Germany and Italy sites, newest first. Single cards in English and Japanese
        appear here; sealed product has its own page. Listings that fail a check are withheld rather than shown, and the
        running counts are on the{" "}
        <Link href="/integrity" className={LINK}>
          listing integrity report
        </Link>
        .
      </p>

      <h2 className={`${H2} mt-8`}>How do the filters work?</h2>
      <p className={P}>
        Each filter narrows the same list; none of them fetches anything new from eBay. Four axes, and one of them is
        read differently from how it looks:
      </p>
      <ul className="mt-3 max-w-3xl list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
        <li>
          <strong>Listing marketplace</strong> is which eBay site the listing sits on, not where it ships and not where
          the seller is. A listing on eBay US can ship to Australia and the reverse; the listing itself states its
          destinations.
        </li>
        <li>
          <strong>Card &amp; listing</strong> splits raw from graded, and Buy It Now from auction. A raw condition tier
          and a numeric grade are different systems and are never treated as equivalent.
        </li>
        <li>
          <strong>Price</strong> bands are in US dollars, so the same band means the same thing across marketplaces,
          even though each listing is shown in its own currency and yours.
        </li>
        <li>
          <strong>Sort</strong> defaults to newest. Biggest discount ranks by the saving where one is supported; it
          never promotes a listing that carries no comparison.
        </li>
      </ul>

      <h2 className={`${H2} mt-8`}>When does a listing show a saving, and when does it not?</h2>
      <p className={P}>
        A saving appears only when the delivered total sits below a recent-sold market reference for that exact printing
        and condition, and when eBay recorded the shipping so the total is real. Without those, the listing still
        appears, plainly, with the reason stated instead of a percentage. Auctions never show a saving at all: the
        figure is the current bid, it can rise until the auction ends, and it is labelled as a bid. The method is on the{" "}
        <Link href="/methodology" className={LINK}>
          methodology
        </Link>{" "}
        page.
      </p>

      <h2 className={`${H2} mt-8`}>Which category should you browse?</h2>
      <p className={P}>
        Each one is the same list with a preset applied, so a category page is a faster route than setting the filters
        by hand.
      </p>
      <div className="mt-4 max-w-4xl overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
        <table className="w-full border-collapse text-left text-sm" style={{ minWidth: "38rem" }} data-category-table={rows.length}>
          <thead>
            <tr className="border-b border-zinc-200 bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
              <th scope="col" className="px-3 py-2.5 font-semibold">
                Category
              </th>
              <th scope="col" className="px-3 py-2.5 font-semibold">
                What it holds
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 dark:divide-zinc-900">
            {rows.map((r) => (
              <tr key={r.href}>
                <th scope="row" className="px-3 py-3 align-top font-semibold">
                  <Link href={r.href} className="text-zinc-900 hover:text-red-600 hover:underline dark:text-zinc-50 dark:hover:text-red-500">
                    {r.label}
                  </Link>
                </th>
                <td className="px-3 py-3 align-top leading-relaxed text-zinc-600 dark:text-zinc-400">{r.blurb}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 className={`${H2} mt-8`}>How often does this list change?</h2>
      <p className={P}>
        New listings are discovered continuously, and the ones already here are re-checked on a rolling schedule, so a
        listing that sells or ends drops out shortly afterwards. Every listing shows when it was first found and, where
        eBay has confirmed it since, when it was last checked. Prices and availability are the seller&apos;s and can
        change at any time, so read the photos, condition and shipping on eBay before buying.
      </p>
    </section>
  );
}
