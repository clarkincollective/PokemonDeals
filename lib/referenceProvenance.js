// Phase 17C.10 - REFERENCE PROVENANCE for a stored comparison.
//
// A deal row stores `market_price` (the figure its discount is computed
// against) and `discount_pct`. Until now nothing recorded WHAT that figure
// was: which catalogue product it came from, which condition/printing or
// grade it was for, what it actually was in what currency, or when the
// PROVIDER observed it. lib/dealQuality.storedReferenceEvidence already
// demanded that evidence, so with nowhere to store it every tracked-release
// listing stayed plain. This module is that storage contract.
//
// Pure + CommonJS: lib/dealQuality (client-safe, imported by DealCard)
// requires it, so it must never pull in a provider, a db handle or fetch.
//
// TWO TIMESTAMPS, deliberately separate (they are NOT interchangeable):
//   reference_observed_at  the PROVIDER's own as-of for the figure
//                          (PPT prices.lastUpdated / product.updatedAt).
//                          NULL = the provider did not say. Only this one
//                          can certify a post-release comparison.
//   reference_synced_at    when WE copied it into our catalogue. Syncing a
//                          months-old figure the day after a set releases
//                          does not make it a post-release reference, so
//                          this is recorded for debugging and is NEVER
//                          read as evidence of when the price was true.
// Unknown source time stays unknown: a NULL observed_at is never upgraded
// by a sync time, by the clock, or by today's catalogue.
//
// NEVER INFERRED. Provenance is only ever what the writer directly knew at
// the moment it computed the comparison. Two equal prices are not evidence
// of a shared condition, printing or product - the provider's responses are
// sparse and tiers routinely share a figure.

const CORE_REFERENCE_COLUMNS = Object.freeze([
  "reference_source", //        'card_catalog' | 'ppt_live' | 'sealed_catalog' | 'feed'
  "reference_product_id", //    the catalogue product the figure is FOR
  "reference_amount", //        the figure as captured
  "reference_currency", //      the currency that figure is denominated in
  "reference_observed_at", //   provider's own as-of (NULL = unknown)
  "reference_synced_at", //     our copy time (never evidence)
  "reference_fx_rate", //       conversion evidence, NULL when none was needed
  "reference_fx_asof",
]);

// Cards additionally carry what the figure was priced FOR.
const CARD_REFERENCE_COLUMNS = Object.freeze([
  ...CORE_REFERENCE_COLUMNS,
  "reference_condition", //  raw: the tier the figure is for
  "reference_printing", //   raw: the exact printing/variant
  "reference_grader", //     graded: the grader the figure is for
  "reference_grade", //      graded: the grade
]);

// Sealed product has no condition, printing or grade - those columns would
// be permanently NULL, so they are not added to sealed_deals at all.
const SEALED_REFERENCE_COLUMNS = CORE_REFERENCE_COLUMNS;

// How closely reference_amount must reproduce the market_price actually
// used. This is an equality check with a rounding tolerance, NOT a
// similarity test - it exists to catch a reference that does not belong to
// the stored comparison at all.
const AMOUNT_EPSILON = 0.01;

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

// Every column set to null - what a writer sends when it changes a
// comparison but cannot supply matching evidence for the new one.
function clearedReference(columns) {
  const out = {};
  for (const c of columns) out[c] = null;
  return out;
}

// A card comparison's provenance. `observedAt` MUST be the provider's own
// timestamp; pass null when it did not give one rather than substituting
// a sync time or now().
function buildCardReference({
  source,
  productId,
  amount,
  currency = "USD",
  observedAt = null,
  syncedAt = null,
  condition = null,
  printing = null,
  grader = null,
  grade = null,
  fxRate = null,
  fxAsOf = null,
} = {}) {
  return {
    reference_source: source ?? null,
    reference_product_id: productId == null ? null : String(productId),
    reference_amount: num(amount),
    reference_currency: currency ?? null,
    reference_observed_at: observedAt ?? null,
    reference_synced_at: syncedAt ?? null,
    reference_fx_rate: num(fxRate),
    reference_fx_asof: fxAsOf ?? null,
    reference_condition: condition ?? null,
    reference_printing: printing ?? null,
    reference_grader: grader ?? null,
    reference_grade: grade == null ? null : String(grade),
  };
}

function buildSealedReference({
  source,
  productId,
  amount,
  currency = "USD",
  observedAt = null,
  syncedAt = null,
  fxRate = null,
  fxAsOf = null,
} = {}) {
  return {
    reference_source: source ?? null,
    reference_product_id: productId == null ? null : String(productId),
    reference_amount: num(amount),
    reference_currency: currency ?? null,
    reference_observed_at: observedAt ?? null,
    reference_synced_at: syncedAt ?? null,
    reference_fx_rate: num(fxRate),
    reference_fx_asof: fxAsOf ?? null,
  };
}

// Does the stored reference reproduce the comparison actually stored on
// this row? `comparisonCurrency` is the currency market_price is
// denominated in (USD throughout this codebase).
//
// Currency equality alone is NOT sufficient - the AMOUNTS must reconcile:
//   same currency      -> reference_amount must equal market_price
//   different currency -> explicit conversion evidence is required
//                         (rate + as-of), and rate x amount must equal
//                         market_price. Without that evidence the
//                         reference cannot be checked, so it fails.
function referenceAmountMatches(row, { comparisonCurrency = "USD" } = {}) {
  const market = num(row?.market_price);
  const amount = num(row?.reference_amount);
  if (market == null || amount == null) return false;
  const cur = row?.reference_currency;
  if (!cur) return false;

  if (String(cur).toUpperCase() === String(comparisonCurrency).toUpperCase()) {
    return Math.abs(amount - market) <= AMOUNT_EPSILON;
  }
  // converted: the conversion itself must be evidenced, not assumed
  const rate = num(row?.reference_fx_rate);
  if (rate == null || rate <= 0 || !row?.reference_fx_asof) return false;
  return Math.abs(amount * rate - market) <= Math.max(AMOUNT_EPSILON, market * 0.001);
}

// Is the reference FOR the product this row is priced against?
// `productId` is the caller's view of the row's catalogue identity
// (justtcg_tcgplayer_id for cards, the sealed watchlist product's
// tcgplayer_id for sealed).
function referenceProductMatches(row, productId) {
  const stored = row?.reference_product_id;
  if (!stored || productId == null) return false;
  return String(stored) === String(productId);
}

// The provider's observation time in ms, or null when unknown. A sync
// time is never substituted here.
function referenceObservedAtMs(row) {
  const t = Date.parse(row?.reference_observed_at ?? "");
  return Number.isFinite(t) ? t : null;
}

module.exports = {
  CORE_REFERENCE_COLUMNS,
  CARD_REFERENCE_COLUMNS,
  SEALED_REFERENCE_COLUMNS,
  AMOUNT_EPSILON,
  clearedReference,
  buildCardReference,
  buildSealedReference,
  referenceAmountMatches,
  referenceProductMatches,
  referenceObservedAtMs,
};
