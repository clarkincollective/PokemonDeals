// Phase 13B.2 - canonical English set vocabulary + release order, for the
// deterministic search parser (lib/searchIntent.js) and resolver
// (lib/searchResolve.js). Static data, no I/O - safe in `node --test`.
//
// SET_NAMES is the vocabulary the parser matches a query phrase against
// ("base set charizard" -> set "Base Set"). It is NOT exhaustive of every
// card_catalog set (215 exist); it is the high-signal set the parser can
// recognise standalone. The resolver still cross-checks card_catalog for
// the real set_id and can fall back to a DB set list when one is passed.
//
// SET_RELEASE_ORDER is the deterministic tiebreak when one collector
// number exists across several sets (e.g. "4/102" -> Base Set, Base Set 2,
// Legendary Collection, Celebrations, ...). Index = chronological rank;
// a set absent from this list ranks after every listed set. This is what
// makes `charizard 4/102` resolve to the 1999 Base Set print without
// hard-coding Charizard.

// Chronological, oldest first. Curated from Pokemon TCG release history
// (stable). Covers the complete WOTC/e-Card era plus every modern set that
// matters for duplicated-collector-number disambiguation and the 13B.1
// test matrix. Extend as needed - never reorder existing entries.
export const SET_RELEASE_ORDER = [
  // --- WOTC era (1999-2003) ---
  "Base Set (Shadowless)",
  "Base Set",
  "Jungle",
  "Fossil",
  "Base Set 2",
  "Team Rocket",
  "Gym Heroes",
  "Gym Challenge",
  "Neo Genesis",
  "Neo Discovery",
  "Neo Revelation",
  "Neo Destiny",
  "Legendary Collection",
  "Expedition",
  "Aquapolis",
  "Skyridge",
  // --- EX era (2003-2007) ---
  "EX Ruby and Sapphire",
  "EX Sandstorm",
  "EX Dragon",
  "EX Team Magma vs Team Aqua",
  "EX Hidden Legends",
  "EX FireRed & LeafGreen",
  "EX Team Rocket Returns",
  "EX Deoxys",
  "EX Emerald",
  "EX Unseen Forces",
  "EX Delta Species",
  "EX Legend Maker",
  "EX Holon Phantoms",
  "EX Crystal Guardians",
  "EX Dragon Frontiers",
  "EX Power Keepers",
  // --- Diamond & Pearl / Platinum / HGSS (2007-2011) ---
  "Diamond and Pearl",
  "Mysterious Treasures",
  "Secret Wonders",
  "Great Encounters",
  "Majestic Dawn",
  "Legends Awakened",
  "Stormfront",
  "Platinum",
  "Rising Rivals",
  "Supreme Victors",
  "Arceus",
  "HeartGold SoulSilver",
  "Unleashed",
  "Undaunted",
  "Triumphant",
  "Call of Legends",
  // --- Black & White / XY (2011-2016) ---
  "Black and White",
  "Emerging Powers",
  "Noble Victories",
  "Next Destinies",
  "Dark Explorers",
  "Dragons Exalted",
  "Boundaries Crossed",
  "Plasma Storm",
  "Plasma Freeze",
  "Plasma Blast",
  "Legendary Treasures",
  "XY Base Set",
  "XY - Flashfire",
  "XY - Furious Fists",
  "XY - Phantom Forces",
  "XY - Primal Clash",
  "XY - Roaring Skies",
  "XY - Ancient Origins",
  "XY - BREAKthrough",
  "XY - BREAKpoint",
  "XY - Fates Collide",
  "XY - Steam Siege",
  "XY - Evolutions",
  "Generations",
  // --- Sun & Moon (2017-2019) ---
  "SM Base Set",
  "SM - Guardians Rising",
  "SM - Burning Shadows",
  "SM - Crimson Invasion",
  "SM - Ultra Prism",
  "SM - Forbidden Light",
  "SM - Celestial Storm",
  "SM - Lost Thunder",
  "SM - Team Up",
  "SM - Unbroken Bonds",
  "SM - Unified Minds",
  "Hidden Fates",
  "SM - Cosmic Eclipse",
  // --- Sword & Shield (2020-2022) ---
  "SWSH01: Sword & Shield Base Set",
  "SWSH02: Rebel Clash",
  "SWSH03: Darkness Ablaze",
  "SWSH: Champion's Path",
  "SWSH04: Vivid Voltage",
  "SWSH: Shining Fates",
  "SWSH05: Battle Styles",
  "SWSH06: Chilling Reign",
  "SWSH07: Evolving Skies",
  "Celebrations",
  "Celebrations: Classic Collection",
  "SWSH08: Fusion Strike",
  "SWSH09: Brilliant Stars",
  "SWSH10: Astral Radiance",
  "Pokemon GO",
  "SWSH11: Lost Origin",
  "SWSH12: Silver Tempest",
  "SWSH: Crown Zenith",
  // --- Scarlet & Violet (2023-) ---
  "SV01: Scarlet & Violet Base Set",
  "SV02: Paldea Evolved",
  "SV03: Obsidian Flames",
  "SV: Scarlet & Violet 151",
  "SV04: Paradox Rift",
  "SV: Paldean Fates",
  "SV05: Temporal Forces",
  "SV06: Twilight Masquerade",
  "SV: Shrouded Fable",
  "SV07: Stellar Crown",
  "SV08: Surging Sparks",
  "SV: Prismatic Evolutions",
  "SV09: Journey Together",
  "SV10: Destined Rivals",
  // 17C.7 - inserted with official English dates (OFFICIAL_RELEASES below);
  // no existing entry moved.
  "SV: Black Bolt",
  "SV: White Flare",
  // --- Mega Evolution (2025-) ---
  "ME01: Mega Evolution",
  "ME02: Phantasmal Flames",
  "ME: Ascended Heroes",
  "ME03: Perfect Order",
  "ME04: Chaos Rising",
  "ME05: Pitch Black",
  "ME: 30th Celebration",
];

