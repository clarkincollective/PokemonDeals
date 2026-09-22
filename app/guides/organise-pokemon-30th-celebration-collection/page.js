import Link from "next/link";
import GuideLayout, { GP, GH2, GUL } from "@/components/GuideLayout";
import { Gallery, GuideTable } from "@/components/guides/CardArt";
import { Src, Srcs, SourceList } from "@/components/guides/Src";
import { guideMetadata } from "@/lib/guides";
import { GUIDE_CARDS, GUIDE_SETS, GUIDE_LINK_CLASS } from "@/lib/guideLinks";

const SLUG = "organise-pokemon-30th-celebration-collection";
export const metadata = guideMetadata(SLUG);

// The workflow article: how to structure a 30th Celebration collection.
//
// Careful point of principle: there is no official definition of a
// "master set", and collector conventions genuinely differ on what one
// includes. This page sets out the choices and says they are choices,
// rather than inventing an authoritative definition.

// [group, what it covers, numbering, how to treat it]
const GROUPS = [
  ["Main set", "001/128 to 128/128", "Out of 128", "The base of any collection. Sort by number."],
  ["Above the printed total", "129/128 upwards: illustration rares, special illustration rares, Futuristic rares", "Out of 128, but above it", "Still the main set. Numbers above the total are normal for modern sets."],
  ["Pikachu rares", "023/128 to 052/128, thirty cards", "Out of 128", "A self-contained run inside the main set. The easiest sub-goal to finish."],
  ["Classic Collection", "Reprints of older cards", "Each keeps its ORIGINAL set number", "Filed separately. Not Standard-legal, and easy to confuse with the originals."],
  ["Product promos", "Cards that ship inside a named product", "Separate promo numbering", "Cannot be pulled from packs. One per product."],
];

