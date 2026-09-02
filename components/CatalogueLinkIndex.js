import { groupBySet } from "@/lib/catalogueView";

// SERVER component. The rich <CatalogueBrowser> above only paints a
// bounded first screen of tiles (the rest render client-side on "Show
// more"), so this always-SSR compact directory is what keeps EVERY
// permanent /cards/[slug] link in the crawlable HTML - and gives a human
// a real, scannable, complete card index. Grouped by set, plain <a>
// links (no next/link - these must NOT prefetch 300+ routes and must not
// each become a client-component node in the RSC payload), no images /
// prices / buttons. Everything is visible (no display:none, no JS) -
// legitimate site navigation, not a hidden link farm.
//
// `cards` is the array buildCatalogueItems produces (or any shape with
// name / cardNumber / set / hubSlug|catalogSlug).

function permanentHref(c) {
  if (c.hubSlug) return `/cards/${c.hubSlug}`;
  if (c.catalogSlug) return `/cards/${c.catalogSlug}`;
  return null;
}

// Link styling lives on the <ul> as an arbitrary-variant rule so each of
// the (up to several hundred) <a> tags carries NO className - that keeps
// both the SSR HTML and the RSC payload small (the class string would
// otherwise repeat once per link in each).
const LIST_CLASS =
  "mt-1.5 flex flex-wrap gap-x-3 gap-y-1.5 [&_a]:text-[13px] [&_a]:leading-snug [&_a]:text-zinc-700 [&_a]:underline-offset-2 [&_a:hover]:text-red-600 [&_a:hover]:underline dark:[&_a]:text-zinc-300 dark:[&_a:hover]:text-red-500";

export default function CatalogueLinkIndex({ label, cards, headingId = "full-card-index" }) {
  const linkable = (cards ?? []).filter((c) => permanentHref(c));
  if (linkable.length === 0) return null;
  const groups = groupBySet(linkable);

  return (
    <section
      aria-labelledby={headingId}
      className="mt-12 border-t border-zinc-200 pt-8 dark:border-zinc-800"
    >
      <h2 id={headingId} className="text-sm font-semibold text-black dark:text-zinc-50">
        {`Full ${label} card index (${linkable.length})`}
      </h2>
      <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
        {`Every ${label} card we track, linked to its price & deal page. Use the browser above to search, filter and sort with full card art.`}
      </p>
      <div className="mt-4 space-y-5">
        {groups.map(({ set, list }) => (
          <div key={set || "unsorted"}>
            <h3 className="text-xs font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              {`${set || "Other"} (${list.length})`}
            </h3>
            <ul className={LIST_CLASS}>
              {list.map((c) => (
                <li key={c.tcgplayerId ?? `${c.name}|${c.cardNumber}|${c.set}`}>
                  <a href={permanentHref(c)}>
                    {c.cardNumber ? `${c.name} · #${c.cardNumber}` : c.name}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}
