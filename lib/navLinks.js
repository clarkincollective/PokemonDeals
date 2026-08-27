// Shared between SiteHeader's inline desktop nav and NavMenu's mobile
// slide-in panel, so they can't drift out of sync. Every href is a real
// destination - no Price Guide/Watchlist/Account, since none of those
// exist on this site. Graded/Auctions reuse the homepage's existing
// ?type=/?listing= filter params rather than being separate pages.
// #how-it-works/#faq only exist as anchors on the homepage, so they're
// absolute paths ("/#..."), not bare "#..." (which would try to scroll
// within whatever page you're currently on, where those ids don't
// exist). Sets is a real page (app/sets/page.js) - not a hardcoded list,
// browsable per real set in the catalog. `emphasis: true` marks the one
// entry (Deals) that gets bold red styling instead of the shared neutral
// style - both SiteHeader and NavMenu read this flag.
export const NAV_LINKS = [
  { href: "/", label: "🔥 Hot Deals", emphasis: true },
  { href: "/best-finds", label: "Best Finds" },
  { href: "/sets", label: "Sets" },
  { href: "/japanese-cards", label: "Japanese Cards" },
  { href: "/sealed-deals", label: "Sealed Product" },
  { href: "/?type=graded", label: "Graded" },
  { href: "/?listing=AUCTION", label: "Auctions" },
  { href: "/#how-it-works", label: "How It Works" },
  { href: "/search", label: "Search" },
  { href: "/#faq", label: "FAQ" },
];
