// Shared nav model for SiteHeader (desktop, inline + dropdowns) and
// NavMenu (mobile slide-in, grouped) so the two can't drift.
//
// Ordering is deliberate (consumer psychology for a deal site):
//  - PRIMARY leads with urgency then curation, then the two highest
//    purchase-intent buyer filters (Graded, Auctions) - promoted from the
//    bottom of the old flat 13-link bar.
//  - Everything exploratory is chunked under "Browse", everything
//    trust/education under "Learn", to cut the top-level choice count
//    (Hick's law) without losing anything.
//  - Search is a right-aligned icon in the header, out of the nav list -
//    it's a utility, not a destination competing for attention.
//
// `emphasis: true` marks the one entry (Hot Deals) that gets bold red
// styling; both renderers read it. Anchor links use absolute "/#..."
// (they only exist on the homepage).

export const NAV_PRIMARY = [
  { href: "/", label: "🔥 Hot Deals", emphasis: true },
  { href: "/best-finds", label: "Top 10" },
  // Clean dedicated routes rather than the old `/?type=graded` /
  // `/?listing=AUCTION` filter URLs (which the renderers nofollow) - a
  // real crawlable landing page for each, same live results underneath.
  { href: "/deals/graded", label: "Graded" },
  { href: "/deals/auctions", label: "Auctions" },
];

export const NAV_GROUPS = [
  {
    label: "Browse",
    items: [
      { href: "/search", label: "Price Checker" },
      { href: "/cards", label: "Card Database" },
      { href: "/deals", label: "Deals by Price" },
      { href: "/sets", label: "Sets" },
      { href: "/pokemon", label: "Pokemon" },
      { href: "/sealed-deals", label: "Sealed Product" },
      { href: "/japanese-cards", label: "Japanese Cards" },
      { href: "/market-data", label: "Market Data" },
    ],
  },
  {
    label: "Learn",
    items: [
      { href: "/how-it-works", label: "How It Works" },
      { href: "/methodology", label: "Methodology" },
      { href: "/guides", label: "Guides" },
      { href: "/#faq", label: "FAQ" },
    ],
  },
];

export const NAV_SEARCH = { href: "/search", label: "Search" };
