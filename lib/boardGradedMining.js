// GRADED PRICE MINING FROM ALREADY-CAPTURED BOARD DATA (28 Sep 2026, owner:
// "I'm not upgrading pokemon price tracker... find ways we can keep the
// market data updated. using free sources").
//
// PokemonPriceTracker's own graded buckets (lib/savedReference.js
// saved_graded:*) were themselves "the provider's ebay.salesByGrade
// buckets" - PPT is a middleman over eBay graded-card data, not a primary
// source. The board scraper (scripts/boards/captureJimmy.mjs) already
// records a `valuation` + `valuationBasis` ("PSA 10", "PSA 9", ...) on
// every graded listing it captures - the board's own stated market
// reference for that exact grade, continuously refreshed every 30 minutes,
// ALREADY legitimately scraped and already owner-approved for use (the
// board-deals surface shows this same figure as the comparison price). No
// new scraping target, no new request, no new risk: this module only
// reads catalog_snapshot rows this site already has.
//
// WHAT THIS IS NOT. A board's `valuation` is the LISTED reference it
// states for a grade, not a confirmed eBay sale - a different kind of
// evidence than a literal sold-comp, and marked as such below
// (`basis: "board_valuation"`) so a future reader can tell the two apart.
// It still answers the same question lib/gradedConfidence.gradedTierConfidence
// was built to judge: is this grade's figure corroborated by more than one
// independent source, or a thin/stale guess? Each DISTINCT listing
// (marketplace + itemId) that states a valuation for one card/grade is one
// observation; re-seeing the SAME still-live listing on a later capture is
// not a new one. A rolling window of the most recent distinct observations
// per grade is kept (capped), so genuine corroboration accumulates over
// weeks of continuous (free) board captures instead of needing a bulk
// provider export.
//
// WHERE IT WRITES. The exact existing shape lib/savedReference.loadSavedGradedPrice
// already reads - saved_graded:<tcgplayerId>:<language> - so every
// downstream consumer (the scanner's graded-price fallback, the same
// confidence gate) is untouched. This module only decides what goes INTO
// that row; `source: "board_valuation"` replaces the one-time PPT-export
// provenance so nothing claims to be something it is not.

const { gradedTierConfidence } = require("./gradedConfidence");

const MAX_OBSERVATIONS_PER_GRADE = 30;
// a listing stated 365+ days ago is already outside gradedTierConfidence's
// own maxStaleDays - no point carrying it forward indefinitely
const OBSERVATION_MAX_AGE_DAYS = 365;

// "PSA 10" / "psa 9.5" / "CGC9" -> { grader: "psa", grade: "10" } | null.
// Mirrors lib/pokemonPriceTracker.gradeKey's own grader+grade vocabulary
// (lowercased grader, "." kept in the grade number itself here - gradeKey
// does the "." -> "_" substitution when a key string is needed).
function parseValuationBasis(basis) {
  const m = /^\s*([A-Za-z]{2,6})\s*(\d{1,2}(?:\.5)?)\s*$/.exec(String(basis ?? ""));
  if (!m) return null;
  return { grader: m[1].toLowerCase(), grade: m[2] };
}

function gradeKeyOf(grader, grade) {
  if (!grader || !grade) return null;
  return `${grader}${String(grade).replace(".", "_")}`;
}

// One board row -> one observation, or null if it cannot be used (no
// valuation, no parseable grade, no listing identity to dedupe by).
function observationFromBoardRow(row) {
  const basis = parseValuationBasis(row?.valuationBasis ?? row?.captured?.valuationBasis);
  const price = Number(row?.valuation ?? row?.captured?.valuation);
  const listingKey = row?.marketplace && row?.itemId ? `${row.marketplace}:${row.itemId}` : row?.id ?? null;
  const at = row?.at ?? row?.captured?.at ?? row?.foundAt ?? row?.captured?.foundAt ?? null;
  if (!basis || !(price > 0) || !listingKey || !at) return null;
  return { key: gradeKeyOf(basis.grader, basis.grade), grader: basis.grader, grade: basis.grade, listingKey, price, at };
}

