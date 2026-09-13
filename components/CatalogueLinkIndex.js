import { groupBySet } from "@/lib/catalogueView";
import { cardNameWithoutNumber } from "@/lib/cardName";
import { compareCollectorNumber } from "@/lib/setChecklist";
import { eraForSet, UNDATED_ERA } from "@/lib/speciesCoverage";
import { setChronologyRank } from "@/lib/pokemonSets";

// SERVER component. The complete permanent /cards/[slug] link inventory for
// a species or set page, as plain <a> links (no next/link - these must NOT
// prefetch hundreds of routes or each become a client node in the RSC
// payload), no images / prices / buttons. Every link is in the initial HTML.
//
// Mobile UX refinement (2026-09-14): the visual gallery is now the primary
// browse view on these pages and this index is the compact "List" option.
// Instead of one long wall of wrapped links it is organised into
// descriptive, natively expandable <details> sections - across many sets by
// release era (lib/speciesCoverage eraForSet, the same dating the checklist
// pilots use; undated promos/exclusives are "Other sets"), within a single
// set by rarity in collector-number order. Collapsed sections keep their
// links in the DOM (a closed <details> is not removed from the document), so
// the crawlable inventory is unchanged. Each link shows the collector number
// exactly once (lib/cardName cardNameWithoutNumber).
//
// The whole index is ONE collapsed <details> by default: its summary is the
// compact "Full X card index (N)" heading (N = the number of links listed),
// and the explanatory line plus every section/link sit inside it. Choosing
// "Card list" therefore reveals one control, not hundreds of links, and it
// opens without JavaScript. Interactive ownership checklists are separate
// components and unaffected.
//
// `cards` is the array buildCatalogueItems produces (or any shape with
// name / cardNumber / set / rarity / hubSlug|catalogSlug).

function permanentHref(c) {
  if (c.hubSlug) return `/cards/${c.hubSlug}`;
  if (c.catalogSlug) return `/cards/${c.catalogSlug}`;
  return null;
}

// Link styling lives on the <ul> as an arbitrary-variant rule so each of
// the (up to several hundred) <a> tags carries NO className - that keeps
// both the SSR HTML and the RSC payload small.
const LIST_CLASS =
  "mt-2 grid gap-x-4 sm:grid-cols-2 lg:grid-cols-3 [&_a]:flex [&_a]:min-h-10 [&_a]:items-center [&_a]:gap-2 [&_a]:border-b [&_a]:border-zinc-100 [&_a]:py-1.5 [&_a]:text-[14px] [&_a]:leading-snug [&_a]:text-zinc-800 [&_a:hover]:text-red-600 dark:[&_a]:border-zinc-900 dark:[&_a]:text-zinc-200 dark:[&_a:hover]:text-red-500 [&_span]:ml-auto [&_span]:shrink-0 [&_span]:tabular-nums [&_span]:text-[13px] [&_span]:text-zinc-500 dark:[&_span]:text-zinc-400";

const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

