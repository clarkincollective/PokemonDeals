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
    <div className="sticky top-0 z-30 border-b border-zinc-200 bg-paper/85 shadow-[0_1px_0_rgb(20_18_15/0.04)] backdrop-blur-md dark:border-zinc-800 dark:bg-black/85">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-3.5">
        <Link href="/" className="transition-opacity hover:opacity-80">
          <Logo size="small" />
        </Link>

        <div className="flex items-center gap-4">
          <nav className="hidden items-center gap-1 lg:flex">
            {NAV_PRIMARY.map((link) =>
              link.emphasis ? (
                <a
                  key={link.href}
                  href={link.href}
                  className="rounded-full bg-red-600 px-3.5 py-1.5 text-[13px] font-semibold text-white transition-colors hover:bg-red-700"
                >
                  {link.label}
                </a>
              ) : (
                <a
                  key={link.href}
                  href={link.href}
                  className="rounded-full px-3 py-1.5 text-[13px] font-semibold tracking-tight text-zinc-700 transition-colors hover:bg-zinc-100 hover:text-red-600 dark:text-zinc-300 dark:hover:bg-zinc-900 dark:hover:text-red-500"
                >
                  {link.label}
                </a>
              )
            )}
            {NAV_GROUPS.map((group) => (
              <NavDropdown key={group.label} label={group.label} items={group.items} />
            ))}
          </nav>

          <a
            href={NAV_SEARCH.href}
            aria-label="Search"
            className="hidden rounded-full p-2 text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-red-600 lg:inline-flex dark:text-zinc-400 dark:hover:bg-zinc-900 dark:hover:text-red-500"
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