const RELEASE_RANK = new Map(SET_RELEASE_ORDER.map((name, i) => [name.toLowerCase(), i]));

// Highest = newest / unknown. Unlisted sets sort AFTER every listed set
// (so a known old set always wins a collector-number tiebreak).
export function setReleaseRank(setName) {
  return RELEASE_RANK.get(String(setName ?? "").toLowerCase()) ?? Number.MAX_SAFE_INTEGER;
}

// Phase 17C.6 - dated supplementary sets, used ONLY for species-page era
// grouping (lib/speciesCoverage via setChronologyRank). They are
// deliberately NOT added to SET_RELEASE_ORDER, so setReleaseRank - and every
// search collector-number tiebreak built on it - is unchanged.
//
// A set is listed only when the exact English set is independently dated:
// its pokemontcg.io set record (the source scripts/generateSetImages.js
// already uses for our set images) has the release date, and that record's
// own card list matches our stored catalogue - the pilot card by name and
// collector number, and every numbered catalogue row fits the set's printed
// numbering (`check`). Subsets released inside a product (Shiny Vault,
// Trainer Gallery, Radiant Collection) carry that product's own date. No
// date is borrowed from another edition, reprint or region. Each entry sits
// straight after the listed set it followed (`after`); entries sharing an
// anchor order by date. Promo series that span years, specialty/aggregate
// groups (Jumbo, World Championship Decks, exclusives, Prize Pack, ...) and
// sets without such a record stay undated ("Other sets").
export const SET_RELEASE_SUPPLEMENTS = Object.freeze([
  { set: "Dragon Vault", after: "Dragons Exalted", released: "2012-10-05", ptcgio: "dv1", check: "Dragonite 5/20; 21 of 21 catalogue rows fit" },
  { set: "Legendary Treasures: Radiant Collection", after: "Legendary Treasures", released: "2013-11-06", ptcgio: "bw11 (RC subset)", check: "Growlithe RC4/RC25; 25 of 25 rows fit" },
  { set: "Shining Legends", after: "SM - Burning Shadows", released: "2017-10-06", ptcgio: "sm35", check: "Electrode 31/73; 78 of 87 rows fit, the other 9 are unnumbered code cards" },
  { set: "Dragon Majesty", after: "SM - Celestial Storm", released: "2018-09-07", ptcgio: "sm75", check: "Dragonite-GX 37/70; 78 of 80 rows fit, the other 2 are unnumbered code cards" },
  { set: "McDonald's Promos 2018", after: "SM - Celestial Storm", released: "2018-10-16", ptcgio: "mcd18", check: "Growlithe 1/12; 12 of 12 rows fit" },
  { set: "Detective Pikachu", after: "SM - Team Up", released: "2019-04-05", ptcgio: "det1", check: "Arcanine 6/18; 18 of 23 rows fit, the other 5 are unnumbered code cards" },
  { set: "Hidden Fates: Shiny Vault", after: "Hidden Fates", released: "2019-08-23", ptcgio: "sma", check: "Electrode-GX SV57/SV94; 94 of 94 rows fit" },
  { set: "SWSH09: Brilliant Stars Trainer Gallery", after: "SWSH09: Brilliant Stars", released: "2022-02-25", ptcgio: "swsh9tg", check: "Houndoom TG10/TG30; 30 of 30 rows fit" },
  { set: "McDonald's Promos 2022", after: "Pokemon GO", released: "2022-08-03", ptcgio: "mcd22", check: "Growlithe 4/15; 15 of 15 rows fit" },
  { set: "SWSH11: Lost Origin Trainer Gallery", after: "SWSH11: Lost Origin", released: "2022-09-09", ptcgio: "swsh11tg", check: "Hisuian Arcanine TG08/TG30; 30 of 30 rows fit" },
  // 17C.7 - the official 30th Celebration pages describe the Classic
  // Collection reprints as part of that expansion's booster packs, and our
  // 3 catalogue rows are exactly such reprints (Charizard 4/102, Lugia
  // 149/147, Pikachu & Zekrom-GX 33/181 - the page names the first and last).
  { set: "ME: 30th Celebration Classic Collection", after: "ME: 30th Celebration", released: "2026-09-16", ptcgio: null, source: "https://tcg.pokemon.com/en-us/expansions/30th-celebration/", check: "3 of 3 rows are Classic Collection reprints; their numbering keeps the original sets' numbers (official numbering not stated)" },
]);

