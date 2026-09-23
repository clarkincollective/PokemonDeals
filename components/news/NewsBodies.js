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

// Delta Reign: three tiers of fact, kept apart on the page - what The
// Pokemon Company has said about the English set; what is already printed
// and on sale in Japan (a real product, but a different one); and what
// circulated as a leak before Japan's release. No Delta Reign card exists
// in our catalogue yet, so the gallery shows the Rayquaza cards we DO hold
// and says so. No English card numbers, rarities or pull rates are
// asserted - the English list is not published.
function DeltaReign() {
  return (
    <>
      <p className={P}>
        The next English expansion after <em>30th Celebration</em> is <em>Mega Evolution&mdash;Delta Reign</em>,
        released on 6 November 2026 and led by Mega Rayquaza ex. Unusually, a great deal about it is already known
        in detail, and the reason is simple: the Japanese set it draws from has been on sale since July. What follows
        separates three things people are running together &mdash; what is official for the English set, what is
        already printed in Japan, and what circulated as a leak in July.
      </p>

      {/* 2026-09-23 forward note. Two claims below were overtaken by the
          official card reveal: that no numbering had been published, and
          that the Legendary Stadium was only "widely reported". The dated
          statements stay as written - this was true when published - but a
          reader must not meet a superseded claim without being sent to the
          correction. Same-kind linking belongs inline, as here, because
          lib/editorialRelated is cross-kind only. */}
      <p className={`${P} rounded-lg border border-zinc-200 bg-white p-3 text-sm dark:border-zinc-800 dark:bg-zinc-950`}>
        <strong className="text-black dark:text-zinc-50">Update, 23 September 2026.</strong> The first English
        cards have since been revealed officially, which settles two things this article could not: the set
        numbers out of <strong>103</strong> under the code DLR, and the Legendary Summit Stadium turns out to be
        two cards you combine. See{" "}
        <Link href="/news/delta-reign-english-cards-revealed" className={A}>
          Delta Reign English cards revealed
        </Link>
        . The sections below are left as first published.
      </p>

      <Gallery
        cards={[
          { card: GUIDE_CARDS.rayquazaAscendedHeroes, caption: "Rayquaza, Ascended Heroes — in our catalogue now" },
          { card: GUIDE_CARDS.c30ClassicRayquazaEx, caption: "Rayquaza EX, Classic Collection reprint — in our catalogue now" },
        ]}
        width={168}
        priorityCount={2}
        note="These are the Rayquaza cards we hold today, not Delta Reign cards. No Delta Reign card is in our catalogue yet; the set's cards will appear here once it is listed and priced."
      />

      <h2 className={H2}>What is official for the English set</h2>
      <ul className={UL}>
        <li>
          <strong>Release: 6 November 2026.</strong> Stated on the official expansion page and announcement.
        </li>
        <li>
          <strong>Size: &quot;over 135 cards&quot;</strong>, with &quot;more than 20 Trainer cards&quot; and
          &quot;more than 35 Pokemon and Trainer cards with special illustrations&quot; &mdash; the official
          wording, and deliberately approximate. No exact English count or numbering has been published.
        </li>
        <li>
          <strong>Named cards:</strong> Mega Rayquaza ex, Mega Golurk ex, Mega Malamar ex and Mega Golisopod ex.
          Those four are the only cards the official English pages name.
        </li>
        <li>
          <strong>Series and format:</strong> Mega Evolution Series; Standard-legal.
        </li>
      </ul>
      <p className={P}>
        A new mechanic, the <strong>Legendary Stadium</strong>, is widely reported: two Stadium cards played as a
        pair, forming one extended artwork when placed side by side. Reporting from PokeBeach and PokemonCard.io
        names three pairs in the Japanese set. We are treating the mechanic&apos;s English details as reported rather
        than official until the English pages describe it.
      </p>

      <h2 className={H2}>What is already out in Japan</h2>
      <p className={P}>
        The Japanese source set is <em>M6: Storm Emeralda</em>, released in Japan on 31 July 2026. PokeBeach reported
        all 76 of its main-set cards before release; collector sites put the total at 113 once the secret rares above
        the printed total are counted. It introduced Mega Rayquaza ex, the three other Mega Pokemon ex named above, and the
        Legendary Stadium pairs. Those cards are real, printed, and on sale &mdash; in Japanese.
      </p>
      <p className={P}>
        That last word matters for anyone shopping now. A Japanese Storm Emeralda card is a different product from
        the English Delta Reign card that will follow it: different language, different set, different numbering,
        and a different market reference on this site. Buying one is a perfectly good way to own the artwork early.
        It is not a way to own the English card, and a listing that blurs the two should be read carefully. Our{" "}
        <Link href="/guides/how-to-find-pokemon-card-set-and-number" className={A}>
          set-and-number guide
        </Link>{" "}
        covers where the language and set are printed.
      </p>

      <h2 className={H2}>The July &quot;leak&quot;, and why it no longer is one</h2>
      <p className={P}>
        On 28 July 2026, three days before the Japanese release, photographs of 14 cards said to be from Storm
        Emeralda circulated online: special illustration rares of Mega Rayquaza ex, Mega Golurk ex, Mega Golisopod
        ex, Raikou ex and a Supporter, a gold Mega Rayquaza ex, and eight illustration rares. PokePursuit reported
        them at the time with the caveat that none had been officially revealed and all should be treated as
        unconfirmed.
      </p>
      <p className={P}>
        That caveat has since expired in the most ordinary way: the Japanese set released and the cards are in it.
        What was a leak in July is now simply a Japanese card you can buy. It is worth being clear about this because
        &quot;leaked Delta Reign card&quot; still appears in listing titles as though it meant something secret.
      </p>
      <p className={P}>
        What remains genuinely unknown is the English side: which of the 113 Japanese cards carry over, at what
        English collector numbers, and at which English rarities. English sets in this series have not been
        one-to-one copies of their Japanese sources, so a Japanese number is not a prediction of an English one.
        We will not guess at any of it.
      </p>

      <h2 className={H2}>What we would tell a buyer today</h2>
      <ul className={UL}>
        <li>
          <strong>Japanese now, English in November</strong> &mdash; two different cards. Decide which you want
          before you decide what to pay.
        </li>
        <li>
          <strong>No English pull rates, counts or prices exist yet.</strong> Any figure attached to Delta Reign
          singles today is either a Japanese figure or an invention.
        </li>
        <li>
          <strong>Sealed English product does not exist yet either.</strong> A &quot;Delta Reign&quot; box listed
          today is a preorder. Our listings for an unreleased set are held until eBay confirms each one is active
          &mdash; the same rule that applied to 30th Celebration before its release day.
        </li>
        <li>
          <strong>Prerelease events</strong> are reported by PokeBeach for the week before release; a prerelease
          card is a stamped set card with the set&apos;s own number, as our{" "}
          <Link href="/guides/pokemon-promo-card-numbers" className={A}>
            promo-numbers guide
          </Link>{" "}
          explains.
        </li>
      </ul>

      <h2 className={H2}>We will update this</h2>
      <p className={P}>
        When the English card list is published, when the set enters our catalogue, and on release day, this
        article will be updated and will say what changed. The{" "}
        <Link href="/latest-releases" className={A}>
          latest releases
        </Link>{" "}
        page carries the official date alongside the other current expansions.
      </p>
    </>
  );
}

