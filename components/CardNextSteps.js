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
        <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-400">Explore</h2>
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
            <PriceAlertForm cardSlug={alert.cardSlug} cardName={alert.cardName} suggestedPrice={null} />
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
        <p className="mt-4 text-sm">
          <EbaySearchLink
            href={ebaySearchHref}
            event={{ placement: "card_no_deal", cta: "search_ebay" }}
            className="font-medium text-red-600 hover:underline dark:text-red-500"
          >
            Search current eBay listings for this card
          </EbaySearchLink>{" "}
          <span className="text-xs text-zinc-400">(all listings, not checked against market price)</span>
        </p>
      )}
    </section>
  );
}
