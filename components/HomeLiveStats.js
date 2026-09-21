import Link from "next/link";

// The compact platform-statistics row under the hero search.
//
// Every figure is a real production value passed in by the server
// component - nothing here is hardcoded, and the reference design's
// "1,319 / 992 / 6" were treated as placeholders, not as data.
//
// A stat that is unavailable is OMITTED, not defaulted. A zero or a dash
// in this row would read as a fact about the platform ("we checked
// nothing in 24 hours") rather than as a missing read, so the row simply
// renders fewer cells - and renders nothing at all if none survive.
//
// The fourth cell is deliberately not a number. "Exact matching" is a
// statement about method, and it links to the methodology page so the
// claim is checkable rather than decorative.
function Stat({ icon, value, label, href }) {
  const body = (
    <>
      <span aria-hidden="true" className="text-zinc-400">{icon}</span>
      <span className="min-w-0">
        <span className="block text-sm font-bold leading-tight text-zinc-900 dark:text-zinc-50">{value}</span>
        <span className="block text-xs leading-tight text-zinc-500 dark:text-zinc-400">{label}</span>
      </span>
    </>
  );
  const className = "flex items-center gap-2.5";
  return href ? (
    <Link href={href} className={`${className} rounded-lg transition-colors hover:text-red-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600`}>
      {body}
    </Link>
  ) : (
    <span className={className}>{body}</span>
  );
}

const ICONS = {
  listings: (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
      <rect x="2.5" y="4" width="15" height="12" rx="2" />
      <path d="M2.5 8h15M7 4v12" />
    </svg>
  ),
  checked: (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
      <circle cx="10" cy="10" r="7.5" />
      <path d="M10 6v4.2l2.8 1.8" />
    </svg>
  ),
  markets: (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
      <circle cx="10" cy="10" r="7.5" />
      <path d="M2.5 10h15M10 2.5c2 2.4 3 4.9 3 7.5s-1 5.1-3 7.5c-2-2.4-3-4.9-3-7.5s1-5.1 3-7.5Z" />
    </svg>
  ),
  matching: (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
      <rect x="2.5" y="3.5" width="9" height="13" rx="1.5" />
      <path d="M14 6.5h3.5V17H8.5" />
    </svg>
  ),
};

export default function HomeLiveStats({ liveCount, checked24h, marketplaceCount }) {
  const stats = [];
  if (liveCount != null) {
    stats.push({ key: "listings", icon: ICONS.listings, value: liveCount.toLocaleString(), label: "live listings", href: "/deals" });
  }
  if (checked24h != null) {
    stats.push({ key: "checked", icon: ICONS.checked, value: checked24h.toLocaleString(), label: "checked in last 24 hours", href: "/integrity" });
  }
  if (marketplaceCount) {
    stats.push({ key: "markets", icon: ICONS.markets, value: marketplaceCount, label: "eBay marketplaces", href: "/deals" });
  }
  stats.push({ key: "matching", icon: ICONS.matching, value: "Exact matching", label: "cards, printings & condition", href: "/methodology" });

  if (stats.length === 0) return null;

  return (
    <dl
      data-live-stats
      // Wraps rather than scrolls: four short cells fit two-up at 320px,
      // and a stats row that scrolls sideways hides half its own content.
      className="mt-5 flex flex-wrap gap-x-6 gap-y-3 sm:gap-x-9"
    >
      {stats.map((s) => (
        <div key={s.key}>
          <Stat icon={s.icon} value={s.value} label={s.label} href={s.href} />
        </div>
      ))}
    </dl>
  );
}
