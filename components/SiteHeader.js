import Link from "next/link";
import Logo from "@/components/Logo";
import NavMenu from "@/components/NavMenu";
import NavDropdown from "@/components/NavDropdown";
import { NAV_PRIMARY, NAV_GROUPS, NAV_SEARCH } from "@/lib/navLinks";

// Shared sticky header. Desktop (>= lg): primary deal links inline +
// "Browse"/"Learn" dropdowns + a search icon, right-aligned. Mobile: the
// slide-in NavMenu. Both read the same nav model from lib/navLinks.js.
export default function SiteHeader() {
  return (
    <div className="sticky top-0 z-30 border-b border-zinc-200 bg-zinc-50/90 backdrop-blur dark:border-zinc-800 dark:bg-black/90">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-3">
        <Link href="/">
          <Logo size="small" />
        </Link>

        <div className="flex items-center gap-5">
          <nav className="hidden items-center gap-6 lg:flex">
            {NAV_PRIMARY.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className={
                  link.emphasis
                    ? "text-sm font-bold text-red-600 transition-colors hover:text-red-700 dark:text-red-500 dark:hover:text-red-400"
                    : "text-sm font-medium text-zinc-600 transition-colors hover:text-red-600 dark:text-zinc-300 dark:hover:text-red-500"
                }
              >
                {link.label}
              </a>
            ))}
            {NAV_GROUPS.map((group) => (
              <NavDropdown key={group.label} label={group.label} items={group.items} />
            ))}
          </nav>

          <a
            href={NAV_SEARCH.href}
            aria-label="Search"
            className="hidden rounded-md p-2 text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-red-600 lg:inline-flex dark:text-zinc-400 dark:hover:bg-zinc-900 dark:hover:text-red-500"
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
