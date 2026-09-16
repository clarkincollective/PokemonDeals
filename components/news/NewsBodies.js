import Link from "next/link";
import Image from "next/image";
import { Gallery } from "@/components/guides/CardArt";
import { GUIDE_CARDS } from "@/lib/guideLinks";

// A supplied photograph rather than a catalogue scan. Credit is required
// and the caption carries it, so a reader always knows whose image this is
// and that it is not our own scan. Dimensions are reserved so the lazy
// image never shifts the article as it loads.
function PhotoFigure({ src, width, height, alt, caption, priority = false }) {
  return (
    <figure className="mt-6 overflow-hidden rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
      <Image
        src={src}
        alt={alt}
        width={width}
        height={height}
        sizes="(max-width: 768px) 100vw, 720px"
        priority={priority}
        className="h-auto w-full"
      />
      <figcaption className="border-t border-zinc-200 px-5 py-3 text-xs leading-relaxed text-zinc-600 dark:border-zinc-800 dark:text-zinc-400">
        {caption}
      </figcaption>
    </figure>
  );
}

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

      <Gallery
        cards={[
          { card: GUIDE_CARDS.c30PikachuRare023, caption: "One of the thirty Pikachu rares" },
          { card: GUIDE_CARDS.c30MewExFuturistic, caption: "Futuristic rare - the new rarity" },
          { card: GUIDE_CARDS.c30PikachuExSir149, caption: "Special illustration rare" },
          { card: GUIDE_CARDS.c30ClassicCharizard, caption: "Classic Collection reprint, 4/102" },
        ]}
        width={150}
        priorityCount={4}
        note="Four of the card types in the release. Catalogue scans, complete card faces; each links to its own card page."
      />

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

      <PhotoFigure
        src="/news/rgb-mew-trio.jpg"
        width={1200}
        height={577}
        alt="Three reported RGB Mew cards held in hand, in red, green and blue, each showing a Mew silhouette over a radiating background"
        caption="The three reported RGB Mew variants. Photograph via PokeBeach reporting; card artwork © Pokemon. This is a collector's photograph of a reported pull, not a scan of our own, and it has been resized and sharpened in circulation — read it for the colours and the layout, not for the fine print."
        priority
      />

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

      <PhotoFigure
        src="/news/rgb-mew-blue.jpg"
        width={800}
        height={942}
        alt="A reported blue RGB Mew card in a sleeve, showing a green and yellow Mew silhouette on a blue radiating background"
        caption="The blue variant. Photograph via PokeBeach reporting; card artwork © Pokemon."
      />

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

      <PhotoFigure
        src="/news/rgb-mew-red.jpg"
        width={800}
        height={933}
        alt="A reported red RGB Mew card held in hand, showing a blue Mew silhouette on a red radiating background"
        caption="The red variant, from the early openings. Photograph via PokeBeach reporting; card artwork © Pokemon."
      />

      <h2 className={H2}>eBay removed the early listings</h2>
      <p className={P}>
        This is the part that matters most if you are thinking about buying one, and it is a matter of record rather
        than rumour. In August 2026, before the set released, eBay began removing listings for unreleased{" "}
        <em>30th Celebration</em> cards under its <strong>Stolen Property Policy</strong>, after being contacted by
        The Pokemon Company International. Sellers who received a removal notice were told that TPCi had indicated the
        cards were not, at that time, distributed or available for public sale through authorised channels. The
        crackdown was reported by PokeBeach, Dexerto and Wargamer among others.
      </p>
      <p className={P}>
        Two things follow from that, and they pull in different directions. It is the clearest signal yet that the
        early product genuinely was outside authorised distribution &mdash; TPCi does not send that kind of notice
        about cards it has released. But it applied to <em>pre-release</em> listings: the expansion has since released
        normally on 16 September, so a card pulled from a pack bought in a shop this week is in an entirely different
        position from one sold in August.
      </p>
      <p className={P}>
        The practical warning is narrow and worth heeding. If you are offered an RGB Mew, when and how the seller
        obtained it is a fair question, and a listing that cannot answer it is one to leave alone. We have no way to
        tell you which side of that line any individual card falls on, and neither, in most cases, will the listing.
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
      <PhotoFigure
        src="/news/rgb-mew-green.jpg"
        width={800}
        height={952}
        alt="A reported green RGB Mew card held in a sleeve, showing a red Mew silhouette on a green radiating background"
        caption="The green variant. Photograph via PokeBeach reporting; card artwork © Pokemon."
      />
      <p className={P}>
        A word on these photographs, because this article is about not treating unverified things as settled. They are
        collectors&apos; and reporters&apos; images of reported pulls, not scans we have taken, and the versions in
        circulation have been resized and sharpened as they have been passed around &mdash; which visibly degrades the
        small text. Different copies of the same photograph disagree with each other on the fine print. So treat them
        as evidence of what the cards look like: three colours, a Mew silhouette, a radiating background. Do not treat
        them as a reliable reading of the card&apos;s name, attack or wording, and do not use them to authenticate a
        card you are being offered.
      </p>
      <p className={P}>
        We have not reconstructed, redrawn or AI-enhanced anything here, and we will not. When the cards enter our
        catalogue, these will be replaced with our own scans, the same source every other card image on this site
        comes from.
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
          <strong>Ask when and where it was obtained.</strong> eBay removed pre-release listings of this set under its
          Stolen Property Policy after a notice from TPCi. That was about August listings, not cards pulled since
          release &mdash; but it makes provenance a reasonable thing to ask about.
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
