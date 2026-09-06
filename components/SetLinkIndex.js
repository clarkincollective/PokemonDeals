// SERVER component. A complete, crawlable A-Z index of every set hub, as
// plain <a> links (no next/link - these must NOT prefetch ~200 routes or
// each become a client-component node in the RSC payload). No images, no
// filter, no display:none - ordinary catalogue navigation.
//
// SEO-GSC-2: the /cards hub previously fanned out to only 24 sets, so it
// was not a real entry point into the set -> card tree (GSC showed the
// deep catalogue reachable mostly via the sitemap and expiring deal
// URLs). This makes /cards a full second crawl path into all ~200
// `/sets/[slug]` pages, each of which already links its own cards.
//
// `sets` is [{ set, slug, count }] - the same shape the /sets index
// builds (deal-backed + catalogue-backed hubs, de-duped by slug).

const LIST_CLASS =
  "mt-1.5 flex flex-wrap gap-x-3 gap-y-1.5 [&_a]:text-[13px] [&_a]:leading-snug [&_a]:text-zinc-700 [&_a]:underline-offset-2 [&_a:hover]:text-red-600 [&_a:hover]:underline dark:[&_a]:text-zinc-300 dark:[&_a:hover]:text-red-500";

function firstLetter(name) {
  const c = String(name || "").trim().charAt(0).toUpperCase();
  return /[A-Z]/.test(c) ? c : "#";
}

export default function SetLinkIndex({ sets, headingId = "all-sets-index" }) {
  const linkable = (sets ?? []).filter((s) => s && s.slug && s.set);
  if (linkable.length === 0) return null;

  const byLetter = new Map();
  for (const s of [...linkable].sort((a, b) => a.set.localeCompare(b.set))) {
    const k = firstLetter(s.set);
    if (!byLetter.has(k)) byLetter.set(k, []);
    byLetter.get(k).push(s);
  }
  const groups = [...byLetter.entries()].sort(([a], [b]) =>
    a === "#" ? 1 : b === "#" ? -1 : a.localeCompare(b)
  );

  return (
    <section
      aria-labelledby={headingId}
      className="mt-12 border-t border-zinc-200 pt-8 dark:border-zinc-800"
    >
      <h2 id={headingId} className="text-lg font-bold text-black dark:text-zinc-50">
        {`Every set we track (${linkable.length})`}
      </h2>
      <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
        Open any set for its full card checklist with market-reference prices, plus any current
        below-market deals. A green count is how many qualifying deals that set has right now.
      </p>
      <div className="mt-4 space-y-5">
        {groups.map(([letter, list]) => (
          <div key={letter}>
            <h3 className="text-xs font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              {letter}
            </h3>
            <ul className={LIST_CLASS}>
              {list.map((s) => (
                <li key={s.slug}>
                  <a href={`/sets/${s.slug}`}>
                    {s.set}
                    {s.count > 0 ? ` (${s.count})` : ""}
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
