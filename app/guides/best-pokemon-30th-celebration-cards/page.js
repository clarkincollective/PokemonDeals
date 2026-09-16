import Link from "next/link";
import GuideLayout, { GP, GH2, GUL } from "@/components/GuideLayout";
import { Gallery } from "@/components/guides/CardArt";
import { Src, SourceList } from "@/components/guides/Src";
import { guideMetadata } from "@/lib/guides";
import { GUIDE_CARDS, GUIDE_SETS, GUIDE_LINK_CLASS } from "@/lib/guideLinks";

const SLUG = "best-pokemon-30th-celebration-cards";
export const metadata = guideMetadata(SLUG);

// The non-Pikachu editorial selection. Deliberately scoped away from the
// Pikachu artwork article so the two do not repeat each other: that one
// picks from the thirty Pikachu rares, this one never mentions them except
// to send the reader there.
//
// Editorial, labelled, criteria stated. No value ranking, no rarity
// ranking, no "most valuable" or "best investment" framing anywhere.

const C = GUIDE_CARDS;

export default function Page() {
  return (
    <GuideLayout slug={SLUG}>
      <GP>
        The thirty Pikachu rares get the attention, and they are only part of what is in{" "}
        <em>30th Celebration</em>. The set also carries seventeen illustration rares, seven special illustration
        rares, the Pokemon ex cards and a brand-new rarity. These are the ones we would chase for the artwork if
        Pikachu were not in the set at all.
      </GP>
      <GP>
        This is our editorial selection and nothing more. We have no pull-rate data, no sold-price study and no
        popularity ranking for this release, so this is not a &quot;most valuable&quot; or &quot;rarest&quot; list and
        we have not dressed it up as one. We picked on the pictures: does the illustration commit to a scene, does it
        use the whole card, and does it still read from across a room.
      </GP>

      <GH2>Illustration rares: the full-scene cards</GH2>
      <GP>
        The illustration rares are where this set does its best work. They sit above the printed total of 128, they
        are full-scene artwork rather than portraits, and they cover an unusually wide spread of Pokemon &mdash;
        several of which rarely get this treatment at all.
      </GP>
      <Gallery
        cards={[
          { card: C.c30LaprasIr, caption: "Illustration rare" },
          { card: C.c30AlolanExeggutorIr, caption: "Illustration rare" },
          { card: C.c30HisuianZoruaIr, caption: "Illustration rare" },
          { card: C.c30MausholdIr, caption: "Illustration rare" },
          { card: C.c30IrDrifloon136, caption: "Illustration rare" },
          { card: C.c30IrChandelure137, caption: "Illustration rare" },
        ]}
        width={150}
        priorityCount={3}
        note="Six of the set's illustration rares. Catalogue scans, complete card faces; each links to its own card page. Our editorial picks, chosen for the artwork."
      />
      <GP>
        <strong>Lapras 131/128</strong> is the one we would frame. <strong>Alolan Exeggutor 129/128</strong> gets the
        joke that the Pokemon has always invited and builds the composition around its height rather than fighting it.{" "}
        <strong>Hisuian Zorua 145/128</strong> and <strong>Maushold 146/128</strong> are the two that reward looking
        closely &mdash; both hide more in the background than a first glance suggests. <strong>Drifloon</strong> and{" "}
        <strong>Chandelure</strong> are the set&apos;s best use of light, which is not a coincidence given what both
        Pokemon are.
      </GP>

      <GH2>Special illustration rares: the painted ex cards</GH2>
      <GP>
        The special illustration rares are the painted, full-scene versions of the Pokemon ex cards. They are a
        different proposition from the illustration rares: bigger subjects, more theatrical staging, and the Pokemon
        is usually doing something rather than existing somewhere.
      </GP>
      <Gallery
        cards={[
          { card: C.c30SylveonExSir, caption: "Special illustration rare" },
          { card: C.c30GreninjaExSir, caption: "Special illustration rare" },
          { card: C.c30JirachiExSir, caption: "Special illustration rare" },
          { card: C.c30SirSalamenceEx156, caption: "Special illustration rare" },
        ]}
        width={158}
        note="Four of the set's special illustration rares — the painted versions of the Pokemon ex cards."
      />
      <GP>
        <strong>Sylveon ex 153/128</strong> is the most immediately likeable card in the set and the one we would
        hand to someone who says modern cards all look the same. <strong>Greninja ex 148/128</strong> is the opposite
        pick: restrained, dark, and much better in the hand than in a thumbnail.{" "}
        <strong>Salamence ex 156/128</strong> earns its size.
      </GP>

      <GH2>The Eeveelution ex pair</GH2>
      <GP>
        Espeon ex and Umbreon ex are worth calling out separately because they lead the two October Battle Decks as
        well as appearing in the set, so there are several ways to end up with them. Each deck is a 60-card all-foil
        deck and includes an illustration rare of its own &mdash; Victini with Espeon, Zeraora with Umbreon &mdash;
        rather than booster packs. <Src id="showcaseUs" />
      </GP>
      <Gallery
        cards={[
          { card: C.c30EspeonEx, caption: "Leads the Espeon ex Battle Deck" },
          { card: C.c30UmbreonEx, caption: "Leads the Umbreon ex Battle Deck" },
        ]}
        width={168}
        note="Espeon ex 070/128 and Umbreon ex 092/128. The Battle Decks that feature them contain no booster packs."
      />

      <GH2>And the genuinely new one</GH2>
      <GP>
        If you only chase one thing from this set on novelty alone, make it a Futuristic rare. It is a new card type
        rather than a new finish, designed by the artist YOSHIROTTEN, and there are two of them: Mewtwo ex and Mew ex.{" "}
        <Src id="announce" /> They look like nothing else in the release. We covered them, and the six Mew and Mewtwo
        cards in the set, in{" "}
        <Link href="/guides/pokemon-30th-celebration-mew-mewtwo" className={GUIDE_LINK_CLASS}>
          the Mew and Mewtwo guide
        </Link>
        .
      </GP>

      <GH2>What we left out, and where to go next</GH2>
      <GUL>
        <li>
          <strong>The Pikachu rares.</strong> All thirty have their own{" "}
          <Link href="/guides/pokemon-30th-celebration-pikachu-checklist" className={GUIDE_LINK_CLASS}>
            visual checklist
          </Link>
          , and our favourites among them are in{" "}
          <Link href="/guides/best-pokemon-30th-celebration-pikachu-cards" className={GUIDE_LINK_CLASS}>
            the Pikachu artwork picks
          </Link>
          . Keeping them out of this article is deliberate.
        </li>
        <li>
          <strong>The Classic Collection.</strong> Those are reprints of older cards rather than new artwork, which
          makes them a different kind of chase &mdash; and a riskier one, because they keep their original set
          numbers. See{" "}
          <Link href="/guides/pokemon-30th-celebration-classic-collection" className={GUIDE_LINK_CLASS}>
            the Classic Collection guide
          </Link>
          .
        </li>
        <li>
          <strong>Anything about value.</strong> We are not ranking these by what they sell for, and a card being our
          favourite is not a prediction about its price.
        </li>
      </GUL>
      <GP>
        Everything we track from the expansion, with its recent-sold market reference, is on the{" "}
        <Link href={GUIDE_SETS.thirtiethCelebration.href} className={GUIDE_LINK_CLASS}>
          ME: 30th Celebration set page
        </Link>
        . Market references are drawn from recent sold data and are not guaranteed values.
      </GP>

      <SourceList ids={["expansion", "announce", "gallery", "showcaseUs"]}>
        <li>
          Collector numbers, rarities and card images are from this site&apos;s own catalogue, checked on 16 September
          2026. The selection and the commentary are our own editorial opinion. YOSHIROTTEN is the only illustrator
          credited, because the official gallery carries no per-card illustrator credits.
        </li>
      </SourceList>
    </GuideLayout>
  );
}