function linkItem(c) {
  return (
    <li key={c.tcgplayerId ?? `${c.name}|${c.cardNumber}|${c.set}`}>
      <a href={permanentHref(c)}>
        {cardNameWithoutNumber(c)}
        {c.cardNumber ? <span>#{c.cardNumber}</span> : null}
      </a>
    </li>
  );
}

// Many sets -> one section per release era, sets inside in release order.
function eraSections(linkable) {
  const byEra = new Map();
  for (const { set, list } of groupBySet(linkable)) {
    const era = eraForSet(set);
    if (!byEra.has(era.key)) byEra.set(era.key, { era, sets: [] });
    byEra.get(era.key).sets.push({ set, list: [...list].sort(compareCollectorNumber) });
  }
  const sections = [...byEra.values()].map(({ era, sets }) => {
    sets.sort((a, b) => setChronologyRank(a.set) - setChronologyRank(b.set) || String(a.set).localeCompare(String(b.set), "en"));
    const count = sets.reduce((n, s) => n + s.list.length, 0);
    return {
      key: era.key,
      title: era.label,
      meta: [era.years, plural(count, "card"), plural(sets.length, "set")].filter(Boolean).join(" · "),
      note: era.key === UNDATED_ERA.key ? UNDATED_ERA.note : null,
      sets,
      rank: era.key === UNDATED_ERA.key ? Number.MAX_SAFE_INTEGER : Math.min(...sets.map((s) => setChronologyRank(s.set))),
    };
  });
  return sections.sort((a, b) => a.rank - b.rank);
}

// One set -> one section per rarity, ordered by where that rarity starts in
// the set's own numbering, each showing its collector-number range.
function raritySections(linkable) {
  const ordered = [...linkable].sort(compareCollectorNumber);
  const byRarity = new Map();
  for (const c of ordered) {
    const key = c.rarity || "Other";
    if (!byRarity.has(key)) byRarity.set(key, []);
    byRarity.get(key).push(c);
  }
  return [...byRarity.entries()].map(([rarity, list]) => {
    const first = list[0]?.cardNumber;
    const last = list[list.length - 1]?.cardNumber;
    const range = first && last ? (first === last ? `#${first}` : `#${first} – #${last}`) : null;
    return {
      key: rarity,
      title: rarity,
      meta: [plural(list.length, "card"), range].filter(Boolean).join(" · "),
      note: null,
      sets: [{ set: null, list }],
    };
  });
}

export default function CatalogueLinkIndex({ label, cards, headingId = "full-card-index" }) {
  const linkable = (cards ?? []).filter((c) => permanentHref(c));
  if (linkable.length === 0) return null;
  const setCount = new Set(linkable.map((c) => c.set)).size;
  const sections = setCount > 1 ? eraSections(linkable) : raritySections(linkable);
  const meta = setCount > 1
    ? `${plural(setCount, "set")} · grouped by release era`
    : sections.length > 1 ? "Grouped by rarity, in collector-number order" : "In collector-number order";

  return (
    <section aria-labelledby={headingId} className="mt-4">
      <details className="group/index rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
        <summary className={SUMMARY_CLASS}>
          <span className="min-w-0">
            <h2 id={headingId} className="text-base font-bold leading-snug text-zinc-900 dark:text-zinc-50">
              {`Full ${label} card index (${linkable.length})`}
            </h2>
            <span className="block text-xs text-zinc-500 dark:text-zinc-400">{meta}</span>
          </span>
          <Chevron className="group-open/index:rotate-180" />
        </summary>
        <div className="border-t border-zinc-200 px-4 pb-4 pt-3 dark:border-zinc-800">
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            {sections.length > 1
              ? `Every ${label} card we track, linked to its price & deal page. Open a section below to see its cards.`
              : `Every ${label} card we track, linked to its price & deal page.`}
          </p>
          {sections.length === 1 ? (
            <SectionBody s={sections[0]} />
          ) : (
            <div className="mt-3 divide-y divide-zinc-200 rounded-lg border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
              {sections.map((s) => (
                <details key={s.key} className="group">
                  <summary className={SUMMARY_CLASS}>
                    <span className="min-w-0">
                      <span className="block text-[15px] font-semibold leading-snug text-zinc-900 dark:text-zinc-50">{s.title}</span>
                      <span className="block text-xs text-zinc-500 dark:text-zinc-400">{s.meta}</span>
                    </span>
                    <Chevron className="group-open:rotate-180" />
                  </summary>
                  <div className="px-4 pb-4">
                    <SectionBody s={s} />
                  </div>
                </details>
              ))}
            </div>
          )}
        </div>
      </details>
    </section>
  );
}

const SUMMARY_CLASS =
  "flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-4 py-2.5 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-red-600 [&::-webkit-details-marker]:hidden";

function Chevron({ className }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={`h-4 w-4 shrink-0 text-zinc-500 transition-transform ${className}`}>
      <path d="M5 7.5 10 12.5 15 7.5" />
    </svg>
  );
}

function SectionBody({ s }) {
  return (
    <>
      {s.note && <p className="text-xs text-zinc-500 dark:text-zinc-400">{s.note}</p>}
      {s.sets.map(({ set, list }) => (
        <div key={set || s.key} className={set ? "mt-3" : undefined}>
          {set && (
            <h3 className="text-xs font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              {`${set} (${list.length})`}
            </h3>
          )}
          <ul className={LIST_CLASS}>{list.map(linkItem)}</ul>
        </div>
      ))}
    </>
  );
}
