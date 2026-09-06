import Link from "next/link";
import GuideLayout, { GP, GH2, GUL } from "@/components/GuideLayout";
import GuideFigure from "@/components/guides/GuideFigure";
import ConditionScale from "@/components/guides/ConditionScale";
import { guideMetadata } from "@/lib/guides";

const SLUG = "card-condition-grading";
export const metadata = guideMetadata(SLUG);

// Q&A restated from the body above - every answer is a condensed version
// of a claim already made and sourced on this page, so the visible list
// and the FAQPage structured data below match (Google's requirement).
const FAQ = [
  {
    q: "What do Pokemon card condition grades mean?",
    a: "“Condition” is an informal description of a raw (un-slabbed) card’s wear, assigned by the seller on a five-step scale from Near Mint to Damaged. A “grade” is different: a number assigned by a third-party company after it inspects and seals the card. Both affect price.",
  },
  {
    q: "What is Near Mint (NM) condition?",
    a: "A card that looks essentially unplayed, with at most tiny, hard-to-see imperfections — a very slight edge nick or a minor surface flaw visible only under angled light.",
  },
  {
    q: "What is Lightly Played (LP) condition?",
    a: "Minor wear that is visible on close inspection: light edge whitening, small scratches, or one soft corner. Still an attractive card.",
  },
  {
    q: "What is Moderately Played (MP) condition?",
    a: "Obvious wear — noticeable whitening, scratches, light creasing, or minor border wear — but the card is structurally sound and not defaced.",
  },
  {
    q: "What is Heavily Played (HP) condition?",
    a: "Major wear: heavy whitening, creasing, scratching, water damage, or writing on the card. Clearly a well-used card.",
  },
  {
    q: "What is Damaged (DMG) condition?",
    a: "Significant damage such as tears, large creases, bends, holes, or heavy water damage.",
  },
  {
    q: "What is the difference between raw and graded Pokemon cards?",
    a: "A raw card is un-slabbed; its condition is the seller’s own claim, so verify it against the photos. A graded card has been authenticated, assigned a numeric grade, and sealed in a tamper-evident holder by a company such as PSA or CGC — the grade is theirs, not the seller’s, so graded cards trade in their own market.",
  },
  {
    q: "What do PSA, CGC and BGS grades mean?",
    a: "PSA uses a 1–10 whole-number scale (PSA 10 is “Gem Mint”, PSA 9 is “Mint”) with no sub-grades on the label. CGC uses 1–10 in half-point steps with a distinct “Pristine 10” above the standard “Gem Mint 10” and records four sub-grades. BGS (Beckett) uses 1–10 in half-point steps with four sub-grades on every label; BGS 9.5 is the common high grade and an all-10 “Black Label” is the rarest.",
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
        &ldquo;Condition&rdquo; and &ldquo;grade&rdquo; are two different things. Condition is an
        informal description of a raw (un-slabbed) card&apos;s wear. A grade is a number assigned by a
        third-party company after they&apos;ve inspected and sealed the card. Both affect price, and
        the words get used loosely, so it&apos;s worth being precise.
      </GP>

      <GH2>Raw card condition</GH2>
      <GP>
        Most marketplaces and price guides (including TCGPlayer, which underlies a lot of Pokemon
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
        cards trade in their own market. The main companies you&apos;ll see in Pokemon listings:
      </GP>
      <GUL>
        <li>
          <strong>PSA.</strong> The most common for Pokemon by volume. A single 1–10 whole-number
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
        same price, and the market usually pays the most for PSA at the top end for Pokemon. When you
        compare graded prices, compare like for like: same company, same grade. On this site, graded
        listings are only ever priced against real sold records for that exact company and grade.
      </GP>
      <GP>
        For what the <em>number</em> itself communicates — what a 7, 8, 9 or 10 means, and what
        usually separates them — see{" "}
        <Link href="/guides/pokemon-card-grading-scale" className="text-red-600 hover:underline dark:text-red-500">
          the grading scale, 1 to 10
        </Link>
        . To judge a raw card before you buy it or send it in, see{" "}
        <Link href="/guides/how-to-check-pokemon-card-condition" className="text-red-600 hover:underline dark:text-red-500">
          how to check a card&apos;s condition
        </Link>
        .
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
          — what each grade number means and what separates a 7, 8, 9 and 10.
        </li>
        <li>
          <Link href="/guides/how-to-check-pokemon-card-condition" className="text-red-600 hover:underline dark:text-red-500">
            How to check a Pokemon card&apos;s condition
          </Link>{" "}
          — the hands-on inspection: centering, corners, edges, surface, and what to photograph.
        </li>
        <li>
          <Link href="/guides/raw-vs-graded-pokemon-cards" className="text-red-600 hover:underline dark:text-red-500">
            Raw vs. graded Pokemon cards
          </Link>{" "}
          — why the same card costs several times more in a slab, and when grading is worth it.
        </li>
        <li>
          <Link href="/guides/how-pokemon-card-prices-work" className="text-red-600 hover:underline dark:text-red-500">
            How Pokemon card prices are determined
          </Link>{" "}
          — how condition, grade, edition and printing split one card into many prices.
        </li>
        <li>
          Look up any card&apos;s raw and graded value:{" "}
          <Link href="/pokemon" className="text-red-600 hover:underline dark:text-red-500">
            browse by Pokemon
          </Link>
          , or check current{" "}
          <Link href="/?type=graded" className="text-red-600 hover:underline dark:text-red-500">
            graded deals
          </Link>
          .
        </li>
      </GUL>
    </GuideLayout>
  );
}
