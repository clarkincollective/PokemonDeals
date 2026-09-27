// Deterministic JSON for change detection (VERCEL-COST-2, 27 Sep 2026).
//
// Postgres jsonb does not preserve object key order, so a snapshot read back
// from catalog_snapshot never JSON.stringify()s byte-for-byte equal to the
// object that was written, even when nothing changed. Sorting keys at every
// level makes "did the aggregate change?" a plain string comparison.
// Arrays keep their order (order IS data for a ranked list).
export function stableStringify(value) {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(v) {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (v && typeof v === "object") {
    const out = {};
    for (const k of Object.keys(v).sort()) {
      if (v[k] === undefined) continue; // JSON drops undefined; so does jsonb
      out[k] = sortKeys(v[k]);
    }
    return out;
  }
  return v;
}

// True when two JSON-able values are the same data (ignoring key order and
// undefined members).
export function sameJson(a, b) {
  return stableStringify(a) === stableStringify(b);
}
