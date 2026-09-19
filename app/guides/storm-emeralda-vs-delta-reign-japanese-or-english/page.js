import Link from "next/link";
import GuideLayout, { GP, GH2, GUL } from "@/components/GuideLayout";
import { Srcs, SourceList } from "@/components/guides/Src";
import { guideMetadata } from "@/lib/guides";
import { PRICE_CHECKER_HREF, GUIDE_LINK_CLASS } from "@/lib/guideLinks";

const SLUG = "storm-emeralda-vs-delta-reign-japanese-or-english";
export const metadata = guideMetadata(SLUG);

// Delta Reign pre-launch cluster (2026-09-20). The buying decision that
// exists today: a Japanese Storm Emeralda card now, or the English Delta
// Reign card in November. No prices; the difference is structural.
export default function Page() {
  return (
    <GuideLayout slug={SLUG}>
      <GP>
        Since 31 July 2026 you have been able to buy the Japanese cards that <em>Delta Reign</em> will draw from:
        the set is <em>M6: Storm Emeralda</em>, and Mega Rayquaza ex is in it. The English expansion follows on 6
        November 2026. <Srcs ids={["drExpansion"]} /> The question collectors are actually asking is which one to
        buy. The answer depends on what you want the card <em>for</em>, because they are two different cards.
      </GP>

      <GH2>Why they are different products</GH2>
      <GUL>
        <li>
          <strong>Language and set.</strong> A Storm Emeralda card is printed in Japanese with the Japanese set&apos;s
          symbol and code; the Delta Reign card will be printed in English with its own. Our card matching treats
          them as separate cards, and each gets its own page and its own market reference.
        </li>
        <li>
          <strong>Numbering.</strong> The Japanese set has 76 main-set cards (113 with the secret rares above the
          printed total, per collector sites). The English set is &ldquo;over 135 cards&rdquo; by the official
          wording, so the numbering will not line up, and a Japanese number is not a prediction of an English one.
        </li>
        <li>
          <strong>Contents.</strong> English sets in the Mega Evolution Series have not been one-to-one copies of
          their Japanese sources. Some Japanese cards may not appear in English; some English cards may come from
          elsewhere. Nobody outside The Pokemon Company knows the mapping yet.
        </li>
        <li>
          <strong>Market.</strong> The two cards trade in different pools with different references. A Japanese
          price says nothing about what the English card will trade at, in either direction.
        </li>
      </GUL>

      <GH2>Buy the Japanese card now if&hellip;</GH2>
      <GUL>
        <li>You want the artwork, and language does not matter to you.</li>
        <li>You collect Japanese cards already, or want the set as it was first printed.</li>
        <li>
          You are happy to price it as a Japanese card &mdash; against Japanese solds, not against whatever the
          English card later does.
        </li>
      </GUL>

      <GH2>Wait for the English card if&hellip;</GH2>
      <GUL>
        <li>You collect English sets, want the English set symbol and number, or want the card for Standard play.</li>
        <li>You plan to grade it: a Japanese and an English copy are graded and sold as different cards.</li>
        <li>
          You want a market reference before you pay. The English card will have none until it is listed and
          priced; the Japanese card has one now.
        </li>
      </GUL>

      <GH2>Reading a listing today</GH2>
      <GUL>
        <li>
          <strong>&ldquo;Delta Reign&rdquo; in a title over a Japanese card</strong> is the common mix-up. Check the
          language and set symbol in the photos; our{" "}
          <Link href="/guides/how-to-find-pokemon-card-set-and-number" className={GUIDE_LINK_CLASS}>
            set-and-number guide
          </Link>{" "}
          shows where they are printed.
        </li>
        <li>
          <strong>&ldquo;Leaked Delta Reign card&rdquo;</strong> describes a Japanese card that has been on sale
          since July. The photographs that circulated on 28 July 2026, three days before the Japanese release, were
          of Storm Emeralda cards that then released. There is nothing secret about them now.
        </li>
        <li>
          <strong>&ldquo;English&rdquo; listed before 6 November</strong> is a preorder of a card that does not yet
          exist, or a mislabelled Japanese card. Read{" "}
          <Link href="/guides/delta-reign-preorders-and-prerelease-what-to-know" className={GUIDE_LINK_CLASS}>
            preorders and prerelease
          </Link>{" "}
          before paying for either.
        </li>
        <li>
          A Japanese card&apos;s reference can be checked with the{" "}
          <Link href={PRICE_CHECKER_HREF} className={GUIDE_LINK_CLASS}>
            price checker
          </Link>{" "}
          where we hold the printing; if we do not, the page says so rather than showing a figure from the wrong
          set.
        </li>
      </GUL>

      <GH2>What we will not do</GH2>
      <GP>
        We will not show a Japanese reference on an English card&apos;s page, or the reverse, and we will not claim a
        saving for either until a reference for that exact printing and condition exists. That is the same rule that
        applied to 30th Celebration before its release day. The official facts about the English set are collected in{" "}
        <Link href="/guides/pokemon-delta-reign-release-date-what-is-official" className={GUIDE_LINK_CLASS}>
          Delta Reign: what is official so far
        </Link>
        .
      </GP>

      <SourceList ids={["drExpansion", "drAnnounce"]}>
        Reporting cited by name above: PokeBeach (all 76 Storm Emeralda main-set cards revealed, July 2026),
        PokemonCard.io (Japanese M6 Storm Emeralda reveal), PokePursuit (the 28 July 2026 photographs, reported as
        unconfirmed at the time). Official pages read on 20 September 2026.
      </SourceList>
    </GuideLayout>
  );
}
