// Five-field cron matching (minute hour day-of-month month day-of-week), UTC,
// the subset Vercel's scheduler accepts and crons.json uses: `*`, `*/n`,
// `a`, `a,b,c`, `a-b`, `a-b/n`. Day-of-week 0-6 with Sunday = 0 (7 also
// Sunday). Pure - no clock, no I/O - so it is unit-tested directly.

function parseField(field, min, max) {
  const set = new Set();
  for (const part of String(field).split(",")) {
    const m = /^(\*|\d+(?:-\d+)?)(?:\/(\d+))?$/.exec(part.trim());
    if (!m) throw new Error(`bad cron field "${field}"`);
    const step = m[2] ? Number(m[2]) : 1;
    let lo = min;
    let hi = max;
    if (m[1] !== "*") {
      const [a, b] = m[1].split("-").map(Number);
      lo = a;
      hi = b ?? (m[2] ? max : a);
    }
    if (step < 1 || lo < min || hi > max || lo > hi) throw new Error(`bad cron field "${field}"`);
    for (let v = lo; v <= hi; v += step) set.add(v);
  }
  return set;
}

export function parseCron(expr) {
  const f = String(expr).trim().split(/\s+/);
  if (f.length !== 5) throw new Error(`cron needs 5 fields: "${expr}"`);
  const dow = parseField(f[4], 0, 7);
  if (dow.has(7)) dow.add(0);
  return { minute: parseField(f[0], 0, 59), hour: parseField(f[1], 0, 23), dom: parseField(f[2], 1, 31), month: parseField(f[3], 1, 12), dow };
}

// True when the expression fires at the given UTC minute (a Date or ms).
export function cronMatches(expr, at) {
  const d = new Date(at);
  const c = typeof expr === "string" ? parseCron(expr) : expr;
  return c.minute.has(d.getUTCMinutes()) && c.hour.has(d.getUTCHours()) && c.dom.has(d.getUTCDate()) && c.month.has(d.getUTCMonth() + 1) && c.dow.has(d.getUTCDay());
}

// Every UTC minute in (from, to] at which the expression fires - the
// scheduler catches up missed minutes this way (bounded by the caller).
export function dueMinutes(expr, fromMs, toMs, { max = 60 } = {}) {
  const c = parseCron(expr);
  const out = [];
  let t = Math.floor(fromMs / 60000) * 60000 + 60000;
  const end = Math.floor(toMs / 60000) * 60000;
  for (; t <= end && out.length < max; t += 60000) if (cronMatches(c, t)) out.push(t);
  return out;
}
