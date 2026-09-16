import Link from "next/link";
import { Gallery } from "@/components/guides/CardArt";
import { GUIDE_CARDS } from "@/lib/guideLinks";

// Story bodies, one per written news item, keyed by slug. Kept out of the
// route so the route stays a thin renderer that both kinds of item share.
//
// House rules, the same ones the guides follow: no price, pull-rate or
// stock claim; nothing stated that an official page does not say; and a
// news item signposts the in-depth page rather than restating it, so
// /news/<slug> and the guide are never near-duplicates of each other.

const P = "mt-4 text-base leading-relaxed text-zinc-700 dark:text-zinc-300";
const H2 = "mt-8 text-xl font-bold text-black dark:text-zinc-50";
const UL = "mt-4 flex list-disc flex-col gap-2 pl-5 text-base leading-relaxed text-zinc-700 dark:text-zinc-300";
const A = "text-red-600 underline underline-offset-2 hover:text-red-700 dark:text-red-500";

function ThirtiethOutNow() {
  return (
    <>
      <p className={P}>
        Pokemon TCG: <em>30th Celebration</em> released on 16 September 2026. The Pokemon Company describes it
        as the Pokemon TCG&apos;s first simultaneous worldwide launch, and it is the expansion built for the
        game&apos;s 30th anniversary.
      </p>

      <h2 className={H2}>What is in the packs</h2>
      <p className={P}>
        Every card in a <em>30th Celebration</em> booster pack is foil, including the Basic Energy cards, and every
        pack carries one of thirty different Pikachu rare cards. The set also introduces a new rarity, the
        Futuristic rare, and includes a Classic Collection of cards from the game&apos;s past reprinted with a new
        foil treatment. The official pages note those reprints are not legal in the Standard format.
      </p>
      <p className={P}>
        The Classic Collection cards keep their original set numbers rather than taking a number in this set,
        which is the detail most likely to confuse a listing: a card numbered 4/102 with anniversary foil is a
        2026 reprint, not a 1999 Base Set card.{" "}
        <Link href="/guides/pokemon-30th-celebration-guide" className={A}>
          Our collector&apos;s guide
        </Link>{" "}
        covers how to tell the printings apart, the full product list and what is still unconfirmed.
      </p>

      <h2 className={H2}>What is still to come</h2>
      <p className={P}>
        The official product showcase lists further products in two later waves: a Booster Bundle, Mini Tins and
        the Espeon ex and Umbreon ex Battle Decks in October 2026, then the Tech Sticker Collection, a Ditto
        Premium Collection, Mew and Mewtwo Figure Collections and the Day &amp; Night Ultra-Premium Collection in
        November 2026. Those dates are as the showcase states them; we have not verified a separate Australian
        product schedule on an official Australian page.
      </p>

      <h2 className={H2}>Where to look on this site</h2>
      <p className={P}>
        The{" "}
        <Link href="/sets/me-30th-celebration" className={A}>
          ME: 30th Celebration set page
        </Link>{" "}
        carries the card list and our recent-sold market references, and{" "}
        <Link href="/latest-releases" className={A}>
          latest releases
        </Link>{" "}
        tracks the newest expansions alongside it. Market references are drawn from recent sold data and are not
        guaranteed values.
      </p>
    </>
  );
}

