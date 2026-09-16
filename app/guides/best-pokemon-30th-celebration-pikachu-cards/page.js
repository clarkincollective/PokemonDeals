import Link from "next/link";
import GuideLayout, { GP, GH2, GUL } from "@/components/GuideLayout";
import { Gallery } from "@/components/guides/CardArt";
import { Src, Srcs, SourceList } from "@/components/guides/Src";
import { guideMetadata } from "@/lib/guides";
import { GUIDE_CARDS, GUIDE_SETS, GUIDE_LINK_CLASS } from "@/lib/guideLinks";

const SLUG = "best-pokemon-30th-celebration-pikachu-cards";
export const metadata = guideMetadata(SLUG);

// An EDITORIAL selection, labelled as one, with its criteria stated up
// front. It is explicitly not a value ranking, a rarity ranking or a
// popularity measurement - we have no sales data that would support any of
// those, and the page says so rather than implying otherwise.
//
// The commentary describes what is visibly in each illustration. That is
// original analysis of the card face, which is checkable by looking at the
// card. No illustrator is named unless an official page names them, and
// the official gallery credits none, so none are named here.

const C = GUIDE_CARDS;

export default function Page() {
  return (
    <GuideLayout slug={SLUG}>
      <GP>
        <em>30th Celebration</em> puts one of thirty different Pikachu rare cards in every booster pack, each with its
        own illustration. <Srcs ids={["expansion", "announce"]} /> Thirty is a lot to judge at once, so these are the
        six we would most want in a binder, and why. If you want the full run rather than our opinion, the{" "}
        <Link href="/guides/pokemon-30th-celebration-pikachu-checklist" className={GUIDE_LINK_CLASS}>
          visual checklist of all thirty
        </Link>{" "}
        shows every card in number order.
      </GP>

      <GH2>How we picked</GH2>
      <GP>
        This is our editorial selection, not a measurement. We have no pull-rate data, no sold-price study and no
        popularity survey for this set, and we are not going to invent any of the three. What we can do is look
        carefully at thirty card faces and say which ones work hardest as pictures. Three things decided it:
      </GP>
      <GUL>
        <li>
          <strong>Does the illustration tell you something?</strong> A Pikachu doing something specific, in a place,
          beats a Pikachu posed against a background.
        </li>
        <li>
          <strong>Does it use the whole card?</strong> The strongest entries in the run treat the frame as a scene
          rather than a portrait window.
        </li>
        <li>
          <strong>Does it still read at a glance?</strong> Cards that stay legible in a binder page, rather than
          dissolving into detail at arm&apos;s length.
        </li>
      </GUL>
      <GP>
        None of that is a claim about what any card is worth or how hard it is to find. Values move, and a card being
        beautiful is not the same as it being scarce.
      </GP>

      <GH2>Our six picks</GH2>
      <Gallery
        cards={[
          { card: C.c30PikachuRare023, caption: "Opens the run" },
          { card: C.c30PikachuRare036, caption: "Scene over portrait" },
          { card: C.c30PikachuRare040, caption: "Strong silhouette" },
          { card: C.c30PikachuRare047, caption: "Quiet composition" },
          { card: C.c30PikachuRare049, caption: "Reads at a glance" },
          { card: C.c30PikachuRare052, caption: "Closes the run" },
        ]}
        width={150}
        priorityCount={3}
        note="Our editorial picks from the thirty Pikachu rares. Catalogue scans, complete card faces; each links to its own card page. Picked for the illustration, not for value or scarcity."
      />
      <GP>
        The two that bookend the run, <strong>023/128</strong> and <strong>052/128</strong>, are worth owning together
        for a reason that has nothing to do with rarity: they mark the start and end of the sequence, and a binder
        page that opens and closes on them reads as a set rather than a pile. <strong>036/128</strong> and{" "}
        <strong>040/128</strong> are the two we would hang on a wall &mdash; both commit to a full scene and give
        Pikachu something to do in it. <strong>047/128</strong> is the calmest card in the run and benefits from it;{" "}
        <strong>049/128</strong> is the one that survives being seen from across a room.
      </GP>
      <GP>
        Your six will probably not be our six, and that is rather the point of thirty illustrations. The useful thing
        is having all thirty in front of you before you choose.
      </GP>

      <GH2>The Pikachu cards outside the thirty</GH2>
      <GP>
        If you are picking on artwork alone, do not stop at the rares. The set also holds two Pikachu ex and two
        special illustration rare Pikachu ex, and the special illustration rares are the painted, full-scene versions
        of the ex cards &mdash; a different kind of picture from anything in the thirty.
      </GP>
      <Gallery
        cards={[
          { card: C.c30PikachuExSir149, caption: "Special illustration rare" },
          { card: C.c30PikachuExSir150, caption: "Special illustration rare" },
        ]}
        width={168}
        note="The two special illustration rare Pikachu ex, numbered above the set's printed total of 128."
      />
      <GP>
        The{" "}
        <Link href="/guides/pokemon-30th-celebration-pikachu-checklist" className={GUIDE_LINK_CLASS}>
          Pikachu checklist
        </Link>{" "}
        sets out exactly which Pikachu cards do and do not count towards the run of thirty, including the two Classic
        Collection reprints that keep their original set numbers.
      </GP>

      <GH2>Buying a specific one</GH2>
      <GP>
        Because every one of the thirty is a separate card with its own page, you can go straight to the one you want
        rather than opening packs and hoping. Each card above links to its own page, and the{" "}
        <Link href={GUIDE_SETS.thirtiethCelebration.href} className={GUIDE_LINK_CLASS}>
          ME: 30th Celebration set page
        </Link>{" "}
        lists everything we track from the expansion together. Market references there are recent-sold references, not
        guaranteed values, and a listing being on the page is not a claim that it is a good deal &mdash; check the
        photographs and the description before you buy. If the exact card is not showing a listing right now, that
        only means our latest scan did not find an eligible one.
      </GP>
      <GP>
        One practical warning that applies to all thirty: every card in a booster pack in this set is foil,
        including the Basic Energy. <Src id="announce" /> Foiling on its own tells you nothing about which rarity a
        listing is showing you, so read the collector number.
      </GP>

      <SourceList ids={["expansion", "announce", "gallery"]}>
        <li>
          The card images and collector numbers are from this site&apos;s own catalogue, checked on 16 September 2026.
          The selection and the commentary are our own editorial opinion.
        </li>
        <li>
          No illustrator is credited on this page: the official gallery presents a selection of cards without
          illustrator credits, so we cannot attribute individual Pikachu artwork from an official source.
        </li>
      </SourceList>
    </GuideLayout>
  );
}
