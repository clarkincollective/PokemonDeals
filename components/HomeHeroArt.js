import Link from "next/link";
import DealImage from "@/components/DealImage";
import { dealImageProps } from "@/lib/listingImage";
import { cardDisplayName } from "@/lib/cardName";
import { normalizePublicText } from "@/lib/publicText";
import { savingsPercentText } from "@/lib/dealQuality";

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
      className="pointer-events-none hidden select-none lg:block"
      aria-hidden="true"
    >
      <div className="flex items-center justify-center gap-3">
        {cards.map(({ deal: d, img }, i) => {
          const name = cardDisplayName({ name: normalizePublicText(d.watchlist?.name ?? d.title) });
          const pct = Number(d.discount_pct) > 0 ? savingsPercentText(d.discount_pct) : null;
          return (
            <Link
              key={d.id}
              href={`/deals/${d.id}`}
              tabIndex={-1}
              className={`pointer-events-auto relative block w-[9.5rem] shrink-0 transition-transform duration-300 hover:!translate-y-0 hover:!rotate-0 xl:w-[11rem] ${POSE[i]}`}
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
                <span className="absolute -bottom-2 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md bg-emerald-600 px-2 py-0.5 text-[11px] font-bold text-white shadow-sm">
                  {pct} off
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
