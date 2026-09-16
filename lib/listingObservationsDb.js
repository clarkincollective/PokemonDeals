// SEO-2.5 - the "the observation table is not migrated yet" error, isolated.
//
// Same narrow pattern as lib/referenceProvenanceDb's missing-column check,
// and narrow for the same reason: only the specific "relation does not
// exist" shape counts. A permission error, an RLS refusal, a network blip
// or a constraint violation must stay visible as an error rather than be
// quietly read as "not migrated", or the observation log could silently
// record nothing for weeks and nobody would know.
//
//   42P01  undefined_table       "relation \"listing_observations\" does not exist"
//   PGRST205                     PostgREST schema cache has no such table
const TABLE = "listing_observations";

function isMissingObservationTableError(error) {
  if (!error) return false;
  const code = String(error.code ?? "");
  const message = String(error.message ?? "");
  if (code !== "42P01" && code !== "PGRST205") return false;
  return new RegExp(`\\b${TABLE}\\b`).test(message);
}

module.exports = { TABLE, isMissingObservationTableError };
