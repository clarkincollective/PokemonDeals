import Link from "next/link";
import GuideLayout, { GP, GH2, GUL } from "@/components/GuideLayout";
import GuideFigure from "@/components/guides/GuideFigure";
import { Gallery } from "@/components/guides/CardArt";
import RawVsGraded from "@/components/guides/RawVsGraded";
import { guideMetadata } from "@/lib/guides";
import { GUIDE_CARDS, PRICE_CHECKER_HREF, GUIDE_LINK_CLASS } from "@/lib/guideLinks";

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

      <GuideFigure caption="The multiplier isn't fixed — it depends on the card and the grade, and is largest for scarce cards at the top grades.">
        <RawVsGraded />
      </GuideFigure>

      <GP>
        The size of the premium varies enormously by card and grade. A common modern card in a PSA 9
        might be worth little more than raw; a sought-after vintage card in a PSA 10 can trade at many
        multiples of a raw near-mint copy. There is no fixed multiplier — you have to look at real
        sold prices for that exact card and grade. Card pages on this site show the raw price and,
        where there are enough recent graded sales for that exact printing, each grader and grade
        alongside it &mdash; for example{" "}
        <Link href={GUIDE_CARDS.pikachuVFullArt.href} className={GUIDE_LINK_CLASS}>
          {GUIDE_CARDS.pikachuVFullArt.label}
        </Link>
        . Any card can be looked up in the{" "}
        <Link href={PRICE_CHECKER_HREF} className={GUIDE_LINK_CLASS}>
          price checker
        </Link>
        .
      </GP>

      <Gallery
        cards={[
          { card: GUIDE_CARDS.charizardBaseSet, caption: "Vintage - the classic grading candidate" },
          { card: GUIDE_CARDS.pikachuVFullArt, caption: "Modern full art" },
          { card: GUIDE_CARDS.umbreonVmaxAltArt, caption: "Modern alternate art" },
        ]}
        width={150}
        priorityCount={2}
        note="Cards commonly sent for grading. Raw and graded figures for any of them are separate on its card page, and graded tiers appear only where there are enough recent graded sales. Catalogue scans, complete card faces."
      />

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
        <li>Be wary of unusually cheap &ldquo;PSA 10&rdquo; listings — cracked-and-reslabbed and counterfeit slabs exist. If a listing itself looks off, see{" "}
          <Link href="/guides/spotting-fake-pokemon-cards-in-listings" className={GUIDE_LINK_CLASS}>checking a listing for fakes</Link>.</li>
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

      <GH2>Raw or graded for the same budget: a decision table</GH2>
      <GP>
        The same money buys a different thing on each side. Decide what you want the card for, then
        read the row.
      </GP>
      <GUL>
        <li>
          <strong>You want the card to keep, and you can inspect photos well.</strong> Raw, in the
          condition the photos support, priced against a raw reference for that condition. You pay
          for the card, not the slab.
        </li>
        <li>
          <strong>You want a specific grade, or you plan to resell to graded-card buyers.</strong>{" "}
          Graded, from the company whose grades those buyers trust, priced against the reference for
          that company and grade. Verify the certification number.
        </li>
        <li>
          <strong>You want a high-value vintage card and cannot judge condition from photos.</strong>{" "}
          Graded, even at a lower grade — a mid-grade slab removes the two biggest risks (fake, and
          condition worse than claimed) that a raw purchase carries.
        </li>
        <li>
          <strong>You want the most copies for the budget.</strong> Raw, Lightly Played or better,
          from listings whose condition is stated and supported.
        </li>
        <li>
          <strong>Your budget is close to a grading fee.</strong> Raw — a slab on a low-value card
          costs more than it adds.
        </li>
      </GUL>
      <GP>
        Whichever side you choose, compare within it: a raw price against a raw reference, a PSA 9
        against a PSA 9 reference. The site never compares across the line.
      </GP>

      <GH2>Keep reading</GH2>
      <GUL>
        <li>
          <Link href="/guides/card-condition-grading" className="text-red-600 hover:underline dark:text-red-500">
            Pokemon card condition &amp; grading explained
          </Link>{" "}
          — the Near Mint-to-Damaged scale and what a PSA / CGC / BGS number means.
        </li>
        <li>
          <Link href="/guides/how-pokemon-card-prices-work" className="text-red-600 hover:underline dark:text-red-500">
            How Pokemon card prices are determined
          </Link>{" "}
          — why one card has many prices.
        </li>
        <li>
          Compare a card&apos;s raw and every graded tier side by side:{" "}
          <Link href="/pokemon" className="text-red-600 hover:underline dark:text-red-500">
            browse by Pokemon
          </Link>
          , or see current{" "}
          <Link href="/?type=graded" className="text-red-600 hover:underline dark:text-red-500">
            graded deals
          </Link>
          .
        </li>
      </GUL>
    </GuideLayout>
  );
}
