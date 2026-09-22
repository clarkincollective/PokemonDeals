import Link from "next/link";
import GuideLayout, { GP, GH2, GUL } from "@/components/GuideLayout";
import { Gallery, GuideTable } from "@/components/guides/CardArt";
import { guideMetadata } from "@/lib/guides";
import { GUIDE_CARDS, GUIDE_LINK_CLASS, PRICE_CHECKER_HREF } from "@/lib/guideLinks";

const SLUG = "holo-vs-reverse-holo-pokemon-cards";
export const metadata = guideMetadata(SLUG);

// Audit batch 2026-09-22.
//
// IMAGERY LIMITATION, stated in the page as well as here. Catalogue scans
// are flat images; they cannot demonstrate how foil behaves under light,
// and we will not fake a finish to illustrate one. So this guide is built
// on the part we CAN evidence first-party and that actually costs buyers
// money: that the printing is part of a card's IDENTITY, with its own
// catalogue record and its own price, even when the collector number is
// shared. The visual description is written as description, and labelled
// as such - no diagram is presented as a photograph.
export default function Page() {
  return (
    <GuideLayout slug={SLUG}>
      <GP>
        Two cards can share a name, a set and a collector number and still be different cards at
        different prices. The usual reason is foil: one is the normal printing, the other is a
        reverse holo. This guide is about telling them apart in a listing, and about why the
        collector number will not do it for you.
      </GP>

      <GH2>Where the foil sits</GH2>
      <GuideTable
        head={["", "Holo", "Reverse holo"]}
        rows={[
          ["Shiny area", "The artwork panel", "Everything except the artwork panel"],
          ["Artwork itself", "Foiled", "Usually flat"],
          ["Which cards get it", "Typically the higher rarities", "Can apply across much of a set, including commons"],
          ["Effect on identity", "Often its own catalogue record", "Often its own catalogue record"],
        ]}
        caption="A description of the two layouts, not a claim about any individual card — sets vary, and some cards exist in only one of the two."
      />
      <GP>
        The quick check in a photograph: look at where the shine <em>stops</em>. If the picture is
        glossy and the border is plain, that is a holo. If the border and text box catch the light
        while the picture looks matte, that is a reverse holo.
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
        note="Three cards, one collector number. Pattern printings work the same way reverse holos do: the pattern is the card, not a coating on it."
      />
      <GP>
        Modern sets have gone further than plain reverse holo — Poke Ball and Master Ball patterns,
        and set-specific treatments like the Quick Ball pattern on{" "}
        <Link href={GUIDE_CARDS.ascendedHeroesPawniardQuickBall.href} className={GUIDE_LINK_CLASS}>
          Pawniard 146/217
        </Link>{" "}
        in Ascended Heroes. The principle does not change: if the printing has its own record, it has
        its own market.
      </GP>

      <GH2>A note on the pictures on this page</GH2>
      <GP>
        The images above are flat catalogue scans. They show you <em>which card</em> each record is,
        which is the point being made — but a flat scan cannot show how foil moves under a light, and
        we would rather say so than mock up a finish that is not a photograph of a real card. When
        you are checking a listing, the seller&apos;s own angled photograph is the evidence, not an
        illustration on a guide page.
      </GP>

      <GH2>Making a listing tell you which one it is</GH2>
      <GUL>
        <li>
          <strong>Ask for a photograph taken at an angle, under a single light.</strong> A flat,
          straight-on scan hides exactly the thing you are trying to see.
        </li>
        <li>
          <strong>Ask the seller to say the word.</strong> &ldquo;Is this the reverse holo or the
          regular?&rdquo; is a fair question and a fast one. A seller who cannot answer it is telling
          you they have not checked.
        </li>
        <li>
          <strong>Do not accept the title as the answer.</strong> &ldquo;Holo&rdquo; is used loosely
          to mean &ldquo;shiny&rdquo;, including by honest sellers.
        </li>
        <li>
          <strong>Check the rarity symbol and the set as well</strong> — see{" "}
          <Link href="/guides/how-to-find-pokemon-card-set-and-number" className={GUIDE_LINK_CLASS}>
            finding a card&apos;s set and number
          </Link>
          .
        </li>
      </GUL>

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
    </GuideLayout>
  );
}
