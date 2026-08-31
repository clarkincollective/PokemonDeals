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

export function sortCards(cards, key = DEFAULT_SORT) {
  const cmp = (SORTS[key] ?? SORTS[DEFAULT_SORT]).cmp;
  return (cards ?? []).slice().sort(cmp);
}

// Sets richest-first (then alphabetical); cards value-first within a set
// (so a collapsed group shows the 4 most interesting).
export function groupBySet(cards) {
  const m = new Map();
  for (const c of cards ?? []) {
    if (!m.has(c.set)) m.set(c.set, []);
    m.get(c.set).push(c);
  }
  const out = [...m.entries()].map(([set, list]) => ({ set, list: sortCards(list, "value_desc") }));
  out.sort((a, b) => b.list.length - a.list.length || a.set.localeCompare(b.set));
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
