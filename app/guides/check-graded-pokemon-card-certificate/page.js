import Link from "next/link";
import GuideLayout, { GP, GH2, GUL } from "@/components/GuideLayout";
import { GuideTable } from "@/components/guides/CardArt";
import { guideMetadata } from "@/lib/guides";
import { GUIDE_LINK_CLASS } from "@/lib/guideLinks";

const SLUG = "check-graded-pokemon-card-certificate";
export const metadata = guideMetadata(SLUG);

// Audit batch 2026-09-22. Distinct from raw-vs-graded (a value decision)
// and from the grading-scale guide (what a number means). This is the
// procedure you run against a specific listing before paying.
//
// SOURCING NOTE. PSA's and CGC's own lookup pages both returned HTTP 403
// to automated retrieval on 2026-09-22, so nothing here is presented as a
// quotation from, or a claim about, a grader's published wording. What is
// stated instead is the MECHANISM (a number resolves to a record) and the
// logical limit of that mechanism (a record describes a slab; it cannot
// witness which physical object is in a photograph). Both hold regardless
// of how any grader words its page. We deliberately do not describe label
// security features, cert-number formats or downtime notices we could not
// read at source.
export default function Page() {
  return (
    <GuideLayout slug={SLUG}>
      <GP>
        A graded card arrives in a sealed plastic holder with a printed label: the card&apos;s
        identity, the grading company, a grade, and a certification number. That number is the thing
        you can check before you pay. This guide is the check itself, and — just as importantly —
        what a clean result does not settle.
      </GP>

      <GH2>The check, in order</GH2>
      <GUL>
        <li>
          <strong>Get the certification number from the photograph, not the description.</strong> If
          the label is not legible in any image, that is the first thing to ask for. A seller who
          will not photograph the label has answered your question.
        </li>
        <li>
          <strong>Go to the grading company&apos;s own lookup, typed in yourself.</strong> Use the
          grader named on the label — their site, reached directly. Do not use a link supplied in
          the listing, and do not rely on a screenshot of a result.
        </li>
        <li>
          <strong>Match the returned record to the card in the pictures, field by field</strong> —
          not just the grade. The table below is what to compare.
        </li>
        <li>
          <strong>Compare the grader&apos;s own images where they publish them.</strong> Some
          graders show the card they slabbed. Where those images exist they are the strongest single
          check available to you. Where they do not, say so to yourself rather than assuming.
        </li>
        <li>
          <strong>Ask for what is missing</strong> before bidding, not after.
        </li>
      </GUL>

      <GH2>What to match</GH2>
      <GuideTable
        head={["Field", "Why it matters"]}
        rows={[
          ["Card name", "The obvious one, and the one people check alone."],
          ["Set", "The same card exists in several sets at very different values."],
          ["Collector number", "Distinguishes cards that share a name within one set."],
          ["Language", "A Japanese copy is a different card from the English one, not a cheaper one."],
          ["Variety / printing", "Reverse holo, 1st Edition, pattern variants — often the largest part of the price."],
          ["Grading company", "The label and the lookup must be the same company."],
          ["Grade", "Including any qualifier printed alongside the number."],
        ]}
        caption="A mismatch in any row means stop and ask, not 'probably a typo'."
      />
      <GP>
        Printing is where most money is lost quietly. Two cards can share a set and a collector
        number and still be different products — see{" "}
        <Link href="/guides/holo-vs-reverse-holo-pokemon-cards" className={GUIDE_LINK_CLASS}>
          holo vs reverse holo
        </Link>{" "}
        for how that happens and what to look for.
      </GP>

      <GH2>What a successful lookup actually establishes</GH2>
      <GP>
        It establishes that the number you typed corresponds to a record held by that grading
        company, and it tells you what that record says the card is. That is genuinely useful. It is
        also the whole of it.
      </GP>
      <GP>
        What it cannot do is witness the object in front of the camera. A lookup is a database query;
        it has no way to know which physical holder a photograph shows. So a valid certificate number
        that belongs to a real graded card is consistent with the listing being exactly what it
        claims — and also consistent with that number having been reproduced onto something else.
        The lookup cannot separate those two cases, and no amount of reading the result more
        carefully will make it able to.
      </GP>
      <GP>
        This is why the grader&apos;s own images matter so much when they exist, and why the
        sensible next question is about the physical item rather than the number.
      </GP>

      <GH2>What to ask the seller for</GH2>
      <GUL>
        <li>A straight, in-focus photograph of the <strong>whole label</strong>, readable.</li>
        <li>
          The <strong>front and back of the slab</strong>, in even light, with no glare across the
          card.
        </li>
        <li>
          A photograph of the <strong>edges of the holder</strong> — you are looking at the holder as
          an object, not only at the card inside it.
        </li>
        <li>
          Confirmation that the photographs are <strong>of the actual item</strong> and not a stock
          image. Stock photography on a graded single is a reason to move on.
        </li>
      </GUL>

      <GH2>Before you pay</GH2>
      <GUL>
        <li>The label is legible in a photograph you were given.</li>
        <li>The number resolves on the grader&apos;s own site, reached directly.</li>
        <li>Every field in the table above matches the card in the pictures.</li>
        <li>Where the grader publishes images, they match too.</li>
        <li>You are comparing the price against the same company at the same grade.</li>
      </GUL>
      <GP>
        That last point is easy to get wrong. A grade from one company is not interchangeable with
        the same number from another, and our comparisons keep the company and grade together for
        exactly that reason — see{" "}
        <Link href="/guides/pokemon-card-grading-scale" className={GUIDE_LINK_CLASS}>
          the grading scale guide
        </Link>
        .
      </GP>

      <GH2>Where to go next</GH2>
      <GUL>
        <li>
          <Link href="/deals/graded" className={GUIDE_LINK_CLASS}>
            Browse graded listings
          </Link>{" "}
          — compared against references for the same company and grade.
        </li>
        <li>
          <Link href="/guides/raw-vs-graded-pokemon-cards" className={GUIDE_LINK_CLASS}>
            Raw vs graded
          </Link>{" "}
          — whether to buy the slab at all, which is a separate question from this one.
        </li>
        <li>
          <Link href="/guides/spotting-fake-pokemon-cards-in-listings" className={GUIDE_LINK_CLASS}>
            What listing photos can establish
          </Link>{" "}
          — the same reasoning applied to raw cards.
        </li>
      </GUL>
      <GP>
        Nothing on this site authenticates a physical card, and neither does a certificate lookup. We
        check identity, availability and the comparison we publish; the object itself is between you
        and the seller.
      </GP>
    </GuideLayout>
  );
}
