// PRICE-CONDITION PROVENANCE (2026-09-11) - best-effort writes of the
// provenance columns added by supabase/price_condition_provenance_migration
// .sql (card_catalog.market_condition / market_printing, price_history
// .reference_condition / reference_printing).
//
// Until that migration has run, a write or select naming those columns
// fails with the schema error PostgREST raises for an unknown column:
//   PGRST204  "Could not find the 'market_condition' column of
//             'card_catalog' in the schema cache"          (insert/upsert)
//   42703     "column price_history.reference_condition does not exist"
//             (select / update)
// ONLY that error, and only when it names one of the four provenance
// columns, triggers a retry without them (`state.provenance = false`, which
// the calling job reports). Every other error - permission (42501), RLS,
// network, constraint, a different missing column - is returned unchanged
// so it stays visible. Same best-effort pattern as image_urls in
// app/api/refresh-deals. Nothing here changes a price.

// 17C.10 adds the deal-row reference columns to the SAME restricted list.
// The rule is unchanged and deliberately narrow: only PGRST204 / 42703,
// and only when the message NAMES one of these columns, ever triggers a
// retry without them. Any other failure - permission, RLS, constraint,
// network, a different missing column - is returned unchanged so it stays
// visible.
const PROVENANCE_COLUMNS = [
  "market_condition",
  "market_printing",
  "reference_condition",
  "reference_printing",
  // deal-row reference provenance (supabase/reference_provenance_migration.sql)
  "reference_source",
  "reference_product_id",
  "reference_amount",
  "reference_currency",
  "reference_observed_at",
  "reference_synced_at",
  "reference_fx_rate",
  "reference_fx_asof",
  "reference_grader",
  "reference_grade",
];

// The specific "one of OUR provenance columns is not in the schema" error.
function isMissingProvenanceColumnError(error) {
  if (!error) return false;
  const code = String(error.code ?? "");
  const message = String(error.message ?? "");
  if (code !== "PGRST204" && code !== "42703") return false;
  return PROVENANCE_COLUMNS.some((c) => new RegExp(`\\b${c}\\b`).test(message));
}

function stripProvenanceColumns(row) {
  const out = { ...row };
  for (const c of PROVENANCE_COLUMNS) delete out[c];
  return out;
}

// Upsert `rows` (which may carry provenance columns). Returns { error,
// provenance }: provenance true when the columns were written, false when
// they had to be dropped, null when the write failed for another reason.
// `state` is a per-job memo so a job stops re-trying the wide write once it
// knows the columns are absent.
async function upsertWithProvenance(db, table, rows, onConflict, state = {}) {
  if (state.provenance !== false) {
    const { error } = await db.from(table).upsert(rows, { onConflict });
    if (!error) {
      state.provenance = true;
      return { error: null, provenance: true };
    }
    if (!isMissingProvenanceColumnError(error)) return { error, provenance: null };
    state.provenance = false;
  }
  const { error } = await db.from(table).upsert(rows.map(stripProvenanceColumns), { onConflict });
  return { error: error ?? null, provenance: error ? null : false };
}

// Same contract for a single-row update keyed on one column.
async function updateWithProvenance(db, table, values, matchColumn, matchValue, state = {}) {
  if (state.provenance !== false) {
    const { error } = await db.from(table).update(values).eq(matchColumn, matchValue);
    if (!error) {
      state.provenance = true;
      return { error: null, provenance: true };
    }
    if (!isMissingProvenanceColumnError(error)) return { error, provenance: null };
    state.provenance = false;
  }
  const { error } = await db.from(table).update(stripProvenanceColumns(values)).eq(matchColumn, matchValue);
  return { error: error ?? null, provenance: error ? null : false };
}

// 17C.10 - DELIBERATELY NO separate "attach provenance afterwards" helper.
//
// An earlier draft wrote the deal-row reference in a follow-up update,
// reasoning by analogy with persistImageUrls. That analogy is wrong:
// image URLs are decorative, whereas a reference CERTIFIES a comparison.
// If the second write fails, or another writer lands between the two, the
// row keeps the NEW market_price wearing the OLD evidence - and such stale
// evidence passes every value check whenever the new reference carries the
// same amount (same price, different printing). Amount equality cannot
// detect it.
//
// So every comparison writer sends market_price/discount_pct and the
// reference columns in the SAME statement, gated by a once-per-run column
// probe. A failure then fails the whole write and the row stays
// self-consistent; a writer that cannot evidence the new comparison sends
// clearedReference(...) in that same statement instead. If a separate
// attachment is ever genuinely needed, it must match on the exact
// comparison it certifies (market_price + discount_pct), not just the row
// key - see tests/db/reference-provenance-concurrency.mjs.
//
// The catalogue/history writers above keep upsertWithProvenance /
// updateWithProvenance: there the provenance columns ARE the payload, so
// those writes are already atomic with what they describe.

module.exports = {
  PROVENANCE_COLUMNS,
  isMissingProvenanceColumnError,
  stripProvenanceColumns,
  upsertWithProvenance,
  updateWithProvenance,
};
