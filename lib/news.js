// Latest news registry - dated items about new sets, new cards and card
// prices. Shared so the hub, the item pages and the sitemap agree.
//
// How this differs from its neighbours, so none of them duplicate another:
//   /news            - dated, time-sensitive: what happened, and when.
//   /guides          - evergreen explainers; a guide is not re-dated.
//   /latest-releases  - the standing list of the newest expansions.
//   /market-data     - fixed, dated studies with their own methodology.
// A news item SIGNPOSTS those pages; it never restates them at length.
//
// Two kinds of item:
//   kind: "story"  - written, and every non-obvious fact carries an
//                    official source in `sources`. Same rules as a guide:
//                    nothing invented, no price, pull-rate or stock claim.
//   kind: "report" - a generated market report. Its figures come from a
//                    frozen artifact in lib/newsReports/ emitted by
//                    scripts/newsWeeklyReport.mjs, never from a runtime
//                    read, so a published number cannot drift.
//
// An item is only listed here once it genuinely exists. There is no
// placeholder, no "coming soon" and no back-dating.

const SITE_URL = "https://pokemondealfinder.com";

export const NEWS = [
  {
    slug: "pokemon-tcg-30th-celebration-out-now",
    kind: "story",
    title: "Pokemon TCG 30th Celebration is out now",
    blurb:
      "The 30th-anniversary expansion released worldwide on 16 September 2026 - all-foil booster packs, a Pikachu rare in every pack, a new Futuristic rare and reprinted Classic Collection cards, with more products in October and November.",
    published: "2026-09-16",
    // The catalogue (TCGplayer product) id for the social preview image.
    image: "696688",
    sources: [
      { href: "https://tcg.pokemon.com/en-us/expansions/30th-celebration/", label: "Official expansion page" },
      { href: "https://www.pokemon.com/uk/news/get-ready-for-pokemon-tcg-30th-celebration", label: "Official announcement (UK, 1 June 2026)" },
      { href: "https://www.pokemon.com/uk/news/pokemon-tcg-30th-celebration-product-showcase", label: "Official product showcase (UK, 30 June 2026)" },
      { href: "https://www.pokemon.com/us/pokemon-tcg/product-gallery/30th-celebration-elite-trainer-box", label: "Official Elite Trainer Box product page (US)" },
    ],
  },
  {
    slug: "rgb-mew-30th-celebration-unconfirmed",
    kind: "story",
    title: "The RGB Mew: what is actually known, and what is not",
    blurb:
      "Collectors report pulling three coloured Mew cards from 30th Celebration packs. The Pokemon Company has not confirmed they exist - and there is a straightforward reason they are missing from the official list.",
    published: "2026-09-16",
    updated: "2026-09-16",
    // Supplied photograph of the three reported cards, cropped to the
    // cards alone. Credited on the page; see the note there about what
    // the image can and cannot be read for.
    imageSrc: "/news/rgb-mew-trio.jpg",
    imageCredit: "Photograph via PokeBeach reporting. Card artwork © Pokemon.",
    sources: [
      { href: "https://tcg.pokemon.com/en-us/expansions/30th-celebration/", label: "Official expansion page (no RGB rarity listed)" },
      { href: "https://tcg.pokemon.com/en-us/galleries/30th-celebration/", label: "Official card gallery (a selection; no RGB Mew)" },
      { href: "https://www.pokebeach.com/2026/09/mew-rgb-secret-rares-pulled-from-30th-celebration", label: "PokeBeach: Mew RGB secret rares pulled from 30th Celebration (reporting)" },
      { href: "https://www.thegamer.com/pokemon-30th-celebration-tcg-every-card-rgb-mew/", label: "TheGamer: the official list and the RGB Mew (reporting)" },
      { href: "https://kotaku.com/pokemons-30th-anniversary-set-might-be-making-a-mysterious-new-mew-card-the-rarest-ever-2000725936", label: "Kotaku: on the rumoured pull rate and its origin (reporting)" },
      { href: "https://www.pokebeach.com/2026/08/ebay-cracks-down-on-early-30th-anniversary-pokemon-tcg-listings-at-tpcis-request", label: "PokeBeach: eBay removes leaked 30th Anniversary listings at TPCi's request (reporting)" },
      { href: "https://www.dexerto.com/pokemon/pokemon-cracks-down-on-early-30th-anniversary-card-sales-over-stolen-property-concerns-3402079/", label: "Dexerto: the stolen-property removals (reporting)" },
      { href: "https://www.wargamer.com/pokemon-trading-card-game/ebay-30th-celebration-clamps-down", label: "Wargamer: eBay clamps down on early 30th Celebration sales (reporting)" },
    ],
  },
  {
    slug: "mega-evolution-delta-reign-what-is-known",
    kind: "story",
    title: "Mega Evolution—Delta Reign: what is official, what is already out in Japan, and what leaked",
    blurb:
      "The next English expansion lands on 6 November with Mega Rayquaza ex. Its Japanese source set has been on sale since July, which is why so much is already known - and why the July leaks are no longer leaks.",
    published: "2026-09-16",
    // The current Rayquaza in our catalogue; the article is explicit that
    // no Delta Reign card is in the catalogue yet.
    image: "675965",
    sources: [
      { href: "https://www.pokemon.com/us/pokemon-tcg/mega-evolution-delta-reign", label: "Official expansion page: Mega Evolution—Delta Reign" },
      { href: "https://www.pokemon.com/us/news/the-pokemon-tcg-mega-evolution-delta-reign-expansion-arrives-november-6-2026", label: "Official announcement: Delta Reign arrives November 6, 2026" },
      { href: "https://www.pokebeach.com/2026/08/delta-reign-tcg-set-officially-revealed-for-november-full-product-lineup", label: "PokeBeach: Delta Reign officially revealed, full product lineup (reporting)" },
      { href: "https://www.pokebeach.com/2026/07/storm-emeralda-all-76-main-set-cards-revealed", label: "PokeBeach: Storm Emeralda, all 76 main-set cards revealed (reporting)" },
      { href: "https://pokemoncard.io/article/japanese-m6-storm-emeralda-set-revealed-featuring-mega-rayquaza", label: "PokemonCard.io: Japanese M6 Storm Emeralda revealed (reporting)" },
      { href: "https://blog.pokepursuittcg.com/articles/mega-rayquaza-sir-leaks-from-delta-reign-with-10-more-cards/", label: "PokePursuit: the July leak of 14 cards, dated 28 July 2026 (reporting)" },
    ],
  },
];

