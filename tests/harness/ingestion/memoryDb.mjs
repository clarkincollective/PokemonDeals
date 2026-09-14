// In-memory stand-in for the supabase-js query builder, covering exactly the
// PostgREST shapes the ingestion routes use (select/insert/upsert/update +
// eq/neq/in/is/not/lt/lte/gt/gte/like/or/match, order/limit/range,
// single/maybeSingle). Every write is recorded. Offline test harness only.

const str = (v) => (v == null ? v : String(v));
const cmp = (a, b) => (a == null || b == null ? null : String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0);

function likeToRe(pattern) {
  const esc = String(pattern).replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/%/g, ".*");
  return new RegExp(`^${esc}$`);
}

function parseOrClause(clause) {
  // col.op.value | col.not.op.value ; value may be quoted
  const parts = clause.split(".");
  const col = parts.shift();
  let negate = false;
  if (parts[0] === "not") { negate = true; parts.shift(); }
  const op = parts.shift();
  let value = parts.join(".").replace(/^"(.*)"$/, "$1");
  if (value === "null") value = null;
  const test = (r) => {
    const v = r[col];
    switch (op) {
      case "is": return value === null ? v == null : str(v) === str(value);
      case "eq": return str(v) === str(value);
      case "like": return v != null && likeToRe(value).test(String(v));
      case "gte": return cmp(v, value) >= 0;
      case "lt": return cmp(v, value) < 0;
      default: throw new Error(`memoryDb: unsupported or() op ${op}`);
    }
  };
  return negate ? (r) => !test(r) : test;
}

// `unique` (optional): { table: [primary-key columns] } - a plain INSERT that
// would duplicate the key fails like Postgres (code 23505), so atomic
// insert-to-reserve logic can be exercised offline.
export function createMemoryDb(seed = {}, { unique = {} } = {}) {
  const tables = Object.fromEntries(Object.entries(seed).map(([k, rows]) => [k, rows.map((r) => ({ ...r }))]));
  const writes = [];
  let nextId = 1_000_000;
  const table = (name) => (tables[name] ??= []);

  function from(name) {
    const st = { op: "select", filters: [], values: null, opts: {}, returning: false, limit: null, range: null, single: false, head: false };
    const chain = {};
    const add = (fn) => { st.filters.push(fn); return chain; };
    Object.assign(chain, {
      select(_cols, opts = {}) { if (st.op === "select") { st.head = Boolean(opts.head); } else st.returning = true; return chain; },
      insert(values) { st.op = "insert"; st.values = values; return chain; },
      upsert(values, opts = {}) { st.op = "upsert"; st.values = values; st.opts = opts; return chain; },
      update(values) { st.op = "update"; st.values = values; return chain; },
      delete() { st.op = "delete"; return chain; },
      eq: (c, v) => add((r) => str(r[c]) === str(v)),
      neq: (c, v) => add((r) => str(r[c]) !== str(v)),
      in: (c, arr) => add((r) => (arr ?? []).map(str).includes(str(r[c]))),
      is: (c, v) => add((r) => (v === null ? r[c] == null : r[c] === v)),
      not: (c, op, v) =>
        add((r) =>
          op === "is" && v === null ? r[c] != null : op === "like" ? !(r[c] != null && likeToRe(v).test(String(r[c]))) : !(str(r[c]) === str(v))
        ),
      lt: (c, v) => add((r) => cmp(r[c], v) < 0),
      lte: (c, v) => add((r) => cmp(r[c], v) <= 0),
      gt: (c, v) => add((r) => cmp(r[c], v) > 0),
      gte: (c, v) => add((r) => cmp(r[c], v) >= 0),
      like: (c, p) => add((r) => r[c] != null && likeToRe(p).test(String(r[c]))),
      match: (obj) => add((r) => Object.entries(obj).every(([k, v]) => str(r[k]) === str(v))),
      or: (expr) => { const tests = String(expr).split(",").map(parseOrClause); return add((r) => tests.some((t) => t(r))); },
      order: () => chain,
      limit: (n) => { st.limit = n; return chain; },
      range: (a, b) => { st.range = [a, b]; return chain; },
      single: () => { st.single = true; return chain; },
      maybeSingle: () => { st.single = true; return chain; },
      then: (resolve, reject) => Promise.resolve().then(execute).then(resolve, reject),
    });

    function execute() {
      const rows = table(name);
      const matches = () => rows.filter((r) => st.filters.every((f) => f(r)));
      if (st.op === "select") {
        let out = matches();
        if (st.range) out = out.slice(st.range[0], st.range[1] + 1);
        if (st.limit != null) out = out.slice(0, st.limit);
        const data = out.map((r) => ({ ...r }));
        return { data: st.single ? data[0] ?? null : st.head ? null : data, error: null, count: out.length };
      }
      if (st.op === "insert" || st.op === "upsert") {
        const list = Array.isArray(st.values) ? st.values : [st.values];
        const conflictCols = st.op === "upsert" && st.opts.onConflict ? String(st.opts.onConflict).split(",").map((s) => s.trim()) : null;
        const inserted = [];
        const pk = st.op === "insert" ? unique[name] : null;
        if (pk && list.some((v) => rows.some((r) => pk.every((c) => str(r[c]) === str(v[c]))))) {
          return { data: null, error: { code: "23505", message: `duplicate key value violates unique constraint (${name})` } };
        }
        for (const v of list) {
          const existing = conflictCols ? rows.find((r) => conflictCols.every((c) => str(r[c]) === str(v[c]))) : null;
          if (existing) {
            if (st.opts.ignoreDuplicates) continue;
            Object.assign(existing, v);
            writes.push({ table: name, op: "upsert-update", row: { ...existing } });
            inserted.push(existing);
            continue;
          }
          const row = { id: v.id ?? nextId++, ...v };
          rows.push(row);
          writes.push({ table: name, op: st.op === "upsert" ? "upsert-insert" : "insert", row: { ...row } });
          inserted.push(row);
        }
        return { data: st.returning ? inserted.map((r) => ({ ...r })) : null, error: null };
      }
      if (st.op === "update") {
        const hit = matches();
        for (const r of hit) {
          Object.assign(r, st.values);
          writes.push({ table: name, op: "update", row: { ...r }, values: { ...st.values } });
        }
        return { data: st.returning ? hit.map((r) => ({ ...r })) : null, error: null };
      }
      if (st.op === "delete") {
        const hit = matches();
        tables[name] = rows.filter((r) => !hit.includes(r));
        return { data: null, error: null };
      }
      throw new Error(`memoryDb: unsupported op ${st.op}`);
    }
    return chain;
  }

  return { from, tables, writes };
}
