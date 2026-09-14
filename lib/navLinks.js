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

export const NAV_GROUPS = [
  { id: "deals", label: "Deals" },
  { id: "catalogue", label: "Cards & Sets" },
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
  // --- Editorial: one top-level entry, landing on /guides -------------
  {
    href: "/guides",
    label: "Guides & Research",
    group: null,
    analyticsClick: "guides_research_clicked",
    analyticsProps: { section: "nav", source: "nav" },
  },
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
