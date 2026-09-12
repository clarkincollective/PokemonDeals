import Image from "next/image";
import Link from "next/link";
import GuideLayout, { GP, GH2, GUL } from "@/components/GuideLayout";
import GuideFigure from "@/components/guides/GuideFigure";
import { guideMetadata } from "@/lib/guides";
import { GUIDE_CARDS, GUIDE_LINK_CLASS } from "@/lib/guideLinks";
import { catalogImageUrl } from "@/lib/cardImage";

const SLUG = "how-to-find-pokemon-card-set-and-number";
export const metadata = guideMetadata(SLUG);

// Annotated catalogue artwork.
//
// The card image is never modified: rings are absolutely-positioned
// outlines drawn OVER the untouched artwork, and every label sits outside
// the image, beneath it. Nothing is drawn onto the card face that isn't
// already printed there, and the ring colour is the site accent so an
// annotation can't be mistaken for card printing.
//
// `rings` are percentages of the rendered image box, so they hold at any
// width (verified at 390px and desktop).
function CardArt({ card, width = 200, rings = [], note }) {
  return (
    <figure className="m-0 flex flex-col items-center">
      <div className="relative" style={{ width, maxWidth: "100%" }}>
        <Image
          src={catalogImageUrl(card.tcgplayerId)}
          alt={`${card.name} — ${card.set}, card number ${card.cardNumber}`}
          width={width}
          height={Math.round((width * 1000) / 717)}
          sizes={`${width}px`}
          className="h-auto w-full rounded-md"
        />
        {rings.map((r, i) => (
          <span
            key={i}
            aria-hidden
            className="absolute rounded-[3px] ring-2 ring-red-600 dark:ring-red-500"
            style={{ left: r.left, top: r.top, width: r.width, height: r.height }}
          />
        ))}
      </div>
      {note && (
        <figcaption className="mt-2 text-center text-[11px] leading-snug text-zinc-500 dark:text-zinc-400">
          {note}
        </figcaption>
      )}
    </figure>
  );
}

