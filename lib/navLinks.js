// Shared nav model for SiteHeader (desktop), NavMenu (mobile slide-in)
// and SiteFooter, so the three can't drift.
//
// Deal-first R1: the header is three things - Deals, Cards & Sets, and
// Guides & Research - with every current destination kept inside a
// well-labelled submenu. Search and the market/currency control are
// utilities beside them, not destinations competing for attention.
//
// ONE flat list (NAV_PRIMARY) carries every entry; `group` says which
// header submenu it belongs to (null = shown inline as a top-level link).
// Both renderers map over NAV_PRIMARY, so an entry that declares
// `analyticsClick` / `analyticsProps` is measurable wherever it appears
// (desktop dropdown, desktop inline, mobile menu). Filter-style URLs
// (containing "?") are nofollow'd by the renderers; every entry here is a
// clean route.

// 2026-09-22 homepage redesign: the desktop header is a FLAT rail of
// seven named destinations rather than three dropdown groups, matching
// the shopping-site hierarchy the redesign targets. Each entry is a real
// route - nothing here is decorative.
//
// Two deliberate departures from the reference design:
//   - "PSA 10" is labelled "Graded". /deals/graded covers PSA, CGC, BGS
//     and SGC at every grade; naming it after one grader's top grade
//     would promise a filter the route does not apply.
//   - The rail does NOT replace the grouped submenus. `railGroup` re-
//     attaches the existing dropdown to Deals and Sets, so the twenty-odd
//     destinations underneath (Top 10, Auctions, Under $25, UK/AU/CA,
//     Latest Releases, Card Database, Checklists, Market Data...) stay
//     one hover away and stay crawlable. Flattening them out of the
//     header entirely would have been an internal-linking regression
//     dressed up as a visual simplification.
export const NAV_GROUPS = [
  { id: "deals", label: "Deals" },
  { id: "catalogue", label: "Cards & Sets" },
  // The editorial destination. It became a submenu when /news was added:
  // deal-first R1 caps the header at THREE destinations, so the dated news
  // hub and the evergreen guides hub share this one rather than the
  // editorial surfaces taking two of the three slots.
  { id: "editorial", label: "News & Guides" },
];

// `menuShortcut: true` marks the deal entries the MOBILE menu shows as its
// first screen of shortcut tiles; every other entry still appears there,
// inside an expandable group. Desktop header and footer ignore the flag.
export const NAV_PRIMARY = [
  // --- Deals: the offer surfaces, all live results underneath ---------
  // Every eligible listing, all marketplaces, exact counts (app/deals/page.js).
  { href: "/deals", label: "All deals", group: "deals", menuShortcut: true },
  { href: "/best-finds", label: "Top 10 Right Now", group: "deals", menuShortcut: true },
  { href: "/deals/auctions", label: "Auctions", group: "deals", menuShortcut: true },
  // The established graded entry event, declared on the model so EVERY
  // renderer (desktop submenu, mobile menu, footer) emits it exactly once
  // per click. `graded_entry` stays for prop continuity; AnalyticsBootstrap
  // only adds a second graded_clicked when the marker is NOT already it.
  {
    href: "/deals/graded",
    label: "Graded Cards",
    group: "deals",
    menuShortcut: true,
    analyticsClick: "graded_clicked",
    analyticsProps: { section: "nav", source: "nav", graded_entry: true },
  },
  { href: "/deals/under-25", label: "Under $25", group: "deals", menuShortcut: true },
  // audit-r1: country-first landing pages (lib/dealCategories)
  { href: "/deals/uk", label: "UK Deals", group: "deals" },
  { href: "/deals/australia", label: "Australia Deals", group: "deals" },
  { href: "/deals/canada", label: "Canada Deals", group: "deals" },
  { href: "/sealed-deals", label: "Sealed Products", group: "deals" },
  { href: "/japanese-cards", label: "Japanese Cards", group: "deals" },
  // 17C.8 - the newest expansions, their official dates and whatever
  // listings are eligible to show for them.
  {
    href: "/latest-releases",
    label: "Latest Releases",
    group: "deals",
    menuShortcut: true,
    analyticsClick: "latest_releases_clicked",
    analyticsProps: { section: "nav", source: "nav" },
  },
  // --- Cards & Sets: exact-card and catalogue jobs ---------------------
  { href: "/search", label: "Price Checker", group: "catalogue" },
  { href: "/cards", label: "Card Database", group: "catalogue" },
  { href: "/sets", label: "Sets & Checklists", group: "catalogue" },
  // The /sets directory's checklist view (hash, not a query: every
  // renderer uses plain <a>, which switches the CSS :target view).
  { href: "/sets#collection-checklists", label: "Collection checklists", group: "catalogue" },
  { href: "/pokemon", label: "Browse by Pokemon", group: "catalogue" },
  { href: "/market-data", label: "Market Data", group: "catalogue" },
  // --- Editorial: the "News & Guides" submenu -------------------------
  // News is the dated layer (new sets, new cards, price movements);
  // Guides & Research is the evergreen one. Both land on a hub.
  {
    href: "/news",
    label: "Latest News",
    group: "editorial",
    analyticsClick: "guides_research_clicked",
    analyticsProps: { section: "nav", source: "nav", content_id: "news" },
  },
  {
    href: "/guides",
    label: "Guides & Research",
    group: "editorial",
    analyticsClick: "guides_research_clicked",
    analyticsProps: { section: "nav", source: "nav" },
  },
];

// Built from NAV_PRIMARY where an entry already exists there, so a rail
// destination carries the SAME analytics markers every other renderer
// emits for it. The graded entry is the one that matters: it has carried
// a declared `graded_clicked` + `graded_entry` marker since P4, and a
// hand-written rail that dropped it would have silently stopped
// measuring the graded funnel from the most prominent place it appears.
const fromPrimary = (href, label) => {
  const entry = NAV_PRIMARY.find((l) => l.href === href);
  return {
    href,
    label,
    ...(entry?.analyticsClick ? { analyticsClick: entry.analyticsClick, analyticsProps: entry.analyticsProps } : {}),
  };
};

export const NAV_RAIL = [
  { ...fromPrimary("/deals", "Deals"), railGroup: "deals" },
  fromPrimary("/pokemon", "Pokemon"),
  { ...fromPrimary("/sets", "Sets"), railGroup: "catalogue" },
  fromPrimary("/deals/graded", "Graded"),
  fromPrimary("/sealed-deals", "Sealed"),
  fromPrimary("/market-data", "Research"),
  fromPrimary("/guides", "Guides"),
  // News sits beside Guides because they are two different KINDS of
  // reading, not two depths of the same one: /news is the dated layer
  // (a set releasing, a card confirmed, a price movement) and ages out
  // of relevance, while /guides is evergreen. Folding the dated articles
  // under "Guides" mislabelled them and left the news hub reachable on
  // desktop only through the mobile menu and the footer.
  // fromPrimary carries the entry's existing analytics markers, so this
  // is a new PLACEMENT of an existing destination, not a new event.
  fromPrimary("/news", "News"),
];


// Trust / education links. Out of the desktop header (the footer carries
// them on every page); the mobile menu keeps them as a small last group.
export const NAV_LEARN = [
  { href: "/how-it-works", label: "How It Works" },
  { href: "/methodology", label: "Methodology" },
  { href: "/#faq", label: "FAQ" },
];

export const NAV_SEARCH = { href: "/search", label: "Search" };

export const navGroupItems = (groupId) => NAV_PRIMARY.filter((l) => l.group === groupId);
export const navInlineItems = () => NAV_PRIMARY.filter((l) => l.group == null);
