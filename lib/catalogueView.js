// Pure view helpers for the species catalogue browser (search / filter /
// sort / progressive disclosure). No React - unit-testable, and keeps
// CatalogueBrowser thin.

// inlined (lib/money hasPrice) to keep this import-free and node-testable
const hasPrice = (n) => Number.isFinite(Number(n)) && Number(n) > 0;

export const INITIAL_PER_LARGE_GROUP = 4;
// A group this size or smaller always renders in full (never a lone
// "show all 5" that reveals a single extra card).
export const ALWAYS_FULL_UP_TO = INITIAL_PER_LARGE_GROUP + 2;

// FLAT (single-set) progressive disclosure. A set page has ONE set, so
// there's nothing to group by - the catalogue is one sorted grid. A large
// set (ME: Ascended Heroes is 567 cards) must not paint hundreds of tiles
// at once: show INITIAL_FLAT first, "Show more cards" reveals another
// FLAT_STEP, plus "Show all" / "Show fewer". INITIAL_FLAT = 24 is ~12
// mobile rows (2-col) / 6 desktop rows (4-col) - a scannable first screen.
// Every tile stays in the DOM the whole time (collapsed = display:none),
// so the full /cards/[slug] internal linking and crawlability are
// unchanged - this is disclosure, never pagination or lazy-fetch.
export const INITIAL_FLAT = 24;
export const FLAT_STEP = 48;

// How many flat tiles are visible given the current "shown" counter and
// the total after filtering. Clamped to [INITIAL_FLAT, total].
export function flatVisible(total, shown = INITIAL_FLAT) {
  if (total <= INITIAL_FLAT) return total;
  return Math.min(Math.max(shown, INITIAL_FLAT), total);
}

function refValue(c) {
  return hasPrice(c.refPrice) ? Number(c.refPrice) : -1;
}
function cardNumber(c) {
  const n = parseInt(String(c.cardNumber ?? "").replace(/\D.*$/, ""), 10);
  return Number.isFinite(n) ? n : Number.POSITIVE_INFINITY;
}

// ---------------------------------------------------------------------------
// RELEVANCE TIER - "is this a normal collectible single, or a specialty
// printing (Jumbo / oversized / box-topper promo, World-Championship deck
// reprint)". Used to keep specialty products out of prime DEFAULT
// placement without ever removing or hiding them.
//
// Identified by STRUCTURED data: TCGplayer / PokemonPriceTracker file
// every one of these into a set literally named "Jumbo Cards" or "World
// Championship Decks" - no fragile per-name keyword needed. A defensive
// parenthetical size-marker in the name ("(Box Topper)", "(Oversized...)"
// ) is also caught. Deliberately NOT triggered by Promo / Gold / Metal /
// Secret Rare / Illustration Rare / Full Art - those are normal
// high-interest cards.
const SPECIALTY_SETS = new Set(["Jumbo Cards", "World Championship Decks"]);
const SPECIALTY_NAME_RE = /\((?:[^)]*\b)?(?:box\s*topper|over[\s-]?sized?|jumbo)\b[^)]*\)/i;

export function isSpecialtyCard(card) {
  if (!card) return false;
  return SPECIALTY_SETS.has(card.set) || SPECIALTY_NAME_RE.test(card.name ?? "");
}
// 1 = standard collectible printing (default-prominent); 2 = specialty.
export function cardTier(card) {
  return isSpecialtyCard(card) ? 2 : 1;
}

// key -> { label, cmp }. "value_desc" (Highest price) is the default for a
// large commercial catalogue: it surfaces the chase / high-interest cards
// a buyer most likely came for, instead of an alphabetical wall.
export const SORTS = {
  value_desc: { label: "Highest price", cmp: (a, b) => refValue(b) - refValue(a) || a.name.localeCompare(b.name) },
  value_asc: { label: "Lowest price", cmp: (a, b) => refValue(a) - refValue(b) || a.name.localeCompare(b.name) },
  number: { label: "Card number", cmp: (a, b) => cardNumber(a) - cardNumber(b) || a.name.localeCompare(b.name) },
  name: { label: "Name A–Z", cmp: (a, b) => a.name.localeCompare(b.name) },
};
export const DEFAULT_SORT = "value_desc";

// Matches name / card number / set / rarity, case-insensitive substring.
export function filterCards(cards, { q = "", set = "", rarity = "" } = {}) {
  const needle = q.trim().toLowerCase();
  return (cards ?? []).filter((c) => {
    if (set && c.set !== set) return false;
    if (rarity && c.rarity !== rarity) return false;
    if (needle) {
      const hay = `${c.name} ${c.cardNumber ?? ""} ${c.set} ${c.rarity ?? ""}`.toLowerCase();
      if (!hay.includes(needle)) return false;
    }
    return true;
  });
}

// `relevanceTier: true` puts standard collectible cards ahead of
// specialty ones BEFORE applying the chosen sort. Used ONLY for the
// DEFAULT sort (value_desc) - an explicit Lowest price / Card number /
// Name A-Z choice is the user asking for that exact order and is honoured
// literally (see CatalogueBrowser). Documented in the task report.
export function sortCards(cards, key = DEFAULT_SORT, { relevanceTier = false } = {}) {
  const base = (SORTS[key] ?? SORTS[DEFAULT_SORT]).cmp;
  const cmp = relevanceTier ? (a, b) => cardTier(a) - cardTier(b) || base(a, b) : base;
  return (cards ?? []).slice().sort(cmp);
}

// Sets: standard-card groups first, specialty-only groups (a whole "Jumbo
// Cards" / "World Championship Decks" group) last - so a species' jumbo
// pile never floats to the top of the collector journey just because it
// has many prints. Within each stratum: most prints first, then
// alphabetical (unchanged). Cards value-first within a set (so a
// collapsed group shows the 4 most interesting).
export function groupBySet(cards) {
  const m = new Map();
  for (const c of cards ?? []) {
    if (!m.has(c.set)) m.set(c.set, []);
    m.get(c.set).push(c);
  }
  const out = [...m.entries()].map(([set, list]) => ({
    set,
    list: sortCards(list, "value_desc"),
    specialtyOnly: list.length > 0 && list.every(isSpecialtyCard),
  }));
  out.sort(
    (a, b) =>
      Number(a.specialtyOnly) - Number(b.specialtyOnly) ||
      b.list.length - a.list.length ||
      a.set.localeCompare(b.set)
  );
  return out;
}

// How many cards a set group shows before "Show all N".
export function visibleCount(groupSize, { expandAll = false, open = false } = {}) {
  if (groupSize <= ALWAYS_FULL_UP_TO || expandAll || open) return groupSize;
  return INITIAL_PER_LARGE_GROUP;
}

export function distinctSorted(cards, field) {
  return [...new Set((cards ?? []).map((c) => c[field]).filter(Boolean))].sort((a, b) => a.localeCompare(b));
}
