import Link from "next/link";
import GuideLayout, { GP, GH2, GUL } from "@/components/GuideLayout";
import { GuideTable } from "@/components/guides/CardArt";
import { Src, SourceList } from "@/components/guides/Src";
import { guideMetadata } from "@/lib/guides";
import { GUIDE_LINK_CLASS } from "@/lib/guideLinks";
import { GUIDE_SOURCES } from "@/lib/guideSources";

const SLUG = "check-graded-pokemon-card-certificate";
export const metadata = guideMetadata(SLUG);

// Audit batch 2026-09-22, corrected the same day. Distinct from
// raw-vs-graded (a value decision) and from the grading-scale guide (what
// a number means). This is the procedure you run against a listing.
//
// SOURCING. PSA's own cert-verification page WAS read on 2026-09-22 (in a
// browser: the host refuses automated retrieval) and its buyer guidance is
// now cited where it is used - that verifying a number does not eliminate
// risk, that counterfeiters copy real certification numbers, and that PSA
// does not view items listed online or warrant them. Those statements are
// attributed to PSA and scoped to PSA. NO OTHER GRADER'S POLICY IS
// INFERRED FROM THEM: where this guide has to speak about graders in
// general it speaks about the mechanism (a number resolves to a record)
// and the logical limit of that mechanism, which hold regardless of
// wording. We still do not describe label security features or
// cert-number formats, which we have not verified for any grader.
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
          the listing, and do not rely on a screenshot of a result. For PSA that lookup is{" "}
          <a
            href={GUIDE_SOURCES.psaCert.href}
            rel="noopener noreferrer"
            target="_blank"
            className={GUIDE_LINK_CLASS}
          >
            PSA Cert Verification
          </a>
          . For any other grader, find their equivalent page on their own site rather than through a
          search result or a seller&apos;s link.
        </li>
        <li>
          <strong>Match the returned record to the card in the pictures, field by field</strong> —
          not just the grade. The table below is what to compare.
        </li>
        <li>
          <strong>Use the grader&apos;s own images if that grader publishes any.</strong> Whether a
          given company shows the card it slabbed varies, and we have not verified which do; look at
          what the lookup actually returns rather than assuming an image will be there.
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

      <GH2>PSA says this itself, on the lookup page</GH2>
      <GP>
        This is not our inference. PSA&apos;s own cert-verification page carries a notice stating
        that verifying a certification number on its database{" "}
        <strong>does not eliminate risk</strong>, because — though it describes this as uncommon —
        criminals do attempt to counterfeit PSA grading inserts using real certification numbers
        taken from public sources. The same notice states that PSA does not view items listed on the
        web and does not warrant or guarantee that any such item is genuinely PSA-authenticated, and
        it recommends buying PSA-verified collectibles from trustworthy sources. <Src id="psaCert" />
      </GP>
      <GP>
        Two things follow, and it is worth separating them. First, a clean lookup is necessary and
        not sufficient — the number matching is the floor, not the finish. Second, and this is the
        part people miss: <strong>the failure mode runs in the direction you would not expect.</strong>{" "}
        A copied number returns a <em>real</em> record for a <em>real</em> card. The result looks
        perfect precisely because the number is genuine. So &ldquo;it checked out&rdquo; is not
        evidence against this particular problem.
      </GP>
      <GP>
        <strong>This paragraph is about PSA and only about PSA.</strong> It is PSA&apos;s published
        guidance on PSA&apos;s own page. We have not read an equivalent statement from any other
        grading company and do not extend it to one; if you are checking a slab from a different
        company, read that company&apos;s own guidance rather than assuming this applies.
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
        <li>
          You have thought about where you are buying, not only what. PSA&apos;s own guidance is to
          buy verified collectibles from trustworthy sources, and it names marketplaces it does not
          recommend. <Src id="psaCert" />
        </li>
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

      <SourceList ids={["psaCert"]}>
        <li>
          Read 22 September 2026. PSA&apos;s guidance above is cited for PSA only. We have not
          verified an equivalent published statement from any other grading company, and none is
          implied.
        </li>
      </SourceList>
    </GuideLayout>
  );
}
