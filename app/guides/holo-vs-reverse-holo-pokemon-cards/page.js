import Link from "next/link";
import GuideLayout, { GP, GH2, GUL } from "@/components/GuideLayout";
import { Gallery } from "@/components/guides/CardArt";
import { Src, SourceList } from "@/components/guides/Src";
import { guideMetadata } from "@/lib/guides";
import { GUIDE_CARDS, GUIDE_LINK_CLASS, PRICE_CHECKER_HREF } from "@/lib/guideLinks";

const SLUG = "holo-vs-reverse-holo-pokemon-cards";
export const metadata = guideMetadata(SLUG);

// Audit batch 2026-09-22.
//
// SCOPE. This guide checks a LISTING's printing; it does not teach visual
// identification of a finish, because our card images are flat catalogue
// scans and no flat image demonstrates how a foil behaves under light.
// The article says that once, beside the pictures, and otherwise gets on
// with the check. Do not reintroduce a "where the foil sits" rule without
// a source that establishes it across eras and treatments.
//
// The editorial history behind that decision is in
// docs/content/pullnomics-audit-implementation-2026-09-22.md, not on the
// page - a reader wants the answer, not our working.
export default function Page() {
  return (
    <GuideLayout slug={SLUG}>
      <GP>
        A listing that says &ldquo;Umbreon 059/131&rdquo; has not told you which card is for sale.
        The foil treatment is part of the card&apos;s identity, so one collector number can cover a
        plain printing, a reverse holo and one or more pattern printings — separate cards, separate
        prices. This guide is how to make a listing tell you which one it is, before you pay.
      </GP>

      <GH2>The short version</GH2>
      <GUL>
        <li>
          <strong>Look the number up first</strong> and see how many cards it covers. If it covers
          three, the listing has three possible answers and you need one of them.
        </li>
        <li>
          <strong>Ask the seller to name the printing in words</strong> — plain, reverse, or a named
          pattern. An answer you can read beats an image you have to interpret.
        </li>
        <li>
          <strong>Do not take &ldquo;holo&rdquo; in a title as the answer.</strong> It is written
          loosely to mean &ldquo;shiny&rdquo;, including by honest sellers.
        </li>
        <li>
          <strong>Ask for an angled photograph under a single light</strong> if you want to judge it
          yourself. A flat, straight-on scan cannot show how a foil behaves.
        </li>
        <li>
          <strong>If it is graded</strong>, the printing should appear in the grader&apos;s record
          as a variety —{" "}
          <Link href="/guides/check-graded-pokemon-card-certificate" className={GUIDE_LINK_CLASS}>
            check it against the label
          </Link>
          .
        </li>
      </GUL>
      <GP>
        Reverse foils are not an exotic variant, which is why this comes up so often: a Pokemon
        booster pack contains ten game cards, of which three are foils with at least one rare or
        higher, and sets before Scarlet &amp; Violet guarantee at least one{" "}
        <strong>reverse foil</strong> card per pack. <Src id="packContents" />
      </GP>

      <GH2>Why the collector number will not settle it</GH2>
      <GP>
        Because the printing is part of the card&apos;s identity, not a finish applied to one card
        afterwards. Our catalogue holds separate records for separate printings, and they carry
        separate prices. The clearest live example on this site is in Prismatic Evolutions, where
        three distinct records share the number <strong>059/131</strong>:
      </GP>
      <Gallery
        cards={[
          { card: GUIDE_CARDS.prismaticUmbreon059, caption: "Base printing" },
          { card: GUIDE_CARDS.prismaticUmbreon059PokeBall, caption: "Poke Ball Pattern" },
          { card: GUIDE_CARDS.prismaticUmbreon059MasterBall, caption: "Master Ball Pattern" },
        ]}
        width={160}
        note="Three separate catalogue records, all numbered 059/131. Flat catalogue scans: they show that three cards exist under one number, not how any of these finishes behaves under light."
      />
      <GP>
        Modern sets carry treatments beyond plain reverse foil — the Poke Ball and Master Ball
        patterns above, and set-specific ones like the Quick Ball pattern on{" "}
        <Link href={GUIDE_CARDS.ascendedHeroesPawniardQuickBall.href} className={GUIDE_LINK_CLASS}>
          Pawniard 146/217
        </Link>{" "}
        in Ascended Heroes, whose printing our catalogue records as part of the card&apos;s name. The
        structural point is the same in each case: if the printing has its own record, it has its own
        market.
      </GP>

      <GH2>What the pictures on this page can show you</GH2>
      <GP>
        They show <em>which record</em> each card is, which is the point being made. They cannot
        show how a foil moves under a light: these are flat catalogue scans, and no flat image
        demonstrates a finish. Use them to see that three separate cards exist under one number —
        not to judge which finish you are looking at.
      </GP>

      <GH2>Why this matters for price</GH2>
      <GP>
        Because a comparison is only meaningful between the same printing. If a reverse holo is
        priced against a reference for the plain card, the saving is not real — it is a comparison
        between two different products. We gate that deliberately: a listing whose printing we cannot
        evidence shows <em>no</em> savings claim rather than a flattering one. The reasoning is in{" "}
        <Link href="/guides/how-pokemon-card-prices-work" className={GUIDE_LINK_CLASS}>
          how prices work
        </Link>{" "}
        and in our{" "}
        <Link href="/methodology" className={GUIDE_LINK_CLASS}>
          methodology
        </Link>
        .
      </GP>

      <GH2>Where to go next</GH2>
      <GUL>
        <li>
          <Link href={PRICE_CHECKER_HREF} className={GUIDE_LINK_CLASS}>
            Look up a card by number
          </Link>{" "}
          — separate records appear separately, so you can see the printings a number covers.
        </li>
        <li>
          <Link href="/guides/prismatic-evolutions-buying-guide" className={GUIDE_LINK_CLASS}>
            The Prismatic Evolutions guide
          </Link>{" "}
          — the worked example above, in full.
        </li>
        <li>
          <Link href="/guides/how-to-read-a-pokemon-card-listing" className={GUIDE_LINK_CLASS}>
            Reading a listing
          </Link>{" "}
          — the rest of what a listing does and does not tell you.
        </li>
      </GUL>

      <SourceList ids={["packContents"]}>
        <li>
          Read 22 September 2026. Collector numbers, printings and record counts are our own
          catalogue records, read the same day.
        </li>
        <li>
          Our card images are flat catalogue scans, so this guide identifies a printing from the
          listing rather than from how a foil looks.
        </li>
      </SourceList>
    </GuideLayout>
  );
}
