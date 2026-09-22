import Link from "next/link";
import GuideLayout, { GP, GH2, GUL } from "@/components/GuideLayout";
import { GuideTable } from "@/components/guides/CardArt";
import { guideMetadata } from "@/lib/guides";
import { GUIDE_LINK_CLASS } from "@/lib/guideLinks";

const SLUG = "japanese-vs-english-pokemon-cards";
export const metadata = guideMetadata(SLUG);

// Audit batch 2026-09-22. Evergreen and deliberately structural: the
// release-specific comparisons (Storm Emeralda vs Delta Reign) already
// exist, so this one is about how the two LINES differ and what that does
// to a listing. No price comparison table: we do not hold a cross-language
// reference we would stand behind, and the guide says so plainly.
export default function Page() {
  return (
    <GuideLayout slug={SLUG}>
      <GP>
        Japanese and English Pokemon cards are two separate product lines, not two editions of one.
        They release on different schedules, in different set shapes, in different products, and they
        sell in different markets. Once that is clear, most of the confusion in cross-language buying
        goes away.
      </GP>

      <GH2>The differences that affect a purchase</GH2>
      <GuideTable
        head={["", "Japanese line", "English line"]}
        rows={[
          ["Set size", "Smaller sets, released more often", "Larger sets, released less often"],
          ["Relationship", "Released first", "Often draws on more than one Japanese set"],
          ["Numbering", "Its own scheme per set", "Its own scheme per set — the two do not align"],
          ["Products", "Its own formats and exclusives", "Boxes, ETBs, bundles, collections"],
          ["Market", "Priced among Japanese copies", "Priced among English copies"],
        ]}
        caption="A structural comparison. Specific sets vary, and each pairing should be checked individually rather than assumed."
      />
      <GP>
        The second row is the one that breaks expectations. An English expansion is frequently built
        from the contents of several Japanese sets, so there is often <strong>no</strong> clean
        one-to-one mapping between a Japanese set and an English one. A card&apos;s Japanese
        counterpart may exist under a different number, in a set with a different name, released
        months earlier.
      </GP>

      <GH2>The mistake that costs money</GH2>
      <GP>
        Pricing a Japanese card against an English reference, or the reverse. They are different
        products with different supply and different demand; there is no reliable exchange rate
        between them, and one being cheaper is not a discount on the other.
      </GP>
      <GP>
        This is not a theoretical concern for us. It is why our comparisons keep language as part of
        a card&apos;s identity, and why a listing we cannot match to a reference for{" "}
        <em>that exact card, in that language and printing</em> is shown with no savings claim at
        all. A confident-looking percentage derived from the wrong language is worse than no
        percentage.
      </GP>
      <GP>
        We do not publish a cross-language price table here, because we do not hold a reference we
        would stand behind for that comparison. That is a limitation of our data, stated rather than
        papered over.
      </GP>

      <GH2>Which should you buy?</GH2>
      <GuideTable
        head={["If you want", "Lean toward", "Why"]}
        rows={[
          ["To play in an English event", "English", "Tournament legality follows the language you play in."],
          ["A specific artwork you have seen", "Check both", "Artwork frequently appears in both lines — at different numbers."],
          ["A card earlier than its English release", "Japanese", "The Japanese line is generally first."],
          ["To complete an English set", "English", "A Japanese copy does not fill an English slot."],
          ["Smaller, more frequent sealed purchases", "Japanese", "Set and product sizes tend to be smaller."],
        ]}
        caption="Preferences, not rules. Collector definitions differ and so do goals."
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
          about where the card sits in an English set.
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
          — where English 151 and Japanese SV2a get mixed up most often.
        </li>
      </GUL>
    </GuideLayout>
  );
}
