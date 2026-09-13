// ONE shared card-display-identity layer. The catalogue name
// (card_catalog.name / watchlist.name, from TCGplayer via
// PokemonPriceTracker) already carries the real identity for the cards
// that need it - "Charizard ex", "M Charizard EX", "Mega Dragonite ex",
// "Dark Charizard", "Blaine's Charizard", "Pikachu & Zekrom GX",
// "Charizard (Full Art)", "Deoxys (Speed Forme)" - and those are kept
// verbatim (casing included; ex vs EX is era-specific and meaningful).
//
// The ONE thing normalised away for display is TCGplayer's collector-
// number disambiguator parenthetical - "Pikachu (#20)", "Charizard
// (020)", "Snorlax (#1)" - because it only ever duplicates card_number,
// which the identity line already shows. A parenthetical with ANY other
// content (an illustrator / player name on a stamped promo, "Full Art",
// "Team Plasma", "Master Ball Pattern", "#15 - Latias", ...) is a real
// distinguisher between otherwise-identical rows and is left untouched.
//
// Nothing here mutates stored data. `card_catalog.name` / `watchlist.name`
// / slugs / IDs are unchanged; this is a pure presentation transform.

// A parenthetical whose entire content is a collector number:
//   (15) (#15) (020) (#020) (3a) (#3a) (15/102) (#15/102)
const PURE_NUMBER_PAREN = /\s*\((?:#\s*)?0*\d{1,3}[a-z]?(?:\/\d{1,3})?\)\s*$/i;

// The clean primary display name for a catalogue card. `card` needs
// `name`; nothing else is required.
export function cardDisplayName(card) {
  const raw = String(card?.name ?? "").trim();
  if (!raw) return raw;
  const stripped = raw.replace(PURE_NUMBER_PAREN, "").trim();
  // never strip the whole name away, and keep at least one non-paren word
  return stripped.length >= 2 ? stripped : raw;
}

// Pull a collector number out of a watchlist / catalogue NAME string when
// the structured cardNumber field isn't at hand (live-deal hub objects
// carry only name + set). Recognises the common forms sellers/TCGplayer
// use: a slash pair ("4/102", "78a/73"), a promo code ("SWSH039",
// "XY79", "SM232"), or a trailing bare-number parenthetical ("(15)").
// Conservative - returns null rather than guess. Never mutates data.
const NAME_COLLECTOR_NUMBER = [
  /\b(\d{1,3}[a-z]?\/\d{1,3})\b/i,
  /\b([A-Z]{2,5}\d{2,4}[a-z]?)\b/,
  /\((?:#\s*)?(\d{1,3}[a-z]?)\)\s*$/,
  /#\s*([A-Za-z]{0,5}\d{1,4}[a-z]?(?:\/\d{1,3})?)\b/,
];
export function collectorNumberFromName(name) {
  const s = String(name ?? "");
  for (const re of NAME_COLLECTOR_NUMBER) {
    const m = s.match(re);
    if (m) return m[1];
  }
  return null;
}

// "Set · 4/102 · Holo Rare" - the structured identity line shown beneath
// the primary name on every card surface. Each part is optional.
// `withRarity: false` for tiles that already render rarity on its own line.
export function cardIdentityLine(card, { withHash = false, withRarity = true } = {}) {
  const num = card?.cardNumber ?? card?.card_number ?? null;
  return [
    card?.set ?? null,
    num ? (withHash ? `#${num}` : String(num)) : null,
    withRarity ? card?.rarity ?? null : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

// For list surfaces that already print the structured collector number next
// to the name ("Name · #020/189"). Some catalogue names embed the SAME
// number as a " - 020/189" / " - SWSH066" suffix segment ("Charizard VMAX -
// 020/189", "Charizard - SWSH066 (Prerelease) [Staff]"), which then reads
// twice. Starting from cardDisplayName, remove only a " - <number>" segment
// that equals card.cardNumber (leading zeros ignored per part). Everything
// else - "(Prerelease)", "[Staff]", "(Secret)", "(CoroCoro Promo)", "(Delta
// Species)", a DIFFERENT embedded number - stays verbatim. Without a
// structured number the display name is returned unchanged, so the number
// still appears once. Presentation only; metadata and slugs are untouched.
const EMBEDDED_NUMBER_SEGMENT = /\s+(?:[-–]\s*)?#?([A-Za-z]{0,5}\d{1,4}[a-z]?(?:\/[A-Za-z0-9-]{1,6})?)(?=\s|$)/g;
const normalizeCollectorNumber = (value) =>
  String(value ?? "")
    .trim()
    .replace(/^#/, "")
    .toLowerCase()
    .split("/")
    .map((part) => part.replace(/^([a-z]*)0+(?=\d)/, "$1"))
    .join("/");
export function cardNameWithoutNumber(card) {
  const display = cardDisplayName(card);
  const num = card?.cardNumber ?? card?.card_number ?? null;
  if (!num || !display) return display;
  const target = normalizeCollectorNumber(num);
  const stripped = display
    .replace(EMBEDDED_NUMBER_SEGMENT, (segment, embedded) => (normalizeCollectorNumber(embedded) === target ? "" : segment))
    .replace(/\s{2,}/g, " ")
    .trim();
  return stripped.length >= 2 ? stripped : display;
}

// A natural, non-keyword-stuffed metadata string: "Charizard ex - Base
// Set 4/102". Used for <title> / Product.name / anchor text where the
// bare display name alone is ambiguous.
export function cardMetaLabel(card) {
  const name = cardDisplayName(card);
  const num = card?.cardNumber ?? card?.card_number ?? null;
  const set = card?.set ?? null;
  if (!set) return name;
  return `${name} - ${set}${num ? ` ${num}` : ""}`;
}