const CHRONOLOGY_RANK = new Map(RELEASE_RANK);
{
  const byAnchor = new Map();
  for (const s of SET_RELEASE_SUPPLEMENTS) {
    const anchor = s.after.toLowerCase();
    if (!RELEASE_RANK.has(anchor) || RELEASE_RANK.has(s.set.toLowerCase())) continue;
    if (!byAnchor.has(anchor)) byAnchor.set(anchor, []);
    byAnchor.get(anchor).push(s);
  }
  for (const [anchor, list] of byAnchor) {
    list.sort((a, b) => a.released.localeCompare(b.released));
    list.forEach((s, i) => CHRONOLOGY_RANK.set(s.set.toLowerCase(), RELEASE_RANK.get(anchor) + (i + 1) / (list.length + 1)));
  }
}

// setReleaseRank plus the dated supplements (fractional ranks between their
// anchor and the next listed set). Unknown sets still rank last.
export function setChronologyRank(setName) {
  return CHRONOLOGY_RANK.get(String(setName ?? "").toLowerCase()) ?? Number.MAX_SAFE_INTEGER;
}

// Phase 17C.7 - official English release identities for the newest sets
// (the Scarlet & Violet close and the Mega Evolution Series), audited
// 2026-09-12 against The Pokemon Company's own pages. Keyed by OUR catalogue
// set name, which is a marketplace label, not the official name:
// `officialName` is how the official page styles the expansion. `series` is
// null where no official page states one. `regional` records differences
// from other regions; entries marked "(secondary)" come from community
// references, not an official page. This is the data a latest-release view
// should use - never infer "latest" from catalogue order or naming.
const TPC = "https://www.pokemon.com/us";
export const OFFICIAL_RELEASES = Object.freeze([
  {
    set: "SV: Black Bolt", officialName: "Scarlet & Violet—Black Bolt", released: "2025-07-18", series: "Scarlet & Violet Series",
    sources: [`${TPC}/pokemon-news/pokemon-tcg-scarlet-violet-black-bolt-and-white-flare-product-showcase`, `${TPC}/pokemon-tcg/scarlet-violet-black-bolt`],
    regional: "Released together with White Flare as a split expansion.",
  },
  {
    set: "SV: White Flare", officialName: "Scarlet & Violet—White Flare", released: "2025-07-18", series: "Scarlet & Violet Series",
    sources: [`${TPC}/pokemon-news/pokemon-tcg-scarlet-violet-black-bolt-and-white-flare-product-showcase`, `${TPC}/pokemon-tcg/scarlet-violet-white-flare`],
    regional: "Released together with Black Bolt as a split expansion.",
  },
  {
    set: "ME01: Mega Evolution", officialName: "Mega Evolution", released: "2025-09-26", series: "Mega Evolution Series",
    sources: ["https://tcg.pokemon.com/en-us/expansions/mega-evolution/", `${TPC}/pokemon-news/pokemon-tcg-mega-evolution-product-showcase`],
    regional: "First expansion of the series. Japan released its cards earlier as two sets, Mega Brave (M1L) and Mega Symphonia (M1S) (secondary).",
  },
  {
    set: "ME02: Phantasmal Flames", officialName: "Mega Evolution—Phantasmal Flames", released: "2025-11-14", series: "Mega Evolution Series",
    sources: [`${TPC}/pokemon-news/the-pokemon-tcg-mega-evolution-phantasmal-flames-expansion-is-available-now`],
    regional: "Built from Japan's Inferno X (M2) plus the Mega Gengar ex / Mega Diancie ex decks (secondary).",
  },
  {
    set: "ME: Ascended Heroes", officialName: "Mega Evolution—Ascended Heroes", released: "2026-01-30", series: "Mega Evolution Series",
    sources: [`${TPC}/pokemon-news/the-pokemon-tcg-mega-evolution-ascended-heroes-expansion-is-available-now`, `${TPC}/pokemon-news/get-the-new-pokemon-tcg-expansion-mega-evolution-ascended-heroes-on-january-30-2026`],
    regional: "Special expansion of over 290 cards. It combines Japan's MEGA Dream ex with Start Deck 100 Battle Collection, so there is no one-to-one Japanese set (secondary).",
  },
  {
    set: "ME03: Perfect Order", officialName: "Mega Evolution—Perfect Order", released: "2026-03-27", series: "Mega Evolution Series",
    sources: [`${TPC}/pokemon-news/the-pokemon-tcg-mega-evolution-perfect-order-expansion-is-available-now`],
    regional: "Based on Japan's Nihil Zero (M3), released 2026-01-23 (secondary).",
  },
  {
    set: "ME04: Chaos Rising", officialName: "Mega Evolution—Chaos Rising", released: "2026-05-22", series: "Mega Evolution Series",
    sources: [`${TPC}/news/the-pokemon-tcg-mega-evolution-chaos-rising-expansion-arrives-on-may-22-2026`],
    regional: "Based on Japan's Ninja Spinner (secondary).",
  },
  {
    set: "ME05: Pitch Black", officialName: "Mega Evolution—Pitch Black", released: "2026-07-17", series: "Mega Evolution Series",
    sources: [`${TPC}/news/the-pokemon-tcg-mega-evolution-pitch-black-expansion-arrives-july-17-2026`],
    regional: "Based on Japan's Abyss Eye (secondary).",
  },
  {
    // The official name has no "Mega Evolution—" prefix and no official page
    // states its series. The "ME:" prefix is the marketplace's label, not
    // an official claim. Community references list it in the Mega Evolution
    // Series (secondary). Our era grouping places it by date only.
    set: "ME: 30th Celebration", officialName: "30th Celebration", released: "2026-09-16", series: null,
    sources: ["https://tcg.pokemon.com/en-us/expansions/30th-celebration/", `${TPC}/news/check-out-every-pokemon-tcg-product-release-in-september-2026`],
    regional: "First expansion released worldwide on one date, 2026-09-16, including Simplified Chinese. Card counts differ by language (secondary). The official English card count is not stated.",
  },
]);

