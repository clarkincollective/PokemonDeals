// Growth batch 2 (2026-09-20) - "other printings of this card".
//
// SERP sample (20 Sep, "charizard base set card value"): the pages that
// rank lead with a printing breakdown - Unlimited vs Shadowless vs 1st
// Edition, a figure each. Our card pages are one printing per page, and
// the sibling printing sat unlabelled inside the same-Pokemon list.
//
// The rule is deliberately narrow so it can never group two different
// cards: a sibling printing is a same-Pokemon catalogue card with the SAME
// collector number in the SAME set family - the set name with any
// parenthetical printing qualifier removed ("Base Set (Shadowless)" ->
// "Base Set"). "Base Set 2" is a different family AND a different number,
// so it stays a related card, not a printing. Pure; no data access.

export function setFamily(setName) {
  return String(setName ?? "")
    .replace(/\s*\([^)]*\)\s*/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

// Collector numbers compare on their numerator, zero-padding ignored:
// "004/102" and "4/102" are the same number.
export function sameCollectorNumber(a, b) {
  const n = (v) => {
    const m = String(v ?? "").trim().match(/^0*(\d+[a-z]?)(?:\s*\/\s*(\S+))?$/i);
    return m ? `${m[1].toLowerCase()}${m[2] ? "/" + m[2].toLowerCase() : ""}` : null;
  };
  const x = n(a), y = n(b);
  return Boolean(x && y && x === y);
}

// current: { set, cardNumber }; candidates: the sameSpecies list from
// fetchCardRelations ({ slug, displayName, set, cardNumber, rarity, refPrice }).
// Returns the sibling printings, highest reference first, current card
// excluded (it never appears in its own relations anyway).
export function otherPrintings(current, candidates) {
  if (!current?.set || !current?.cardNumber) return [];
  const family = setFamily(current.set);
  return (candidates ?? [])
    .filter((c) => c && c.set !== current.set && setFamily(c.set) === family && sameCollectorNumber(c.cardNumber, current.cardNumber))
    .sort((a, b) => (Number(b.refPrice) || 0) - (Number(a.refPrice) || 0));
}
