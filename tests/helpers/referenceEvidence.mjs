// Test helper: give a fixture row the stored reference evidence that
// lib/dealQuality.savingsClaimTrusted now requires.
//
// WHY THIS EXISTS (SEO-4, 16 Sep 2026). savingsClaimTrusted used to begin
// `if (!officialReleaseFor(row)) return true`, so any row in a set with no
// official release record could claim savings with no evidence at all -
// which was ~71% of live claiming rows. Closing that hole means a fixture
// that only sets `market_price` + `discount_pct` no longer counts as a
// trusted comparison.
//
// Most tests that broke are not ABOUT the trust rule - they assert premium
// eligibility, sort order, CTA copy, sealed presentation, metadata. They
// need a row that legitimately carries a savings claim, so they get real
// evidence rather than a bypass. There is deliberately no way to fake the
// rule here: this builds the same columns the scanner writes, and the
// derived fields track whatever the fixture's own overrides set, so a test
// that changes market_price or condition keeps consistent evidence.
//
// Tests that are ABOUT the rule (tests/scanner/savings-evidence.test.mjs,
// preorder-guard-17c7, set-reference-17c12) build their rows by hand on
// purpose and must NOT use this.

// A provider observation time comfortably after any tracked release start
// used in the fixtures, so the extra tracked-release floor is satisfied
// too. Fixed, not a clock read - tests stay deterministic.
export const FIXTURE_OBSERVED_AT = "2026-09-15T00:00:00.000Z";

// The evidence columns for ONE row, derived from that row so they always
// describe the comparison it actually stores.
export function referenceEvidenceFor(row = {}) {
  const productId = row.card_tcgplayer_id ?? row.sealed_watchlist?.tcgplayer_id ?? null;
  const base = {
    reference_source: "test_fixture",
    reference_product_id: productId == null ? null : String(productId),
    reference_amount: row.market_price ?? null,
    reference_currency: "USD",
    reference_observed_at: row.reference_observed_at ?? FIXTURE_OBSERVED_AT,
    reference_synced_at: row.reference_synced_at ?? FIXTURE_OBSERVED_AT,
  };
  // Sealed products have no condition, printing or grade.
  if (row.sealed_watchlist) return base;
  if (row.is_graded) {
    return { ...base, reference_grader: row.grader ?? null, reference_grade: row.grade == null ? null : String(row.grade) };
  }
  return {
    ...base,
    reference_condition: row.condition ?? null,
    // The exact printing the reference priced. Any non-empty value
    // satisfies the rule; the fixtures are holo cards.
    reference_printing: row.reference_printing ?? "Holofoil",
  };
}

// Merge evidence onto a built row. Explicit reference_* values already on
// the row win, so a test can still pin a MISMATCHING reference to prove
// the rule rejects it.
export function withReferenceEvidence(row = {}) {
  const evidence = referenceEvidenceFor(row);
  const out = { ...evidence, ...row };
  return out;
}
