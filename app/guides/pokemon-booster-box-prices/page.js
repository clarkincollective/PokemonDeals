import Link from "next/link";
import GuideLayout, { GP, GH2, GUL } from "@/components/GuideLayout";
import { ProductGallery } from "@/components/guides/CardArt";
import { guideMetadata } from "@/lib/guides";
import { GUIDE_LINK_CLASS, GUIDE_PRODUCTS } from "@/lib/guideLinks";

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
      {/* Product art (2026-09-20): the three pack counts the list above
          compares, as catalogue product photos of real products. */}
      <ProductGallery
        products={[
          { product: GUIDE_PRODUCTS.evolvingSkiesBoosterBox, caption: "Booster box: 36 packs" },
          { product: GUIDE_PRODUCTS.ascendedHeroesBoosterBundle, caption: "Booster bundle: 6 packs" },
          { product: GUIDE_PRODUCTS.ascendedHeroesBoosterPack, caption: "Single booster pack" },
        ]}
        width={168}
        note={
          <>
            Three products, three pack counts, priced per pack very differently. These are the catalogue&apos;s
            product photos, shown to identify the product type &mdash; not a seller&apos;s item, and not a statement
            about any listing&apos;s seal, contents or price. Live sealed listings, with a reference beside each
            where one exists, are on the sealed products page.
          </>
        }
      />

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

      {/* Audit batch 2026-09-22 (item 10). The checklist below existed but
          was four bullets; the genuine gap was WHAT A PHOTOGRAPH CAN AND
          CANNOT ESTABLISH about a seal, and which product a listing is
          actually for. Expanded in place rather than given a second URL.
          Deliberately no list of universal "counterfeit tells": we cannot
          verify one, and a checklist of them would promise authentication
          by appearance, which no photograph supports. */}
      <GH2>What a photograph of a seal can and cannot tell you</GH2>
      <GP>
        Ask for images of every face of the box, taken by the seller rather than lifted from a
        product page. What those images can support is limited, and it is worth being precise about
        the limit: a photograph can show you that a seal is <em>present</em>, that it is intact in
        the frame shown, and whether the packaging is damaged. It cannot establish that the wrap is
        the original factory wrap, and it cannot establish what is inside.
      </GP>
      <GUL>
        <li>
          <strong>Stock photography is a stop sign on sealed product.</strong> If the images are the
          manufacturer&apos;s, you have seen a product, not the item.
        </li>
        <li>
          <strong>Look at the wrap as an object</strong> — how it folds at the corners, whether it
          is taut, whether seams sit where they sit on the other faces. You are looking for
          inconsistency between faces, not for a specific tell.
        </li>
        <li>
          <strong>Weight and dimensions are checkable facts</strong> a seller can state. A refusal to
          state them is informative.
        </li>
        <li>
          <strong>Nothing here is authentication.</strong> A resealed box can photograph well. Buy on
          the seller&apos;s protections and returns as much as on the pictures, and see{" "}
          <Link href="/guides/buying-pokemon-cards-on-ebay-safely" className={GUIDE_LINK_CLASS}>
            buying safely
          </Link>
          .
        </li>
      </GUL>

      <GH2>Check you are comparing the same product</GH2>
      <GP>
        Before comparing two prices, confirm they are for the same product. Sets routinely ship a
        standard edition alongside retailer-exclusive and Pokemon Center editions, and those are
        separate products with separate contents. Our sealed catalogue holds{" "}
        <strong>three different Elite Trainer Boxes</strong> for Prismatic Evolutions alone. Match
        the full product name in the title, and check it against the photograph of the box —{" "}
        <Link href="/guides/booster-box-vs-etb-vs-booster-bundle" className={GUIDE_LINK_CLASS}>
          the format comparison
        </Link>{" "}
        has the detail.
      </GP>

      <GH2>How to check a sealed listing before you pay</GH2>
      <GUL>
        <li>Photos of the seal, all six sides, in the seller&apos;s own images.</li>
        <li>The exact product name, matched against the box in the photograph.</li>
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
