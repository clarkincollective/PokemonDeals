import Link from "next/link";
import GuideLayout, { GP, GH2, GUL } from "@/components/GuideLayout";
import GuideFigure from "@/components/guides/GuideFigure";
import GradeScaleTable from "@/components/guides/GradeScaleTable";
import ConditionAxes from "@/components/guides/ConditionAxes";
import { guideMetadata } from "@/lib/guides";

const SLUG = "pokemon-card-grading-scale";
export const metadata = guideMetadata(SLUG);

const FAQ = [
  {
    q: "What is a grade 10 Pokemon card?",
    a: "A card a grading company judged to look flawless to the naked eye — sharp corners, clean edges, an unmarked surface, and near-perfect centering. It is often labelled “Gem Mint”. It is not a guarantee of perfection under magnification.",
  },
  {
    q: "What is a grade 9 Pokemon card?",
    a: "“Mint” — one small flaw on close inspection, such as a faint edge speck, a slightly soft corner, or centering that is a little off. Still a high grade that trades well.",
  },
  {
    q: "What is a grade 8 Pokemon card?",
    a: "Usually “Near Mint–Mint”: a couple of minor issues — light edge wear, a slightly rounded corner, or noticeable centering — but no creasing.",
  },
  {
    q: "What is a grade 7 Pokemon card?",
    a: "“Near Mint”: light wear that is easy to see up close — minor whitening on edges or corners, a small surface scratch, or a card that is clearly off-centre.",
  },
  {
    q: "Is a card's grade the same as its condition?",
    a: "No. “Condition” is the informal Near-Mint-to-Damaged scale a seller assigns to a raw card. A “grade” is a number a third-party company assigns after it inspects and seals the card. People say “rating” for either one.",
  },
  {
    q: "Do PSA, CGC and BGS use the same grading scale?",
    a: "All three run 1–10, but not identically. PSA uses whole numbers with no sub-grades on the label. CGC and BGS use half-point steps and record four sub-grades (centering, corners, edges, surface); CGC has a “Pristine 10” above its standard 10, and BGS has an all-10 “Black Label”. So a “9” is not automatically the same card at each company, and prices differ by company even at the same number.",
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
        A card&apos;s <strong>grade</strong> is a number from 1 to 10 that a third-party company
        assigns after it inspects the card and seals it in a holder. People also call it a
        &ldquo;rating&rdquo;. It is separate from the informal{" "}
        <Link href="/guides/card-condition-grading" className="text-red-600 hover:underline dark:text-red-500">
          Near Mint&ndash;to&ndash;Damaged condition scale
        </Link>{" "}
        a seller uses for a raw card &mdash; that is the seller&apos;s own claim; a grade is the
        company&apos;s.
      </GP>

      <GH2>What each grade means</GH2>
      <GP>
        The names below (Gem Mint, Mint, and so on) are common hobby vocabulary. The exact tolerances
        &mdash; how many microns of edge wear, what centering ratio &mdash; are each grading
        company&apos;s own and are not published in full. Treat this as &ldquo;roughly what the number
        communicates&rdquo;, not a checklist that produces a guaranteed result.
      </GP>
      <GuideFigure caption="A single hard flaw — a crease, a badly dinged corner — caps the grade regardless of how clean the rest of the card is.">
        <GradeScaleTable />
      </GuideFigure>

      <GH2>What usually separates a 7, 8, 9 and 10</GH2>
      <GP>
        It is rarely one thing. Graders weigh four areas together, and the grade tends to track the
        <em> worst</em> of them: a card with three perfect areas and one soft corner is judged on the
        soft corner. Moving from a 7 to a 10 usually means each of these areas gets cleaner, not that
        one problem is fixed.
      </GP>
      <ConditionAxes />
      <GP>
        Centering is the one people most often misjudge on their own cards. A card that looks
        &ldquo;fine&rdquo; in hand can be 65/35 once you measure the borders, and that alone can be the
        difference between a 9 and a 10.
      </GP>

      <GH2>Why the scales are not identical across companies</GH2>
      <GUL>
        <li>
          <strong>PSA</strong> uses whole numbers 1&ndash;10 (with a rarely-used 1.5). No sub-grades
          on the label.
        </li>
        <li>
          <strong>CGC</strong> uses 1&ndash;10 in half-point steps, records four sub-grades, and has a
          distinct &ldquo;Pristine 10&rdquo; above the standard &ldquo;Gem Mint 10&rdquo;.
        </li>
        <li>
          <strong>BGS (Beckett)</strong> uses 1&ndash;10 in half-point steps with four sub-grades on
          every label; an all-10 &ldquo;Black Label&rdquo; is the rarest outcome and BGS 9.5 is the
          common high grade.
        </li>
        <li>
          <strong>SGC, ACE, TAG</strong> also use 1&ndash;10; TAG grades by computer vision to one
          decimal place.
        </li>
      </GUL>
      <GP>
        Because the criteria and the label differ, the same card can come back a 9 at one company and
        an 8 or a 10 at another, and the market pays different amounts for each &mdash; usually the
        most for PSA at the top end for Pokemon. When you compare graded prices, compare the same
        company and the same number. A fuller company-by-company overview is on the{" "}
        <Link href="/guides/card-condition-grading" className="text-red-600 hover:underline dark:text-red-500">
          condition &amp; grading guide
        </Link>
        .
      </GP>

      <GH2>The grading company makes the final call</GH2>
      <GP>
        Nothing you can see at home guarantees a number. Graders use magnification, controlled
        lighting and measurement, weigh the four areas differently from each other, and can disagree
        &mdash; which is why the same card is sometimes re-submitted for a higher grade. If you want to
        form a realistic expectation before you pay for grading, work through{" "}
        <Link href="/guides/how-to-check-pokemon-card-condition" className="text-red-600 hover:underline dark:text-red-500">
          how to check a card&apos;s condition
        </Link>{" "}
        first.
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
          <Link href="/guides/card-condition-grading" className="text-red-600 hover:underline dark:text-red-500">
            Pokemon card condition &amp; grading explained
          </Link>{" "}
          &mdash; the raw condition scale and every grading company in one place.
        </li>
        <li>
          <Link href="/guides/how-to-check-pokemon-card-condition" className="text-red-600 hover:underline dark:text-red-500">
            How to check a Pokemon card&apos;s condition
          </Link>{" "}
          &mdash; the hands-on inspection before you buy or submit.
        </li>
        <li>
          <Link href="/guides/raw-vs-graded-pokemon-cards" className="text-red-600 hover:underline dark:text-red-500">
            Raw vs. graded Pokemon cards
          </Link>{" "}
          &mdash; when a grade is worth paying for, and when it is not.
        </li>
        <li>
          Compare grades in the market: browse current{" "}
          <Link href="/deals/graded" className="text-red-600 hover:underline dark:text-red-500">
            graded deals
          </Link>
          , or look up any card&apos;s raw and graded value by{" "}
          <Link href="/pokemon" className="text-red-600 hover:underline dark:text-red-500">
            Pokemon
          </Link>
          .
        </li>
      </GUL>
    </GuideLayout>
  );
}
