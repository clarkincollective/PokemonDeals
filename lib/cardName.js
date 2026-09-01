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
