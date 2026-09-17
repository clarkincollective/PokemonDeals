import Link from "next/link";
import GuideLayout, { GP, GH2, GUL } from "@/components/GuideLayout";
import { Gallery, GuideTable } from "@/components/guides/CardArt";
import { guideMetadata } from "@/lib/guides";
import { GUIDE_CARDS, GUIDE_SETS, PRICE_CHECKER_HREF, GUIDE_LINK_CLASS } from "@/lib/guideLinks";

const SLUG = "pokemon-promo-card-numbers";
export const metadata = guideMetadata(SLUG);

// Decoding, not a checklist. Every prefix and pattern below is read from
// how this site's catalogue files its promo sets (checked 2026-09-16), and
// every example is a verified catalogue identity linked to its own page.
// The page never claims a promo list is complete, never gives a price,
// and never says which product a given promo came from unless the card
// itself says so (a prerelease stamp, a Professor Program mark).

const C = GUIDE_CARDS;

// [era, what the number looks like, example, the SET whose page holds that
// era's list]. The last column links: decoding a prefix tells you which set a
// promo belongs to, and the next thing anyone wants is that set's card list.
const S = GUIDE_SETS;
const ERAS = [
  ["Wizards of the Coast (1999–2003)", "A plain number with a black star, e.g. #8 — the original \"Black Star promos\"", "Mew #8", S.promoWotc, "numbered out of 53"],
  ["Diamond & Pearl / Platinum", "DP + number", "DP45", S.promoDiamondPearl, ""],
  ["HeartGold & SoulSilver", "HGSS + number", "HGSS03", S.promoHgss, ""],
  ["Black & White", "BW + number", "BW90", S.promoBlackWhite, ""],
  ["XY", "XY + number", "XY110", S.promoXy, ""],
  ["Sun & Moon", "SM + number", "SM124", S.promoSm, ""],
  ["Sword & Shield", "SWSH + three digits", "SWSH042", S.promoSwsh, ""],
  ["Scarlet & Violet", "SVP + three digits (the SVP prefix is often dropped in listings)", "053", S.promoSv, ""],
  ["Mega Evolution", "Three digits", "093", S.promoMegaEvolution, ""],
];

