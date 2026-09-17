import Link from "next/link";
import GuideLayout, { GP, GH2, GUL } from "@/components/GuideLayout";
import { Gallery, GuideTable } from "@/components/guides/CardArt";
import { guideMetadata } from "@/lib/guides";
import { GUIDE_CARDS, PRICE_CHECKER_HREF, GUIDE_LINK_CLASS } from "@/lib/guideLinks";

const SLUG = "spotting-fake-pokemon-cards-in-listings";
export const metadata = guideMetadata(SLUG);

// Buying-side guide: what a LISTING can and cannot tell you. Deliberately
// not a "ten signs your card is fake" page - most such rules have real
// exceptions, and a photo cannot settle the question either way. Every
// factual claim about counterfeits is attributed to The Pokemon Company's
// own support article or to eBay's published authentication programme.
// Nothing here names a seller, and no card image is presented as evidence
// that a particular physical card is genuine.

const SOURCES = {
  support: {
    href: "https://support.pokemon.com/hc/en-us/articles/360002068953-Did-I-purchase-fake-or-counterfeit-cards",
    label: "Pokemon Support: Did I purchase fake or counterfeit cards?",
    short: "Pokemon Support",
  },
  ebayAg: {
    href: "https://www.ebay.com/authenticity-guarantee/tradingcards",
    label: "eBay Authenticity Guarantee for Trading Cards (buyer page)",
    short: "eBay Authenticity Guarantee",
  },
  ebayAgSeller: {
    href: "https://pages.ebay.com/authenticity-guarantee-tradingcards-seller/",
    label: "eBay Authenticity Guarantee for Trading Cards (programme details)",
    short: "eBay programme details",
  },
  celebration: {
    href: "https://www.pokemon.com/us/news/get-ready-for-pokemon-tcg-30th-celebration",
    label: "Get Ready for Pokemon TCG: 30th Celebration (pokemon.com)",
    short: "30th Celebration announcement",
  },
  expansion: {
    href: "https://tcg.pokemon.com/en-us/expansions/30th-celebration/",
    label: "Official 30th Celebration expansion page",
    short: "expansion page",
  },
};

const SRC_LINK =
  "text-zinc-500 underline decoration-zinc-300 underline-offset-2 hover:text-red-600 dark:text-zinc-400 dark:hover:text-red-500";

function Src({ id, children }) {
  const s = SOURCES[id];
  const link = (
    <a href={s.href} rel="noopener noreferrer" target="_blank" className={SRC_LINK}>
      {children ?? s.short}
    </a>
  );
  if (children) return link;
  return <span className="text-sm text-zinc-500 dark:text-zinc-400">(source: {link})</span>;
}

const C = GUIDE_CARDS;

// Legitimate reasons a real card can look "wrong" to someone expecting one
// canonical appearance. Each row points at the guide that explains it.
const LEGITIMATE = [
  [
    "Same card, different printing run",
    "Base Set Charizard exists as 1st Edition, Shadowless and Unlimited. They differ in the art-frame shadow, the copyright line and more - all genuine.",
    "Base Set printings",
    "/guides/base-set-shadowless-unlimited-first-edition",
  ],
  [
    "A promo number that looks malformed",
    "Promos do not use 25/102 numbering. BW90, SWSH042, SVP 053 and a plain black-star 8 are all correct for their eras.",
    "Promo numbers explained",
    "/guides/pokemon-promo-card-numbers",
  ],
  [
    "A modern card of a classic",
    "30th Celebration's Classic Collection reprints older cards in a current frame. A 2026 Charizard that looks nothing like a 1999 one is not evidence of a fake.",
    "Reprint or original?",
    "/guides/pokemon-30th-celebration-classic-collection",
  ],
  [
    "Foil where you did not expect it",
    "In 30th Celebration every card is foil, including Basic Energy. A shiny Basic Energy from that set is exactly what it should be.",
    "30th Celebration guide",
    "/guides/pokemon-30th-celebration-guide",
  ],
  [
    "A rarity you have never seen",
    "30th Celebration introduced Futuristic Rare, headlined by Mew ex and Mewtwo ex. New rarities appear regularly.",
    "Mew and Mewtwo",
    "/guides/pokemon-30th-celebration-mew-mewtwo",
  ],
];