const OFFICIAL_BY_SET = new Map(OFFICIAL_RELEASES.map((r) => [r.set.toLowerCase(), r]));
const todayIso = () => new Date().toISOString().slice(0, 10);

export function officialRelease(setName) {
  return OFFICIAL_BY_SET.get(String(setName ?? "").toLowerCase()) ?? null;
}

// "released" | "upcoming" | null (no official date on record). `asOf` is an
// ISO date (YYYY-MM-DD); release dates are the official English dates.
export function releaseStatus(setName, asOf = todayIso()) {
  const r = officialRelease(setName);
  if (!r) return null;
  return r.released <= asOf ? "released" : "upcoming";
}

// Officially dated sets already on sale as of `asOf`, newest first - the
// input for a latest-release view. Upcoming sets are excluded.
export function latestReleasedSets(asOf = todayIso(), limit = 3) {
  return OFFICIAL_RELEASES.filter((r) => r.released <= asOf)
    .sort((a, b) => b.released.localeCompare(a.released) || setReleaseRank(b.set) - setReleaseRank(a.set))
    .slice(0, limit);
}

// --- parser set-phrase vocabulary --------------------------------------
// Phrases the parser can recognise standalone in a query, longest first
// so "base set 2" wins over "base set". Maps a lowercased phrase to the
// canonical card_catalog set name.
export const SET_PHRASES = [
  ["base set shadowless", "Base Set (Shadowless)"],
  ["shadowless base set", "Base Set (Shadowless)"],
  ["base set 2", "Base Set 2"],
  ["base set", "Base Set"],
  ["team rocket", "Team Rocket"],
  ["gym heroes", "Gym Heroes"],
  ["gym challenge", "Gym Challenge"],
  ["neo genesis", "Neo Genesis"],
  ["neo discovery", "Neo Discovery"],
  ["neo revelation", "Neo Revelation"],
  ["neo destiny", "Neo Destiny"],
  ["legendary collection", "Legendary Collection"],
  ["jungle", "Jungle"],
  ["fossil", "Fossil"],
  ["expedition", "Expedition"],
  ["aquapolis", "Aquapolis"],
  ["skyridge", "Skyridge"],
  ["evolving skies", "SWSH07: Evolving Skies"],
  ["hidden fates", "Hidden Fates"],
  ["shining fates", "SWSH: Shining Fates"],
  ["celebrations classic collection", "Celebrations: Classic Collection"],
  ["classic collection", "Celebrations: Classic Collection"],
  ["celebrations", "Celebrations"],
  ["crown zenith", "SWSH: Crown Zenith"],
  ["brilliant stars", "SWSH09: Brilliant Stars"],
  ["astral radiance", "SWSH10: Astral Radiance"],
  ["lost origin", "SWSH11: Lost Origin"],
  ["silver tempest", "SWSH12: Silver Tempest"],
  ["scarlet & violet 151", "SV: Scarlet & Violet 151"],
  ["scarlet and violet 151", "SV: Scarlet & Violet 151"],
  ["151", "SV: Scarlet & Violet 151"],
  ["paldea evolved", "SV02: Paldea Evolved"],
  ["obsidian flames", "SV03: Obsidian Flames"],
  ["paradox rift", "SV04: Paradox Rift"],
  ["paldean fates", "SV: Paldean Fates"],
  ["temporal forces", "SV05: Temporal Forces"],
  ["twilight masquerade", "SV06: Twilight Masquerade"],
  ["shrouded fable", "SV: Shrouded Fable"],
  ["stellar crown", "SV07: Stellar Crown"],
  ["surging sparks", "SV08: Surging Sparks"],
  ["prismatic evolutions", "SV: Prismatic Evolutions"],
  ["evolutions", "XY - Evolutions"],
  ["roaring skies", "XY - Roaring Skies"],
  ["flashfire", "XY - Flashfire"],
];

