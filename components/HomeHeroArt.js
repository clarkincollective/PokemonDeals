import Link from "next/link";
import DealImage from "@/components/DealImage";
import { dealImageProps } from "@/lib/listingImage";
import { cardDisplayName } from "@/lib/cardName";
import { normalizePublicText } from "@/lib/publicText";
import { savingsPercentText, listingPresentation } from "@/lib/dealQuality";
import { offerShipping } from "@/lib/offerPresentation";

// AUDIT 2026-09-23, FINDING 7 — the hero chip and its destination must say
// the same thing about the same listing.
//
// The chip used to be `Number(d.discount_pct) > 0 && savingsPercentText(...)`
// - its own arithmetic gate, run beside the shared rules rather than
// through them. Measured read-only on live rows 2026-09-24
// (scripts/integrity/auditHeroClaims.mjs): of 308 displayable rows the
// hero would have chipped, 229 carried a claim the deal page contradicts:
//
//   126  compared BEFORE SHIPPING, with the qualifier dropped
//    80  an AUCTION current bid, shown as a settled saving
//    23  no trustworthy reference at all - the destination makes no
//        savings claim, and the hero announced a percentage anyway
//
// This decides nothing itself. It asks listingPresentation and
// offerShipping, exactly as components/DealCard.js does, and prints only
// what those already allow:
//
//   not trusted            -> no chip
//   auction                -> no chip (a bid can rise; "N% off" would be
//                             a settled-saving claim, and the chip has no
//                             room to say "current bid, bids can rise"
//                             without burying it)
//   before shipping        -> the qualifier is ON the chip, never a
//                             tooltip and never left to the destination
//   delivered              -> "N% off"
//
// No new arithmetic, no new eligibility: the percentage is still
// savingsPercentText(discount_pct), the same value the tile prints.
function heroSavingsChip(deal) {
  if (listingPresentation(deal).savings !== "trusted") return null;
  if (deal.listing_type === "AUCTION") return null;
  const ship = offerShipping(deal);
  if (ship.savingClaim === "none") return null;
  if (!(Number(deal.discount_pct) > 0)) return null;
  const pct = savingsPercentText(deal.discount_pct);
  if (!pct) return null;
  return `${pct} off${ship.savingQualifier}`;
}

// The hero's visual half: a fan of REAL cards that are on the site right
// now, each linking to its own deal.
//
// WHY NOT THE REFERENCE DESIGN'S ILLUSTRATION. The mockup fills this
// space with a large Pokemon character render. That artwork is
// Nintendo/Creatures/GAME FREAK's, we hold no licence for it, and the
// brief is explicit that the commercial UX matters more than reproducing
// that exact illustration. What we DO legitimately show, on every other
// surface of the site, is listing and catalogue photography of the cards
// themselves - so the hero shows those. It fills the same space, it is
// unambiguously on-subject, and it has the additional virtue of being
// the actual product: three real deals a visitor can click.
//
// Rendered only when there are at least three cards WITH images. A
// partial fan looks broken rather than deliberate, so the whole block is
// omitted and the hero falls back to a single-column text layout.
export default function HomeHeroArt({ deals = [] }) {
  // Filtered through the SAME screening-aware accessor the deal cards
  // use: a row whose images failed the authenticity/match screen yields
  // neither a seller photo nor a canonical id, and is skipped here
  // rather than surfaced in the most prominent slot on the site.
  const cards = deals
    .map((d) => ({ deal: d, img: dealImageProps(d) }))
    .filter(({ deal, img }) => deal?.id && (img.src || img.cardTcgplayerId))
    .slice(0, 3);
  if (cards.length < 3) return null;

  // Rotation and vertical offset per position: a hand-held fan, not a
  // grid. The middle card sits forward and upright.
  const POSE = [
    "-rotate-[9deg] translate-y-6 z-10",
    "rotate-0 -translate-y-2 z-20",
    "rotate-[9deg] translate-y-6 z-10",
  ];

  return (
    <div
      data-hero-art
      // Hidden below lg: on a phone the hero's whole job is the headline
      // and the search box, and three more images above the fold would
      // push the first real deal off the screen. The cards are not
      // content a crawler needs here either - each one is linked again in
      // the feed immediately below.
      // FINDING 7 (2026-09-24): this fan was the only source of horizontal
      // page overflow, across the whole lg-xl band. Measured at real
      // layout viewports: 98px over at 1024, 55px at 1280, 21px at 1363,
      // 11px at 1384, gone by 1440 and gone below lg where the fan is
      // hidden. Two causes, both here: the cards were `shrink-0`, so the
      // row stayed wider than its grid column (480px of cards in a 400px
      // column at 1280), and a card rotated 9deg has a bounding box wider
      // than the card (152px -> 212px), which escaped the container on
      // top of that.
      //
      // The fix is contained to this component: the cards may now shrink
      // to their column, `min-w-0` lets the flex row actually do it, and
      // `overflow-hidden` with vertical padding stops the rotated corners
      // and the chip from extending the page. No breakpoint, grid, type or
      // CTA change anywhere else.
      className="pointer-events-none hidden select-none overflow-hidden py-6 lg:block"
      aria-hidden="true"
    >
      <div className="flex min-w-0 items-center justify-center gap-3">
        {cards.map(({ deal: d, img }, i) => {
          const name = cardDisplayName({ name: normalizePublicText(d.watchlist?.name ?? d.title) });
          const pct = heroSavingsChip(d);
          return (
            <Link
              key={d.id}
              href={`/deals/${d.id}`}
              tabIndex={-1}
              className={`pointer-events-auto relative block w-full min-w-0 max-w-[9.5rem] flex-1 transition-transform duration-300 hover:!translate-y-0 hover:!rotate-0 xl:max-w-[11rem] ${POSE[i]}`}
            >
              <span className="relative block aspect-[5/7] w-full overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-card-hover">
                <DealImage
                  {...img}
                  alt=""
                  sizes="176px"
                  // The hero is the first paint: these three are the only
                  // images on the page worth a priority hint.
                  priority={i === 1}
                  className="object-contain p-1.5"
                />
              </span>
              {pct && (
                // The qualifier rides on the chip, so it is never dropped
                // to make the text fit: the chip wraps instead of
                // truncating (no whitespace-nowrap, capped width).
                <span className="absolute -bottom-2 inset-x-1 rounded-md bg-emerald-600 px-1.5 py-0.5 text-center text-[11px] font-bold leading-tight text-white shadow-sm">
                  {pct}
                </span>
              )}
              <span className="sr-only">{name}</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
