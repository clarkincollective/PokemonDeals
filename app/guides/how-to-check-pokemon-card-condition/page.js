import Link from "next/link";
import GuideLayout, { GP, GH2, GUL } from "@/components/GuideLayout";
import GuideFigure from "@/components/guides/GuideFigure";
import ConditionAxes from "@/components/guides/ConditionAxes";
import ConditionScale from "@/components/guides/ConditionScale";
import { guideMetadata } from "@/lib/guides";

const SLUG = "how-to-check-pokemon-card-condition";
export const metadata = guideMetadata(SLUG);

const FAQ = [
  {
    q: "How do I check a Pokemon card's condition?",
    a: "Under one bright, diffuse light on a dark surface, look at four things in turn — centering, corners, edges and surface — using magnification (a loupe or your phone's zoom). Then flex the card gently to check for creases. Judge the card by its worst area, and photograph each flaw.",
  },
  {
    q: "Can I tell what grade a card will get before I send it?",
    a: "You can form a realistic expectation, but not a guarantee. Grading companies use controlled lighting, measurement and magnification, weigh the four areas differently, and sometimes disagree with each other. Treat your own check as a floor, not a promise.",
  },
  {
    q: "What do I need to check a card's condition?",
    a: "A single bright, diffuse light source, a dark clean surface, and something to magnify with — a cheap jeweller's loupe, or the macro/zoom on a phone camera. A penny sleeve to hold the card by keeps fingerprints off the surface.",
  },
  {
    q: "What is the difference between checking condition and getting a card graded?",
    a: "Checking condition is what you do by hand to decide what a raw card is worth or whether to submit it. Grading is a paid third-party service that authenticates the card, assigns a 1–10 number, and seals it. Your check informs the decision; the grader makes the call.",
  },
];

const faqJsonLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: FAQ.map((f) => ({
    "@type": "Question",
    name: f.q,
    acceptedAnswer: { "@type": "Answer", text: f.a },
  })),
};

