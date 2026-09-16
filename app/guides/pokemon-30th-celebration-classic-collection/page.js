import Link from "next/link";
import GuideLayout, { GP, GH2, GUL } from "@/components/GuideLayout";
import { Gallery, GuideTable } from "@/components/guides/CardArt";
import { Src, Srcs, SourceList } from "@/components/guides/Src";
import { guideMetadata } from "@/lib/guides";
import { GUIDE_CARDS, GUIDE_SETS, GUIDE_LINK_CLASS } from "@/lib/guideLinks";

const SLUG = "pokemon-30th-celebration-classic-collection";
export const metadata = guideMetadata(SLUG);

// The reprint-versus-original question, which is the single most expensive
// mistake available in this release: a Classic Collection card keeps its
// ORIGINAL set number, so a 2026 reprint and a 1999 card can both read
// "4/102".
//
// Honesty constraint that shapes this page: The Pokemon Company has NOT
// published a checklist naming all thirty Classic Collection cards. The
// thirty below are the thirty our catalogue holds. That is stated as what
// it is, and the page never calls the list officially confirmed.

const C = GUIDE_CARDS;

// The thirty the catalogue holds, alphabetical, with the number each card
// keeps. Card names and numbers are exactly as the catalogue records them.
//
// There is deliberately NO "originally from" column. Several of these
// numbers are ambiguous across eras (5/109, 19/109 and 25/111 each match
// more than one historical set) and Pokemon has published no checklist to
// resolve them, so an original-set column would be our guess presented as
// fact. The number a card keeps is verifiable; where it came from, in some
// cases, is not.
const CLASSIC = [
  ["Arceus VSTAR", "123/172"],
  ["Buzzwole GX", "57/111"],
  ["Charizard", "4/102"],
  ["Crobat G", "47/127"],
  ["Dark Tyranitar", "19/109"],
  ["Darkrai & Cresselia Legend (Bottom)", "100/102"],
  ["Darkrai & Cresselia Legend (Top)", "99/102"],
  ["Delcatty", "5/109"],
  ["Erika's Jigglypuff", "69/132"],
  ["Genesect EX (Team Plasma)", "11/101"],
  ["Gengar (Prime)", "94/102"],
  ["Greninja BREAK", "41/122"],
  ["Lugia", "149/147"],
  ["M Gardevoir EX", "106/160"],
  ["Magikarp", "203/193"],
  ["Metagross (Delta Species)", "11/113"],
  ["Mew VMAX", "114/264"],
  ["Misty", "18/132"],
  ["N", "101/101"],
  ["Palkia LV.X", "106/106"],
  ["Pikachu", "58/102"],
  ["Pikachu & Zekrom GX", "33/181"],
  ["Raikou", "050/185"],
  ["Rayquaza EX", "85/124"],
  ["Scizor ex", "108/115"],
  ["Shining Celebi", "106/105"],
  ["Sneasel", "25/111"],
  ["Solgaleo GX", "89/149"],
  ["Uxie", "43/146"],
  ["Zacian V", "138/202"],
];

