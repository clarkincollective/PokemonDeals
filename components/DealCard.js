import Link from "next/link";
import { MARKETPLACES, wrapEbayAffiliateUrl } from "@/lib/ebayLinks";
import { attributionOptionsForPageName } from "@/lib/affiliateAttribution";
import { slugifySet } from "@/lib/slugify";
import { currencyForDeal, refInListingCurrency } from "@/lib/money";
import RelativeTime, { WithinWindow } from "@/components/RelativeTime";
import { conditionLabel, listingPresentation, savingsPercentText } from "@/lib/dealQuality";
import { normalizePublicText } from "@/lib/publicText";
import { cardDisplayName } from "@/lib/cardName";
import { priceBandUsd, discountBand, listingTypeProp, rawVsGraded } from "@/lib/analytics/props";
import AffiliateLink from "@/components/AffiliateLink";
import DealImage from "@/components/DealImage";
import { dealImageProps } from "@/lib/listingImage";
import SaveCardButton from "@/components/SaveCardButton";
import MarketplaceMark from "@/components/MarketplaceMark";
import { dealQualityScore } from "@/lib/dealQualityScore";
import { CTA_CARD_CLASS, ctaLabelFor } from "@/lib/dealCta";
import Price from "@/components/Price";
import AuctionPrice from "@/components/AuctionPrice";
import AuctionEnd from "@/components/AuctionEnd";
import { offerShipping } from "@/lib/offerPresentation";
import { listingAvailabilityEvidence } from "@/lib/listingAvailability";

const JUST_FOUND_MS = 2 * 60 * 60 * 1000;

// The small mark beside each fact row. Decorative only - every row
// states its fact in words beside the icon, so these are aria-hidden and
// never the sole carrier of meaning.
const FACT_PATHS = {
  ship: "M2 7h9v6H2zM11 9h3.2l2.3 2.6V13H11zM5 15.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3ZM14 15.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z",
  cart: "M2.5 3h2l1.6 7.6h7.3l1.6-5.1H5.4M7.5 15a1 1 0 1 0 0-2 1 1 0 0 0 0 2Zm6 0a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z",
  clock: "M9 3.5a5.5 5.5 0 1 1 0 11 5.5 5.5 0 0 1 0-11ZM9 6v3.2l2.1 1.3",
  gavel: "M4 14h7M6.5 3.5l4 4M8.5 1.5l5 5-2 2-5-5zM7 7l4 4-2.5 2.5-4-4z",
  warn: "M9 3.2 16 15H2zM9 7.5v3M9 12.6v.01",
};
function FactIcon({ kind }) {
  return (
    <svg aria-hidden viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 shrink-0 opacity-70">
      <path d={FACT_PATHS[kind]} />
    </svg>
  );
}

// The primary "open on eBay" control, shared by every deal surface: brand
// red, white semibold text, 48px tall, 8px radius, hover / pressed /
// keyboard-focus states. One string so DealCard, SealedDealCard and the
// sticky CTA cannot drift.
export const CTA_PRIMARY_CLASS =
  "flex min-h-12 w-full items-center justify-center rounded-lg bg-red-600 px-4 text-center text-sm font-semibold text-white transition-colors hover:bg-red-700 active:bg-red-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600";

// CRO 2026-09-22 - the grid card's own CTA: the shared CTA_PRIMARY_CLASS
// contract (brand red, white label, 8px radius, hover / pressed /
// keyboard-focus states) laid out as TWO LINES, so the button can say
// what happens and where without a second control beside it. Taller than
// the shared one (56px vs 48px) because on a card it is the single
// conversion action and nothing else should read as its equal.
// CTA_PRIMARY_CLASS itself is unchanged - SealedDealCard and
// StickyDealCta still use it.
// The card's CTA treatment and the accepted CTA wording both live in
// lib/dealCta - the deal page's buying panel and its mobile sticky bar
// read the same two, so the three surfaces cannot drift. A
// component-to-component import of them broke the route harness, which
// stubs "@/components/*" with a default export only (the page rendered
// with ctaLabelFor undefined).

// CRO 2026-09-22: the discount is now the card's DOMINANT badge - a
// full-width bar over the artwork reading "N% below market" - and the
// deal score moved into Price details. Rendered only when the savings
// claim is TRUSTED and a shipping breakdown supports it
// (lib/dealQuality listingPresentation + lib/offerPresentation), never
// on a plain listing. SavingsBadge and DealQualityBadge are still used
// by SealedDealCard and remain exported.

