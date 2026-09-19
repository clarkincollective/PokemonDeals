// Price-history legend facts (2026-09-20). Pure; no imports.
//
// The chart draws one USD series per card. Only the trailing run of points
// whose own records share the latest point's condition AND printing is
// "comparable" (solid). Everything earlier is dashed for one of two
// reasons, and the legend has to say which - a reader looking at the
// Shadowless Charizard chart saw "13 earlier readings didn't record which
// condition and printing they were for" when there were 14 dashed points:
// 13 with no provenance and one verified Moderately Played reading, a
// different reference. Counting them as one number hid the difference.
//
// Points: { t, p, v (1 = provenance recorded), c (condition), pr (printing) }.

export function pointKey(p) {
  return p && p.v ? `${p.c}|${p.pr}` : null;
}

// The index of the first point in the trailing comparable run, or null
// when the latest point itself has no provenance.
export function comparableFromIndex(sorted) {
  if (!Array.isArray(sorted) || sorted.length === 0) return null;
  const lastKey = pointKey(sorted[sorted.length - 1]);
  if (!lastKey) return null;
  let i = sorted.length - 1;
  while (i >= 0 && pointKey(sorted[i]) === lastKey) i--;
  return i + 1;
}

// What the dashed part of the chart is made of.
//   earlier        - points before the comparable run (all points when
//                    nothing is comparable)
//   unrecorded     - of those, points with no recorded condition/printing
//   differentRef   - of those, verified points for another reference
//   differentRefs  - the distinct "condition, printing" labels among them
export function legendCounts(sorted) {
  const pts = Array.isArray(sorted) ? sorted : [];
  const from = comparableFromIndex(pts);
  const earlier = pts.slice(0, from ?? pts.length);
  const unrecorded = earlier.filter((p) => !p.v).length;
  const others = earlier.filter((p) => p.v);
  const differentRefs = [...new Set(others.map((p) => `${p.c}, ${p.pr}`))];
  return { earlier: earlier.length, unrecorded, differentRef: others.length, differentRefs };
}

// The provider's printing vocabulary: "Unlimited …" names the printing
// that is NOT 1st Edition (Base Set, Shadowless and other WOTC-era
// products each carry both). On a page whose set is already "Base Set
// (Shadowless)" the word can read as "the Unlimited set", so the legend
// adds this gloss whenever the printing label starts with it.
export function isUnlimitedPrinting(printing) {
  return /^unlimited\b/i.test(String(printing ?? "").trim());
}
