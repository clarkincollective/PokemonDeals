import Link from "next/link";
import GuideLayout, { GP, GH2, GUL } from "@/components/GuideLayout";
import { guideMetadata } from "@/lib/guides";

const SLUG = "how-pokemon-card-prices-work";
export const metadata = guideMetadata(SLUG);

export default function Page() {
  return (
    <GuideLayout slug={SLUG}>
      <GP>
        A Pokémon card has no fixed price. What it&apos;s &ldquo;worth&rdquo; is just the range recent
        buyers and sellers have agreed on, and that range moves. Understanding what feeds it makes it
        much easier to tell a real bargain from a listing that only looks cheap.
      </GP>

      <GH2>Sold prices, not asking prices</GH2>
      <GP>
        The number that matters is what cards have actually <em>sold</em> for recently, not what
        hopeful sellers are asking. Active listings can sit unsold for months at aspirational prices;
        completed sales are the real signal. Reputable price sources (this site uses
        PokémonPriceTracker, grounded in eBay sold data) publish a market price built from recent sold
        listings rather than current asks. When you compare a listing to a market price, make sure the
        market price is a sold-based one.
      </GP>

      <GH2>Supply and demand, in this hobby&apos;s terms</GH2>
      <GUL>
        <li>
          <strong>Print run.</strong> Modern sets are printed in enormous quantities for months;
          older sets had far smaller, fixed runs. A card&apos;s long-term floor is largely set by how
          many copies exist.
        </li>
        <li>
          <strong>Playability and collectability.</strong> A card can be valuable because it&apos;s
          strong in competitive play, because it&apos;s a chase card (alternate art, secret rare),
          because the Pokémon is popular, or all three. Demand for a specific Charizard art is not the
          same as demand for the card next to it in the set.
        </li>
        <li>
          <strong>Reprints.</strong> A card that gets reprinted in a later set, a special collection,
          or a promo can see its price drop sharply, even for the original printing.
        </li>
      </GUL>

      <GH2>The four things that split one card into many prices</GH2>
      <GP>
        &ldquo;Charizard&rdquo; isn&apos;t one price because it isn&apos;t one card. Four attributes
        each fork the value:
      </GP>
      <GUL>
        <li>
          <strong>Printing / set.</strong> The same Pokémon and artwork can exist in Base Set, a
          later reprint, and a promo, each with its own market. On this site, each exact printing with
          two or more live listings gets its own consolidated{" "}
          <Link
            href="/market-data/most-listed-cards"
            className="text-red-600 hover:underline dark:text-red-500"
          >
            card page
          </Link>
          .
        </li>
        <li>
          <strong>Edition and stamp.</strong> For vintage cards, 1st Edition and Shadowless printings
          trade well above the standard Unlimited version. See the{" "}
          <Link
            href="/guides/vintage-vs-modern-pokemon-cards"
            className="text-red-600 hover:underline dark:text-red-500"
          >
            vintage vs. modern
          </Link>{" "}
          guide.
        </li>
        <li>
          <strong>Condition.</strong> A lightly played copy can be worth a fraction of a near-mint
          one. See{" "}
          <Link
            href="/guides/card-condition-grading"
            className="text-red-600 hover:underline dark:text-red-500"
          >
            condition &amp; grading
          </Link>
          .
        </li>
        <li>
          <strong>Grade.</strong> A professionally graded card in a slab is a different market again —
          often several times the raw price at the top grades. See{" "}
          <Link
            href="/guides/raw-vs-graded-pokemon-cards"
            className="text-red-600 hover:underline dark:text-red-500"
          >
            raw vs. graded
          </Link>
          .
        </li>
      </GUL>

      <GH2>Why prices you see disagree</GH2>
      <GP>
        A price guide, a &ldquo;last sold&rdquo; figure, and the cheapest current listing can all be
        different and all be honest. Guides average over a window; a single last-sold price can be an
        outlier (a bad photo, an impatient seller, a bidding war); the cheapest listing might be a
        worse condition or a different printing than you think. The practical approach is to look at a
        spread of recent sales for the exact printing and condition you want, then judge a listing
        against that.
      </GP>

      <GP>
        This site does that comparison automatically and only surfaces listings meaningfully below a
        sold-based market price — the exact rules are on the{" "}
        <Link href="/methodology" className="text-red-600 hover:underline dark:text-red-500">
          methodology
        </Link>{" "}
        page. It&apos;s still worth checking the listing photos yourself before buying.
      </GP>
    </GuideLayout>
  );
}
