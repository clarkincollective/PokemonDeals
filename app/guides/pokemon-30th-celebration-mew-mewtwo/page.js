import Link from "next/link";
import GuideLayout, { GP, GH2, GUL } from "@/components/GuideLayout";
import { Gallery, GuideTable } from "@/components/guides/CardArt";
import { Src, Srcs, SourceList } from "@/components/guides/Src";
import { guideMetadata } from "@/lib/guides";
import { GUIDE_CARDS, GUIDE_SETS, GUIDE_LINK_CLASS } from "@/lib/guideLinks";

const SLUG = "pokemon-30th-celebration-mew-mewtwo";
export const metadata = guideMetadata(SLUG);

// Mew and Mewtwo carry the set's brand-new rarity, so the two topics
// belong in one article rather than two thin ones: the Futuristic rare
// cannot be explained without them, and they cannot be listed without
// explaining it.
//
// YOSHIROTTEN is named because the official pages name them for these
// cards. No other illustrator is credited anywhere in this cluster: the
// official gallery carries no illustrator credits.

const C = GUIDE_CARDS;

const FAMILY = [
  ["Mewtwo", "063/128", "Rare", "Main set"],
  ["Mewtwo ex", "064/128", "Double Rare", "Main set"],
  ["Mew", "065/128", "Rare", "Main set"],
  ["Mew ex", "066/128", "Double Rare", "Main set"],
  ["Mewtwo ex", "157/128", "Futuristic Rare", "Above the printed total"],
  ["Mew ex", "158/128", "Futuristic Rare", "Above the printed total"],
];

