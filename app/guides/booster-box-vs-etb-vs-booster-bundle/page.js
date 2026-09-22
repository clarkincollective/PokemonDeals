import Link from "next/link";
import GuideLayout, { GP, GH2, GUL } from "@/components/GuideLayout";
import { ProductGallery, GuideTable } from "@/components/guides/CardArt";
import { Src, SourceList } from "@/components/guides/Src";
import { guideMetadata } from "@/lib/guides";
import { GUIDE_LINK_CLASS, GUIDE_PRODUCTS } from "@/lib/guideLinks";

const SLUG = "booster-box-vs-etb-vs-booster-bundle";
export const metadata = guideMetadata(SLUG);

// Audit batch 2026-09-22. Distinct from pokemon-booster-box-prices, which
// answers "why does a box cost what it costs". This answers "which format
// should I buy", which is a different decision and a different reader.
//
// CORRECTED 2026-09-22. The first version described the formats as "a
// small handful of packs" and "a mid-size run", which is a comparison
// table with the comparison taken out. It now carries six NAMED products
// whose contents were read from their own official pages, so a reader can
// check every cell. No universal pack count is asserted: the three Elite
// Trainer Boxes in the table hold 9, 10 and 11 packs, which is the point.
export default function Page() {
  return (
    <GuideLayout slug={SLUG}>
      <GP>
        A booster box, an Elite Trainer Box and a booster bundle are not three sizes of the same
        thing. They are three products aimed at different buyers, and the cheapest cost-per-pack is
        rarely the reason to choose between them. This guide compares what each one is for.
      </GP>

      <GH2>The formats, as real products</GH2>
      <GP>
        Every row below is one specific product, with its contents taken from that product&apos;s own
        official page. That is deliberate: there is no fixed pack count for a format, so a table of
        format averages would be a table of guesses. Read each row as &ldquo;this product&rdquo;, not
        as &ldquo;all ETBs&rdquo;.
      </GP>
      <GuideTable
        head={["Product", "Region / language", "Packs", "Promo cards", "Accessories", "Suits"]}
        rows={[
          [
            <>
              <Src id="prismaticBundle">Prismatic Evolutions Booster Bundle</Src>
            </>,
            "US listing, English",
            "6",
            "None",
            "None — packs only",
            "Trying a set without committing much",
          ],
          [
            <>
              <Src id="prismaticEtb">Prismatic Evolutions Elite Trainer Box</Src>
            </>,
            "US listing, English",
            "9",
            "1 full-art foil Eevee",
            "65 sleeves, 45 Energy, player's guide, 6 damage-counter dice, 1 competition-legal coin-flip die, 2 condition markers, collector's box with 4 dividers, TCG Live code card",
            "A gift, or a player who wants the accessories",
          ],
          [
            <>
              <Src id="prismaticPcEtb">Prismatic Evolutions Pokemon Center Elite Trainer Box</Src>
            </>,
            "US listing, English. Sold only at Pokemon Center",
            "11",
            "2: a full-art foil Eevee with a Pokemon Center logo, and a full-art foil Eevee",
            "Same accessory list as the standard box",
            "Someone who wants the exclusive promo and two extra packs",
          ],
          [
            <>
              <Src id="crownZenithEtb">Crown Zenith Elite Trainer Box</Src>
            </>,
            "US listing, English",
            "10",
            "1 etched foil Lucario VSTAR",
            "65 sleeves, 45 Energy, player's guide, 6 damage-counter dice, 1 coin-flip die, 2 acrylic condition markers, 1 acrylic VSTAR marker, collector's box with 4 dividers, code card",
            "A player who wants the accessories and the VSTAR marker; also the only sealed route into this set",
          ],
          [
            <>
              <Src id="boosterDisplayBox">Mega Evolution—Perfect Order Booster Display Box</Src>
            </>,
            "Pokemon Center US listing, English",
            "36. Each pack: 10 cards, 1 Basic Energy, 1 TCG Live code card",
            "None",
            "None — packs only",
            "Opening a lot of one set in one sitting",
          ],
          [
            <>
              <Src id="s151Upc">151 Ultra-Premium Collection</Src>
            </>,
            "US listing, English",
            "16",
            "1 etched foil Mew ex, 1 full-art foil Mewtwo, plus 1 etched metal Mew ex card",
            "Playmat, deck box, metallic Mew coin, 6 damage-counter dice, 2 condition markers, TCG Live code card",
            "Someone who wants the collectibles as much as the packs",
          ],
        ]}
        minWidth="56rem"
        caption="Contents from each product's own official page, read 22 September 2026. Each row is that product only. Note the three Elite Trainer Boxes: 9, 11 and 10 packs. Regional editions of a product can differ, so check the region a listing is selling into."
      />
      <GP>
        Two things fall out of that table. First, the format word in a title tells you a shape, not a
        pack count — the three Elite Trainer Boxes here hold nine, ten and eleven packs. Second, the
        two Prismatic boxes publish an identical accessory list and differ only in packs and promos,
        which is exactly the part a listing title leaves out.
      </GP>
      <GP>
        If you want one named card, none of these is the efficient route. Buying the single is. Packs
        are a purchase of the opening itself; treat the cards as the variable part.
      </GP>
      <GP>
        On what is inside a pack: the publisher states that a booster pack contains 10 game cards —
        four commons, three uncommons and three foils, at least one of them rare or higher — plus one
        Energy card and one code card, and notes that sets before Scarlet &amp; Violet guarantee only
        at least one reverse foil per pack. <Src id="packContents" /> That is a composition rule, not
        a promise about which Pokemon you get; no guide, including this one, can tell you that.
      </GP>

      <GH2>&ldquo;An ETB&rdquo; is not one product</GH2>
      <GP>
        For <strong>Prismatic Evolutions alone</strong> our sealed catalogue holds three separate
        Elite Trainer Boxes: a standard edition, a <strong>Pokemon Center exclusive</strong>, and a{" "}
        <strong>Dollar General exclusive</strong>. Three product records, each of which somebody
        calls &ldquo;the Prismatic ETB&rdquo;. Two of them publish different contents, as the table
        above shows; the Dollar General edition has no official contents page we could find, so its
        contents are left unstated.
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
          <strong>Standard editions</strong> are the ones sold wherever Pokemon TCG products are
          sold, per their own product pages.
        </li>
        <li>
          <strong>Pokemon Center editions</strong> are sold only at Pokemon Center, which the
          official pages state directly. For both sets in the table above, the Pokemon Center box
          holds two more packs and a second promo carrying the Pokemon Center logo —{" "}
          <Src id="prismaticPcEtb" />, <Src id="s151PcEtb" />. That is the verified difference for
          those two products; it is not a rule about every Pokemon Center edition.
        </li>
        <li>
          <strong>Retailer exclusives</strong> exist for specific chains. Our sealed catalogue holds
          a Dollar General edition of the Prismatic Elite Trainer Box as its own product record,
          which is how it shows up in a listing title.
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
        cards. Read the product&apos;s own description for the pack list before comparing — it is
        the only place the mix is stated.
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

      <SourceList
        ids={["prismaticBundle", "prismaticEtb", "prismaticPcEtb", "crownZenithEtb", "boosterDisplayBox", "s151Upc", "s151PcEtb", "packContents"]}
      >
        <li>
          All read 22 September 2026. Each row of the comparison table is that one product on that
          date; contents and editions change between printings and between regions, and no row is a
          statement about a format in general.
        </li>
      </SourceList>
    </GuideLayout>
  );
}