export default function Page() {
  return (
    <GuideLayout slug={SLUG}>
      <GP>
        Checking a card&apos;s condition yourself is worth doing in two situations: before you buy a
        raw card (so the price you pay matches what the card actually is), and before you pay to have
        one graded (so you are not spending a submission fee on a card that comes back a 7). It will
        not tell you the grade &mdash; the{" "}
        <Link href="/guides/pokemon-card-grading-scale" className="text-red-600 hover:underline dark:text-red-500">
          grading company decides that
        </Link>{" "}
        &mdash; but a careful look gets you close.
      </GP>

      <GH2>Set up</GH2>
      <GUL>
        <li>
          <strong>One light, diffuse.</strong> A window in daylight or a single lamp with a shade.
          Avoid direct overhead light and multiple sources &mdash; you want to be able to tilt the
          card and see how the light moves across the surface.
        </li>
        <li>
          <strong>A dark, clean surface.</strong> Whitening on edges and corners is far easier to see
          against black than against a table.
        </li>
        <li>
          <strong>Something to magnify with.</strong> A cheap jeweller&apos;s loupe (10x is plenty),
          or the macro / zoom mode on a phone camera. Most corner and edge issues are invisible at
          arm&apos;s length.
        </li>
        <li>
          <strong>Handle by the edges.</strong> Slide the card into a penny sleeve and hold that, so
          you are not adding fingerprints to the surface while you inspect it.
        </li>
      </GUL>

      <GH2>The four things to check</GH2>
      <GP>
        These are the same areas a grader looks at. Go through them one at a time &mdash; it is easy
        to fixate on a nice holo and miss a soft corner.
      </GP>
      <ConditionAxes />

      <GH2>A quick order to work in</GH2>
      <GUL>
        <li>
          <strong>Centering.</strong> Look at the border on all four sides, front then back. If one
          side&apos;s border is clearly wider than the opposite side, note it &mdash; roughly, and as
          a ratio if you can (e.g. &ldquo;60/40 left-right&rdquo;).
        </li>
        <li>
          <strong>Corners.</strong> Each of the four, front and back, under the loupe and against the
          light. One frayed tip matters.
        </li>
        <li>
          <strong>Edges.</strong> Run your eye along the whole perimeter, front and back, for the pale
          chipped line and for any nick or rough patch.
        </li>
        <li>
          <strong>Surface.</strong> Tilt the card slowly under the light. Watch for scratches, scuffs,
          print lines or dots, indentations, and &mdash; on holo cards &mdash; cloudiness or scratching
          in the foil.
        </li>
        <li>
          <strong>Creases.</strong> Hold the card edge-on to the light, or flex it very gently. A
          crease shows as a line and is a hard ceiling on condition even when faint.
        </li>
      </GUL>

      <GH2>Turn it into a condition</GH2>
      <GP>
        Match what you found to the raw scale sellers and price guides use. Judge by the worst thing
        you saw, not the average.
      </GP>
      <GuideFigure caption="The drop between tiers is largest for scarce vintage cards; for a common modern card the difference between LP and MP may be small.">
        <ConditionScale />
      </GuideFigure>
      <GUL>
        <li><strong>Near Mint</strong> &mdash; nothing you can see without the loupe; maybe one tiny thing with it.</li>
        <li><strong>Lightly Played</strong> &mdash; light edge whitening, one soft corner, a small scratch.</li>
        <li><strong>Moderately Played</strong> &mdash; obvious whitening or scratching, or a light crease; still sound.</li>
        <li><strong>Heavily Played</strong> &mdash; heavy whitening, creasing, scuffing, or writing.</li>
        <li><strong>Damaged</strong> &mdash; tears, big creases, bends, holes, water damage.</li>
      </GUL>
      <GP>
        The gap between Near Mint and Lightly Played prices is usually large, so a listing called
        &ldquo;NM&rdquo; whose photos show edge wear is not the deal the price implies. This site
        reads the stated condition out of a listing and prices the card against{" "}
        <em>that</em>, not a blanket Near Mint assumption &mdash; see the{" "}
        <Link href="/methodology" className="text-red-600 hover:underline dark:text-red-500">
          methodology
        </Link>
        . To check a specific card&apos;s raw and graded values, look it up by{" "}
        <Link href="/pokemon" className="text-red-600 hover:underline dark:text-red-500">
          Pokemon
        </Link>{" "}
        or in the{" "}
        <Link href="/cards" className="text-red-600 hover:underline dark:text-red-500">
          card database
        </Link>
        .
      </GP>

      <GH2>What to photograph</GH2>
      <GP>
        Whether you are listing the card or asking a seller for more detail, these are the shots that
        actually show condition:
      </GP>
      <GUL>
        <li>Full front and full back, straight on, filling the frame.</li>
        <li>Each corner close up.</li>
        <li>The surface at an angle so the light rakes across it and reveals scratches.</li>
        <li>Any specific flaw close up, with an edge or a fingertip in shot for scale.</li>
      </GUL>
      <GP>
        If a listing does not show these, treat its stated condition as unverified rather than wrong
        &mdash; and price it as the photos support, not as the title claims.
      </GP>

      <GH2>The grader still decides</GH2>
      <GP>
        A thorough check tells you what is likely, not what will happen. Two graders can look at the
        same card and disagree, and a card can grade lower than a careful owner expected because of
        something &mdash; centering, a faint surface line &mdash; that is easy to under-weight on your
        own card. Use your inspection to decide whether grading is worth the fee, not to bank on a
        particular number. On when a grade pays for itself, see{" "}
        <Link href="/guides/raw-vs-graded-pokemon-cards" className="text-red-600 hover:underline dark:text-red-500">
          raw vs. graded
        </Link>
        .
      </GP>

      <GH2>Common questions</GH2>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }} />
      <div className="mt-3 divide-y divide-zinc-200 dark:divide-zinc-800">
        {FAQ.map((f) => (
          <div key={f.q} className="py-4">
            <h3 className="text-sm font-bold text-black dark:text-zinc-50">{f.q}</h3>
            <p className="mt-1.5 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">{f.a}</p>
          </div>
        ))}
      </div>

      <GH2>Keep reading</GH2>
      <GUL>
        <li>
          <Link href="/guides/pokemon-card-grading-scale" className="text-red-600 hover:underline dark:text-red-500">
            The Pokemon card grading scale, 1 to 10
          </Link>{" "}
          &mdash; what each number means once a company has graded the card.
        </li>
        <li>
          <Link href="/guides/card-condition-grading" className="text-red-600 hover:underline dark:text-red-500">
            Pokemon card condition &amp; grading explained
          </Link>{" "}
          &mdash; the condition scale and the grading companies in one place.
        </li>
        <li>
          <Link href="/guides/raw-vs-graded-pokemon-cards" className="text-red-600 hover:underline dark:text-red-500">
            Raw vs. graded Pokemon cards
          </Link>{" "}
          &mdash; whether to send the card at all.
        </li>
      </GUL>
    </GuideLayout>
  );
}