// 2026-09-23. The first English Delta Reign cards. Every card detail below
// was read from the SIX card images published on the official expansion
// page (pokemon.com) - names, HP, ability and attack text, and the
// collector numbers that give us the set code, regulation mark and printed
// total for the first time.
//
// WHY THIS IS NOT A LEAK, AND WHY THAT MATTERS HERE. PokeBeach reports that
// TPCi's own European branch sent the wider image set to press outlets.
// That is a press distribution, the opposite of the July leak the sibling
// article covers. We say so explicitly: this site has a standing rule
// against reproducing leaked material, and a reader arriving from "delta
// reign leak" deserves to be told the difference.
//
// NO CARD IMAGE IS REPRODUCED HERE. The official images sit on pokemon.com's
// own CDN, which is not in our next/image allowlist, and they are TPCi press
// assets sent to named outlets we are not among. The cards are showcased in
// detail and linked to the page that shows them.
function DeltaReignCards() {
  return (
    <>
      <p className={P}>
        The first English <em>Mega Evolution&mdash;Delta Reign</em> cards are public, and the framing matters:
        these are <strong>not</strong> leaks. Six card images are on the official expansion page, and PokeBeach
        reports that TPCi&apos;s European branch sent a wider set of images directly to press outlets. That is a
        press reveal, not the July leak that preceded it.
      </p>
      <p className={P}>
        Everything below was read from those six official images. They also settle something our earlier piece
        said had not been published: the set&apos;s numbering.
      </p>

      <h2 className={H2}>The numbering, visible for the first time</h2>
      <ul className={UL}>
        <li>
          <strong>Set code DLR</strong>, printed in the black box at the foot of every card beside{" "}
          <strong>EN</strong>.
        </li>
        <li>
          <strong>Regulation mark J</strong>, the single letter to the left of that box.
        </li>
        <li>
          <strong>A printed total of 103.</strong> All six read <em>nnn/103</em>.
        </li>
      </ul>
      <p className={P}>
        Hold that 103 against the official &ldquo;over 135 cards&rdquo; and the gap is the interesting part: the
        cards above 103 are the ones numbered past the printed total, which is where modern sets put their
        premium printings. If that numbering is unfamiliar, our{" "}
        <Link href="/guides/how-to-find-pokemon-card-set-and-number" className={A}>
          set-and-number guide
        </Link>{" "}
        covers why a number can exceed its own set total.
      </p>

      <h2 className={H2}>The four Mega Evolution ex cards</h2>
      <p className={P}>
        These four were the only cards the official pages previously named. Now they are shown in full.
      </p>
      <ul className={UL}>
        <li>
          <strong>Mega Rayquaza ex &mdash; 084/103.</strong> A Basic, 280 HP. Its Ability{" "}
          <em>Ruler&apos;s Roar</em> triggers once, when you play it from your hand onto your Bench: look at the
          top 4 cards of your deck, attach a Basic Energy found there to this Pokemon, and shuffle the rest to
          the bottom. Its attack <em>Storm Emerald</em> does 50 damage for each of two Energy types attached
          across all of your Pokemon.
        </li>
        <li>
          <strong>Mega Golurk ex &mdash; 047/103.</strong> Stage 1, evolves from Golett, 350 HP &mdash; the
          highest of the four. Its Ability <em>Restricted Activation</em> is a real cost: it cannot attack at
          all unless you have 10 or more cards in hand. <em>Goliath&apos;s Punch</em> hits for 300 and does 30
          damage to itself.
        </li>
        <li>
          <strong>Mega Golisopod ex &mdash; 011/103.</strong> Stage 1, evolves from Wimpod, 340 HP.{" "}
          <em>Finishing Blow</em> does 60, plus 160 more if the opponent&apos;s Active Pokemon already has
          damage counters on it. <em>Quadruple Hold</em> does 160 and stops the Defending Pokemon retreating
          next turn.
        </li>
        <li>
          <strong>Mega Malamar ex &mdash; 069/103.</strong> Stage 1, evolves from Inkay, 320 HP.{" "}
          <em>Psychic Marionette</em> does 70 damage for each of the opponent&apos;s Benched Pokemon;{" "}
          <em>Eerie Wave</em> does 200 and leaves the Active Pokemon Confused.
        </li>
      </ul>

      <h2 className={H2}>Legendary Summit is two cards, not one</h2>
      <p className={P}>
        The mechanic our earlier piece could only call &ldquo;widely reported&rdquo; is now confirmed on the
        cards themselves, and it is stranger than a normal Stadium. <strong>096/103</strong> and{" "}
        <strong>097/103</strong> are both called <em>Legendary Summit</em>, and each carries the same
        instruction: you cannot play it by itself, and you must combine <strong>two different</strong>{" "}
        <em>Legendary Summit</em> cards from your hand to play them as one Stadium. The artwork runs
        continuously across the pair, so the two halves form a single panorama.
      </p>
      <p className={P}>
        Once in play, the combined Stadium reads: whenever a star Pokemon &mdash; either player&apos;s &mdash;
        is Knocked Out by damage from an attack from the opponent&apos;s Pokemon, that player takes 1 fewer
        Prize card.
      </p>
      <p className={P}>
        For a buyer, that two-card requirement is the thing to watch. A listing offering &ldquo;Legendary
        Summit&rdquo; is offering one of two different cards, and only one of them is the half you are missing.
        It is the same trap a shared collector number sets elsewhere, and the reason our{" "}
        <Link href="/guides/how-to-read-a-pokemon-card-listing" className={A}>
          listing-reading guide
        </Link>{" "}
        starts with identity rather than price.
      </p>

      <h2 className={H2}>What is still not known</h2>
      <ul className={UL}>
        <li>
          <strong>The full English list.</strong> Six cards are on the official page and PokeBeach&apos;s
          gallery shows more. Neither is the complete 103.
        </li>
        <li>
          <strong>Rarity and print treatment</strong> for most numbers, which these images do not settle.
        </li>
        <li>
          <strong>Anything about price, pull rates or availability.</strong> No Delta Reign card is in our
          catalogue, so we hold no reference for one and will not estimate.
        </li>
      </ul>

      <Gallery
        cards={[
          { card: GUIDE_CARDS.rayquazaAscendedHeroes, caption: "Rayquaza, Ascended Heroes — in our catalogue now" },
          { card: GUIDE_CARDS.c30ClassicRayquazaEx, caption: "Rayquaza EX, Classic Collection reprint — in our catalogue now" },
        ]}
        width={168}
        note="The Rayquaza cards we hold and can price today. Neither is a Delta Reign card, and no Delta Reign card is in our catalogue yet — the six revealed cards are on the official expansion page linked below."
      />

      <p className={P}>
        For the release date, the Japanese source set and where the July leak fits, see{" "}
        <Link href="/news/mega-evolution-delta-reign-what-is-known" className={A}>
          our earlier Delta Reign piece
        </Link>
        , or the{" "}
        <Link href="/guides/pokemon-delta-reign-release-date-what-is-official" className={A}>
          release-date guide
        </Link>{" "}
        for what is official versus reported.
      </p>
    </>
  );
}

export const NEWS_BODIES = {
  "delta-reign-english-cards-revealed": DeltaReignCards,
  "mega-evolution-delta-reign-what-is-known": DeltaReign,
  "pokemon-tcg-30th-celebration-out-now": ThirtiethOutNow,
  "rgb-mew-30th-celebration-unconfirmed": RgbMew,
};
