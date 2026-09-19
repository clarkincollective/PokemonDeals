import Link from "next/link";
import GuideLayout, { GP, GH2, GUL } from "@/components/GuideLayout";
import { Srcs, SourceList } from "@/components/guides/Src";
import { guideMetadata } from "@/lib/guides";
import { GUIDE_LINK_CLASS } from "@/lib/guideLinks";

const SLUG = "delta-reign-preorders-and-prerelease-what-to-know";
export const metadata = guideMetadata(SLUG);

// Delta Reign pre-launch cluster (2026-09-20). What "preorder" and
// "prerelease" mean for a set that does not exist yet, and the site's own
// rule for unreleased-set listings (lib/dealQuality: early listings are
// held until eBay confirms them active). No prices, no product lineup.
export default function Page() {
  return (
    <GuideLayout slug={SLUG}>
      <GP>
        <em>Delta Reign</em> releases on 6 November 2026. <Srcs ids={["drAnnounce"]} /> Between now and then you will
        see three kinds of listing using its name: preorders of sealed product, prerelease cards after the events in
        the week before release, and Japanese cards mislabelled as English. This page explains what each one is and
        what to check before you pay.
      </GP>

      <GH2>Preorders: a promise, not a product</GH2>
      <GUL>
        <li>
          <strong>No English Delta Reign product exists yet.</strong> A sealed box, Elite Trainer Box or bundle listed
          today is a commitment to ship one after 6 November. The official pages do not yet list the product lineup,
          so even the product names in a preorder come from retailers, not from The Pokemon Company.
        </li>
        <li>
          <strong>Read the delivery date and the returns policy.</strong> A preorder&apos;s real terms are when it
          ships and what happens if allocation falls short. eBay&apos;s Money Back Guarantee covers an item that never
          arrives, but only after the stated delivery window has passed.
        </li>
        <li>
          <strong>&ldquo;In hand&rdquo; before release is a red flag</strong> for English product. Early
          30th Celebration stock was removed from eBay at The Pokemon Company&apos;s request in August 2026 as
          potentially stolen property; the same applies to any expansion.
        </li>
        <li>
          <strong>A launch-week price is not the product&apos;s price.</strong> Hard-to-find product resells above
          retail for a few weeks and settles once stock arrives. Our{" "}
          <Link href="/guides/pokemon-booster-box-prices" className={GUIDE_LINK_CLASS}>
            booster box price guide
          </Link>{" "}
          explains why.
        </li>
      </GUL>

      <GH2>Prerelease cards</GH2>
      <GUL>
        <li>
          Prerelease events are customarily held in the week before an expansion releases; PokeBeach reports the
          dates as they are announced. They are not yet stated on the official Delta Reign pages.
        </li>
        <li>
          A prerelease promo is a <strong>stamped copy of a set card that keeps the set&apos;s own collector
          number</strong> &mdash; it is not a separate numbered promo. Our{" "}
          <Link href="/guides/pokemon-promo-card-numbers" className={GUIDE_LINK_CLASS}>
            promo-numbers guide
          </Link>{" "}
          covers the three kinds of promo that keep a set number.
        </li>
        <li>
          The site treats a prerelease-stamped card as a different product from the unstamped set card &mdash; the
          same rule that separates the 30th Celebration prerelease stamps &mdash; so one is never priced against
          the other.
        </li>
      </GUL>

      <GH2>How this site handles an unreleased set</GH2>
      <GP>
        A listing for a card from a set that has not released yet is <strong>held</strong> rather than shown. It
        appears only once eBay confirms the listing is active, and even then the page says that this confirms the
        listing, not that the seller holds the card or when it would arrive. No saving is claimed for a Delta Reign
        card until a market reference exists for that exact English printing and condition &mdash; which cannot be
        before the cards exist. This is the rule that applied to 30th Celebration before 16 September, and it
        applies unchanged here. The running counts of held and withheld listings are on the{" "}
        <Link href="/integrity" className={GUIDE_LINK_CLASS}>
          listing integrity report
        </Link>
        .
      </GP>

      <GH2>Listing wording to be careful of</GH2>
      <GUL>
        <li>
          <strong>&ldquo;Delta Reign&rdquo; over a Japanese card</strong> &mdash; it is a Storm Emeralda card; see{" "}
          <Link href="/guides/storm-emeralda-vs-delta-reign-japanese-or-english" className={GUIDE_LINK_CLASS}>
            Japanese now or English in November
          </Link>
          .
        </li>
        <li>
          <strong>&ldquo;Leaked&rdquo;</strong> &mdash; the July photographs were of Japanese cards that then released.
        </li>
        <li>
          <strong>&ldquo;Confirmed pull rate&rdquo;, &ldquo;guaranteed hit&rdquo;</strong> &mdash; no English pull
          rate has been published for this set; a sealed product carries no guarantee of any card.
        </li>
        <li>
          <strong>&ldquo;First edition&rdquo;</strong> &mdash; modern English sets have no first-edition printing.
        </li>
      </GUL>

      <GH2>A short checklist</GH2>
      <GUL>
        <li>Is it English or Japanese? Photos, not the title.</li>
        <li>Is it a product that exists, or a preorder? Check the delivery date and the returns terms.</li>
        <li>Is a saving being claimed? For this set, nothing supports one yet.</li>
        <li>
          Would you still buy it at the listed price with no reference behind it? If not, wait for 6 November and
          the card pages that follow.
        </li>
      </GUL>

      <GP>
        The official facts, and what remains unknown, are kept current on{" "}
        <Link href="/guides/pokemon-delta-reign-release-date-what-is-official" className={GUIDE_LINK_CLASS}>
          Delta Reign: what is official so far
        </Link>
        .
      </GP>

      <SourceList ids={["drExpansion", "drAnnounce"]}>
        Reporting cited by name above: PokeBeach (eBay removals of early 30th Celebration listings at TPCi&apos;s
        request, August 2026; prerelease reporting). Official pages read on 20 September 2026.
      </SourceList>
    </GuideLayout>
  );
}
