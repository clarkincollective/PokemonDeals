import Link from "next/link";
import GuideLayout, { GP, GH2, GUL } from "@/components/GuideLayout";
import { Gallery, GuideTable } from "@/components/guides/CardArt";
import { guideMetadata } from "@/lib/guides";
import { GUIDE_CARDS, GUIDE_SETS, PRICE_CHECKER_HREF, GUIDE_LINK_CLASS } from "@/lib/guideLinks";

const SLUG = "base-set-shadowless-unlimited-first-edition";
export const metadata = guideMetadata(SLUG);

// Identification from the card face. Every distinguishing feature below
// was checked against this site's own catalogue scans of the Unlimited
// and Shadowless Charizard on 2026-09-16, not recalled - including the
// copyright line, which is easy to get backwards. The catalogue files
// Base Set and Base Set (Shadowless) as separate sets; it holds no
// separate 1st Edition rows, so no link on this page is presented as a
// 1st Edition card. No prices here; the linked card pages carry them.

// [feature, Unlimited, Shadowless]
const TELLS = [
  ["Drop shadow on the art frame", "Yes — a dark shadow along the right and bottom edges of the picture box", "No — the picture box sits flat with no shadow"],
  ["HP text", "Heavy, bold red", "Thinner, lighter red"],
  ["Copyright line (bottom)", "©1995, 96, 98 Nintendo, Creatures, GAMEFREAK. ©1999 Wizards.", "©1995, 96, 98, 99 Nintendo, Creatures, GAMEFREAK. ©1999 Wizards."],
  ["1st Edition stamp", "Never", "Sometimes — see below"],
  ["Collector number", "x/102", "x/102 (identical)"],
  ["Set symbol", "None — Base Set has no symbol", "None (identical)"],
];

