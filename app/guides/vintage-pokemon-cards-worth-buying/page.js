import Link from "next/link";
import GuideLayout, { GP, GH2, GUL } from "@/components/GuideLayout";
import { Gallery } from "@/components/guides/CardArt";
import { guideMetadata } from "@/lib/guides";
import { GUIDE_CARDS, GUIDE_SETS, PRICE_CHECKER_HREF, GUIDE_LINK_CLASS } from "@/lib/guideLinks";

const SLUG = "vintage-pokemon-cards-worth-buying";
export const metadata = guideMetadata(SLUG);

// GEO audit 2026-09-19. "Worth buying" here means: holds collector
// demand, has a printing you can verify, and has a reference you can
// read. No prices in the copy - they move; the card pages carry them.
// Exact card / set links come from lib/guideLinks (verified identities).
export default function Page() {
  return (
    <GuideLayout slug={SLUG}>
      <GP>
        &ldquo;Vintage&rdquo; means the Wizards of the Coast era, roughly 1999 to 2003: Base Set
        through the e-Card sets. It is the part of the hobby where a printing detail can multiply a
        price several times over, so the buying order is printing first, condition second, reference
        third. This guide is about choosing well, not about which card will rise.
      </GP>

      <GH2>Printing first</GH2>
      <GUL>
        <li>
          <strong>Base Set has three printings that look alike.</strong> Shadowless (no drop shadow on
          the art frame, thinner HP text), Unlimited (the common one), and 1st Edition (a stamp on
          the left of the art). The{" "}
          <Link href={GUIDE_SETS.baseSet.href} className={GUIDE_LINK_CLASS}>
            Base Set
          </Link>{" "}
          and{" "}
          <Link href={GUIDE_SETS.baseSetShadowless.href} className={GUIDE_LINK_CLASS}>
            Base Set (Shadowless)
          </Link>{" "}
          pages are separate for that reason, and{" "}
          <Link href="/guides/base-set-shadowless-unlimited-first-edition" className={GUIDE_LINK_CLASS}>
            this guide
          </Link>{" "}
          shows how to tell them apart from a photo.
        </li>
        <li>
          <strong>Base Set 2 is a reprint set, not Base Set.</strong> A{" "}
          <Link href={GUIDE_CARDS.charizardBaseSet2.href} className={GUIDE_LINK_CLASS}>
            Base Set 2 Charizard
          </Link>{" "}
          is a genuine WOTC card with its own, much lower, reference than the{" "}
          <Link href={GUIDE_CARDS.charizardBaseSet.href} className={GUIDE_LINK_CLASS}>
            Base Set Charizard
          </Link>
          . Titles that say &ldquo;Base Set&rdquo; over a card with the Base Set 2 symbol are a
          classic mis-description.
        </li>
        <li>
          <strong>Holo, non-holo and reverse.</strong> Jungle, Fossil, Team Rocket, the Gym and Neo
          sets each have holofoil rares that carry the demand; a non-holo copy of the same Pokemon is
          a different card at a different reference.
        </li>
        <li>
          <strong>Later WOTC sets.</strong> Legendary Collection, Expedition, Aquapolis and Skyridge
          have reverse-holo and crystal-type cards that collectors seek specifically; check the
          number and the rarity symbol, not just the name.
        </li>
      </GUL>
      {/* Card art (2026-09-20): the three look-alikes the first two points describe. */}
      <Gallery
        cards={[
          { card: GUIDE_CARDS.charizardShadowless, caption: "Base Set (Shadowless), 4/102" },
          { card: GUIDE_CARDS.charizardBaseSet, caption: "Base Set (Unlimited), 4/102" },
          { card: GUIDE_CARDS.charizardBaseSet2, caption: "Base Set 2, 4/130" },
        ]}
        width={150}
        note={
          <>
            Three genuine WOTC Charizards a title can blur together. The Shadowless card lacks the drop shadow to
            the right of the art frame; Base Set 2 carries its own set symbol and a /130 number. Each has its own
            page and reference, and none of these scans says anything about a particular seller&apos;s card.
          </>
        }
      />

      <GH2>Condition second</GH2>
      <GP>
        Vintage cards were played with. A Near Mint claim on a 1999 card deserves front and back
        photos in good light; edge wear on the back border and print lines on holofoil are the
        common flaws. Grading changes the market: a slabbed 9 or 10 and a raw copy are priced from
        different references, and the site never compares one with the other. Use{" "}
        <Link href="/guides/how-to-check-pokemon-card-condition" className={GUIDE_LINK_CLASS}>
          the condition checklist
        </Link>{" "}
        before you decide what tier you are paying for.
      </GP>

      <GH2>Reference third</GH2>
      <GP>
        A fair price is a delivered total at or below the recent sold reference for that exact
        printing and condition — not a forum figure, not a listing price. Each card page states its
        reference, the condition it is for and the date it was recorded, and lists any live listing
        below it. Start with the{" "}
        <Link href={PRICE_CHECKER_HREF} className={GUIDE_LINK_CLASS}>
          price checker
        </Link>{" "}
        for any card, or browse the era:
      </GP>
      <GUL>
        <li>
          <Link href="/deals/vintage" className={GUIDE_LINK_CLASS}>
            Vintage deals
          </Link>{" "}
          — every tracked 1998–2003 listing currently shown, with the reference beside each.
        </li>
        <li>
          Popular starting points with their own pages:{" "}
          <Link href={GUIDE_CARDS.arcanineBaseSet.href} className={GUIDE_LINK_CLASS}>
            Arcanine (Base Set)
          </Link>{" "}
          for a holo rare that is still reachable, and the Base Set page&apos;s{" "}
          <Link href={GUIDE_SETS.baseSet.href} className={GUIDE_LINK_CLASS}>
            most valuable cards
          </Link>{" "}
          list for the top of the set.
        </li>
      </GUL>

      <GH2>The traps</GH2>
      <GUL>
        <li>
          <strong>&ldquo;Vintage&rdquo; in a title.</strong> The word is not a printing. Some sellers
          apply it to any card older than a few years.
        </li>
        <li>
          <strong>Reprints presented as originals.</strong> Celebrations (2021) and XY Evolutions
          (2016) reprinted Base Set artwork with a modern set symbol and border; a genuine card, a
          different reference.
        </li>
        <li>
          <strong>Fakes.</strong> The most-faked cards are the vintage chase cards. The physical tells
          and the extra photos worth asking for are in{" "}
          <Link href="/guides/spotting-fake-pokemon-cards-in-listings" className={GUIDE_LINK_CLASS}>
            spotting fake Pokemon cards in a listing
          </Link>
          .
        </li>
        <li>
          <strong>Auctions.</strong> A vintage auction&apos;s current bid is usually far under its
          final price. Compare the bid with the reference for information; do not treat it as a
          saving.
        </li>
      </GUL>

      <GP>
        Buying rule of thumb: choose the printing, confirm it in the photos, price the condition the
        photos support, and pay at or under the reference. Everything else — era stories, future
        value, what a card &ldquo;should&rdquo; be worth — is opinion. Read{" "}
        <Link href="/guides/vintage-vs-modern-pokemon-cards" className={GUIDE_LINK_CLASS}>
          vintage vs. modern
        </Link>{" "}
        for where the eras begin and end.
      </GP>
    </GuideLayout>
  );
}
