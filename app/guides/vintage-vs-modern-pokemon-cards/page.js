import Link from "next/link";
import GuideLayout, { GP, GH2, GUL } from "@/components/GuideLayout";
import GuideFigure from "@/components/guides/GuideFigure";
import EraTimeline from "@/components/guides/EraTimeline";
import { guideMetadata } from "@/lib/guides";

const SLUG = "vintage-vs-modern-pokemon-cards";
export const metadata = guideMetadata(SLUG);

export default function Page() {
  return (
    <GuideLayout slug={SLUG}>
      <GP>
        &ldquo;Vintage&rdquo; and &ldquo;modern&rdquo; aren&apos;t official categories, but collectors
        use them because the two ends of the Pokémon TCG&apos;s history behave differently as markets.
        Knowing roughly where a set sits helps you read its prices.
      </GP>

      <GH2>A rough timeline</GH2>
      <GUL>
        <li>
          <strong>Vintage / WOTC era (1999–2003).</strong> Base Set through the sets published while
          Wizards of the Coast held the licence (ending around Base Set 2, Legendary Collection, and
          the e-Card sets). Smaller print runs, and the era of 1st Edition and Shadowless printings.
        </li>
        <li>
          <strong>Middle era (2003–2016).</strong> The EX, Diamond &amp; Pearl, Platinum,
          HeartGold &amp; SoulSilver, Black &amp; White, and XY blocks, after The Pokémon Company took
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
          strong premiums over standard Unlimited copies of the same card.
        </li>
        <li>
          <strong>Nostalgia and iconography.</strong> Base Set Charizard is the obvious example —
          demand is cultural, not driven by playability.
        </li>
        <li>
          <strong>Condition sensitivity.</strong> Centering and print defects were common, and
          survivors are often worn, so the price gap between grades is steep.
        </li>
      </GUL>

      <GH2>What drives value in modern</GH2>
      <GUL>
        <li>
          <strong>Rarity tier, not just the Pokémon.</strong> Within a modern set, the gap between a
          regular holo and the alternate-art or secret-rare version of the same card is enormous.
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
