import Link from "next/link";
import GuideLayout, { GP, GH2, GUL } from "@/components/GuideLayout";
import { Gallery, ProductGallery, GuideTable } from "@/components/guides/CardArt";
import { Src, SourceList } from "@/components/guides/Src";
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
        The rarity column is the part worth sitting with. Of the 70 Galarian Gallery records we hold,
        <strong> 66 carry the rarity Ultra Rare</strong> and the remaining four Secret Rare — no
        commons, uncommons or ordinary rares at all. The main set is the opposite shape: commons and
        uncommons are its two largest rarity groups.
      </GP>
      <GP>
        Be careful what you read into that. A rarity label is a printing classification; it is not a
        price, and it does not establish what any of these cards costs or that none of them is
        cheap. What it does tell you is that the Gallery contains no tier of ordinary cards to work
        through — every slot in it is a premium-rarity slot, so a 70-card Gallery run is 70 premium
        cards and not 60 filler cards plus ten chase ones. Check the live listings for what that
        actually costs today.
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
          <strong>The Gallery has no ordinary-rarity tier.</strong> Every record we hold for it is
          classified Ultra Rare or Secret Rare, so there is no run of commons to make early progress
          through.
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
          and again in the Gallery as separate catalogue records. The name is not enough to say
          which you are looking at.
        </li>
        <li>
          <strong>Check the language.</strong> Japanese copies are a separate market we do not
          price — see{" "}
          <Link href="/guides/japanese-vs-english-pokemon-cards" className={GUIDE_LINK_CLASS}>
            Japanese vs English
          </Link>
          . Do not price a Japanese card against an English reference.
        </li>
      </GUL>

      <GH2>Buying sealed: there is no Crown Zenith booster box</GH2>
      <GP>
        If you go looking for a Crown Zenith booster box you will not find one, and the reason is
        stated on the product page itself. The official Elite Trainer Box page says that booster
        packs are not sold separately for this expansion, and presents the ten packs inside the box
        as the way to collect from it.{" "}
        <Src id="crownZenithEtb" /> Our own sealed catalogue matches: it holds 41 Crown Zenith
        products — Elite Trainer Boxes, tins, collection boxes, pin collections — and no booster box
        or display box among them.
      </GP>
      <GuideTable
        head={["Product", "Region / language", "Packs", "Promo cards", "Accessories"]}
        rows={[
          [
            <>
              <Src id="crownZenithEtb">Crown Zenith Elite Trainer Box</Src>
            </>,
            "US listing, English",
            "10",
            "1 etched foil Lucario VSTAR",
            "65 Lucario sleeves, 45 Energy, player's guide, 6 damage-counter dice, 1 competition-legal coin-flip die, 2 acrylic condition markers, 1 acrylic VSTAR marker, collector's box with 4 dividers, code card",
          ],
        ]}
        minWidth="46rem"
        caption="Contents from the product's own official page, read 22 September 2026. Our sealed catalogue also holds a separate Pokemon Center Elite Trainer Box Plus for this set, whose contents are not published on an official page we could find."
      />
      <ProductGallery
        products={[{ product: GUIDE_PRODUCTS.crownZenithEliteTrainerBox, caption: "Crown Zenith Elite Trainer Box" }]}
        width={168}
        note="The product in the table above, as a catalogue product photograph. Which sealed format suits you is covered in the format comparison."
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

      <SourceList ids={["crownZenithEtb"]}>
        <li>
          Read 22 September 2026. Record counts, numbering schemes and rarity classifications are
          our own catalogue records for the two sets, read the same day; they describe what we
          track, not an official checklist, and a rarity label is not a price.
        </li>
      </SourceList>
    </GuideLayout>
  );
}