// Fold new observations into an existing bucket's rolling window (newest
// first, deduped by listingKey, capped, age-pruned), then recompute the
// aggregate stats loadSavedGradedPrice reads. Pure.
function mergeGradedBucket(existing, newObservations, now = Date.now()) {
  const byKey = new Map();
  for (const o of existing?.observations ?? []) if (o?.listingKey) byKey.set(o.listingKey, o);
  for (const o of newObservations) byKey.set(o.listingKey, o); // a later sighting of the same listing updates its price
  const cutoff = now - OBSERVATION_MAX_AGE_DAYS * 86_400_000;
  const kept = [...byKey.values()]
    .filter((o) => Number.isFinite(Date.parse(o.at)) && Date.parse(o.at) >= cutoff)
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
    .slice(0, MAX_OBSERVATIONS_PER_GRADE);
  if (!kept.length) return null;
  const prices = kept.map((o) => o.price);
  return {
    price: prices.reduce((a, b) => a + b, 0) / prices.length, // the mean of the kept window
    count: kept.length,
    minPrice: Math.min(...prices),
    maxPrice: Math.max(...prices),
    lastSaleDate: kept[0].at, // kept is newest-first
    providerLowConfidence: false,
    basis: "board_valuation",
    observations: kept,
  };
}

// existingRow: the current saved_graded:<id>:<lang> row's `data` (or null).
// boardRows: this card's graded+valued board rows (any shape
// observationFromBoardRow accepts). meta: { cardName, setName, rawNm } -
// rawNm from the free tcgcsv/card_catalog reference, for the confidence
// gate and the grade-9/10-below-raw guard. Returns the new row to upsert,
// or null if there is nothing (old or new) to write.
function buildGradedMiningUpdate(existingRow, boardRows, { tcgplayerId, language = "english", cardName = null, setName = null, rawNm = null, now = Date.now() } = {}) {
  const byGrade = new Map();
  for (const r of boardRows ?? []) {
    const obs = observationFromBoardRow(r);
    if (obs) (byGrade.get(obs.key) ?? byGrade.set(obs.key, []).get(obs.key)).push(obs);
  }
  const salesByGrade = {};
  const grades = new Set([...Object.keys(existingRow?.salesByGrade ?? {}), ...byGrade.keys()]);
  for (const key of grades) {
    const merged = mergeGradedBucket(existingRow?.salesByGrade?.[key], byGrade.get(key) ?? [], now);
    if (merged) salesByGrade[key] = merged;
  }
  if (!Object.keys(salesByGrade).length) return null;
  return {
    v: 1,
    tcgplayerId: String(tcgplayerId),
    language,
    capturedAt: new Date(now).toISOString(),
    setName: setName ?? existingRow?.setName ?? null,
    cardName: cardName ?? existingRow?.cardName ?? null,
    rawNm: rawNm ?? existingRow?.rawNm ?? null,
    source: "board_valuation",
    salesByGrade,
  };
}

// Would this row's grades actually clear the SAME confidence gate
// loadSavedGradedPrice applies? (diagnostic / test helper - the real gate
// still runs, unchanged, at read time; this just lets a mining run report
// how many of the grades it wrote are actually usable yet.)
function anyGradePassesConfidence(row) {
  if (!row?.salesByGrade) return false;
  const siblingPrices = Object.values(row.salesByGrade).map((b) => b.price);
  for (const [key, bucket] of Object.entries(row.salesByGrade)) {
    const conf = gradedTierConfidence(
      { key, currentPrice: bucket.price, minPrice: bucket.minPrice, maxPrice: bucket.maxPrice, saleCount: bucket.count, lastSaleDate: bucket.lastSaleDate, providerLowConfidence: bucket.providerLowConfidence },
      { rawNm: row.rawNm, setName: row.setName, cardName: row.cardName, siblingPrices: siblingPrices.filter((p) => p !== bucket.price) }
    );
    if (conf.level !== "low") return true;
  }
  return false;
}

module.exports = {
  MAX_OBSERVATIONS_PER_GRADE,
  OBSERVATION_MAX_AGE_DAYS,
  parseValuationBasis,
  gradeKeyOf,
  observationFromBoardRow,
  mergeGradedBucket,
  buildGradedMiningUpdate,
  anyGradePassesConfidence,
};