export default function Page() {
  return (
    <GuideLayout slug={SLUG}>
      <GP>
        A promo card&apos;s number does not look like a set card&apos;s number, and that is the point of it. Instead
        of &quot;25/102&quot; you get &quot;SWSH042&quot; or &quot;BW90&quot; or a black star. The prefix tells you
        the era; the rest tells you which promo. This page decodes the patterns, era by era, with a real card from
        each, and then covers the three kinds of &quot;promo&quot; that do not follow the pattern at all.
      </GP>

      <GH2>Reading the prefix</GH2>
      <GuideTable
        head={["Era", "What the number looks like", "Example", "The full list"]}
        rows={ERAS.map(([era, pattern, example, setRef, note]) => [
          era,
          pattern,
          example,
          <Link key={setRef.href} href={setRef.href} className={GUIDE_LINK_CLASS}>
            {setRef.name}
            {note ? `, ${note}` : ""}
          </Link>,
        ])}
        minWidth="52rem"
        caption="Promo numbering by era, as this site's catalogue files it. Each era's promos are one set, so the prefix plus the number identifies the card - and the last column opens that set's full card list."
      />
      <Gallery
        cards={[
          { card: C.promoMewWotc08, caption: "Black star, out of 53" },
          { card: C.promoCharizardGLvxDp45, caption: "DP prefix" },
          { card: C.promoPikachuHgss03, caption: "HGSS prefix" },
          { card: C.promoGlaceonBw90, caption: "BW prefix" },
          { card: C.promoEeveeSwsh042, caption: "SWSH prefix" },
          { card: C.promoMewExSvp053, caption: "SVP, three digits" },
          { card: C.promoPikachuMe093, caption: "Mega Evolution, three digits" },
        ]}
        width={140}
        priorityCount={3}
        note="One promo from each era. Catalogue scans, complete card faces; each links to its own page. The number style on the card is the era; the number itself is the card."
      />
      <GP>
        The practical consequence: a search for a promo needs the prefix. &quot;Pikachu promo&quot; matches hundreds
        of cards; &quot;Pikachu SWSH020&quot; matches one. The{" "}
        <Link href={PRICE_CHECKER_HREF} className={GUIDE_LINK_CLASS}>
          price checker
        </Link>{" "}
        accepts the number as printed, prefix and all.
      </GP>

      <GH2>Three &quot;promos&quot; that do not use a promo number</GH2>
      <GUL>
        <li>
          <strong>Prerelease stamps.</strong> A prerelease card is a normal set card with a stamp added, so it keeps
          the set&apos;s own number. Our catalogue files it under the era&apos;s promo set with the stamp noted in
          its name, and it is a different card from the unstamped one with the same number.
        </li>
        <li>
          <strong>Professor Program and other stamped set cards.</strong> Same idea: a set number, a stamp, a
          separate entry. The Voltorb below reads 066/193 because that is its set number; the program mark is what
          makes it a promo.
        </li>
        <li>
          <strong>Japanese promos.</strong> Japanese promo numbering is its own system, written with a suffix rather
          than a prefix &mdash; &quot;227/S-P&quot;, &quot;88/SM-P&quot;, &quot;150/XY-P&quot;. A Japanese promo is
          a different product from the English promo of the same Pokemon, priced separately.
        </li>
      </GUL>
      <Gallery
        cards={[
          { card: C.promoCharizardXyPrerelease, caption: "Set number, prerelease stamp" },
          { card: C.promoVoltorbProfessor, caption: "Set number, Professor Program" },
          { card: C.promoPikachu227SP, caption: "Japanese, S-P suffix" },
        ]}
        width={150}
        note="Three promos whose numbers look like something else: two stamped set cards keeping their set number, and a Japanese promo with a suffix instead of a prefix."
      />

      <GH2>Same Pokemon, many promos</GH2>
      <GP>
        The other trap is assuming a Pokemon has one promo. Pikachu has dozens across every era, several within a
        single era, and in the Scarlet &amp; Violet promos a card can exist twice at the same number &mdash; once
        plain and once as a Pokemon Center exclusive, which the catalogue files as separate entries. If a listing
        names a Pokemon and says &quot;promo&quot; without a number, it has not identified the card.
      </GP>
      <Gallery
        cards={[
          { card: C.promoPikachuSwsh020, caption: "SWSH020" },
          { card: C.promoEeveeSwsh042, caption: "SWSH042" },
          { card: C.promoPikachu227SP, caption: "227/S-P" },
        ]}
        width={150}
        note="Two Sword & Shield era promos and a Japanese one. The number, not the Pokemon, is the identity."
      />

      <GH2>What this page does not do</GH2>
      <GUL>
        <li>
          <strong>It is not a checklist.</strong> Promo runs are long &mdash; the Sword &amp; Shield promos alone
          run past SWSH300 &mdash; and we hold many but not every number. The era pages linked from each card list
          what we track; none of them claims to be complete.
        </li>
        <li>
          <strong>It does not say which product a promo came from</strong> unless the card itself says so. Promos are
          distributed through tins, boxes, events and shops, and that history is not something we can verify from a
          scan.
        </li>
        <li>
          <strong>It gives no prices.</strong> Each linked card page carries its own recent-sold market reference,
          dated and with its condition stated; those references are not guaranteed values.
        </li>
      </GUL>
      <GP>
        For the general method of working out which page prices the card you are holding, see{" "}
        <Link href="/guides/how-much-is-my-pokemon-card-worth" className={GUIDE_LINK_CLASS}>
          how much is my card worth
        </Link>
        ; for where the number is printed on the card and the other cases that confuse people, the{" "}
        <Link href="/guides/how-to-find-pokemon-card-set-and-number" className={GUIDE_LINK_CLASS}>
          set-and-number guide
        </Link>
        .
      </GP>
    </GuideLayout>
  );
}
