import Link from "next/link";
import GuideLayout, { GP, GH2, GUL } from "@/components/GuideLayout";
import { Gallery, GuideTable } from "@/components/guides/CardArt";
import { guideMetadata } from "@/lib/guides";
import { GUIDE_CARDS, GUIDE_LINK_CLASS, GUIDE_SETS, PRICE_CHECKER_HREF } from "@/lib/guideLinks";

const SLUG = "surging-sparks-which-pikachu";
export const metadata = guideMetadata(SLUG);

// Audit batch 2026-09-22, corrected the same day. One question, answered
// properly: "the Surging Sparks Pikachu" is four different cards in our
// catalogue. Verified identities, no prices, no pull rates.
//
// NO OFFICIAL SOURCE, AND THEREFORE NO OFFICIAL-VERIFICATION DATE. Every
// factual claim here is a statement about our own catalogue records; the
// registry entry deliberately carries `published` and no `updated`.
//
// REMOVED on correction: "usually 238/191 - the Special Illustration Rare
// is the one that circulates in photographs" (we hold no popularity data
// of any kind), and "a Hyper Rare priced like a Double Rare is more often
// a mislabelled listing than a bargain" (a frequency claim about listing
// errors that we have no way to measure). Neither was replaced with a
// hedged version of itself.
export default function Page() {
  return (
    <GuideLayout slug={SLUG}>
      <GP>
        Searches for &ldquo;the Surging Sparks Pikachu&rdquo; are searches for four different cards.
        They share a name and a set and nothing else that matters to your wallet: four collector
        numbers, four rarities, four markets. This guide is how to name the one you want.
      </GP>

      <GH2>The four cards</GH2>
      <GuideTable
        head={["Collector number", "Rarity", "What it is"]}
        rows={[
          ["057/191", "Double Rare", "The ex card from inside the numbered run"],
          ["219/191", "Ultra Rare", "A full-art treatment, numbered past the set total"],
          ["238/191", "Special Illustration Rare", "The illustration-led alternate art"],
          ["247/191", "Hyper Rare", "The gold treatment"],
        ]}
        caption="All four are Pikachu ex in SV08: Surging Sparks, as held in our catalogue on 22 September 2026."
      />
      <Gallery
        cards={[
          { card: GUIDE_CARDS.surgingSparksPikachuEx057, caption: "057/191 Double Rare" },
          { card: GUIDE_CARDS.surgingSparksPikachuEx219, caption: "219/191 Ultra Rare" },
          { card: GUIDE_CARDS.surgingSparksPikachuEx238, caption: "238/191 Special Illustration Rare" },
          { card: GUIDE_CARDS.surgingSparksPikachuEx247, caption: "247/191 Hyper Rare" },
        ]}
        width={150}
        note="Four separate catalogue records. Each links to its own page and its own listings."
      />
      <GP>
        Numbers above 191 are not errors. This set holds records numbered past the end of its own
        printed run, so 219, 238 and 247 all sit &ldquo;outside&rdquo; a 191-card set and are still
        part of it — a pattern we also track in several other recent sets.
      </GP>

      <GH2>Which one does a listing mean?</GH2>
      <GP>
        We cannot tell you which of the four a given seller has in mind, and we are not going to
        guess: we hold no data on which of them is searched for, photographed or sold most, so any
        answer here would be invention dressed as advice. What we can tell you is that the question
        has four answers and the listing has to pick one. If a title says only &ldquo;Pikachu ex
        Surging Sparks&rdquo;, the collector number is the thing to ask for before anything else.
      </GP>

      <GH2>Reading a listing</GH2>
      <GUL>
        <li>
          <strong>Get the number off the card in the photograph.</strong> Not the title — titles
          routinely carry the wrong one, sometimes honestly.
        </li>
        <li>
          <strong>A price that does not fit the number is a reason to check the number.</strong> It
          may be a genuine underpricing and it may be the wrong card in the title; we hold no data
          on how often each happens, so treat it as a prompt to confirm the collector number from
          the photograph rather than as a signal either way. Our own comparisons are made against a
          reference for that exact card, which is why a card with no supported reference shows no
          saving at all rather than a flattering one.
        </li>
        <li>
          <strong>Check the language.</strong> The Japanese equivalent set is a separate market —{" "}
          <Link href="/guides/japanese-vs-english-pokemon-cards" className={GUIDE_LINK_CLASS}>
            Japanese vs English
          </Link>
          .
        </li>
        <li>
          <strong>If it is graded</strong>, the number and variety should both appear in the
          grader&apos;s record —{" "}
          <Link href="/guides/check-graded-pokemon-card-certificate" className={GUIDE_LINK_CLASS}>
            how to check that
          </Link>
          .
        </li>
      </GUL>

      <GH2>Cards or packs?</GH2>
      <GP>
        If one of these four is the goal, buy that card. Packs are a purchase of the opening, and no
        pack is more likely to contain a specific card because you want it more. We publish no pull
        rates and no expected-value figures, because we hold no data that would make either of them
        true rather than plausible.
      </GP>

      <GH2>Where to go next</GH2>
      <GUL>
        <li>
          <Link href={GUIDE_SETS.surgingSparks.href} className={GUIDE_LINK_CLASS}>
            Browse Surging Sparks cards
          </Link>{" "}
          — the whole set as we track it.
        </li>
        <li>
          <Link href={PRICE_CHECKER_HREF} className={GUIDE_LINK_CLASS}>
            Look up one exact card
          </Link>{" "}
          — search by collector number once you have decided.
        </li>
        <li>
          <Link href="/guides/holo-vs-reverse-holo-pokemon-cards" className={GUIDE_LINK_CLASS}>
            Holo vs reverse holo
          </Link>{" "}
          — the other way one name covers several cards.
        </li>
      </GUL>
    </GuideLayout>
  );
}
