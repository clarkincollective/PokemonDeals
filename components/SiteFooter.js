import { Fragment } from "react";
import Link from "next/link";

// Shared site footer: the affiliate disclosure (previously copy-pasted,
// slightly differently, into every page) plus a links row to the
// trust/methodology pages so they're reachable from every page. `note` is
// an optional page-specific caveat sentence appended after the standard
// disclosure - pass the wording that page already used (e.g. the sealed
// page's "genuinely factory sealed", the Japanese page's "genuinely the
// Japanese print").

// SEO-GSC-2: a stable, server-rendered, ALWAYS-VISIBLE (no display:none,
// no JS, no churn) row of the four catalogue hubs + deals, on every page.
// GSC (2026-09-06) showed the /pokemon and /cards index pages had never
// been crawled - the only site-wide links to them lived in a
// double-hidden desktop header dropdown / a click-gated mobile menu. This
// gives every one of the ~24k card, ~900 species, ~200 set and every
// deal page a plain <a href> to each hub, so a crawl that lands anywhere
// can reach the whole catalogue tree. Ordinary navigation, not a link
// farm.
const BROWSE_LINKS = [
  { href: "/deals", label: "All Deals" },
  { href: "/cards", label: "Card Database" },
  { href: "/pokemon", label: "Browse by Pokemon" },
  { href: "/sets", label: "Browse by Set" },
  { href: "/guides", label: "Buying Guides" },
];

const LINKS = [
  { href: "/about", label: "About" },
  { href: "/how-it-works", label: "How It Works" },
  { href: "/methodology", label: "Methodology" },
  { href: "/guides", label: "Guides" },
  { href: "/affiliate-disclosure", label: "Affiliate Disclosure" },
  { href: "/privacy", label: "Privacy" },
  { href: "/contact", label: "Contact" },
];

export default function SiteFooter({ note }) {
  return (
    <footer className="border-t border-zinc-200 px-6 py-8 text-xs text-zinc-500 dark:border-zinc-800">
      <nav
        aria-label="Browse the catalogue"
        className="mx-auto mb-6 flex max-w-3xl flex-wrap items-center justify-center gap-x-4 gap-y-1.5 text-[13px] font-medium"
      >
        {BROWSE_LINKS.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className="text-zinc-600 hover:text-red-600 hover:underline dark:text-zinc-300 dark:hover:text-red-500"
          >
            {l.label}
          </Link>
        ))}
      </nav>
      <p className="mx-auto max-w-3xl text-center">
        As an eBay and TCGPlayer affiliate, we earn a commission on qualifying purchases made through
        links on this site. Prices and availability are subject to change and were accurate as of the
        listing&apos;s last scan.
        {note ? ` ${note}` : ""}
      </p>
      <nav className="mx-auto mt-4 flex max-w-3xl flex-wrap items-center justify-center gap-x-2.5 gap-y-1">
        {LINKS.map((l, i) => (
          <Fragment key={l.href}>
            {i > 0 && (
              <span aria-hidden className="text-zinc-300 dark:text-zinc-700">
                ·
              </span>
            )}
            <Link href={l.href} className="hover:text-zinc-700 hover:underline dark:hover:text-zinc-300">
              {l.label}
            </Link>
          </Fragment>
        ))}
      </nav>
    </footer>
  );
}