export default function Page() {
  return (
    <GuideLayout slug={SLUG}>
      <GP>
        <em>30th Celebration</em> introduces a rarity that has not existed before: the Futuristic rare, a card type
        designed by the artist YOSHIROTTEN, who also illustrated the set&apos;s foil Basic Energy cards. The two
        revealed Futuristic rares are <strong>Mewtwo ex</strong> and <strong>Mew ex</strong>.{" "}
        <Srcs ids={["expansion", "announce"]} />
      </GP>
      <GP>
        That makes Mew and Mewtwo the pair to understand if you want to know what is genuinely new about this set.
        They also appear at three other rarities, which is where the confusion starts: there are six Mew and Mewtwo
        cards in the release and four of them share a name with another.
      </GP>

      <GH2>What a Futuristic rare is</GH2>
      <GP>
        It is a new card type, not a new finish applied to an old one. The official expansion page lists
        &quot;Futuristic Rare&quot; as one of its own card categories alongside Pokemon ex, Special Art, Pikachu Rare
        and Classic Collection. <Src id="gallery" /> In our catalogue the two sit at 157/128 and 158/128 &mdash; the
        last two numbers we hold for the set, above its printed total of 128, which is where a set&apos;s
        highest-rarity cards normally live.
      </GP>
      <GP>
        What we cannot tell you, because no official page says it: how often a Futuristic rare appears in a booster
        pack. There is no published pull rate for this rarity, and an estimate from us would be a guess wearing a
        number. We would rather leave the gap visible.
      </GP>
      <Gallery
        cards={[
          { card: C.c30MewtwoExFuturistic, caption: "Futuristic rare" },
          { card: C.c30MewExFuturistic, caption: "Futuristic rare" },
        ]}
        width={180}
        priorityCount={2}
        note="The two Futuristic rares, a card type designed by YOSHIROTTEN. Catalogue scans, complete card faces; each links to its own card page."
      />
      <GP>
        Look at the two faces rather than the rarity label and the design intent is clear enough: both treat the
        Pokemon as a graphic object rather than a creature in a landscape, with hard-edged geometry and a flat,
        poster-like palette that owes more to print design than to the painted scenes elsewhere in the set. Put one
        next to a special illustration rare and they do not look like the same hobby. That is the point of a new
        category.
      </GP>

      <GH2>Every Mew and Mewtwo card in the set</GH2>
      <GuideTable
        head={["Card", "Number", "Rarity", "Where it sits"]}
        rows={FAMILY}
        minWidth="38rem"
        caption="Mew and Mewtwo cards in ME: 30th Celebration, from our catalogue, 16 September 2026."
      />
      <Gallery
        cards={[
          { card: C.c30Mewtwo063, caption: "Rare" },
          { card: C.c30MewtwoEx064, caption: "Double Rare" },
          { card: C.c30Mew065, caption: "Rare" },
          { card: C.c30MewEx066, caption: "Double Rare" },
        ]}
        width={150}
        note="The four main-set Mew and Mewtwo cards, numbered out of 128. The two Futuristic rares above are different cards again."
      />
      <GP>
        The trap here is the name. <strong>Mewtwo ex 064/128</strong> and <strong>Mewtwo ex 157/128</strong> are both
        called Mewtwo ex, are both foil, and are not the same card or the same price. The collector number is the only
        thing that separates them at a glance. The same is true of Mew ex at 066/128 and 158/128. If a listing shows
        one and its title implies the other, that is a listing to skip.
      </GP>

      <GH2>Mew and Mewtwo outside the packs</GH2>
      <GP>
        The November product wave includes Figure Collections built around these two: each contains five booster
        packs, a sculpted figure by Kaiyodo Co. Ltd., and a foil promo with an oversize version of the same Pokemon
        &mdash; Mew or Mewtwo depending on which you buy. <Src id="showcaseUs" /> Those promos are their own cards,
        separate from the six above, and cannot be pulled from a pack. Which product guarantees which promo is set out
        in our{" "}
        <Link href="/guides/pokemon-30th-celebration-promo-cards" className={GUIDE_LINK_CLASS}>
          promo-by-product guide
        </Link>
        .
      </GP>

      <GH2>Buying one</GH2>
      <GP>
        Each of the six links to its own page above, and the{" "}
        <Link href={GUIDE_SETS.thirtiethCelebration.href} className={GUIDE_LINK_CLASS}>
          ME: 30th Celebration set page
        </Link>{" "}
        lists everything we track from the expansion with its recent-sold market reference. Those references come from
        recent sold data and are not guaranteed values; a card appearing there is not a claim that a good deal exists
        for it right now.
      </GP>
      <GUL>
        <li>
          <strong>Check the number before anything else.</strong> 064 and 157 are different cards with the same name.
        </li>
        <li>
          <strong>Foiling proves nothing in this set.</strong> Every card in a booster pack is foil, including the
          Basic Energy. <Src id="announce" />
        </li>
        <li>
          <strong>A Futuristic rare is not a Classic Collection card.</strong> The reprints keep their original set
          numbers and are a different thing entirely &mdash; see{" "}
          <Link href="/guides/pokemon-30th-celebration-classic-collection" className={GUIDE_LINK_CLASS}>
            the Classic Collection guide
          </Link>
          .
        </li>
      </GUL>
      <GP>
        For the set as a whole, the{" "}
        <Link href="/guides/pokemon-30th-celebration-guide" className={GUIDE_LINK_CLASS}>
          main collector&apos;s guide
        </Link>{" "}
        is the overview; the other standout artwork in the release is covered in{" "}
        <Link href="/guides/best-pokemon-30th-celebration-cards" className={GUIDE_LINK_CLASS}>
          the best cards beyond Pikachu
        </Link>
        .
      </GP>

      <SourceList ids={["expansion", "announce", "gallery", "showcaseUs"]}>
        <li>
          Collector numbers, rarities and card images are from this site&apos;s own catalogue, checked on 16 September
          2026. YOSHIROTTEN is credited because the official pages name them for these cards; no other illustrator is
          credited on this page, because the official gallery carries no illustrator credits.
        </li>
      </SourceList>
    </GuideLayout>
  );
}
