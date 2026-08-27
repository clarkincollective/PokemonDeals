import Link from "next/link";
import Logo from "@/components/Logo";
import NavMenu from "@/components/NavMenu";
import { NAV_LINKS } from "@/lib/navLinks";

// Shared sticky header - was previously duplicated (Logo + hamburger-only
// NavMenu) across the homepage, Best Finds, and Search pages, and missing
// entirely from the deal detail page. Adds a real inline desktop nav
// (hidden below the lg breakpoint) alongside the existing mobile slide-in
// panel (hidden at lg and above) - NAV_LINKS is the single shared source
// for both, so they can't list different things.
export default function SiteHeader() {
  return (
    <div className="sticky top-0 z-30 border-b border-zinc-200 bg-zinc-50/90 backdrop-blur dark:border-zinc-800 dark:bg-black/90">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-3">
        <Link href="/">
          <Logo size="small" />
        </Link>

        <nav className="hidden items-center gap-7 lg:flex">
          {NAV_LINKS.map((link) => (
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
        </nav>

        <div className="lg:hidden">
          <NavMenu />
        </div>
      </div>
    </div>
  );
}