// Deal-first R1/R2 - one offer in a grid, laid out as the deal-card
// contract (docs: PokemonDealFinder-Deal-First-Overhaul §5):
//
//   IDENTITY    artwork, full name, set (linked when the set page exists),
//               language, raw condition or grader + grade
//   OFFER       ONE dominant price with a clear meaning. When the scan
//               recorded a shipping charge: "Listing total" (item +
//               shipping) and the charge. When it recorded 0 - which is
//               BOTH shipping at no charge and "no shipping option stated" - the
//               headline is the "Listing price" and the card says
//               "Shipping not confirmed"; it never says free and never
//               presents the figure as landed. Auctions headline the
//               CURRENT BID with shipping + estimated total (<AuctionPrice>).
//   COMPARISON  the matching market reference with its condition context
//               and the derived saving - ONLY when the existing rules say
//               the reference is comparable (savings === "trusted"). With
//               shipping unconfirmed the saving is stated "before
//               shipping" so it never reads as a verified delivered
//               saving; otherwise the listing renders PLAIN with the reason.
//   STATUS      real facts: found when, N active listings, auction end
//   ACTIONS     primary "View deal on eBay" / "View auction on eBay" / the
//               neutral "View listing on eBay" for a plain (no trusted
//               comparison) listing - never "deal" wording without a
//               trusted savings claim (the existing AffiliateLink wrapper +
//               surface attribution);
//               the artwork and name open the site's own detail page; the
//               save control is the existing device-local toggle
//
// LAYOUT: one DOM, two shapes. Below `sm` the card is a compact unit -
// artwork (4:5, object-contain, never cropped) on the left, identity /
// offer / comparison on the right, the 44px eBay button spanning the
// width beneath. From `sm` up it stacks: a 6:5 artwork box (fold revision:
// proportionally smaller art so a complete offer fits a 1280x900 first
// screen - text sizes untouched), body, button.
//
// `rank` shows a number badge only on ranked lists (Top 10, "Best deals").
// `hub` is `{ count, slug }` from fetchHubCounts when this card has 2+
// active listings, optional. `priority` marks an above-the-fold image.
export default function DealCard({ deal, rank, hub, pageName = "home", validSetSlugs, from, fromCountry, analytics, priority = false }) {
  const cardName = cardDisplayName({ name: normalizePublicText(deal.watchlist?.name ?? deal.title) });
  // EPN sub-ID attribution: "<page>-<placement>" from the closed
  // vocabularies in lib/affiliateAttribution.js, derived from the existing
  // pageName taxonomy - never the card/deal identity, never the visitor's
  // acquisition source.
  const affiliateHref = wrapEbayAffiliateUrl(deal.affiliate_url, attributionOptionsForPageName(pageName));

  // A "return to browsing" hint for /deals/[id]: the internal page this
  // card was clicked from (+ its country filter). Read + WHITELISTED on
  // the deal page (components/DealBackLink); a bad/absent value just
  // yields the deterministic species/set fallback there. /deals/[id]
  // canonical stays the bare URL, so this never creates a duplicate.
  const dealHref = (() => {
    if (typeof from !== "string" || !from.startsWith("/")) return `/deals/${deal.id}`;
    const qs = new URLSearchParams({ from });
    if (fromCountry) qs.set("country", fromCountry);
    return `/deals/${deal.id}?${qs.toString()}`;
  })();
  // SEO Phase 5: the `?from=` variant is a return-nav convenience only -
  // the deal page ignores it server-side and canonicalises to the bare
  // URL. nofollow it so crawlers don't spend budget fetching one
  // `?from=` permutation per internal page that links the deal; the bare
  // /deals/[id] is discovered from the sitemap and from /cards/[slug].
  const dealRel = dealHref.includes("?") ? "nofollow" : undefined;
  const cardSet = deal.watchlist?.set;
  const discountPct = Math.round(deal.discount_pct * 100);
  // "N%" / "less than 1%" - a positive saving never renders as 0%
  const pctText = savingsPercentText(deal.discount_pct);
  // Rendered in the listing's own currency on the server; <Price> swaps
  // each figure to the viewer's currency after hydration (see
  // components/Price.js / CurrencyProvider). market_price / the derived
  // "saved" are USD references.
  const nativeCurrency = currencyForDeal(deal);
  const total = Number(deal.total_price);
  const usdTotal = Number(deal.total_price_usd ?? deal.total_price);
  const marketUsd = Number(deal.market_price);
  const savedUsd = marketUsd - usdTotal;
  // The USD market reference / savings expressed in the LISTING's own
  // currency, so the server render + first paint show one currency (the
  // listing's) for both figures instead of "A$186 · market ref $237".
  // <Price> still localises both to the viewer's currency together after
  // hydration, from their USD values. The % is rate-invariant.
  const marketNative = refInListingCurrency(marketUsd, total, usdTotal, nativeCurrency);
  const savedNative = marketNative != null ? marketNative - total : null;
  const showRef = Number.isFinite(marketUsd) && savedUsd > 0 && marketNative != null;
  const isAuction = deal.listing_type === "AUCTION";
  const isJapanese = deal.watchlist?.language === "japanese";
  const marketInfo = MARKETPLACES[deal.marketplace];
  const setSlug = cardSet && !isJapanese ? slugifySet(cardSet) : null;
  // Only link to /sets/<slug> when that page actually exists right now
  // (same SET_MIN_LISTINGS list as fetchSets/resolveSetSlug, passed in via
  // validSetSlugs). A set that fell below the threshold has no page and a
  // link to it 404s. No list passed -> render the set as plain text.
  const setHasPage = setSlug != null && Array.isArray(validSetSlugs) && validSetSlugs.includes(setSlug);

  // Never default to "Near Mint". Unknown / grading-status -> "Condition
  // not verified" (see lib/dealQuality). Grading status stays separate
  // from physical condition.
  const conditionText = conditionLabel(deal);

  // The shipping recorded at scan (listing currency), read through the
  // shared contract (lib/offerPresentation): > 0 confirmed, 0 = free OR
  // unstated -> "not confirmed", field absent -> "unknown". The headline
  // label, the note and the saving qualifier all come from that one rule.
  const ship = offerShipping(deal);
  const shippingConfirmed = ship.state === "confirmed";
  const shippingNative = shippingConfirmed ? ship.amount : null;
  const shippingUsd = shippingConfirmed && usdTotal > 0 && total > 0 ? shippingNative * (usdTotal / total) : null;

  // Price-drop lane: the item price this listing dropped from (listing
  // currency, deals.previous_price via the deals_track_price_drop trigger).
  // Shown only while the row still carries the drop; the trigger clears it
  // the moment the price rises again.
  const prevNative = Number(deal.previous_price);
  const priceDropped = deal.price_dropped_at != null && Number.isFinite(prevNative) && prevNative > Number(deal.price);
  const prevUsd = priceDropped && usdTotal > 0 && total > 0 ? prevNative * (usdTotal / total) : null;

  // 17C.7: a listing whose discount has no evidenced reference for this
  // exact product and condition renders PLAIN - price, shipping and the
  // release/seller-claim notes, with no badge, strikethrough, saving or
  // "% below market" anywhere.
  const presentation = listingPresentation(deal);
  const showSavings = presentation.savings === "trusted";
  // `showRef` above is ARITHMETIC only - a finite market_price, a
  // positive difference, a convertible amount - and asks nothing about
  // whether the reference may be BELIEVED. market_price is NOT NULL on
  // `deals`, so a row whose provenance was cleared keeps its old figure.
  // Anything that SHOWS the stored reference must gate on this instead.
  const showStoredRef = showSavings && showRef;

  // Deterministic, evidence-gated (lib/dealQualityScore). null whenever
  // the listing has not earned one - the badge components render nothing
  // for null, and no placeholder is substituted.
  //
  // Declared HERE, beside the other presentation rules, and deliberately
  // far from the tracking payload built further down. 13C.5 forbids deal
  // quality from being reported to analytics at all, and enforces it by
  // reading the source around that payload. Keeping this computation at
  // a distance keeps that a cheap textual check rather than one a
  // reviewer has to reason about.
  const qualityScore = dealQualityScore(deal);
  // §22 - a genuinely exceptional trusted deal may be marked as such, but
  // the ADJECTIVE never replaces the number: this only swaps the icon on
  // the discount bar, which still reads "N% below market". Derived
  // deterministically from the existing evidence-gated score band, so it
  // cannot be applied to a mediocre deal and is never hand-set.
  const exceptionalFind = qualityScore?.label === "Exceptional Deal";
  // Review round 2: a trusted reference is necessary but not sufficient -
  // when the row carries NO shipping breakdown (ship.state "unknown") the
  // stored total may or may not include a charge, so no saving (badge,
  // "Save …", "% below market") is stated at all; the reference is still
  // shown, with the reason.
  const savingsSupported = showSavings && ship.savingClaim !== "none";

  // Phase 13A - structural, non-PII payload for the discovery-lane
  // impression + click events. Only emitted when a lane opts in by
  // passing `analytics={{ section }}` (the big "All deals" grid does not,
  // by design - we don't instrument every catalogue card).
  const analyticsPayload = analytics?.section
    ? {
        section: analytics.section,
        deal_id: deal.id,
        content_id: String(deal.id),
        rank: analytics.rank ?? rank ?? undefined,
        listing_type: listingTypeProp(deal.listing_type),
        raw_vs_graded: rawVsGraded(deal.is_graded),
        price_band_usd: priceBandUsd(usdTotal),
        discount_band: savingsSupported ? discountBand(discountPct) : "no_savings_claim",
        country: deal.marketplace ? String(deal.marketplace).replace("EBAY_", "") : "unknown",
      }
    : null;
  const analyticsAttrs = analyticsPayload
    ? {
        "data-analytics-deal": JSON.stringify(analyticsPayload),
        "data-analytics-deal-impression": JSON.stringify(analyticsPayload),
      }
    : {};

  return (
    <article
      {...analyticsAttrs}
      data-deal-card=""
      data-offer-state={isAuction ? "auction" : showSavings ? "bin_compared" : "bin_plain"}
      data-shipping={ship.state}
      // 2026-09-22 redesign: VERTICAL AT EVERY WIDTH. This was a
      // two-column thumbnail row on phones (a 7.25rem art column beside
      // the text), which made the artwork a 116px stamp - the opposite of
      // what a visual collectible needs, and the single biggest mobile
      // conversion problem on the card. Phones now get the same
      // full-width artwork, price block and full-width CTA as desktop.
      className="group flex h-full flex-col overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-card transition-shadow duration-200 hover:shadow-card-hover focus-within:shadow-card-hover dark:border-zinc-800 dark:bg-zinc-950"
    >
      {/* ARTWORK - the seller's photo (or, labelled, the catalogue art);
          opens the site's own detail page. Badges carry only real facts.
          4:5 box on phones, 6:5 from `sm`; object-contain, so the
          artwork keeps its own proportions and is never cropped. */}
      {/* self-start: on phones the text column is taller than the art, and
          the save control anchors to the ART's corner, not the row's - it
          used to float in empty space below the picture. */}
      {/* The save control used to float over the artwork's bottom-right
          corner. It now sits in the action row at the foot of the card
          beside Compare, where the redesign groups the secondary actions -
          one Watch control per card, not two. */}
      <div className="relative">
        {/* CRO 2026-09-22 - THE DOMINANT BADGE IS THE DISCOUNT, and it is
            a real block ABOVE the artwork, not an overlay on it. Two
            reasons it is not absolutely positioned: it would cover the
            top of a photo that fills its box (§8 - never crop away
            listing information), and the artwork link below is
            aria-hidden, so a bar inside it would be silent to screen
            readers. As a sibling it is read normally and every card in a
            row starts on the same baseline.
            GATING IS UNCHANGED: `savingsSupported` is still a trusted
            reference AND a shipping breakdown that supports a claim, and
            the wording is the existing savingsPercentText - never a
            recomputed figure. Not colour alone (WCAG 1.4.1): it says
            "below market" in words; the flame is aria-hidden decoration
            and only appears on a deterministically exceptional score. */}
        {savingsSupported && !isAuction && (
          <p className="flex items-center justify-center gap-1.5 bg-emerald-600 px-3 py-2 text-center text-white">
            <span aria-hidden="true">{exceptionalFind ? "🔥" : "↓"}</span>
            <span className="text-[15px] font-black uppercase tracking-wide">{pctText} below market</span>
          </p>
        )}
        {/* integrity-2026-09-19: an auction's figure is the CURRENT BID,
            not a secured price. It never wears the green savings bar -
            amber, "bid", and the same "can rise" caveat AuctionPrice
            states in full below. */}
        {savingsSupported && isAuction && (
          <p
            title="Current bid against the market reference - bids can raise the final price"
            className="flex items-center justify-center gap-1.5 bg-amber-500 px-3 py-2 text-center text-amber-950"
          >
            <span className="text-[15px] font-black uppercase tracking-wide">Bid {pctText} below market</span>
          </p>
        )}
        <a
          href={dealHref}
          rel={dealRel}
          // WCAG 2.5.3 Label in Name, 2026-09-21. Two attempts at naming
          // this link failed because the rule compares EVERY text node
          // inside the element against the accessible name - here that is
          // the rank chip, the two-letter marketplace mark, "eBay AU" and
          // "−64%" - and no sensible name contains "1 AU eBay AU −64%".
          //
          // The honest reading is that this is not a second link at all.
          // It goes to the same place as the card title below it, which is
          // already correctly named by its own text. So it is decorative:
          // hidden from assistive tech and removed from the tab order,
          // which also drops a duplicate stop for keyboard and
          // switch-control users on every card. Nothing visual changes.
          // The marketplace, the one fact that lived only in this overlay,
          // is restated for assistive tech in the card body below.
          aria-hidden="true"
          tabIndex={-1}
          // One aspect at every width now the card is vertical throughout.
          // 6:5 holds a portrait card at a readable size without the box
          // becoming so tall that the price and CTA leave the viewport on
          // a phone. object-contain, so artwork keeps its proportions and
          // is never cropped - a cropped collectible is a misrepresented
          // one. The fixed ratio also reserves the space, so nothing
          // shifts when the image arrives (CLS).
          // CRO 2026-09-22: square, up from 6:5. object-contain means a
          // portrait collectible is limited by the BOX HEIGHT, so a taller
          // box is the only thing that actually makes the artwork bigger.
          // Square puts the image at ~43% of card height - inside the
          // 40-50% the brief asks for - without making the card so tall
          // that the price and CTA leave a phone viewport. The fixed ratio
          // still reserves the space, so nothing shifts when the image
          // arrives (CLS).
          className="relative block aspect-square w-full bg-zinc-50 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-red-600 dark:bg-zinc-900"
        >
          <DealImage
            {...dealImageProps(deal)}
            alt={normalizePublicText(deal.title)}
            // Phones now render the artwork full-bleed rather than at
            // 116px, so the old 116px hint would have served a badly
            // undersized file to exactly the viewport that needs it most.
            sizes="(max-width: 640px) 92vw, (max-width: 1024px) 46vw, 24vw"
            quality={85}
            priority={priority}
            className="object-contain p-3 sm:p-4"
          />

          {/* CRO 2026-09-22: the overlay sits BELOW the discount bar when
              there is one, so nothing overlaps it. The deal-quality LABEL
              left this corner entirely - "Strong Deal" beside "46% below
              market" was the adjective competing with the number, and the
              number wins (the score and its label are in Price details).
              What is left is only what the percentage cannot say: rank,
              which marketplace, and genuine recency. */}
          <div className="absolute left-1.5 top-1.5 flex flex-col items-start gap-1 sm:left-2 sm:top-2">
            {rank != null && (
              <span aria-hidden="true" className="flex h-6 min-w-6 items-center justify-center rounded-md bg-zinc-900/85 px-1.5 text-xs font-bold text-white">
                {rank}
              </span>
            )}
            {/* The marketplace mark paired with the marketplace in words - a
                mark alone is not a statement of where the listing is.
                Phones: the 116px art column cannot hold "eBay US" AND the
                discount badge side by side (they overlapped) - the mark
                alone is shown there, the words from `sm` up, and the words
                are always in the accessible name. */}
            {marketInfo && (
              <span className="inline-flex items-center gap-1 rounded-md bg-white/90 px-1 py-0.5 text-xs font-medium text-zinc-700 shadow-sm sm:px-1.5 dark:bg-zinc-950/90 dark:text-zinc-200" title={`Listed on eBay ${marketInfo.label}`}>
                <MarketplaceMark code={marketInfo.short} />
                <span className="sr-only sm:not-sr-only">eBay {marketInfo.short}</span>
              </span>
            )}
            {/* Hydration-safe window: computed on the server's clock for the
                HTML + first paint, the viewer's clock after hydration. */}
            {!isAuction && (
              <WithinWindow date={deal.first_seen_at} withinMs={JUST_FOUND_MS}>
                <span aria-hidden="true" className="rounded-md bg-live/95 px-1.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-zinc-900 shadow-sm">
                  Just found
                </span>
              </WithinWindow>
            )}
          </div>

        </a>
      </div>

      {/* IDENTITY · OFFER · COMPARISON · STATUS */}
      <div className="flex min-w-0 flex-1 flex-col p-3.5 sm:p-4">
        <a
          href={dealHref}
          rel={dealRel}
          className="line-clamp-2 text-base font-semibold leading-snug text-zinc-900 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600 dark:text-zinc-50"
        >
          {cardName}
        </a>
        {/* The marketplace is shown visually only as an overlay on the
            image, and that overlay now sits inside an aria-hidden link.
            This restates it for assistive tech, next to the card's real
            title link, so "which eBay site is this on" is still answered
            without changing anything on screen. */}
        {marketInfo && <span className="sr-only">Listed on eBay {marketInfo.label}</span>}
        {/* FINDING 6 (2026-09-25). This is ONE eBay listing that is also
            reachable from other regional eBay sites. Those rows used to
            render as separate tiles, which read as several independent
            buying options. They are collapsed into this one - so the fact
            that it is available regionally is stated here rather than
            thrown away. The price, currency, shipping statement and
            savings qualifier above all belong to THIS marketplace's copy;
            the other sites quote their own and are not mixed in. */}
        {Array.isArray(deal.regional_alternatives) && deal.regional_alternatives.length > 0 && (
          <p className="mt-0.5 text-[12px] text-zinc-500 dark:text-zinc-400">
            Same listing, also on{" "}
            {deal.regional_alternatives
              .map((m) => `eBay ${MARKETPLACES[m]?.short ?? String(m).replace("EBAY_", "")}`)
              .join(", ")}{" "}
            <span className="text-zinc-400 dark:text-zinc-500">(prices differ by site)</span>
          </p>
        )}
        {/* Set · condition. The condition (or grader + grade) is REQUIRED
            reading, never fine print: it sits in its own non-shrinking span
            so a long set name truncates instead of hiding it, and at the
            narrowest widths the line wraps rather than clipping. */}
        <p className="mt-0.5 flex flex-wrap items-baseline gap-x-1 text-[13px] text-zinc-500 dark:text-zinc-400">
          {cardSet && (
            <span className="min-w-0 max-w-full truncate">
              {isJapanese && "Japanese · "}
              {setHasPage ? (
                <Link href={`/sets/${setSlug}`} className="inline-flex min-h-6 items-center hover:text-red-600 hover:underline dark:hover:text-red-500">
                  {cardSet}
                </Link>
              ) : (
                cardSet
              )}
            </span>
          )}
          {/* Condition / grade as a readable pill. A raw tier and a numeric
              grade are different systems; the wording never equates them. */}
          <span
            data-condition
            className={`inline-flex shrink-0 items-center whitespace-nowrap rounded-md border px-1.5 py-px text-xs font-medium leading-5 ${
              conditionText === "Condition not verified"
                ? "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300"
                : deal.is_graded
                  ? "border-zinc-300 bg-zinc-100 text-zinc-800 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                  : "border-zinc-200 bg-white text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
            }`}
          >
            {conditionText}
          </span>
        </p>

        {isAuction ? (
          // P0 auction-price-integrity: the headline figure for an auction
          // is the CURRENT BID, with shipping and the estimated landed
          // total as their own lines - never the bid+shipping total shown
          // as though it were the bid.
          <AuctionPrice
            deal={deal}
            marketUsd={showSavings ? marketUsd : null}
            marketNative={showSavings ? marketNative : null}
            discountPct={showSavings ? discountPct : 0}
            variant="card"
            className="mt-2"
          />
        ) : (
          <div className="mt-2">
            <p className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              {ship.headline}
            </p>
            {/* The price is the loudest thing in the card body, in brand
                red, with the reference beside it as "Typical <x>".
                NOT struck through: a market reference is what comparable
                copies sell for, not a former price of THIS listing, and
                striking it through would state a markdown that never
                happened. That distinction is the same one the
                "Seller reduced the item price" line below exists to keep. */}
            {/* CRO 2026-09-22: the price is NEAR-BLACK, not red, and
                bigger. The card's colour grammar is green = value, red =
                action, black = product information - a red price competed
                with the red BUY button for the same meaning, and the
                button should own it. The reference moved onto its own
                line beneath, labelled "Market", because it is a different
                number about a different thing and reading them on one
                baseline invited them to be read as one price.
                Still NOT struck through: a market reference is what
                comparable copies sell for, not a former price of THIS
                listing, and striking it through would state a markdown
                that never happened. */}
            <Price
              usd={usdTotal}
              native={{ amount: total, currency: nativeCurrency }}
              className="tnum mt-0.5 block break-words text-[2.125rem] font-black leading-none tracking-tight text-zinc-900 dark:text-zinc-50"
            />
            {showSavings && showRef && (
              <p className="mt-1 text-[13px] text-zinc-500 dark:text-zinc-400">
                Market{" "}
                <Price usd={marketUsd} native={{ amount: marketNative, currency: nativeCurrency }} approxPrefix="" className="tnum font-medium" />
              </p>
            )}
            {/* SHORT shipping label only. The qualification a buyer must
                see stays visible at all times - "incl. shipping" or, when
                the breakdown was never recorded, the explicit warning -
                but the arithmetic behind it moved into the Price details
                disclosure below, where it is still one tap away and still
                in the DOM for a crawler and a screen reader. */}
            {/* SHORT label, but the ITEM figure stays VISIBLE. The Offer
                node in this page's JSON-LD carries the item price
                excluding shipping, and Merchant Listing requires the
                figure it advertises to be visible on the page - a value
                that only exists inside a collapsed <details> does not
                reliably satisfy that. So the arithmetic ("$45.84 +
                $22.92") moved into Price details, and the one figure the
                schema depends on did not. */}
            {/* CRO 2026-09-22: the unconfirmed-shipping line was AMBER,
                which gave a routine "eBay didn't state a shipping price"
                the same visual weight as a warning and made every such
                card feel risky. The QUALIFICATION IS UNCHANGED in words
                and still always rendered - only its colour is now the
                same muted grey as the confirmed case, so it reads as the
                footnote it is. The stronger amber is still used, below,
                for the case that genuinely withholds a claim (shipping
                breakdown not recorded at all). */}
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
              {shippingConfirmed ? (
                <>
                  incl. shipping
                  {" · "}item <Price usd={usdTotal - shippingUsd} native={{ amount: total - shippingNative, currency: nativeCurrency }} approxPrefix="" className="tnum" />
                </>
              ) : (
                <>Shipping: {String(ship.note).toLowerCase()} — check on eBay</>
              )}
            </p>
            {/* The recorded earlier price moved into Price details - it
                is a real fact, stated plainly and never as a struck-
                through anchor, but it is not one of the three things a
                shopper needs at a glance. */}
          </div>
        )}

        {/* COMPARISON - only a trusted reference earns the green line; a
            plain listing states why it carries no claim.
            The "You save X (Y%)" line below is the single line the
            redesign is built around: larger and greener than it was,
            because it answers the only question that makes a deal site
            worth visiting. The shipping qualifier is never dropped - a
            saving computed before shipping says so. */}
        {!showSavings ? (
          // §21 - AN UNSUPPORTED LISTING MUST NOT LOOK LIKE A BARGAIN.
          // No discount bar, no market figure, no saving, no score: the
          // card above has already rendered only a price, and this says
          // plainly that there is no comparison behind it, followed by
          // the reason. Nothing here is styled as value - it is the same
          // muted grey as the rest of the supporting text, and the CTA
          // below says "View listing", never "Buy this deal".
          <div className="mt-2.5 rounded-lg bg-zinc-50 px-3 py-2 dark:bg-zinc-900">
            <p className="text-xs font-black uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
              No verified market comparison
            </p>
            {presentation.notes.map((note) => (
              <p key={note} className="mt-0.5 text-xs leading-snug text-zinc-500 dark:text-zinc-400">
                {note}
              </p>
            ))}
          </div>
        ) : isAuction ? null : (
          <div className="mt-1.5">
            {/* "Market reference for <condition>" moved into the Price
                details disclosure: the tile already prints the condition
                in its identity line and the reference figure beside the
                price, so repeating both here was the third statement of
                the same comparison. */}
            {!savingsSupported ? (
              // unknown breakdown: the reference stands, the saving does not
              <p className="text-xs leading-snug text-amber-700 dark:text-amber-500">
                No saving stated: shipping breakdown not recorded
              </p>
            ) : (
            // 2026-09-22: the saved AMOUNT is the headline of this line,
            // not a word in a sentence - it is set large and black, and
            // the percentage sits beside it as a solid chip once the
            // saving is in the top two tiers (>= 40%). Below that the
            // percentage stays plain text, for the same reason
            // SavingsBadge keeps `modest` quiet: a 12% saving that shouts
            // is an overclaim made in CSS. The shipping qualifier is
            // never dropped and never shrunk out of readability - it is
            // what stops a before-shipping saving reading as delivered.
            // CRO 2026-09-22: THE SAVING IS A HERO ELEMENT. It is the
            // answer to the only question that makes a deal site worth
            // visiting, and it was a 14px line of text. It now sits in
            // its own green panel with the money as the second-largest
            // figure on the card, so a shopper never has to calculate
            // anything or read a sentence to find it.
            // A PANEL, not a green card: the tint is confined to this
            // block so green keeps meaning "value" (brand grammar) rather
            // than becoming the card's background.
            // The shipping qualifier is never dropped and never shrunk
            // out of readability - it is what stops a before-shipping
            // saving reading as a delivered one.
            <div className="mt-2.5 rounded-lg bg-emerald-50 px-3 py-2 dark:bg-emerald-950/40">
              {showRef ? (
                <>
                  <p className="text-xs font-black uppercase tracking-wider text-emerald-800 dark:text-emerald-400">
                    You save
                  </p>
                  <p className="mt-0.5 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                    <Price
                      usd={savedUsd}
                      native={{ amount: savedNative, currency: nativeCurrency }}
                      className="tnum text-2xl font-black leading-none tracking-tight text-emerald-700 dark:text-emerald-400"
                    />
                    <span className="text-[13px] font-bold text-emerald-800 dark:text-emerald-400">
                      {pctText} below market
                    </span>
                  </p>
                </>
              ) : (
                <p className="text-base font-black text-emerald-700 dark:text-emerald-400">
                  {pctText} below market
                </p>
              )}
              {ship.savingQualifier ? (
                <p className="mt-0.5 text-xs font-semibold text-emerald-800/80 dark:text-emerald-400/80">
                  {ship.savingQualifier.trim()}
                </p>
              ) : null}
            </div>
            )}
          </div>
        )}

        {/* "All deals" only (lib/allDealsInventory sets also_on): one tile
            per eBay listing. Name the marketplace copy whose price, currency
            and shipping statement are shown, and where else the same
            listing was found - the listing marketplace, never a claim about
            where it ships. */}
        {/* The marketplace is already stated on the artwork overlay and in
            the title link's accessible name, so the bare "Listed on eBay
            X" repetition is gone. This line now renders ONLY when it has
            something the overlay cannot say: that the same listing was
            also found on other marketplaces, and which copy's price is
            the one shown. */}
        {Array.isArray(deal.also_on) && deal.also_on.length > 0 && marketInfo && (
          <p data-listing-marketplace className="mt-1.5 text-xs leading-snug text-zinc-500 dark:text-zinc-400">
            Price shown from eBay {marketInfo.label}
            {` · also on ${deal.also_on.map((m) => `eBay ${MARKETPLACES[m]?.label ?? m}`).join(", ")}`}
          </p>
        )}

        {/* FACT ROWS - shipping, listing type, freshness, each on its own
            line behind its own icon, the way the reference design shows
            them. The icon is decorative (aria-hidden); the words carry
            the meaning, and the words are the same ones the card already
            used. Nothing new is asserted here: the shipping row only
            appears when a charge was actually recorded, and "Auction"
            never appears on a Buy It Now. */}
        {/* PRICE DETAILS - the arithmetic, the reference's identity and
            the provenance, behind one disclosure. A native <details>, so
            it works with no JavaScript, is keyboard-operable for free,
            announces its own expanded state, and keeps every figure in
            the server HTML rather than hiding it from a crawler.
            Everything a buyer MUST see to read the price correctly stays
            outside it. */}
        {/* §29: one new event, on OPEN only (`toggle` fires both ways;
            the handler checks `open`), so it can never be mistaken for or
            duplicate an affiliate_click. Carries the same non-PII
            identifiers the impression/click events already use. */}
        {!isAuction && (showStoredRef || shippingConfirmed) && (
          <details
            className="group/details mt-2.5 text-[13px]"
            data-analytics-toggle="deal_price_details_opened"
            data-analytics-props={JSON.stringify({
              surface: pageName,
              deal_id: deal.id,
              content_id: String(deal.id),
              listing_type: listingTypeProp(deal.listing_type),
              discount_band: savingsSupported ? discountBand(discountPct) : "no_savings_claim",
            })}
          >
            <summary className="inline-flex min-h-8 cursor-pointer list-none items-center gap-1 text-zinc-500 underline-offset-2 hover:text-red-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600 dark:text-zinc-400 dark:hover:text-red-500 [&::-webkit-details-marker]:hidden">
              <svg aria-hidden viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3 transition-transform group-open/details:rotate-180">
                <path d="M3 4.5 6 7.5 9 4.5" />
              </svg>
              Price details
            </summary>
            <dl className="mt-1.5 space-y-0.5 text-zinc-600 dark:text-zinc-400">
              {shippingConfirmed && (
                <div className="flex justify-between gap-3">
                  <dt>Item + shipping</dt>
                  <dd className="tnum">
                    <Price usd={usdTotal - shippingUsd} native={{ amount: total - shippingNative, currency: nativeCurrency }} approxPrefix="" />
                    {" + "}
                    <Price usd={shippingUsd} native={{ amount: shippingNative, currency: nativeCurrency }} approxPrefix="" />
                  </dd>
                </div>
              )}
              {/* TRUSTED REFERENCES ONLY. These two rows were gated on
                  `showRef`, which is pure ARITHMETIC - a finite
                  market_price, a positive difference, a convertible
                  amount - and asks nothing about whether the reference
                  may be believed. market_price is NOT NULL on `deals`,
                  so a row whose provenance was cleared keeps its old
                  figure, and the disclosure printed it: the Mew listing
                  on /deals said "No verified market comparison" on its
                  face and "Market reference A$40.49" one tap below.
                  Measured before the fix: 245 of 247 untrusted
                  displayable listings.
                  `showStoredRef` adds the trust gate the visible
                  comparison beside the price has always had, so the
                  disclosure can no longer contradict the card. */}
              {showStoredRef && (
                <div className="flex justify-between gap-3">
                  <dt>Market reference</dt>
                  <dd className="tnum">
                    <Price usd={marketUsd} native={{ amount: marketNative, currency: nativeCurrency }} approxPrefix="" />
                  </dd>
                </div>
              )}
              {showStoredRef && (
                <div className="flex justify-between gap-3">
                  <dt>Reference is for</dt>
                  <dd className="text-right">
                    {conditionText}
                    {deal.reference_printing ? ` · ${deal.reference_printing}` : ""}
                  </dd>
                </div>
              )}
              {priceDropped && (
                <div className="flex justify-between gap-3">
                  <dt>Seller reduced from</dt>
                  <dd className="tnum">
                    <Price usd={prevUsd} native={{ amount: prevNative, currency: nativeCurrency }} approxPrefix="" />
                  </dd>
                </div>
              )}
              {/* CRO 2026-09-22 - DEAL SCORE, DEMOTED. It kept the
                  loudest corner of the card while answering a question
                  nobody asked: "51% below market" is understood
                  instantly, "88" needs a scale explained first. The
                  score and its label are unchanged and still computed
                  from the same evidence-gated rule - they are simply no
                  longer the dominant element. */}
              {qualityScore && (
                <div className="flex justify-between gap-3">
                  <dt>Deal score</dt>
                  <dd className="tnum text-right">
                    {qualityScore.score}/99 · {qualityScore.label}
                  </dd>
                </div>
              )}
              {/* Provenance, moved off the card face: useful, but not a
                  reason to buy, so it does not compete with the CTA. */}
              <div className="flex justify-between gap-3">
                <dt>First found</dt>
                <dd className="text-right">
                  <RelativeTime date={deal.first_seen_at} />
                </dd>
              </div>
              <div className="pt-1">
                <Link href="/methodology" className="font-medium text-zinc-600 underline underline-offset-2 hover:text-red-600 dark:text-zinc-300 dark:hover:text-red-500">
                  How we compare →
                </Link>
              </div>
            </dl>
          </details>
        )}

        {/* NO shipping row here. The price block above already states it,
            and states it more precisely - "incl. $22.92 shipping · item
            $45.84". That item figure is not decoration: the Offer node in
            the page's JSON-LD carries the ITEM price excluding shipping,
            and Merchant Listing requires the figure it advertises to be
            visible on the page. A second, vaguer shipping line here said
            the same thing twice and made the unconfirmed case shout
            twice. */}
        {/* CRO 2026-09-22 - ONE consolidated metadata row, not four
            competing lines with their own icons. Listing type and
            CURRENT freshness ("checked") are what a shopper weighs
            before clicking; "found N ago" is provenance, not a reason to
            buy, so it moved into Price details rather than taking a line
            beside the CTA. The separate "Details" link is gone -
            the artwork and the title already open that page, so it was a
            third link to one destination and a tab stop for nothing.
            "Checked" still renders ONLY on a real confirmed availability
            check (listingAvailabilityEvidence), so nothing here implies
            a check that did not happen. */}
        <ul className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-zinc-500 dark:text-zinc-400">
          <li className="flex items-center gap-1.5">
            <FactIcon kind={isAuction ? "gavel" : "cart"} />
            <span>
              {/* AuctionEnd renders "ended" on its own for a finished
                  auction, so prefixing "ends" produced "ends ended".
                  The component already says everything; this row just
                  labels it. */}
              {isAuction ? (
                <>
                  Auction · <AuctionEnd date={deal.auction_end_at} />
                  {deal.bid_count != null && ` · ${deal.bid_count} bids`}
                </>
              ) : (
                "Buy It Now"
              )}
            </span>
          </li>
          {listingAvailabilityEvidence(deal)?.kind === "confirmed" && (
            <li className="flex items-center gap-1.5">
              <span aria-hidden="true">·</span>
              <FactIcon kind="clock" />
              <span>
                Checked <RelativeTime date={deal.exact_verified_at} />
              </span>
            </li>
          )}
        </ul>
      </div>

      {/* PRIMARY ACTION - the existing wrapper, tracking and surface
          attribution; opens the exact listing on eBay in a new tab. Spans
          the whole card below `sm`; sits at the foot of the column above. */}
      <div className="mt-auto px-3.5 pb-3.5 sm:px-4 sm:pb-4">
        <AffiliateLink
          href={affiliateHref}
          eventName="eBay Click"
          eventData={{
            card: cardName,
            marketplace: deal.marketplace,
            discountPct,
            listingType: deal.listing_type,
            isGraded: deal.is_graded,
            usdTotal,
            page: pageName,
          }}
          analyticsProps={
            analyticsPayload
              ? { ...analyticsPayload, origin_section: analyticsPayload.section }
              : {
                  origin_section: pageName,
                  deal_id: deal.id,
                  content_id: String(deal.id),
                  discount_band: savingsSupported ? discountBand(discountPct) : "no_savings_claim",
                }
          }
          className={CTA_CARD_CLASS}
        >
          {/* CRO 2026-09-22 - TRANSACTIONAL COPY, BY LISTING TYPE.
              "View deal on eBay" is passive for a listing you can buy
              right now. But the stronger wording is only honest where
              the visitor CAN buy immediately and we are claiming a deal:
                BIN + trusted saving  -> "Buy this deal"
                BIN, no saving claim  -> "View listing" (never "deal",
                                         and never "buy this deal", which
                                         would imply a bargain we have
                                         not evidenced)
                auction               -> "View auction" (§18: you cannot
                                         buy it, and the bid can rise)
              The marketplace is the second line, so the button says what
              happens AND where, and the destination is never a surprise.
              href, tracking, rel and surface attribution are the
              existing wrapper's - untouched. */}
          <span className="text-[15px] font-bold leading-none">
            {ctaLabelFor({ isAuction, savingsSupported })}
            <span aria-hidden="true"> →</span>
          </span>
          <span className="text-xs font-medium leading-none opacity-80">
            on eBay{marketInfo ? ` ${marketInfo.short}` : ""}
          </span>
        </AffiliateLink>

        {/* SECONDARY ACTIONS - Watch and Compare, beneath the primary.
            Compare appears ONLY when this card genuinely has other live
            listings to compare against (hub.count >= 2, the same count
            the "N listings" link uses); a listing with nothing to compare
            shows no control rather than a "Compare (1)" that leads
            nowhere. Watch is this device's own list - there is no account
            system and this does not pretend otherwise. */}
        <div className="mt-2 flex items-center justify-between gap-2">
          <SaveCardButton
            card={{
              slug: hub?.slug ?? null,
              dealId: deal.id,
              name: cardName,
              set: cardSet,
              image: deal.image_url,
              price: deal.total_price,
              currency: currencyForDeal(deal),
            }}
          />
          {hub?.slug && hub.count >= 2 && (
            <Link
              href={`/cards/${hub.slug}`}
              data-analytics-click="compare_clicked"
              data-analytics-props={JSON.stringify({
                surface: pageName,
                card_slug: hub.slug,
                content_id: hub.slug,
                deal_id: deal.id,
                listing_count: hub.count,
              })}
              className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-lg px-2 text-[13px] font-semibold text-zinc-600 transition-colors hover:text-red-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600 dark:text-zinc-300 dark:hover:text-red-500"
            >
              <svg aria-hidden viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" className="h-4 w-4">
                <path d="M2 5h6M2 11h12M11 2 8 5l3 3M5 8l-3 3 3 3" />
              </svg>
              {/* §20: names what is being compared. "Compare (4)" made
                  the reader supply the noun, and the count is of
                  LISTINGS - never sellers, which the card cannot count
                  (claims-consistency). */}
              Compare {hub.count} {hub.count === 1 ? "listing" : "listings"}
            </Link>
          )}
        </div>
      </div>
    </article>
  );
}
