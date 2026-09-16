import Image from "next/image";
import Link from "next/link";
import GuideLayout, { GP, GH2, GUL } from "@/components/GuideLayout";
import GuideFigure from "@/components/guides/GuideFigure";
import { guideMetadata } from "@/lib/guides";
import { GUIDE_CARDS, GUIDE_SETS, GUIDE_LINK_CLASS } from "@/lib/guideLinks";
import { catalogImageUrl } from "@/lib/cardImage";

const SLUG = "pokemon-30th-celebration-guide";
export const metadata = guideMetadata(SLUG);

// Every fact below is sourced. The official pages are the authority; where
// our catalogue is the source (numbers, which cards exist) the text says
// so and never calls it complete. Nothing here is a price, a pull rate or
// a stock claim. Checked 2026-09-16.
const SOURCES = {
  expansion: { href: "https://tcg.pokemon.com/en-us/expansions/30th-celebration/", label: "Official expansion page", short: "expansion page" },
  gallery: { href: "https://tcg.pokemon.com/en-us/galleries/30th-celebration/", label: "Official card gallery", short: "card gallery" },
  announce: { href: "https://www.pokemon.com/uk/news/get-ready-for-pokemon-tcg-30th-celebration", label: "Official announcement (UK, 1 June 2026)", short: "announcement" },
  showcase: { href: "https://www.pokemon.com/uk/news/pokemon-tcg-30th-celebration-product-showcase", label: "Official product showcase (UK, 30 June 2026)", short: "product showcase" },
  etb: { href: "https://www.pokemon.com/us/pokemon-tcg/product-gallery/30th-celebration-elite-trainer-box", label: "Official Elite Trainer Box product page (US)", short: "Elite Trainer Box page" },
};

const SRC_LINK = "text-zinc-500 underline decoration-zinc-300 underline-offset-2 hover:text-red-600 dark:text-zinc-400 dark:hover:text-red-500";

// Inline citation. With children it is a plain labelled link (used inside
// tables); on its own it reads "(source: expansion page)" so two citations
// in a row never collapse into "source source".
function Src({ id, children }) {
  const s = SOURCES[id];
  const link = (
    <a href={s.href} rel="noopener noreferrer" target="_blank" className={SRC_LINK}>
      {children ?? s.short}
    </a>
  );
  if (children) return link;
  return <span className="text-sm text-zinc-500 dark:text-zinc-400">(source: {link})</span>;
}

function Srcs({ ids }) {
  return (
    <span className="text-sm text-zinc-500 dark:text-zinc-400">
      (sources:{" "}
      {ids.map((id, i) => (
        <span key={id}>
          {i > 0 ? ", " : ""}
          <a href={SOURCES[id].href} rel="noopener noreferrer" target="_blank" className={SRC_LINK}>
            {SOURCES[id].short}
          </a>
        </span>
      ))}
      )
    </span>
  );
}

// A real card scan (TCGplayer product image, the same CDN every card page
// uses), complete card face, fixed 717:1000 proportions so nothing shifts
// while it loads, linked to the card's own page. Illustrator credits are
// only printed where verified - the card face itself carries the credit.
function CardTile({ card, caption, width = 168, priority = false }) {
  const height = Math.round((width * 1000) / 717);
  // The link is full-width so the image's width/height attributes reserve
  // the tile's space before the lazy image loads (a centred block would
  // shrink-to-fit to 0 and the card would pop in). On phones two tiles
  // share a row.
  return (
    <li className="flex flex-col items-center" style={{ width, maxWidth: "calc(50% - 0.5rem)" }}>
      <Link href={card.href} className="block w-full rounded-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600">
        <Image
          src={catalogImageUrl(card.tcgplayerId)}
          alt={`${card.label} — ${card.set}, complete card face`}
          width={width}
          height={height}
          sizes={`(max-width: 640px) 45vw, ${width}px`}
          priority={priority}
          className="h-auto w-full rounded-md shadow-sm"
        />
      </Link>
      <span className="mt-2 text-center text-[11px] leading-snug text-zinc-600 dark:text-zinc-400">
        <Link href={card.href} className="font-medium text-zinc-800 hover:text-red-600 hover:underline dark:text-zinc-200 dark:hover:text-red-500">
          {card.label}
        </Link>
        {caption ? <><br />{caption}</> : null}
      </span>
    </li>
  );
}

