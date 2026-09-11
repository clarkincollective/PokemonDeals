// PRICE-CONDITION PROVENANCE (2026-09-11) - best-effort writes of the
// provenance columns added by supabase/price_condition_provenance_migration
// .sql (card_catalog.market_condition / market_printing, price_history
// .reference_condition / reference_printing).
//
// Until that migration has run, a write naming those columns fails
// (PostgREST PGRST204 "Could not find the 'x' column ... in the schema
// cache" / Postgres 42703). Every writer goes through here so the sync
// jobs never depend on the migration: on a missing-column error the same
// write is retried WITHOUT the provenance columns and `state.provenance`
// records that the columns are absent (reported by the job, so the gap is
// visible rather than silent). Same best-effort pattern as image_urls in
// app/api/refresh-deals. Nothing here changes a price.

const PROVENANCE_COLUMNS = ["market_condition", "market_printing", "reference_condition", "reference_printing"];

function isMissingColumnError(error) {
  if (!error) return false;
  const text = `${error.code ?? ""} ${error.message ?? ""}`;
  return /PGRST204|42703|column .* does not exist|schema cache/i.test(text);
}

function stripProvenanceColumns(row) {
  const out = { ...row };
  for (const c of PROVENANCE_COLUMNS) delete out[c];
  return out;
}

// Upsert `rows` (which may carry provenance columns). Returns { error,
// provenance } where provenance is true when the columns were written,
// false when they had to be dropped. `state` is a per-job memo so a job
// stops re-trying the wide write once it knows the columns are absent.
async function upsertWithProvenance(db, table, rows, onConflict, state = {}) {
  if (state.provenance !== false) {
    const { error } = await db.from(table).upsert(rows, { onConflict });
    if (!error) {
      state.provenance = true;
      return { error: null, provenance: true };
    }
    if (!isMissingColumnError(error)) return { error, provenance: state.provenance ?? null };
    state.provenance = false;
  }
  const { error } = await db.from(table).upsert(rows.map(stripProvenanceColumns), { onConflict });
  return { error, provenance: false };
}

// Same contract for a single-row update keyed on one column.
async function updateWithProvenance(db, table, values, matchColumn, matchValue, state = {}) {
  if (state.provenance !== false) {
    const { error } = await db.from(table).update(values).eq(matchColumn, matchValue);
    if (!error) {
      state.provenance = true;
      return { error: null, provenance: true };
    }
    if (!isMissingColumnError(error)) return { error, provenance: state.provenance ?? null };
    state.provenance = false;
  }
  const { error } = await db.from(table).update(stripProvenanceColumns(values)).eq(matchColumn, matchValue);
  return { error, provenance: false };
}

module.exports = { PROVENANCE_COLUMNS, isMissingColumnError, stripProvenanceColumns, upsertWithProvenance, updateWithProvenance };
