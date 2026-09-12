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
//                 condition is not recorded (NULL provenance means our
//                 catalogue has not captured it - not that the provider
//                 lacks it). A missing or sentinel price is
//                 an explicit "No reliable reference", never 0 / blank.
//   * no totals - references can be for different conditions / printings,
//                 so nothing here sums, averages or ranks them into a set
//                 value. (The existing SetPriceSummary range/median stays
//                 the only set-level figure, with its own disclaimer.)
//
// Pure, relative imports only, so node:test runs it directly.

import { catalogPriceOk } from "./cardSlug.js";
import { referenceConditionLabels } from "./referenceCondition.js";

// The sets that get the checklist table. An explicit, reviewed allowlist -
// never "every set". 17C.2 pilot: Neo Destiny. 17C.3 (bounded expansion,
// selected 2026-09-12 from card_catalog): normal-sized (60-250 rows) English
// sets with a live /sets page where EVERY row has a collector number and a
// rarity, one numbering format and one printed total, no duplicate
// collector numbers, no two names sharing a /cards/ slug, no non-card or
// unresolvable rows, no Jumbo / World Championship rows, and a
// non-grab-bag name. Missing prices are allowed (shown explicitly).
//   Jungle              64 cards, 64 priced
//   Neo Genesis        111 cards, 111 priced
//   EX Deoxys          108 cards, 100 priced
//   Diamond and Pearl  130 cards, 130 priced
//   Boundaries Crossed 153 cards, 135 priced
// 17C.4 (second bounded expansion, re-screened 2026-09-12 against the SAME
// rules, run through checklistIdentityCheck itself and fetchSetCatalog's own
// row filter - catalogCardResolvable / catalogCardSlug - rather than an
// approximate name slugifier): 25 of the 217 English sets qualified; these
// ten have the highest priced coverage. Search Console final data shows no
// impressions for ANY of the 25 in the observed window, so coverage - not
// search demand - is the stated basis for the choice.
//   Gym Heroes           132 cards, 132 priced
//   Base Set 2           130 cards, 130 priced
//   Team Rocket           83 cards,  83 priced
//   Neo Revelation        66 cards,  66 priced
//   Fossil                62 cards,  62 priced
//   Mysterious Treasures 124 cards, 124 priced
//   Secret Wonders       132 cards, 131 priced
//   EX Ruby and Sapphire 109 cards, 108 priced
//   Great Encounters     106 cards, 105 priced
//   EX Sandstorm         100 cards,  99 priced
// Legendary Collection also qualifies (110/110) but is deliberately held
// back: the 17C.3 suite pins it as an excluded example, and a selection
// should not quietly flip an existing guard assertion to fit itself.
// Every other set keeps the plain link index.
export const CHECKLIST_SETS = Object.freeze([
  "Neo Destiny",
  "Jungle",
  "Neo Genesis",
  "EX Deoxys",
  "Diamond and Pearl",
  "Boundaries Crossed",
  "Gym Heroes",
  "Base Set 2",
  "Team Rocket",
  "Neo Revelation",
  "Fossil",
  "Mysterious Treasures",
  "Secret Wonders",
  "EX Ruby and Sapphire",
  "Great Encounters",
  "EX Sandstorm",
]);

// Upper bound on rows rendered as a table. A set above it keeps the plain
// link index - a table of 2,000 rows is not "readable".
export const SET_CHECKLIST_MAX_ROWS = 400;

export function isChecklistSet(setName) {
  return CHECKLIST_SETS.includes(setName);
}

// RENDER-TIME identity guard. The allowlist was chosen on clean data; if a
// later catalogue sync makes a set ambiguous, the page falls back to the
// plain link index instead of showing a misleading table:
//   - a row without a collector number
//   - two rows with the same collector number
//   - two rows whose names share one /cards/ slug
//   - more rows than SET_CHECKLIST_MAX_ROWS
// Returns { ok, reason }.
export function checklistIdentityCheck(cards) {
  const list = (cards ?? []).filter(Boolean);
  if (list.length === 0) return { ok: false, reason: "empty" };
  if (list.length > SET_CHECKLIST_MAX_ROWS) return { ok: false, reason: "too_many_rows" };
  const numbers = new Set();
  const slugs = new Set();
  for (const c of list) {
    const n = c.cardNumber == null ? "" : String(c.cardNumber).trim();
    if (!n) return { ok: false, reason: "missing_collector_number" };
    if (numbers.has(n)) return { ok: false, reason: "duplicate_collector_number" };
    numbers.add(n);
    if (c.catalogSlug) {
      if (slugs.has(c.catalogSlug)) return { ok: false, reason: "shared_card_slug" };
      slugs.add(c.catalogSlug);
    }
  }
  return { ok: true, reason: null };
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
// as CatalogueLinkIndex and the art grid); otherwise the catalogue page
// whenever it RESOLVES to this exact card - catalogSlug is only set for a
// resolvable row (lib/cardSlug.catalogCardResolvable: real card + image +
// product id), and that page answers 200 even without a price (it is then
// noindex,follow and says "Market price unavailable"). 17C.3 correction:
// a missing price no longer drops the link - the art grid on the same page
// already links those cards. A row is left unlinked only when there is no
// destination (no hub, no resolvable catalogue page) or the destination is
// ambiguous: two rows whose names slugify alike share one URL, which
// lib/cardSlug.pickCatalogMatch resolves to the lowest tcgplayer id, so
// only that row links.
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
    if (c.catalogSlug && winner.get(c.catalogSlug) === c) return `/cards/${c.catalogSlug}`;
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

// The legend's condition / availability sentences, from the summary.
// NULL provenance = our catalogue has not captured the condition - never
// phrased as the provider lacking it.
export function checklistLegend(summary, rows) {
  const s = summary;
  let condition;
  if (s.priced === 0) condition = "";
  else if (!s.mixedOrUnstatedConditions) {
    const label = (rows ?? []).find((r) => r.reference)?.reference.conditionLabel;
    condition = `Every reference here is for a ${label} copy.`;
  } else if (s.conditionStated === 0) {
    condition =
      "Condition not recorded: our catalogue has not captured which condition these references are for yet, so they are not like-for-like across cards.";
  } else {
    condition = `A condition is shown where our catalogue has recorded it (${s.conditionStated} of ${s.priced}); where none is shown the condition is not recorded, so references are not like-for-like across cards.`;
  }
  const unpriced =
    s.unpriced > 0 ? `${s.unpriced} ${s.unpriced === 1 ? "card has" : "cards have"} no reliable reference right now.` : "";
  return { condition, unpriced };
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