// The RGB Mew story is reporting on an UNCONFIRMED card. The rules that
// shape it, in order of importance:
//   * The Pokemon Company has said nothing. That is the headline fact and
//     it is stated before any of the detail.
//   * The 1-in-20,000 figure is one person's claim, relayed by a news
//     site. It is attributed to the person who made it, and is never
//     repeated as though it were a pull rate we know.
//   * We have no authentic image of these cards and will not publish a
//     mock-up, an AI reconstruction or someone else's screenshot. The
//     gallery shows the CONFIRMED YOSHIROTTEN cards and says plainly that
//     they are not the RGB cards.
function RgbMew() {
  return (
    <>
      <p className={P}>
        Since <em>30th Celebration</em> reached shelves, collectors have reported pulling a Mew card that does not
        appear anywhere on the official card list: a set of three coloured Mew variants, red, green and blue, echoing
        the original Pokemon Red, Green and Blue games. They have become known as the RGB Mew.
      </p>
      <p className={P}>
        <strong>The Pokemon Company has not confirmed that these cards exist.</strong> They are not on the official
        card list published on 9 September 2026, they are not in the card-list booklet included with the Elite Trainer
        Box, and no official page or statement mentions an &quot;RGB&quot; rarity. Everything below is reporting and
        claim, not confirmation, and we have marked which is which.
      </p>

      <h2 className={H2}>What is actually claimed</h2>
      <ul className={UL}>
        <li>
          <strong>Three cards, not one.</strong> Red, green and blue versions are reported, corresponding to the three
          original games.
        </li>
        <li>
          <strong>No standard collector number.</strong> Rather than a number out of the set total, the cards are
          reported to carry an RGB marking that identifies which of the three you have.
        </li>
        <li>
          <strong>Reportedly illustrated by YOSHIROTTEN</strong>, the artist who designed the set&apos;s Futuristic
          rare card type and is officially credited with the Mewtwo ex and Mew ex Futuristic rares. That connection is
          reported rather than officially stated for these cards.
        </li>
        <li>
          <strong>Pulled from retail packs</strong> by individual collectors, some of whom had product early. We have
          not independently verified any pull.
        </li>
      </ul>

      <h2 className={H2}>Why they are not on the official list</h2>
      <p className={P}>
        This is the part that turns the story from a mystery into something fairly ordinary, and it is the piece most
        coverage leaves out. PokeBeach, which has done the substantive reporting on these cards, explains that Pokemon
        in Japan does not officially reveal a set&apos;s secret rares until the <em>following</em> set arrives. On a
        normal release, the English side of the business publishes the full card list at launch anyway, so the gap
        never shows. <em>30th Celebration</em> launched worldwide simultaneously, and the English list followed the
        Japanese convention instead &mdash; so the secret rares were left off.
      </p>
      <p className={P}>
        On that reading, the absence of an RGB Mew from the official list is not evidence that the cards are fake. It
        is what you would expect to see either way, which is precisely why the absence settles nothing on its own.
        PokeBeach reads the same intent into the Elite Trainer Box booklet, which lists the set&apos;s cards and also
        omits the trio: a card deliberately left out of the paperwork is a card meant to be found rather than
        announced. If that is right, an official acknowledgement could be months away rather than days.
      </p>
      <p className={P}>
        There is a neat symmetry to it that is worth noting even while the cards are unconfirmed. Mew was the original
        mythical Pokemon, the one that generated a decade of playground rumours about trucks and Pokedex entries, and
        a card you cannot prove exists from any official document is an unusually faithful tribute to that.
      </p>

      <h2 className={H2}>What the colours are said to mean</h2>
      <p className={P}>
        Red, green and blue are the three primary colours of light, and combining them produces the rest of the
        visible spectrum &mdash; which is where the RGB name comes from. They are also the original three Pokemon
        games: Red, Green and Blue. PokeBeach connects that double meaning to YOSHIROTTEN&apos;s wider work, which is
        preoccupied with light, colour and futuristic design, and who is officially credited as the designer of this
        set&apos;s Futuristic rare card type.
      </p>
      <p className={P}>
        That connection is reported rather than officially stated for these particular cards. What is official is
        YOSHIROTTEN&apos;s involvement in the set itself, which is why the artist&apos;s name keeps appearing in this
        story.
      </p>

      <h2 className={H2}>Where the cards came from</h2>
      <p className={P}>
        The trio first surfaced roughly two months before release, when streamers opened <em>30th Celebration</em>{" "}
        product early. PokeBeach reports that the product came from an unauthorised source within the distribution
        chain, and may have been stolen. More recently, collectors have reported pulling all three variants from
        ordinary retail packs as stock reached shops.
      </p>
      <p className={P}>
        That progression matters for how much weight to put on the story. Early sightings from a single unauthorised
        batch are weak evidence; independent pulls from normal retail stock across many people are considerably
        stronger. It is still not official confirmation, and we are not going to promote it to one.
      </p>

      <h2 className={H2}>About the &quot;1 in 20,000&quot; figure</h2>
      <p className={P}>
        A pull rate of one in every 20,000 booster packs has circulated widely and is worth being precise about,
        because it is not a number anyone has measured. It originates with the TCG content creator TheCardScience, who
        described it as insider information from a person said to work at the card manufacturer Millennium Print
        Group, in a post dated 17 August 2026, subsequently reported by Dexerto.
      </p>
      <p className={P}>
        That is a single unverified claim relayed second-hand. The Pokemon Company publishes no pull rates for any
        set, has published none for this one, and has not commented on this figure. We are reporting that the claim
        exists and where it came from. We are not telling you it is the pull rate, because nobody currently knows
        that, and we do not publish odds we cannot stand behind.
      </p>
      <p className={P}>
        It is worth adding that PokeBeach, which has reported this story most closely, does not give a figure either.
        It expects the cards to be exceptionally rare and says that reliable pull rates need far more pack-opening
        data than exists a few days after release. That is the honest position: an expectation is not a measurement,
        and &quot;exceptionally rare&quot; is a description, not odds.
      </p>

      <h2 className={H2}>What the official list does say</h2>
      <p className={P}>
        The official card list runs to 167 revealed cards and accounts for the set&apos;s secret Mew slots with cards
        that are confirmed: the Futuristic rare Mew ex and Mewtwo ex, the two cards that introduced the set&apos;s new
        rarity. Those are real, they are in our catalogue, and they are what most people are actually going to pull.
        They are also, for the avoidance of doubt, <em>not</em> the RGB cards.
      </p>
      <Gallery
        cards={[
          { card: GUIDE_CARDS.c30MewExFuturistic, caption: "Confirmed Futuristic rare" },
          { card: GUIDE_CARDS.c30MewtwoExFuturistic, caption: "Confirmed Futuristic rare" },
        ]}
        width={168}
        priorityCount={2}
        note="These are NOT the RGB Mew cards. They are the confirmed Futuristic rares — Mew ex 158/128 and Mewtwo ex 157/128 — by YOSHIROTTEN, the artist reportedly connected to the RGB cards. Catalogue scans, complete card faces."
      />
      <p className={P}>
        We have deliberately not published an image of an RGB Mew. The photographs in circulation were taken by the
        collectors who pulled the cards and belong to them; the card artwork itself is Pokemon&apos;s. We have no
        authentic scan of our own, the cards are not in our catalogue, and reconstructing a card face or presenting a
        mock-up as though it were the real thing is not something we will do &mdash; least of all for a card whose
        status is the entire question. If you want to see them, go to the outlets that did the reporting and have the
        rights to the images; they are linked at the foot of this article.
      </p>

      <h2 className={H2}>What we would tell a buyer today</h2>
      <ul className={UL}>
        <li>
          <strong>Nothing about these cards is settled</strong>, including whether they are what they appear to be.
          Anyone selling one is selling an unconfirmed item.
        </li>
        <li>
          <strong>Ignore rarity claims in listing titles.</strong> &quot;1 in 20,000&quot; is a claim from one person,
          not a measurement, and it has already made its way into listings as if it were established.
        </li>
        <li>
          <strong>A price paid is not a value.</strong> Early sales of an unconfirmed card tell you what one person
          paid in an information vacuum. We are not quoting figures for this reason.
        </li>
        <li>
          <strong>The confirmed cards are the safe purchase</strong> if what you want is the YOSHIROTTEN artwork. The
          Futuristic rares are real, numbered, and on the official list.
        </li>
      </ul>

      <h2 className={H2}>We will update this</h2>
      <p className={P}>
        If The Pokemon Company confirms the cards, publishes a rarity or adds them to an official list, we will update
        this article and say what changed. Until then it stays labelled as what it is: a widely reported,
        officially unacknowledged card.
      </p>
      <p className={P}>
        For the parts of the set that are confirmed, our{" "}
        <Link href="/guides/pokemon-30th-celebration-guide" className={A}>
          30th Celebration collector&apos;s guide
        </Link>{" "}
        is the overview, and{" "}
        <Link href="/guides/pokemon-30th-celebration-mew-mewtwo" className={A}>
          the Mew and Mewtwo guide
        </Link>{" "}
        covers all six Mew and Mewtwo cards in the release, including both Futuristic rares.
      </p>
    </>
  );
}

export const NEWS_BODIES = {
  "pokemon-tcg-30th-celebration-out-now": ThirtiethOutNow,
  "rgb-mew-30th-celebration-unconfirmed": RgbMew,
};
