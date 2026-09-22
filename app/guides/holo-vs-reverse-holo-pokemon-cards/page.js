import Link from "next/link";
import GuideLayout, { GP, GH2, GUL } from "@/components/GuideLayout";
import { Gallery } from "@/components/guides/CardArt";
import { Src, SourceList } from "@/components/guides/Src";
import { guideMetadata } from "@/lib/guides";
import { GUIDE_CARDS, GUIDE_LINK_CLASS, PRICE_CHECKER_HREF } from "@/lib/guideLinks";

const SLUG = "holo-vs-reverse-holo-pokemon-cards";
export const metadata = guideMetadata(SLUG);

// Audit batch 2026-09-22, corrected the same day.
//
// WHAT WAS REMOVED AND WHY. The first version opened with a "Where the
// foil sits" table (holo = the artwork panel shines; reverse holo =
// everything except the artwork panel) and a "quick check in a
// photograph" instruction built on it. That is a real pattern for some
// cards and not for others, we have no source for it holding generally,
// and our own evidence cannot show it at all - so as written it was a
// universal identification rule resting on nothing. It is gone. It has
// NOT been replaced with the same rule hedged into "usually".
//
// THE IMAGERY LIMITATION IS REAL AND UNRESOLVED. Our card images are flat
// catalogue scans. A flat scan cannot demonstrate how foil behaves under
// a moving light, no permitted photography that could demonstrate it was
// available to us, and we will not draw a diagram of a finish and let it
// sit where a reader expects a photograph. So the article's promise is
// narrowed to match: it no longer teaches you to identify a printing by
// eye. It teaches the part we CAN evidence first-party and that actually
// costs buyers money - that the printing is part of a card's IDENTITY,
// with its own catalogue record and its own price, even when the
// collector number is shared - and then tells you to make the seller
// answer the question.
export default function Page() {
  return (
    <GuideLayout slug={SLUG}>
      <GP>
        Two cards can share a name, a set and a collector number and still be different cards at
        different prices, because a foil treatment is part of what the card <em>is</em>. This guide
        is about why the collector number will not settle which one a listing is selling — and about
        the honest limits of working it out from a photograph.
      </GP>

      <GH2>What this guide will not do</GH2>
      <GP>
        It will not teach you to identify a foil treatment by eye from a listing photograph. That is
        a deliberate decision rather than an omission, and the reason is worth stating plainly:
      </GP>
      <GUL>
        <li>
          <strong>Our own images cannot show it.</strong> Every card image on this site is a flat
          catalogue scan. A flat scan is exactly the thing that cannot demonstrate how a foil behaves
          when the light moves across it, which is the whole of the visual difference.
        </li>
        <li>
          <strong>We could not obtain photography that does show it.</strong> Not under a licence we
          can publish under, and not from our own catalogue.
        </li>
        <li>
          <strong>We will not substitute a drawing.</strong> A diagram of a finish is an
          illustration of what we believe, not evidence, and putting one where a reader expects a
          photograph would be worse than admitting the gap.
        </li>
        <li>
          <strong>And the simple rule is not universally true.</strong> The familiar description —
          the foil sits on the artwork for one and everywhere else for the other — does describe many
          cards. We have no source establishing that it holds across eras, sets and treatments, and
          modern pattern printings plainly do not fit it. Published as a rule for identifying any
          card, it would be wrong often enough to cost somebody money.
        </li>
      </GUL>
      <GP>
        What we can tell you is the officially published part: a Pokemon booster pack contains ten
        game cards, of which three are foils with at least one rare or higher, and sets before
        Scarlet &amp; Violet guarantee at least one <strong>reverse foil</strong> card per pack.{" "}
        <Src id="packContents" /> So reverse foils are a routine part of a pack&apos;s contents, not
        an exotic variant — which is exactly why so many collector numbers cover more than one card.
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
        note="Three separate catalogue records, all numbered 059/131. These flat scans are evidence that three records exist under one number — they are NOT evidence of how any of these finishes behaves under light, and should not be read as showing that."
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

      <GH2>A note on the pictures on this page</GH2>
      <GP>
        The images above are flat catalogue scans, and it matters what they are and are not evidence
        of. They show <em>which record</em> each card is — the point being made — and they show
        nothing whatever about how a foil moves under a light. No image on this page is offered as a
        demonstration of a finish, and none should be used to judge one. When you are checking a
        listing, the seller&apos;s own angled photograph is the evidence.
      </GP>

      <GH2>Making the listing tell you which one it is</GH2>
      <GP>
        Since the photograph may not settle it and we are not going to pretend otherwise, the
        practical approach is to move the question onto the seller, who can look at the card.
      </GP>
      <GUL>
        <li>
          <strong>Ask the seller to name the printing, in words.</strong> &ldquo;Which printing is
          this — the plain card, the reverse, or a pattern?&rdquo; is a fair question and a fast
          one. An answer you can read beats an image you have to interpret.
        </li>
        <li>
          <strong>Ask for a photograph taken at an angle, under a single light.</strong> This will
          not always be decisive, but a straight-on scan definitely is not: it hides the thing you
          are asking about.
        </li>
        <li>
          <strong>Do not accept the title as the answer.</strong> &ldquo;Holo&rdquo; is written
          loosely to mean &ldquo;shiny&rdquo;, including by honest sellers.
        </li>
        <li>
          <strong>Look the number up and see how many records it covers.</strong> This one you can do
          without the seller: if a number resolves to three records here, you know there are three
          answers the listing could have.
        </li>
        <li>
          <strong>If it is graded</strong>, the printing should appear in the grader&apos;s record as
          a variety — <Link href="/guides/check-graded-pokemon-card-certificate" className={GUIDE_LINK_CLASS}>
            check it against the label
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

      <SourceList ids={["packContents"]}>
        <li>
          Read 22 September 2026. Collector numbers, printings and record counts are our own
          catalogue records, read the same day.
        </li>
        <li>
          <strong>Stated limitation.</strong> We hold no photography that demonstrates how a foil
          treatment behaves under light, and no source for a general rule about where the foil sits
          on a holo as against a reverse holo. This guide therefore does not offer one, and does not
          claim you can identify a printing from a flat image.
        </li>
      </SourceList>
    </GuideLayout>
  );
}