export default function Page() {
  return (
    <GuideLayout slug={SLUG}>
      <GP>
        Almost every Pokemon card prints a small number near one of its bottom corners. It is the
        quickest way to tell one card from another card with the same name &mdash; once you know which
        number to read.
      </GP>

      <GH2>Start here: four things to check</GH2>
      <GUL>
        <li>
          Find the small number near a bottom corner of the card. It usually looks like 4/102 or
          095/203.
        </li>
        <li>
          Check it isn&apos;t the Pokedex number. If the number sits near the Pokemon&apos;s height
          and weight rather than at the very bottom edge, it is a different number.
        </li>
        <li>
          Find the set symbol or set code near the collector number, or on older cards in the lower
          corner of the artwork.
        </li>
        <li>Note the card&apos;s name, and look all three up together.</li>
      </GUL>
      <GP>
        These details help narrow down the catalogue match. They don&apos;t always settle which
        printing you have &mdash; the last section explains why.
      </GP>

      <GH2>Reading the number</GH2>
      <GP>
        Read 4/102 as collector number 4 within a printed numbering total of 102. The second figure is
        the numbering total printed on the card; it doesn&apos;t necessarily count every variant or
        extra card associated with a set.
      </GP>

      <GH2>Two numbers on one card</GH2>
      <GP>
        Many cards print more than one number, and it is worth knowing which is which. The{" "}
        <Link href={GUIDE_CARDS.charmanderGenerations.href} className={GUIDE_LINK_CLASS}>
          Generations Charmander
        </Link>{" "}
        shows both at once. The bar under the artwork reads NO. 004: that is Charmander&apos;s
        National Pokedex number, not this card&apos;s collector number. The collector number for this
        card is at the bottom edge &mdash; RC3/RC32.
      </GP>

      <GuideFigure caption="One card, two numbers. The upper ring marks NO. 004, Charmander's National Pokedex number. The lower ring marks RC3/RC32 at the bottom edge, which is this card's collector number. Rings are added annotations, not printing on the card.">
        <div className="flex justify-center">
          <CardArt
            card={GUIDE_CARDS.charmanderGenerations}
            width={260}
            rings={[
              { left: "20%", top: "48.5%", width: "26%", height: "4.5%" },
              { left: "66%", top: "93%", width: "26%", height: "4.5%" },
            ]}
            note="Charmander — Generations: Radiant Collection"
          />
        </div>
      </GuideFigure>

      <GP>
        As a rule of thumb, a number sitting with the height and weight is the Pokedex number. The
        collector number sits at the bottom edge of the card.
      </GP>

      <GH2>When the first number is higher than the second</GH2>
      <GP>
        215/203 looks wrong, but it is a real collector number. Sets can include cards numbered beyond
        the printed numbering total, so a number higher than the total is not by itself a sign of a
        problem.
      </GP>
      <GP>
        Umbreon VMAX from Evolving Skies is one verified example. It exists as{" "}
        <Link href={GUIDE_CARDS.umbreonVmax.href} className={GUIDE_LINK_CLASS}>
          095/203
        </Link>
        ,{" "}
        <Link href={GUIDE_CARDS.umbreonVmaxSecret.href} className={GUIDE_LINK_CLASS}>
          214/203
        </Link>{" "}
        and{" "}
        <Link href={GUIDE_CARDS.umbreonVmaxAltArt.href} className={GUIDE_LINK_CLASS}>
          215/203
        </Link>{" "}
        &mdash; three separate cards, each with its own page. On these cards the collector number sits
        at the bottom <strong>left</strong>, beside the set symbol.
      </GP>

      <GuideFigure caption="Three separate Umbreon VMAX cards from the same set. 214/203 and 215/203 are numbered beyond the printed total of 203. Here the number sits bottom left, beside the set symbol.">
        <div className="flex flex-wrap justify-center gap-4">
          <CardArt card={GUIDE_CARDS.umbreonVmax} width={150} rings={[{ left: "6%", top: "92.5%", width: "26%", height: "4.5%" }]} note="095/203" />
          <CardArt card={GUIDE_CARDS.umbreonVmaxSecret} width={150} rings={[{ left: "6%", top: "92.5%", width: "26%", height: "4.5%" }]} note="214/203" />
          <CardArt card={GUIDE_CARDS.umbreonVmaxAltArt} width={150} rings={[{ left: "6%", top: "92.5%", width: "26%", height: "4.5%" }]} note="215/203" />
        </div>
      </GuideFigure>

      <GH2>Leading zeros don&apos;t change the card</GH2>
      <GP>
        Your card may print 4/102 while catalogues &mdash; including ours &mdash; write it 004/102.
        Same card. Zero-padding is a filing convention that keeps numbers sorting in order.
      </GP>

      <GH2>Same name, different number</GH2>
      <GP>
        Three Charizards:{" "}
        <Link href={GUIDE_CARDS.charizardBaseSet.href} className={GUIDE_LINK_CLASS}>
          Base Set 004/102
        </Link>
        ,{" "}
        <Link href={GUIDE_CARDS.charizardBaseSet2.href} className={GUIDE_LINK_CLASS}>
          Base Set 2 004/130
        </Link>{" "}
        and{" "}
        <Link href={GUIDE_CARDS.charizardEvolutions.href} className={GUIDE_LINK_CLASS}>
          XY Evolutions 11/108
        </Link>
        . Same Pokemon, three different cards. The name alone can&apos;t separate them; the number and
        set can. On the Base Set card the collector number sits at the bottom <strong>right</strong>,
        under the attack text &mdash; the position has moved between eras, so check both bottom
        corners.
      </GP>

      <GuideFigure caption="Three Charizards. The name is identical; the set and number separate them. On the Base Set card the number sits bottom right, rather than bottom left as on the modern cards above.">
        <div className="flex flex-wrap justify-center gap-4">
          <CardArt card={GUIDE_CARDS.charizardBaseSet} width={150} rings={[{ left: "72%", top: "92.5%", width: "22%", height: "5%" }]} note="Base Set — 004/102" />
          <CardArt card={GUIDE_CARDS.charizardBaseSet2} width={150} note="Base Set 2 — 004/130" />
          <CardArt card={GUIDE_CARDS.charizardEvolutions} width={150} note="XY Evolutions — 11/108" />
        </div>
      </GuideFigure>

      <GH2>What the name, set and number still don&apos;t settle</GH2>
      <GP>
        Together they narrow down which card you are holding. They don&apos;t always finish the job,
        because different printings can share the same name, set and number.
      </GP>
      <GUL>
        <li>
          <strong>Foil treatment.</strong> Where a card exists as both a holo and a non-holo, or has a
          reverse-holo version, those printings can share a collector number. Not every product has
          every foil treatment, so which ones exist depends on the card and the set.
        </li>
        <li>
          <strong>Edition and print markings.</strong> Some releases carry stamps or markings that
          others of the same number don&apos;t.
        </li>
        <li>
          <strong>Language.</strong> The same card exists in other languages, and numbering can differ
          across language releases rather than matching the English card.
        </li>
      </GUL>
      <GP>
        So when comparing your card against a price, match the printing as well as the number. For
        what to check on the card itself, see{" "}
        <Link href="/guides/how-to-check-pokemon-card-condition" className={GUIDE_LINK_CLASS}>
          how to check a card&apos;s condition
        </Link>
        .
      </GP>
      <GP>
        A matching set and number does not prove authenticity. Printed details can be copied, so
        identification and authentication are separate questions.
      </GP>
    </GuideLayout>
  );
}
