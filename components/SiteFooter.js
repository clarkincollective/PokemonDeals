import { Fragment } from "react";
import Link from "next/link";
import Logo from "@/components/Logo";
import { SOCIAL_PROFILES } from "@/lib/socialProfiles";
import { NAV_PRIMARY, NAV_LEARN } from "@/lib/navLinks";

// Shared site footer (deal-first R1): one grouped destination block on
// every page, then the affiliate disclosure and trust links.
//
// SEO-GSC-2: the "Browse the catalogue" row below is a stable,
// server-rendered, ALWAYS-VISIBLE (no display:none, no JS, no churn) set
// of plain <a href> links to the catalogue hubs + deals, on every page.
// GSC (2026-09-06) showed the /pokemon and /cards index pages had never
// been crawled - the only site-wide links to them lived in a
// double-hidden desktop header dropdown / a click-gated mobile menu. This
// gives every one of the ~24k card, ~900 species, ~200 set and every
// deal page a plain anchor to each hub, so a crawl that lands anywhere
// can reach the whole catalogue tree. Ordinary navigation, not a link
// farm.
const BROWSE_LINKS = [
  { href: "/deals", label: "All Deals" },
  { href: "/cards", label: "Card Database" },
  { href: "/pokemon", label: "Browse by Pokemon" },
  { href: "/sets", label: "Browse by Set" },
  { href: "/guides", label: "Buying Guides" },
];

// Phase 17B - the follow row: only the verified profiles in
// lib/socialProfiles.js (the same list Organization.sameAs uses). Plain
// external links - rel="me" (identity), noopener noreferrer (safety), new
// tab - tracked by the passive delegated click listener, so tracking can
// never delay or block the navigation. No modal, no popup. Text labels
// (with the handle) rather than brand icons - restrained and unambiguous.

const LINKS = [
  { href: "/about", label: "About" },
  { href: "/how-it-works", label: "How It Works" },
  { href: "/methodology", label: "Methodology" },
  { href: "/guides", label: "Guides" },
  { href: "/affiliate-disclosure", label: "Affiliate Disclosure" },
  { href: "/privacy", label: "Privacy" },
  { href: "/contact", label: "Contact" },
];

const col = "flex flex-col gap-1.5 text-sm";
const colTitle = "mb-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-600 dark:text-zinc-400";
const link = "w-fit text-zinc-600 hover:text-red-600 hover:underline dark:text-zinc-300 dark:hover:text-red-500";

// `note` is an optional page-specific caveat sentence appended after the
// standard disclosure - pass the wording that page already used (e.g. the
// sealed page's "genuinely factory sealed", the Japanese page's
// "genuinely the Japanese print").
export default function SiteFooter({ note }) {
  const deals = NAV_PRIMARY.filter((l) => l.group === "deals");
  const catalogue = NAV_PRIMARY.filter((l) => l.group === "catalogue");
  return (
    <footer className="border-t border-zinc-200 bg-sunk px-6 py-10 text-xs text-zinc-600 dark:text-zinc-400 dark:border-zinc-800">
      <div className="mx-auto max-w-7xl">
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1fr]">
          <div>
            <Logo size="small" />
            <p className="mt-3 max-w-xs text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
              Independent comparisons of eBay Pokemon card listings against real market references.
              Purchases take place on eBay.
            </p>
            {/* the always-visible catalogue hub row (see SEO-GSC-2 above) */}
            <nav aria-label="Browse the catalogue" className="mt-4 flex flex-wrap gap-x-4 gap-y-1.5 text-[13px] font-medium">
              {BROWSE_LINKS.map((l) => (
                <Link key={l.href} href={l.href} className="text-zinc-600 hover:text-red-600 hover:underline dark:text-zinc-300 dark:hover:text-red-500">
                  {l.label}
                </Link>
              ))}
            </nav>
          </div>
          <div className={col}>
            <p className={colTitle}>Deals</p>
            {deals.map((l) => (
              <a
                key={l.href}
                href={l.href}
                data-analytics-click={l.analyticsClick ?? undefined}
                data-analytics-props={l.analyticsClick ? JSON.stringify({ ...(l.analyticsProps ?? {}), source: "footer" }) : undefined}
                className={link}
              >
                {l.label}
              </a>
            ))}
          </div>
          <div className={col}>
            <p className={colTitle}>Cards &amp; Sets</p>
            {catalogue.map((l) => (
              <a key={l.href} href={l.href} className={link}>
                {l.label}
              </a>
            ))}
          </div>
          <div className={col}>
            <p className={colTitle}>Learn</p>
            {NAV_LEARN.map((l) => (
              <a key={l.href} href={l.href} className={link}>
                {l.label}
              </a>
            ))}
            {SOCIAL_PROFILES.length > 0 && (
              <nav aria-label="Follow Pokemon Deal Finder" className="mt-3 flex flex-col gap-1.5">
                <span className={colTitle}>Follow new finds</span>
                {SOCIAL_PROFILES.map((s) => (
                  <a
                    key={s.platform}
                    href={s.url}
                    target="_blank"
                    rel="me noopener noreferrer"
                    aria-label={`Pokemon Deal Finder on ${s.label} (opens in a new tab)`}
                    data-analytics-click="social_follow_clicked"
                    data-analytics-props={JSON.stringify({ platform: s.platform, placement: "footer", page_type: "auto" })}
                    className="inline-flex w-fit items-center gap-1 text-zinc-600 hover:text-red-600 hover:underline dark:text-zinc-300 dark:hover:text-red-500"
                  >
                    <span className="font-medium">{s.label}</span>
                    <span className="text-zinc-600 dark:text-zinc-400">@{s.handle}</span>
                  </a>
                ))}
              </nav>
            )}
          </div>
        </div>

        <div className="mt-10 border-t border-zinc-200 pt-6 dark:border-zinc-800">
          <p className="max-w-3xl leading-relaxed">
            As an eBay and TCGPlayer affiliate, we earn a commission on qualifying purchases made through
            links on this site. Prices and availability are subject to change and were accurate as of the
            listing&apos;s last scan.
            {note ? ` ${note}` : ""}
          </p>
          <nav className="mt-4 flex flex-wrap items-center gap-x-2.5 gap-y-1">
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
        </div>
      </div>
    </footer>
  );
}
