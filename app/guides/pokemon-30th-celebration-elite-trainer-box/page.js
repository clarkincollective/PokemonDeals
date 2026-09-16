import Link from "next/link";
import GuideLayout, { GP, GH2, GUL } from "@/components/GuideLayout";
import { Gallery, GuideTable } from "@/components/guides/CardArt";
import { Src, Srcs, SourceList } from "@/components/guides/Src";
import { guideMetadata } from "@/lib/guides";
import { GUIDE_CARDS, GUIDE_SETS, GUIDE_LINK_CLASS } from "@/lib/guideLinks";

const SLUG = "pokemon-30th-celebration-elite-trainer-box";
export const metadata = guideMetadata(SLUG);

// Both boxes' contents are taken line by line from their own official
// product pages, checked 2026-09-16. Neither page publishes a price, so
// this article publishes none - an MSRP repeated from a retailer or a news
// summary is not a fact we can stand behind, and street prices are neither
// stable nor the same in two countries.

// [feature, standard ETB, Pokemon Center ETB]
const COMPARE = [
  ["Booster packs", "9", "11"],
  ["Promo cards", "1 full-art Nidorina", "2 full-art Nidorina, one carrying the Pokemon Center logo"],
  ["Foil Basic Energy", "16", "16"],
  ["Card sleeves", "65", "65"],
  ["Dice", "6 damage-counter dice, 1 competition-legal coin-flip die", "6 damage-counter dice, 1 competition-legal coin-flip die"],
  ["Plastic coin", "1", "1"],
  ["Storage", "Collector's box with 6 dividers", "Collector's box with 6 dividers"],
  ["Player's guide", "Yes", "Yes"],
  ["Code card", "1 for Pokemon TCG Live", "1 for Pokemon TCG Live"],
  ["Where to buy", "Pokemon Center and where Pokemon TCG products are sold", "Pokemon Center"],
];

export default function Page() {
  return (
    <GuideLayout slug={SLUG}>
      <GP>
        There are two Elite Trainer Boxes for <em>30th Celebration</em>: the standard one, sold wherever Pokemon TCG
        products are sold, and a Pokemon Center version. They look similar and they are not the same box. Both
        released on 16 September 2026. <Srcs ids={["etb", "pcEtb"]} />
      </GP>
      <GP>
        The short answer: the Pokemon Center box has <strong>two extra booster packs</strong> and{" "}
        <strong>a second Nidorina promo</strong>, one of which carries the Pokemon Center logo. Everything else in the
        two boxes is the same.
      </GP>

      <GH2>Side by side</GH2>
      <GuideTable
        head={["", "Elite Trainer Box", "Pokemon Center Elite Trainer Box"]}
        rows={COMPARE}
        minWidth="46rem"
        caption="Contents as stated on each box's official product page, checked 16 September 2026."
      />

      <Gallery
        cards={[
          { card: GUIDE_CARDS.c30MewExFuturistic, caption: "Futuristic rare" },
          { card: GUIDE_CARDS.c30PikachuExSir149, caption: "Special illustration rare" },
          { card: GUIDE_CARDS.c30SylveonExSir, caption: "Special illustration rare" },
          { card: GUIDE_CARDS.c30LaprasIr, caption: "Illustration rare" },
        ]}
        width={150}
        priorityCount={2}
        note="What the packs inside either box are for: the set's higher rarities. Catalogue scans, complete card faces; each links to its own card page. Neither box guarantees any of these — the only guaranteed card is the Nidorina promo."
      />

      <GH2>What the difference actually gets you</GH2>
      <GUL>
        <li>
          <strong>Two more packs.</strong> That is two more chances at the set&apos;s rarities, and no more than that.
          Neither official page states how often any rarity appears, so we are not going to put odds on it.
        </li>
        <li>
          <strong>A second Nidorina promo, one stamped with the Pokemon Center logo.</strong> A logo-stamped promo is
          a genuinely different card from the unstamped one, and stamped variants have historically been treated as
          their own collectable. Whether that matters to you depends on whether you collect variants.
        </li>
        <li>
          <strong>Nothing else.</strong> The sleeves, energy, dice, coin, dividers, player&apos;s guide and code card
          are identical on both official contents lists.
        </li>
      </GUL>

      <GH2>Which one to buy</GH2>
      <GP>
        <strong>Buy the standard box</strong> if you want the accessories and some packs, or if you are buying more
        than one and want the most packs for the money you are spending. It is also the one you can actually walk into
        a shop and find.
      </GP>
      <GP>
        <strong>Buy the Pokemon Center box</strong> if you want the logo-stamped Nidorina, or if you are the kind of
        collector who wants the version that is harder to get later. It is sold through the Pokemon Center, so
        availability is narrower by design.
      </GP>
      <GP>
        <strong>Buy neither</strong> if what you actually want is one specific card. Nine or eleven packs is a poor
        way to obtain a named card, and the set has a great many of them. Buying the single directly is the
        predictable route, and every card we track from the expansion is listed on the{" "}
        <Link href={GUIDE_SETS.thirtiethCelebration.href} className={GUIDE_LINK_CLASS}>
          ME: 30th Celebration set page
        </Link>{" "}
        with its recent-sold market reference. Those references are drawn from recent sold data and are not guaranteed
        values.
      </GP>

      <GH2>On prices</GH2>
      <GP>
        We have deliberately not printed a price for either box. Neither official product page publishes one,{" "}
        <Srcs ids={["etb", "pcEtb"]} /> and the figures that circulate are a mix of US recommended prices, regional
        recommended prices and what shops are actually charging &mdash; three different things that are often quoted
        as if they were one. What we can tell you is the contents, which is the part that does not change between
        retailers.
      </GP>
      <GP>
        One thing worth knowing before you compare listings: a seller offering &quot;a case&quot; or several boxes is
        not automatically offering a sealed factory case, and the standard box and the Pokemon Center box are
        different products even where a listing title uses &quot;ETB&quot; for both. Read the photographs.
      </GP>

      <GH2>Where the Nidorina promo fits</GH2>
      <GP>
        The Nidorina promo is an Elite Trainer Box card: it is not a card you pull from a booster pack, and it is a
        separate card from the Nidorina in the main set. Which promo comes with which product is set out in{" "}
        <Link href="/guides/pokemon-30th-celebration-promo-cards" className={GUIDE_LINK_CLASS}>
          our promo-by-product guide
        </Link>
        . For what is inside the packs themselves &mdash; the thirty Pikachu rares, the new Futuristic rarity and the
        Classic Collection reprints &mdash; start with the{" "}
        <Link href="/guides/pokemon-30th-celebration-guide" className={GUIDE_LINK_CLASS}>
          main collector&apos;s guide
        </Link>
        .
      </GP>

      <SourceList ids={["etb", "pcEtb", "showcase"]}>
        <li>
          Contents were read from each official product page on 16 September 2026. Neither page states a price, so
          none is quoted here.
        </li>
      </SourceList>
    </GuideLayout>
  );
}
