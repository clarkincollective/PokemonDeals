import Link from "next/link";
import GuideLayout, { GP, GH2, GUL } from "@/components/GuideLayout";
import { guideMetadata } from "@/lib/guides";

const SLUG = "raw-vs-graded-pokemon-cards";
export const metadata = guideMetadata(SLUG);

export default function Page() {
  return (
    <GuideLayout slug={SLUG}>
      <GP>
        The same card, raw and graded, is effectively two products with two prices. A raw card is
        sold as-is on the seller&apos;s description. A graded card has been authenticated, assigned a
        numeric grade, and sealed by a third party — so the buyer is paying for certainty as much as
        for the card.
      </GP>

      <GH2>Why the graded price is higher</GH2>
      <GUL>
        <li>
          <strong>Authentication.</strong> The grader has confirmed the card is genuine and
          un-altered. For expensive vintage cards especially, that removes the single biggest risk of
          buying raw.
        </li>
        <li>
          <strong>An agreed condition.</strong> &ldquo;Near Mint&rdquo; is subjective; &ldquo;PSA
          9&rdquo; is not. Both buyer and seller are working from the same fixed grade.
        </li>
        <li>
          <strong>Scarcity at the top.</strong> Plenty of raw copies might exist, but only a fraction
          grade a perfect 10. High-grade population is often small, and that&apos;s what the premium
          pays for.
        </li>
        <li>
          <strong>Protection and display.</strong> The slab protects the card and is how many
          collectors want to own and show it.
        </li>
      </GUL>
      <GP>
        The size of the premium varies enormously by card and grade. A common modern card in a PSA 9
        might be worth little more than raw; a sought-after vintage card in a PSA 10 can trade at many
        multiples of a raw near-mint copy. There is no fixed multiplier — you have to look at real
        sold prices for that exact card and grade. Each{" "}
        <Link
          href="/market-data/most-listed-cards"
          className="text-red-600 hover:underline dark:text-red-500"
        >
          card page
        </Link>{" "}
        on this site shows the raw price and each graded tier side by side.
      </GP>

      <GH2>What grading costs and takes</GH2>
      <GP>
        Grading is a paid service with published tiers: you pay per card, and the fee rises with the
        card&apos;s declared value and with faster turnaround. Bulk submissions are cheaper per card
        than one-offs. Turnaround ranges from a few days on the most expensive express tiers to
        several months on the cheapest, and there&apos;s round-trip shipping and insurance on top.
        Exact prices change often, so check the grader&apos;s current fee schedule before planning a
        submission.
      </GP>

      <GH2>When grading is worth it</GH2>
      <GUL>
        <li>
          <strong>The card is genuinely high-end raw.</strong> If a near-mint raw copy is already
          worth well more than the grading fee plus shipping, and it has a real shot at a 9 or 10,
          the maths can work.
        </li>
        <li>
          <strong>You&apos;re confident in the condition.</strong> Centering, surface, and corners
          under magnification decide the grade. A card that looks &ldquo;mint&rdquo; to the eye often
          comes back a 7 or 8. If you&apos;re not sure, the fee is a gamble.
        </li>
        <li>
          <strong>Authentication matters.</strong> For expensive vintage cards, a slab from a
          recognised grader materially widens the pool of buyers willing to pay top price.
        </li>
      </GUL>
      <GP>
        When it&apos;s <em>not</em> worth it: low-value cards (the fee exceeds the upside), cards with
        visible flaws that cap the grade, and anything you plan to play with rather than keep.
      </GP>

      <GH2>Buying graded</GH2>
      <GUL>
        <li>Compare like for like: same grading company, same grade. Prices are not interchangeable across companies.</li>
        <li>Check the certification number on the grader&apos;s website against the slab in the photos.</li>
        <li>Be wary of unusually cheap &ldquo;PSA 10&rdquo; listings — cracked-and-reslabbed and counterfeit slabs exist.</li>
        <li>
          A mid-grade slab (say a CGC 7) priced low is a cheaper card, not a discounted 10. See{" "}
          <Link
            href="/guides/card-condition-grading"
            className="text-red-600 hover:underline dark:text-red-500"
          >
            condition &amp; grading
          </Link>
          .
        </li>
      </GUL>
    </GuideLayout>
  );
}
