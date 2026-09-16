import Link from "next/link";
import { relatedReading } from "@/lib/editorialRelated";
import { formatNewsDate } from "@/lib/news";

// The one cross-kind block: a guide's link to the news about its release,
// and a story's link to the guides that explain the same set. Rendered once
// per page, at the foot, by GuideLayout and by the news article route - so
// no article file carries its own copy and no page can grow a second one.
//
// Renders NOTHING when the page has no curated counterpart, so an article
// without one shows no empty heading (lib/editorialRelated explains why one
// article is deliberately unlinked).
//
// Visual idiom is the existing "Sources" block on a news page: a hairline
// rule, one small uppercase label, a plain list. A news link carries its
// publication date because a story is time-sensitive and a guide is not.
export default function RelatedReading({ kind, slug }) {
  const items = relatedReading(kind, slug);
  if (items.length === 0) return null;

  const heading = kind === "guide" ? "In the news" : "Related guides";

  return (
    <section aria-labelledby="related-reading-heading" className="mt-10 border-t border-zinc-200 pt-6 dark:border-zinc-800">
      <h2 id="related-reading-heading" className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-600 dark:text-zinc-400">
        {heading}
      </h2>
      <ul className="mt-3 space-y-2.5">
        {items.map((item) => (
          <li key={item.href}>
            <Link
              href={item.href}
              className="inline-flex min-h-11 items-center text-sm font-semibold text-red-600 underline decoration-red-200 underline-offset-4 hover:text-red-700 dark:text-red-500 dark:decoration-red-900"
            >
              {item.title}
            </Link>
            {item.published && (
              <span className="ml-2 text-xs text-zinc-500 dark:text-zinc-400">
                <time dateTime={item.published}>{formatNewsDate(item.published)}</time>
              </span>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
