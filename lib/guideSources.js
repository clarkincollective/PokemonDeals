// Primary sources behind the content-audit guides, in one place so every
// guide cites the same URL and label.
//
// READ, NOT ASSUMED. Every entry below was opened and read on the date in
// its `checked` field, and the wording each guide attributes to it is the
// wording that page actually carries. Several of these hosts refuse
// automated retrieval (403), so they were read in a real browser; that is
// a retrieval detail, not a licence to paraphrase from memory.
//
// WHAT BELONGS HERE. Only first-party pages published by the organisation
// whose facts are being cited: The Pokemon Company's own expansion,
// product and support pages, its Play! Pokemon rules documents, the
// Pokemon Center store, and a grading company's own page for that
// company's own policy. A grader's policy is never generalised to another
// grader, and no marketplace, price aggregator, wiki or news site is a
// source for a product fact.
//
// WHAT DOES NOT BELONG HERE. Our own catalogue. When a guide says "our
// catalogue holds three Elite Trainer Boxes for this set", that is a
// first-party statement about our own data and is labelled as such in the
// prose - it is not dressed up as an official product fact.

export const GUIDE_SOURCES = Object.freeze({
  // --- Grading -----------------------------------------------------------
  // PSA's own cert-verification page. It states, in its own words, that
  // verifying a number "does not eliminate risk", that counterfeiters do
  // copy real certification numbers onto counterfeit inserts, and that PSA
  // does not view items listed on the web or warrant that any such item is
  // genuine. Cited ONLY for PSA; no other grader's policy is inferred.
  psaCert: {
    href: "https://www.psacard.com/cert",
    label: "PSA Cert Verification (PSA's own lookup and its buyer guidance)",
    short: "PSA Cert Verification",
    checked: "2026-09-22",
  },

  // --- Play! Pokemon rules ----------------------------------------------
  // The document that actually decides which card languages are legal, and
  // the one that states Japanese card backs differ. Section numbers are
  // quoted in the guide so a reader can find the passage.
  tcgTournamentHandbook: {
    href: "https://www.pokemon.com/static-assets/content-assets/cms2/pdf/play-pokemon/rules/play-pokemon-tcg-tournament-handbook-en.pdf",
    label: "Play! Pokemon TCG Tournament Handbook (English, last revision 1 September 2026)",
    short: "TCG Tournament Handbook",
    checked: "2026-09-22",
  },
  playPokemonRules: {
    href: "https://www.pokemon.com/us/play-pokemon/about/tournaments-rules-and-resources",
    label: "Play! Pokemon Rules & Resources (where the handbooks are published)",
    short: "Play! Pokemon rules index",
    checked: "2026-09-22",
  },

  // --- What a pack contains ---------------------------------------------
  packContents: {
    href: "https://support.pokemon.com/hc/en-us/articles/360000981613-What-can-I-expect-in-a-Pok%C3%A9mon-Trading-Card-Game-booster-pack",
    label: "Pokemon Support: what to expect in a booster pack",
    short: "Pokemon Support: booster pack contents",
    checked: "2026-09-22",
  },

  // --- Product pages: Scarlet & Violet 151 -------------------------------
  s151Expansion: {
    href: "https://tcg.pokemon.com/en-us/expansions/151/",
    label: "Official expansion page: Scarlet & Violet—151",
    short: "151 expansion page",
    checked: "2026-09-22",
  },
  s151Etb: {
    href: "https://www.pokemon.com/us/pokemon-tcg/product-gallery/scarlet-violet-151-elite-trainer-box",
    label: "Official product page: Scarlet & Violet—151 Elite Trainer Box",
    short: "151 ETB product page",
    checked: "2026-09-22",
  },
  s151PcEtb: {
    href: "https://www.pokemon.com/us/pokemon-tcg/product-gallery/scarlet-violet-151-pokemon-center-elite-trainer-box",
    label: "Official product page: Scarlet & Violet—151 Pokemon Center Elite Trainer Box",
    short: "151 Pokemon Center ETB product page",
    checked: "2026-09-22",
  },
  s151Upc: {
    href: "https://www.pokemon.com/us/pokemon-tcg/product-gallery/scarlet-violet-151-ultra-premium-collection",
    label: "Official product page: Scarlet & Violet—151 Ultra-Premium Collection",
    short: "151 Ultra-Premium Collection product page",
    checked: "2026-09-22",
  },

  // --- Product pages: Prismatic Evolutions -------------------------------
  prismaticExpansion: {
    href: "https://tcg.pokemon.com/en-us/expansions/prismatic-evolutions/",
    label: "Official expansion page: Scarlet & Violet—Prismatic Evolutions",
    short: "Prismatic Evolutions expansion page",
    checked: "2026-09-22",
  },
  prismaticEtb: {
    href: "https://www.pokemon.com/us/pokemon-tcg/product-gallery/scarlet-violet-prismatic-evolutions-elite-trainer-box",
    label: "Official product page: Prismatic Evolutions Elite Trainer Box",
    short: "Prismatic ETB product page",
    checked: "2026-09-22",
  },
  prismaticPcEtb: {
    href: "https://www.pokemon.com/us/pokemon-tcg/product-gallery/scarlet-violet-prismatic-evolutions-pokemon-center-elite-trainer-box",
    label: "Official product page: Prismatic Evolutions Pokemon Center Elite Trainer Box",
    short: "Prismatic Pokemon Center ETB product page",
    checked: "2026-09-22",
  },
  prismaticBundle: {
    href: "https://www.pokemon.com/us/pokemon-tcg/product-gallery/scarlet-violet-prismatic-evolutions-booster-bundle",
    label: "Official product page: Prismatic Evolutions Booster Bundle",
    short: "Prismatic Booster Bundle product page",
    checked: "2026-09-22",
  },

  // --- Product pages: Crown Zenith ---------------------------------------
  // This page carries the reason Crown Zenith has no standard booster box:
  // it states that booster packs are not sold separately for the expansion.
  crownZenithEtb: {
    href: "https://www.pokemon.com/us/pokemon-tcg/product-gallery/crown-zenith-elite-trainer-box",
    label: "Official product page: Crown Zenith Elite Trainer Box",
    short: "Crown Zenith ETB product page",
    checked: "2026-09-22",
  },

  // --- A booster display box, as the publisher's own store names it ------
  // One named product, read in full. The pack count is part of the product
  // name on the official store listing, which is why the guide can state it
  // for THIS product without asserting a universal standard.
  boosterDisplayBox: {
    href: "https://www.pokemoncenter.com/product/10-10380-119/pokemon-tcg-mega-evolution-perfect-order-booster-display-box-36-packs",
    label: "Pokemon Center: Mega Evolution—Perfect Order Booster Display Box (36 Packs)",
    short: "Pokemon Center booster display box",
    checked: "2026-09-22",
  },
});
