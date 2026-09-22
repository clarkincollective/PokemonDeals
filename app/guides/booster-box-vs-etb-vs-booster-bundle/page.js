import Link from "next/link";
import GuideLayout, { GP, GH2, GUL } from "@/components/GuideLayout";
import { ProductGallery, GuideTable } from "@/components/guides/CardArt";
import { guideMetadata } from "@/lib/guides";
import { GUIDE_LINK_CLASS, GUIDE_PRODUCTS } from "@/lib/guideLinks";

const SLUG = "booster-box-vs-etb-vs-booster-bundle";
export const metadata = guideMetadata(SLUG);

// Audit batch 2026-09-22. Distinct from pokemon-booster-box-prices, which
// answers "why does a box cost what it costs". This answers "which format
// should I buy", which is a different decision and a different reader.
//
// No universal pack counts are asserted as law: the guide's own point is
// that contents vary by set and edition, and the catalogue evidence for
// that (three Prismatic ETBs) is first-party.
export default function Page() {
  return (
    <GuideLayout slug={SLUG}>
      <GP>
        A booster box, an Elite Trainer Box and a booster bundle are not three sizes of the same
        thing. They are three products aimed at different buyers, and the cheapest cost-per-pack is
        rarely the reason to choose between them. This guide compares what each one is for.
      </GP>

      <GH2>The short answer</GH2>
      <GuideTable
        head={["Format", "Roughly what it is", "Who it suits"]}
        rows={[
          ["Booster bundle", "A small handful of packs, minimal packaging", "Trying a set without committing much"],
          ["Elite Trainer Box", "A mid-size run of packs plus sleeves, dice, dividers and a promo", "A gift, or a player who wants the accessories"],
          ["Booster box", "The largest standard run of packs, no accessories", "Opening a lot of one set in one sitting"],
          ["Collection / premium box", "A few packs built around a named promo card or figure", "Someone who wants the promo more than the packs"],
        ]}
        caption="Pack counts differ by set, edition and region — check the specific product rather than assuming a standard."
      />
      <GP>
        If you want one named card, none of these is the efficient route. Buying the single is. Packs
        are a purchase of the opening itself; treat the cards as the variable part.
      </GP>

      <GH2>&ldquo;An ETB&rdquo; is not one product</GH2>
      <GP>
        This is the most expensive misunderstanding in sealed buying, and it is easy to demonstrate
        from our own sealed catalogue. For <strong>Prismatic Evolutions alone</strong> we hold three
        separate Elite Trainer Boxes: a standard edition, a{" "}
        <strong>Pokemon Center exclusive</strong>, and a{" "}
        <strong>Dollar General exclusive</strong>. Different products, different contents, different
        prices — and all three are called &ldquo;the Prismatic ETB&rdquo; by somebody.
      </GP>
      <ProductGallery
        products={[
          { product: GUIDE_PRODUCTS.prismaticEliteTrainerBox, caption: "Standard edition" },
          { product: GUIDE_PRODUCTS.prismaticPokemonCenterEtb, caption: "Pokemon Center exclusive" },
          { product: GUIDE_PRODUCTS.s151PokemonCenterEtb, caption: "A different set's Pokemon Center ETB" },
        ]}
        width={168}
        note="Retailer-exclusive editions are separate products, not the same box with a sticker. Match the full product name, not the set name plus 'ETB'."
      />
      <GUL>
        <li>
          <strong>Standard editions</strong> are the widely distributed version and the one most
          price comparisons are actually about.
        </li>
        <li>
          <strong>Pokemon Center editions</strong> are sold through the official store and usually
          differ in artwork, and sometimes in contents.
        </li>
        <li>
          <strong>Retailer exclusives</strong> exist for specific chains and specific regions, which
          is also why they are harder to price: fewer of them sell, in fewer places.
        </li>
      </GUL>

      <GH2>Compare cost per pack honestly</GH2>
      <GUL>
        <li>
          <strong>Divide the delivered total, not the headline price.</strong> Sealed products are
          heavy. Shipping can move cost-per-pack more than the discount does.
        </li>
        <li>
          <strong>Do not price the accessories at zero, or at retail.</strong> An ETB&apos;s sleeves
          and dice are worth something to a player and close to nothing to someone who only wants
          cards. The honest comparison depends on which of those you are.
        </li>
        <li>
          <strong>Do not treat the promo as cash.</strong> A collection box built around a promo is
          partly a purchase of that promo. If you do not want it, the box is worse value than the
          arithmetic suggests.
        </li>
        <li>
          <strong>Regional recommended prices are set separately</strong>, so a box can be cheaper
          delivered from another marketplace. That is a genuine saving, not a conversion artefact.
        </li>
      </GUL>
      <GP>
        We deliberately do not publish a cost-per-pack table here. It would be wrong within a week,
        and it would invite a comparison between products that are not comparable. The{" "}
        <Link href="/sealed-deals" className={GUIDE_LINK_CLASS}>
          live sealed listings
        </Link>{" "}
        carry current prices with their shipping stated.
      </GP>

      <GH2>Mixed-set products</GH2>
      <GP>
        Some boxes contain packs from several expansions rather than one. Those are not comparable to
        a single-set box on cost per pack, because you are not buying a chance at one set&apos;s
        cards — you are buying a mix, and the mix is usually the point. Read the product description
        for the pack list before comparing.
      </GP>

      <GH2>Before you pay for anything sealed</GH2>
      <GP>
        A sealed product is only sealed if the seal is original. What a photograph can and cannot
        establish about that is covered in{" "}
        <Link href="/guides/pokemon-booster-box-prices" className={GUIDE_LINK_CLASS}>
          our sealed pricing guide
        </Link>
        , which has the packaging checks. For a sense of what listing photographs prove in general,
        see{" "}
        <Link href="/guides/spotting-fake-pokemon-cards-in-listings" className={GUIDE_LINK_CLASS}>
          spotting fakes in listings
        </Link>
        .
      </GP>

      <GH2>Where to go next</GH2>
      <GUL>
        <li>
          <Link href="/sealed-deals" className={GUIDE_LINK_CLASS}>
            Browse sealed products
          </Link>{" "}
          — boxes, bundles and ETBs currently listed.
        </li>
        <li>
          <Link href="/guides/pokemon-151-buying-guide" className={GUIDE_LINK_CLASS}>
            The 151 buying guide
          </Link>{" "}
          — the same decision applied to one specific set.
        </li>
        <li>
          <Link href="/guides/prismatic-evolutions-buying-guide" className={GUIDE_LINK_CLASS}>
            The Prismatic Evolutions guide
          </Link>{" "}
          — where the three-ETB problem above comes from.
        </li>
      </GUL>
    </GuideLayout>
  );
}
