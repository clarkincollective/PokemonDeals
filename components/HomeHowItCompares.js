import Link from "next/link";

// GEO 2026-09-20 - the homepage's answer-first explanatory block: what a
// "below market" deal is, how the site compares with the price guides and
// the deal communities that win these queries today, and why a bid is not
// a price. Every H2 opens with the one-sentence answer an engine can quote.
//
// Rules: nothing here states a price, a saving or a statistic the site does
// not publish; third-party tools are described only from their own pages,
// dated; never an authentication claim about any card. Static content, so the
// homepage stays statically cacheable. HOME_LAST_REVIEWED is the review
// date of THIS copy - the Article JSON-LD's dateModified - never a clock.
export const HOME_LAST_REVIEWED = "2026-09-20";
const THIRD_PARTY_READ_ON = "20 September 2026";

const TAKEAWAYS = [
  "A deal here is a live eBay listing whose delivered total is below a recent-sold market reference for the same printing and condition - never a discount off an asking price.",
  "Six eBay marketplaces are covered: United States, United Kingdom, Australia, Canada, Germany and Italy, shown in your currency with the original alongside.",
  "Listings that fail a check are withheld, and the counts are published daily on the listing integrity report.",
  "An auction's current bid is never presented as a saving; bids can rise until the auction ends.",
  "The site is free. It earns an affiliate commission on qualifying eBay and TCGplayer purchases, which does not change the price you pay.",
];

const COMPARISON = [
  ["Pokemon Deal Finder", "Lists live eBay listings below a recent-sold reference across six marketplaces", "Recent sold data per printing and condition, dated", "Yes: printing match, condition read, availability re-check, image screen", "Free; affiliate links"],
  ["TCGplayer price guide", "Marketplace with a price guide per card", "Its own marketplace listings and sales", "No - it is the marketplace", "Free to browse"],
  ["PriceCharting", "Price guide with PSA, BGS and ungraded values and a photo identifier", "Sold data", "No", "Free; premium tier"],
  ["Reddit r/PKMNTCGDeals", "Community posts of retail and online deals", "Members' reports", "No", "Free"],
  ["Deal-alert accounts and apps", "Push a deal someone spotted", "Varies; often the asking price", "Rarely against a condition-specific reference", "Free or subscription"],
];

const H2 = "text-lg font-semibold tracking-tight text-zinc-900 dark:text-zinc-50";
const P = "mt-2 max-w-3xl text-sm leading-relaxed text-zinc-600 dark:text-zinc-400";
const LINK = "underline underline-offset-2 hover:text-red-600 dark:hover:text-red-500";

export default function HomeHowItCompares() {
  return (
    <div id="how-it-compares" className="mt-10 scroll-mt-24" data-home-geo-block>
      <h2 className={H2}>How does Pokemon Deal Finder find Pokemon cards below market price?</h2>
      <p className={P} data-direct-answer>
        It compares every live eBay listing it tracks with a dated market reference for that exact printing and
        condition. Each listing passes a card-identity match, a seller-condition check, an availability re-check and
        an image-based authenticity screen before it appears. A saving is only claimed where the printing and
        condition are matched to a reference we can evidence, and that reference is shown beside it; where they are
        not, the listing is shown plainly with the reason.
      </p>

      <h3 className="mt-6 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Key takeaways</h3>
      <ul className="mt-2 max-w-3xl list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400" data-key-takeaways={TAKEAWAYS.length}>
        {TAKEAWAYS.map((t) => (
          <li key={t}>{t}</li>
        ))}
      </ul>

      <h2 className={`${H2} mt-10`}>What does &ldquo;below market price&rdquo; mean for a Pokemon card?</h2>
      <p className={P}>
        A card is below market price when its delivered eBay total is lower than a recent-sold market reference for the
        same printing and condition. The reference is not an asking price and not an average across conditions: a raw
        card is compared only with a raw reference for its stated condition, and a graded card only with a reference
        for that grader and grade. When no trustworthy reference exists for that exact printing and condition, the
        listing is shown plainly with no saving claimed. The full method is on the{" "}
        <Link href="/methodology" className={LINK}>
          methodology
        </Link>{" "}
        page.
      </p>

      <h2 className={`${H2} mt-10`}>How is it different from TCGplayer, PriceCharting and deal communities?</h2>
      <p className={P}>
        Price guides tell you what a card is worth; deal communities tell you what someone noticed; Pokemon Deal Finder
        tells you which live eBay listings are under the reference right now, and checks each one first. The tools are
        complementary, and the table says what each does.
      </p>
      <div className="mt-4 max-w-5xl overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
        <table className="w-full border-collapse text-left text-sm" style={{ minWidth: "44rem" }} data-comparison-table>
          <caption className="px-3 py-2 text-left text-xs text-zinc-500 dark:text-zinc-400">
            Third-party tools are described from their own pages as read on {THIRD_PARTY_READ_ON}; they may change.
          </caption>
          <thead>
            <tr className="border-b border-zinc-200 bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
              {["Tool", "What it does", "Where the price comes from", "Checks the listing?", "Cost"].map((h) => (
                <th key={h} scope="col" className="px-3 py-2.5 font-semibold">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 dark:divide-zinc-900">
            {COMPARISON.map((row) => (
              <tr key={row[0]}>
                {row.map((cell, j) =>
                  j === 0 ? (
                    <th key={j} scope="row" className="px-3 py-3 align-top font-semibold text-zinc-900 dark:text-zinc-50">
                      {cell}
                    </th>
                  ) : (
                    <td key={j} className="px-3 py-3 align-top leading-relaxed text-zinc-600 dark:text-zinc-400">
                      {cell}
                    </td>
                  )
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className={P}>
        Reddit communities such as r/PKMNTCGDeals are strongest for retail stock, sealed product and seller reputation;
        they do not compare each eBay listing with a condition-specific reference, and posts age quickly. Use them for
        retail drops and this feed for single cards on eBay right now.
      </p>

      <h2 className={`${H2} mt-10`}>Why is an auction bid not the same as a deal price?</h2>
      <p className={P}>
        A current bid is the price right now, not the price you will pay, because bids rise until the auction ends. The
        site shows auctions with an amber &ldquo;Bid&rdquo; label, the bid, the recorded shipping and the estimated
        total, states that bids can raise the final price, and never gives an auction the savings badge that a Buy It Now
        listing can earn.
      </p>

      <h2 className={`${H2} mt-10`}>What should you check on a listing before buying?</h2>
      <p className={P}>
        Check that the photos show the actual card, that the printing in the photos matches the title, that the stated
        condition is supported by corners, edges and surface, and that the delivered total is the figure you compared.
        No third-party site can verify a physical card from a listing; the site withholds listings that fail its image
        screen or use replica or proxy wording, and never labels a listing as authenticated. eBay&apos;s Money Back
        Guarantee covers an item that never arrives or is not as described when you pay through eBay checkout. The{" "}
        <Link href="/guides/buying-pokemon-cards-on-ebay-safely" className={LINK}>
          eBay buyer&apos;s checklist
        </Link>{" "}
        walks through it.
      </p>

      <p className="mt-8 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-zinc-500 dark:text-zinc-400" data-home-byline>
        <span>
          Built and run by an independent collector, not a shop, a grader or a marketplace -{" "}
          <Link href="/about" className={LINK}>
            who runs this
          </Link>
          .
        </span>
        <span aria-hidden="true">·</span>
        <span>
          This explanation last reviewed <time dateTime={HOME_LAST_REVIEWED}>20 September 2026</time>.
        </span>
      </p>
    </div>
  );
}
