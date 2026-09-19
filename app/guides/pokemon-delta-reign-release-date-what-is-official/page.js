import Link from "next/link";
import GuideLayout, { GP, GH2, GUL } from "@/components/GuideLayout";
import { Srcs, SourceList } from "@/components/guides/Src";
import { Gallery } from "@/components/guides/CardArt";
import { guideMetadata } from "@/lib/guides";
import { GUIDE_CARDS, GUIDE_LINK_CLASS } from "@/lib/guideLinks";

const SLUG = "pokemon-delta-reign-release-date-what-is-official";
export const metadata = guideMetadata(SLUG);

// Delta Reign pre-launch cluster (2026-09-20). Three tiers, kept apart on
// the page: OFFICIAL (the two pokemon.com pages, cited inline), REPORTED
// (named outlets, dated), UNKNOWN (said so). No product lineup - neither
// official page lists one. No prices, no pull rates, no English card
// numbers: none exist yet.
export default function Page() {
  return (
    <GuideLayout slug={SLUG}>
      <GP>
        <em>Mega Evolution&mdash;Delta Reign</em> is the next English Pokemon TCG expansion. It releases on{" "}
        <strong>6 November 2026</strong>. <Srcs ids={["drExpansion", "drAnnounce"]} /> A lot is being written about
        it already; most of it is about the Japanese set it draws from, not the English set itself. This page keeps
        the two apart: what The Pokemon Company has stated, what reliable outlets have reported, and what is simply
        not known yet.
      </GP>

      <GH2>What is official</GH2>
      <GUL>
        <li>
          <strong>Release date: 6 November 2026.</strong> Stated on the official expansion page and in the
          announcement. <Srcs ids={["drExpansion", "drAnnounce"]} />
        </li>
        <li>
          <strong>Size: &ldquo;over 135 cards&rdquo;</strong>, with &ldquo;more than 20 Trainer cards&rdquo; and
          &ldquo;more than 35 Pokemon and Trainer cards with special illustrations&rdquo;. That is the official
          wording and it is deliberately approximate; no exact English count or numbering has been published.{" "}
          <Srcs ids={["drExpansion"]} />
        </li>
        <li>
          <strong>Named cards: Mega Rayquaza ex, Mega Golurk ex, Mega Malamar ex and Mega Golisopod ex.</strong>{" "}
          These four are the only cards the English pages name. <Srcs ids={["drExpansion", "drAnnounce"]} />
        </li>
        <li>
          <strong>Series and format:</strong> the Mega Evolution Series; Standard-legal. <Srcs ids={["drExpansion"]} />
        </li>
      </GUL>
      {/* Card art (2026-09-20): catalogue scans of cards that exist today,
          one per named Pokemon. No Delta Reign card image exists to show,
          and no leaked or third-party photograph is used in its place. */}
      <Gallery
        cards={[
          { card: GUIDE_CARDS.rayquazaAscendedHeroes, caption: "Rayquaza today: Ascended Heroes" },
          { card: GUIDE_CARDS.golurkBlackBolt, caption: "Golurk today: Black Bolt" },
          { card: GUIDE_CARDS.malamarExPhantomForces, caption: "Malamar today: Phantom Forces" },
          { card: GUIDE_CARDS.golisopodExParadoxRift, caption: "Golisopod today: Paradox Rift" },
        ]}
        width={150}
        note={
          <>
            The four Pokemon the official pages name, shown as English cards that already exist in our catalogue,
            each with its own page and reference. They are <strong>not</strong> Delta Reign cards: no English Delta
            Reign card has been printed, so none is pictured here until The Pokemon Company publishes them.
          </>
        }
      />

      <GH2>What is reported, not official</GH2>
      <GUL>
        <li>
          <strong>The Japanese source set.</strong> <em>M6: Storm Emeralda</em> released in Japan on 31 July 2026.
          PokeBeach reported all 76 of its main-set cards before release; collector sites put the total at 113 once
          secret rares above the printed total are counted. It introduced the four Mega Pokemon ex named above.
        </li>
        <li>
          <strong>A Legendary Stadium mechanic</strong> &mdash; two Stadium cards played as a pair, forming one
          extended artwork side by side &mdash; is reported by PokeBeach and PokemonCard.io for the Japanese set,
          with three pairs named. Until the English pages describe it, we treat its English details as reported.
        </li>
        <li>
          <strong>Prerelease events</strong> are customarily held the week before an expansion&apos;s release and
          are reported by PokeBeach as the date approaches. Not yet stated for Delta Reign on the official pages.
        </li>
      </GUL>

      <GH2>What nobody knows yet</GH2>
      <GUL>
        <li>
          <strong>Which Japanese cards carry over, at which English numbers and rarities.</strong> English sets in
          this series have not been one-to-one copies of their Japanese sources, so a Japanese number is not a
          prediction of an English one.
        </li>
        <li>
          <strong>The product lineup.</strong> Neither official page lists products (Elite Trainer Box, bundles,
          collections) as of 20 September 2026. Any &ldquo;confirmed lineup&rdquo; you see is a retailer&apos;s
          listing or a report, not an official page &mdash; we will add the lineup here when one is published.
        </li>
        <li>
          <strong>Any price or pull rate.</strong> No English card exists, so no English price exists. A figure
          attached to a Delta Reign single today is a Japanese figure or an invention.
        </li>
      </GUL>

      <GH2>What this means if you are shopping now</GH2>
      <GP>
        Two different products are being sold under one name: the Japanese <em>Storm Emeralda</em> card you can buy
        today, and the English <em>Delta Reign</em> card that follows on 6 November. They carry different set names,
        numbering and market references, and on this site they will never be compared with each other. Our guide{" "}
        <Link href="/guides/storm-emeralda-vs-delta-reign-japanese-or-english" className={GUIDE_LINK_CLASS}>
          Japanese now or English in November
        </Link>{" "}
        covers how to decide. Sealed English product does not exist yet either; a &ldquo;Delta Reign&rdquo; box listed
        today is a preorder &mdash; see{" "}
        <Link href="/guides/delta-reign-preorders-and-prerelease-what-to-know" className={GUIDE_LINK_CLASS}>
          preorders and prerelease
        </Link>
        .
      </GP>

      <GH2>How this page will change</GH2>
      <GP>
        When the English card list is published we will add the set page with its checklist and, once cards are
        listed and priced, live below-reference offers. Until then the{" "}
        <Link href="/latest-releases" className={GUIDE_LINK_CLASS}>
          latest releases
        </Link>{" "}
        page carries the official date, and the{" "}
        <Link href="/news/mega-evolution-delta-reign-what-is-known" className={GUIDE_LINK_CLASS}>
          news story
        </Link>{" "}
        carries the reporting in detail.
      </GP>

      <SourceList ids={["drExpansion", "drAnnounce"]}>
        Reporting cited by name above: PokeBeach (Storm Emeralda card reveals; Delta Reign product reporting),
        PokemonCard.io (Storm Emeralda set reveal). Official pages read on 20 September 2026.
      </SourceList>
    </GuideLayout>
  );
}