export default function Page() {
  return (
    <GuideLayout slug={SLUG}>
      <GP>
        The Classic Collection is the part of <em>30th Celebration</em> that reprints cards from the game&apos;s past
        with a new foil treatment. The official pages name Charizard from Base Set and Pikachu &amp; Zekrom-GX from
        Sun &amp; Moon&mdash;Team Up as examples, and state that these reprints are not legal in the Standard format.{" "}
        <Srcs ids={["expansion", "announce"]} />
      </GP>
      <GP>
        The detail that costs people money: a Classic Collection card{" "}
        <strong>keeps its original set number</strong> rather than taking a number in this set. A 2026 anniversary
        reprint of Base Set Charizard reads <strong>4/102</strong>, exactly like the 1999 card. That is the whole
        problem this page exists to solve.
      </GP>

      <GH2>Reprint or original: how to tell them apart</GH2>
      <GP>
        Work down this list in order. The first two settle almost every case on their own.
      </GP>
      <GUL>
        <li>
          <strong>Look for the 30th Anniversary logo on the card face.</strong> The Classic Collection cards carry an
          anniversary marking the original printings do not have. This is the quickest single check, and it is the one
          to insist on seeing in a listing photograph.
        </li>
        <li>
          <strong>Check the copyright line at the bottom.</strong> An original card carries the date it was actually
          printed. A 2026 reprint does not carry a 1999 copyright line.
        </li>
        <li>
          <strong>Look at the foil.</strong> These reprints have a new foil treatment applied to them, so a card that
          looks glossier or more uniformly foiled than you expect from the original era is the reprint, not a
          well-kept vintage copy.
        </li>
        <li>
          <strong>Do not use the number, the name or the artwork.</strong> All three are shared by design. The number
          is the trap, not the test.
        </li>
        <li>
          <strong>Do not use the price.</strong> A cheap &quot;4/102 Charizard&quot; is not evidence of anything on
          its own, in either direction.
        </li>
      </GUL>
      <GP>
        Our{" "}
        <Link href="/guides/how-to-find-pokemon-card-set-and-number" className={GUIDE_LINK_CLASS}>
          set-and-number guide
        </Link>{" "}
        shows where the number, the set symbol and the copyright line are printed. If you are weighing up a vintage
        purchase specifically, the{" "}
        <Link href="/guides/vintage-vs-modern-pokemon-cards" className={GUIDE_LINK_CLASS}>
          vintage versus modern guide
        </Link>{" "}
        covers what changes the risk.
      </GP>

      <GH2>The same number, two different cards</GH2>
      <Gallery
        cards={[
          { card: C.c30ClassicCharizard, caption: "2026 reprint — Classic Collection" },
          { card: C.charizardBaseSet, caption: "1999 original — Base Set" },
        ]}
        width={168}
        priorityCount={2}
        note="Both cards are numbered 4/102 and both are called Charizard. They are different products with different prices, and each has its own page on this site."
      />
      <GP>
        These two are not interchangeable and we never treat them as the same card: the{" "}
        <Link href={GUIDE_CARDS.c30ClassicCharizard.href} className={GUIDE_LINK_CLASS}>
          Classic Collection Charizard
        </Link>{" "}
        and the{" "}
        <Link href={GUIDE_CARDS.charizardBaseSet.href} className={GUIDE_LINK_CLASS}>
          1999 Base Set Charizard
        </Link>{" "}
        each have their own page and their own market reference. If a listing is ambiguous, it is a listing to walk
        away from rather than to guess at.
      </GP>

      <GH2>The thirty cards we hold</GH2>
      <GP>
        A necessary caveat before the list. The Pokemon Company has not published an official checklist naming every
        Classic Collection card; the official gallery is a curated selection rather than a full list.{" "}
        <Src id="gallery" /> The thirty below are the thirty Classic Collection cards in our catalogue as at 16
        September 2026, with the set each one originally came from. Treat it as an accurate record of what we track,
        not as an officially confirmed checklist &mdash; if Pokemon publishes one and it differs, the official list
        wins.
      </GP>
      <GuideTable
        head={["Card", "Number it keeps"]}
        rows={CLASSIC}
        minWidth="26rem"
        caption="Classic Collection cards in our catalogue, 16 September 2026. Each keeps its original set number."
      />
      <GP>
        We have not added an &quot;originally from&quot; column, and the reason is worth stating. Some of these
        numbers match more than one historical set &mdash; 5/109, 19/109 and 25/111 each appear in different eras
        &mdash; and with no official checklist to settle them, that column would be our guess dressed up as a fact.
        The number a card keeps is checkable; where every one of them came from, right now, is not.
      </GP>
      <Gallery
        cards={[
          { card: C.c30ClassicCharizard, caption: "Base Set" },
          { card: C.c30ClassicPikachuZekromGx, caption: "Sun & Moon Team Up" },
          { card: C.c30ClassicLugia, caption: "Aquapolis" },
          { card: C.c30ClassicMagikarp, caption: "Evolving Skies" },
          { card: C.c30ClassicGengarPrime, caption: "HGSS Triumphant" },
          { card: C.c30ClassicRayquazaEx, caption: "Dragons Exalted" },
        ]}
        width={150}
        note="Six of the thirty Classic Collection cards, each keeping its original collector number. Catalogue scans, complete card faces."
      />

      <GH2>Where the Classic Collection cards come from</GH2>
      <GP>
        The official expansion page describes Classic Collection cards as cards you can encounter in{" "}
        <em>30th Celebration</em> booster packs. <Src id="expansion" /> Separately, the product showcase lists a
        dedicated &quot;30th Celebration Classic Collection booster pack&quot; inside the Day &amp; Night
        Ultra-Premium Collection, due in November 2026. <Src id="showcase" /> Both are official; they describe
        different things, and we have not seen an official statement of how often a Classic Collection card appears in
        a standard pack. We are not going to estimate one.
      </GP>
      <GP>
        On this site the Classic Collection is filed as its own set, which is why its cards do not appear in the main{" "}
        <Link href={GUIDE_SETS.thirtiethCelebration.href} className={GUIDE_LINK_CLASS}>
          ME: 30th Celebration set page
        </Link>{" "}
        listing. Each Classic Collection card links to its own page from the table above and the gallery.
      </GP>

      <GH2>Does a reprint devalue the original?</GH2>
      <GP>
        We do not know, and nor does anyone else this early. What we can say plainly is what the two cards are: a
        reprint is a 2026 card and an original is a card from its own era, and they are priced separately because they
        are separate products. Anyone telling you with confidence which way an anniversary reprint moves the original
        is guessing. We would rather say so than put a number on it.
      </GP>
      <GP>
        For the wider picture of the release &mdash; the main set, the Pikachu rares, the new Futuristic rarity and
        the full product list &mdash; start with the{" "}
        <Link href="/guides/pokemon-30th-celebration-guide" className={GUIDE_LINK_CLASS}>
          main 30th Celebration guide
        </Link>
        .
      </GP>

      <SourceList ids={["expansion", "announce", "showcase", "gallery"]}>
        <li>
          The thirty-card table, the collector numbers and the card images are from this site&apos;s own catalogue,
          checked on 16 September 2026. Pokemon has not published an official Classic Collection checklist, so the
          list is ours and is not presented as official.
        </li>
      </SourceList>
    </GuideLayout>
  );
}
