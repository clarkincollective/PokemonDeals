// Phase 17C.2 - set-page checklist PILOT.
//
// A readable, crawlable checklist for one set: collector number, the exact
// card name linked to its permanent /cards/[slug] page, the catalogue's
// recorded rarity, and the stored market reference with the context it
// really has. Built ONLY from data fetchSetCatalog already reads - no new
// provider calls, nothing inferred:
//
//   * rarity    - card_catalog.rarity as recorded; null -> shown as not
//                 recorded, never guessed from the name or number.
//   * reference - card_catalog.market_price (USD, recent-sold, raw /
//                 ungraded). Its condition / printing are shown ONLY when
//                 card_catalog.market_condition / market_printing record
//                 them (lib/referenceCondition); otherwise the row says the
//                 condition is not stated. A missing or sentinel price is
//                 an explicit "No reliable reference", never 0 / blank.
//   * no totals - references can be for different conditions / printings,
//                 so nothing here sums, averages or ranks them into a set
//                 value. (The existing SetPriceSummary range/median stays
//                 the only set-level figure, with its own disclaimer.)
//
// Pure, relative imports only, so node:test runs it directly.

import { catalogPriceOk } from "./cardSlug.js";
import { referenceConditionLabels } from "./referenceCondition.js";

// The pilot. One normal-sized set (113 English cards, every row numbered,
// rarity-labelled and priced in card_catalog on 2026-09-11). Other sets
// keep the existing plain link index until the pilot is reviewed.
export const CHECKLIST_PILOT_SETS = Object.freeze(["Neo Destiny"]);

// Upper bound on rows rendered as a table (the pilot set is 113). A set
// above it keeps the plain link index - a table of 2,000 rows is not
// "readable".
export const SET_CHECKLIST_MAX_ROWS = 400;

export function isChecklistPilotSet(setName) {
  return CHECKLIST_PILOT_SETS.includes(setName);
}

const numKey = (s) => {
  const m = String(s ?? "").match(/\d+/);
  return m ? parseInt(m[0], 10) : Number.POSITIVE_INFINITY;
};

// Collector-number order ("001/105" < "002/105" < "106/105"), then the
// full string with numeric collation, then name - stable across renders.
export function compareCollectorNumber(a, b) {
  const na = numKey(a.cardNumber);
  const nb = numKey(b.cardNumber);
  if (na !== nb) return na - nb;
  const s = String(a.cardNumber ?? "").localeCompare(String(b.cardNumber ?? ""), "en", { numeric: true });
  if (s !== 0) return s;
  return String(a.name ?? "").localeCompare(String(b.name ?? ""), "en");
}

// The permanent page a row may link to. A live hub wins (same precedence
// as CatalogueLinkIndex); otherwise the catalogue page, but only when it is
// indexable (a real price) AND this row is the one that slug actually
// resolves to - two rows whose names slugify alike share one URL, which
// lib/cardSlug.pickCatalogMatch resolves to the lowest tcgplayer id.
function canonicalHrefs(cards) {
  const bySlug = new Map();
  for (const c of cards) {
    if (!c.catalogSlug) continue;
    const list = bySlug.get(c.catalogSlug) ?? [];
    list.push(c);
    bySlug.set(c.catalogSlug, list);
  }
  const winner = new Map();
  for (const [slug, list] of bySlug) {
    const pick = [...list].sort((a, b) => String(a.tcgplayerId).localeCompare(String(b.tcgplayerId)))[0];
    winner.set(slug, pick);
  }
  return (c) => {
    if (c.hubSlug) return `/cards/${c.hubSlug}`;
    if (c.catalogSlug && catalogPriceOk(c.refPrice) && winner.get(c.catalogSlug) === c) return `/cards/${c.catalogSlug}`;
    return null;
  };
}

// cards: fetchSetCatalog's card objects (name, cardNumber, rarity,
// refPrice, refCondition, refPrinting, hubSlug, catalogSlug, tcgplayerId).
// Returns rows in collector-number order:
//   { key, number, name, href, rarity, reference }
//   reference = { usd, conditionKnown, conditionLabel, printing } | null
export function buildChecklistRows(cards) {
  const list = (cards ?? []).filter(Boolean);
  const hrefOf = canonicalHrefs(list);
  return [...list].sort(compareCollectorNumber).map((c) => {
    const priced = catalogPriceOk(c.refPrice);
    const cond = referenceConditionLabels(priced ? c.refCondition : null);
    return {
      key: c.tcgplayerId ?? `${c.name}|${c.cardNumber}`,
      number: c.cardNumber ?? null,
      name: c.displayName ?? c.name,
      href: hrefOf(c),
      rarity: c.rarity ? String(c.rarity) : null,
      reference: priced
        ? {
            usd: Number(c.refPrice),
            conditionKnown: cond.known,
            conditionLabel: cond.known ? cond.condition : null,
            printing: c.refPrinting ? String(c.refPrinting) : null,
          }
        : null,
    };
  });
}

// Counts for the checklist's own caption - never a price aggregate.
export function checklistSummary(rows) {
  const r = rows ?? [];
  const priced = r.filter((x) => x.reference);
  const conditions = new Set(priced.filter((x) => x.reference.conditionKnown).map((x) => x.reference.conditionLabel));
  return {
    total: r.length,
    linked: r.filter((x) => x.href).length,
    priced: priced.length,
    unpriced: r.length - priced.length,
    rarityRecorded: r.filter((x) => x.rarity).length,
    conditionStated: priced.filter((x) => x.reference.conditionKnown).length,
    // true when the priced references are not all for one stated condition
    // (unknown counts as "not the same") - the page then says so plainly.
    mixedOrUnstatedConditions: priced.length > 0 && !(conditions.size === 1 && priced.every((x) => x.reference.conditionKnown)),
  };
}
