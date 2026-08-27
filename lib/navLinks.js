// Shared between SiteHeader's inline desktop nav and NavMenu's mobile
// slide-in panel, so they can't drift out of sync. Every href is a real
// destination - no Price Guide/Sets/Watchlist/Account, since none of
// those exist on this site. Graded/Auctions reuse the homepage's
// existing ?type=/?listing= filter params rather than being separate
// pages. #how-it-works/#faq only exist as anchors on the homepage, so
// they're absolute paths ("/#...") - a bare "#..." would try to scroll
// within whatever page you're currently on, where those ids don't exist.
export const NAV_LINKS = [
  { href: "/", label: "Deals" },
  { href: "/search", label: "Search" },
  { href: "/best-finds", label: "Best Finds" },
  { href: "/?type=graded", label: "Graded" },
  { href: "/?listing=AUCTION", label: "Auctions" },
  { href: "/#how-it-works", label: "How It Works" },
  { href: "/#faq", label: "FAQ" },
];