export default function Page() {
  return (
    <GuideLayout slug={SLUG}>
      <GP>
        You are looking at a listing, something feels off, and you want to know whether to buy it. This page is about
        that decision. It is not a list of ten tells that prove a card is fake &mdash; most such rules have real
        exceptions, and a photograph cannot settle authenticity in either direction. What a listing <em>can</em> do is
        give you enough to walk away, or enough to ask better questions before your money moves.
      </GP>

      <GH2>What the official guidance actually says</GH2>
      <GP>
        The Pokemon Company&apos;s own support article on counterfeits is short, and worth reading before any
        third-party checklist. Its suggestions are about a card <em>in your hands</em>, not a photo: holding a card up
        to a bright light, because many counterfeits are easier to see through that way; knowing what official
        packaging looks like, so a knock-off box does not get the benefit of the doubt; and price &mdash; a pack
        priced dramatically below suggested retail is treated as a near-certain sign of counterfeit merchandise. It
        also suggests asking a shop that specialises in trading cards to look at anything you are unsure about.{" "}
        <Src id="support" />
      </GP>
      <GP>
        Notice what is missing: no font chart, no border measurement, no universal texture rule. That restraint is
        deliberate, and this guide follows it. Print runs, regional printings and finishes vary legitimately, and a
        rule that holds for one era can be wrong for the next.
      </GP>

      <GH2>Why a photograph cannot settle it</GH2>
      <GP>
        Three of the most commonly cited tells are exactly the ones a listing photo handles worst.
      </GP>
      <GUL>
        <li>
          <strong>Colour.</strong> White balance, phone processing and lighting shift card colour far more than a
          print-run difference does. Any colour comparison worth acting on happens <em>physically</em>, with both
          cards under the same light &mdash; not across two photographs taken in different rooms.
        </li>
        <li>
          <strong>Shine.</strong> Holo pattern and gloss depend almost entirely on the angle of the light. A flat,
          dull-looking holo usually means the photo was taken straight on.
        </li>
        <li>
          <strong>Price.</strong> A low price is a reason to look harder, and the official guidance treats a
          far-below-retail sealed pack as a serious warning. But a cheap single is not proof of anything: condition, a
          motivated seller and a thin market all produce genuine bargains.
        </li>
      </GUL>
      <GP>
        The same applies in reverse. A crisp, well-lit, convincing photo is not proof a card is real &mdash; it may
        not even be a photo of the card you will receive. A single image, whatever it shows, is not an authentication.
      </GP>

      <GH2>Real cards that look wrong</GH2>
      <GP>
        A large share of &ldquo;is this fake?&rdquo; questions are about genuine cards whose appearance is
        unfamiliar. Before treating an oddity as a red flag, check whether it has an ordinary explanation.
      </GP>
      <GuideTable
        head={["What looks wrong", "The ordinary explanation", "Where it is explained"]}
        rows={LEGITIMATE.map(([a, b, label, href]) => [
          a,
          b,
          <Link key={href} href={href} className={GUIDE_LINK_CLASS}>
            {label}
          </Link>,
        ])}
        minWidth="54rem"
      />
      <GP>
        The 30th Celebration facts above &mdash; every card foil including Basic Energy, and the new Futuristic Rare
        rarity &mdash; come from the official announcement and expansion page (
        <Src id="celebration">announcement</Src>, <Src id="expansion">expansion page</Src>).
      </GP>
      <Gallery
        cards={[
          { card: C.charizardShadowless, caption: "Shadowless printing" },
          { card: C.charizardBaseSet, caption: "Unlimited printing" },
          { card: C.c30ClassicCharizard, caption: "2026 Classic Collection reprint" },
        ]}
        width={190}
        note={
          <>
            Three genuine Charizards that look materially different from one another. These are catalogue images of
            the expected printings, shown to illustrate legitimate variation &mdash; they are not evidence about any
            particular seller&apos;s physical card, and cannot be used as one.
          </>
        }
      />

      <GH2>What to ask a seller for</GH2>
      <GP>
        The practical move on a listing you are unsure about is not to squint harder at the photo you have. It is to
        ask for photos that are hard to fake and easy to read.
      </GP>
      <GUL>
        <li>
          <strong>The actual card, not a stock image.</strong> Ask for a photo of the card next to something
          identifying &mdash; a handwritten note with their username and the date is the usual request.
        </li>
        <li>
          <strong>The back, flat and straight on.</strong> It is the part most often cropped out of a listing photo,
          and having it in good light lets you look properly once the card arrives.
        </li>
        <li>
          <strong>Both edges, at an angle.</strong> Useful for spotting a card that has been trimmed, which matters
          for grading value even when the card is genuine.
        </li>
        <li>
          <strong>The holo at two different angles.</strong> One angle tells you little; two tell you whether the
          pattern moves as it should.
        </li>
        <li>
          <strong>For a graded card, the label and certification number.</strong> Then verify that number on the
          grader&apos;s own site and check it describes the same card.
        </li>
      </GUL>
      <GP>
        A seller who will not photograph the card they are selling has answered the question for you. Refusal is the
        signal &mdash; not any single feature of the image.
      </GP>

      <GH2>When to pay someone else to decide</GH2>
      <GP>
        Past a certain value, stop reasoning from photographs. The Pokemon Company&apos;s own suggestion is to take a
        questionable card to a shop that specialises in trading cards. <Src id="support" /> For a purchase you have
        not made yet, eBay&apos;s Authenticity Guarantee does this inside the transaction: on eligible trading-card
        listings the card ships to PSA first, and for an ungraded card their experts run a multi-point inspection and
        check the listing details before it continues to you. For a graded card they authenticate the case and label
        rather than regrading it, and the programme accepts slabs from PSA, SGC, CGC Cards and BGS. It applies
        above a published value threshold rather than to every listing (<Src id="ebayAg">buyer page</Src>,{" "}
        <Src id="ebayAgSeller">programme details</Src>).
      </GP>
      <GP>
        That threshold and the coverage differ by marketplace and change over time, so read the current figure on
        eBay&apos;s own page and check for the badge on the listing itself rather than assuming. Below it, on a card
        expensive enough to hurt, buying one already graded by a
        recognised grader moves the authenticity question to someone who examined the physical card. Our{" "}
        <Link href="/guides/raw-vs-graded-pokemon-cards" className={GUIDE_LINK_CLASS}>
          raw vs graded
        </Link>{" "}
        guide covers what that costs you and when it is worth it.
      </GP>

      <GH2>What this site screens, and what it does not</GH2>
      <GP>
        Every listing shown here passes an automated screen before it is displayed. It is worth being precise about
        what that does.
      </GP>
      <GUL>
        <li>
          <strong>Listing wording.</strong> Titles that advertise a proxy, a custom or a reproduction are rejected
          outright, so a card that openly describes itself as not genuine never reaches a deal page.
        </li>
        <li>
          <strong>Listing photos.</strong> An out-of-band visual screen compares a listing&apos;s image against the
          catalogue artwork for the card it was matched to. A counterfeit verdict hides the listing; a wrong-printing
          verdict also hides it, as a matching error rather than an accusation.
        </li>
        <li>
          <strong>Identity.</strong> A listing must still match the catalogue card it was matched to, and the link
          must open that exact listing, or it is not shown.
        </li>
      </GUL>
      <GP>
        The limitations matter more than the checks. This screening reads a listing &mdash; its words and its
        photographs &mdash; and nobody here handles the card. It cannot detect a counterfeit that is photographed well,
        or one listed with an honest-looking title. Listings that have not been screened carry no verdict at all, and
        absence of a verdict is not a pass. Nothing on this site is an authenticity guarantee, and a listing appearing
        here is not a statement that the physical card is genuine. Treat it as a filter that removes some bad
        listings, not as a substitute for the checks above.
      </GP>

      <GH2>A short working order</GH2>
      <GUL>
        <li>Check whether the odd thing has an ordinary explanation &mdash; printing, promo numbering, reprint, finish.</li>
        <li>
          Compare the listing against the card&apos;s own page for the expected printing and a recent-sold reference:
          start from the{" "}
          <Link href={PRICE_CHECKER_HREF} className={GUIDE_LINK_CLASS}>
            price checker
          </Link>
          .
        </li>
        <li>Ask for the specific photos above. Judge the response, not just the images.</li>
        <li>Above a value you would mind losing, buy graded or buy through an authentication programme.</li>
        <li>If you have already bought and you believe it is counterfeit, open a dispute with the marketplace first.</li>
      </GUL>
      <GP>
        Reference prices on this site are recent-sold guides, not valuations, and they say nothing about whether a
        particular card is genuine. A price that looks too good is a prompt to ask questions, and that is all it is.
      </GP>
    </GuideLayout>
  );
}
