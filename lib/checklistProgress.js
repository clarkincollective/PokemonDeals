// Phase 17C.11 - collector checklist utility: PURE view logic.
//
// Mirrors lib/catalogueView's split: everything decidable without a DOM
// lives here so node:test can run it directly, and the client island
// (components/ChecklistProgress) only wires state to it.
//
// WHAT COMPLETION COUNTS - stated once, here, because the wording is a
// truth claim and not a style choice:
//   A checklist entry is one row of THIS set's catalogue checklist. It is
//   not every foil, edition, language or master-set variant. A set's
//   printed numbering total is also not the number of entries (secret
//   rares sit past it), so progress is always "x of <entries we list>",
//   never "x% of the set".
//
// Nothing here reads prices, sums references, or produces a set value -
// tests/seo/set-catalogue test 14 forbids a complete-set valuation, and
// progress must never become one.

// Rows are identified by the key buildChecklistRows already assigns
// (tcgplayerId, else "name|number"). Owned state therefore attaches to an
// existing stable catalogue identity rather than a new id scheme.
export function rowKey(row) {
  if (!row) return null;
  const k = row.key;
  return k == null || k === "" ? null : String(k);
}

// owned: an array/Set of row keys. Unknown keys are ignored rather than
// counted - a stored key whose card left the catalogue must not inflate
// progress.
export function ownedSet(owned) {
  if (owned instanceof Set) return owned;
  return new Set(Array.isArray(owned) ? owned.map(String) : []);
}

export function isOwned(row, owned) {
  const k = rowKey(row);
  return k != null && ownedSet(owned).has(k);
}

// { total, owned, missing } over the rows actually listed. `owned` counts
// only keys present in `rows`, so a stale stored key can never exceed the
// total.
export function progressCounts(rows, owned) {
  const set = ownedSet(owned);
  const list = rows ?? [];
  let have = 0;
  for (const r of list) {
    const k = rowKey(r);
    if (k != null && set.has(k)) have++;
  }
  return { total: list.length, owned: have, missing: list.length - have };
}

// The rows a given view should show. "missing" hides owned rows; "all"
// shows everything. No other view exists - there is deliberately no
// "owned only" URL-shaped state to be indexed.
export function visibleRows(rows, owned, view = "all") {
  const list = rows ?? [];
  if (view !== "missing") return list;
  const set = ownedSet(owned);
  return list.filter((r) => {
    const k = rowKey(r);
    return k == null || !set.has(k);
  });
}

// "12 of 113 entries marked owned · 101 still missing"
// Always "entries", never "cards in the set" - see the note at the top.
export function progressLabel(counts) {
  const c = counts ?? { total: 0, owned: 0, missing: 0 };
  const entry = c.total === 1 ? "entry" : "entries";
  return `${c.owned} of ${c.total} ${entry} marked owned · ${c.missing} still missing`;
}

// The scope sentence shown next to the progress. Kept here so the same
// wording is testable and cannot drift between the screen and print.
export const COMPLETION_SCOPE =
  "Completion counts the entries in this checklist - the cards our catalogue lists for this set. It does not count every foil, edition, language or master-set variant, and it is not a valuation of the complete set.";

export const DEVICE_SCOPE = "Saved on this device only. Not an account, and not synced anywhere.";
