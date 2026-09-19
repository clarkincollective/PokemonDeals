import Link from "next/link";
import PriceAlertForm from "@/components/PriceAlertForm";
import EbaySearchLink from "@/components/EbaySearchLink";

// Phase 17B - the "what now?" module for /cards/[slug].
//
// variant="no-deal"  (catalogue render: no live-deal hub for this card)
//   Says plainly that there is no live deal, then offers only things that
//   genuinely exist: a price alert (the alert cron matches by card slug,
//   so it fires once listings for this exact card appear - offered only
//   when email is enabled), real links from lib/cardNextSteps (live-deal
//   counts only when real and > 0), and an eBay search for the card,
//   labelled as a search, not a deal.
// variant="explore"  (live-deal hub) - the same bounded links as a compact
//   "explore" row; the listings themselves are already on the page.
export default function CardNextSteps({
  variant = "no-deal",
  links = [],
  alert = null, // { cardSlug, cardName } when alerts are enabled
  ebaySearchHref = null,
  className = "",
}) {
  if (variant === "explore") {
    if (links.length === 0) return null;
    return (
      <nav aria-label="Explore related cards and deals" className={className}>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-600 dark:text-zinc-400">Explore</h2>
        <ul className="mt-3 flex flex-wrap gap-2">
          {links.map((l) => (
            <li key={l.key}>
              <Link
                href={l.href}
                data-next-step={l.key}
                className="inline-flex rounded-lg border border-zinc-300 bg-white px-3.5 py-2 text-sm font-semibold text-black hover:border-zinc-400 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50 dark:hover:bg-zinc-800"
              >
                {l.label} →
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    );
  }

  return (
    <section
      aria-labelledby="card-next-steps"
      data-card-state="no-live-deal"
      className={`mt-6 rounded-xl border border-zinc-200 bg-white p-6 shadow-card dark:border-zinc-800 dark:bg-zinc-950 ${className}`}
    >
      <h2 id="card-next-steps" className="text-base font-semibold text-black dark:text-zinc-50">
        No live deal for this card right now
      </h2>
      <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
        We haven&apos;t found an active below-market eBay listing for this exact card in our latest scan. Here&apos;s
        where to look instead.
      </p>

      {alert && (
        <div className="mt-4">
          <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Get an email when a listing for this card appears
          </p>
          <div className="mt-2">
            <PriceAlertForm cardSlug={alert.cardSlug} cardName={alert.cardName} suggestedPrice={alert.suggestedPrice ?? null} />
          </div>
        </div>
      )}

      {links.length > 0 && (
        <ul className="mt-4 flex flex-wrap gap-2">
          {links.map((l) => (
            <li key={l.key}>
              <Link
                href={l.href}
                data-next-step={l.key}
                className="inline-flex rounded-lg border border-zinc-300 bg-white px-3.5 py-2 text-sm font-semibold text-black hover:border-zinc-400 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50 dark:hover:bg-zinc-800"
              >
                {l.label} →
              </Link>
            </li>
          ))}
        </ul>
      )}

      {ebaySearchHref && (
        // Growth batch 3 (2026-09-20): the catalogue render is the largest
        // search-landing family and this link is its only route to eBay -
        // a real control now, but a GHOST one on purpose: browsing all
        // listings is not a verified deal, so it never wears the primary
        // (lime) treatment, and the caveat stays beside it.
        <div className="mt-4">
          <EbaySearchLink
            href={ebaySearchHref}
            event={{ placement: "card_no_deal", cta: "search_ebay" }}
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-lg border border-zinc-300 bg-white px-4 text-sm font-semibold text-zinc-900 transition-colors hover:border-zinc-400 hover:bg-zinc-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50 dark:hover:bg-zinc-800"
          >
            Search current eBay listings for this card
            <span aria-hidden="true">→</span>
          </EbaySearchLink>
          <p className="mt-1.5 text-xs text-zinc-600 dark:text-zinc-400">Shows all listings, not checked against market price — read the photos, condition and shipping before buying.</p>
        </div>
      )}
    </section>
  );
}
