import Link from "next/link";
import { MARKETPLACES, wrapEbayAffiliateUrl } from "@/lib/ebayLinks";
import { surfaceForPageName } from "@/lib/affiliateSurfaces";
import { slugifySet } from "@/lib/slugify";
import { currencyForDeal, refInListingCurrency } from "@/lib/money";
import RelativeTime, { WithinWindow } from "@/components/RelativeTime";
import { conditionLabel, listingPresentation, savingsBadgeText, savingsPercentText } from "@/lib/dealQuality";
import { normalizePublicText } from "@/lib/publicText";
import { cardDisplayName } from "@/lib/cardName";
import { priceBandUsd, discountBand, listingTypeProp, rawVsGraded } from "@/lib/analytics/props";
import AffiliateLink from "@/components/AffiliateLink";
import DealImage from "@/components/DealImage";
import { dealImageProps } from "@/lib/listingImage";
import SaveCardButton from "@/components/SaveCardButton";
import MarketplaceMark from "@/components/MarketplaceMark";
import SavingsBadge from "@/components/SavingsBadge";
import { DealQualityLabel, DealQualityScore } from "@/components/DealQualityBadge";
import { dealQualityScore } from "@/lib/dealQualityScore";
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

// The discount badge is tiered by how good the deal actually is (real
// discount_pct) so a 65%-under card doesn't look identical to a 12%-under
// one - components/SavingsBadge. Only rendered when the savings claim is
// TRUSTED (lib/dealQuality listingPresentation) - never on a plain listing.

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
  // EPN sub-ID attribution: a fixed, privacy-safe surface enum derived
  // from the existing pageName taxonomy (never the card/deal identity) -
  // see lib/affiliateSurfaces.js.
  const affiliateHref = wrapEbayAffiliateUrl(deal.affiliate_url, { surface: surfaceForPageName(pageName) });

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
          className="relative block aspect-[6/5] w-full bg-zinc-50 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-red-600 dark:bg-zinc-900"
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

          <div className="absolute left-1.5 top-1.5 flex flex-col items-start gap-1 sm:left-2 sm:top-2">
            {qualityScore && !isAuction && <DealQualityLabel result={qualityScore} />}
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

          {/* 2026-09-22 redesign: the corner chip is the deal-quality
              SCORE, and the saving moved into the body as a full "You
              save X (Y%)" line, which is what a shopper actually reads.
              The score is null for any listing without a trusted,
              evidenced reference, and nothing is substituted when it is -
              those cards simply carry no corner chip. */}
          {qualityScore && !isAuction && (
            <DealQualityScore result={qualityScore} className="absolute right-1.5 top-1.5 sm:right-2 sm:top-2" />
          )}
          {/* Fallback for a supported saving we could not score (no
              evidenced reference): the factual discount badge, as before.
              Never a fabricated score. */}
          {!qualityScore && savingsSupported && !isAuction && (
            <SavingsBadge discountPct={deal.discount_pct} className="absolute right-1.5 top-1.5 sm:right-2 sm:top-2" />
          )}
          {/* integrity-2026-09-19: an auction's figure is the CURRENT BID,
              not a secured price. It never wears the green savings badge -
              amber, "bid", and the same "can rise" caveat AuctionPrice
              states in full below. */}
          {savingsSupported && isAuction && (
            <span
              title="Current bid against the market reference - bids can raise the final price"
              className="absolute right-1.5 top-1.5 rounded-lg border border-amber-600/40 bg-amber-50 px-2 py-1 text-sm font-extrabold leading-none tracking-tight text-amber-800 shadow-sm sm:right-2 sm:top-2 dark:bg-amber-950/60 dark:text-amber-300"
            >
              Bid {savingsBadgeText(deal.discount_pct)}
            </span>
          )}
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
            <span className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
              <Price
                usd={usdTotal}
                native={{ amount: total, currency: nativeCurrency }}
                className="tnum block break-words text-[1.75rem] font-extrabold leading-tight tracking-tight text-red-600 dark:text-red-500"
              />
              {showSavings && showRef && (
                <span className="text-[13px] text-zinc-500 dark:text-zinc-400">
                  Typical{" "}
                  <Price usd={marketUsd} native={{ amount: marketNative, currency: nativeCurrency }} approxPrefix="" className="tnum font-medium" />
                </span>
              )}
            </span>
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
            <p className={`mt-0.5 text-xs ${shippingConfirmed ? "text-zinc-500 dark:text-zinc-400" : "text-amber-700 dark:text-amber-500"}`}>
              {shippingConfirmed ? (
                <>
                  incl. shipping
                  {" · "}item <Price usd={usdTotal - shippingUsd} native={{ amount: total - shippingNative, currency: nativeCurrency }} approxPrefix="" className="tnum" />
                </>
              ) : (
                <>{ship.note} — check on eBay</>
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
          <div className="mt-1.5 flex flex-col gap-1">
            {presentation.notes.map((note) => (
              <p key={note} className="text-xs leading-snug text-zinc-500 dark:text-zinc-400">
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
            <p className="mt-0.5 text-sm font-bold text-emerald-700 dark:text-emerald-500">
              {showRef ? (
                <>
                  You save <Price usd={savedUsd} native={{ amount: savedNative, currency: nativeCurrency }} className="tnum text-base font-extrabold" />
                  {" "}({pctText} below market){ship.savingQualifier}
                </>
              ) : (
                <>
                  {pctText} below market{ship.savingQualifier ? ` (${ship.savingQualifier.trim()})` : ""}
                </>
              )}
            </p>
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
        {!isAuction && (showRef || shippingConfirmed) && (
          <details className="group/details mt-2 text-[13px]">
            <summary className="inline-flex min-h-8 cursor-pointer list-none items-center gap-1 text-zinc-600 underline-offset-2 hover:text-red-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600 dark:text-zinc-400 dark:hover:text-red-500 [&::-webkit-details-marker]:hidden">
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
              {showRef && (
                <div className="flex justify-between gap-3">
                  <dt>Market reference</dt>
                  <dd className="tnum">
                    <Price usd={marketUsd} native={{ amount: marketNative, currency: nativeCurrency }} approxPrefix="" />
                  </dd>
                </div>
              )}
              {showRef && (
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
        <ul className="mt-2.5 space-y-1 text-[13px] text-zinc-600 dark:text-zinc-400">
          <li className="flex items-center gap-1.5">
            <FactIcon kind={isAuction ? "gavel" : "cart"} />
            <span>
              {isAuction ? (
                <>
                  Auction · ends <AuctionEnd date={deal.auction_end_at} />
                  {deal.bid_count != null && ` · ${deal.bid_count} bids`}
                </>
              ) : (
                "Buy It Now"
              )}
            </span>
          </li>
          {listingAvailabilityEvidence(deal)?.kind === "confirmed" && (
            <li className="flex items-center gap-1.5">
              <FactIcon kind="clock" />
              <span>
                Checked <RelativeTime date={deal.exact_verified_at} />
              </span>
            </li>
          )}
        </ul>

        {/* Provenance line. Freshness and listing type moved up into the
            fact rows, so this carries what is left: how many other live
            listings exist for the card, when it was first found, and the
            link to the full detail page. */}
        <div className="mt-2 flex items-center justify-between gap-2 text-[13px] text-zinc-500 dark:text-zinc-400">
          <p className="min-w-0 truncate">
            {isAuction ? (
              <>
                {deal.bid_count != null ? `${deal.bid_count} bids · ` : ""}
                found <RelativeTime date={deal.first_seen_at} />
              </>
            ) : (
              <>
                {hub?.count >= 2 && (
                  <>
                    <Link href={`/cards/${hub.slug}`} className="font-semibold text-zinc-600 hover:text-red-600 hover:underline dark:text-zinc-300 dark:hover:text-red-500">
                      {hub.count} {hub.count === 1 ? "listing" : "listings"}
                    </Link>
                    {" · "}
                  </>
                )}
                found <RelativeTime date={deal.first_seen_at} />
              </>
            )}
          </p>
          <a href={dealHref} rel={dealRel} className="shrink-0 font-medium text-zinc-600 underline-offset-2 hover:text-red-600 hover:underline dark:text-zinc-300 dark:hover:text-red-500">
            Details
          </a>
        </div>
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
          className={CTA_PRIMARY_CLASS}
        >
          {isAuction ? "View auction on eBay" : showSavings ? "View deal on eBay" : "View listing on eBay"}
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
              Compare ({hub.count})
            </Link>
          )}
        </div>
      </div>
    </article>
  );
}
