import Link from "next/link";
import GuideLayout, { GP, GH2, GUL } from "@/components/GuideLayout";
import { guideMetadata } from "@/lib/guides";
import { PRICE_CHECKER_HREF, GUIDE_LINK_CLASS } from "@/lib/guideLinks";

const SLUG = "how-to-read-a-pokemon-card-listing";
export const metadata = guideMetadata(SLUG);

// GEO audit 2026-09-19. The numbers and labels on a deal card / deal page,
// in reading order, and what each one is allowed to claim. Mirrors the
// rules in lib/offerPresentation and lib/dealQuality; states no price.
export default function Page() {
  return (
    <GuideLayout slug={SLUG}>
      <GP>
        A card listing carries four numbers and three labels. Read them in this order and a listing
        that looks cheap will either hold up or fall apart before you click through.
      </GP>

      <GH2>1. The identity line: name, set, collector number, printing</GH2>
      <GP>
        The name alone is never enough; the same Pokemon can have dozens of printings at very
        different prices. On this site the identity line is the exact catalogue printing the listing
        was matched to. On eBay itself, read the title and then confirm it against the photos — the
        collector number is printed on the card, and{" "}
        <Link href="/guides/how-to-find-pokemon-card-set-and-number" className={GUIDE_LINK_CLASS}>
          this guide
        </Link>{" "}
        shows where. A title that says one printing over a photo of another is the listing to skip.
      </GP>

      <GH2>2. The condition pill</GH2>
      <GUL>
        <li>
          <strong>Raw cards</strong> show the seller&apos;s stated tier — Near Mint, Lightly Played and
          so on — as read from eBay&apos;s item record. It is a claim the photos should support, not a
          measurement. &ldquo;Condition not verified&rdquo; means the seller stated nothing usable, and
          such a listing is not shown as a deal.
        </li>
        <li>
          <strong>Graded cards</strong> show the grader and the numeric grade (PSA 9, CGC 10). A raw
          &ldquo;Near Mint&rdquo; is not a grade and is never equated to one; see{" "}
          <Link href="/guides/card-condition-grading" className={GUIDE_LINK_CLASS}>
            condition and grading explained
          </Link>
          .
        </li>
      </GUL>

      <GH2>3. The listing total, and what it includes</GH2>
      <GUL>
        <li>
          <strong>&ldquo;Listing total&rdquo;</strong> means the item price plus a shipping charge
          that eBay recorded for the listing. That is the delivered price, and it is the figure a
          saving is measured from.
        </li>
        <li>
          <strong>&ldquo;Shipping not confirmed&rdquo;</strong> means eBay recorded no charge — which
          may mean free or may mean not stated. The figure shown is the item price; check the
          listing for the real delivered cost before comparing.
        </li>
        <li>
          <strong>&ldquo;Shipping unknown — check on eBay&rdquo;</strong> means no shipping record
          exists for the listing at all. No delivered saving is claimed for it.
        </li>
        <li>
          <strong>Currency.</strong> The listing is priced in its marketplace&apos;s currency; the site
          shows it in yours with an approximation mark when converted. Comparisons are made in US
          dollars behind the scenes so a UK and a US listing are judged the same way.
        </li>
      </GUL>

      <GH2>4. The market reference</GH2>
      <GP>
        The reference is recent sold data for the same printing and the same condition tier, and it
        is labelled with that condition and the date it was recorded. It is a reference, not a
        guaranteed sale price. Two consequences: a raw listing is never compared with a graded
        reference, and a listing whose condition cannot be matched to a reference shows no saving at
        all. You can look any card&apos;s reference up with the{" "}
        <Link href={PRICE_CHECKER_HREF} className={GUIDE_LINK_CLASS}>
          price checker
        </Link>
        .
      </GP>

      <GH2>5. The saving — and the one case it is never shown</GH2>
      <GUL>
        <li>
          A green &ldquo;−N%&rdquo; appears only when the listing total is below a reference the site
          holds for that exact printing and condition. A listing without that evidence is shown as a
          plain listing.
        </li>
        <li>
          <strong>Auctions never show a saving.</strong> They show the current bid, the number of bids
          and the exact end time. A bid can rise until the end; an amber &ldquo;Bid −N%&rdquo; is a
          comparison of the current bid, not a price you can pay.
        </li>
      </GUL>

      <GH2>6. Found and checked</GH2>
      <GP>
        Every listing shows when it was first found and, where eBay has confirmed it since, when it
        was last checked. A listing that has ended stops being shown; its page says so and points to
        the card&apos;s current listings. The running counts of listings checked and withheld are on
        the{" "}
        <Link href="/integrity" className={GUIDE_LINK_CLASS}>
          listing integrity report
        </Link>
        .
      </GP>

      <GH2>7. The marketplace flag</GH2>
      <GP>
        The flag and label (for example &ldquo;eBay UK&rdquo;) say which eBay site the listing was
        scanned from — not where it ships to. A US-marketplace listing may ship to the UK and vice
        versa; the listing itself states its shipping destinations.
      </GP>

      <GP>
        Put together: identity, then condition, then total, then reference, then saving. If any step
        does not hold, the saving is not real. Practise on{" "}
        <Link href="/deals" className={GUIDE_LINK_CLASS}>
          today&apos;s live listings
        </Link>
        , or read{" "}
        <Link href="/guides/buying-pokemon-cards-on-ebay-safely" className={GUIDE_LINK_CLASS}>
          the eBay buyer&apos;s checklist
        </Link>{" "}
        next.
      </GP>
    </GuideLayout>
  );
}
