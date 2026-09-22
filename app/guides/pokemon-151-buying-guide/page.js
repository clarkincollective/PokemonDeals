import Link from "next/link";
import GuideLayout, { GP, GH2, GUL } from "@/components/GuideLayout";
import { Gallery, ProductGallery, GuideTable } from "@/components/guides/CardArt";
import { Src, SourceList } from "@/components/guides/Src";
import { guideMetadata } from "@/lib/guides";
import { GUIDE_CARDS, GUIDE_LINK_CLASS, GUIDE_PRODUCTS, GUIDE_SETS, PRICE_CHECKER_HREF } from "@/lib/guideLinks";

const SLUG = "pokemon-151-buying-guide";
export const metadata = guideMetadata(SLUG);

// Audit batch 2026-09-22. The 151 SET PAGE already answers "what is in it
// and what is listed". This guide answers a different question - which
// buying route suits what you actually want - so the two do not compete.
//
// Deliberately absent: prices (they move), pull rates and any
// expected-value figure (we hold no pull-rate data), and any claim that
// the catalogue is the complete official checklist.
export default function Page() {
  return (
    <GuideLayout slug={SLUG}>
      <GP>
        Scarlet &amp; Violet 151 revisits the original Kanto numbering, which is why it draws
        collectors who have never bought a modern set. That also makes it easy to buy the wrong
        thing: &ldquo;151&rdquo; is a set, several sealed products, and — because of how modern sets
        number their extras — more cards than the 151 in the name. This guide picks the buying route
        first, then names the product.
      </GP>

      <GH2>Start with what you actually want</GH2>
      <GuideTable
        head={["What you want", "Buy this", "Why"]}
        rows={[
          ["One specific card", "That single, on its own listing", "You pay once and you get it. No chance involved."],
          ["The experience of opening packs", "Booster bundle or a box product", "You are buying the opening, not a named card."],
          ["A gift that looks like a gift", "An Elite Trainer Box or a collection box", "Packaging, accessories and a promo, in one box."],
          ["To work through a checklist", "Singles, cheapest first", "Duplicates are the main cost of doing this with packs."],
        ]}
        caption="Pick the row that matches your goal before comparing prices — the routes are not substitutes for one another."
      />
      <GP>
        The distinction that matters most is the first row against the second. Buying a single is a
        purchase. Buying packs is buying a chance at a card, and the chance does not improve because
        the card is expensive. If there is one card you want, the honest route is to buy that card.
      </GP>

      <GH2>151 is not 151 cards</GH2>
      <GP>
        The set is built on the Kanto 1&ndash;151 numbering, but the cards above that number are
        where most of the collector interest sits. In our own catalogue we track{" "}
        <strong>215 records</strong> for the set, and the rarities break down as commons and
        uncommons for the bulk of the numbered run, then a premium tail: Illustration Rares, Ultra
        Rares, Double Rares, Special Illustration Rares and Hyper Rares. A card numbered{" "}
        <strong>174/165</strong> is not a misprint — it is one of the extras that sit past the
        printed set total.
      </GP>
      <GP>
        That is worth knowing before you set a budget, because &ldquo;completing 151&rdquo; means
        very different things depending on whether those extras are in your list. Our{" "}
        <Link href="/guides/complete-set-vs-master-set" className={GUIDE_LINK_CLASS}>
          complete set vs master set guide
        </Link>{" "}
        is about writing that decision down. The figures above describe{" "}
        <em>what we track</em>, not an official checklist.
      </GP>

      <GH2>One name, three different cards</GH2>
      <GP>
        The 151 Charizard ex is not one card. Our catalogue holds three separate records for it, at
        three collector numbers and three rarities — and two of those numbers sit above the printed
        set total. If you are shopping for &ldquo;the 151 Charizard&rdquo;, this is the decision you
        are actually making.
      </GP>
      <Gallery
        cards={[
          { card: GUIDE_CARDS.s151CharizardEx006, caption: "006/165 Double Rare" },
          { card: GUIDE_CARDS.s151CharizardEx183, caption: "183/165 Ultra Rare" },
          { card: GUIDE_CARDS.s151CharizardEx199, caption: "199/165 Special Illustration Rare" },
        ]}
        width={160}
        note="Three separate catalogue records. A listing titled only 'Charizard ex 151' has not yet told you which one it is — take the number off the card in the photograph."
      />
      <GP>
        The same applies to the other Kanto starters — Venusaur ex appears both inside the numbered
        run and again at <strong>198/165</strong> as a Special Illustration Rare. Decide the number
        before you compare prices, or you will compare two different cards.
      </GP>

      <GH2>There are two different 151 Elite Trainer Boxes</GH2>
      <GP>
        This catches people out, and it is not a small difference. Our sealed catalogue holds a
        standard <strong>151 Elite Trainer Box</strong> and a separate{" "}
        <strong>151 Pokemon Center Elite Trainer Box (Exclusive)</strong>, and their official product
        pages list different contents. A listing title saying &ldquo;151 ETB&rdquo; has not yet told
        you which one is in the box.
      </GP>
      <GuideTable
        head={["Product", "Region / language", "Packs", "Promo cards", "Accessories", "Suits"]}
        rows={[
          [
            <>
              <Src id="s151Etb">151 Elite Trainer Box</Src>
            </>,
            "US listing, English",
            "9",
            "1 full-art foil Snorlax",
            "65 sleeves, 45 Energy, player's guide, 6 damage-counter dice, 1 competition-legal coin-flip die, 2 condition markers, collector's box with 4 dividers, TCG Live code card",
            "A gift, or a player who wants the accessories",
          ],
          [
            <>
              <Src id="s151PcEtb">151 Pokemon Center Elite Trainer Box</Src>
            </>,
            "US listing, English. Sold only at Pokemon Center",
            "11",
            "2: a full-art foil Snorlax with a Pokemon Center logo, and a full-art foil Snorlax",
            "Same accessory list as the standard box",
            "Someone who wants the exclusive promo and two extra packs",
          ],
          [
            <>
              <Src id="s151Upc">151 Ultra-Premium Collection</Src>
            </>,
            "US listing, English",
            "16",
            "1 etched foil Mew ex, 1 full-art foil Mewtwo, plus 1 etched metal Mew ex card",
            "Playmat, deck box, metallic Mew coin, 6 damage-counter dice, 2 condition markers, TCG Live code card",
            "Someone buying the collectibles as much as the packs",
          ],
        ]}
        minWidth="52rem"
        caption="Contents as listed on each product's own official page, read 22 September 2026. Pack counts and promos differ between the two Elite Trainer Boxes; the accessory list does not. Regional editions of a product can differ, so check the listing's own region."
      />
      <ProductGallery
        products={[
          { product: GUIDE_PRODUCTS.s151EliteTrainerBox, caption: "Standard Elite Trainer Box" },
          { product: GUIDE_PRODUCTS.s151PokemonCenterEtb, caption: "Pokemon Center exclusive ETB" },
          { product: GUIDE_PRODUCTS.s151UltraPremium, caption: "Ultra-Premium Collection" },
        ]}
        width={168}
        note="The three products in the table, as catalogue product photographs. Check the exact product name in the listing title and the photograph of the box before you compare two prices."
      />
      <GP>
        Two packs and a second promo is the whole of the difference between the Elite Trainer Boxes.
        Whether that is worth a price gap is your call — but it is a decision you can only make once
        you know which box a listing is for. The general version of this problem is in the{" "}
        <Link href="/guides/booster-box-vs-etb-vs-booster-bundle" className={GUIDE_LINK_CLASS}>
          booster box vs ETB vs booster bundle guide
        </Link>
        .
      </GP>

      <GH2>A Japanese listing is not a cheaper English card</GH2>
      <GP>
        Japanese cards turn up constantly in English-language searches for this set. A Japanese card
        is a different card with its own number and its own market, not a discount on the English
        one, and it should be priced against other Japanese copies. Our catalogue holds{" "}
        <strong>English records only</strong>, so we cannot identify the Japanese counterpart of a
        151 card for you, and we do not publish a cross-language price comparison. Read the{" "}
        <Link href="/guides/japanese-vs-english-pokemon-cards" className={GUIDE_LINK_CLASS}>
          Japanese vs English guide
        </Link>{" "}
        — which also covers where each language is legal to play — before buying across the two.
      </GP>

      <GH2>Reading a 151 single before you buy</GH2>
      <GUL>
        <li>
          <strong>Take the collector number from the photo, not the title.</strong> Titles are
          written by sellers; the number is printed on the card. Our{" "}
          <Link href="/guides/how-to-find-pokemon-card-set-and-number" className={GUIDE_LINK_CLASS}>
            set-and-number guide
          </Link>{" "}
          shows where to look.
        </li>
        <li>
          <strong>Check whether the number has more than one printing.</strong> A reverse-holo
          version of a card carries the same number as the plain one, so the number alone does not
          identify what you are buying — see{" "}
          <Link href="/guides/holo-vs-reverse-holo-pokemon-cards" className={GUIDE_LINK_CLASS}>
            holo vs reverse holo
          </Link>
          .
        </li>
        <li>
          <strong>Confirm the language.</strong> Japanese cards appear in English-language searches
          constantly, and our catalogue cannot price them.
        </li>
        <li>
          <strong>Read the condition wording against the photographs</strong>, and treat the
          shipping line as part of the price. Our{" "}
          <Link href="/guides/how-to-read-a-pokemon-card-listing" className={GUIDE_LINK_CLASS}>
            listing-reading guide
          </Link>{" "}
          covers both.
        </li>
      </GUL>

      <GH2>Where to go next</GH2>
      <GUL>
        <li>
          <Link href={GUIDE_SETS.scarletViolet151.href} className={GUIDE_LINK_CLASS}>
            Browse 151 cards
          </Link>{" "}
          — every card from the set we track, with the listings that are currently eligible.
        </li>
        <li>
          <Link href="/sealed-deals" className={GUIDE_LINK_CLASS}>
            Sealed product listings
          </Link>{" "}
          — boxes, bundles and ETBs, priced as sealed products rather than as singles.
        </li>
        <li>
          <Link href={PRICE_CHECKER_HREF} className={GUIDE_LINK_CLASS}>
            Look up one exact card
          </Link>{" "}
          — by name, set or collector number, if you already know which card you want.
        </li>
      </GUL>
      <GP>
        Listings come and go. If a page is empty when you arrive, the card or product is simply not
        currently listed at a price we can stand behind — not that it does not exist.
      </GP>

      <SourceList ids={["s151Etb", "s151PcEtb", "s151Upc", "s151Expansion"]}>
        <li>
          Product contents read from each product&apos;s own official page on 22 September 2026.
          Card counts, collector numbers and rarities are our own catalogue records for the set,
          read the same day — they describe what we track, not an official checklist.
        </li>
      </SourceList>
    </GuideLayout>
  );
}
