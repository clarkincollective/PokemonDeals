import Link from "next/link";
import Logo from "@/components/Logo";
import NavMenu from "@/components/NavMenu";
import NavDropdown from "@/components/NavDropdown";
import RegionControl from "@/components/RegionControl";
import SavedNavLink from "@/components/SavedNavLink";
import { NAV_RAIL, NAV_SEARCH, navGroupItems } from "@/lib/navLinks";

// Shared sticky header. Desktop (>= lg): the logo, then the flat rail of
// seven named destinations (Deals, Pokemon, Sets, Graded, Sealed,
// Research, Guides), with Saved, the market/currency control and a search
// icon as utilities on the right. Mobile: the slide-in NavMenu. Every
// renderer reads the same nav model from lib/navLinks.js.
//
// There is deliberately NO account or sign-in control: the site has no
// accounts. "Saved" is this device's own list (localStorage), which is
// why it is a utility rather than a signed-in surface.
export default function SiteHeader() {
  return (
    <div className="sticky top-0 z-30 border-b border-zinc-200 bg-paper/90 backdrop-blur-xl dark:border-zinc-700/70 dark:bg-black/80">
      {/* px-4 below sm: the wordmark + region control + menu button must
          fit a 320px viewport without the page scrolling sideways */}
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3.5 sm:gap-6 sm:px-6 sm:py-4">
        <Link href="/" className="shrink-0 rounded-md transition-opacity hover:opacity-80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600">
          <Logo size="small" />
        </Link>

        {/* The flat seven-destination rail (lib/navLinks NAV_RAIL). Deals
            and Sets keep their submenu on a chevron beside the label, so
            every destination the grouped header used to carry is still
            one hover away and still in the server HTML. */}
        <nav aria-label="Primary" className="hidden flex-1 items-center justify-center gap-0.5 lg:flex xl:gap-1">
          {NAV_RAIL.map((link) =>
            link.railGroup ? (
              <NavDropdown
                key={link.href}
                href={link.href}
                label={link.label}
                items={navGroupItems(link.railGroup)}
              />
            ) : (
              <a
                key={link.href}
                href={link.href}
                // Carried from the shared model, so a rail destination is
                // measured exactly as the same destination is in the
                // mobile menu and the footer - see NAV_RAIL/fromPrimary.
                data-analytics-click={link.analyticsClick ?? undefined}
                data-analytics-props={link.analyticsClick ? JSON.stringify(link.analyticsProps ?? {}) : undefined}
                className="flex min-h-11 items-center rounded-lg px-3 text-sm font-semibold tracking-tight text-zinc-800 transition-colors hover:bg-zinc-100 hover:text-red-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600 dark:text-zinc-200 dark:hover:bg-red-950 dark:hover:text-red-400"
              >
                {link.label}
              </a>
            )
          )}
        </nav>

        <div className="flex items-center gap-2">
          {/* §6: "Saved (N)" - a utility beside the market control, not a
              fourth destination; the count is this device's own list */}
          <SavedNavLink />
          <RegionControl />
          <a
            href={NAV_SEARCH.href}
            aria-label="Search cards and sets"
            className="hidden h-11 w-11 items-center justify-center rounded-full text-zinc-600 transition-colors hover:bg-zinc-100 hover:text-red-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600 lg:inline-flex dark:text-zinc-300 dark:hover:bg-red-950 dark:hover:text-red-400"
          >
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" className="h-5 w-5">
              <circle cx="8.5" cy="8.5" r="5.5" />
              <line x1="16" y1="16" x2="12.5" y2="12.5" />
            </svg>
          </a>
          <div className="lg:hidden">
            <NavMenu />
          </div>
        </div>
      </div>
    </div>
  );
}
