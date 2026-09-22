import Link from "next/link";
import GuideLayout, { GP, GH2, GUL } from "@/components/GuideLayout";
import { Gallery, ProductGallery, GuideTable } from "@/components/guides/CardArt";
import { guideMetadata } from "@/lib/guides";
import { GUIDE_CARDS, GUIDE_LINK_CLASS, GUIDE_PRODUCTS, GUIDE_SETS } from "@/lib/guideLinks";

const SLUG = "crown-zenith-galarian-gallery-guide";
export const metadata = guideMetadata(SLUG);

// Audit batch 2026-09-22. The organising question for Crown Zenith is the
// main-set / subset relationship, and we can show it from our own
// catalogue: two separate set records, two numbering schemes, two very
// different rarity profiles. No price ranking - that is what the set page
// and the live listings are for.
export default function Page() {
  return (
    <GuideLayout slug={SLUG}>
      <GP>
        Crown Zenith is really two things sold in one wrapper: a main set, and a subset called the
        Galarian Gallery. Almost every confusing Crown Zenith listing comes from the difference
        between them. Once you can see it, the set is easy to buy from.
      </GP>

      <GH2>Two sets, two numbering schemes</GH2>
      <GP>
        Our catalogue holds them as separate set records, and their numbering says why. The main set
        runs on <strong>/159</strong> — cards like 015/159 and 157/159. The Galarian Gallery runs on
        its own <strong>GG</strong> scheme: GG01/GG70 through GG70/GG70. A card cannot be
        &ldquo;number 12 of Crown Zenith&rdquo; without you saying which of the two you mean.
      </GP>
      <GuideTable
        head={["", "Main set", "Galarian Gallery"]}
        rows={[
          ["Numbering", "nnn/159", "GGnn/GG70"],
          ["Records we track", "179", "70"],
          ["Rarity profile", "Commons and uncommons through to Ultra Rares", "Almost entirely Ultra Rare, plus a few Secret Rares"],
          ["What it feels like", "A normal expansion", "A gallery of premium alternate artwork"],
        ]}
        caption="Figures are our own catalogue records for the two sets, read on 22 September 2026. They describe what we track, not an official checklist."
      />
      <GP>
        The rarity column is the part worth sitting with. The Gallery has essentially no filler: of
        the 70 records we hold, 66 are Ultra Rare and the remaining four are Secret Rare. That is not
        a coincidence of what we track — it is what the subset is for.
      </GP>

      <Gallery
        cards={[
          { card: GUIDE_CARDS.crownZenithCharizardVstar, caption: "Main set: 019/159" },
          { card: GUIDE_CARDS.crownZenithRadiantCharizard, caption: "Main set: 020/159" },
          { card: GUIDE_CARDS.crownZenithGgMew, caption: "Gallery: GG10/GG70" },
          { card: GUIDE_CARDS.crownZenithGgMewtwoVstar, caption: "Gallery: GG44/GG70" },
        ]}
        width={150}
        note="The numbering tells you which of the two you are looking at before anything else does."
      />

      <GH2>What this means for collecting scope</GH2>
      <GUL>
        <li>
          <strong>&ldquo;Complete Crown Zenith&rdquo; is ambiguous.</strong> Main set only, or main
          set plus all 70 Gallery cards? They are very different projects and very different
          budgets. Decide before you start buying, and write it down —{" "}
          <Link href="/guides/complete-set-vs-master-set" className={GUIDE_LINK_CLASS}>
            complete set vs master set
          </Link>{" "}
          is about exactly that.
        </li>
        <li>
          <strong>The Gallery has no cheap tier.</strong> A run of commons to pad out progress does
          not exist there. Every card is a premium card.
        </li>
        <li>
          <strong>A seller saying &ldquo;GG&rdquo; is telling you something specific.</strong> Treat
          it as part of the card&apos;s identity, not a description of how shiny it is.
        </li>
      </GUL>

      <GH2>Reading a Crown Zenith listing</GH2>
      <GUL>
        <li>
          <strong>Take the number from the photograph.</strong> A GG prefix settles which set it is
          from immediately; a plain /159 number settles the other way.
        </li>
        <li>
          <strong>Watch for the same Pokemon in both.</strong> A character can appear in the main set
          and again in the Gallery as different cards at different values. The name is not enough.
        </li>
        <li>
          <strong>Check the language.</strong> The Japanese line that the Gallery cards draw on is a
          separate market — see{" "}
          <Link href="/guides/japanese-vs-english-pokemon-cards" className={GUIDE_LINK_CLASS}>
            Japanese vs English
          </Link>
          . Do not price a Japanese card against an English reference.
        </li>
      </GUL>

      <GH2>Buying sealed</GH2>
      <GP>
        Crown Zenith was sold through Elite Trainer Boxes, tins and collection boxes rather than a
        standard booster box, which is itself worth knowing before you go looking for one.
      </GP>
      <ProductGallery
        products={[{ product: GUIDE_PRODUCTS.crownZenithEliteTrainerBox, caption: "Crown Zenith Elite Trainer Box" }]}
        width={168}
        note="One verified product from our sealed catalogue. Which sealed format suits you is covered in the format comparison."
      />
      <GP>
        As always: if it is one Gallery card you want, packs are the expensive route to it. See{" "}
        <Link href="/guides/booster-box-vs-etb-vs-booster-bundle" className={GUIDE_LINK_CLASS}>
          the format comparison
        </Link>{" "}
        for who each product actually suits.
      </GP>

      <GH2>Where to go next</GH2>
      <GUL>
        <li>
          <Link href={GUIDE_SETS.crownZenith.href} className={GUIDE_LINK_CLASS}>
            Browse Crown Zenith cards
          </Link>{" "}
          — the main set.
        </li>
        <li>
          <Link href={GUIDE_SETS.crownZenithGalarianGallery.href} className={GUIDE_LINK_CLASS}>
            Browse Galarian Gallery cards
          </Link>{" "}
          — the subset, as its own set record.
        </li>
        <li>
          <Link href="/guides/how-to-find-pokemon-card-set-and-number" className={GUIDE_LINK_CLASS}>
            Finding a card&apos;s set and number
          </Link>{" "}
          — if the number on the card is not where you expect.
        </li>
      </GUL>
    </GuideLayout>
  );
}
