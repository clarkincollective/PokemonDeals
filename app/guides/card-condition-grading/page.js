import Link from "next/link";
import GuideLayout, { GP, GH2, GUL } from "@/components/GuideLayout";
import GuideFigure from "@/components/guides/GuideFigure";
import ConditionScale from "@/components/guides/ConditionScale";
import { guideMetadata } from "@/lib/guides";

const SLUG = "card-condition-grading";
export const metadata = guideMetadata(SLUG);

export default function Page() {
  return (
    <GuideLayout slug={SLUG}>
      <GP>
        &ldquo;Condition&rdquo; and &ldquo;grade&rdquo; are two different things. Condition is an
        informal description of a raw (un-slabbed) card&apos;s wear. A grade is a number assigned by a
        third-party company after they&apos;ve inspected and sealed the card. Both affect price, and
        the words get used loosely, so it&apos;s worth being precise.
      </GP>

      <GH2>Raw card condition</GH2>
      <GP>
        Most marketplaces and price guides (including TCGPlayer, which underlies a lot of Pokémon
        pricing data) use a five-step scale. Sellers assign it themselves, so treat it as a claim to
        verify against the photos, not a fact.
      </GP>
      <GUL>
        <li>
          <strong>Near Mint (NM).</strong> Looks essentially unplayed. At most tiny, hard-to-see
          imperfections — a very slight edge nick or a minor surface flaw under angled light.
        </li>
        <li>
          <strong>Lightly Played (LP).</strong> Minor wear visible on close inspection: light edge
          whitening, small scratches, a soft corner. Still an attractive card.
        </li>
        <li>
          <strong>Moderately Played (MP).</strong> Obvious wear — noticeable whitening, scratches,
          light creasing, or minor border wear — but structurally sound and not defaced.
        </li>
        <li>
          <strong>Heavily Played (HP).</strong> Major wear: heavy whitening, creasing, scratching,
          water damage, or writing. Clearly a well-used card.
        </li>
        <li>
          <strong>Damaged (DMG).</strong> Significant damage — tears, large creases, bends, holes, or
          heavy water damage.
        </li>
      </GUL>

      <GuideFigure caption="Bar length is illustrative, not a fixed ratio — the actual price drop between tiers varies by card, and is steepest for scarce vintage cards.">
        <ConditionScale />
      </GuideFigure>

      <GP>
        The gap between NM and LP prices is often large, and between NM and MP larger still, so a
        listing described as &ldquo;NM&rdquo; that shows edge wear in the photos isn&apos;t the deal
        the price suggests. This site reads the condition wording out of a listing&apos;s own title
        and prices the card against that condition rather than always assuming Near Mint — details on
        the{" "}
        <Link href="/methodology" className="text-red-600 hover:underline dark:text-red-500">
          methodology
        </Link>{" "}
        page.
      </GP>

      <GH2>Third-party grading</GH2>
      <GP>
        Grading companies authenticate a card, assign a numeric grade, and seal it in a tamper-evident
        holder (a &ldquo;slab&rdquo;). The grade is theirs, not the seller&apos;s, which is why graded
        cards trade in their own market. The main companies you&apos;ll see in Pokémon listings:
      </GP>
      <GUL>
        <li>
          <strong>PSA.</strong> The most common for Pokémon by volume. A single 1–10 whole-number
          scale (with a rarely-used half grade at 1.5). PSA 10 is &ldquo;Gem Mint&rdquo;; PSA 9 is
          &ldquo;Mint&rdquo;. No sub-grades on the label.
        </li>
        <li>
          <strong>CGC.</strong> A 1–10 scale in half-point steps, with a distinct &ldquo;Pristine
          10&rdquo; above the standard &ldquo;Gem Mint 10&rdquo;. Sub-grades (centering, corners,
          edges, surface) are recorded.
        </li>
        <li>
          <strong>BGS (Beckett).</strong> A 1–10 scale in half-point steps with four sub-grades on
          every label. A BGS 10 is rare; a &ldquo;Black Label&rdquo; 10 (all four sub-grades 10) is
          rarer and priced accordingly. BGS 9.5 (&ldquo;Gem Mint&rdquo;) is the common high grade.
        </li>
        <li>
          <strong>SGC, ACE, TAG.</strong> Smaller graders also seen in listings. SGC uses a 1–10
          scale; ACE and TAG are newer entrants, TAG using computer-vision grading and a 1–10 scale
          to one decimal place.
        </li>
      </GUL>
      <GP>
        Grades are not interchangeable across companies — a PSA 10 and a CGC 10 don&apos;t command the
        same price, and the market usually pays the most for PSA at the top end for Pokémon. When you
        compare graded prices, compare like for like: same company, same grade. On this site, graded
        listings are only ever priced against real sold records for that exact company and grade.
      </GP>

      <GH2>Practical takeaways</GH2>
      <GUL>
        <li>Judge a raw card from clear, in-focus photos of all four corners and the full surface.</li>
        <li>&ldquo;Mint&rdquo; in a raw listing is a seller&apos;s opinion; a graded &ldquo;10&rdquo; is a company&apos;s.</li>
        <li>A cheap graded card at a mid grade (say a PSA 6) is a legitimately cheaper card, not a bargain on a PSA 10.</li>
        <li>
          Browse graded deals specifically on{" "}
          <Link href="/?type=graded" className="text-red-600 hover:underline dark:text-red-500">
            the graded filter
          </Link>
          .
        </li>
      </GUL>
    </GuideLayout>
  );
}
