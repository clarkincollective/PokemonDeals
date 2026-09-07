// Phase CRM-1 - pure subscriber-summary aggregation for the operator
// view. No I/O: the caller runs the bounded COUNT queries (or passes
// rows) and hands the results here.
//
// NEVER returns an email address - counts and a top-source label only.

const { deriveStatus } = require("./subscribers.js");

// Build the operator summary from already-fetched minimal rows:
//   rows: [{ status?, confirmed?, unsubscribed_at?, created_at, utm_source?, source? }]
// `now` is injectable for tests.
function summarizeSubscribers(rows = [], { now = Date.now() } = {}) {
  const list = Array.isArray(rows) ? rows : [];
  const byStatus = { PENDING: 0, ACTIVE: 0, UNSUBSCRIBED: 0, BOUNCED: 0, COMPLAINED: 0 };
  const sourceCounts = new Map();
  let signups7d = 0;
  let signups30d = 0;
  const DAY = 24 * 60 * 60 * 1000;

  for (const r of list) {
    const st = deriveStatus(r);
    if (byStatus[st] != null) byStatus[st] += 1;

    const created = r.created_at ? new Date(r.created_at).getTime() : NaN;
    if (Number.isFinite(created)) {
      if (now - created <= 7 * DAY) signups7d += 1;
      if (now - created <= 30 * DAY) signups30d += 1;
    }

    // "source" for attribution: prefer a real utm_source, fall back to the
    // signup source tag. Never an email or free text.
    const src = normSource(r.utm_source) || normSource(r.source) || "unknown";
    sourceCounts.set(src, (sourceCounts.get(src) || 0) + 1);
  }

  let topSource = null;
  let topN = -1;
  for (const [k, n] of sourceCounts) {
    if (k === "unknown") continue;
    if (n > topN) {
      topN = n;
      topSource = k;
    }
  }

  return {
    total: list.length,
    active: byStatus.ACTIVE,
    pending: byStatus.PENDING,
    unsubscribed: byStatus.UNSUBSCRIBED,
    bounced: byStatus.BOUNCED,
    complained: byStatus.COMPLAINED,
    signups_7d: signups7d,
    signups_30d: signups30d,
    top_signup_source: topSource,
  };
}

// Same shape, but from server-side COUNT results the caller already ran
// (so the operator dashboard never pulls subscriber rows at all).
function summaryFromCounts({ byStatus = {}, signups7d = 0, signups30d = 0, topSource = null } = {}) {
  const g = (k) => Number(byStatus[k] || 0);
  return {
    total: g("PENDING") + g("ACTIVE") + g("UNSUBSCRIBED") + g("BOUNCED") + g("COMPLAINED"),
    active: g("ACTIVE"),
    pending: g("PENDING"),
    unsubscribed: g("UNSUBSCRIBED"),
    bounced: g("BOUNCED"),
    complained: g("COMPLAINED"),
    signups_7d: Number(signups7d || 0),
    signups_30d: Number(signups30d || 0),
    top_signup_source: topSource || null,
  };
}

const SOURCE_MAX = 40;
const SOURCE_RE = /^[A-Za-z0-9][A-Za-z0-9 _.+-]{0,38}[A-Za-z0-9]$|^[A-Za-z0-9]$/;
function normSource(v) {
  const s = String(v ?? "").trim().toLowerCase();
  if (!s || s.length > SOURCE_MAX || !SOURCE_RE.test(s)) return null;
  return s;
}

module.exports = { summarizeSubscribers, summaryFromCounts };