// --- era vocabulary --------------------------------------------------
const WOTC_SET_NAMES = new Set(
  [
    "Base Set (Shadowless)", "Base Set", "Jungle", "Fossil", "Base Set 2",
    "Team Rocket", "Gym Heroes", "Gym Challenge",
    "Neo Genesis", "Neo Discovery", "Neo Revelation", "Neo Destiny",
    "Legendary Collection", "Expedition", "Aquapolis", "Skyridge",
  ].map((s) => s.toLowerCase())
);
const WOTC_QUERY_RE =
  /\b(wotc|1st edition|first edition|shadowless|unlimited base|base set|shadowless|jungle|fossil|team rocket|gym (?:heroes|challenge)|neo (?:genesis|discovery|revelation|destiny)|legendary collection|expedition|aquapolis|skyridge)\b/i;
const MODERN_QUERY_RE =
  /\b(scarlet (?:&|and) violet|sword (?:&|and) shield|paldea|obsidian flames|151|paradox rift|temporal forces|twilight masquerade|stellar crown|surging sparks|prismatic evolutions|crown zenith|silver tempest|lost origin|astral radiance|brilliant stars|fusion strike|evolving skies|chilling reign|battle styles)\b/i;

export function eraForSetName(setName) {
  if (!setName) return null;
  return WOTC_SET_NAMES.has(String(setName).toLowerCase()) ? "wotc" : "modern";
}

