import Link from "next/link";

// Visible breadcrumb trail. Pages already emit the matching
// BreadcrumbList JSON-LD; this is the on-page version Google recommends
// alongside it. `items` is [{ name, href? }] - the last item is the
// current page and has no href.
export default function Breadcrumbs({ items }) {
  return (
    <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400">
      {items.map((item, i) => {
        const last = i === items.length - 1;
        return (
          <span key={`${item.name}-${i}`} className="flex items-center gap-1.5">
            {i > 0 && <span aria-hidden className="text-zinc-300 dark:text-zinc-600">/</span>}
            {last || !item.href ? (
              <span aria-current={last ? "page" : undefined} className="truncate text-zinc-700 dark:text-zinc-300">
                {item.name}
              </span>
            ) : (
              <Link href={item.href} className="hover:text-red-600 hover:underline dark:hover:text-red-500">
                {item.name}
              </Link>
            )}
          </span>
        );
      })}
    </nav>
  );
}
