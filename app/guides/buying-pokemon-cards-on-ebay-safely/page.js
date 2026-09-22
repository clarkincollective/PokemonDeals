import Link from "next/link";
import GuideLayout, { GP, GH2, GUL } from "@/components/GuideLayout";
import { Gallery } from "@/components/guides/CardArt";
import { guideMetadata } from "@/lib/guides";
import { GUIDE_CARDS, PRICE_CHECKER_HREF, GUIDE_LINK_CLASS } from "@/lib/guideLinks";

const SLUG = "buying-pokemon-cards-on-ebay-safely";
export const metadata = guideMetadata(SLUG);

// GEO audit 2026-09-19. The question people ask an assistant before they
// buy. Everything here is either eBay's published policy, a listing
// detail a buyer can see, or what this site's own checks do and do not
// do. No price, no promise of authenticity, no seller named.
export default function Page() {
  return (
    <GuideLayout slug={SLUG}>
      <GP>
        Short answer: buying Pokemon cards on eBay is as safe as the listing you choose and the
        protection you keep. eBay&apos;s Money Back Guarantee covers an item that never arrives or is
        not as described; it does not stop you from bidding on a mis-described card in the first
        place. The checklist below is what to read before you pay, in the order it matters.
      </GP>

      <GH2>What eBay itself covers</GH2>
      <GUL>
        <li>
          <strong>Item not received, or not as described.</strong> Covered by eBay&apos;s Money Back
          Guarantee when you pay through eBay checkout and open the case within its time limit. A card
          that is a different printing, a different condition than stated, or a fake is &ldquo;not as
          described&rdquo;.
        </li>
        <li>
          <strong>Authenticity Guarantee.</strong> eBay runs an authentication step for some trading
          cards above a price threshold on some marketplaces. When it applies, the listing says so.
          Do not assume it applies because a card is expensive.
        </li>
        <li>
          <strong>Not covered.</strong> Buyer&apos;s remorse, a card that matches its description but
          is worth less than you thought, and anything paid for outside eBay checkout.
        </li>
      </GUL>

      <GH2>The listing checklist</GH2>
      <GUL>
        <li>
          <strong>Photos of the actual card, front and back.</strong> A stock image or a scan of a
          different copy tells you nothing about the copy you would receive. If the back is missing,
          ask for it.
        </li>
        <li>
          <strong>The exact printing.</strong> Set, collector number and printing (holofoil, reverse
          holofoil, 1st Edition, Shadowless, and so on) decide the price. A title that names one
          printing and shows another is the most common mis-description. Our guide on{" "}
          <Link href="/guides/how-to-find-pokemon-card-set-and-number" className={GUIDE_LINK_CLASS}>
            finding a card&apos;s set and number
          </Link>{" "}
          shows where to look.
        </li>
        <li>
          <strong>The stated condition, and whether the photos support it.</strong> &ldquo;Near
          Mint&rdquo; in a title is a seller&apos;s claim. Corners, edges, centering and surface are
          what you can check yourself:{" "}
          <Link href="/guides/how-to-check-pokemon-card-condition" className={GUIDE_LINK_CLASS}>
            how to check a card&apos;s condition
          </Link>
          .
        </li>
        <li>
          <strong>The total, not the item price.</strong> Shipping can be a large share of a cheap
          card&apos;s cost, and some listings do not state it until checkout. Read{" "}
          <Link href="/guides/how-to-read-a-pokemon-card-listing" className={GUIDE_LINK_CLASS}>
            how to read a listing
          </Link>{" "}
          for the order to read the numbers in.
        </li>
        <li>
          <strong>Auction or Buy It Now.</strong> An auction&apos;s current bid is not a price. Bids
          rise; the final price is set by the last bid before the end time.
        </li>
        <li>
          <strong>Returns.</strong> The listing states whether the seller accepts returns. A
          no-returns listing is still covered by the Money Back Guarantee for &ldquo;not as
          described&rdquo;, but a change of mind is not.
        </li>
      </GUL>
      {/* Card art (2026-09-20): the "exact printing" point, shown. */}
      <Gallery
        cards={[
          { card: GUIDE_CARDS.arcanineBaseSet, caption: "Base Set, Unlimited" },
          { card: GUIDE_CARDS.arcanineShadowless, caption: "Base Set, Shadowless" },
        ]}
        width={170}
        note={
          <>
            The same Arcanine, #023/102, in two printings that a title can confuse and a photo can settle: the
            Shadowless card has no drop shadow to the right of the art frame. Each has its own page and its own
            reference. Catalogue scans, not any seller&apos;s card.
          </>
        }
      />

      <GH2>Seller signals that matter</GH2>
      <GUL>
        <li>Feedback that is specific to cards, recent, and mentions accurate condition grading.</li>
        <li>A seller who answers a question about the card with a new photo rather than a stock reply.</li>
        <li>
          Consistency: a seller listing dozens of &ldquo;PSA 10&rdquo; copies of a chase card at a
          fraction of the going rate is a pattern, not a bargain.
        </li>
      </GUL>
      <GP>
        None of these prove a card is genuine. For the physical tells and the legitimate printing
        differences that get mistaken for fakes, see{" "}
        <Link href="/guides/spotting-fake-pokemon-cards-in-listings" className={GUIDE_LINK_CLASS}>
          spotting fake Pokemon cards in a listing
        </Link>
        .
      </GP>

      <GH2>What a below-market price does and does not tell you</GH2>
      <GP>
        A price under the market reference is a reason to look, not a reason to buy. The reference
        is recent sold data for the same printing and condition; a listing below it may be a genuine
        bargain, a mis-described printing, a condition the photos do not support, or an auction whose
        bid has not yet caught up. Check the printing and the photos first, then decide. You can look
        up the reference for any card with the{" "}
        <Link href={PRICE_CHECKER_HREF} className={GUIDE_LINK_CLASS}>
          price checker
        </Link>
        .
      </GP>

      <GH2>What this site checks for you, and what it cannot</GH2>
      <GP>
        Every listing shown on Pokemon Deal Finder has passed a card-identity match against the
        catalogue, a read of the seller&apos;s stated condition from eBay&apos;s item record, and an
        availability re-check. Selected higher-risk listings additionally receive an image-based
        screen; that check does not run on every listing, so treat its absence as unknown rather
        than as a pass. Listings that fail any check are withheld and the running counts are on the{" "}
        <Link href="/integrity" className={GUIDE_LINK_CLASS}>
          listing integrity report
        </Link>
        . Those checks reduce the risk of a wrong card or an obvious fake reaching you. They do not
        inspect the physical card, they do not verify the seller, and they never make a listing
        &ldquo;verified authentic&rdquo;. The full method and its limits are on the{" "}
        <Link href="/methodology" className={GUIDE_LINK_CLASS}>
          methodology
        </Link>{" "}
        page.
      </GP>

      <GH2>If something goes wrong</GH2>
      <GUL>
        <li>Keep the packaging and photograph the card and the parcel on arrival.</li>
        <li>Message the seller first through eBay; most mis-descriptions are resolved there.</li>
        <li>Open a Money Back Guarantee case within eBay&apos;s window if it is not resolved.</li>
      </GUL>

      <GP>
        Ready to look?{" "}
        <Link href="/deals" className={GUIDE_LINK_CLASS}>
          Browse every live listing
        </Link>{" "}
        with the reference shown beside each one, or start from a{" "}
        <Link href="/sets" className={GUIDE_LINK_CLASS}>
          set page
        </Link>
        .
      </GP>
    </GuideLayout>
  );
}
