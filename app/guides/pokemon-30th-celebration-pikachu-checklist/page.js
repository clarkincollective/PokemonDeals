import Link from "next/link";
import GuideLayout, { GP, GH2, GUL } from "@/components/GuideLayout";
import { Gallery, GuideTable } from "@/components/guides/CardArt";
import { Src, Srcs, SourceList } from "@/components/guides/Src";
import { guideMetadata } from "@/lib/guides";
import { GUIDE_CARDS, GUIDE_SETS, GUIDE_LINK_CLASS } from "@/lib/guideLinks";

const SLUG = "pokemon-30th-celebration-pikachu-checklist";
export const metadata = guideMetadata(SLUG);

// A reference page: all thirty Pikachu rares, in number order, each linked
// to its own catalogue page. Checked 2026-09-16.
//
// "Complete" is claimed for ONE thing only and it is reconciled: the
// official announcement states thirty different Pikachu, and the
// catalogue holds thirty consecutive numbers (023/128-052/128) with no
// gap. The wider set checklist is NOT complete on this site and the page
// says so. No prices, no pull rates, no stock claims - which Pikachu you
// get from a pack is not something this page can or does predict.

const C = GUIDE_CARDS;

// 023/128 - 052/128, in printed order. Thirty entries.
const THIRTY = [
  C.c30PikachuRare023, C.c30PikachuRare024, C.c30PikachuRare025, C.c30PikachuRare026, C.c30PikachuRare027,
  C.c30PikachuRare028, C.c30PikachuRare029, C.c30PikachuRare030, C.c30PikachuRare031, C.c30PikachuRare032,
  C.c30PikachuRare033, C.c30PikachuRare034, C.c30PikachuRare035, C.c30PikachuRare036, C.c30PikachuRare037,
  C.c30PikachuRare038, C.c30PikachuRare039, C.c30PikachuRare040, C.c30PikachuRare041, C.c30PikachuRare042,
  C.c30PikachuRare043, C.c30PikachuRare044, C.c30PikachuRare045, C.c30PikachuRare046, C.c30PikachuRare047,
  C.c30PikachuRare048, C.c30PikachuRare049, C.c30PikachuRare050, C.c30PikachuRare051, C.c30PikachuRare052,
];

// Pikachu cards in the release that are NOT one of the thirty - the single
// most common source of "have I got them all?" confusion.
const NOT_THIRTY = [
  ["Pikachu ex 053/128", "Double Rare", "Main set", "A Pokemon ex, not a Pikachu rare. Two different Pikachu ex share the set."],
  ["Pikachu ex 054/128", "Double Rare", "Main set", "The second Pikachu ex artwork at the same rarity."],
  ["Pikachu ex 149/128", "Special illustration rare", "Main set, above the printed total", "A painted, full-scene version of the ex card."],
  ["Pikachu ex 150/128", "Special illustration rare", "Main set, above the printed total", "The second special illustration rare Pikachu ex."],
  ["Pikachu 58/102", "Classic Collection", "Classic Collection", "A reprint that keeps its original Base Set number, not a card numbered out of 128."],
  ["Pikachu & Zekrom GX 33/181", "Classic Collection", "Classic Collection", "A reprint of the Sun & Moon-Team Up card, keeping its original number."],
];

