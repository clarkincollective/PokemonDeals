import Link from "next/link";
import GuideLayout, { GP, GH2, GUL } from "@/components/GuideLayout";
import { guideMetadata } from "@/lib/guides";
import { GUIDE_LINK_CLASS } from "@/lib/guideLinks";

const SLUG = "pokemon-booster-box-prices";
export const metadata = guideMetadata(SLUG);

// GEO audit 2026-09-19. Written now as the informational piece the sealed
// page will inherit authority from; deliberately no price table (prices
// move; the live pages carry them) and no claim about stock the site
// does not hold. Facts are structural: pack counts, how retail pricing is
// set, what "sealed" has to mean.
export default function Page() {
  return (
    <GuideLayout slug={SLUG}>
      <GP>
        A booster box is a factory-sealed case of booster packs — 36 packs for most English
        expansions. Its retail price is set from the pack&apos;s recommended price, and its resale
        price on eBay is set by demand for the expansion, how long it has been out of print, and
        whether the box is genuinely sealed. This guide explains those three things so a sealed
        listing can be read the same way a single card can. It does not list prices: they change
        weekly, and a table here would be stale before it was read.
      </GP>

      <GH2>What MSRP means for a box</GH2>
      <GUL>
        <li>
          <strong>It is the pack price multiplied up.</strong> The Pokemon Company sets a recommended
          price per booster pack; a box&apos;s recommended price is that figure times the pack count.
          Retailers may sell above or below it.
        </li>
        <li>
          <strong>Products differ in pack count.</strong> A booster box (36 packs), a booster bundle
          (6 packs), an Elite Trainer Box (9 packs plus accessories) and a sleeved booster (1 pack)
          are priced per pack very differently once the accessories and the packaging are counted.
          Compare like with like.
        </li>
        <li>
          <strong>Regional pricing is not a conversion.</strong> UK, EU, Australian and Canadian
          recommended prices are set separately, so a box can be cheaper delivered from one
          marketplace than another. Our marketplace filters exist for that reason.
        </li>
      </GUL>

      <GH2>Why resale differs from retail</GH2>
      <GUL>
        <li>
          <strong>In print vs. out of print.</strong> While an expansion is being printed, boxes trade
          near retail because supply is replenished. Once printing stops, the price is set by whoever
          still holds sealed stock.
        </li>
        <li>
          <strong>Chase cards.</strong> An expansion whose top cards are in high demand pulls its
          sealed price up, because a box is a chance at those cards.
        </li>
        <li>
          <strong>Print run size.</strong> Modern expansions are printed for months in very large
          quantities; a few short-printed products (some special sets and older expansions) are not,
          and their sealed prices reflect that scarcity.
        </li>
        <li>
          <strong>Allocation and hype.</strong> At launch, a product that is hard to find in shops can
          resell well above retail for a few weeks and then fall back once stock arrives. A price
          seen in launch week is not the product&apos;s price.
        </li>
      </GUL>

      <GH2>What &ldquo;sealed&rdquo; has to mean</GH2>
      <GP>
        The value of a box is the guarantee that nobody has opened it. Read for:
      </GP>
      <GUL>
        <li>
          <strong>Factory shrink-wrap with the manufacturer&apos;s seal</strong>, shown in the
          listing&apos;s own photos. A box &ldquo;re-sealed&rdquo; or with generic plastic wrap has
          lost the guarantee, whatever the title says.
        </li>
        <li>
          <strong>Pack count and configuration stated</strong>, and matching the product. A
          &ldquo;booster box&rdquo; of a different pack count is a different product.
        </li>
        <li>
          <strong>Weighed packs.</strong> Loose packs and opened boxes can have had heavier packs
          removed. This is one reason a sealed box and the same number of loose packs are not the
          same purchase.
        </li>
        <li>
          <strong>Language and region</strong> printed on the box; a Japanese box is a different
          product with a different price.
        </li>
      </GUL>

      <GH2>How to check a sealed listing before you pay</GH2>
      <GUL>
        <li>Photos of the seal, all six sides, in the seller&apos;s own images.</li>
        <li>The listing&apos;s delivered total, including shipping — boxes are heavier than cards.</li>
        <li>Returns policy and the seller&apos;s recent feedback on sealed product specifically.</li>
        <li>
          Whether the price is below a reference for that exact product. Our sealed pages compare a
          listing against a sealed market reference for the same product when one exists, and show
          nothing green when it does not:{" "}
          <Link href="/sealed-deals" className={GUIDE_LINK_CLASS}>
            sealed product listings
          </Link>
          .
        </li>
      </GUL>

      <GH2>Singles or sealed?</GH2>
      <GP>
        If you want particular cards, buying the singles is almost always cheaper than opening boxes
        to find them. If you want the sealed product itself — to keep, or to open for the experience
        — then the questions above are the ones that matter. For the card side of the decision, read{" "}
        <Link href="/guides/how-pokemon-card-prices-work" className={GUIDE_LINK_CLASS}>
          how Pokemon card prices are determined
        </Link>{" "}
        and the{" "}
        <Link href="/guides/buying-pokemon-cards-on-ebay-safely" className={GUIDE_LINK_CLASS}>
          eBay buyer&apos;s checklist
        </Link>
        .
      </GP>
    </GuideLayout>
  );
}
