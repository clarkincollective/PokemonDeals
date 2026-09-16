import Link from "next/link";
import GuideLayout, { GP, GH2, GUL } from "@/components/GuideLayout";
import { Gallery, GuideTable } from "@/components/guides/CardArt";
import { guideMetadata } from "@/lib/guides";
import { GUIDE_CARDS, PRICE_CHECKER_HREF, GUIDE_LINK_CLASS } from "@/lib/guideLinks";

const SLUG = "how-much-is-my-pokemon-card-worth";
export const metadata = guideMetadata(SLUG);

// The PROCEDURE, not the theory. "How Pokemon Card Prices Are Determined"
// explains why one card has several prices; this page walks someone
// holding a card through the steps that turn it into the right reference
// on this site. Every step points at something the site actually does.
// No price appears on the page: the references live on each card's own
// page, dated and with their condition stated, and they change. Nothing here promises a grade, a
// sale, or a value.

const STEPS = [
  ["1. Collector number", "Bottom corner of the card, e.g. 4/102, 023/128, SWSH196", "Identifies the print run. The same Pokemon exists in dozens of sets; the number plus the set narrows it to one."],
  ["2. Set symbol and name", "Small symbol beside the number; older cards show only a symbol", "Two sets can share a number scheme (4/102 exists in Base Set and in 30th Celebration's Classic Collection). The symbol settles which."],
  ["3. Printing", "1st Edition stamp, Shadowless art frame, holo or non-holo, reverse holo, promo stamp", "Different printings are different products with different references, even at the same name and number."],
  ["4. Language", "The text on the card", "Our references are for English cards. A Japanese card of the same design is a separate product."],
  ["5. Condition, honestly", "Centering, corners, edges, surface", "A reference is labelled by the condition it describes. A played card is not worth the Near Mint figure."],
  ["6. Graded or raw", "A slab with a grader's label, or a loose card", "Graded figures exist only where there are enough recent sales for that exact printing and grade."],
];

export default function Page() {
  return (
    <GuideLayout slug={SLUG}>
      <GP>
        Most &quot;how much is my card worth&quot; answers online are a guess dressed up as a number. This page is the
        procedure instead: the six things to read off the card, in order, and how each one changes which reference
        applies. Do it once properly and you will know exactly which page on this site is pricing the card you are
        actually holding &mdash; rather than a different printing of it.
      </GP>

      <GH2>The short version</GH2>
      <GP>
        Type the name, set or collector number into the{" "}
        <Link href={PRICE_CHECKER_HREF} className={GUIDE_LINK_CLASS}>
          price checker
        </Link>
        , pick the printing that matches yours, and read the reference on that card&apos;s page together with the
        condition it is labelled for. Everything below is about getting that middle step right, because it is where
        people go wrong.
      </GP>

      <GH2>The six things that decide which price applies</GH2>
      <GuideTable
        head={["Read this", "Where it is", "Why it matters"]}
        rows={STEPS}
        minWidth="46rem"
        caption="Six identifiers, in the order to check them. Each one can move a card to a different reference."
      />
      <GP>
        Our{" "}
        <Link href="/guides/how-to-find-pokemon-card-set-and-number" className={GUIDE_LINK_CLASS}>
          set-and-number guide
        </Link>{" "}
        shows exactly where each of these is printed, including the cases that trip people up (Pokedex numbers that
        look like collector numbers, numbers above the printed total).
      </GP>

      <GH2>One card, four prices: why the printing step matters most</GH2>
      <GP>
        The clearest example in the hobby. These are all &quot;Base Set Charizard&quot; to a casual seller, and each
        is a separate card with its own page and its own reference on this site.
      </GP>
      <Gallery
        cards={[
          { card: GUIDE_CARDS.charizardBaseSet, caption: "Base Set (Unlimited), 4/102" },
          { card: GUIDE_CARDS.charizardShadowless, caption: "Base Set (Shadowless), 4/102" },
          { card: GUIDE_CARDS.charizardBaseSet2, caption: "Base Set 2, 4/130" },
          { card: GUIDE_CARDS.charizardEvolutions, caption: "XY Evolutions, 11/108" },
        ]}
        width={150}
        priorityCount={2}
        note="Four printings of the same artwork. Same Pokemon, same picture; four cards, four references. Catalogue scans, complete card faces; each links to its own page."
      />
      <GP>
        The first two share a collector number and differ only in printing details, which is why step 3 exists. If
        yours is a Base Set Charizard, the{" "}
        <Link href="/guides/base-set-shadowless-unlimited-first-edition" className={GUIDE_LINK_CLASS}>
          Base Set printings guide
        </Link>{" "}
        shows how to tell Unlimited, Shadowless and 1st Edition apart from the card face.
      </GP>

      <GH2>What that reference figure actually is</GH2>
      <GUL>
        <li>
          <strong>It is a market reference from recent sold data</strong>, not an offer to buy and not a guaranteed
          sale value. It is dated on the page, and it moves.
        </li>
        <li>
          <strong>It describes one stated condition.</strong> The page says which condition the figure is for. If
          your card is not in that condition, that figure is not your card&apos;s figure. Our{" "}
          <Link href="/guides/how-to-check-pokemon-card-condition" className={GUIDE_LINK_CLASS}>
            condition guide
          </Link>{" "}
          covers how to judge that honestly before you decide.
        </li>
        <li>
          <strong>Asking prices are not sold prices.</strong> A listing at any figure proves only that someone asked
          for it. The reference is built from completed sales for that reason.
        </li>
        <li>
          <strong>Graded rows are conditional.</strong> A card page lists graded tiers only where there are enough
          recent graded sales for that exact printing; where there are not, no tier is shown rather than an invented
          one. The{" "}
          <Link href="/guides/raw-vs-graded-pokemon-cards" className={GUIDE_LINK_CLASS}>
            raw versus graded guide
          </Link>{" "}
          explains what a slab does and does not add.
        </li>
      </GUL>

      <GH2>Common ways this goes wrong</GH2>
      <GUL>
        <li>
          <strong>Pricing the wrong printing.</strong> The most expensive mistake and the most common: reading a
          Shadowless or 1st Edition reference for an Unlimited card, or a 1999 reference for a 2026 anniversary
          reprint that keeps the original number. The number alone never settles it.
        </li>
        <li>
          <strong>Pricing the wrong language.</strong> An English reference does not describe a Japanese card.
        </li>
        <li>
          <strong>Assuming Near Mint.</strong> Most cards that have been handled are not, and the difference between
          conditions is usually larger than the difference between two similar printings.
        </li>
        <li>
          <strong>Treating a rare card as a valuable one.</strong> Rarity symbols describe pull odds within a set, not
          demand. Plenty of rares are worth less than some commons from older sets.
        </li>
        <li>
          <strong>Trusting a listing title.</strong> Sellers write &quot;1st Edition&quot; and &quot;PSA 10
          candidate&quot; freely. Read the card, not the title.
        </li>
      </GUL>

      <GH2>Where to go from here</GH2>
      <GP>
        Once you have the right page, the reference on it is the honest starting point; how it was arrived at is in
        our{" "}
        <Link href="/methodology" className={GUIDE_LINK_CLASS}>
          methodology
        </Link>
        . For why one card can have several prices at all, the{" "}
        <Link href="/guides/how-pokemon-card-prices-work" className={GUIDE_LINK_CLASS}>
          prices guide
        </Link>{" "}
        is the background. And if you are deciding whether to sell, hold or grade, remember that this site does not
        buy cards or guarantee any value &mdash; it tells you what comparable cards have recently sold for, and lets
        you decide.
      </GP>
    </GuideLayout>
  );
}
