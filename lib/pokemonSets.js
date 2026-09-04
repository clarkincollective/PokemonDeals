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
  "ME: 30th Celebration",
];

const RELEASE_RANK = new Map(SET_RELEASE_ORDER.map((name, i) => [name.toLowerCase(), i]));

// Highest = newest / unknown. Unlisted sets sort AFTER every listed set
// (so a known old set always wins a collector-number tiebreak).
export function setReleaseRank(setName) {
  return RELEASE_RANK.get(String(setName ?? "").toLowerCase()) ?? Number.MAX_SAFE_INTEGER;
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