export default function Page() {
  return (
    <GuideLayout slug={SLUG}>
      <GP>
        Every <em>30th Celebration</em> booster pack contains one of thirty different Pikachu rare cards, each with its
        own illustration. <Srcs ids={["expansion", "announce"]} /> They run from 023/128 to 052/128 in the main set.
        This page shows all thirty in printed order, so you can see at a glance which ones you still need, and each
        card links to its own page on this site.
      </GP>

      <GH2>All thirty Pikachu rares, 023/128 to 052/128</GH2>
      <GP>
        The numbers are consecutive, which makes this the easiest part of the set to track: if you have 023 through
        052 with nothing missing in between, you have the full Pikachu run.
      </GP>
      <Gallery
        cards={THIRTY.map((card) => ({ card }))}
        width={132}
        priorityCount={4}
        note="All thirty Pikachu rares from 30th Celebration, in printed order (023/128 to 052/128). Catalogue scans, complete card faces. Each links to its own card page."
      />

      <GH2>Is this checklist complete?</GH2>
      <GP>
        For the Pikachu rares, yes, and here is the reconciliation rather than an assertion: the official announcement
        states the set contains thirty different Pikachu. <Src id="announce" /> Our catalogue holds thirty of them, at
        thirty consecutive collector numbers from 023/128 to 052/128, with no gap in the run. The count and the
        numbering agree, so nothing is missing from the list above.
      </GP>
      <GP>
        Two things this page does <em>not</em> claim to be complete. First, it covers the Pikachu rares only, not the
        other Pikachu cards in the release (those are in the table below). Second, our checklist of the whole
        expansion is not complete: the main set runs past its printed total of 128 and we do not yet hold every
        number in that range, which the{" "}
        <Link href="/guides/pokemon-30th-celebration-guide" className={GUIDE_LINK_CLASS}>
          main 30th Celebration guide
        </Link>{" "}
        explains. The official card gallery is a curated selection rather than a full list, so it cannot be used to
        close that gap either. <Src id="gallery" />
      </GP>

      <GH2>Pikachu cards that are not one of the thirty</GH2>
      <GP>
        The set contains several other Pikachu cards. They are easy to mistake for part of the run, and none of them
        counts towards it.
      </GP>
      <GuideTable
        head={["Card", "Rarity", "Where it sits", "Why it is not one of the thirty"]}
        rows={NOT_THIRTY}
        minWidth="44rem"
        caption="Pikachu cards in the release that sit outside the thirty Pikachu rares."
      />
      <Gallery
        cards={[
          { card: C.c30PikachuEx053, caption: "Pokemon ex" },
          { card: C.c30PikachuEx054, caption: "Pokemon ex" },
          { card: C.c30PikachuExSir149, caption: "Special illustration rare" },
          { card: C.c30PikachuExSir150, caption: "Special illustration rare" },
          { card: C.c30CcPikachu58102, caption: "Classic Collection reprint" },
          { card: C.c30ClassicPikachuZekromGx, caption: "Classic Collection reprint" },
        ]}
        width={150}
        note="The other Pikachu cards in the release. The two Classic Collection cards keep their original set numbers rather than a number out of 128."
      />

      <GH2>How to tell which one you are holding</GH2>
      <GUL>
        <li>
          <strong>Read the collector number, not the artwork.</strong> Thirty illustrations is a lot to hold in your
          head; the number at the bottom of the card is unambiguous. Our{" "}
          <Link href="/guides/how-to-find-pokemon-card-set-and-number" className={GUIDE_LINK_CLASS}>
            set-and-number guide
          </Link>{" "}
          shows where it is printed.
        </li>
        <li>
          <strong>A number out of 128 is a main-set card.</strong> If the card reads 023/128 through 052/128, it is
          one of the thirty. If it reads 58/102 or 33/181, it is a Classic Collection reprint.
        </li>
        <li>
          <strong>&quot;ex&quot; in the name means it is not one of the thirty.</strong> The Pikachu ex cards are a
          different rarity, whatever their number.
        </li>
        <li>
          <strong>Every card in a booster pack is foil in this set</strong>, so foiling alone does not tell you which
          rarity you are looking at. <Src id="announce" />
        </li>
      </GUL>

      <GH2>Where to go next</GH2>
      <GP>
        The{" "}
        <Link href={GUIDE_SETS.thirtiethCelebration.href} className={GUIDE_LINK_CLASS}>
          ME: 30th Celebration set page
        </Link>{" "}
        lists every card we track from the expansion with its recent-sold market reference, which is the quickest way
        to price up the gaps in your run. Market references are drawn from recent sold data and are not guaranteed
        values. For what the expansion is and how its pieces fit together, start with the{" "}
        <Link href="/guides/pokemon-30th-celebration-guide" className={GUIDE_LINK_CLASS}>
          main collector&apos;s guide
        </Link>
        ; if you are deciding which of the thirty to chase for the artwork rather than for completion, we picked
        favourites in{" "}
        <Link href="/guides/best-pokemon-30th-celebration-pikachu-cards" className={GUIDE_LINK_CLASS}>
          the best Pikachu artwork in the set
        </Link>
        .
      </GP>

      <SourceList ids={["expansion", "gallery", "announce"]}>
        <li>
          Collector numbers, the 023-052 range and the card images are from this site&apos;s own catalogue, checked on
          16 September 2026.
        </li>
      </SourceList>
    </GuideLayout>
  );
}
