// Both Supabase clients -> the scenario's in-memory database.
const db = () => globalThis.__ingestHarness.db;
export const supabase = new Proxy({}, { get: (_t, p) => db()[p] });
export function supabaseAdmin() {
  return db();
}
