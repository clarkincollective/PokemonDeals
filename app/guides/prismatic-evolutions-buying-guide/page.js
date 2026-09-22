import Link from "next/link";
import GuideLayout, { GP, GH2, GUL } from "@/components/GuideLayout";
import { Gallery, ProductGallery, GuideTable } from "@/components/guides/CardArt";
import { Src, SourceList } from "@/components/guides/Src";
import { guideMetadata } from "@/lib/guides";
import { GUIDE_CARDS, GUIDE_LINK_CLASS, GUIDE_PRODUCTS, GUIDE_SETS } from "@/lib/guideLinks";

const SLUG = "prismatic-evolutions-buying-guide";
export const metadata = guideMetadata(SLUG);

// Audit batch 2026-09-22. The headline fact here is first-party and
// checkable: THREE catalogue cards share the collector number 059/131.
// That is the thing a price table cannot tell you and the thing that
// costs buyers money, so it leads.
export default function Page() {
  return (
    <GuideLayout slug={SLUG}>
      <GP>
        Prismatic Evolutions is built around Eevee and its evolutions, and a collector number is a
        poor way to buy from it. Here is the first-party reason: of the 181 distinct collector
        numbers we hold for the set, <strong>101 of them</strong> resolve to more than one catalogue
        record. Pick a number at random from this set and the odds are against it identifying a
        single card. This guide is about saying exactly which one you want.
      </GP>

      <GH2>Three different cards are numbered 059/131</GH2>
      <GP>
        In our catalogue, the collector number <strong>059/131</strong> resolves to three separate
        Umbreon records: the base card, a <strong>Poke Ball Pattern</strong> printing, and a{" "}
        <strong>Master Ball Pattern</strong> printing. They are different products with different
        markets. There are then two further Umbreon cards at different numbers —{" "}
        <strong>060/131</strong> (Umbreon ex) and <strong>161/131</strong> (Umbreon ex, Special
        Illustration Rare).
      </GP>
      <Gallery
        cards={[
          { card: GUIDE_CARDS.prismaticUmbreon059, caption: "Base printing" },
          { card: GUIDE_CARDS.prismaticUmbreon059PokeBall, caption: "Poke Ball Pattern" },
          { card: GUIDE_CARDS.prismaticUmbreon059MasterBall, caption: "Master Ball Pattern" },
        ]}
        width={168}
        note="All three of these are 059/131. The pattern is part of the card's identity, not a finish applied afterwards — which is why a listing that says only '059/131' has not yet told you which card is for sale."
      />
      <GP>
        The same structure applies to the other Eeveelutions, and to the same depth: Espeon at{" "}
        <strong>033/131</strong> and Sylveon at <strong>040/131</strong> each resolve to three
        catalogue records as well — a base card, a Poke Ball Pattern printing and a Master Ball
        Pattern printing. Ask which one a listing is for, every time.
      </GP>

      <GH2>How to say which Umbreon you want</GH2>
      <GuideTable
        head={["If you mean", "Say this", "Where it sits"]}
        rows={[
          ["The plain card from the numbered run", "Umbreon 059/131, no pattern", "Rare"],
          ["The Poke Ball pattern version", "Umbreon 059/131, Poke Ball Pattern", "Rare, separate printing"],
          ["The Master Ball pattern version", "Umbreon 059/131, Master Ball Pattern", "Rare, separate printing"],
          ["The ex card from the main run", "Umbreon ex 060/131", "Double Rare"],
          ["The big alternate-art ex", "Umbreon ex 161/131", "Special Illustration Rare"],
        ]}
        caption="Five different purchases. The number alone distinguishes only two of them."
      />
      <GP>
        Note the last row: <strong>161/131</strong> is numbered above the printed set total. That is
        not an error in the listing — this set, like several other recent ones we track, holds
        records numbered past the end of its own numbered run.
      </GP>

      <GH2>Checking a listing before you pay</GH2>
      <GUL>
        <li>
          <strong>Read the number off the card in the photograph.</strong> Then ask what the seller
          says about the pattern. If the title says &ldquo;Umbreon 059&rdquo; and the description
          says nothing more, you do not yet know what is for sale.
        </li>
        <li>
          <strong>Do not infer the pattern from the price.</strong> It is the wrong way round, and
          it is how people talk themselves into a purchase.
        </li>
        <li>
          <strong>If the card is graded</strong>, the pattern should appear in the grader&apos;s
          record as a variety — check it against the label using{" "}
          <Link href="/guides/check-graded-pokemon-card-certificate" className={GUIDE_LINK_CLASS}>
            the certificate procedure
          </Link>
          .
        </li>
      </GUL>

      <GH2>The sealed side: three different Elite Trainer Boxes</GH2>
      <GP>
        Our sealed catalogue holds three separate Elite Trainer Boxes for this one set: a standard
        edition, a <strong>Pokemon Center exclusive</strong> and a{" "}
        <strong>Dollar General exclusive</strong>. They are three product records, not one product
        with three stickers, so comparing a price for one against a price for another is not a
        comparison.
      </GP>
      <GP>
        The first two publish their contents, and the difference is concrete rather than cosmetic.
      </GP>
      <GuideTable
        head={["Product", "Region / language", "Packs", "Promo cards", "Accessories", "Suits"]}
        rows={[
          [
            <>
              <Src id="prismaticEtb">Prismatic Evolutions Elite Trainer Box</Src>
            </>,
            "US listing, English",
            "9",
            "1 full-art foil Eevee",
            "65 Eevee sleeves, 45 Energy, player's guide, 6 damage-counter dice, 1 competition-legal coin-flip die, 2 condition markers, collector's box with 4 dividers, TCG Live code card",
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
              <Src id="prismaticBundle">Prismatic Evolutions Booster Bundle</Src>
            </>,
            "US listing, English",
            "6",
            "None",
            "None — packs only",
            "Opening some of the set without the accessories",
          ],
          [
            "Prismatic Evolutions Elite Trainer Box (Dollar General Exclusive)",
            "US retailer exclusive",
            "Not published on an official product page we could read",
            "Not published",
            "Not published",
            "Anyone comparing a listing that names this edition — check the full product name before comparing prices",
          ],
        ]}
        minWidth="56rem"
        caption="Contents from each product's own official page, read 22 September 2026. The Dollar General edition is a separate product in our sealed catalogue with no official contents page we could find, so its contents are left unstated."
      />
      <ProductGallery
        products={[
          { product: GUIDE_PRODUCTS.prismaticEliteTrainerBox, caption: "Standard Elite Trainer Box" },
          { product: GUIDE_PRODUCTS.prismaticPokemonCenterEtb, caption: "Pokemon Center exclusive" },
          { product: GUIDE_PRODUCTS.prismaticBoosterBundle, caption: "Booster bundle" },
        ]}
        width={168}
        note="Match the full product name in a listing title, not the set name plus a format word."
      />
      <GP>
        Which format suits you is the general question answered in{" "}
        <Link href="/guides/booster-box-vs-etb-vs-booster-bundle" className={GUIDE_LINK_CLASS}>
          booster box vs ETB vs booster bundle
        </Link>
        . If it is one specific Eeveelution you are after, buying the single is the route that
        actually gets it.
      </GP>

      <GH2>Where to go next</GH2>
      <GUL>
        <li>
          <Link href={GUIDE_SETS.prismaticEvolutions.href} className={GUIDE_LINK_CLASS}>
            Browse Prismatic Evolutions cards
          </Link>{" "}
          — each printing as its own record, with whatever is currently listed.
        </li>
        <li>
          <Link href="/sealed-deals" className={GUIDE_LINK_CLASS}>
            Sealed Prismatic products
          </Link>{" "}
          — boxes and bundles, listed as sealed products.
        </li>
        <li>
          <Link href="/guides/holo-vs-reverse-holo-pokemon-cards" className={GUIDE_LINK_CLASS}>
            Holo vs reverse holo
          </Link>{" "}
          — the general version of the one-number-many-cards problem.
        </li>
      </GUL>

      <SourceList ids={["prismaticEtb", "prismaticPcEtb", "prismaticBundle", "prismaticExpansion"]}>
        <li>
          Product contents read from each product&apos;s own official page on 22 September 2026.
          Collector numbers, printings and the 101-of-181 figure are our own catalogue records for
          the set, read the same day; they describe what we track, not an official checklist.
        </li>
      </SourceList>
    </GuideLayout>
  );
}
