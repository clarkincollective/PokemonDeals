import Link from "next/link";

// Story bodies, one per written news item, keyed by slug. Kept out of the
// route so the route stays a thin renderer that both kinds of item share.
//
// House rules, the same ones the guides follow: no price, pull-rate or
// stock claim; nothing stated that an official page does not say; and a
// news item signposts the in-depth page rather than restating it, so
// /news/<slug> and the guide are never near-duplicates of each other.

const P = "mt-4 text-base leading-relaxed text-zinc-700 dark:text-zinc-300";
const H2 = "mt-8 text-xl font-bold text-black dark:text-zinc-50";
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

export const NEWS_BODIES = {
  "pokemon-tcg-30th-celebration-out-now": ThirtiethOutNow,
};
