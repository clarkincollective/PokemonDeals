import Link from "next/link";
import Logo from "@/components/Logo";
import NavMenu from "@/components/NavMenu";
import NavDropdown from "@/components/NavDropdown";
import RegionControl from "@/components/RegionControl";
import { NAV_PRIMARY, NAV_GROUPS, NAV_SEARCH, navGroupItems } from "@/lib/navLinks";

// Shared sticky header (deal-first R1). Desktop (>= lg): the logo, then
// three destinations - "Deals ▾", "Cards & Sets ▾" (every current route
// inside a labelled submenu) and "Guides & Research" - with the
// market/currency control and a search icon as utilities on the right.
// Mobile: the slide-in NavMenu. Every renderer reads the same nav model
// from lib/navLinks.js.
export default function SiteHeader() {
  return (
    <div className="sticky top-0 z-30 border-b border-zinc-200 bg-paper/90 backdrop-blur-md dark:border-zinc-800 dark:bg-black/85">
      {/* px-4 below sm: the wordmark + region control + menu button must
          fit a 320px viewport without the page scrolling sideways */}
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3 sm:gap-4 sm:px-6">
        <Link href="/" className="shrink-0 rounded-md transition-opacity hover:opacity-80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600">
          <Logo size="small" />
        </Link>

        <nav aria-label="Primary" className="hidden flex-1 items-center gap-1 lg:flex">
          {NAV_GROUPS.map((group) => (
            <NavDropdown key={group.id} label={group.label} items={navGroupItems(group.id)} />
          ))}
          {/* inline top-level entries - today only Guides & Research. Every
              entry's event (incl. the graded entry event on /deals/graded,
              which lives inside Deals ▾ and is emitted by NavDropdown) comes
              from the shared model, so no renderer special-cases a route. */}
          {NAV_PRIMARY.filter((link) => link.group == null).map((link) => (
            <a
              key={link.href}
              href={link.href}
              rel={link.href.includes("?") ? "nofollow" : undefined}
              data-analytics-click={link.analyticsClick ?? undefined}
              data-analytics-props={link.analyticsClick ? JSON.stringify(link.analyticsProps ?? {}) : undefined}
              className="flex min-h-11 items-center rounded-lg px-3 text-sm font-semibold tracking-tight text-zinc-800 transition-colors hover:bg-zinc-100 hover:text-red-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600 dark:text-zinc-200 dark:hover:bg-zinc-900 dark:hover:text-red-500"
            >
              {link.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <RegionControl />
          <a
            href={NAV_SEARCH.href}
            aria-label="Search cards and sets"
            className="hidden h-11 w-11 items-center justify-center rounded-full text-zinc-600 transition-colors hover:bg-zinc-100 hover:text-red-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600 lg:inline-flex dark:text-zinc-300 dark:hover:bg-zinc-900 dark:hover:text-red-500"
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