function Gallery({ cards, width, priorityCount = 0 }) {
  return (
    <ul className="m-0 flex list-none flex-wrap justify-center gap-x-4 gap-y-6 p-0">
      {cards.map(({ card, caption }, i) => (
        <CardTile key={card.href} card={card} caption={caption} width={width} priority={i < priorityCount} />
      ))}
    </ul>
  );
}

const TH = "px-3 py-2.5 font-semibold";
const TD = "px-3 py-3 align-top leading-relaxed text-zinc-600 dark:text-zinc-400";
function Table({ head, rows, minWidth = "36rem", caption }) {
  return (
    <div className="mt-4 overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
      <table className="w-full border-collapse text-left text-sm" style={{ minWidth }}>
        {caption && <caption className="px-3 py-2 text-left text-xs text-zinc-500 dark:text-zinc-400">{caption}</caption>}
        <thead>
          <tr className="border-b border-zinc-200 bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
            {head.map((h) => (
              <th key={h} scope="col" className={TH}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-100 dark:divide-zinc-900">
          {rows.map((r, i) => (
            <tr key={i}>
              {r.map((cell, j) =>
                j === 0 ? (
                  <th key={j} scope="row" className="px-3 py-3 align-top font-semibold text-black dark:text-zinc-50">{cell}</th>
                ) : (
                  <td key={j} className={TD}>{cell}</td>
                ),
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Product wave wording is the official UK/EU showcase's ("Available
// September 2026"); the US Elite Trainer Box page states the exact day.
// No prices: none are given on the sourced pages, and a US price would not
// be an Australian or worldwide fact anyway.
const PRODUCTS = [
  ["Elite Trainer Box", "9 booster packs", "1 full-art Nidorina promo", "16 foil Basic Energy cards, 65 sleeves, dice, coin, storage box with 6 dividers, player's guide, Pokemon TCG Live code", "16 September 2026 (US product page); \"September 2026\" (UK showcase)"],
  ["Pokemon Center Elite Trainer Box", "11 booster packs", "2 full-art Nidorina promos (one with the Pokemon Center logo)", "Same accessory set as the standard box; sold through the Pokemon Center", "September 2026 (UK showcase)"],
  ["2-Pack Blister", "2 booster packs", "1 foil Eevee promo", "Plastic coin", "September 2026"],
  ["Knock Out Collection", "2 booster packs", "1 foil Eevee promo", "Plastic coin (the showcase describes it with the same contents as the blister)", "September 2026"],
  ["Binder Collection", "5 booster packs", "None stated", "Nine-pocket binder with a 30-year commemorative design", "September 2026"],
  ["Poster Collection", "3 booster packs", "3 foil promos: Articuno, Zapdos, Moltres", "Poster showing 160+ cards", "September 2026"],
  ["Pokemon ex Box — Sylveon ex or Greninja ex", "4 booster packs", "1 foil promo (Sylveon ex or Greninja ex) plus an oversize version", "—", "September 2026"],
  ["Booster Bundle", "6 booster packs", "None stated", "—", "October 2026"],
  ["Mini Tins", "2 booster packs per tin", "None stated", "Sticker sheet and an art card per tin; ten artworks across the tins form two images", "October 2026"],
  ["Battle Deck — Espeon ex or Umbreon ex", "None (a 60-card all-foil deck)", "Illustration rare Victini (Espeon deck) or Zeraora (Umbreon deck)", "Deck box, coin, playmat", "October 2026"],
  ["Tech Sticker Collection", "3 booster packs", "1 foil promo: Alolan Exeggutor or Lucario", "Matching tech sticker sheet", "November 2026"],
  ["Ditto Premium Collection", "8 booster packs", "1 Ditto foil promo", "Acrylic display stand", "November 2026"],
  ["Figure Collection — Mew or Mewtwo", "5 booster packs", "1 foil promo plus an oversize card of the same Pokemon", "Sculpted figure", "November 2026"],
  ["Ultra-Premium Collection — Day & Night", "29 booster packs + 1 Classic Collection booster pack", "Pikachu ex and Espeon ex, or Pikachu ex and Umbreon ex", "Playmat, sleeves, deck box, accessories", "November 2026"],
];

const HERO = [
  { card: GUIDE_CARDS.c30MewExFuturistic, caption: "Futuristic rare" },
  { card: GUIDE_CARDS.c30PikachuRare023, caption: "Pikachu rare" },
  { card: GUIDE_CARDS.c30ClassicCharizard, caption: "Classic Collection" },
  { card: GUIDE_CARDS.c30PikachuExSir149, caption: "Special illustration rare" },
];
const PIKACHU = [
  { card: GUIDE_CARDS.c30PikachuRare027 },
  { card: GUIDE_CARDS.c30PikachuRare036 },
  { card: GUIDE_CARDS.c30PikachuRare040 },
  { card: GUIDE_CARDS.c30PikachuEx053, caption: "Pokemon ex (double rare)" },
  { card: GUIDE_CARDS.c30PikachuExSir150, caption: "Special illustration rare" },
];
const FUTURISTIC = [
  { card: GUIDE_CARDS.c30MewtwoExFuturistic, caption: "Illustrated by YOSHIROTTEN" },
  { card: GUIDE_CARDS.c30MewExFuturistic, caption: "Illustrated by YOSHIROTTEN" },
];
const ILLUSTRATION = [
  { card: GUIDE_CARDS.c30AlolanExeggutorIr, caption: "Illustration rare" },
  { card: GUIDE_CARDS.c30LaprasIr, caption: "Illustration rare" },
  { card: GUIDE_CARDS.c30HisuianZoruaIr, caption: "Illustration rare" },
  { card: GUIDE_CARDS.c30MausholdIr, caption: "Illustration rare" },
  { card: GUIDE_CARDS.c30GreninjaExSir, caption: "Special illustration rare" },
  { card: GUIDE_CARDS.c30SylveonExSir, caption: "Special illustration rare" },
  { card: GUIDE_CARDS.c30JirachiExSir, caption: "Special illustration rare" },
];
const EX = [
  { card: GUIDE_CARDS.c30EspeonEx, caption: "Leads the Espeon ex Battle Deck" },
  { card: GUIDE_CARDS.c30UmbreonEx, caption: "Leads the Umbreon ex Battle Deck" },
];
const CLASSIC = [
  { card: GUIDE_CARDS.c30ClassicCharizard, caption: "Originally Base Set (1999)" },
  { card: GUIDE_CARDS.c30ClassicPikachuZekromGx, caption: "Originally Sun & Moon — Team Up" },
  { card: GUIDE_CARDS.c30ClassicLugia, caption: "Keeps its 149/147 number" },
  { card: GUIDE_CARDS.c30ClassicMagikarp, caption: "Keeps its 203/193 number" },
  { card: GUIDE_CARDS.c30ClassicGengarPrime, caption: "A HeartGold & SoulSilver-era Prime" },
  { card: GUIDE_CARDS.c30ClassicRayquazaEx, caption: "A Black & White-era EX" },
];

export default function Page() {
  return (
    <GuideLayout slug={SLUG}>
      <GP>
        Pokemon TCG: <em>30th Celebration</em> is the expansion made for the game&apos;s 30th anniversary.
        It released on 16 September 2026 as the Pokemon TCG&apos;s first simultaneous worldwide launch,
        every card in its booster packs is foil, every pack carries one of thirty different Pikachu rare
        cards, and it introduces a new rarity, the Futuristic rare, alongside a Classic Collection of
        reprinted cards from the game&apos;s past. <Src id="announce" /> This guide covers what is
        officially confirmed, how the products differ, and how to buy the right printing.
      </GP>

      <GuideFigure caption="Four of the expansion's card types, from the catalogue scans this site uses on its card pages: a Futuristic rare (Mew ex, 158/128), one of the thirty Pikachu rares (023/128), a Classic Collection reprint (Charizard, keeping its Base Set number 4/102) and a special illustration rare (Pikachu ex, 149/128). Each links to its own card page.">
        <Gallery cards={HERO} width={150} priorityCount={4} />
      </GuideFigure>

      <GH2>What the anniversary is, and what this expansion is not</GH2>
      <GP>
        The official expansion page presents <em>30th Celebration</em> as a celebration of 30 years of
        the Pokemon Trading Card Game, and its announcement described the set as the first to have a
        simultaneous global release. <Srcs ids={["expansion", "announce"]} />
      </GP>
      <GP>
        It is not the same product as <strong>Celebrations</strong>, the 2021 expansion for the
        25th anniversary. The names are close enough that listings, boxes and even some retailer pages
        mix them up. They are separate sets with separate cards, separate collector numbers and separate
        sealed products &mdash; both, for example, have a standard Elite Trainer Box and a Pokemon Center
        Elite Trainer Box. Our{" "}
        <Link href={GUIDE_SETS.thirtiethCelebration.href} className={GUIDE_LINK_CLASS}>
          30th Celebration set page
        </Link>{" "}
        and the{" "}
        <Link href={GUIDE_SETS.celebrations2021.href} className={GUIDE_LINK_CLASS}>
          Celebrations (2021) set page
        </Link>{" "}
        are kept apart for that reason.
      </GP>

      <GH2>Release dates</GH2>
      <Table
        head={["What", "Date", "Source"]}
        rows={[
          ["Expansion (booster packs and the first product wave)", "16 September 2026, worldwide", <Src key="a" id="announce">Official announcement</Src>],
          ["Elite Trainer Box (standard)", "16 September 2026, \"at the Pokemon Center and where Pokemon TCG products are sold\"", <Src key="b" id="etb">US product page</Src>],
          ["Second product wave (Booster Bundle, Mini Tins, Battle Decks)", "\"Available October 2026\"", <Src key="c" id="showcase">UK product showcase</Src>],
          ["Third product wave (Tech Sticker, Ditto, Figure and Ultra-Premium collections)", "\"Available November 2026\"", <Src key="d" id="showcase">UK product showcase</Src>],
        ]}
        caption="The month-level dates are the official UK/EU showcase's wording. We have not verified a separate Australian product schedule on an official Australian page; treat local availability as something to confirm with a retailer, not a worldwide fact."
      />

      <GH2>The 30 Pikachu rares</GH2>
      <GP>
        The headline mechanic: every booster pack includes one Pikachu rare card, and there are thirty
        different ones, each with its own illustration and illustrator. <Src id="expansion" /> The
        announcement named three of the illustrators &mdash; OKACHEKE, Yuu Nishida and Atsuko
        Nishida &mdash; and promised more reveals.{" "}
        <Src id="announce" /> In our catalogue the Pikachu rares run from 023/128 to 052/128, thirty
        consecutive numbers, which matches the official count. The catalogue does not record
        illustrators, so we credit them only where the official pages do; the credit is printed on
        each card face.
      </GP>
      <GP>
        For collectors this is the set&apos;s natural project: one Pikachu per pack makes a full run of
        thirty realistic from sealed product, and each number is a distinct card with its own page
        and its own market. Pikachu also appears as a regular Pokemon ex (053/128 and 054/128) and as
        two special illustration rares above the printed total (149/128 and 150/128) &mdash; different
        cards from the thirty, and priced as such.
      </GP>
      <GuideFigure caption="Three more of the thirty Pikachu rares (027, 036 and 040 of 128), plus the two kinds of Pikachu that are not part of the thirty: the Pokemon ex at 053/128 and a special illustration rare at 150/128. Numbers above 128 are normal for this set — see the checklist section.">
        <Gallery cards={PIKACHU} width={150} />
      </GuideFigure>

      <GH2>Futuristic rares: the new rarity</GH2>
      <GP>
        <em>30th Celebration</em> debuts the Futuristic rare, a card type designed by the artist
        YOSHIROTTEN, who also illustrated the set&apos;s foil Basic Energy cards. The two revealed
        Futuristic rares are Mewtwo ex and Mew ex. <Srcs ids={["expansion", "announce"]} /> In our
        catalogue they sit at 157/128 and 158/128, the last two numbers we hold for the set. The
        official gallery lists &ldquo;Futuristic Rare&rdquo; as one of its own filter categories, next to
        Pokemon ex, Special Art, Pikachu Rare and Classic Collection. <Src id="gallery" />
      </GP>
      <GuideFigure caption="The two Futuristic rares. The treatment is graphic and typographic rather than painterly, which is why the official pages single out the artist by name.">
        <Gallery cards={FUTURISTIC} width={170} />
      </GuideFigure>

      <GH2>Illustration rares, special illustration rares and Pokemon ex</GH2>
      <GP>
        Beyond the Pikachu run the set uses the modern rarity ladder. The announcement named
        illustration rares for Espeon, Umbreon, Lapras, Drifloon, Zorua and Lycanroc, and Pokemon ex
        for Greninja and Sylveon. <Src id="announce" /> Our catalogue places the illustration rares
        from 129/128 upward (Alolan Exeggutor at 129 through Maushold at 146), the special illustration
        rares from 147/128 (Fuecoco ex, Greninja ex, Pikachu ex, Sylveon ex, Jirachi ex, Salamence ex),
        and regular Pokemon ex within the main numbering &mdash; Fuecoco, Greninja, Pikachu, Mewtwo,
        Mew, Espeon, Sylveon, Umbreon, Jirachi and Salamence.
      </GP>
      <GuideFigure caption="Illustration rares (Alolan Exeggutor 129, Lapras 131, Hisuian Zorua 145, Maushold 146) and special illustration rares (Greninja ex 148, Sylveon ex 153, Jirachi ex 155). The illustration rares are full-scene artwork; the special illustration rares are the ex cards' painted versions.">
        <Gallery cards={ILLUSTRATION} width={150} />
      </GuideFigure>
      <GuideFigure caption="Espeon ex (070/128) and Umbreon ex (092/128) each lead one of the October Battle Decks; the decks are all-foil and each includes an illustration rare of its own (Victini or Zeraora) rather than booster packs.">
        <Gallery cards={EX} width={170} />
      </GuideFigure>

      <GH2>The Classic Collection</GH2>
      <GP>
        The other anniversary idea is the Classic Collection: cards from the game&apos;s history
        reprinted with a new foil treatment. The official pages name Charizard from Base Set and
        Pikachu &amp; Zekrom-GX from Sun &amp; Moon&mdash;Team Up as examples, and note these reprints
        are not legal in the Standard format. <Srcs ids={["expansion", "announce"]} /> The
        expansion page describes them as cards you can encounter in <em>30th Celebration</em> booster
        packs; the product showcase separately lists a &ldquo;30th Celebration Classic Collection
        booster pack&rdquo; inside the November Ultra-Premium Collection. <Src id="showcase" /> Both
        are official; we do not know beyond that how the two distributions relate.
      </GP>
      <GP>
        The important identification fact: Classic Collection cards keep their <strong>original</strong>{" "}
        collector numbers. The reprinted Charizard is numbered 4/102 like the 1999 card, Lugia is
        149/147, Magikarp is 203/193. Our catalogue holds thirty Classic Collection cards, filed as their
        own set so they never merge with the vintage originals &mdash; the official pages do not publish
        a total, so treat thirty as our catalogue&apos;s coverage rather than a confirmed count.
      </GP>
      <GuideFigure caption="Six Classic Collection reprints, each keeping the collector number of the card it reprints. The Charizard is a 2026 card numbered 4/102; it is not the 1999 Base Set Charizard, which has its own page.">
        <Gallery cards={CLASSIC} width={150} />
      </GuideFigure>
      <GP>
        A reprint is not the original. The 2026{" "}
        <Link href={GUIDE_CARDS.c30ClassicCharizard.href} className={GUIDE_LINK_CLASS}>
          Classic Collection Charizard
        </Link>{" "}
        and the 1999{" "}
        <Link href={GUIDE_CARDS.charizardBaseSet.href} className={GUIDE_LINK_CLASS}>
          Base Set Charizard
        </Link>{" "}
        share a name and a number and nothing else that matters to price: different set symbol,
        different foil, different year, different market. The section on identifying listings below
        covers how to tell them apart.
      </GP>

      <GH2>How the pieces fit together</GH2>
      <Table
        head={["Group", "Numbering", "Where it comes from", "Notes"]}
        rows={[
          ["Main set", "001/128 to 128/128, plus cards above 128", "30th Celebration booster packs", "All foil. Includes the thirty Pikachu rares (023 to 052), the Pokemon ex, and the illustration, special illustration and Futuristic rares above the printed total."],
          ["Classic Collection", "Each card keeps its original set's number", "Booster packs per the expansion page; a dedicated Classic Collection pack in the Ultra-Premium Collection", "Reprints with a new foil treatment. Not Standard-legal. Filed as its own set in our catalogue."],
          ["Product promos", "Separate promo numbering", "Only inside the named product", "Nidorina (Elite Trainer Boxes), Eevee (blister and Knock Out Collection), Articuno / Zapdos / Moltres (Poster Collection), Sylveon ex / Greninja ex (ex Boxes), Ditto, Mew / Mewtwo, Alolan Exeggutor / Lucario, Pikachu ex with Espeon ex or Umbreon ex (Ultra-Premium)."],
        ]}
        caption="Promo cards are separate cards from the same-named cards in the main set: the Elite Trainer Box's full-art Nidorina is not the common Nidorina at 088/128, and the blister's foil Eevee is not one of the set's Eevee cards."
      />

      <GH2>Every announced product</GH2>
      <GP>
        Contents and release waves as stated on the official product showcase and, for the Elite
        Trainer Box, its US product page. <Srcs ids={["showcase", "etb"]} /> No prices are given
        on those pages, and this guide does not add any: retail prices differ by country and change
        over time.
      </GP>
      <Table
        head={["Product", "Booster packs", "Guaranteed promo card(s)", "Also inside", "Announced availability"]}
        rows={PRODUCTS}
        minWidth="52rem"
      />
      <GP>
        The Pokemon Center Elite Trainer Box and the standard Elite Trainer Box are different products
        with different pack counts (eleven versus nine) and a different promo set, and the same
        distinction exists for the 2021 <em>Celebrations</em> boxes &mdash; so a listing has to say
        which set <em>and</em> which box type before you can compare it with anything.
      </GP>

      <GH2>Singles or sealed?</GH2>
      <GP>
        Opening packs is the anniversary experience the set was built for: the all-foil packs, the
        guaranteed Pikachu, the chance at a Futuristic rare or a Classic Collection reprint. Buying
        singles is the way to finish a specific goal &mdash; the thirty Pikachu, a particular
        illustration rare, one Classic Collection card you remember from childhood &mdash; without
        paying for duplicates. Neither is an investment, and this guide makes no claim about what
        anything will be worth later. Two practical points that are true today:
      </GP>
      <GUL>
        <li>
          No official pull rate has been published for any card type in this set, including the
          Futuristic rares. Anyone quoting odds is estimating.
        </li>
        <li>
          Every card that has a page on this site shows its own recent-sold market reference where one
          exists, so a single can be compared against real sales before you buy. Sealed products are
          compared the same way on the{" "}
          <Link href="/sealed-deals" className={GUIDE_LINK_CLASS}>
            sealed product page
          </Link>
          .
        </li>
      </GUL>

      <GH2>Identifying the right printing in a listing</GH2>
      <GUL>
        <li>
          <strong>Anniversary.</strong> 30th Celebration listings usually say &ldquo;30th&rdquo;,
          &ldquo;30th Anniversary&rdquo; or &ldquo;2026&rdquo;. The 2021 set is often listed as
          &ldquo;25th&rdquo; or just &ldquo;Celebrations&rdquo;. If the edition is unclear, read the
          description and packaging photos; do not identify a box from its price.
        </li>
        <li>
          <strong>Main set versus Classic Collection.</strong> A main-set card is numbered out of 128 and
          carries the 30th Celebration set symbol. A Classic Collection card keeps its original number
          (4/102, 149/147, 203/193) with the new foil treatment. A card with an original number and no
          anniversary foil is the original card, priced as such.
        </li>
        <li>
          <strong>Reprint versus vintage.</strong> When a listing says &ldquo;Charizard 4/102&rdquo;,
          check the set symbol, the foil and the copyright line before assuming it is the 1999 card.
          Our{" "}
          <Link href="/guides/how-to-find-pokemon-card-set-and-number" className={GUIDE_LINK_CLASS}>
            set-and-number guide
          </Link>{" "}
          shows where those details are printed.
        </li>
        <li>
          <strong>Language.</strong> The expansion released worldwide at once, so English, Japanese and
          European-language cards exist side by side. Numbering can differ between language releases,
          and our catalogue prices English cards; a Japanese card is a different product.
        </li>
        <li>
          <strong>Box type.</strong> Standard Elite Trainer Box, Pokemon Center Elite Trainer Box and a
          factory case of boxes are three different things. A seller offering several boxes is not
          automatically selling a sealed case.
        </li>
        <li>
          <strong>Promos.</strong> A promo card is only guaranteed inside its own product. A loose
          Nidorina or Eevee promo sold alone is a single, not a sealed product.
        </li>
      </GUL>

      <GH2>Checklist coverage</GH2>
      <GP>
        The main set is numbered to 128 and continues above that with the illustration, special
        illustration and Futuristic rares; our catalogue&apos;s highest number is 158/128. Our
        catalogue does not yet hold every number in that range, and the official pages do not publish a
        total, so we do not call any checklist complete. The{" "}
        <Link href={GUIDE_SETS.thirtiethCelebration.href} className={GUIDE_LINK_CLASS}>
          set page
        </Link>{" "}
        lists every card we track with its reference price, and grows as the catalogue does. The
        official card gallery shows a curated selection rather than a full list. <Src id="gallery" />
      </GP>

      <GH2>Collector questions</GH2>
      <GUL>
        <li>
          <strong>Is 30th Celebration the same as Celebrations?</strong> No. Celebrations is the 2021
          25th-anniversary set. 30th Celebration is the 2026 30th-anniversary set with its own cards and
          products.
        </li>
        <li>
          <strong>Is every card really foil?</strong> Yes for booster-pack cards, including the Basic
          Energy cards, according to the official announcement. <Src id="announce" />
        </li>
        <li>
          <strong>Do I get a Pikachu in every pack?</strong> The official pages say every booster pack
          includes a Pikachu rare card, one of thirty. <Src id="expansion" />
        </li>
        <li>
          <strong>Can I play the Classic Collection cards in Standard?</strong> The announcement says
          the reprints are not Standard-legal. <Src id="announce" />
        </li>
        <li>
          <strong>Which product has the Classic Collection booster pack?</strong> The showcase lists one
          inside the Ultra-Premium Collection &mdash; Day &amp; Night (November 2026). <Src id="showcase" />
        </li>
        <li>
          <strong>What is the Elite Trainer Box promo?</strong> A full-art Nidorina; the Pokemon Center
          version includes two, one with the Pokemon Center logo. <Srcs ids={["etb", "showcase"]} />
        </li>
        <li>
          <strong>When is it out in Australia?</strong> The expansion&apos;s worldwide date is 16
          September 2026; we have not verified an Australian product-wave schedule on an official
          Australian page.
        </li>
      </GUL>

      <GH2>More on 30th Celebration</GH2>
      <GP>
        This guide is the overview. These go deeper on one question each:
      </GP>
      <GUL>
        <li>
          <Link href="/guides/pokemon-30th-celebration-pikachu-checklist" className={GUIDE_LINK_CLASS}>
            All thirty Pikachu cards: a visual checklist
          </Link>{" "}
          &mdash; every Pikachu rare from 023/128 to 052/128 in printed order, and which Pikachu cards do not count
          towards the run.
        </li>
        <li>
          <Link href="/guides/best-pokemon-30th-celebration-pikachu-cards" className={GUIDE_LINK_CLASS}>
            The best Pikachu artwork in the set
          </Link>{" "}
          &mdash; our editorial picks from the thirty, with the criteria we used.
        </li>
        <li>
          <Link href="/guides/pokemon-30th-celebration-classic-collection" className={GUIDE_LINK_CLASS}>
            Classic Collection: reprint or original?
          </Link>{" "}
          &mdash; how to tell a 2026 anniversary reprint from the original card it copies, and the thirty reprints we
          track.
        </li>
      </GUL>

      <GH2>Sources and what is still unconfirmed</GH2>
      <GUL>
        {Object.values(SOURCES).map((s) => (
          <li key={s.href}>
            <a href={s.href} rel="noopener noreferrer" target="_blank" className={GUIDE_LINK_CLASS}>
              {s.label}
            </a>
          </li>
        ))}
        <li>
          Collector numbers, the thirty-card Pikachu range, the illustration-rare ranges and the
          Classic Collection card list are from this site&apos;s own catalogue, checked on 16 September
          2026. Card images are the catalogue scans used across the site.
        </li>
      </GUL>
      <GP>
        Not confirmed on an official page as of the last check: the total number of cards in the set,
        the total number of Classic Collection cards, the illustrator of each individual Pikachu rare,
        any pull rate, any price, and an Australian product schedule. The announcement itself says more
        cards were still to be revealed. <Src id="announce" />
      </GP>
    </GuideLayout>
  );
}
