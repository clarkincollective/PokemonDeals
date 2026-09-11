import Link from "next/link";
import GuideLayout, { GP, GH2, GUL } from "@/components/GuideLayout";
import GuideFigure from "@/components/guides/GuideFigure";
import EraTimeline from "@/components/guides/EraTimeline";
import { guideMetadata } from "@/lib/guides";
import { GUIDE_CARDS, GUIDE_SETS, GUIDE_LINK_CLASS } from "@/lib/guideLinks";

const SLUG = "vintage-vs-modern-pokemon-cards";
export const metadata = guideMetadata(SLUG);

export default function Page() {
  return (
    <GuideLayout slug={SLUG}>
      <GP>
        &ldquo;Vintage&rdquo; and &ldquo;modern&rdquo; aren&apos;t official categories, but collectors
        use them because the two ends of the Pokemon TCG&apos;s history behave differently as markets.
        Knowing roughly where a set sits helps you read its prices.
      </GP>

      <GH2>A rough timeline</GH2>
      <GUL>
        <li>
          <strong>Vintage / WOTC era (1999–2003).</strong>{" "}
          <Link href={GUIDE_SETS.baseSet.href} className={GUIDE_LINK_CLASS}>
            Base Set
          </Link>{" "}
          through the sets published while Wizards of the Coast held the licence (ending around{" "}
          <Link href={GUIDE_SETS.baseSet2.href} className={GUIDE_LINK_CLASS}>
            Base Set 2
          </Link>
          , Legendary Collection, and the e-Card sets). Smaller print runs, and the era of 1st Edition
          and Shadowless printings.
        </li>
        <li>
          <strong>Middle era (2003–2016).</strong> The EX, Diamond &amp; Pearl, Platinum,
          HeartGold &amp; SoulSilver, Black &amp; White, and XY blocks, after The Pokemon Company took
          the licence back. Large print runs; a long stretch that&apos;s only recently drawn
          sustained collector attention.
        </li>
        <li>
          <strong>Modern (2017–present).</strong> Sun &amp; Moon onward, including the Sword &amp;
          Shield and Scarlet &amp; Violet blocks. Very large, months-long print runs, and the era of
          alternate-art and &ldquo;special illustration&rdquo; chase cards.
        </li>
      </GUL>

      <GuideFigure caption="Boundaries are approximate — collectors don't fully agree on where one era ends and the next begins.">
        <EraTimeline />
      </GuideFigure>

      <GP>
        You can browse by set on the{" "}
        <Link href="/sets" className="text-red-600 hover:underline dark:text-red-500">
          sets page
        </Link>
        , and the priciest cards with active listings on{" "}
        <Link
          href="/market-data/most-expensive-cards"
          className="text-red-600 hover:underline dark:text-red-500"
        >
          most expensive cards
        </Link>
        .
      </GP>

      <GH2>What drives value in vintage</GH2>
      <GUL>
        <li>
          <strong>Fixed, smaller supply.</strong> No more original-run copies are being made, and
          decades of play, damage, and loss have thinned the pool — especially in high grade.
        </li>
        <li>
          <strong>Edition and stamp.</strong> For WOTC-era cards, 1st Edition (a stamp on the lower
          left of the art) and Shadowless (no drop-shadow on the art box, early Base Set only) command
          strong premiums over standard Unlimited copies of the same card. That is why{" "}
          <Link href={GUIDE_SETS.baseSetShadowless.href} className={GUIDE_LINK_CLASS}>
            Base Set (Shadowless)
          </Link>{" "}
          is listed as its own set here, and why{" "}
          <Link href={GUIDE_CARDS.charizardShadowless.href} className={GUIDE_LINK_CLASS}>
            Shadowless Charizard
          </Link>{" "}
          has a separate page and price from the standard one.
        </li>
        <li>
          <strong>Nostalgia and iconography.</strong>{" "}
          <Link href={GUIDE_CARDS.charizardBaseSet.href} className={GUIDE_LINK_CLASS}>
            Base Set Charizard
          </Link>{" "}
          is the obvious example — demand is cultural, not driven by playability. Later remakes don&apos;t
          replace it:{" "}
          <Link href={GUIDE_CARDS.charizardEvolutions.href} className={GUIDE_LINK_CLASS}>
            XY Evolutions Charizard
          </Link>{" "}
          (2016) is a different card with its own market.
        </li>
        <li>
          <strong>Condition sensitivity.</strong> Centering and print defects were common, and
          survivors are often worn, so the price gap between grades is steep.
        </li>
      </GUL>

      <GH2>What drives value in modern</GH2>
      <GUL>
        <li>
          <strong>Rarity tier, not just the Pokemon.</strong> Within a modern set, the gap between a
          regular holo and the alternate-art or secret-rare version of the same card is enormous. The{" "}
          <Link href={GUIDE_SETS.evolvingSkies.href} className={GUIDE_LINK_CLASS}>
            Evolving Skies
          </Link>{" "}
          card list shows it: the same Pokemon appears at several rarity tiers, each priced separately.
        </li>
        <li>
          <strong>Sealed product.</strong> Modern singles compete with the fact that sealed booster
          product is still on shelves; prices for many singles stay soft until the set stops being
          printed. Sealed boxes of out-of-print sets become collectible in their own right — see the{" "}
          <Link href="/sealed-deals" className="text-red-600 hover:underline dark:text-red-500">
            sealed deals
          </Link>{" "}
          page.
        </li>
        <li>
          <strong>Print-run timing.</strong> A card from a short-printed set or a set with a
          famously low pull rate can hold value; a card from a heavily printed set often doesn&apos;t.
        </li>
      </GUL>

      <GH2>Buying risks by era</GH2>
      <GUL>
        <li>
          <strong>Vintage:</strong> counterfeits are common and have improved. Buy high-value vintage
          raw only from clear photos you can assess, or buy it{" "}
          <Link
            href="/guides/raw-vs-graded-pokemon-cards"
            className="text-red-600 hover:underline dark:text-red-500"
          >
            graded
          </Link>
          . Watch for trimmed or restored cards.
        </li>
        <li>
          <strong>Modern:</strong> the main risk is overpaying near a set&apos;s release, when hype is
          high and supply is still increasing. Prices for most modern cards drift down for a while
          after release.
        </li>
        <li>
          <strong>Both:</strong> &ldquo;proxy&rdquo;, &ldquo;custom&rdquo;, and &ldquo;fan art&rdquo;
          listings are not the real card. This site filters those out, but always confirm from the
          photos.
        </li>
      </GUL>
    </GuideLayout>
  );
}
