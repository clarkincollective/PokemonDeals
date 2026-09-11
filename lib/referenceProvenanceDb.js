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

const PROVENANCE_COLUMNS = ["market_condition", "market_printing", "reference_condition", "reference_printing"];

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

module.exports = {
  PROVENANCE_COLUMNS,
  isMissingProvenanceColumnError,
  stripProvenanceColumns,
  upsertWithProvenance,
  updateWithProvenance,
};