export default function Page() {
  return (
    <GuideLayout slug={SLUG}>
      <GP>
        <em>30th Celebration</em> is harder to organise than a normal expansion, because it is really several things
        in one box: a main set, a run of thirty Pikachu cards inside it, a group of cards numbered above the printed
        total, a collection of reprints that keep their old numbers, and a set of promos that only exist inside
        products. Sort it as one undifferentiated pile and you will lose track of what you actually have.
      </GP>
      <GP>
        Here is the structure we would use, and the decisions you have to make for yourself.
      </GP>

      <GH2>The five groups</GH2>
      <GuideTable
        head={["Group", "What it covers", "Numbering", "How to treat it"]}
        rows={GROUPS}
        minWidth="50rem"
        caption="The five groups a 30th Celebration collection naturally splits into."
      />
      <GP>
        The one that trips people is the fourth. A Classic Collection card keeps the number it was originally printed
        with, so a 2026 reprint can read 4/102 exactly like the 1999 card. If you file those by number alongside your
        main set, you will end up with a binder that appears to contain cards it does not.{" "}
        <Link href="/guides/pokemon-30th-celebration-classic-collection" className={GUIDE_LINK_CLASS}>
          Our Classic Collection guide
        </Link>{" "}
        covers how to tell them apart.
      </GP>

      <Gallery
        cards={[
          { card: GUIDE_CARDS.c30PikachuRare023, caption: "Main set — Pikachu rare" },
          { card: GUIDE_CARDS.c30MewEx066, caption: "Main set — Pokemon ex" },
          { card: GUIDE_CARDS.c30LaprasIr, caption: "Above 128 — illustration rare" },
          { card: GUIDE_CARDS.c30MewtwoExFuturistic, caption: "Above 128 — Futuristic rare" },
          { card: GUIDE_CARDS.c30ClassicCharizard, caption: "Classic Collection — keeps 4/102" },
          { card: GUIDE_CARDS.c30ClassicLugia, caption: "Classic Collection — keeps 149/147" },
        ]}
        width={150}
        priorityCount={3}
        note="One card from each group, in the order the table sets them out. The two Classic Collection cards at the end keep their original set numbers rather than a number out of 128 — which is why they are filed apart."
      />

      <GH2>Decide what &quot;complete&quot; means before you start</GH2>
      <GP>
        There is no official definition of a master set, and collectors genuinely disagree about what one contains.
        That is not a gap in anyone&apos;s knowledge &mdash; it is a convention, and conventions differ. Rather than
        invent a rule, here are the common positions:
      </GP>
      <GUL>
        <li>
          <strong>The printed set.</strong> 001/128 to 128/128 and nothing else. The cleanest definition, and the
          cheapest.
        </li>
        <li>
          <strong>Everything numbered out of 128.</strong> Including the cards above the printed total &mdash; the
          illustration rares, special illustration rares and Futuristic rares. This is what most people mean by
          &quot;the whole set&quot;.
        </li>
        <li>
          <strong>Everything above plus the Classic Collection.</strong> A much bigger job, and arguably a second
          collection rather than part of the first, since those cards belong to other sets by numbering.
        </li>
        <li>
          <strong>All of that plus the product promos.</strong> The most expensive definition, because each promo
          requires buying its product. It also has no natural end point if more products are announced.
        </li>
      </GUL>
      <GP>
        Pick one and write it down. The common failure is not choosing: people buy towards an undefined target and
        then cannot tell whether they are finished. The same decision applies to any set you collect &mdash;{" "}
        <Link href="/guides/complete-set-vs-master-set" className={GUIDE_LINK_CLASS}>
          complete set vs master set
        </Link>{" "}
        is the general version of it.
      </GP>

      <GH2>A sensible order to collect in</GH2>
      <GUL>
        <li>
          <strong>Start with the thirty Pikachu.</strong> They are consecutive, 023/128 to 052/128, so progress is
          obvious and the finish line is real. Our{" "}
          <Link href="/guides/pokemon-30th-celebration-pikachu-checklist" className={GUIDE_LINK_CLASS}>
            visual checklist
          </Link>{" "}
          is built for exactly this.
        </li>
        <li>
          <strong>Then fill the ordinary main set.</strong> The commons and rares are the least contested part of any
          release and the easiest to complete in bulk.
        </li>
        <li>
          <strong>Then the cards above 128.</strong> These are the ones worth buying deliberately as singles rather
          than chasing through packs.
        </li>
        <li>
          <strong>Treat the Classic Collection as its own project.</strong> Thirty reprints, each keeping a different
          original number, with an identification problem attached.
        </li>
        <li>
          <strong>Add promos last, and only the ones you want.</strong> Each needs its product, which is set out in
          our{" "}
          <Link href="/guides/pokemon-30th-celebration-promo-cards" className={GUIDE_LINK_CLASS}>
            promo-by-product guide
          </Link>
          .
        </li>
      </GUL>

      <GH2>Packs or singles?</GH2>
      <GP>
        For completing a set, singles. This is not really a close call: opening packs gives you a random subset of a
        large set, and completion by chance gets slower the closer you get to finished. Buying the specific cards you
        are missing is the predictable route, and every card we track has its own page with a recent-sold market
        reference.
      </GP>
      <GP>
        Packs are worth buying when opening them is the point &mdash; and in this set there is a decent case for
        that, since every card in a booster pack is foil and every pack contains one of the thirty Pikachu.{" "}
        <Srcs ids={["expansion", "announce"]} /> That is a better opening experience than most sets offer. Just do not
        confuse it with an efficient way to finish a checklist.
      </GP>
      <GP>
        What we will not do is tell you which is the better financial decision. We have no pull-rate data for this
        set, no sold-price study of it, and a view on whether sealed product appreciates would be speculation. Neither
        route is an investment strategy and we are not going to present one as though it were.
      </GP>

      <GH2>Storing it</GH2>
      <GUL>
        <li>
          <strong>Sleeve anything numbered above 128.</strong> That is where the illustration rares, special
          illustration rares and Futuristic rares are, and they are the cards whose condition matters most.
        </li>
        <li>
          <strong>Keep Classic Collection cards physically apart from originals</strong> if you own both. This is the
          single best defence against confusing them later, and against accidentally selling the wrong one.
        </li>
        <li>
          <strong>Record the collector number, not the name</strong>, in whatever list you keep. Several cards in this
          set share a name at different numbers &mdash; Mewtwo ex exists at 064/128 and 157/128, Pikachu ex at four
          different numbers.
        </li>
        <li>
          <strong>Condition is a spectrum, not a label.</strong> If you are considering grading anything, our{" "}
          <Link href="/guides/how-to-check-pokemon-card-condition" className={GUIDE_LINK_CLASS}>
            condition guide
          </Link>{" "}
          covers what to look at first.
        </li>
      </GUL>

      <GH2>Tracking what you have</GH2>
      <GP>
        The{" "}
        <Link href={GUIDE_SETS.thirtiethCelebration.href} className={GUIDE_LINK_CLASS}>
          ME: 30th Celebration set page
        </Link>{" "}
        lists every card we track from the expansion with its recent-sold market reference, which is the quickest way
        to see what a gap will cost before you commit to filling it. Those references come from recent sold data and
        are not guaranteed values.
      </GP>
      <GP>
        One honest limitation: our checklist of this set is not complete. The main set runs past its printed total and
        we do not yet hold every number in that range, which the{" "}
        <Link href="/guides/pokemon-30th-celebration-guide" className={GUIDE_LINK_CLASS}>
          main collector&apos;s guide
        </Link>{" "}
        explains, and the official card gallery is a curated selection rather than a full list.{" "}
        <Src id="gallery" /> The thirty Pikachu are the exception &mdash; that run is complete and verified.
      </GP>

      <SourceList ids={["expansion", "announce", "gallery"]}>
        <li>
          Collector numbers and the card groups are from this site&apos;s own catalogue, checked on 16 September 2026.
          The collecting advice is our own editorial opinion, and the definitions of a &quot;master set&quot; are
          collector conventions rather than official rules.
        </li>
      </SourceList>
    </GuideLayout>
  );
}
