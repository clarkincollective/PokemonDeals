import Link from "next/link";
import GuideLayout, { GP, GH2, GUL } from "@/components/GuideLayout";
import { Gallery, GuideTable } from "@/components/guides/CardArt";
import { Src, Srcs, SourceList } from "@/components/guides/Src";
import { guideMetadata } from "@/lib/guides";
import { GUIDE_CARDS, GUIDE_SETS, GUIDE_LINK_CLASS } from "@/lib/guideLinks";

const SLUG = "pokemon-30th-celebration-release-dates";
export const metadata = guideMetadata(SLUG);

// The UK and US official showcases give different availability for two
// products. Both pages are official, so this article reports both and
// names the difference rather than picking one and presenting it as the
// schedule. Read from both pages on 2026-09-16.

// [product, UK showcase wording, US showcase date, note]
const SCHEDULE = [
  ["Elite Trainer Box", "September 2026", "16 September 2026", ""],
  ["Pokemon Center Elite Trainer Box", "September 2026", "16 September 2026", ""],
  ["Knock Out Collection", "September 2026", "16 September 2026", ""],
  ["Poster Collection", "September 2026", "16 September 2026", ""],
  ["Pokemon ex Box", "September 2026", "16 September 2026", ""],
  ["2-Pack Blister", "September 2026", "Not listed", "On the UK page only"],
  ["Tech Sticker Collection", "November 2026", "16 September 2026", "The pages disagree"],
  ["Binder Collection", "September 2026", "4 December 2026", "The pages disagree"],
  ["Booster Bundle", "October 2026", "2 October 2026", ""],
  ["Mini Tins", "October 2026", "2 October 2026", ""],
  ["Battle Decks", "October 2026", "30 October 2026", ""],
  ["Ditto Premium Collection", "November 2026", "6 November 2026", ""],
  ["Ultra-Premium Collection", "November 2026", "6 November 2026", ""],
  ["Figure Collection", "November 2026", "6 November 2026", ""],
];

export default function Page() {
  return (
    <GuideLayout slug={SLUG}>
      <GP>
        The <em>30th Celebration</em> expansion itself released on 16 September 2026, worldwide and simultaneously.{" "}
        <Srcs ids={["expansion", "announce"]} /> The products around it did not. They arrive in waves through the end
        of the year, and &mdash; this is the part that catches people out &mdash; the official UK and US pages do not
        give the same dates for two of them.
      </GP>

      <GH2>The two schedules, side by side</GH2>
      <GP>
        The UK showcase gives months. The US showcase gives exact dates. Where they disagree, the table says so
        rather than choosing one.
      </GP>
      <GuideTable
        head={["Product", "UK showcase", "US showcase", "Note"]}
        rows={SCHEDULE}
        minWidth="46rem"
        caption="Availability exactly as each official showcase states it, read on 16 September 2026."
      />

      <Gallery
        cards={[
          { card: GUIDE_CARDS.c30PikachuRare023, caption: "Out on 16 September" },
          { card: GUIDE_CARDS.c30MewtwoExFuturistic, caption: "Out on 16 September" },
          { card: GUIDE_CARDS.c30EspeonEx, caption: "Battle Decks, October" },
          { card: GUIDE_CARDS.c30UmbreonEx, caption: "Battle Decks, October" },
        ]}
        width={150}
        priorityCount={2}
        note="The expansion itself released worldwide on 16 September 2026; the products built around these cards arrive across later waves. Catalogue scans, complete card faces."
      />

      <GH2>The two that genuinely differ</GH2>
      <GUL>
        <li>
          <strong>Tech Sticker Collection.</strong> The UK page lists it as November 2026; the US page has it among
          the products available from 16 September 2026. <Srcs ids={["showcase", "showcaseUs"]} /> That is a
          two-and-a-half month gap on the same product.
        </li>
        <li>
          <strong>Binder Collection.</strong> The UK page lists it as September 2026; the US page gives 4 December
          2026. <Srcs ids={["showcase", "showcaseUs"]} /> Again, both are official pages from The Pokemon Company.
        </li>
      </GUL>
      <GP>
        We are not going to explain away the difference, because we do not know the reason for it. Regional lineups
        and staggered distribution are both ordinary in this hobby, and a page can also be updated after publication.
        What we can tell you is that if you are in the UK and reading a US release calendar, or the reverse, two of
        these entries will be wrong for you.
      </GP>

      <GH2>If you are somewhere else</GH2>
      <GP>
        The expansion&apos;s 16 September 2026 release is stated as worldwide, so that date is the one part of this
        that travels. <Src id="announce" /> The product calendar does not: we have checked the official UK and US
        pages and no others, so we cannot tell you when the Binder Collection reaches Australia, Canada or anywhere
        else, and we are not going to guess from the two schedules we do have. If your region has its own official
        Pokemon site, that is the page to trust over either of these.
      </GP>
      <GP>
        A practical consequence worth knowing when you shop: a product being out in one country does not mean it is
        out in yours. Listings for a product that has not released locally are usually imports, and an import is a
        different proposition in terms of postage, timing and returns.
      </GP>

      <GH2>What is in each product</GH2>
      <GP>
        The dates above say when; they do not say what you get. The pack counts and the guaranteed promo card for
        every product are in our{" "}
        <Link href="/guides/pokemon-30th-celebration-promo-cards" className={GUIDE_LINK_CLASS}>
          promo-by-product guide
        </Link>
        , and the two Elite Trainer Boxes are compared line by line in{" "}
        <Link href="/guides/pokemon-30th-celebration-elite-trainer-box" className={GUIDE_LINK_CLASS}>
          the Elite Trainer Box comparison
        </Link>
        . For the cards themselves, the{" "}
        <Link href="/guides/pokemon-30th-celebration-guide" className={GUIDE_LINK_CLASS}>
          main collector&apos;s guide
        </Link>{" "}
        is the overview, and the{" "}
        <Link href={GUIDE_SETS.thirtiethCelebration.href} className={GUIDE_LINK_CLASS}>
          ME: 30th Celebration set page
        </Link>{" "}
        lists everything we track with its recent-sold market reference.
      </GP>

      <SourceList ids={["announce", "expansion", "showcase", "showcaseUs"]}>
        <li>
          Both showcases were read on 16 September 2026 and the table reproduces their wording. Where they disagree,
          neither has been treated as correcting the other.
        </li>
      </SourceList>
    </GuideLayout>
  );
}
