import Link from "next/link";
import GuideLayout, { GP, GH2, GUL } from "@/components/GuideLayout";
import { GuideTable } from "@/components/guides/CardArt";
import { guideMetadata } from "@/lib/guides";
import { GUIDE_LINK_CLASS, GUIDE_SETS } from "@/lib/guideLinks";

const SLUG = "complete-set-vs-master-set";
export const metadata = guideMetadata(SLUG);

// Audit batch 2026-09-22. The honest position is that there is NO single
// official definition of a master set, so this guide helps a reader write
// their own inclusion list rather than handing them ours. The worked
// examples are first-party catalogue facts (Crown Zenith's two set
// records; Prismatic's shared collector number).
export default function Page() {
  return (
    <GuideLayout slug={SLUG}>
      <GP>
        &ldquo;Complete set&rdquo; and &ldquo;master set&rdquo; are collector terms, not official
        ones. Nobody publishes an authoritative definition, and two collectors using the same phrase
        routinely mean different things. That is fine — as long as <em>you</em> have decided which
        one you mean before you start buying against it.
      </GP>

      <GH2>The two starting points</GH2>
      <GP>
        Because there is no official definition, the table below is not a report of what collectors
        do — we have no survey and would not invent one. It is the list of decisions the two terms
        leave open, with the narrow reading and the broad reading of each. Your inclusion list is
        whichever cell you pick in each row.
      </GP>
      <GuideTable
        head={["The decision", "Narrow reading", "Broad reading"]}
        rows={[
          ["What counts at all", "One of each card in the numbered run", "Everything associated with the set"],
          ["Parallels and reverse foils", "Excluded", "Included — one slot per printing"],
          ["Cards numbered past the printed set total", "Excluded", "Included"],
          ["Subsets with their own numbering", "Excluded", "Included"],
          ["Promos tied to the set", "Excluded", "Included — and this is the row people argue about"],
          ["How large the list ends up", "The printed set total", "Larger, by however many the rows above add"],
        ]}
        caption="Neither column is the correct answer, and nothing here says which one anyone else means. Pick a cell per row and write the result down."
      />

      <GH2>Four questions that settle most of it</GH2>
      <GUL>
        <li>
          <strong>Do parallels count as separate cards?</strong> If a printing you already own in
          one form is a card you still need in another, the list grows by however many printings the
          set has. In Prismatic Evolutions that is not a rounding: 101 of the 181 collector numbers
          we hold for it resolve to more than one record. See{" "}
          <Link href="/guides/holo-vs-reverse-holo-pokemon-cards" className={GUIDE_LINK_CLASS}>
            holo vs reverse holo
          </Link>{" "}
          for why they are separate records in the first place.
        </li>
        <li>
          <strong>Are the cards numbered past the set total in?</strong> Several sets we track hold
          records numbered above their own printed total — 161/131 in Prismatic Evolutions, 238/191
          in Surging Sparks, 199/165 in 151. Excluding them changes both the size of the list and
          what other collectors will take your claim to mean.
        </li>
        <li>
          <strong>Do subsets count?</strong> Crown Zenith is the clean example: we hold it as two set
          records, a main set on /159 and a Galarian Gallery on GG numbering, of which the Gallery is
          almost entirely Ultra Rare. Including it is a materially different project —{" "}
          <Link href="/guides/crown-zenith-galarian-gallery-guide" className={GUIDE_LINK_CLASS}>
            the Crown Zenith guide
          </Link>{" "}
          has the numbers.
        </li>
        <li>
          <strong>Do promos count?</strong> Promos attached to a set&apos;s products are where
          definitions diverge most. There is no right answer; there is only your answer, written
          down.
        </li>
      </GUL>

      <GH2>Write the list before you buy</GH2>
      <GP>
        The practical failure mode is not overspending — it is buying for months against a definition
        you never fixed, then discovering the target moved. Before the first purchase, write down:
      </GP>
      <GUL>
        <li>The set, by its exact name.</li>
        <li>Whether parallel printings are in or out.</li>
        <li>Whether cards above the set total are in or out.</li>
        <li>Whether subsets are in or out, named individually.</li>
        <li>Whether promos are in, and if so which ones.</li>
        <li>A condition floor — a set in mixed condition is a different budget from a Near Mint one.</li>
      </GUL>
      <GP>
        Then price the list, not the set. Our{" "}
        <Link href="/guides/how-much-is-my-pokemon-card-worth" className={GUIDE_LINK_CLASS}>
          card-value guide
        </Link>{" "}
        covers reading a reference for one card; a set is that exercise repeated, one line at a
        time. We do not publish a rule of thumb for what a run costs: references differ per card and
        move, and a guess here would be worth less than the five minutes of looking.
      </GP>

      <GH2>One thing to watch when you are buying a run</GH2>
      <GP>
        A collector number does not always identify one card. In Prismatic Evolutions, three separate
        records share <strong>059/131</strong>. If your list says &ldquo;059/131&rdquo; and nothing
        more, you have not specified which of the three you are buying — and if your list is
        parallels-included, you may need all of them. Write the printing into the list too.
      </GP>

      <GH2>A note on our catalogue</GH2>
      <GP>
        The set pages on this site show what <em>we</em> track for a set, and that is not the same as
        an official checklist. We add records as we encounter and verify them. Use our pages to find
        and price cards; use the official set list to decide what a complete run is.
      </GP>

      <GH2>Where to go next</GH2>
      <GUL>
        <li>
          <Link href="/sets" className={GUIDE_LINK_CLASS}>
            Browse sets and checklists
          </Link>{" "}
          — every set with an active listing, one at a time.
        </li>
        <li>
          <Link href={GUIDE_SETS.crownZenith.href} className={GUIDE_LINK_CLASS}>
            Crown Zenith
          </Link>{" "}
          — the subset decision, made concrete.
        </li>
        <li>
          <Link href="/guides/vintage-pokemon-cards-worth-buying" className={GUIDE_LINK_CLASS}>
            Choosing vintage cards
          </Link>{" "}
          — if the run you are planning is an older one.
        </li>
      </GUL>
    </GuideLayout>
  );
}
