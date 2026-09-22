import Link from "next/link";
import GuideLayout, { GP, GH2, GUL } from "@/components/GuideLayout";
import { Gallery, ProductGallery, GuideTable } from "@/components/guides/CardArt";
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
        Prismatic Evolutions is an Eeveelution set, which means demand concentrates on a handful of
        cards — and those cards have more printings than almost anything else in modern Pokemon. If
        you buy one by collector number alone, there is a real chance you will not get the card you
        pictured. This guide is about saying exactly which one you want.
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
        The same structure applies to the other Eeveelutions: Espeon at <strong>033/131</strong> has
        a base card and a Poke Ball Pattern printing, and Sylveon at <strong>040/131</strong> works
        the same way. Assume the pattern exists and ask which one you are looking at.
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
        Note the last row: <strong>161/131</strong> is numbered above the printed set total, which is
        normal for modern sets — the premium cards sit past the end of the numbered run rather than
        inside it.
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
        Prismatic has the clearest example on the site of a problem that affects every modern set. We
        hold three separate Elite Trainer Boxes for it: a standard edition, a{" "}
        <strong>Pokemon Center exclusive</strong> and a <strong>Dollar General exclusive</strong>.
        They are different products. Comparing a price for one against a price for another is not a
        comparison.
      </GP>
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
    </GuideLayout>
  );
}