export function eraFromQuery(raw) {
  const s = String(raw ?? "");
  if (WOTC_QUERY_RE.test(s)) return "wotc";
  if (MODERN_QUERY_RE.test(s)) return "modern";
  return null;
}

// Try to claim the longest SET_PHRASES match inside `text` (already
// lowercased, single-spaced). Returns { canonical, phrase } or null.
export function matchSetPhrase(text) {
  const hay = ` ${String(text ?? "").toLowerCase()} `;
  for (const [phrase, canonical] of SET_PHRASES) {
    if (hay.includes(` ${phrase} `)) return { canonical, phrase };
  }
  return null;
}

// Phase 13B.5.1 - deterministic query aliases for one canonical
// card_catalog set name, so a DB-backed full set vocabulary (215 sets, not
// the ~50 curated SET_PHRASES) can be matched against a natural query.
// Pure string transform, no I/O - the collision check across the whole
// vocabulary is the caller's job (fetchSetSearchVocabulary).
//
//   "SWSH02: Rebel Clash"      -> ["swsh02: rebel clash", "rebel clash"]
//   "SV: Scarlet & Violet 151" -> [..., "scarlet & violet 151", "scarlet and violet 151"]
//   "XY - Evolutions"          -> ["xy - evolutions", "evolutions"]
//
// A leading set-CODE prefix (SV/SWSH/SM/XY/... followed by an optional
// number and a ':' or '-' separator) is stripped to expose the short
// name. Parenthetical qualifiers ("Base Set (Shadowless)") are NOT
// stripped, so "base set" stays owned solely by the plain "Base Set".
const SET_CODE_PREFIX_RE = /^(?:sv|svp|swsh|sm|smp|xy|xyp|hgss|dp|bw|bwp|hs|dv|pl|col)\s*\d*\s*[:\-]\s*/i;

export function buildSetAliases(name) {
  const raw = String(name ?? "").trim();
  if (!raw) return [];
  const lower = raw.toLowerCase().replace(/\s+/g, " ");
  const out = new Set([lower]);

  const short = lower.replace(SET_CODE_PREFIX_RE, "").trim();
  if (short && short !== lower && short.length >= 4) out.add(short);

  // '&' <-> ' and ' both ways, for every alias collected so far
  for (const p of [...out]) {
    if (p.includes("&")) {
      out.add(p.replace(/\s*&\s*/g, " and ").replace(/\s+/g, " ").trim());
    }
    if (/\band\b/.test(p)) {
      out.add(p.replace(/\s+and\s+/g, " & ").replace(/\s+/g, " ").trim());
    }
  }

  return [...out].filter((p) => p.length >= 4);
}
