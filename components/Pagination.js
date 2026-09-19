// Real, crawlable pagination - plain <a> links (not a client-side
// router push), so Googlebot can actually follow them without executing
// JS. Before this, deal pages beyond the homepage's first shuffled batch
// were reachable only via the sitemap - no internal link pointed at them
// at all, which starves them of the link equity a normal crawl path
// provides. currentParams preserves whatever filters (country/type/price)
// are active, same pattern as FilterBar's filterHref.
function pageHref(currentParams, page, basePath) {
  const params = new URLSearchParams(currentParams);
  if (page <= 1) params.delete("page");
  else params.set("page", String(page));
  const qs = params.toString();
  return qs ? `${basePath}?${qs}` : basePath;
}

// SEO audit 2026-09-20: paginated variants are noindex,follow, and
// Googlebot was spending its crawl on them dozens of pages deep. Links to
// page 6+ are nofollow - the first five pages still give a crawler a real
// path into the catalogue; deeper pages are for people.
const CRAWLABLE_PAGES = 5;

function PageLink({ href, active, disabled, children, ariaLabel, targetPage }) {
  if (disabled) {
    return (
      <span className="rounded-md border border-zinc-100 px-3 py-1.5 text-sm text-zinc-300 dark:border-zinc-900 dark:text-zinc-700">
        {children}
      </span>
    );
  }
  return (
    <a
      href={href}
      rel={targetPage > CRAWLABLE_PAGES ? "nofollow" : undefined}
      aria-label={ariaLabel}
      aria-current={active ? "page" : undefined}
      className={`rounded-md border px-3 py-1.5 text-sm font-medium transition-colors ${
        active
          ? "border-black bg-black text-white dark:border-white dark:bg-white dark:text-black"
          : "border-zinc-200 bg-white text-zinc-600 hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300"
      }`}
    >
      {children}
    </a>
  );
}

// Shows up to 7 page numbers centered on the current page, plus Prev/Next
// - enough to give crawlers/users a real path several pages deep without
// rendering a huge, mostly-useless number list on a 25-page catalog.
export default function Pagination({ page, totalPages, params, basePath = "/" }) {
  if (totalPages <= 1) return null;

  const windowSize = 7;
  let start = Math.max(1, page - Math.floor(windowSize / 2));
  let end = Math.min(totalPages, start + windowSize - 1);
  start = Math.max(1, end - windowSize + 1);
  const pages = Array.from({ length: end - start + 1 }, (_, i) => start + i);

  return (
    <nav aria-label="Pagination" className="mt-10 flex flex-wrap items-center justify-center gap-1.5">
      <PageLink href={pageHref(params, page - 1, basePath)} disabled={page <= 1} ariaLabel="Previous page" targetPage={page - 1}>
        ← Prev
      </PageLink>
      {start > 1 && (
        <>
          <PageLink href={pageHref(params, 1, basePath)} targetPage={1}>1</PageLink>
          {start > 2 && <span className="px-1 text-zinc-400">…</span>}
        </>
      )}
      {pages.map((p) => (
        <PageLink key={p} href={pageHref(params, p, basePath)} active={p === page} targetPage={p}>
          {p}
        </PageLink>
      ))}
      {end < totalPages && (
        <>
          {end < totalPages - 1 && <span className="px-1 text-zinc-400">…</span>}
          <PageLink href={pageHref(params, totalPages, basePath)} targetPage={totalPages}>{totalPages}</PageLink>
        </>
      )}
      <PageLink href={pageHref(params, page + 1, basePath)} disabled={page >= totalPages} ariaLabel="Next page" targetPage={page + 1}>
        Next →
      </PageLink>
    </nav>
  );
}

export { pageHref };