export default function Page() {
  return (
    <GuideLayout slug={SLUG}>
      <GP>
        &quot;Base Set&quot; is not one printing. The same 102 cards were printed three ways in 1999 &mdash; 1st
        Edition, Shadowless and Unlimited &mdash; and then reissued in 2000 as Base Set 2. Same names, same artwork,
        and for three of the four the same collector numbers. They are separate cards with separate references on
        this site, and a listing that says only &quot;Base Set&quot; has not told you which one it is.
      </GP>
      <GP>
        The good news: the differences are on the card face and you can read them from a decent photograph. Here
        they are, in the order to check them.
      </GP>

      <GH2>Unlimited or Shadowless: the two tells that settle it</GH2>
      <Gallery
        cards={[
          { card: GUIDE_CARDS.charizardBaseSet, caption: "Unlimited — shadow on the art frame" },
          { card: GUIDE_CARDS.charizardShadowless, caption: "Shadowless — no shadow (this scan also carries a stamp)" },
        ]}
        width={190}
        priorityCount={2}
        note="Our catalogue scans of the two printings, same card and number. Look at the right and bottom edges of the picture box, then at the weight of the HP text."
      />
      <GuideTable
        head={["Feature", "Unlimited", "Shadowless"]}
        rows={TELLS}
        minWidth="44rem"
        caption="Checked against the catalogue scans above on 16 September 2026. The copyright line is the detail most often quoted the wrong way round."
      />
      <GUL>
        <li>
          <strong>The shadow.</strong> On an Unlimited card the picture box has a dark drop shadow down its right
          side and along the bottom, as if the picture were raised off the card. On a Shadowless card there is none:
          the box is flat. This is what the name means and it is the fastest check.
        </li>
        <li>
          <strong>The HP.</strong> Unlimited prints &quot;120 HP&quot; in a heavy bold red; Shadowless uses a
          visibly thinner, lighter typeface. Once you have seen the two side by side it is hard to un-see.
        </li>
        <li>
          <strong>The copyright line.</strong> Read the years. Shadowless carries &quot;©1995, 96, 98, 99&quot;;
          Unlimited carries &quot;©1995, 96, 98&quot; without the 99. People frequently quote this backwards, so
          check it against the scans rather than a forum post.
        </li>
      </GUL>

      <GH2>Where 1st Edition fits</GH2>
      <GP>
        A 1st Edition Base Set card carries the black &quot;Edition 1&quot; stamp on the left of the card, just below
        the picture. Every 1st Edition Base Set card is also Shadowless &mdash; the stamped print run came first,
        before the shadow was added &mdash; but the reverse is not true: a Shadowless card without the stamp is not
        1st Edition. So the order of checks is: stamp first (1st Edition), then shadow (Shadowless), then neither
        (Unlimited).
      </GP>
      <GP>
        On this site, Base Set and Base Set (Shadowless) are filed as separate sets with their own card pages. We do
        not currently hold separate 1st Edition entries, so a Shadowless page&apos;s reference is a Shadowless
        reference; a stamped card is a different product again and its own price is not on that page. The scan our
        catalogue uses for the Shadowless Charizard happens to be of a stamped copy, which is why you can see the
        stamp in the gallery above &mdash; treat it as an illustration of the stamp, not as a 1st Edition price.
      </GP>

      <GH2>Base Set 2 is the easy one</GH2>
      <Gallery
        cards={[
          { card: GUIDE_CARDS.charizardBaseSet2, caption: "Base Set 2 — numbered out of 130" },
          { card: GUIDE_CARDS.arcanineBaseSet2, caption: "Base Set 2 — 033/130" },
        ]}
        width={168}
        note="Base Set 2 (2000) reissued Base Set and Jungle cards together. Its numbers run out of 130, not 102, so the collector number identifies it on its own."
      />
      <GP>
        Base Set 2 reprinted cards from Base Set and Jungle in one 130-card set, so its collector numbers run
        &quot;x/130&quot; and it carries a set symbol where the originals have none. If the number on the card is out
        of 130, it is Base Set 2, and no further check is needed.
      </GP>

      <GH2>The same test on a cheaper card</GH2>
      <GP>
        The tells are printing-wide, not Charizard-specific. Arcanine 023/102 exists in both 1999 printings and in
        Base Set 2, and the shadow, the HP weight and the copyright line separate them exactly as above &mdash; which
        matters, because the Shadowless Arcanine is one of the printings people search for most.
      </GP>
      <Gallery
        cards={[
          { card: GUIDE_CARDS.arcanineBaseSet, caption: "Base Set (Unlimited), 023/102" },
          { card: GUIDE_CARDS.arcanineShadowless, caption: "Base Set (Shadowless), 023/102" },
        ]}
        width={168}
        note="Arcanine in both 1999 printings. Same number, different card, different reference — each links to its own page."
      />

      <GH2>Before you price or buy one</GH2>
      <GUL>
        <li>
          <strong>Do not use the number.</strong> Three of the four printings share it. The number tells you it is a
          Base Set family card and nothing more.
        </li>
        <li>
          <strong>Ask for a straight-on photo of the whole card</strong> if a listing shows only the front at an
          angle. The shadow and the copyright line both need a clear view.
        </li>
        <li>
          <strong>Ignore the title.</strong> &quot;Shadowless&quot; and &quot;1st Edition&quot; are the two words
          most often applied to cards that are neither. Read the card.
        </li>
        <li>
          <strong>Condition is a separate question.</strong> Once you know the printing, the reference on its page
          is labelled by condition; our{" "}
          <Link href="/guides/how-to-check-pokemon-card-condition" className={GUIDE_LINK_CLASS}>
            condition guide
          </Link>{" "}
          is the next step, and the{" "}
          <Link href="/guides/vintage-vs-modern-pokemon-cards" className={GUIDE_LINK_CLASS}>
            vintage versus modern guide
          </Link>{" "}
          covers what changes the risk with 1999 cards specifically.
        </li>
      </GUL>
      <GP>
        The{" "}
        <Link href={GUIDE_SETS.baseSet.href} className={GUIDE_LINK_CLASS}>
          Base Set page
        </Link>{" "}
        and the{" "}
        <Link href={GUIDE_SETS.baseSetShadowless.href} className={GUIDE_LINK_CLASS}>
          Base Set (Shadowless) page
        </Link>{" "}
        list every card we track in each printing with its recent-sold market reference; the{" "}
        <Link href={PRICE_CHECKER_HREF} className={GUIDE_LINK_CLASS}>
          price checker
        </Link>{" "}
        finds a specific card by name or number. Market references are drawn from recent sold data and are not
        guaranteed values. For the general procedure of working out which page prices the card you are holding, see{" "}
        <Link href="/guides/how-much-is-my-pokemon-card-worth" className={GUIDE_LINK_CLASS}>
          how much is my card worth
        </Link>
        .
      </GP>
    </GuideLayout>
  );
}
