// The official pages behind the 30th Celebration articles, in one place so
// every article cites the same URL and label. Checked 2026-09-16.
//
// These are primary sources: The Pokemon Company's own expansion page,
// card gallery, announcement, product showcase and product pages. A
// secondary source (reporting rather than an official page) is never
// listed here - an article that leans on one attributes it inline, by
// name, at the claim it supports.

export const T30_SOURCES = Object.freeze({
  // --- Mega Evolution—Delta Reign (the next expansion; checked 2026-09-20).
  // Same rule: official pages only. Both pages state the date, the "over
  // 135 cards" wording and the four named Mega ex; neither lists products.
  drExpansion: {
    href: "https://www.pokemon.com/us/pokemon-tcg/mega-evolution-delta-reign",
    label: "Official expansion page: Mega Evolution—Delta Reign",
    short: "Delta Reign expansion page",
  },
  drAnnounce: {
    href: "https://www.pokemon.com/us/news/the-pokemon-tcg-mega-evolution-delta-reign-expansion-arrives-november-6-2026",
    label: "Official announcement: Delta Reign arrives November 6, 2026",
    short: "Delta Reign announcement",
  },
  expansion: {
    href: "https://tcg.pokemon.com/en-us/expansions/30th-celebration/",
    label: "Official expansion page",
    short: "expansion page",
  },
  gallery: {
    href: "https://tcg.pokemon.com/en-us/galleries/30th-celebration/",
    label: "Official card gallery",
    short: "card gallery",
  },
  announce: {
    href: "https://www.pokemon.com/uk/news/get-ready-for-pokemon-tcg-30th-celebration",
    label: "Official announcement (UK, 1 June 2026)",
    short: "announcement",
  },
  showcase: {
    href: "https://www.pokemon.com/uk/news/pokemon-tcg-30th-celebration-product-showcase",
    label: "Official product showcase (UK, 30 June 2026)",
    short: "product showcase",
  },
  // The same showcase exists in a US edition with exact dates rather than
  // months, and the two disagree on two products. Both are official, so
  // both are cited and the difference is reported rather than smoothed.
  showcaseUs: {
    href: "https://www.pokemon.com/us/news/pokemon-tcg-30th-celebration-product-showcase",
    label: "Official product showcase (US)",
    short: "US product showcase",
  },
  etb: {
    href: "https://www.pokemon.com/us/pokemon-tcg/product-gallery/30th-celebration-elite-trainer-box",
    label: "Official Elite Trainer Box product page (US)",
    short: "Elite Trainer Box page",
  },
  pcEtb: {
    href: "https://www.pokemon.com/us/pokemon-tcg/product-gallery/30th-celebration-pokemon-center-elite-trainer-box",
    label: "Official Pokemon Center Elite Trainer Box product page (US)",
    short: "Pokemon Center Elite Trainer Box page",
  },
});
