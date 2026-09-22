// Comparable-group formation and ranking-reversal counting for the
// shipping-cost study. Pure: no data access, no clock, no randomness.
//
// Split out of the generator so the rules can be exercised directly
// against constructed cases - a test that only asserts "the key string
// contains the word grade" proves nothing about what the key DOES.

import { resolvePrintings, isResolved } from "./printingIdentity.js";

/**
 * Form comparable groups.
 *
 * A listing reaches the group stage only when it has a card id, a
 * recorded condition, and a printing the evidence rules could resolve.
 * Unresolved printings are DROPPED, never defaulted into a group: a
 * listing that has not said which finish it is selling cannot be shown to
 * be comparable to one that has.
 *
 * @param rows [{ key, cardId, title, condition, catalogPrinting, language,
 *               marketplace, graded, grader, grade, local, price, total }]
 */
export function formGroups(rows) {
  const printing = resolvePrintings(
    rows.map((r) => ({
      key: r.key,
      title: r.title ?? "",
      condition: r.condition ?? "",
      cardId: r.cardId ?? "",
      catalogPrinting: r.catalogPrinting ?? null,
    }))
  );

  const hasIdentity = (r) => r.cardId != null && String(r.cardId) !== "" && r.condition != null && r.condition !== "";
  const droppedForMissingIdentity = rows.filter((r) => !hasIdentity(r)).length;
  const eligible = rows.filter((r) => hasIdentity(r) && isResolved(printing.get(r.key)));
  const droppedForUnresolvedPrinting = rows.length - eligible.length - droppedForMissingIdentity;

  const groups = new Map();
  for (const r of eligible) {
    const key = [
      r.cardId,
      printing.get(r.key).family,
      r.language ?? "",
      r.marketplace,
      r.condition,
      r.graded ? "graded" : "raw",
      r.grader ?? "",
      r.grade ?? "",
      r.local ? "local" : "cross_border",
    ].join("|");
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(r);
  }

  return {
    printing,
    eligible,
    droppedForMissingIdentity,
    droppedForUnresolvedPrinting,
    groups: [...groups.values()],
    comparable: [...groups.values()].filter((g) => g.length >= 2),
  };
}

/**
 * Count ranking reversals over comparable groups.
 *
 * A group is reversed only when NO listing tied for the lowest item price
 * also achieves the lowest delivered total - i.e. when choosing on item
 * price cannot reach the cheapest delivered total however the tie is
 * broken. Sorting and taking the first element would instead let the
 * arbitrary order of two equally-cheap listings decide the result.
 */
export function countReversals(comparable) {
  let rankFlips = 0;
  let groupsWithItemPriceTie = 0;
  let tiesNotCountedAsReversals = 0;
  for (const g of comparable) {
    const minItem = Math.min(...g.map((r) => r.price));
    const minDelivered = Math.min(...g.map((r) => r.total));
    const tiedOnItem = g.filter((r) => r.price === minItem);
    if (tiedOnItem.length > 1) groupsWithItemPriceTie += 1;
    const reachable = tiedOnItem.some((r) => r.total === minDelivered);
    if (!reachable) rankFlips += 1;
    else if (tiedOnItem.length > 1 && tiedOnItem.some((r) => r.total !== minDelivered)) tiesNotCountedAsReversals += 1;
  }
  return { rankFlips, groupsWithItemPriceTie, tiesNotCountedAsReversals };
}