// Newest first. Ties keep registry order, so two items published on the
// same day stay in the order they were written.
export function newsSorted() {
  return [...NEWS].sort((a, b) => (a.published < b.published ? 1 : a.published > b.published ? -1 : 0));
}

export function getNewsItem(slug) {
  return NEWS.find((n) => n.slug === slug) ?? null;
}

// A news item's preview image. `imageSrc` is a file we host (a supplied
// photograph, credited on the page); `image` is a catalogue product id,
// the same TCGplayer scan the card pages use. imageSrc wins when both are
// present.
export function newsImageUrl(n) {
  if (!n) return null;
  if (n.imageSrc) return n.imageSrc;
  return n.image ? `https://tcgplayer-cdn.tcgplayer.com/product/${n.image}_in_1000x1000.jpg` : null;
}

export function newsMetadata(slug) {
  const n = getNewsItem(slug);
  if (!n) return {};
  const local = newsImageUrl(n);
  const image = local && local.startsWith("/") ? `${SITE_URL}${local}` : local;
  return {
    title: n.title,
    description: n.blurb,
    alternates: { canonical: `/news/${slug}` },
    openGraph: {
      title: n.title,
      description: n.blurb,
      url: `${SITE_URL}/news/${slug}`,
      type: "article",
      publishedTime: n.published,
      ...(image ? { images: [image] } : {}),
    },
    twitter: {
      card: image ? "summary_large_image" : "summary",
      title: n.title,
      description: n.blurb,
      ...(image ? { images: [image] } : {}),
    },
  };
}

// Human date for display. UTC so the printed day never shifts with the
// reader's timezone.
export function formatNewsDate(iso) {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}
