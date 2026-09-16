import Link from "next/link";
import GuideLayout, { GP, GH2, GUL } from "@/components/GuideLayout";
import { GuideTable } from "@/components/guides/CardArt";
import { Src, SourceList } from "@/components/guides/Src";
import { guideMetadata } from "@/lib/guides";
import { GUIDE_SETS, GUIDE_LINK_CLASS } from "@/lib/guideLinks";

const SLUG = "pokemon-30th-celebration-promo-cards";
export const metadata = guideMetadata(SLUG);

// Product -> guaranteed promo. Contents are from the official US product
// showcase (checked 2026-09-16), which states them product by product.
//
// The distinction this page exists to enforce: a promo is GUARANTEED in
// its own product. Nothing here says or implies that any promo can be
// pulled from a booster pack, and no odds are given for anything.

// [product, promo card(s) guaranteed, booster packs, also inside]
const PROMOS = [
  ["Elite Trainer Box", "1 full-art Nidorina", "9", "Sleeves, foil energy, dice, coin, storage box, player's guide"],
  ["Pokemon Center Elite Trainer Box", "2 full-art Nidorina (one with the Pokemon Center logo)", "11", "Same accessories as the standard box"],
  ["Knock Out Collection", "1 foil Eevee", "2", "Plastic coin"],
  ["Poster Collection", "3 foil promos: Articuno, Zapdos, Moltres", "3", "Poster featuring over 160 cards"],
  ["Tech Sticker Collection", "1 foil promo: Alolan Exeggutor or Lucario", "3", "Tech sticker sheet"],
  ["Pokemon ex Box", "1 foil promo, standard and oversize: Sylveon ex or Greninja ex", "4", "—"],
  ["Ditto Premium Collection", "1 Ditto promo", "8", "Acrylic display"],
  ["Figure Collection", "1 foil promo and an oversize card: Mew or Mewtwo", "5", "Sculpted figure by Kaiyodo Co. Ltd."],
  ["Ultra-Premium Collection (Day & Night)", "Pikachu ex, with Espeon ex or Umbreon ex", "29, plus 1 Classic Collection booster pack", "Playmat, sleeves, deck box, accessories"],
  ["Battle Deck (Espeon ex or Umbreon ex)", "Illustration rare Victini (Espeon deck) or Zeraora (Umbreon deck)", "None — a 60-card all-foil deck", "Deck box, coin, playmat"],
  ["Booster Bundle", "None stated", "6", "—"],
  ["Mini Tins", "None stated", "2 per tin", "Sticker sheet and an art card; ten artworks across the tins"],
  ["Binder Collection", "None stated", "5", "Nine-pocket binder with a 30-year commemorative design"],
];

export default function Page() {
  return (
    <GuideLayout slug={SLUG}>
      <GP>
        Several <em>30th Celebration</em> products come with a promo card you cannot get any other way. If you want a
        particular one, you have to buy the product it ships in &mdash; a promo is not something you can open packs
        and hope for. This table says which product contains which. <Src id="showcase" />
      </GP>

      <GH2>Which product contains which promo</GH2>
      <GuideTable
        head={["Product", "Promo card(s) guaranteed", "Booster packs", "Also inside"]}
        rows={PROMOS}
        minWidth="52rem"
        caption="Contents as stated on the official US product showcase, checked 16 September 2026. Products showing 'none stated' are not listed with a promo on that page."
      />

      <GH2>Guaranteed promo or booster pull? They are not the same thing</GH2>
      <GP>
        This is the distinction that costs people money, so it is worth being blunt about it.
      </GP>
      <GUL>
        <li>
          <strong>A guaranteed promo</strong> is the card in the box. If you buy the Knock Out Collection you get the
          Eevee promo. There is no chance involved.
        </li>
        <li>
          <strong>A booster pull</strong> is whatever comes out of the packs. Every card in a{" "}
          <em>30th Celebration</em> booster pack is foil and every pack has a Pikachu rare, but which Pikachu, and
          whether anything rarer appears, is not something the official pages put a number on &mdash; and neither will
          we.
        </li>
        <li>
          <strong>A promo is not in the packs.</strong> Buying more packs will never produce the Nidorina, the Eevee
          or the Ditto promo.
        </li>
        <li>
          <strong>&quot;Or&quot; means you do not choose.</strong> Several products list a promo as one of two
          &mdash; Alolan Exeggutor <em>or</em> Lucario, Sylveon ex <em>or</em> Greninja ex, Mew <em>or</em> Mewtwo.
          Those are different versions of the product. Check which version a listing is actually selling.
        </li>
      </GUL>

      <GH2>Buying a promo on its own</GH2>
      <GP>
        A loose promo card sold by itself is a single, not a sealed product. That is a perfectly normal way to buy one
        &mdash; it is usually the cheaper route if you only want the card and not the box &mdash; but it means the
        seller has opened the product, so the usual single-card checks apply: read the photographs, check the card is
        the version you want, and be careful with any listing that is vague about which product a promo came from.
      </GP>
      <GP>
        The promos are their own cards, separate from the main-set card of the same Pokemon. The Nidorina promo is not
        the Nidorina numbered in the main set, and a listing that shows one while describing the other is a listing to
        avoid. Our{" "}
        <Link href="/guides/how-to-find-pokemon-card-set-and-number" className={GUIDE_LINK_CLASS}>
          set-and-number guide
        </Link>{" "}
        shows where to look to tell them apart.
      </GP>
      <GP>
        We should say plainly what we do not have: these promos are not currently in our catalogue as separate
        entries, so we cannot link you to a page for the Nidorina or Eevee promo specifically, and we will not link a
        main-set card in its place. Everything we do track from the expansion is on the{" "}
        <Link href={GUIDE_SETS.thirtiethCelebration.href} className={GUIDE_LINK_CLASS}>
          ME: 30th Celebration set page
        </Link>
        .
      </GP>

      <GH2>The Ultra-Premium Collection is the odd one out</GH2>
      <GP>
        Two things make it different. It is the only product on the official list that includes a{" "}
        <strong>Classic Collection booster pack</strong> as a separate item, and at 29 packs plus that one it is far
        larger than anything else in the lineup. If the Classic Collection reprints are what you are chasing, read how
        they work first &mdash; they keep their original set numbers, which makes them easy to confuse with the
        originals. Our{" "}
        <Link href="/guides/pokemon-30th-celebration-classic-collection" className={GUIDE_LINK_CLASS}>
          Classic Collection guide
        </Link>{" "}
        covers that.
      </GP>

      <GH2>When each product arrives</GH2>
      <GP>
        The products are not all out at once, and the dates are not the same in every region: the official UK and US
        pages disagree on two of them. The{" "}
        <Link href="/guides/pokemon-30th-celebration-release-dates" className={GUIDE_LINK_CLASS}>
          release-date comparison
        </Link>{" "}
        sets both schedules side by side. For the expansion itself rather than the products, see the{" "}
        <Link href="/guides/pokemon-30th-celebration-guide" className={GUIDE_LINK_CLASS}>
          main collector&apos;s guide
        </Link>
        , and for the two Elite Trainer Boxes specifically,{" "}
        <Link href="/guides/pokemon-30th-celebration-elite-trainer-box" className={GUIDE_LINK_CLASS}>
          our box comparison
        </Link>
        .
      </GP>

      <SourceList ids={["showcase", "etb", "pcEtb", "expansion"]}>
        <li>
          Product contents were read from the official US product showcase and the two Elite Trainer Box product pages
          on 16 September 2026. No pull rates, odds or prices are stated on this page because the official pages do
          not state any.
        </li>
      </SourceList>
    </GuideLayout>
  );
}
