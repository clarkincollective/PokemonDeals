import Link from "next/link";
import GuideLayout, { GP, GH2, GUL } from "@/components/GuideLayout";
import { GuideTable } from "@/components/guides/CardArt";
import { Src, SourceList } from "@/components/guides/Src";
import { guideMetadata } from "@/lib/guides";
import { GUIDE_LINK_CLASS } from "@/lib/guideLinks";

const SLUG = "japanese-vs-english-pokemon-cards";
export const metadata = guideMetadata(SLUG);

// Audit batch 2026-09-22.
//
// SCOPE. Two things are in bounds: the published Play! Pokemon rule on
// card language (TCG Tournament Handbook, English version, last revision
// 1 September 2026, read 2026-09-22) and first-party statements about our
// own data. Our card catalogue is English-only, so this guide must not
// make comparative claims about the two product lines - release order,
// relative set sizes, relative product ranges, cross-language prices.
//
// Editorial history: docs/content/pullnomics-audit-implementation-2026-09-22.md.
export default function Page() {
  return (
    <GuideLayout slug={SLUG}>
      <GP>
        A Japanese card is not a cheaper version of the English one. It is a different card, with
        its own collector number, its own market, and — if you play — its own rules about where it
        is legal. Treat the two as separate purchases and most of the confusion disappears.
      </GP>

      <GH2>Where a Japanese card is legal to play</GH2>
      <GP>
        This one is decided by a published rule rather than by opinion, so it is worth getting
        exactly right. Play! Pokemon limits which card languages are legal at Championship Series
        events according to the <strong>rating zone</strong> the event is held in, and requires that
        cards be in the correct language for the region of the tournament. Mixed-language decks are
        allowed so long as the card backs are consistent. <Src id="tcgTournamentHandbook" />
      </GP>
      <GuideTable
        head={["Rating zone", "Legal card languages at Championship Series events"]}
        rows={[
          ["US and Canada", "English (French additionally in Canada)"],
          ["Latin America", "English, Spanish (Portuguese additionally in several countries)"],
          ["Europe", "English, French, German, Italian, Portuguese, Spanish"],
          ["Oceania", "English"],
          ["Russia", "English, Russian"],
          ["Middle East and South Africa", "English"],
        ]}
        caption="Play! Pokemon TCG Tournament Handbook, sections 2.3.1 and 2.3.2, English version, last revision 1 September 2026. For tournaments and League sessions outside the Championship Series, the handbook leaves the decision to the Organizer or League staff."
      />
      <GP>
        Japanese is not among the legal languages for any of those zones, and the handbook gives a
        second, separate reason it does not travel: it states that Japanese cards are considered{" "}
        <strong>marked</strong> for the purposes of its disallowed-cards section, because their card
        backs differ from the backs of all other Pokemon trading cards.{" "}
        <Src id="tcgTournamentHandbook" /> That is about the back of the card, so it is not something
        sleeving or condition fixes.
      </GP>
      <GP>
        Two caveats the handbook itself makes. At the World
        Championships, International Championships, Regional and Special Championships and their side
        events, competitors are always permitted English cards plus any language legal in their home
        country. And in exceptional circumstances the Head Judge or Organizer of any tournament may
        make an exception on language at their own discretion. If you are buying to play, check the
        current handbook and ask your organiser — do not take a guide page, including this one, as
        the authority on the day.
      </GP>

      <GH2>The mistake that costs money</GH2>
      <GP>
        Pricing a Japanese card against an English reference, or the reverse. They are different
        products with different supply and different demand; there is no reliable exchange rate
        between them, and one being cheaper is not a discount on the other.
      </GP>
      <GP>
        It is why our comparisons keep language as part of a card&apos;s identity: a listing we
        cannot match to a reference for <em>that exact card, in that language and printing</em>
        {" "}shows no savings claim at all. We hold no cross-language reference, so we publish no
        table converting one market into the other.
      </GP>

      <GH2>Which should you buy?</GH2>
      <GuideTable
        head={["If you want", "Buy", "Why"]}
        rows={[
          [
            "To play at a Championship Series event",
            "A card in a language legal for that rating zone",
            "Set by the table above, not by preference. Japanese is not among them, and Japanese backs are treated as marked.",
          ],
          [
            "To complete an English set",
            "English",
            "A Japanese copy does not fill an English slot, whatever the artwork matches.",
          ],
          [
            "A specific artwork you have seen in a photograph",
            "Whichever line that card is from — check which",
            "The same illustration can exist in both lines at different numbers, so identify the card before choosing the line.",
          ],
        ]}
        caption="Our card catalogue holds English records only, so this guide does not compare the two lines on release order, set size or product range."
      />

      <GH2>Reading a cross-language listing</GH2>
      <GUL>
        <li>
          <strong>Confirm the language from the card, not the title.</strong> Japanese cards appear
          constantly in English-language search results, sometimes without the seller saying so.
        </li>
        <li>
          <strong>Do not match on artwork alone.</strong> The same illustration can exist in both
          lines at different numbers and rarities.
        </li>
        <li>
          <strong>Treat the number as set-specific.</strong> A Japanese number tells you nothing
          about where the card sits in an English set. Our catalogue holds English records only, so
          if you search here by a Japanese number you are searching the wrong list.
        </li>
        <li>
          <strong>Factor in where it ships from.</strong> Delivery cost and time are part of the
          price — our marketplace filters exist for that reason.
        </li>
        <li>
          <strong>If it is graded</strong>, language is one of the fields to match on the label —{" "}
          <Link href="/guides/check-graded-pokemon-card-certificate" className={GUIDE_LINK_CLASS}>
            the certificate check
          </Link>
          .
        </li>
      </GUL>

      <GH2>Where to go next</GH2>
      <GUL>
        <li>
          <Link href="/japanese-cards" className={GUIDE_LINK_CLASS}>
            Browse Japanese card listings
          </Link>{" "}
          — kept separate from the English lane for the reasons above.
        </li>
        <li>
          <Link href="/guides/storm-emeralda-vs-delta-reign-japanese-or-english" className={GUIDE_LINK_CLASS}>
            Storm Emeralda vs Delta Reign
          </Link>{" "}
          — this comparison applied to one specific release pair.
        </li>
        <li>
          <Link href="/guides/pokemon-151-buying-guide" className={GUIDE_LINK_CLASS}>
            The 151 buying guide
          </Link>{" "}
          — one set where English and Japanese listings are easy to confuse.
        </li>
      </GUL>

      <SourceList ids={["tcgTournamentHandbook", "playPokemonRules"]}>
        <li>
          Downloaded and read 22 September 2026. Tournament rules change: the handbook above is the
          authority, not this page, and your event&apos;s organiser is the authority on the day.
        </li>
        <li>
          Our card catalogue holds English records only, so we publish no cross-language price
          comparison and no comparison of the two lines' release schedules or set sizes.
        </li>
      </SourceList>
    </GuideLayout>
  );
}
